import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import {
  getTenantDb,
  users,
  calendarEvents,
  calendarTokens,
  checkinJobs,
  conversations,
  questionnaires,
  questionnaireThemes,
} from "@revualy/db";
import type { LLMGateway, LLMCompletionRequest } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { InternalSimulatorAdapter } from "../lib/internal-simulator-adapter.js";
import { runCalendarModelForReviewer, runCalendarModelPass, type Proposal } from "../lib/calendar-model.js";
import { choosePeerSubject } from "../lib/interaction-scheduler.js";
import { appendUserMessage, initiateConversation, processTurn } from "../lib/conversation-orchestrator.js";

/** The calendar model, scheduler and initiation against a real Postgres. Self-skips without a DB. */

const db = getTenantDb(process.env.ORG_ID!, process.env.DATABASE_URL!);
async function dbReachable(): Promise<boolean> {
  const timeout = new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000));
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
    return true;
  } catch {
    return false;
  }
}
const dbUp = await dbReachable();
const HOUR = 60 * 60 * 1000;
const FOCUS = "how clearly Jon walked through the numbers";

describe.skipIf(!dbUp)("calendar model (integration)", () => {
  const ids = { rev: crypto.randomUUID(), jon: crypto.randomUUID(), amy: crypto.randomUUID(), kim: crypto.randomUUID() };
  const tag = ids.rev.slice(0, 8);
  const email = (k: keyof typeof ids) => `${k}-${tag}@test.local`;
  const now = new Date();
  const ev: Record<"group" | "pair" | "declined" | "secret", string> = { group: "", pair: "", declined: "", secret: "" };
  let questionnaireId: string;

  async function meeting(title: string, hoursAgo: number, attendees: string[], over: Partial<typeof calendarEvents.$inferInsert> = {}) {
    const startAt = new Date(now.getTime() - hoursAgo * HOUR);
    const [row] = await db
      .insert(calendarEvents)
      .values({
        userId: ids.rev,
        externalEventId: `ev-${crypto.randomUUID()}`,
        title,
        attendees,
        startAt,
        endAt: new Date(startAt.getTime() + 45 * 60_000),
        source: "google",
        ...over,
      })
      .returning();
    return row.id;
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.rev, email: email("rev"), name: "Rae Reviewer", timezone: "Europe/London" },
      { id: ids.jon, email: email("jon"), name: "Jon Smith" },
      { id: ids.amy, email: email("amy"), name: "Amy Jones" },
      { id: ids.kim, email: email("kim"), name: "Kim Lee" },
    ]);
    // Newest first, so the model sees group = E1, pair = E2, declined = E3;
    // people in order of first appearance: Jon = P1, Amy = P2, Kim = P3.
    ev.group = await meeting("Q3 planning", 26, [email("rev"), email("jon"), email("amy")]);
    ev.pair = await meeting("Roadmap", 30, [email("rev"), email("kim")]);
    ev.declined = await meeting("Design crit", 40, [email("rev"), email("jon"), email("amy"), email("kim")], { declined: [email("kim")] });
    ev.secret = await meeting("Secret reorg", 20, [email("rev"), email("jon"), email("amy")], { visibility: "private" });
    const [q] = await db.insert(questionnaires).values({ name: `calmodel-${tag}`, category: "peer_review" }).returning();
    questionnaireId = q.id;
    await db.insert(questionnaireThemes).values([
      { questionnaireId, intent: "Contribution", dataGoal: "How they contribute in meetings", sortOrder: 0 },
      { questionnaireId, intent: "Reliability", dataGoal: "Whether they deliver", sortOrder: 1 },
    ]);
  });

  afterAll(async () => {
    const everyone = Object.values(ids);
    await db.delete(conversations).where(inArray(conversations.reviewerId, everyone));
    await db.delete(checkinJobs).where(inArray(checkinJobs.reviewerId, everyone));
    await db.delete(calendarTokens).where(inArray(calendarTokens.userId, everyone));
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, ids.rev));
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, everyone));
  });

  const reply = (content: string) => ({ content, usage: { inputTokens: 1, outputTokens: 1 }, model: "claude-haiku-4-5", latencyMs: 1 });
  const p = (over: Partial<Proposal>): Proposal => ({
    event_index: 1,
    subject_index: 1,
    reason: "A working session with a small group",
    focus: FOCUS,
    sensitivity: "low",
    title_safe: true,
    priority: 5,
    ...over,
  });

  it("stores accepted proposals as proposed and the rest as rejected, with the reason", async () => {
    const prompts: string[] = [];
    const llm = {
      complete: async (req: LLMCompletionRequest) => {
        prompts.push(req.messages.map((m) => m.content).join("\n"));
        return reply(
          JSON.stringify({
            proposals: [
              p({}),
              p({ subject_index: 2, sensitivity: "high", focus: "how Amy handled it" }),
              p({ event_index: 2, subject_index: 3 }),
              p({ event_index: 3, subject_index: 3 }),
              p({ event_index: 9 }),
              p({ subject_index: 7 }),
            ],
          }),
        );
      },
    };
    const res = await runCalendarModelForReviewer(db, llm, ids.rev, { now, maxProposals: 6, logger: { warn: () => {} } });
    expect(res).toMatchObject({ meetings: 3, proposed: 1, rejected: 5 });

    // The model never saw the private meeting, or anyone's email address.
    expect(prompts[0]).not.toContain("Secret reorg");
    expect(prompts[0]).not.toContain("@test.local");

    const rows = await db.select().from(checkinJobs).where(eq(checkinJobs.reviewerId, ids.rev));
    const proposed = rows.filter((r) => r.status === "proposed");
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({
      subjectId: ids.jon,
      anchorEventId: ev.group,
      focus: FOCUS,
      titleSafe: true,
      priority: 5,
      source: "calendar_model",
      model: "claude-haiku-4-5",
      interactionType: "peer_review",
    });
    const rejected = Object.fromEntries(rows.filter((r) => r.status === "rejected").map((r) => [r.rejectionReason, r]));
    expect(Object.keys(rejected).sort()).toEqual(["high_sensitivity", "invented_meeting", "invented_person", "not_usable", "one_to_one"]);
    expect(rejected.high_sensitivity).toMatchObject({ subjectId: ids.amy, anchorEventId: ev.group });
    expect(rejected.one_to_one).toMatchObject({ subjectId: ids.kim, anchorEventId: ev.pair });
    expect(rejected.not_usable).toMatchObject({ subjectId: ids.kim, anchorEventId: ev.declined });
    expect(rejected.invented_meeting).toMatchObject({ subjectId: null, anchorEventId: null });
    expect(rejected.invented_person).toMatchObject({ subjectId: null, anchorEventId: ev.group });

    // Reason and focus are encrypted at rest.
    const raw = (await db.execute(
      sql`select reason, focus from checkin_jobs where id = ${proposed[0].id}`,
    )) as unknown as Array<{ reason: string; focus: string }>;
    expect(raw[0].reason).toMatch(/^enc:v1:/);
    expect(raw[0].focus).toMatch(/^enc:v1:/);
  });

  it("does not offer a meeting again once it has a job (no model call)", async () => {
    let calls = 0;
    const llm = { complete: async () => (calls++, reply('{"proposals": []}')) };
    const res = await runCalendarModelForReviewer(db, llm, ids.rev, { now });
    expect(res.skipped).toBe("nothing_new");
    expect(calls).toBe(0);
  });

  it("keeps going when one person's run fails", async () => {
    const token = (userId: string) => ({ userId, provider: "google", accessToken: "a", refreshToken: "r", expiresAt: new Date(now.getTime() + HOUR) });
    await db.insert(calendarTokens).values([token(ids.rev), token(ids.jon)]);
    const seen: string[] = [];
    const res = await runCalendarModelPass(db, { complete: async () => reply('{"proposals": []}') }, {
      now,
      logger: { warn: () => {} },
      runForReviewer: async (_db, _llm, userId) => {
        seen.push(userId);
        if (userId === ids.jon) throw new Error("boom");
        return { meetings: 1, proposed: userId === ids.rev ? 1 : 0, rejected: 0 };
      },
    });
    expect(seen).toEqual(expect.arrayContaining([ids.rev, ids.jon]));
    expect(res.failed).toBeGreaterThanOrEqual(1);
    expect(res.proposed).toBeGreaterThanOrEqual(1);
    await db.delete(calendarTokens).where(inArray(calendarTokens.userId, [ids.rev, ids.jon]));
  });

  it("the scheduler takes the proposed job first and marks it scheduled", async () => {
    const choice = await choosePeerSubject(db, process.env.ORG_ID!, ids.rev, now);
    const [job] = await db
      .select()
      .from(checkinJobs)
      .where(and(eq(checkinJobs.reviewerId, ids.rev), eq(checkinJobs.subjectId, ids.jon)));
    expect(choice).toEqual({ subjectId: ids.jon, anchorEventId: ev.group, checkinJobId: job.id });
    expect(job.status).toBe("scheduled");
    // Claimed once: the next choice falls back to the rules layer.
    const again = await choosePeerSubject(db, process.env.ORG_ID!, ids.rev, now);
    expect(again?.checkinJobId).toBeNull();
  });

  it("initiation stores the focus encrypted, asks with it, hands it to the planner and marks the job used", async () => {
    const [job] = await db
      .select({ id: checkinJobs.id })
      .from(checkinJobs)
      .where(and(eq(checkinJobs.reviewerId, ids.rev), eq(checkinJobs.subjectId, ids.jon)));
    const requests: LLMCompletionRequest[] = [];
    const llm = {
      complete: async (req: LLMCompletionRequest) => {
        requests.push(req);
        return reply(
          req.jsonMode
            ? JSON.stringify({ quality: "answered", action: "follow_up", question: "What did Jon add?", concern: "none" })
            : "How did Jon get on explaining the numbers?",
        );
      },
    } as unknown as LLMGateway;
    const adapters = new AdapterRegistry();
    adapters.register(new InternalSimulatorAdapter());
    const deps = { llm, adapters, analysisQueue: { add: async () => {} } as unknown as Queue };

    const res = await initiateConversation(db, deps, {
      orgId: process.env.ORG_ID!,
      reviewerId: ids.rev,
      subjectId: ids.jon,
      interactionType: "peer_review",
      platform: "internal",
      channelId: `dm-${tag}`,
      questionnaireId,
      anchorEventId: ev.group,
      checkinJobId: job.id,
    });
    if (res.status !== "started") throw new Error("not started");
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, res.conversationId));
    expect(conv.anchorFocus).toBe(FOCUS);
    expect(conv.anchorLabel).toMatch(/^the "Q3 planning" call/);
    const raw = (await db.execute(sql`select anchor_focus from conversations where id = ${conv.id}`)) as unknown as Array<{ anchor_focus: string }>;
    expect(raw[0].anchor_focus).toMatch(/^enc:v1:/);
    expect(JSON.stringify(requests[0].messages)).toContain(FOCUS);

    const [after] = await db.select({ status: checkinJobs.status }).from(checkinJobs).where(eq(checkinJobs.id, job.id));
    expect(after.status).toBe("used");

    await appendUserMessage(db, conv.id, "It went well");
    await processTurn(db, deps, conv.id);
    const planPrompt = requests.find((r) => r.jsonMode)!.messages[0].content;
    expect(planPrompt).toContain("Background for you only");
    expect(planPrompt).toContain(FOCUS);
  });

  it("a job whose title the model judged unsafe gets the generic label and no focus", async () => {
    // Re-use the rejected Amy row as an accepted job with title_safe false.
    const [job] = await db
      .update(checkinJobs)
      .set({ status: "scheduled", sensitivity: "medium", titleSafe: false, rejectionReason: null, focus: "how Amy framed the plan" })
      .where(and(eq(checkinJobs.reviewerId, ids.rev), eq(checkinJobs.subjectId, ids.amy), eq(checkinJobs.anchorEventId, ev.group)))
      .returning({ id: checkinJobs.id });
    const requests: LLMCompletionRequest[] = [];
    const llm = { complete: async (req: LLMCompletionRequest) => (requests.push(req), reply("How did Amy get on?")) } as unknown as LLMGateway;
    const adapters = new AdapterRegistry();
    adapters.register(new InternalSimulatorAdapter());
    const res = await initiateConversation(
      db,
      { llm, adapters, analysisQueue: { add: async () => {} } as unknown as Queue },
      {
        orgId: process.env.ORG_ID!,
        reviewerId: ids.rev,
        subjectId: ids.amy,
        interactionType: "peer_review",
        platform: "internal",
        channelId: `dm2-${tag}`,
        questionnaireId,
        anchorEventId: ev.group,
        checkinJobId: job.id,
      },
    );
    if (res.status !== "started") throw new Error("not started");
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, res.conversationId));
    expect(conv.anchorLabel).toMatch(/^your call with Amy/);
    expect(conv.anchorFocus).toBeNull();
    expect(JSON.stringify(requests[0].messages)).not.toContain("Q3 planning");
    expect(JSON.stringify(requests[0].messages)).not.toContain("framed the plan");
  });
});
