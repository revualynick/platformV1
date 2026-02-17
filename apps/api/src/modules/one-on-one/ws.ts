import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { getTenantDb } from "@revualy/db";
import { oneOnOneSessions } from "@revualy/db";

interface Room {
  managerSocket: WebSocket | null;
  employeeSocket: WebSocket | null;
  lastContent: string;
  persistTimer: ReturnType<typeof setTimeout> | null;
  sessionId: string;
  managerId: string;
  employeeId: string;
}

const rooms = new Map<string, Room>();
let wsRedis: Redis | null = null;

const REDIS_KEY_PREFIX = "1on1:content:";
const REDIS_TTL = 86400; // 24h
const PERSIST_INTERVAL = 5000; // 5s

function getRoom(sessionId: string): Room | undefined {
  return rooms.get(sessionId);
}

function ensureRoom(
  sessionId: string,
  managerId: string,
  employeeId: string,
): Room {
  let room = rooms.get(sessionId);
  if (!room) {
    room = {
      managerSocket: null,
      employeeSocket: null,
      lastContent: "",
      persistTimer: null,
      sessionId,
      managerId,
      employeeId,
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
  const DEV_DB_URL =
    process.env.TENANT_DATABASE_URL ??
    "postgres://revualy:revualy@localhost:5432/revualy_dev";
  const db = getTenantDb("dev-org", DEV_DB_URL);

  await db
    .update(oneOnOneSessions)
    .set({ notes: room.lastContent, updatedAt: new Date() })
    .where(eq(oneOnOneSessions.id, room.sessionId));
}

function schedulePersist(room: Room) {
  if (room.persistTimer) return; // Already scheduled
  room.persistTimer = setTimeout(async () => {
    room.persistTimer = null;
    await persistNotes(room).catch(() => {});
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

function cleanupRoom(sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (!room.managerSocket && !room.employeeSocket) {
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }
    // Final persist before cleanup
    persistNotes(room).catch(() => {});
    rooms.delete(sessionId);
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
      const query = request.query as Record<string, string>;

      const userId = query.userId;
      const orgId = query.orgId || "dev-org";

      if (!userId || !sessionId) {
        sendJson(socket, { type: "error", message: "Missing userId or sessionId" });
        socket.close();
        return;
      }

      // Resolve tenant and verify session access
      const DEV_DB_URL =
        process.env.TENANT_DATABASE_URL ??
        "postgres://revualy:revualy@localhost:5432/revualy_dev";
      const db = getTenantDb(orgId, DEV_DB_URL);

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

      const room = ensureRoom(sessionId, session.managerId, session.employeeId);

      // Restore content from Redis if room is fresh
      if (!room.lastContent && wsRedis) {
        const cached = await wsRedis.get(`${REDIS_KEY_PREFIX}${sessionId}`);
        if (cached) {
          room.lastContent = cached;
        } else {
          room.lastContent = session.notes;
        }
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
            room.lastContent = msg.content as string;
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
            // Relay to the other participant
            const target = isManager ? room.employeeSocket : room.managerSocket;
            sendJson(target, {
              type: "agenda_updated",
              itemId: msg.itemId,
              covered: msg.covered,
            });
            break;
          }

          case "action_toggle": {
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
        cleanupRoom(sessionId);
      });
    },
  );
}
