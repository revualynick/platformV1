import { test, expect } from "@playwright/test";
import { loginAsEmail, collectErrors, USERS } from "../helpers/auth";
import { psql } from "../helpers/env";

/**
 * Onboarding wizard E2E — covers the 3-step wizard at /onboarding.
 *
 * Test user: tom.nguyen@acmecorp.com (employee, reports to priya).
 * Dedicated so we can safely flip onboarding_completed without affecting
 * other suites that use sarah.chen (the default "employee" role fixture).
 *
 * Label note: the wizard's <label> elements have no htmlFor/id associations,
 * so getByLabel() doesn't work. We use structural selectors instead:
 *   - Name input  → input[type="text"]  (only text input on step 1)
 *   - Timezone    → select              (only select on step 1)
 *
 * Hydration note: server actions triggered via startTransition can be dropped
 * if clicked before React finishes hydrating. We guard every step-advance with
 * waitForLoadState("networkidle") + waitForTimeout(300) before clicking, then
 * wait for the next step's heading to confirm navigation succeeded.
 */

const TOM = USERS.employee2; // tom.nguyen@acmecorp.com

// ─── DB helpers ──────────────────────────────────────────────────────────────


function resetTomToUnboarded() {
  psql(`UPDATE users SET onboarding_completed=false WHERE email='${TOM}';`);
  // auth_user row is created lazily by test-login — only update if it exists.
  psql(`UPDATE auth_user SET onboarding_completed=false WHERE email='${TOM}';`);
}

function resetTomToBoarded() {
  psql(`UPDATE users SET onboarding_completed=true WHERE email='${TOM}';`);
  psql(`UPDATE auth_user SET onboarding_completed=true WHERE email='${TOM}';`);
}

// ─── Shared setup ────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Navigate tom to /onboarding with onboarding_completed=false.
 *
 * The key-gated test-login syncs auth_user from the users table at login time,
 * so we must flip users.onboarding_completed BEFORE calling loginAsEmail.
 * If despite that we land on /dashboard (edge-case: auth_user already existed
 * with completed=true), we flip auth_user and reload.
 */
async function landOnOnboarding(page: import("@playwright/test").Page) {
  resetTomToUnboarded();
  await loginAsEmail(page, TOM, "/onboarding");

  // Guard: if test-login redirected to /dashboard because auth_user was
  // already completed, flip it and navigate back.
  if (page.url().includes("/dashboard")) {
    psql(`UPDATE auth_user SET onboarding_completed=false WHERE email='${TOM}';`);
    await page.goto("/onboarding");
  }

  await page.waitForLoadState("networkidle");
}

// ─── Selectors ───────────────────────────────────────────────────────────────

/** Only text input on step 1 — the Name field. */
const nameInput = (page: import("@playwright/test").Page) =>
  page.locator('input[type="text"]');

/** Only select on step 1 — the Timezone dropdown. */
const tzSelect = (page: import("@playwright/test").Page) =>
  page.locator("select");

const continueBtn = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /Continue/i });

