import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { getTenantDb } from "@revualy/db";
import { oneOnOneSessions } from "@revualy/db";
import { verifyWsToken } from "../../lib/ws-auth.js";

function getTenantDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

interface Room {
  managerSocket: WebSocket | null;
  employeeSocket: WebSocket | null;
  lastContent: string;
  persistTimer: ReturnType<typeof setTimeout> | null;
  stalenessTimer: ReturnType<typeof setTimeout> | null;
  sessionId: string;
  managerId: string;
  employeeId: string;
  orgId: string;
}

const rooms = new Map<string, Room>();
let wsRedis: Redis | null = null;

const REDIS_KEY_PREFIX = "1on1:content:";
const REDIS_TTL = 86400; // 24h
const PERSIST_INTERVAL = 5000; // 5s
const STALENESS_TIMEOUT = 300_000; // 5 minutes

function getRoom(sessionId: string): Room | undefined {
  return rooms.get(sessionId);
}

function ensureRoom(
  sessionId: string,
  managerId: string,
  employeeId: string,
  orgId: string,
): Room {
  let room = rooms.get(sessionId);
  if (!room) {
    room = {
      managerSocket: null,
      employeeSocket: null,
      lastContent: "",
      persistTimer: null,
      stalenessTimer: null,
      sessionId,
      managerId,
      employeeId,
      orgId,
    };
    rooms.set(sessionId, room);
  }
  return room;
}

async function persistNotes(room: Room) {
  // Save to Redis cache
  if (wsRedis) {
    await wsRedis.setex(
      `${REDIS_KEY_PREFIX}${room.sessionId}`,
      REDIS_TTL,
      room.lastContent,
    );
  }

  // Save to database
  const db = getTenantDb(room.orgId, getTenantDbUrl());

  await db
    .update(oneOnOneSessions)
    .set({ notes: room.lastContent, updatedAt: new Date() })
    .where(eq(oneOnOneSessions.id, room.sessionId));
}

function schedulePersist(room: Room) {
  if (room.persistTimer) return; // Already scheduled
  room.persistTimer = setTimeout(async () => {
    room.persistTimer = null;
    await persistNotes(room).catch((err) => console.warn("[WS] Persist failed for session", room.sessionId, err));
  }, PERSIST_INTERVAL);
}

function sendJson(socket: WebSocket | null, data: Record<string, unknown>) {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(data));
  }
}

function broadcastPresence(room: Room) {
  const presence = {
    type: "presence",
    managerConnected: room.managerSocket !== null,
    employeeConnected: room.employeeSocket !== null,
  };
  sendJson(room.managerSocket, presence);
  sendJson(room.employeeSocket, presence);
}

async function forceCleanupRoom(sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
    room.persistTimer = null;
  }
  if (room.stalenessTimer) {
    clearTimeout(room.stalenessTimer);
    room.stalenessTimer = null;
  }
  // Final persist before cleanup — await to prevent data loss
  try {
    await persistNotes(room);
  } catch (err) {
    console.error(`[WS] Failed to persist notes for session ${sessionId}:`, err);
  }
  rooms.delete(sessionId);
}

function handleDisconnect(sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (!room.managerSocket && !room.employeeSocket) {
    // Both gone — clean up immediately
    forceCleanupRoom(sessionId);
  } else {
    // One side still connected — start staleness timer to force cleanup if the other side never reconnects
    if (room.stalenessTimer) clearTimeout(room.stalenessTimer);
    room.stalenessTimer = setTimeout(() => {
      room.stalenessTimer = null;
      // Re-check: a reconnect may have happened during the timeout (#22)
      const current = rooms.get(sessionId);
      if (!current || (!current.managerSocket && !current.employeeSocket)) {
        forceCleanupRoom(sessionId);
      }
    }, STALENESS_TIMEOUT);
  }
}

/** Close the WebSocket Redis connection (called during graceful shutdown). */
export async function closeWsRedis(): Promise<void> {
  if (wsRedis) {
    await wsRedis.quit();
    wsRedis = null;
  }
}

