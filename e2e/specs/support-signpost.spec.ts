import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { psql } from "../helpers/env";

/**
 * Support signposting settings (docs/bot/concerns-playbook.md, 2026-09-27).
 * Dana (admin) sets who the bot points people to. The settings are restored
 * afterwards. (The counts and the live signpost are covered by the API
 * integration tests.)
 */

const CONTACT = "Jo Patel in the People Team (e2e)";
let saved = "";

test.beforeAll(() => {
  saved = psql("SELECT support_contact || '|' || support_details || '|' || support_outside FROM org_settings LIMIT 1").trim();
});

test.afterAll(() => {
  // Saved as "contact|details|outside"; a value containing "|" would not round-trip (staging has none).
  const [contact = "", details = "", outside = ""] = saved.split("|");
  const text = (v: string) => `'${v.replace(/'/g, "''")}'`;
  psql(`UPDATE org_settings SET support_contact = ${text(contact)}, support_details = ${text(details)}, support_outside = ${text(outside)}`);
});

test("admin sets who the bot points people to", async ({ page }) => {
  await loginAs(page, "admin", "/settings/support");
  await page.getByLabel("Who to reach out to", { exact: true }).fill(CONTACT);
  await page.getByLabel("Where to get support", { exact: true }).fill("Our EAP is free and confidential on 0800 111 222.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText(/No one is set to reach out to/)).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Who to reach out to", { exact: true })).toHaveValue(CONTACT);
  expect(psql("SELECT support_contact FROM org_settings LIMIT 1").trim()).toBe(CONTACT);
});