const backBtn = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /Back/i });

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe("Onboarding wizard", () => {
  test.beforeEach(async () => {
    resetTomToUnboarded();
  });

  test.afterAll(() => {
    resetTomToBoarded();
  });

  // ── Step 1 — Profile ─────────────────────────────────────────────────────

  test("Step 1: Continue disabled when name is cleared", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);

    await expect(
      page.getByRole("heading", { name: /Welcome to Revualy/i }),
    ).toBeVisible({ timeout: 10_000 });

    const name = nameInput(page);
    const btn = continueBtn(page);

    // Name should be pre-filled — button enabled
    await expect(name).toBeVisible({ timeout: 5_000 });
    await expect(btn).not.toBeDisabled({ timeout: 5_000 });

    // Clear the name — button must become disabled
    await name.fill("");
    await expect(btn).toBeDisabled({ timeout: 3_000 });

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("Step 1: can edit name and select a different timezone", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);

    await expect(
      page.getByRole("heading", { name: /Welcome to Revualy/i }),
    ).toBeVisible({ timeout: 10_000 });

    const name = nameInput(page);
    await name.fill("Tom E2E");
    await expect(name).toHaveValue("Tom E2E");

    const tz = tzSelect(page);
    await tz.selectOption("America/Los_Angeles");
    await expect(tz).toHaveValue("America/Los_Angeles");

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("Step 1: Continue advances to Step 2", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);

    await expect(
      page.getByRole("heading", { name: /Welcome to Revualy/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Ensure name is non-empty
    const name = nameInput(page);
    const current = await name.inputValue();
    if (!current.trim()) await name.fill("Tom Nguyen");

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await continueBtn(page).click();

    await expect(
      page.getByRole("heading", { name: /Notification Preferences/i }),
    ).toBeVisible({ timeout: 15_000 });

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  // ── Step 2 — Notifications ───────────────────────────────────────────────

  test("Step 2: toggles have role=switch and aria-checked; toggling one flips it", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);
    await advanceThroughStep1(page);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // All three toggles should be present with aria-checked="true" (defaults on)
    const switches = page.getByRole("switch");
    await expect(switches).toHaveCount(3, { timeout: 5_000 });

    for (let i = 0; i < 3; i++) {
      await expect(switches.nth(i)).toHaveAttribute("aria-checked", "true");
    }

    // Toggle the first one off
    const first = switches.first();
    await first.click();
    await expect(first).toHaveAttribute("aria-checked", "false", { timeout: 3_000 });

    // Toggle it back on
    await first.click();
    await expect(first).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("Step 2: Back returns to Step 1 preserving name", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);

    // Set a distinctive name before advancing
    const name = nameInput(page);
    await name.fill("Tom Preserved");

    await advanceThroughStep1(page);

    // Go back
    await backBtn(page).click();

    await expect(
      page.getByRole("heading", { name: /Welcome to Revualy/i }),
    ).toBeVisible({ timeout: 8_000 });

    // React state should preserve the name across step renders
    await expect(nameInput(page)).toHaveValue("Tom Preserved");

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("Step 2: Continue advances to Step 3", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);
    await advanceThroughStep1(page);

    // Toggle one off to exercise saveNotificationPrefs with a real change
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await page.getByRole("switch").nth(2).click();
    await expect(page.getByRole("switch").nth(2)).toHaveAttribute(
      "aria-checked",
      "false",
      { timeout: 3_000 },
    );

    await continueBtn(page).click();

    await expect(
      page.getByRole("heading", { name: /Connect Your Calendar/i }),
    ).toBeVisible({ timeout: 15_000 });

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  // ── Step 3 — Connect ─────────────────────────────────────────────────────

  test("Step 3: 'Connect in Settings' link points to /dashboard/settings", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);
    await advanceThroughStep1(page);
    await advanceThroughStep2(page);

    await expect(
      page.getByRole("heading", { name: /Connect Your Calendar/i }),
    ).toBeVisible({ timeout: 15_000 });

    const settingsLink = page.getByRole("link", { name: /Connect in Settings/i });
    await expect(settingsLink).toBeVisible({ timeout: 5_000 });
    await expect(settingsLink).toHaveAttribute("href", "/dashboard/settings");

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("Step 3: Back returns to Step 2", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);
    await advanceThroughStep1(page);
    await advanceThroughStep2(page);

    await expect(
      page.getByRole("heading", { name: /Connect Your Calendar/i }),
    ).toBeVisible({ timeout: 15_000 });

    await backBtn(page).click();

    await expect(
      page.getByRole("heading", { name: /Notification Preferences/i }),
    ).toBeVisible({ timeout: 8_000 });

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  // ── Full happy path ───────────────────────────────────────────────────────

  test("Full happy path: complete all 3 steps → lands on /dashboard and marks onboarding complete in DB", async ({ page }) => {
    const errors = collectErrors(page);

    await landOnOnboarding(page);

    // ── Step 1 ──
    await expect(
      page.getByRole("heading", { name: /Welcome to Revualy/i }),
    ).toBeVisible({ timeout: 10_000 });

    const name = nameInput(page);
    const current = await name.inputValue();
    if (!current.trim()) await name.fill("Tom Nguyen");

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await continueBtn(page).click();

    await expect(
      page.getByRole("heading", { name: /Notification Preferences/i }),
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 2 ──
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await continueBtn(page).click();

    await expect(
      page.getByRole("heading", { name: /Connect Your Calendar/i }),
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 3 ──
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Get Started/i }).click();

    // finishOnboarding() server-redirect → /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // Verify DB persistence
    const result = psql(`SELECT onboarding_completed FROM users WHERE email='${TOM}';`);
    expect(result, "users.onboarding_completed must be true after wizard").toBe("t");

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });
});

// ─── Shared step helpers ──────────────────────────────────────────────────────

/**
 * From step 1 (Welcome), fill name if empty, wait for hydration, click
 * Continue, then wait for the Step 2 heading.
 *
 * Call AFTER landOnOnboarding() has confirmed step 1 is visible.
 */
async function advanceThroughStep1(page: import("@playwright/test").Page) {
  // Called after landOnOnboarding; heading may already be confirmed by caller.
  // We just ensure the input is ready before proceeding.
  const name = page.locator('input[type="text"]');
  await expect(name).toBeVisible({ timeout: 8_000 });

  const current = await name.inputValue();
  if (!current.trim()) await name.fill("Tom Nguyen");

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Continue/i }).click();

  await expect(
    page.getByRole("heading", { name: /Notification Preferences/i }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * From step 2 (Notifications), wait for hydration and click Continue,
 * then wait for the Step 3 heading.
 */
async function advanceThroughStep2(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Continue/i }).click();

  await expect(
    page.getByRole("heading", { name: /Connect Your Calendar/i }),
  ).toBeVisible({ timeout: 15_000 });
}
