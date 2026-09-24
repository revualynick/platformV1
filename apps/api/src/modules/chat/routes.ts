import type { FastifyPluginAsync, FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import type { ChatPlatform } from "@revualy/shared";
import type { ChatEvent } from "@revualy/chat-core";
import type { TenantDb } from "@revualy/db";
import { and, eq } from "drizzle-orm";
import { inboundMessages } from "@revualy/db";
import { autoLinkByEmail, markUnreachable, type AutoLinkResult } from "../../lib/chat-identity.js";
import { buildJobId } from "../../lib/job-ids.js";

const MAX_INBOUND_CHARS = 2000;

// Lazy-initialized conversation queue (set by server startup)
let conversationQueue: Queue | null = null;

export function setConversationQueue(queue: Queue) {
  conversationQueue = queue;
}

async function handleWebhook(
  app: FastifyInstance,
  platform: ChatPlatform,
  headers: Record<string, string>,
  verifyBody: unknown, // raw string for HMAC or parsed object depending on platform
  parsedBody: unknown, // always the parsed object for normalizeInbound
  orgId: string,
  db: TenantDb,
) {
  if (!app.adapters.has(platform)) return { status: 503, body: { error: `${platform} adapter not configured` } };

  const adapter = app.adapters.get(platform)!;
  const verification = await adapter.verifyWebhook(headers, verifyBody);

  if (!verification.isValid) return { status: 401, body: { error: "Invalid signature" } };
  if (verification.challenge) return { status: 200, body: { challenge: verification.challenge } };

  const event: ChatEvent | null = adapter.normalizeEvent
    ? await adapter.normalizeEvent(parsedBody)
    : await adapter
        .normalizeInbound(parsedBody)
        .then((m) => (m ? { kind: "message" as const, message: m } : null));
  if (!event) return { status: 200, body: undefined };

  // Lifecycle: the bot was added to or removed from someone's DM.
  if (event.kind === "installed") {
    const result = await autoLinkByEmail(db, {
      platform,
      platformUserId: event.platformUserId,
      email: event.email,
      displayName: event.displayName,
      dmAddress: event.dmAddress,
    });
    app.log.info({ platform, result: result.status }, "Chat app installed in DM");
    // Google Chat shows a JSON { text } response as the bot's reply.
    return { status: 200, body: { text: installReply(result, event.displayName) } };
  }
  if (event.kind === "uninstalled") {
    await markUnreachable(db, platform, event.platformUserId);
    return { status: 200, body: undefined };
  }

  const message = event.message;
  // Keep identity current: links Google Chat users on first contact and
  // records the DM address a reply arrived on. Never blocks the message.
  if (message.isDirectMessage) {
    await autoLinkByEmail(db, {
      platform,
      platformUserId: message.platformUserId,
      email: message.sender?.email,
      displayName: message.sender?.displayName,
      dmAddress: message.platformChannelId,
    }).catch((err) => app.log.error({ err, platform }, "Chat identity refresh failed"));
  }
  // Only one-to-one DMs are check-in conversations. A message in a shared
  // space or channel (or from an adapter that cannot tell) is ignored rather
  // than routed into someone's private feedback or answered in public.
  if (message.isDirectMessage !== true) return { status: 200, body: undefined };

  if (!conversationQueue) {
    return { status: 503, body: { error: "Message queue not initialized" } };
  }

  // Truncate oversized messages but record it, so the bot can acknowledge
  // the cut instead of silently dropping content.
  let text = message.text;
  const truncated = text.length > MAX_INBOUND_CHARS;
  if (truncated) {
    text = text.slice(0, MAX_INBOUND_CHARS);
    app.log.warn({ platform }, "Inbound message truncated");
  }

  // Store first (content encrypted), then queue only the row id: no message
  // text in Redis, and nothing is lost if the queue or worker is down. The
  // platform message id dedupes platform retries.
  const [stored] = await db
    .insert(inboundMessages)
    .values({
      platform,
      platformMessageId: message.platformMessageId || message.id,
      platformUserId: message.platformUserId,
      platformChannelId: message.platformChannelId,
      threadId: message.threadId,
      content: text,
      truncated,
      sentAt: message.timestamp,
    })
    .onConflictDoNothing()
    .returning({ id: inboundMessages.id });
  const inbound =
    stored ??
    (await db
      .select({ id: inboundMessages.id, status: inboundMessages.status })
      .from(inboundMessages)
      .where(
        and(
          eq(inboundMessages.platform, platform),
          eq(inboundMessages.platformMessageId, message.platformMessageId || message.id),
        ),
      )
      .then((rows) => (rows[0]?.status === "pending" ? rows[0] : undefined)));

  if (inbound) {
    await conversationQueue.add(
      "inbound",
      { type: "inbound", orgId, inboundId: inbound.id },
      { jobId: buildJobId("inbound", inbound.id) },
    );
    app.log.info({ inboundId: inbound.id, platform, duplicate: !stored }, "Inbound message stored and queued");
  }

  return { status: 200, body: undefined };
}

/**
 * Deterministic reply when the bot is added to a DM. Never LLM-generated:
 * it states what the bot is for, or honestly why it cannot help yet.
 */
function installReply(result: AutoLinkResult, displayName?: string): string {
  const first = displayName?.split(" ")[0];
  switch (result.status) {
    case "linked":
      return (
        `Hi${first ? ` ${first}` : ""}, I'm Revualy. A couple of times a week I'll check in here ` +
        "with a few quick questions about working with your colleagues, and now and then about your own week. " +
        "Each check-in takes a few minutes. Message help at any time, or stop to pause check-ins."
      );
    case "conflict":
      return "This chat account doesn't match the one already linked to your Revualy profile. Please contact your Revualy admin.";
    default:
      return "Hi, I couldn't find a Revualy account for you yet. Please ask your Revualy admin to add you, then message me again.";
  }
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Add raw body content type parser for Slack signature verification.
  // Slack HMAC requires the exact raw body bytes, not re-serialized JSON.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const parsed = JSON.parse(body as string);
        // Stash raw body for signature verification
        (parsed as Record<string, unknown>).__rawBody = body;
        done(null, parsed);
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // Slack webhook
  app.post("/slack/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const body = request.body as Record<string, unknown>;
    // Pass raw body string to the adapter for HMAC verification
    const rawBody = body.__rawBody as string | undefined;
    if (!rawBody) {
      return reply.code(400).send({ error: "Missing raw body for signature verification" });
    }
    const result = await handleWebhook(
      app,
      "slack",
      request.headers as Record<string, string>,
      rawBody,
      body,
      orgId,
      request.tenant.db,
    );
    return reply.code(result.status).send(result.body);
  });

  // Google Chat webhook
  app.post("/gchat/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const result = await handleWebhook(
      app,
      "google_chat",
      request.headers as Record<string, string>,
      request.body,
      request.body,
      orgId,
      request.tenant.db,
    );
    return reply.code(result.status).send(result.body);
  });

  // Teams webhook
  app.post("/teams/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const result = await handleWebhook(
      app,
      "teams",
      request.headers as Record<string, string>,
      request.body,
      request.body,
      orgId,
      request.tenant.db,
    );
    return reply.code(result.status).send(result.body);
  });
};

