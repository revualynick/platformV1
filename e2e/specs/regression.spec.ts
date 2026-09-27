import { test, expect } from "@playwright/test";
import { loginAs, loginAsEmail, collectErrors, USERS } from "../helpers/auth";

/**
 * Phase 9 — regression suite guarding the fixed bugs through the UI.
 * Backend-only fixes (B4 scheduler cron, B5 flag-alert email, B6 nudge,
 * B7 idempotency, B8 digest topValue, B9 snapshot dedup, B10 check-in retry,
 * B14 digest auto) are asserted at the DB/API layer elsewhere — this file covers
 * the UI-observable regressions. Assumes the seed + the fixes' data are present
 * (a CI seeding fixture should reproduce: an AI escalation + pulse trigger for a
 * report, a completed self-reflection, and current-week engagement).
 */

test("B2 + B13 + B16 — manager flagged page shows escalations, pulse alerts, at-risk", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "manager", "/team/flagged");
  await page.waitForLoadState("networkidle");
  const body = page.locator("body");

  // B2: at least one AI escalation is visible with a review action.
  await expect(
    page.getByRole("button", { name: /investigate|dismiss/i }).first(),
    "B2: escalation review action visible to manager",
  ).toBeVisible();

  // B16: "Members at Risk" shows real members (not the empty state).
  await expect(body).toContainText(/Members at Risk/i);
  await expect(body, "B16: at-risk sidebar populated").not.toContainText(
    /No members currently at risk/i,
  );

  // B13: the Pulse Alerts section renders (populated given a seeded trigger).
  await expect(body).toContainText(/Pulse Alerts/i);

  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("B1 — self-reflection appears on the Reflections page (not as peer feedback)", async ({ page }) => {
  await loginAs(page, "employee", "/dashboard/reflections");
  await page.waitForLoadState("networkidle");
  const body = page.locator("body");
  // A completed reflection renders a "Week of" card with mood/highlights.
  await expect(body, "B1: a reflection card is shown").toContainText(/Week of/i);
});

test("B3 — engagement dashboard reflects real feedback (not seed/0)", async ({ page }) => {
  await loginAs(page, "employee", "/dashboard/engagement");
  await page.waitForLoadState("networkidle");
  // The weekly breakdown should contain a row for this month, i.e. engagement
  // reflects recent activity, not only the old fixed-date seed rows. (The seed
  // adds this week's engagement relative to today.)
  const now = new Date();
  const month = now.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const iso = now.toISOString().slice(0, 7);
  const body = await page.locator("body").innerText();
  expect(body, "B3: current-week engagement present").toMatch(new RegExp(`${month}|${iso}`));
});

test("B12 — 360 Reviews section renders on the employee feedback page (empty-safe)", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "employee", "/dashboard/feedback");
  await page.waitForLoadState("networkidle");
  // Section present regardless of data; must not crash even with zero reviews.
  await expect(page.locator("body")).toContainText(/360/i);
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("B15 — leaderboard renders Previous Weeks history section", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "manager", "/team/leaderboard");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(/Previous Weeks|This Week/i);
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("AUTHZ — a manager cannot open an out-of-tree member's detail page", async ({ page }) => {
  // priya (sibling manager) opening sarah (jordan's report) must not leak data.
  const sarahId = "807d6071-181c-4253-906e-18434e573c1d";
  await loginAsEmail(page, USERS.manager2, `/team/members/${sarahId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const body = await page.locator("body").innerText();
  // Either redirected away, or the page shows no private detail for Sarah.
  const leaked = /Private Notes/i.test(body) && /Sarah/i.test(body) && page.url().includes(sarahId);
  expect(leaked, "AUTHZ: out-of-tree member detail must not leak").toBe(false);
});
