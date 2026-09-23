import { test, expect } from "@playwright/test";
import { loginAs, collectErrors, assertTopMost } from "../helpers/auth";

/**
 * Phase 8 — shared components, exercised through the pages that mount them.
 *
 *  8.1 Modal          → /settings/values "+ Add Value" (role=dialog Modal)
 *  8.2 InfoHint       → employee dashboard stat-card ⓘ affordance
 *  8.4 EngagementRing → employee dashboard ring (sr-only status ↔ score band)
 *  8.7 DismissibleCard→ employee dashboard "employee-orientation" first-run card
 *
 * FAQAccordion (8.5) is covered in marketing.spec; SendKudos/Questionnaire modals
 * (8.3) in mutations/admin-mutations.
 */

test.use({ viewport: { width: 1440, height: 900 } });

// ── 8.1 Modal ─────────────────────────────────────────────────────────────────

test("Modal: aria, focus-in, body-scroll-lock, and Escape / overlay / ✕ all close", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "admin", "/settings/values");
  await page.waitForLoadState("networkidle");

  const openBtn = page.getByRole("button", { name: /\+ add value/i });

  // ── open + a11y contract ──
  await openBtn.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-labelledby", /.+/);
  await assertTopMost(page, '[role="dialog"]');

  // Focus is moved into the panel (first focusable, or the panel itself).
  const focusInside = await dialog.evaluate(
    (el) => el.contains(document.activeElement) || el === document.activeElement,
  );
  expect(focusInside, "focus moved into the modal on open").toBe(true);

  // Body scroll is locked while open.
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  // ── Escape closes + restores body scroll ──
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 5_000 });
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");

  // ── ✕ button closes ──
  await openBtn.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /close/i }).click();
  await expect(dialog).toBeHidden({ timeout: 5_000 });

  // ── overlay click closes (click the overlay itself, not the panel) ──
  await openBtn.click();
  await expect(dialog).toBeVisible();
  // The overlay is the dialog's parent. Click at its own top-left corner (5,5) —
  // the panel is centered, so the corner is empty backdrop and the click target
  // is the overlay div itself (the Modal only closes when e.target === overlay).
  const overlay = dialog.locator("xpath=..");
  await overlay.click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden({ timeout: 5_000 });

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 8.2 InfoHint ────────────────────────────────────────────────────────────

test("InfoHint: ⓘ toggles a tooltip; aria-expanded flips; Escape + outside-click close", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "employee", "/dashboard");
  await page.waitForLoadState("networkidle");

  // Stat cards stream in under Suspense — wait for the first ⓘ affordance.
  const hint = page.getByRole("button", { name: /what is .+\?/i }).first();
  await hint.waitFor({ timeout: 15_000 });
  await hint.scrollIntoViewIfNeeded();

  await expect(hint).toHaveAttribute("aria-expanded", "false");

  // Open → tooltip visible, aria-expanded true
  await hint.click();
  await expect(hint).toHaveAttribute("aria-expanded", "true");
  const tooltip = page.locator('[role="tooltip"]');
  await expect(tooltip.first()).toBeVisible({ timeout: 3_000 });

  // Escape closes
  await page.keyboard.press("Escape");
  await expect(hint).toHaveAttribute("aria-expanded", "false");
  await expect(tooltip).toHaveCount(0, { timeout: 3_000 });

  // Reopen, then outside-click (mousedown on body) closes
  await hint.click();
  await expect(hint).toHaveAttribute("aria-expanded", "true");
  await page.mouse.click(4, 300); // empty gutter, away from the hint
  await expect(hint).toHaveAttribute("aria-expanded", "false");

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 8.4 EngagementRing ────────────────────────────────────────────────────────

test("EngagementRing: sr-only status text matches the displayed score band", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "employee", "/dashboard");
  await page.waitForLoadState("networkidle");

  // The ring's sr-only line: "<label> score <N> out of 100 — <status>".
  const srLine = page.getByText(/score \d+ out of 100 —/i).first();
  await srLine.waitFor({ timeout: 15_000 });
  const text = (await srLine.innerText()).trim();

  const scoreMatch = text.match(/score (\d+) out of 100/i);
  expect(scoreMatch, `parse score from "${text}"`).toBeTruthy();
  const score = Number(scoreMatch![1]);

  const expectedStatus =
    score >= 80 ? "healthy" : score >= 60 ? "needs attention" : "at risk";
  expect(text.toLowerCase()).toContain(expectedStatus);

  // The big number in the ring center matches the sr-only score.
  await expect(page.getByText(String(score), { exact: true }).first()).toBeVisible();

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 8.7 DismissibleCard ────────────────────────────────────────────────────────

test("DismissibleCard: dismiss persists via localStorage and survives reload; clearing the key restores it", async ({ page }) => {
  const errors = collectErrors(page);
  const STORAGE_KEY = "revualy.dismissed.employee-orientation";

  await loginAs(page, "employee", "/dashboard");
  await page.waitForLoadState("networkidle");

  // Fresh context → the first-run card is shown (localStorage empty).
  const card = page.getByRole("note", { name: /new here\? two minutes of context/i });
  await expect(card).toBeVisible({ timeout: 15_000 });

  // Dismiss → hidden immediately + localStorage key set.
  await card.getByRole("button", { name: /got it/i }).click();
  await expect(card).toBeHidden({ timeout: 5_000 });
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k) !== null, STORAGE_KEY))
    .toBe(true);

  // Survives reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800); // card mounts client-side after reading storage
  await expect(card).toBeHidden();

  // Clearing the key restores the card.
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(card).toBeVisible({ timeout: 15_000 });

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});
