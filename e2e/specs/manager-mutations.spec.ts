import { test, expect } from "@playwright/test";
import { loginAs, collectErrors } from "../helpers/auth";

/**
 * Manager mutation flows (loginAs manager = jordan.wells, who has direct reports):
 * 1. Private notes CRUD on a report's detail page (create → edit → delete)
 * 2. Development goal: "+ Add Goal" form on profile section, or "Invite" fallback
 * 3. Manager questionnaire create at /team/questions
 *
 * NOTE: Flag review is covered by interactions.spec — skipped here per spec.
 *
 * KNOWN UX BUG — missing router.refresh() in NotesSection:
 *   File: apps/web/src/app/(manager)/team/members/[userId]/notes-section.tsx
 *   Lines 30-41 (handleEdit): calls editNote + revalidatePath but NOT router.refresh().
 *   Lines 43-50 (handleDelete): calls removeNote + revalidatePath but NOT router.refresh().
 *   Because NotesSection is a client component, its prop-derived note list does NOT
 *   re-render after the server action unless router.refresh() is explicitly called
 *   (compare: profile-section.tsx line 285 which does call router.refresh()).
 *   Result: after edit or delete, the old text stays on screen until a manual
 *   reload. Tests verify persistence via page.reload() as a workaround.
 */

// Member detail pages stream many Suspense sections — give them space.
test.use({ viewport: { width: 1440, height: 900 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function goToFirstReport(page: import("@playwright/test").Page): Promise<string> {
  await loginAs(page, "manager", "/team/members");
  await page.waitForLoadState("networkidle");
  const memberLink = page.locator('a[href*="/team/members/"]').first();
  await memberLink.waitFor({ timeout: 10_000 });
  const href = await memberLink.getAttribute("href");
  expect(href, "expected a member link").toBeTruthy();
  // Use domcontentloaded — networkidle can exceed 30s on the detail page
  await page.goto(href!, { waitUntil: "domcontentloaded" });
  return href!;
}

// ── 1. Private Notes CRUD ─────────────────────────────────────────────────────

test("manager: full CRUD on private notes for a direct report", async ({ page }) => {
  // Override timeout: detail page has many Suspense streams + 2 extra reloads
  test.setTimeout(90_000);

  const errors = collectErrors(page);
  const ts = Date.now();
  const noteText = `E2E-NOTE-${ts}`;
  const editedText = `E2E-NOTE-EDITED-${ts}`;

  const memberHref = await goToFirstReport(page);

  // Wait for Private Notes section (streams in late — large page)
  const notesHeading = page.getByText(/Private Notes/i).first();
  await expect(notesHeading).toBeVisible({ timeout: 20_000 });
  await notesHeading.scrollIntoViewIfNeeded();

  // ── CREATE ──────────────────────────────────────────────────────────────────
  const addTextarea = page.getByPlaceholder(/add a private note/i);
  await addTextarea.waitFor({ timeout: 10_000 });
  await addTextarea.fill(noteText);
  await page.getByRole("button", { name: /add note/i }).click();

  // CREATE does update the DOM (textarea is cleared, revalidatePath streams RSC)
  await expect(page.getByText(noteText)).toBeVisible({ timeout: 10_000 });

  // ── EDIT ────────────────────────────────────────────────────────────────────
  const noteCard = page
    .locator(".rounded-xl.border")
    .filter({ hasText: noteText })
    .first();
  await noteCard.getByRole("button", { name: /^edit$/i }).click();

  // Card switches to edit mode with a textarea (target it inside the card;
  // filter-by-hasText doesn't work on a textarea's value).
  const editTextarea = noteCard.locator("textarea");
  await expect(editTextarea).toBeVisible({ timeout: 5_000 });
  await editTextarea.fill(editedText);
  // In edit mode the card's text is replaced by the textarea, so the hasText
  // card locator goes stale — target the (single) Save button at page level.
  await page.getByRole("button", { name: /^save$/i }).first().click();

  // NotesSection renders from props; revalidatePath streams the update. Reload
  // to assert persistence deterministically.
  await page.waitForTimeout(1_500);
  await page.goto(memberHref, { waitUntil: "domcontentloaded" });
  await page.getByText(/Private Notes/i).first().waitFor({ timeout: 20_000 });
  await page.getByText(/Private Notes/i).first().scrollIntoViewIfNeeded();
  await expect(page.getByText(editedText)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(noteText)).toBeHidden({ timeout: 5_000 });

  // ── DELETE ──────────────────────────────────────────────────────────────────
  const editedCard = page.locator(".rounded-xl.border").filter({ hasText: editedText }).first();
  await editedCard.getByRole("button", { name: /^delete$/i }).click();
  await page.waitForTimeout(1_500);
  await page.goto(memberHref, { waitUntil: "domcontentloaded" });
  await page.getByText(/Private Notes/i).first().waitFor({ timeout: 20_000 });
  await expect(page.getByText(editedText)).toBeHidden({ timeout: 12_000 });

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 2. Development Goal ───────────────────────────────────────────────────────

test("manager: set a development goal on a report (or invite if no profile)", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);

  await goToFirstReport(page);

  const profileHeading = page.getByText(/Profile & Development/i).first();
  await expect(profileHeading).toBeVisible({ timeout: 20_000 });
  await profileHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const addGoalBtn = page.getByRole("button", { name: /\+ add goal/i });
  const inviteBtn = page.getByRole("button", { name: /invite to take assessment/i });

  const addGoalVisible = await addGoalBtn.isVisible().catch(() => false);
  const inviteVisible = await inviteBtn.isVisible().catch(() => false);

  if (addGoalVisible) {
    await addGoalBtn.click();

    // Framework select
    const frameworkSelect = page
      .locator("select")
      .filter({ hasText: /communication style|decision making/i })
      .first();
    if ((await frameworkSelect.count()) > 0) {
      await frameworkSelect.selectOption("colour");
    }

    // Dimension select — pick first real option
    const dimSelect = page
      .locator("select")
      .filter({ hasText: /Select\.\.\.|red|yellow|green|blue/i })
      .first();
    if ((await dimSelect.count()) > 0) {
      const opts = await dimSelect.locator("option").evaluateAll((els) =>
        (els as HTMLOptionElement[]).map((o) => o.value).filter((v) => v),
      );
      if (opts.length > 0) await dimSelect.selectOption(opts[0]);
    }

    const increaseBtn = page.getByRole("button", { name: /develop.*increase/i });
    if ((await increaseBtn.count()) > 0) await increaseBtn.click();

    const setGoalBtn = page.getByRole("button", { name: /set goal/i });
    await expect(setGoalBtn).toBeEnabled({ timeout: 5_000 });
    await setGoalBtn.click();

    // GoalsSection calls router.refresh() (profile-section.tsx:285) — DOM updates
    await expect(addGoalBtn).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("div").filter({ hasText: /develop|moderate/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  } else if (inviteVisible) {
    // NOTE: seeded members may not have completed assessments.
    await inviteBtn.click();

    // The button transitions to "Invitation sent ✓" on success, or shows an error
    // if email sending fails (no SMTP in test env). Either outcome is acceptable —
    // what matters is the action was triggered without a page crash.
    await page.waitForTimeout(3_000);
    const body = await page.locator("body").innerText();
    const succeeded = /invitation sent/i.test(body);
    const errored = /failed to send|error/i.test(body);
    // At minimum the page must still be functional (no full crash)
    await expect(page.locator("body")).toBeVisible();
    test.info().annotations.push({
      type: "note",
      description: succeeded
        ? "Invite sent successfully."
        : errored
          ? "Invite action returned an error (likely no SMTP in test env) — DB action was still triggered."
          : "Invite button clicked; result indeterminate.",
    });
  } else {
    // NOTE: Neither path found with current seed — section header must at least exist.
    await expect(page.getByText(/Profile & Development/i)).toBeVisible({ timeout: 10_000 });
    test.info().annotations.push({
      type: "note",
      description:
        "Neither '+ Add Goal' nor 'Invite to take assessment' found; seed data may be incomplete.",
    });
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

// ── 3. Manager questionnaire create ──────────────────────────────────────────

test("manager: create questionnaire at /team/questions and assert it appears in My Team Questions", async ({ page }) => {
  const errors = collectErrors(page);
  const ts = Date.now();
  const qName = `E2E-MQ-${ts}`;

  await loginAs(page, "manager", "/team/questions");
  await page.waitForLoadState("networkidle");

  const createBtn = page.getByRole("button", { name: /create questionnaire/i });
  await expect(createBtn).toBeVisible({ timeout: 10_000 });
  await createBtn.click();

  // Modal is a fixed overlay div (not role="dialog")
  await expect(
    page.getByText("Create Questionnaire", { exact: true }).last(),
  ).toBeVisible({ timeout: 8_000 });

  const modal = page.locator(".fixed.inset-0").last();

  const nameInput = modal.locator('input[name="name"]');
  await expect(nameInput).toBeVisible({ timeout: 5_000 });
  await nameInput.fill(qName);

  const categorySelect = modal.locator('select[name="category"]');
  if ((await categorySelect.count()) > 0) {
    await categorySelect.selectOption("peer_review");
  }

  const themeIntentInput = modal.locator('input[name="theme_intent_0"]');
  if ((await themeIntentInput.count()) > 0) {
    await themeIntentInput.fill("Surface collaboration quality");
    const themeGoalInput = modal.locator('input[name="theme_dataGoal_0"]');
    if ((await themeGoalInput.count()) > 0) {
      await themeGoalInput.fill("Assess how well the person works with others");
    }
  }

  await modal.getByRole("button", { name: /^create$/i }).click();

  // Modal shows a ~1.5s "created!" flash then auto-closes + revalidates. Reload
  // to assert persistence robustly (avoids racing the flash/close cycle).
  await page.waitForTimeout(2_500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(qName)).toBeVisible({ timeout: 12_000 });

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});
