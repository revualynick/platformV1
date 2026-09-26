/**
 * Tier A aggregation and lag (docs/design/privacy-and-agent-access.md).
 *
 * Peer feedback reaches the subject and their manager in batches, not as it
 * arrives: otherwise timing gives the reviewer away ("I had a call with Jon
 * on Tuesday and on Wednesday new feedback appeared"). Entries collect in a
 * pool; at each release boundary the pool is released only if it holds at
 * least MIN_DISTINCT_REVIEWERS distinct reviewers, otherwise it carries
 * over to the next boundary. Stateless: the same data always gives the
 * same releases.
 *
 * Both numbers are constants for now, meant to become org settings.
 * Client-safe (no Node imports).
 */

export const MIN_DISTINCT_REVIEWERS = 3;
export const RELEASE_PERIOD_DAYS = 14;
/** Boundaries fall every RELEASE_PERIOD_DAYS from this Monday, 00:00 UTC. */
export const RELEASE_EPOCH = Date.UTC(2026, 0, 5);

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = RELEASE_PERIOD_DAYS * DAY_MS;

/** The latest release boundary at or before `now`. */
export function latestReleaseBoundary(now: Date): Date {
  const n = Math.floor((now.getTime() - RELEASE_EPOCH) / PERIOD_MS);
  return new Date(RELEASE_EPOCH + n * PERIOD_MS);
}

/** The first release boundary strictly after `t`. */
export function nextReleaseBoundary(t: Date): Date {
  const n = Math.floor((t.getTime() - RELEASE_EPOCH) / PERIOD_MS) + 1;
  return new Date(RELEASE_EPOCH + n * PERIOD_MS);
}

export interface ReleasableEntry {
  id: string;
  reviewerRef: string;
  createdAt: Date;
}

/**
 * When each entry is released (entry id -> boundary), as of `now`.
 * Entries not in the map are withheld.
 */
export function computeReleases(
  entries: readonly ReleasableEntry[],
  now: Date,
  minReviewers = MIN_DISTINCT_REVIEWERS,
): Map<string, Date> {
  const released = new Map<string, Date>();
  if (entries.length === 0) return released;
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const last = latestReleaseBoundary(now);
  let pool: ReleasableEntry[] = [];
  let i = 0;
  for (
    let boundary = nextReleaseBoundary(sorted[0].createdAt);
    boundary.getTime() <= last.getTime();
    boundary = new Date(boundary.getTime() + PERIOD_MS)
  ) {
    while (i < sorted.length && sorted[i].createdAt.getTime() < boundary.getTime()) pool.push(sorted[i++]);
    if (new Set(pool.map((e) => e.reviewerRef)).size >= minReviewers) {
      for (const e of pool) released.set(e.id, boundary);
      pool = [];
    }
  }
  return released;
}

// ── Meeting references ────────────────────────────────

const MEETING_WORDS =
  "meeting|call|stand-?up|sync|catch-?up|check-?in|workshop|session|review|retro(?:spective)?|1:1|1-1|one-to-one|one-on-one|demo|presentation|offsite|off-site|planning|kick-?off|all-hands|town ?hall|huddle|interview|standup";
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

const PATTERNS: RegExp[] = [
  // "on the Acme call", "during Tuesday's planning meeting", "in our 1:1 last week"
  new RegExp(
    `\\b(?:on|in|during|at|after|before|from|since)\\s+(?:the|our|a|an|that|this|their|his|her|last|yesterday'?s|today'?s|(?:${WEEKDAYS})'?s?)?\\s*[^,.;:!?()]{0,40}?\\b(?:${MEETING_WORDS})s?\\b(?:\\s+(?:last|this|on)\\s+(?:week|month|${WEEKDAYS}))?`,
    "gi",
  ),
  // "on Tuesday", "last Friday", "this Monday"
  new RegExp(`\\b(?:on|last|this|next|since)\\s+(?:${WEEKDAYS})\\b`, "gi"),
  // bare weekday names
  new RegExp(`\\b(?:${WEEKDAYS})\\b`, "gi"),
  // "3 March", "March 3rd", "3rd of March"
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"),
  // numeric dates and times
  /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g,
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi,
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove meeting references (meeting names, days, dates, times) from text
 * that is about to reach the subject or their manager. A theme that says
 * "on the Acme call" narrows the reviewer to that call's attendees.
 * `extraTerms` are known labels to remove too (the anchor meeting's title).
 * Best effort, pattern based: it will miss some phrasings.
 */
export function stripMeetingReferences(text: string, extraTerms: readonly string[] = []): string {
  let out = text;
  for (const term of extraTerms) {
    const t = term.trim();
    if (t.length >= 3) out = out.replace(new RegExp(escapeRegExp(t), "gi"), "");
  }
  for (const re of PATTERNS) out = out.replace(re, "");
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([,.;:])/g, "$2")
    .replace(/\s{2,}/g, " ")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .trim();
}
