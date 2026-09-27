import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { Queue } from "bullmq";
import { buildJobId } from "../../lib/job-ids.js";
import { eq, and, or, desc } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { users, checkInMeetings, betweenMeetingGoals, calendarTokens } from "@revualy/db";
import { getOrgSettings } from "@revualy/db/queries";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  uploadOneOnOneSchema,
  betweenMeetingGoalQuerySchema,
  updateBetweenMeetingGoalSchema,
  setIngestionModeSchema,
} from "../../lib/validation.js";
import { allowedModes, effectiveMode, isMode, AUTOMATIC_SOURCE_AVAILABLE } from "../../lib/ingestion-mode.js";
import { GOOGLE_DRIVE_SCOPE } from "../../lib/google-calendar.js";
import {
  extractDocumentText,
  fileExtension,
  DocumentReadError,
  MAX_UPLOAD_BYTES,
} from "../../lib/document-text.js";
import { ingestMeetingDocuments, IngestionLLMError } from "../../lib/one-on-one-ingestion.js";
import { MEET_DOC_PATTERNS } from "../../lib/google-drive.js";

interface ImportRouteOptions {
  resolvePair: (
    db: TenantDb,
    userId: string,
    otherId: string,
  ) => Promise<{ managerId: string; employeeId: string } | null>;
}

const READ_ERROR_STATUS: Record<DocumentReadError["code"], number> = {
  unsupported_type: 415,
  too_large: 413,
  unreadable: 422,
  empty: 422,
};

const READ_ERROR_MESSAGE: Record<DocumentReadError["code"], string> = {
  unsupported_type: "Unsupported file type: use .docx, .txt, .pdf, .vtt or .html",
  too_large: "File is too large (5 MB limit)",
  unreadable: "Could not read text from this file; try .docx or .txt",
  empty: "The file has no text in it",
};

/**
 * 1:1 ingestion routes, under /api/v1/one-on-one-sessions:
 * - POST /imports/upload: manual upload (the manager or the report),
 *   processed in memory; the file is discarded.
 * - GET /imports, POST /imports/:id/approve | /decline: semi-automatic
 *   mode's "import this 1:1?" (the manager whose calendar it is).
 * - GET/PATCH /between-meeting-goals: both people in the 1:1, nobody else.
 * - GET/PUT /ingestion-mode: the caller's own mode, within the admin's limit.
 * - GET /imports/recent: recent imports the caller was part of (status only).
 */
let checkInQueue: Queue | null = null;
/** Set at startup (server.ts); approvals queue their meeting for processing. */
export function setCheckInQueue(queue: Queue) {
  checkInQueue = queue;
}