export function registerOneOnOneWs(app: FastifyInstance, redisUrl: string) {
  // Create dedicated Redis instance for WebSocket
  const parsed = new URL(redisUrl);
  wsRedis = new Redis({
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
  });

  app.get(
    "/ws/one-on-one/:sessionId",
    { websocket: true },
    async (socket, request) => {
      const { sessionId } = request.params as { sessionId: string };

      // Authenticate via subprotocol (avoids leaking token in URL/server logs)
      const protocols = (request.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const token = protocols.find((p) => p !== "revualy-ws");
      if (!token) {
        sendJson(socket, { type: "error", message: "Missing auth token — pass token as WebSocket subprotocol" });
        socket.close();
        return;
      }

      const payload = verifyWsToken(token);
      if (!payload) {
        sendJson(socket, { type: "error", message: "Invalid or expired token" });
        socket.close();
        return;
      }

      // Verify token was issued for this specific session
      if (payload.sessionId !== sessionId) {
        sendJson(socket, { type: "error", message: "Token does not match session" });
        socket.close();
        return;
      }

      const userId = payload.userId;
      const orgId = payload.orgId;

      // Resolve tenant database
      const db = getTenantDb(orgId, getTenantDbUrl());

      const [session] = await db
        .select()
        .from(oneOnOneSessions)
        .where(eq(oneOnOneSessions.id, sessionId));

      if (!session) {
        sendJson(socket, { type: "error", message: "Session not found" });
        socket.close();
        return;
      }

      const isManager = session.managerId === userId;
      const isEmployee = session.employeeId === userId;

      if (!isManager && !isEmployee) {
        sendJson(socket, { type: "error", message: "Access denied" });
        socket.close();
        return;
      }

      const room = ensureRoom(sessionId, session.managerId, session.employeeId, orgId);

      // Restore content from Redis if room is fresh
      if (!room.lastContent && wsRedis) {
        const cached = await wsRedis.get(`${REDIS_KEY_PREFIX}${sessionId}`);
        if (cached) {
          room.lastContent = cached;
        } else {
          room.lastContent = session.notes;
        }
      }

      // Cancel staleness timer on reconnect
      if (room.stalenessTimer) {
        clearTimeout(room.stalenessTimer);
        room.stalenessTimer = null;
      }

      // Assign socket to the room
      if (isManager) {
        if (room.managerSocket) {
          sendJson(room.managerSocket, { type: "error", message: "Replaced by new connection" });
          room.managerSocket.close();
        }
        room.managerSocket = socket;
      } else {
        if (room.employeeSocket) {
          sendJson(room.employeeSocket, { type: "error", message: "Replaced by new connection" });
          room.employeeSocket.close();
        }
        room.employeeSocket = socket;
      }

      // Send initial state
      sendJson(socket, {
        type: "content_sync",
        content: room.lastContent,
        sessionId,
      });
      broadcastPresence(room);

      // Handle messages
      socket.on("message", (raw: Buffer | string) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch {
          sendJson(socket, { type: "error", message: "Invalid JSON" });
          return;
        }

        switch (msg.type) {
          case "content_update": {
            if (!isManager) {
              sendJson(socket, { type: "error", message: "Only the manager can edit notes" });
              return;
            }
            if (typeof msg.content !== "string") {
              sendJson(socket, { type: "error", message: "content must be a string" });
              return;
            }
            const MAX_CONTENT_LENGTH = 500_000; // 500KB
            if (msg.content.length > MAX_CONTENT_LENGTH) {
              sendJson(socket, { type: "error", message: "Content too large (max 500KB)" });
              break;
            }
            room.lastContent = msg.content;
            // Broadcast to employee
            sendJson(room.employeeSocket, {
              type: "content_sync",
              content: room.lastContent,
            });
            schedulePersist(room);
            break;
          }

          case "request_edit": {
            // Employee requests edit permission → relay to manager
            sendJson(room.managerSocket, {
              type: "edit_request",
              userId,
            });
            break;
          }

          case "agenda_toggle": {
            if (typeof msg.itemId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msg.itemId)) break;
            if (typeof msg.covered !== "boolean") break;
            const target = isManager ? room.employeeSocket : room.managerSocket;
            sendJson(target, {
              type: "agenda_updated",
              itemId: msg.itemId,
              covered: msg.covered,
            });
            break;
          }

          case "action_toggle": {
            if (typeof msg.itemId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msg.itemId)) break;
            if (typeof msg.completed !== "boolean") break;
            const target = isManager ? room.employeeSocket : room.managerSocket;
            sendJson(target, {
              type: "action_updated",
              itemId: msg.itemId,
              completed: msg.completed,
            });
            break;
          }

          case "ping": {
            sendJson(socket, { type: "pong" });
            break;
          }
        }
      });

      // Handle disconnect
      socket.on("close", () => {
        if (isManager) {
          room.managerSocket = null;
        } else {
          room.employeeSocket = null;
        }
        broadcastPresence(room);
        handleDisconnect(sessionId);
      });
    },
  );
}
