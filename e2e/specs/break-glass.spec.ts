import { test, expect } from "@playwright/test";
import { loginAs, logout, USERS } from "../helpers/auth";
import { psql, userId } from "../helpers/env";

/**
 * Break-glass access (privacy design, 2026-09-27). Dana (admin) opens
 * read-only access to Tom's content with a reason; the member page shows the
 * content view with a banner, Tom is told, and ending access puts Dana back
 * on signals. Tom is used so the member-access spec's Sarah stays untouched.
 */

const REASON = "Formal grievance raised 2026-09-20, case HR-114 (e2e)";

function endTomGrants() {
  psql(`UPDATE access_grants SET revoked_at = now() WHERE subject_id = '${userId(USERS.employee2)}' AND revoked_at IS NULL`);
}

test.beforeAll(endTomGrants);
test.afterAll(endTomGrants);

test("admin breaks glass, sees a read-only view, the person is told, and access ends", async ({ page }) => {
  const tom = userId(USERS.employee2);

  // Without a grant: signals only.
  await loginAs(page, "admin", `/team/members/${tom}`);
  await expect(page.getByText(/You're seeing signals only/).filter({ visible: true })).toBeVisible();

  // Open access.
  await page.goto("/settings/break-glass");
  await page.getByLabel("Person", { exact: true }).selectOption(tom);
  await page.getByLabel("Reason", { exact: true }).fill(REASON);
  await page.getByLabel("Access for", { exact: true }).selectOption("7");
  await page.getByRole("button", { name: "Open access" }).click();
  const card = page.locator("div.rounded-2xl", { hasText: REASON }).filter({ has: page.getByText("active", { exact: true }) });
  await expect(card.first()).toBeVisible();

  // The member page now shows the content view, read-only, with the banner.
  await card.first().getByRole("link", { name: /View Tom/ }).click();
  await expect(page).toHaveURL(new RegExp(`/team/members/${tom}$`));
  await expect(page.getByText(/Break-glass access, read-only/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(`Reason: ${REASON}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Feedback" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Private Notes/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add Goal/ })).toHaveCount(0);
  await expect(page.getByText(/You're seeing signals only/)).toHaveCount(0);

  // The view was written to the audit log.
  const views = psql(`SELECT count(*) FROM audit_log WHERE action = 'breakglass.view' AND target = '${tom}'`).trim();
  expect(Number(views)).toBeGreaterThan(0);

  // Tom is told (no hold was set), on the dashboard and in settings.
  await logout(page);
  await loginAs(page, "employee2", "/dashboard");
  await expect(page.getByText(/has read-only access to your feedback and 1:1 record/).filter({ visible: true })).toBeVisible();
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Access to your record" })).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);

  // Dana ends access; the member page goes back to signals.
  await logout(page);
  await loginAs(page, "admin", "/settings/break-glass");
  const active = page.locator("div.rounded-2xl", { hasText: REASON }).filter({ has: page.getByRole("button", { name: "End access" }) });
  await active.first().getByRole("button", { name: "End access" }).click();
  await expect(page.getByRole("button", { name: "End access" })).toHaveCount(0);
  await page.goto(`/team/members/${tom}`);
  await expect(page.getByText(/You're seeing signals only/).filter({ visible: true })).toBeVisible();
});
