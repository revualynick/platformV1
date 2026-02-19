import { eq, and, gte, or, sql } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import {
  feedbackEntries,
  pulseCheckTriggers,
  pulseCheckConfig,
} from "@revualy/db";

interface PulseCheckDefaults {
  negativeSentimentThreshold: number;
  windowDays: number;
  cooldownDays: number;
  isEnabled: boolean;
}

const DEFAULTS: PulseCheckDefaults = {
  negativeSentimentThreshold: 2,
  windowDays: 7,
  cooldownDays: 14,
  isEnabled: true,
};

export async function evaluatePulseCheckTrigger(
  db: TenantDb,
  userId: string,
  orgId: string,
  logger?: Pick<Console, "info" | "warn" | "error">,
): Promise<{ triggered: boolean; reason?: string }> {
  const log = logger ?? console;

  // 1. Load pulse check config (or use defaults if no config row)
  const [config] = await db.select().from(pulseCheckConfig).limit(1);

  const threshold = config?.negativeSentimentThreshold ?? DEFAULTS.negativeSentimentThreshold;
  const windowDays = config?.windowDays ?? DEFAULTS.windowDays;
  const cooldownDays = config?.cooldownDays ?? DEFAULTS.cooldownDays;
  const isEnabled = config?.isEnabled ?? DEFAULTS.isEnabled;

  if (!isEnabled) {
    return { triggered: false };
  }

  // 2. Count negative/mixed sentiment feedbacks for this user in the window
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackEntries)
    .where(
      and(
        eq(feedbackEntries.subjectId, userId),
        gte(feedbackEntries.createdAt, windowStart),
        or(
          eq(feedbackEntries.sentiment, "negative"),
          eq(feedbackEntries.sentiment, "mixed"),
        ),
      ),
    );

  const negativeCount = countResult?.count ?? 0;

  if (negativeCount < threshold) {
    return { triggered: false };
  }

  // 3. Check cooldown: has this user had a pulse check trigger recently?
  const cooldownStart = new Date();
  cooldownStart.setDate(cooldownStart.getDate() - cooldownDays);

  const [recentTrigger] = await db
    .select({ id: pulseCheckTriggers.id })
    .from(pulseCheckTriggers)
    .where(
      and(
        eq(pulseCheckTriggers.sourceType, "sentiment_decline"),
        eq(pulseCheckTriggers.sourceRef, userId),
        gte(pulseCheckTriggers.createdAt, cooldownStart),
      ),
    )
    .limit(1);

  if (recentTrigger) {
    return { triggered: false };
  }

  // 4. Threshold exceeded and no cooldown active: insert trigger
  const reason = `${negativeCount} negative/mixed feedbacks in last ${windowDays} days`;

  await db.insert(pulseCheckTriggers).values({
    sourceType: "sentiment_decline",
    sourceRef: userId,
    sentiment: "negative",
  });

  log.info(`[PulseCheck] Triggered for user ${userId} in org ${orgId}: ${reason}`);

  return { triggered: true, reason };
}
