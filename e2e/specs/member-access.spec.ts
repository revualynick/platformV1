import { test, expect } from "@playwright/test";
import { loginAs, USERS } from "../helpers/auth";
import { userId } from "../helpers/env";

/**
 * Who sees what about a person (privacy design, 2026-09-27). Sarah reports
 * to Jordan, who reports to Alex. Jordan sees Sarah's content; Alex (skip
 * level) and Dana (admin) see signals only.
 */

const SIGNALS_NOTICE = /You're seeing signals only/;

test("direct manager sees content on the member page", async ({ page }) => {
  await loginAs(page, "manager", `/team/members/${userId(USERS.employee)}`);
  await expect(page.getByText(/Private Notes/i).first()).toBeVisible();
  await expect(page.getByText(SIGNALS_NOTICE)).toHaveCount(0);
});

test("skip-level manager sees signals only", async ({ page }) => {
  await loginAs(page, "managerNoReports", `/team/members/${userId(USERS.employee)}`);
  await expect(page.getByText(SIGNALS_NOTICE).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1:1 cadence" })).toBeVisible();
  await expect(page.getByText(/Private Notes/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/add a private note/i)).toHaveCount(0);
});

test("admin sees signals only", async ({ page }) => {
  await loginAs(page, "admin", `/team/members/${userId(USERS.employee)}`);
  await expect(page.getByText(SIGNALS_NOTICE).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/Private Notes/i)).toHaveCount(0);
});

test("a manager outside the line is sent back", async ({ page }) => {
  await loginAs(page, "manager2", `/team/members/${userId(USERS.employee)}`);
  await expect(page).toHaveURL(/\/team\/members$/);
});
