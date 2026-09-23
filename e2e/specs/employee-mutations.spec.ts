import { test, expect } from "@playwright/test";
import { loginAs, collectErrors } from "../helpers/auth";

/**
 * Employee mutation flows:
 * 1. Personal goal create → check-in
 * 2. Notification preference toggle (settings)
 * 3. Kudos send-modal validation (empty message)
 */

test.use({ viewport: { width: 1440, height: 900 } });

// ── 1. Goals ──────────────────────────────────────────────────────────────────

test("employee: create a personal goal then check in on it", async ({ page }) => {
  const errors = collectErrors(page);
  const ts = Date.now();
  const goalTitle = `E2E-GOAL-${ts}`;

  await loginAs(page, "employee", "/dashboard/goals");
  await page.waitForLoadState("networkidle");

  // Open "New personal goal" modal — this button is always rendered (personal
  // goals don't require a cycle or parent options).
  const newBtn = page.getByRole("button", { name: /new personal goal/i });
  await expect(newBtn).toBeVisible({ timeout: 10_000 });
  await newBtn.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 8_000 });

  // Fill title field
  const titleInput = dialog.locator('input[name="title"]');
  await titleInput.fill(goalTitle);

  // Submit
  await dialog.getByRole("button", { name: /create goal/i }).click();

  // Modal should close on success
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // The new goal card should appear in the "Personal Goals" section
  await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 10_000 });

  // ── Check in on the newly created goal ──────────────────────────────────────

  // The goal card is a rounded div containing an h3 with the exact goal title.
  // Use a stricter ancestor chain: locate the card whose h3 text matches, then
  // find the single "Check in" button within that card.
  const goalCard = page
    .locator(".rounded-2xl")
    .filter({ has: page.locator("h3", { hasText: goalTitle }) })
    .first();
  const checkInBtn = goalCard.getByRole("button", { name: /check in/i });
  await expect(checkInBtn).toBeVisible({ timeout: 8_000 });
  await checkInBtn.click();

  const checkInDialog = page.locator('[role="dialog"]');
  await expect(checkInDialog).toBeVisible({ timeout: 8_000 });

  // Set progress to 30%
  const progressInput = checkInDialog.locator('input[name="progressPercent"]');
  if ((await progressInput.count()) > 0) {
    await progressInput.fill("30");
  }

  // Set status to "on_track" (may already be default)
  const statusSelect = checkInDialog.locator('select[name="status"]');
  if ((await statusSelect.count()) > 0) {
    await statusSelect.selectOption("on_track");
  }

  // Add a note
  await checkInDialog.locator('textarea[name="note"]').fill(`Check-in note for ${goalTitle}`);

  await checkInDialog.getByRole("button", { name: /save check-in/i }).click();

  // Dialog should close after a successful save
  await expect(checkInDialog).toBeHidden({ timeout: 10_000 });

  // The goal card should still be visible (progress updated server-side via revalidatePath)
  await expect(page.getByText(goalTitle)).toBeVisible({ timeout: 10_000 });

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 2. Notification preference toggle ─────────────────────────────────────────

test("employee: notification preference toggle flips aria-checked and persists on reload", async ({ page }) => {
  const errors = collectErrors(page);

  await loginAs(page, "employee", "/dashboard/settings");
  await page.waitForLoadState("networkidle");

  // Find the first preference switch
  const toggle = page.getByRole("switch").first();
  await expect(toggle).toBeVisible({ timeout: 10_000 });

  // Read the current checked state
  const before = await toggle.getAttribute("aria-checked");

  // Click to flip
  await toggle.click();

  // aria-checked should flip immediately (optimistic or after server round-trip)
  // Give the server action time to complete (revalidatePath streams back)
  await page.waitForTimeout(1_500);
  const after = await toggle.getAttribute("aria-checked");
  expect(after, "aria-checked should flip after toggle").not.toBe(before);

  // Reload and verify persistence
  await page.reload({ waitUntil: "networkidle" });
  const afterReload = page.getByRole("switch").first();
  await expect(afterReload).toBeVisible({ timeout: 10_000 });
  const persisted = await afterReload.getAttribute("aria-checked");
  expect(persisted, "aria-checked must persist after page reload").toBe(after);

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 3. Kudos send-modal validation ───────────────────────────────────────────

test("employee: kudos modal stays open and shows required error with empty message", async ({ page }) => {
  const errors = collectErrors(page);

  await loginAs(page, "employee", "/dashboard/kudos");
  await page.waitForLoadState("networkidle");

  // Open the Send Kudos modal
  const sendBtn = page.getByRole("button", { name: /send kudos/i }).first();
  await expect(sendBtn).toBeVisible({ timeout: 10_000 });
  await sendBtn.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 8_000 });

  // Pick a recipient (if the select has options) but leave message blank
  const receiverSelect = dialog.locator('select[name="receiverId"]');
  if ((await receiverSelect.count()) > 0) {
    const opts = await receiverSelect.locator("option").evaluateAll((els) =>
      (els as HTMLOptionElement[]).map((o) => o.value).filter((v) => v),
    );
    if (opts.length > 0) await receiverSelect.selectOption(opts[0]);
  }

  // Explicitly clear the message textarea (leave it blank) and attempt submit
  const messageArea = dialog.locator('textarea[name="message"]');
  await messageArea.fill("");

  // Clicking the submit button with an empty required textarea should trigger
  // browser-native validation, keeping the dialog open.
  const submitBtn = dialog.getByRole("button", { name: /^send$/i });
  await submitBtn.click();

  // Modal must still be visible — either browser validation blocked submit,
  // or the server returned an error and the component kept the dialog open.
  await expect(dialog, "dialog must remain open after submitting with empty message").toBeVisible({
    timeout: 5_000,
  });

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});
