import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { psql } from "../helpers/env";

/**
 * Support signposting settings (docs/bot/concerns-playbook.md, 2026-09-27).
 * Dana (admin) sets who the bot points people to, sees what people will be
 * sent, and records the HR team's sign-off; changing the wording makes the
 * sign-off stale. The settings are restored afterwards. (The live signpost
 * and the counts are covered by the API integration tests.)
 */

const CONTACT = "Jo Patel in the People Team (e2e)";
const FIELDS = ["support_contact", "support_details", "support_outside", "support_wording", "support_wording_signoff"] as const;
const saved: Record<string, string> = {};

test.beforeAll(() => {
  // One field per query, as SQL literals, so nothing needs splitting.
  for (const f of FIELDS) saved[f] = psql(`SELECT quote_nullable(${f}::text) FROM org_settings LIMIT 1`).trim() || "NULL";
});

test.afterAll(() => {
  const cast = (f: string) => (f.startsWith("support_wording") ? "::jsonb" : "");
  psql(`UPDATE org_settings SET ${FIELDS.map((f) => `${f} = ${saved[f]}${cast(f)}`).join(", ")}`);
});

test("admin sets the signpost, sees the wording, and records the HR team's sign-off", async ({ page }) => {
  psql("UPDATE org_settings SET support_wording = '{}'::jsonb, support_wording_signoff = NULL");
  await loginAs(page, "admin", "/settings/support");
  await page.getByLabel("Who to reach out to", { exact: true }).fill(CONTACT);
  await page.getByLabel("Where to get support", { exact: true }).fill("Our EAP is free and confidential on 0800 111 222.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await expect(page.getByText(/No one is set to reach out to/)).toHaveCount(0);

  // What people will see, with the contact filled in; not signed off yet.
  await expect(page.getByText(`${CONTACT} is better placed to support you`).first()).toBeVisible();
  await expect(page.getByText(/Not signed off yet/)).toBeVisible();

  await page.getByLabel("Signed off by", { exact: true }).fill("Priya Shah");
  await page.getByLabel("Their role", { exact: true }).fill("Head of People");
  await page.getByRole("button", { name: "Record sign-off" }).click();
  await expect(page.getByText(/Signed off by Priya Shah \(Head of People\)/)).toBeVisible();

  // Changing the wording makes the sign-off stale.
  await page.getByLabel("When someone may be struggling or at risk", { exact: true }).fill("Please speak to {contact}. {details} {outside}");
  await page.getByRole("button", { name: "Save wording" }).click();
  await expect(page.getByText(/Changed since Priya Shah \(Head of People\) signed it off/)).toBeVisible();
  await expect(page.getByText(`Please speak to ${CONTACT}.`).first()).toBeVisible();
});
