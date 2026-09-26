import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import { getTenantDb, users, calendarEvents, conversations, questionnaires, questionnaireThemes } from "@revualy/db";
import type { LLMGateway, LLMCompletionRequest } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { InternalSimulatorAdapter } from "../lib/internal-simulator-adapter.js";
import { pickSubjectFromMeetings, resolveAnchor } from "../lib/meeting-anchor.js";
import { appendUserMessage, initiateConversation, processTurn } from "../lib/conversation-orchestrator.js";

/** Meeting-anchored check-ins against a real Postgres. Self-skips without a DB. */

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

describe.skipIf(!dbUp)("meeting anchors (integration)", () => {
  const ids = { rev: crypto.randomUUID(), jon: crypto.randomUUID(), amy: crypto.randomUUID(), kim: crypto.randomUUID() };
  const tag = ids.rev.slice(0, 8);
  const email = (k: keyof typeof ids) => `${k}-${tag}@test.local`;
  const now = new Date();
  let questionnaireId: string;

  async function meeting(over: Partial<typeof calendarEvents.$inferInsert> & { hoursAgo: number; minutes?: number }) {
    const { hoursAgo, minutes = 30, ...rest } = over;
    const startAt = new Date(now.getTime() - hoursAgo * HOUR);
    const [row] = await db
      .insert(calendarEvents)
      .values({
        userId: ids.rev,
        externalEventId: `ev-${crypto.randomUUID()}`,
        title: "Q3 planning",
        attendees: [email("rev"), email("jon"), email("amy")],
        startAt,
        endAt: new Date(startAt.getTime() + minutes * 60_000),
        source: "google",
        ...rest,
      })
      .returning();
    return row;
  }

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.rev, email: email("rev"), name: "Rae Reviewer", timezone: "Europe/London" },
      { id: ids.jon, email: email("jon"), name: "Jon Smith" },
      { id: ids.amy, email: email("amy"), name: "Amy Jones" },
      { id: ids.kim, email: email("kim"), name: "Kim Lee" },
    ]);
    const [q] = await db.insert(questionnaires).values({ name: `anchor-${tag}`, category: "peer_review" }).returning();
    questionnaireId = q.id;
    await db.insert(questionnaireThemes).values([
      { questionnaireId, intent: "Contribution", dataGoal: "How they contribute in meetings", sortOrder: 0 },
      { questionnaireId, intent: "Reliability", dataGoal: "Whether they deliver", sortOrder: 1 },
    ]);
  });

  afterAll(async () => {
    const convs = (await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.reviewerId, ids.rev))).map((c) => c.id);
    if (convs.length) await db.delete(conversations).where(inArray(conversations.id, convs));
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, ids.rev));
    await db.delete(questionnaires).where(eq(questionnaires.id, questionnaireId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  it("picks a colleague from a recent meeting both attended, skipping ones to avoid", async () => {
    const ev = await meeting({ hoursAgo: 30 });
    expect(await pickSubjectFromMeetings(db, ids.rev, new Set(), now)).toMatchObject({ subjectId: ids.jon, event: { id: ev.id } });
    expect(await pickSubjectFromMeetings(db, ids.rev, new Set([ids.jon]), now)).toMatchObject({ subjectId: ids.amy });
    await db.delete(calendarEvents).where(eq(calendarEvents.id, ev.id));
  });

  it("never uses a meeting that was declined, private, too short, still to come, or too old", async () => {
    await meeting({ hoursAgo: 10, declined: [email("jon"), email("amy")] });
    await meeting({ hoursAgo: 12, visibility: "private" });
    await meeting({ hoursAgo: 14, minutes: 5 });
    await meeting({ hoursAgo: -5 }); // tomorrow-ish: not happened yet
    await meeting({ hoursAgo: 24 * 9 }); // older than a week
    expect(await pickSubjectFromMeetings(db, ids.rev, new Set(), now)).toBeNull();
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, ids.rev));
  });

  it("re-checks at send time: a meeting declined after scheduling is replaced", async () => {
    const scheduled = await meeting({ hoursAgo: 20, title: "Sprint review" });
    const other = await meeting({ hoursAgo: 40, title: "Design crit" });
    await db.update(calendarEvents).set({ declined: [email("jon")] }).where(eq(calendarEvents.id, scheduled.id));
    const resolved = await resolveAnchor(db, ids.rev, ids.jon, scheduled.id, now);
    expect(resolved?.id).toBe(other.id);
    await db.delete(calendarEvents).where(eq(calendarEvents.userId, ids.rev));
  });

  it("opens with the meeting, says it came from the calendar, and keeps it for later turns", async () => {
    const ev = await meeting({ hoursAgo: 26, title: "Q3 planning" });
    const requests: LLMCompletionRequest[] = [];
    const llm = {
      complete: async (req: LLMCompletionRequest) => {
        requests.push(req);
        const content = req.jsonMode
          ? JSON.stringify({ quality: "answered", action: "follow_up", question: "What did Jon add?", concern: "none" })
          : "How did Jon contribute on that call?";
        return { content, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", latencyMs: 1 };
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
      anchorEventId: ev.id,
    });
    if (res.status !== "started") throw new Error("not started");
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, res.conversationId));
    expect(conv.anchorEventId).toBe(ev.id);
    expect(conv.anchorLabel).toMatch(/^the "Q3 planning" call (yesterday|on \w+day)$/);
    // The opening question was asked about the meeting.
    expect(JSON.stringify(requests[0].messages)).toContain("Q3 planning");

    // The label is encrypted at rest.
    const raw = (await db.execute(sql`select anchor_label from conversations where id = ${conv.id}`)) as unknown as Array<{ anchor_label: string }>;
    expect(raw[0].anchor_label).toMatch(/^enc:v1:/);

    // Later turns know which meeting the check-in is about.
    await appendUserMessage(db, conv.id, "It went fine");
    await processTurn(db, deps, conv.id);
    const planPrompt = requests.find((r) => r.jsonMode)!.messages[0].content;
    expect(planPrompt).toContain('This check-in is about the "Q3 planning" call');
    expect(planPrompt).toContain("weren't there");
  });
});
