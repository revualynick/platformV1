import { test, expect } from "@playwright/test";
import { loginAs, collectErrors, type Role } from "../helpers/auth";

/**
 * Navigation smoke matrix: visit every meaningful route as the appropriate
 * role and assert it renders without a server error, client exception, or
 * console error. `DataUnavailable` empty-states are NOT failures (honest UX).
 */

const ANON_ROUTES = ["/", "/about", "/features", "/pricing", "/privacy", "/terms", "/login", "/demo"];

const ROLE_ROUTES: Record<Role, string[]> = {
  employee: [
    "/home",
    "/dashboard",
    "/dashboard/engagement",
    "/dashboard/feedback",
    "/dashboard/goals",
    "/dashboard/goals/alignment",
    "/dashboard/kudos",
    "/dashboard/one-on-ones",
    "/dashboard/profile",
    "/dashboard/reflections",
    "/dashboard/settings",
  ],
  manager: [
    "/team",
    "/team/feedback",
    "/team/flagged",
    "/team/goals",
    "/team/leaderboard",
    "/team/members",
    "/team/org-chart",
    "/team/profiles",
    "/team/questions",
  ],
  admin: [
    "/settings",
    "/settings/access",
    "/settings/campaigns",
    "/settings/escalations",
    "/settings/goals",
    "/settings/integrations",
    "/settings/org-chart",
    "/settings/people",
    "/settings/questions",
    "/settings/values",
  ],
};

const ERROR_OVERLAY =
  /Unhandled Runtime Error|Application error|Internal Server Error|500 - |This page could not be found/i;

async function visitAndAssert(page: import("@playwright/test").Page, path: string) {
  const errors = collectErrors(page);
  const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(resp, `no response for ${path}`).toBeTruthy();
  const status = resp!.status();
  expect(status, `${path} returned HTTP ${status}`).toBeLessThan(500);
  // Give client components a moment to hydrate / throw.
  await page.waitForTimeout(400);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText, `${path} shows an error overlay`).not.toMatch(ERROR_OVERLAY);
  expect(errors, `${path} raised client errors:\n${errors.join("\n")}`).toHaveLength(0);
}

test.describe("anonymous / marketing", () => {
  for (const path of ANON_ROUTES) {
    test(`GET ${path}`, async ({ page }) => {
      await visitAndAssert(page, path);
    });
  }
});

for (const role of Object.keys(ROLE_ROUTES) as Role[]) {
  test.describe(`${role} routes`, () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, role);
    });
    for (const path of ROLE_ROUTES[role]) {
      test(`GET ${path}`, async ({ page }) => {
        await visitAndAssert(page, path);
      });
    }
  });
}

test.describe("dynamic routes", () => {
  test("manager can open a team member detail page", async ({ page }) => {
    // jordan.wells has the most direct reports in the seed, so /team/members
    // reliably renders member links.
    await page.goto(
      `/api/test-login?email=${encodeURIComponent("jordan.wells@acmecorp.com")}&key=${encodeURIComponent(process.env.TEST_LOGIN_KEY ?? "")}&redirect=/team/members`,
    );
    const errors = collectErrors(page);
    await page.goto("/team/members", { waitUntil: "domcontentloaded" });
    const memberLink = page.locator('a[href*="/team/members/"]').first();
    // Member cards stream in via Suspense — wait before deciding there are none.
    await memberLink.waitFor({ timeout: 8000 }).catch(() => {});
    if ((await memberLink.count()) === 0) {
      test.skip(true, "no member links rendered (no reports seeded for this manager)");
    }
    const href = await memberLink.getAttribute("href");
    expect(href, "member link should have an href").toMatch(/\/team\/members\/[0-9a-f-]+/);
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/\/team\/members\/[0-9a-f-]+/);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText).not.toMatch(ERROR_OVERLAY);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
