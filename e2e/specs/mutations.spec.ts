import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { writeFileSync } from "node:fs";

/**
 * End-to-end mutation flows: submit real forms as a real (test-login) session
 * and assert UI success. Persistence is double-checked against the DB by
 * scripts/verify-mutations.sh, which reads the markers written here.
 */

const ts = Date.now();
const MARK = {
  kudos: `E2E-KUDOS-${ts}`,
  note: `E2E-NOTE-${ts}`,
  questionnaire: `E2E-QN-${ts}`,
};
writeFileSync(`${__dirname}/../.mutation-markers.json`, JSON.stringify(MARK, null, 2));

test.use({ viewport: { width: 1440, height: 900 } });

test("employee can send kudos (form submits)", async ({ page }) => {
  await loginAs(page, "employee");
  await page.goto("/dashboard/kudos", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /send kudos/i }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  // Pick the first real recipient.
  const receiver = dialog.locator('select[name="receiverId"]');
  const optionValues = await receiver.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => o.value).filter((v) => v),
  );
  expect(optionValues.length, "kudos recipient options").toBeGreaterThan(0);
  await receiver.selectOption(optionValues[0]);
  await dialog.locator('textarea[name="message"]').fill(MARK.kudos);
  await dialog.getByRole("button", { name: /^send$/i }).click();

  // On success the server action closes the modal.
  await expect(dialog).toBeHidden({ timeout: 8000 });
});

test("manager can add a private note (persists in list)", async ({ page }) => {
  await page.goto(
    `/api/test-login?email=${encodeURIComponent("jordan.wells@acmecorp.com")}&key=${encodeURIComponent(process.env.TEST_LOGIN_KEY ?? "")}&redirect=/team/members`,
  );
  await page.waitForLoadState("networkidle");
  const memberLink = page.locator('a[href*="/team/members/"]').first();
  await memberLink.waitFor({ timeout: 8000 });
  const href = await memberLink.getAttribute("href");
  await page.goto(href!, { waitUntil: "networkidle" });

  const textarea = page.getByPlaceholder(/add a private note/i);
  await textarea.waitFor({ timeout: 8000 });
  await textarea.fill(MARK.note);
  await page.getByRole("button", { name: /add note/i }).click();

  // Note should appear in the list.
  await expect(page.getByText(MARK.note)).toBeVisible({ timeout: 8000 });
});

test("admin can create a questionnaire (form submits)", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/settings/questions", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create questionnaire|new questionnaire/i }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(MARK.questionnaire);
  const category = dialog.locator('select[name="category"]');
  if ((await category.count()) > 0) {
    const opts = await category.locator("option").evaluateAll((o) =>
      (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean),
    );
    if (opts.length) await category.selectOption(opts[0]);
  }
  await dialog.getByRole("button", { name: /create questionnaire|^create$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 8000 });
  // New questionnaire should appear on the page.
  await expect(page.getByText(MARK.questionnaire)).toBeVisible({ timeout: 8000 });
});
