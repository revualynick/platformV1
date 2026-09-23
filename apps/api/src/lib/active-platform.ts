import { and, eq, inArray } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { integrations } from "@revualy/db";
import type { ChatPlatform } from "@revualy/shared";

const CHAT_PLATFORMS: ChatPlatform[] = ["slack", "google_chat", "teams"];

/**
 * The tenant's chat platform: the single connected chat integration
 * (migration 0032 allows at most one). Falls back to the SCHEDULER_PLATFORM
 * env var for local development, where nothing is connected.
 */
export async function getActivePlatform(db: TenantDb): Promise<ChatPlatform | null> {
  const [row] = await db
    .select({ platform: integrations.platform })
    .from(integrations)
    .where(and(eq(integrations.status, "connected"), inArray(integrations.platform, CHAT_PLATFORMS)));
  if (row) return row.platform as ChatPlatform;

  const fallback = process.env.SCHEDULER_PLATFORM as ChatPlatform | undefined;
  return fallback && [...CHAT_PLATFORMS, "internal"].includes(fallback) ? fallback : null;
}