export const importRoutes: FastifyPluginAsync<ImportRouteOptions> = async (app, opts) => {
  app.post(
    "/imports/upload",
    {
      preHandler: requireAuth,
      // Base64 of a 5 MB file, plus the JSON around it.
      bodyLimit: 8 * 1024 * 1024,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { db } = request.tenant;
      const userId = getAuthenticatedUserId(request);
      const body = parseBody(uploadOneOnOneSchema, request.body);

      const pair = await opts.resolvePair(db, userId, body.counterpartId);
      if (!pair) {
        return reply.code(403).send({ error: "You can only upload 1:1s with your manager or a direct report" });
      }

      const data = Buffer.from(body.contentBase64, "base64");
      if (data.length > MAX_UPLOAD_BYTES) {
        return reply.code(413).send({ error: READ_ERROR_MESSAGE.too_large });
      }
      let text: string;
      try {
        text = extractDocumentText(body.fileName, data);
      } catch (err) {
        if (err instanceof DocumentReadError) {
          return reply.code(READ_ERROR_STATUS[err.code]).send({ error: READ_ERROR_MESSAGE[err.code] });
        }
        throw err;
      }
      const isTranscript =
        fileExtension(body.fileName) === "vtt" || MEET_DOC_PATTERNS.transcript.some((p) => p.test(body.fileName));

      // The file name can itself be sensitive, so it is not stored.
      const eventStart = body.meetingDate ? new Date(`${body.meetingDate}T12:00:00Z`) : new Date();
      const [meeting] = await db
        .insert(checkInMeetings)
        .values({
          organizerId: pair.managerId,
          subjectUserId: pair.employeeId,
          externalEventId: `upload:${crypto.randomUUID()}`,
          title: "Uploaded 1:1 notes",
          eventStart,
          source: "upload",
          status: "processing",
          lastAttemptAt: new Date(),
        })
        .returning({ id: checkInMeetings.id });

      try {
        const outcome = await ingestMeetingDocuments(
          db,
          app.llm,
          { id: meeting.id, managerId: pair.managerId, reportId: pair.employeeId, eventStart },
          isTranscript ? { notes: null, transcript: text } : { notes: text, transcript: null },
          { warn: (...args: unknown[]) => request.log.warn(args.map(String).join(" ")) },
        );
        return reply.code(201).send({ meetingId: meeting.id, ...outcome });
      } catch (err) {
        await db
          .update(checkInMeetings)
          .set({ status: "failed", errorMessage: err instanceof IngestionLLMError ? "llm_error" : "processing_failed" })
          .where(eq(checkInMeetings.id, meeting.id));
        if (err instanceof IngestionLLMError) {
          return reply.code(502).send({ error: "Could not process the notes right now; please try again later" });
        }
        throw err;
      }
    },
  );

  // GET /imports: 1:1s found on the caller's calendar, waiting for their yes
  app.get("/imports", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const rows = await db
      .select({
        id: checkInMeetings.id,
        title: checkInMeetings.title,
        eventStart: checkInMeetings.eventStart,
        detectedBy: checkInMeetings.detectedBy,
        subjectUserId: checkInMeetings.subjectUserId,
        subjectName: users.name,
      })
      .from(checkInMeetings)
      .leftJoin(users, eq(users.id, checkInMeetings.subjectUserId))
      .where(and(eq(checkInMeetings.organizerId, userId), eq(checkInMeetings.status, "awaiting_approval")))
      .orderBy(desc(checkInMeetings.eventStart))
      .limit(100);
    return reply.send({ data: rows });
  });

  for (const [action, status] of [
    ["approve", "pending_transcript"],
    ["decline", "declined"],
  ] as const) {
    app.post(`/imports/:id/${action}`, { preHandler: requireAuth }, async (request, reply) => {
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      const userId = getAuthenticatedUserId(request);
      const [updated] = await db
        .update(checkInMeetings)
        .set({ status, attemptCount: 0 })
        .where(
          and(
            eq(checkInMeetings.id, id),
            eq(checkInMeetings.organizerId, userId),
            eq(checkInMeetings.status, "awaiting_approval"),
          ),
        )
        .returning({ id: checkInMeetings.id, status: checkInMeetings.status });
      if (!updated) return reply.code(404).send({ error: "Import not found" });
      if (action === "approve" && checkInQueue) {
        // Read the notes now rather than at the next hourly run. Best effort:
        // if queueing fails, the hourly run still picks the meeting up.
        await checkInQueue
          .add("check-in-meeting", { orgId: request.tenant.orgId, meetingId: id }, { jobId: buildJobId("check-in-meeting", id) })
          .catch((err: unknown) => request.log.warn({ err }, "could not queue approved 1:1"));
      }
      return reply.send(updated);
    });
  }

  // GET /ingestion-mode: what the caller may choose and what applies now
  app.get("/ingestion-mode", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const settings = await getOrgSettings(db);
    const [me] = await db.select({ choice: users.oneOnOneIngestionMode }).from(users).where(eq(users.id, userId));
    const [token] = await db
      .select({ scopes: calendarTokens.scopes })
      .from(calendarTokens)
      .where(and(eq(calendarTokens.userId, userId), eq(calendarTokens.provider, "google")));
    const limits = { maxMode: settings?.oneOnOneMaxMode, defaultMode: settings?.oneOnOneIngestionMode };
    const maxMode = isMode(limits.maxMode) ? limits.maxMode : "semi_automatic";
    return reply.send({
      allowed: allowedModes(maxMode),
      orgMaxMode: maxMode,
      orgDefault: effectiveMode(limits, null),
      choice: isMode(me?.choice) ? me.choice : null,
      effective: effectiveMode(limits, me?.choice),
      automaticAvailable: AUTOMATIC_SOURCE_AVAILABLE,
      // Semi-automatic reads Meet notes with the manager's own Google token.
      driveConnected: Boolean(token?.scopes.includes(GOOGLE_DRIVE_SCOPE)),
    });
  });

  // PUT /ingestion-mode: set (or clear, with null) the caller's own mode
  app.put("/ingestion-mode", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const { mode } = parseBody(setIngestionModeSchema, request.body);
    if (mode !== null) {
      const settings = await getOrgSettings(db);
      const maxMode = isMode(settings?.oneOnOneMaxMode) ? settings.oneOnOneMaxMode : "semi_automatic";
      if (!allowedModes(maxMode).includes(mode)) {
        return reply.code(403).send({ error: "Your organisation doesn't allow that mode" });
      }
    }
    await db.update(users).set({ oneOnOneIngestionMode: mode }).where(eq(users.id, userId));
    return reply.send({ choice: mode });
  });

  // GET /imports/recent: the last imports the caller took part in. Status
  // and counts only: never the notes, and uploads carry no file name.
  app.get("/imports/recent", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const rows = await db
      .select({
        id: checkInMeetings.id,
        title: checkInMeetings.title,
        eventStart: checkInMeetings.eventStart,
        source: checkInMeetings.source,
        status: checkInMeetings.status,
        withheldCount: checkInMeetings.withheldCount,
        organizerId: checkInMeetings.organizerId,
        subjectUserId: checkInMeetings.subjectUserId,
        subjectName: users.name,
      })
      .from(checkInMeetings)
      .leftJoin(users, eq(users.id, checkInMeetings.subjectUserId))
      .where(or(eq(checkInMeetings.organizerId, userId), eq(checkInMeetings.subjectUserId, userId)))
      .orderBy(desc(checkInMeetings.eventStart))
      .limit(30);
    return reply.send({ data: rows });
  });

  // GET /between-meeting-goals: the caller's, as owner or counterpart
  app.get("/between-meeting-goals", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const query = parseBody(betweenMeetingGoalQuerySchema, request.query);

    const conditions = [
      query.withUserId
        ? or(
            and(eq(betweenMeetingGoals.ownerId, userId), eq(betweenMeetingGoals.counterpartId, query.withUserId)),
            and(eq(betweenMeetingGoals.ownerId, query.withUserId), eq(betweenMeetingGoals.counterpartId, userId)),
          )!
        : or(eq(betweenMeetingGoals.ownerId, userId), eq(betweenMeetingGoals.counterpartId, userId))!,
    ];
    if (query.status) conditions.push(eq(betweenMeetingGoals.status, query.status));

    const rows = await db
      .select()
      .from(betweenMeetingGoals)
      .where(and(...conditions))
      .orderBy(desc(betweenMeetingGoals.createdAt))
      .limit(200);
    return reply.send({ data: rows });
  });

  // PATCH /between-meeting-goals/:id: either person in the 1:1
  app.patch("/between-meeting-goals/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(updateBetweenMeetingGoalSchema, request.body);

    const updates: Partial<typeof betweenMeetingGoals.$inferInsert> = { updatedAt: new Date() };
    if (body.text !== undefined) updates.text = body.text;
    if (body.status !== undefined) updates.status = body.status;
    if (body.visibility === "private") {
      updates.visibility = "private";
      updates.shareReason = null;
    } else if (body.visibility === "shareable") {
      updates.visibility = "shareable";
      updates.shareReason = body.shareReason!;
    } else if (body.shareReason !== undefined) {
      updates.shareReason = body.shareReason;
    }

    const [updated] = await db
      .update(betweenMeetingGoals)
      .set(updates)
      .where(
        and(
          eq(betweenMeetingGoals.id, id),
          or(eq(betweenMeetingGoals.ownerId, userId), eq(betweenMeetingGoals.counterpartId, userId)),
        ),
      )
      .returning();
    if (!updated) return reply.code(404).send({ error: "Goal not found" });
    return reply.send(updated);
  });
};
