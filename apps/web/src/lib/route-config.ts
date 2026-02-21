/**
 * Static segment → display label map for breadcrumb navigation.
 */
const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  feedback: "Feedback",
  "one-on-ones": "1:1 Notes",
  reflections: "Reflections",
  engagement: "Engagement",
  kudos: "Kudos",
  settings: "Settings",
  team: "Team",
  members: "Members",
  flagged: "Flagged Items",
  leaderboard: "Leaderboard",
  questions: "Question Bank",
  "org-chart": "Org Chart",
  campaigns: "Campaigns",
  people: "People",
  values: "Core Values",
  integrations: "Integrations",
  escalations: "Escalations",
  "one-on-one": "1:1 Sessions",
  demo: "Demo",
};

export interface Breadcrumb {
  label: string;
  href: string;
}

/**
 * Build an ordered breadcrumb array from a pathname.
 *
 * Static segments are resolved via `segmentLabels`.
 * Dynamic segments (UUIDs, etc.) are resolved via `nameOverrides`
 * keyed by the raw segment value.
 */
export function buildBreadcrumbs(
  pathname: string,
  nameOverrides: Record<string, string> = {},
): Breadcrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Breadcrumb[] = [];
  let href = "";

  for (const segment of segments) {
    href += `/${segment}`;
    const label =
      nameOverrides[segment] ?? segmentLabels[segment] ?? segment;
    crumbs.push({ label, href });
  }

  return crumbs;
}
