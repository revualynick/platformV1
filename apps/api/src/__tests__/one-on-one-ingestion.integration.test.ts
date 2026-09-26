import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LLMCompletionRequest, LLMGateway } from "@revualy/ai-core";
import {
  getTenantDb,
  users,
  goals,
  checkInMeetings,
  goalUpdateSuggestions,
  oneOnOneSessions,
  oneOnOneActionItems,
  betweenMeetingGoals,
} from "@revualy/db";
import { getCurrentCycle } from "@revualy/db/queries";
import {
  discoverMeetings,
  processCheckInMeeting,
  selectMeetingsToProcess,
  type MeetingSource,
} from "../lib/check-in-pipeline.js";
import { buildApp } from "../server.js";

/**
 * 1:1 ingestion v2 against a real Postgres, with a fake LLM and a fake
 * meeting source: a notes Doc becomes tasks, between-meeting goals and
 * suggestions; sensitive items are withheld; manual upload works; and the
 * source text never lands in the database. Self-skips without a database.
 */

const DB_URL = process.env.DATABASE_URL!;
const SECRET = process.env.INTERNAL_API_SECRET!;
const db = getTenantDb(process.env.ORG_ID!, DB_URL);

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

// Sentences from the fake source documents that must never be stored.
const NOTES_SECRET = "Sam explained the migration plan in detail and walked through every open risk on the board";
const TRANSCRIPT_SECRET = "Honestly I think the vendor contract renewal is going to be a real fight this quarter";
const SENSITIVE_NOTE = "Sam shared that she has been struggling with anxiety and has started seeing a therapist";
const QUOTE = "the signup flow is basically done";

const NOTES = [
  "Notes by Gemini",
  NOTES_SECRET + ".",
  "Sam will draft the Q4 roadmap by 2 October.",
  "Sam will lead the team retro next week.",
  SENSITIVE_NOTE + ".",
  "Onboarding is at about 60%.",
].join("\n");
const TRANSCRIPT = `Jo: How is onboarding going?\nSam: Pretty well, ${QUOTE}.\nSam: ${TRANSCRIPT_SECRET}.`;

function fakeLLM(goalId: () => string) {
  const calls: LLMCompletionRequest[] = [];
  const llm = {
    complete: async (req: LLMCompletionRequest) => {
      calls.push(req);
      const prompt = req.messages[0].content;
      const content = prompt.includes("<transcript>")
        ? JSON.stringify({ quotes: [{ goal_id: goalId(), quote: QUOTE, concern: "none" }] })
        : JSON.stringify({
            tasks: [
              { owner: "report", text: "Draft the Q4 roadmap", due_date: "2026-10-02", concern: "none", visibility: "private", share_reason: "" },
              { owner: "report", text: "Lead the team retro", due_date: "", concern: "none", visibility: "shareable", share_reason: "The retro is run with the whole team." },
              { owner: "report", text: "", due_date: "", concern: "wellbeing", visibility: "private", share_reason: "" },
            ],
            focus_areas: [
              { owner: "report", text: "Tighten estimates on migration work", concern: "none", visibility: "private", share_reason: "" },
              // Labelled none by the model, caught by the backstop.
              { owner: "report", text: "Keep seeing the therapist", concern: "none", visibility: "private", share_reason: "" },
            ],
            goal_progress: [
              { goal_id: goalId(), progress_percent: 60, status: "on_track", metric_value: "", note: "Onboarding is about 60% done.", evidence_quote: "", concern: "none" },
            ],
          });
      return { content, usage: { inputTokens: 1, outputTokens: 1 }, model: "fake", latencyMs: 1 };
    },
  };
  return { llm: llm as unknown as LLMGateway, calls };
}

/**
 * Every text-like column of every table, scanned in SQL for a phrase
 * (catches plaintext), plus the decrypted ingestion rows (catches the
 * encrypted columns, which read as ciphertext in SQL).
 */
