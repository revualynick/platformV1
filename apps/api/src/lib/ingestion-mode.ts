import type { IngestionMode } from "./check-in-pipeline.js";

/**
 * Which 1:1 ingestion mode applies to a manager (Nick, 2026-09-26): the
 * admin sets the most automatic mode allowed (org max) and a default; each
 * manager may choose their own mode within that.
 *
 * Automatic needs a meeting source (Meet API or a shared Drive folder). None
 * is connected yet, so while it's unavailable automatic falls back to
 * semi-automatic rather than silently reading nothing.
 */

export const MODES: readonly IngestionMode[] = ["manual", "semi_automatic", "automatic"];

const RANK: Record<IngestionMode, number> = { manual: 0, semi_automatic: 1, automatic: 2 };

/** No automatic meeting source is configured in production yet. */
export const AUTOMATIC_SOURCE_AVAILABLE = false;

export function isMode(value: unknown): value is IngestionMode {
  return typeof value === "string" && value in RANK;
}

function lesser(a: IngestionMode, b: IngestionMode): IngestionMode {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Modes a manager may pick, least automatic first. */
export function allowedModes(maxMode: IngestionMode, automaticAvailable = AUTOMATIC_SOURCE_AVAILABLE): IngestionMode[] {
  const ceiling = automaticAvailable ? maxMode : lesser(maxMode, "semi_automatic");
  return MODES.filter((m) => RANK[m] <= RANK[ceiling]);
}

export function effectiveMode(
  settings: { maxMode: string | null | undefined; defaultMode: string | null | undefined },
  managerChoice: string | null | undefined,
  automaticAvailable = AUTOMATIC_SOURCE_AVAILABLE,
): IngestionMode {
  const max: IngestionMode = isMode(settings.maxMode) ? settings.maxMode : "semi_automatic";
  const wanted: IngestionMode = isMode(managerChoice)
    ? managerChoice
    : isMode(settings.defaultMode)
      ? settings.defaultMode
      : "semi_automatic";
  const allowed = allowedModes(max, automaticAvailable);
  return lesser(wanted, allowed[allowed.length - 1]);
}
