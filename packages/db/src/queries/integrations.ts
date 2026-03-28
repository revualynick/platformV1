import { integrations } from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

const DEFAULT_PLATFORMS = [
  { platform: "slack", name: "Slack" },
  { platform: "google_chat", name: "Google Chat" },
  { platform: "teams", name: "Microsoft Teams" },
  { platform: "google_calendar", name: "Google Calendar" },
];

export async function getIntegrations(db: TenantDb) {
  let rows = await db.select().from(integrations);
  if (rows.length === 0) {
    await db
      .insert(integrations)
      .values(DEFAULT_PLATFORMS)
      .onConflictDoNothing({ target: integrations.platform });
    rows = await db.select().from(integrations);
  }

  return rows.map((r) => ({
    ...r,
    config: undefined,
    hasConfig: !!(
      r.config && (r.config as Record<string, unknown>)._encrypted
    ),
  }));
}
