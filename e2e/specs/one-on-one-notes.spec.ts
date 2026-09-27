import { test, expect } from "@playwright/test";
import { loginAs, collectErrors } from "../helpers/auth";

/**
 * 1:1 notes screens (2026-09-26): the manager page, the employee additions
 * and the admin limits. Round-trips leave settings as they found them.
 */

/** Click Save and wait for the save to finish (the "Saved" label only lasts 2 s). */
async function saveAndWait(page: import("@playwright/test").Page) {
  const done = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/settings/one-on-ones"));
  await page.getByRole("button", { name: "Save" }).click();
  await done;
  await expect(page.getByRole("button", { name: /^Save/ })).toBeEnabled();
}

test("manager 1:1 notes page: mode, approvals, upload, goals, recent imports", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "manager", "/team/one-on-ones");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("1:1 Notes");
  for (const section of ["How your 1:1 notes come in", "Upload 1:1 notes", "Between-meeting goals", "Recent imports"]) {
    await expect(page.getByRole("heading", { name: section })).toBeVisible();
  }
  await expect(page.getByRole("radio", { name: /^Automatic/ })).toBeDisabled();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("manager can switch to manual and back to the organisation default", async ({ page }) => {
  await loginAs(page, "manager", "/team/one-on-ones");
  const manual = page.getByRole("radio", { name: /^Manual/ });
  await manual.click();
  await expect(manual).toHaveAttribute("aria-checked", "true");
  await page.getByText(/Go back to the organisation default/).click();
  await expect(page.getByText(/You're on your organisation's default/)).toBeVisible();
});

test("employee 1:1 page shows between-meeting goals and upload", async ({ page }) => {
  const errors = collectErrors(page);
  await loginAs(page, "employee", "/dashboard/one-on-ones");
  await expect(page.getByRole("heading", { name: "Between-meeting goals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload 1:1 notes" })).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("admin sets the limit; lowering it lowers the default; restore", async ({ page }) => {
  await loginAs(page, "admin", "/settings/one-on-ones");
  await expect(page.getByLabel(/Up to automatic/)).toBeDisabled();
  await page.getByLabel(/Manual only/).check();
  await expect(page.locator("select option")).toHaveText(["Manual"]);
  await saveAndWait(page);
  await page.reload();
  await expect(page.getByLabel(/Manual only/)).toBeChecked();

  await page.getByLabel(/Up to semi-automatic/).check();
  await page.locator("select").selectOption("semi_automatic");
  await saveAndWait(page);
  await page.reload();
  await expect(page.getByLabel(/Up to semi-automatic/)).toBeChecked();
});
