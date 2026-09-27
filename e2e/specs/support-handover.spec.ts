import { test, expect } from "@playwright/test";
import { loginAs, logout, USERS } from "../helpers/auth";
import { psql, userId } from "../helpers/env";

/**
 * Support handover (docs/bot/concerns-playbook.md, 2026-09-27). Dana (admin)
 * makes Jordan the support contact; a request from Sarah (as if she said
 * yes in a check-in) appears in Jordan's queue with her name only; Jordan
 * takes it on and closes it. Sarah, not a contact, can't open the queue.
 * The settings are restored afterwards.
 */

const DETAILS = "Our EAP is free and confidential on 0800 111 222 (e2e).";
let saved = "";

test.beforeAll(() => {
  saved = psql(
    "SELECT coalesce(support_contact_id::text,'') || '|' || coalesce(support_backup_id::text,'') || '|' || support_details || '|' || support_outside FROM org_settings LIMIT 1",
  ).trim();
  psql(`DELETE FROM support_requests WHERE user_id = '${userId(USERS.employee)}'`);
});

test.afterAll(() => {
  // Saved as "contact|backup|details|outside"; details containing "|" would not round-trip (staging has none).
  const [contact, backup, details = "", outside = ""] = saved.split("|");
  const id = (v: string | undefined) => (v ? `'${v}'` : "NULL");
  const text = (v: string) => `'${v.replace(/'/g, "''")}'`;
  psql(
    `UPDATE org_settings SET support_contact_id = ${id(contact)}, support_backup_id = ${id(backup)}, support_details = ${text(details)}, support_outside = ${text(outside)}`,
  );
  psql(`DELETE FROM support_requests WHERE user_id = '${userId(USERS.employee)}'`);
});

test("admin sets the support contact; the contact works a request; others can't see the queue", async ({ page }) => {
  const jordan = userId(USERS.manager);
  const sarah = userId(USERS.employee);

  await loginAs(page, "admin", "/settings/support");
  await page.getByLabel("Support contact", { exact: true }).selectOption(jordan);
  await page.getByLabel("Backup", { exact: true }).selectOption("");
  await page.getByLabel("Where to get support", { exact: true }).fill(DETAILS);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText(/No active support contact is set/)).toHaveCount(0);

  // Sarah said yes in a check-in (the chat side isn't live yet, so the row is made directly).
  psql(`INSERT INTO support_requests (user_id, urgency, due_at) VALUES ('${sarah}', 'today', now() + interval '8 hours')`);

  await logout(page);
  await loginAs(page, "manager", "/dashboard");
  await page.getByRole("link", { name: "Support requests" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/support$/);
  const card = page.locator("div.rounded-2xl", { hasText: "Sarah Chen" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("today", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "I'm on it" }).click();
  await expect(card.getByText("in hand")).toBeVisible();
  await card.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Nothing waiting.")).toBeVisible();

  const views = psql(`SELECT count(*) FROM audit_log WHERE action = 'support.view_queue' AND actor_id = '${jordan}'`).trim();
  expect(Number(views)).toBeGreaterThan(0);

  await logout(page);
  await loginAs(page, "employee", "/dashboard/support");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Support requests" })).toHaveCount(0);
});