async function phraseStoredAnywhere(phrase: string): Promise<string[]> {
  const cols = (await db.execute(sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'character varying', 'jsonb')
  `)) as unknown as Array<{ table_name: string; column_name: string }>;
  const hits: string[] = [];
  const needle = `%${phrase.slice(0, 60).toLowerCase()}%`;
  for (const c of cols) {
    const rows = (await db.execute(
      sql`select 1 from ${sql.identifier(c.table_name)} where lower(${sql.identifier(c.column_name)}::text) like ${needle} limit 1`,
    )) as unknown as unknown[];
    if (rows.length > 0) hits.push(`${c.table_name}.${c.column_name}`);
  }
  return hits;
}

describe.skipIf(!dbUp)("1:1 ingestion v2 (integration)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = { manager: crypto.randomUUID(), report: crypto.randomUUID(), peer: crypto.randomUUID() };
  const emails = { manager: `jo-${tag}@test.local`, report: `sam-${tag}@test.local`, peer: `peer-${tag}@test.local` };
  let goalId = "";
  let app: FastifyInstance;
  const fake = fakeLLM(() => goalId);
  const as = (userId: string) => ({ "x-internal-secret": SECRET, "x-user-id": userId });

  const eventStart = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const source: MeetingSource = {
    listPastEvents: async (user) =>
      user.id === ids.manager
        ? [
            {
              externalEventId: `evt-${tag}`,
              title: "Sam / Jo",
              attendees: [emails.manager, emails.report],
              declined: [],
              visibility: "default",
              startAt: eventStart,
              endAt: new Date(eventStart.getTime() + 30 * 60_000),
              organizerEmail: emails.manager,
              attachments: [],
            },
            {
              externalEventId: `grp-${tag}`,
              title: "Team sync",
              attendees: [emails.manager, emails.report, emails.peer],
              startAt: eventStart,
              endAt: eventStart,
              organizerEmail: emails.manager,
              attachments: [],
            },
          ]
        : null,
    findMeetingDocs: async () => ({ notesDocId: `notes-${tag}`, transcriptDocId: `tr-${tag}` }),
    exportDocText: async (_userId, docId) => (docId.startsWith("notes") ? NOTES : TRANSCRIPT),
  };
  const quiet = { log: () => {} };

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ids.manager, email: emails.manager, name: "Jo", role: "manager" },
      { id: ids.report, email: emails.report, name: "Sam", role: "employee", managerId: ids.manager },
      { id: ids.peer, email: emails.peer, name: "Pat", role: "employee", managerId: ids.manager },
    ]);
    const cycle = await getCurrentCycle(db);
    const [goal] = await db
      .insert(goals)
      .values({ level: "individual", title: "Ship onboarding", ownerId: ids.report, createdById: ids.manager, cycleId: cycle?.id ?? null })
      .returning({ id: goals.id });
    goalId = goal.id;

    app = await buildApp();
    app.decorate("llm", fake.llm);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    const all = [ids.manager, ids.report, ids.peer];
    const meetings = await db
      .select({ id: checkInMeetings.id })
      .from(checkInMeetings)
      .where(inArray(checkInMeetings.organizerId, all));
    if (meetings.length > 0) {
      await db.delete(goalUpdateSuggestions).where(inArray(goalUpdateSuggestions.meetingId, meetings.map((m) => m.id)));
    }
    await db.delete(goalUpdateSuggestions).where(eq(goalUpdateSuggestions.goalId, goalId));
    await db.delete(betweenMeetingGoals).where(inArray(betweenMeetingGoals.ownerId, all));
    await db.delete(oneOnOneSessions).where(inArray(oneOnOneSessions.managerId, all));
    await db.delete(checkInMeetings).where(inArray(checkInMeetings.organizerId, all));
    await db.delete(goals).where(eq(goals.id, goalId));
    await db.delete(users).where(inArray(users.id, all));
  });

  let meetingId = "";

  it("semi-automatic: finds the two-person 1:1 (not the group meeting) and waits for approval", async () => {
    const found = await discoverMeetings(db, source, [ids.manager], "[Check-in]", "semi_automatic", quiet);
    expect(found).toBe(1);
    const [row] = await db.select().from(checkInMeetings).where(eq(checkInMeetings.organizerId, ids.manager));
    expect(row).toMatchObject({ subjectUserId: ids.report, detectedBy: "pair", status: "awaiting_approval", source: "calendar" });
    meetingId = row.id;
    const selected = (await selectMeetingsToProcess(db, 1000)).map((m) => m.id);
    expect(selected).not.toContain(meetingId);

    const list = await app.inject({ method: "GET", url: "/api/v1/one-on-one-sessions/imports", headers: as(ids.manager) });
    expect(list.json().data.map((d: { id: string }) => d.id)).toContain(meetingId);
    const notMine = await app.inject({ method: "POST", url: `/api/v1/one-on-one-sessions/imports/${meetingId}/approve`, headers: as(ids.report) });
    expect(notMine.statusCode).toBe(404);
    const ok = await app.inject({ method: "POST", url: `/api/v1/one-on-one-sessions/imports/${meetingId}/approve`, headers: as(ids.manager) });
    expect(ok.statusCode).toBe(200);
  });

  it("a notes Doc yields tasks, between-meeting goals and suggestions, with sensitive items withheld", async () => {
    const [meeting] = await db.select().from(checkInMeetings).where(eq(checkInMeetings.id, meetingId));
    expect(meeting.status).toBe("pending_transcript");
    expect(await processCheckInMeeting(db, fake.llm, meeting, source, quiet)).toBe(true);

    const [after] = await db.select().from(checkInMeetings).where(eq(checkInMeetings.id, meetingId));
    expect(after).toMatchObject({ status: "processed", withheldCount: 2, notesDocId: `notes-${tag}`, transcriptDocId: `tr-${tag}` });
    expect(after.sessionId).toBeTruthy();

    const items = await db.select().from(oneOnOneActionItems).where(eq(oneOnOneActionItems.sourceMeetingId, meetingId));
    expect(items.map((i) => [i.text, i.assigneeId, i.dueDate, i.visibility, i.sessionId]).sort()).toEqual(
      [
        ["Draft the Q4 roadmap", ids.report, "2026-10-02", "private", after.sessionId],
        ["Lead the team retro", ids.report, null, "shareable", after.sessionId],
      ].sort(),
    );
    expect(items.find((i) => i.visibility === "shareable")?.shareReason).toBe("The retro is run with the whole team.");

    const focus = await db.select().from(betweenMeetingGoals).where(eq(betweenMeetingGoals.sourceMeetingId, meetingId));
    expect(focus).toHaveLength(1);
    expect(focus[0]).toMatchObject({
      ownerId: ids.report,
      counterpartId: ids.manager,
      text: "Tighten estimates on migration work",
      status: "active",
      visibility: "private",
      shareReason: null,
    });

    const [suggestion] = await db.select().from(goalUpdateSuggestions).where(eq(goalUpdateSuggestions.meetingId, meetingId));
    expect(suggestion).toMatchObject({ goalId, suggestedProgressPercent: 60, status: "pending", evidenceQuote: QUOTE });

    const [session] = await db.select().from(oneOnOneSessions).where(eq(oneOnOneSessions.id, after.sessionId!));
    expect(session).toMatchObject({ managerId: ids.manager, employeeId: ids.report, status: "completed", notes: "", summary: "" });
  });

  it("nothing sensitive was stored, in plaintext or encrypted", async () => {
    const decrypted = [
      ...(await db.select().from(oneOnOneActionItems).where(eq(oneOnOneActionItems.sourceMeetingId, meetingId))).flatMap((i) => [i.text, i.shareReason]),
      ...(await db.select().from(betweenMeetingGoals).where(eq(betweenMeetingGoals.sourceMeetingId, meetingId))).flatMap((g) => [g.text, g.shareReason]),
      ...(await db.select().from(goalUpdateSuggestions).where(eq(goalUpdateSuggestions.meetingId, meetingId))).flatMap((s) => [s.suggestedNote, s.evidenceQuote]),
    ].join("\n").toLowerCase();
    for (const word of ["anxiety", "therapist", "struggling"]) expect(decrypted).not.toContain(word);
    expect(await phraseStoredAnywhere(SENSITIVE_NOTE)).toEqual([]);
  });

  it("the full notes and transcript text never land in the database", async () => {
    expect(await phraseStoredAnywhere(NOTES_SECRET)).toEqual([]);
    expect(await phraseStoredAnywhere(TRANSCRIPT_SECRET)).toEqual([]);
  });

  it("between-meeting goals are visible to and editable by the two people only", async () => {
    const mine = await app.inject({ method: "GET", url: `/api/v1/one-on-one-sessions/between-meeting-goals?withUserId=${ids.report}`, headers: as(ids.manager) });
    expect(mine.statusCode).toBe(200);
    const goalRow = mine.json().data[0];
    expect(goalRow.text).toBe("Tighten estimates on migration work");

    const peer = await app.inject({ method: "GET", url: "/api/v1/one-on-one-sessions/between-meeting-goals", headers: as(ids.peer) });
    expect(peer.json().data).toEqual([]);
    const peerEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/one-on-one-sessions/between-meeting-goals/${goalRow.id}`,
      headers: as(ids.peer),
      payload: { status: "done" },
    });
    expect(peerEdit.statusCode).toBe(404);

    const noReason = await app.inject({
      method: "PATCH",
      url: `/api/v1/one-on-one-sessions/between-meeting-goals/${goalRow.id}`,
      headers: as(ids.report),
      payload: { visibility: "shareable" },
    });
    expect(noReason.statusCode).toBe(400);
    const edit = await app.inject({
      method: "PATCH",
      url: `/api/v1/one-on-one-sessions/between-meeting-goals/${goalRow.id}`,
      headers: as(ids.report),
      payload: { text: "Tighten estimates", status: "done" },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({ text: "Tighten estimates", status: "done" });
  });

  it("manual upload: the report uploads a file, it is processed in memory and no source text is stored", async () => {
    const before = fake.calls.length;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/one-on-one-sessions/imports/upload",
      headers: as(ids.report),
      payload: {
        counterpartId: ids.manager,
        fileName: "Sam sick leave chat.txt",
        contentBase64: Buffer.from(NOTES).toString("base64"),
        meetingDate: "2026-09-20",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ tasks: 2, suggestions: 1, withheld: 2 });
    expect(fake.calls.length).toBe(before + 1); // notes only: no transcript quote call

    const [row] = await db.select().from(checkInMeetings).where(eq(checkInMeetings.id, body.meetingId));
    expect(row).toMatchObject({ source: "upload", status: "processed", organizerId: ids.manager, subjectUserId: ids.report, title: "Uploaded 1:1 notes" });
    expect(row.notesDocId).toBeNull();

    expect(await phraseStoredAnywhere(NOTES_SECRET)).toEqual([]);
    expect(await phraseStoredAnywhere("Sam sick leave chat")).toEqual([]);
  });

  it("manual upload is refused outside the manager/report pair, and for unreadable files", async () => {
    const peerPair = await app.inject({
      method: "POST",
      url: "/api/v1/one-on-one-sessions/imports/upload",
      headers: as(ids.peer),
      payload: { counterpartId: ids.report, fileName: "n.txt", contentBase64: Buffer.from("hello there").toString("base64") },
    });
    expect(peerPair.statusCode).toBe(403);
    const png = await app.inject({
      method: "POST",
      url: "/api/v1/one-on-one-sessions/imports/upload",
      headers: as(ids.manager),
      payload: { counterpartId: ids.report, fileName: "n.png", contentBase64: Buffer.from("x").toString("base64") },
    });
    expect(png.statusCode).toBe(415);
    const orphans = await db
      .select({ id: checkInMeetings.id })
      .from(checkInMeetings)
      .where(or(eq(checkInMeetings.status, "processing"), eq(checkInMeetings.status, "failed")));
    const ours = (await db.select({ id: checkInMeetings.id }).from(checkInMeetings).where(eq(checkInMeetings.organizerId, ids.manager))).map((r) => r.id);
    expect(orphans.filter((o) => ours.includes(o.id))).toEqual([]);
  });
});
