/**
 * Shared style lookup constants used across multiple pages.
 * Each maps a domain value (sentiment, severity, status, etc.) to Tailwind class strings.
 */

/* ------------------------------------------------------------------ */
/*  Sentiment                                                          */
/* ------------------------------------------------------------------ */

/**
 * Rich sentiment styles with separate bg, text, and label fields.
 * Used on feedback list pages (employee + manager).
 */
export const sentimentColors: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  positive: { bg: "bg-positive/10", text: "text-positive", label: "Positive" },
  neutral: { bg: "bg-amber/10", text: "text-warning", label: "Neutral" },
  negative: { bg: "bg-danger/10", text: "text-danger", label: "Negative" },
  mixed: { bg: "bg-stone-100", text: "text-stone-600", label: "Mixed" },
};

/**
 * Compact sentiment styles (bg + text only, no label).
 * Used on member detail pages where sentiment badges are smaller.
 */
export const sentimentStyles: Record<string, { bg: string; text: string }> = {
  positive: { bg: "bg-forest/10", text: "text-forest" },
  neutral: { bg: "bg-stone-100", text: "text-stone-600" },
  negative: { bg: "bg-danger/10", text: "text-danger" },
};

/**
 * Flat sentiment class strings (single combined string per sentiment).
 * Used where a single className is applied directly.
 */
export const sentimentColorFlat: Record<string, string> = {
  positive: "bg-positive/10 text-positive",
  neutral: "bg-amber/10 text-warning",
  negative: "bg-danger/10 text-danger",
  mixed: "bg-stone-100 text-stone-600",
};

/* ------------------------------------------------------------------ */
/*  Severity                                                           */
/* ------------------------------------------------------------------ */

/**
 * Escalation severity styles — superset with bg, text, border, dot, and label.
 * Files that only need a subset simply ignore the extra fields.
 */
export const severityStyles: Record<
  string,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  coaching: {
    bg: "bg-amber/10",
    text: "text-warning",
    border: "border-amber/20",
    dot: "bg-warning",
    label: "Coaching",
  },
  warning: {
    bg: "bg-terracotta/10",
    text: "text-terracotta",
    border: "border-terracotta/20",
    dot: "bg-terracotta",
    label: "Warning",
  },
  critical: {
    bg: "bg-danger/10",
    text: "text-danger",
    border: "border-danger/20",
    dot: "bg-danger",
    label: "Critical",
  },
};

/* ------------------------------------------------------------------ */
/*  Status (domain-specific variants)                                  */
/* ------------------------------------------------------------------ */

/** 1:1 session status (active / scheduled / completed). */
export const sessionStatusStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  active: { bg: "bg-positive/10", text: "text-positive", label: "Live" },
  scheduled: { bg: "bg-sky-50", text: "text-sky-600", label: "Scheduled" },
  completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Completed" },
};

/** Employee dashboard session status — same keys, different labels. */
export const dashboardSessionStatusStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  active: { bg: "bg-positive/10", text: "text-positive", label: "Live Now" },
  scheduled: { bg: "bg-sky-50", text: "text-sky-600", label: "Upcoming" },
  completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Completed" },
};

/** Integration connection status (connected / disconnected). */
export const integrationStatusStyles: Record<
  string,
  { text: string; label: string; dot: string }
> = {
  connected: { text: "text-positive", label: "Connected", dot: "bg-positive" },
  disconnected: {
    text: "text-stone-400",
    label: "Not connected",
    dot: "bg-stone-300",
  },
};

/** Escalation resolution status (open / resolved). */
export const escalationStatusStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  open: { bg: "bg-terracotta/10", text: "text-terracotta", label: "Open" },
  resolved: { bg: "bg-positive/10", text: "text-positive", label: "Resolved" },
};

/** Engagement week status (complete / partial). */
export const engagementStatusStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  complete: { bg: "bg-positive/10", text: "text-positive", label: "Complete" },
  partial: { bg: "bg-amber/10", text: "text-warning", label: "Partial" },
};

/** Campaign lifecycle status. */
export const campaignStatusStyles: Record<
  string,
  { bg: string; text: string; label: string; dot: string }
> = {
  draft: {
    bg: "bg-stone-100",
    text: "text-stone-500",
    label: "Draft",
    dot: "bg-stone-400",
  },
  scheduled: {
    bg: "bg-sky-50",
    text: "text-sky-600",
    label: "Scheduled",
    dot: "bg-sky-500",
  },
  collecting: {
    bg: "bg-forest/10",
    text: "text-forest",
    label: "Collecting",
    dot: "bg-forest",
  },
  analyzing: {
    bg: "bg-amber/10",
    text: "text-warning",
    label: "Analyzing",
    dot: "bg-warning",
  },
  complete: {
    bg: "bg-positive/10",
    text: "text-positive",
    label: "Complete",
    dot: "bg-positive",
  },
};

/* ------------------------------------------------------------------ */
/*  Trend                                                              */
/* ------------------------------------------------------------------ */

/** Trend direction icons + colors. */
export const trendIcons: Record<string, { icon: string; color: string }> = {
  up: { icon: "\u25B2", color: "text-positive" },
  stable: { icon: "\u2014", color: "text-stone-400" },
  down: { icon: "\u25BC", color: "text-danger" },
};

/* ------------------------------------------------------------------ */
/*  Platform                                                           */
/* ------------------------------------------------------------------ */

/** Chat / calendar platform emoji icons. */
export const platformIcons: Record<string, string> = {
  slack: "\uD83D\uDCAC",     // 💬
  google_chat: "\uD83D\uDFE2", // 🟢
  teams: "\uD83D\uDFE3",     // 🟣
  google_calendar: "\uD83D\uDCC5", // 📅
};
