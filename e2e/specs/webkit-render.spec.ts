import { test, expect } from "@playwright/test";
import { loginAs, type Role } from "../helpers/auth";

/**
 * WebKit render-only check: do authenticated pages actually RENDER under WebKit
 * (status < 500, no error overlay, real content present)? This deliberately
 * ignores console errors, to separate "page is broken" from "a client console
 * error is logged" (the NextAuth /api/auth/session ClientFetchError seen only
 * under WebKit). Run with --project=webkit.
 */
const PAGES: Array<{ role: Role; path: string; needle: RegExp }> = [
  { role: "employee", path: "/dashboard", needle: /engagement|sarah/i },
  { role: "manager", path: "/team", needle: /team|overview|engagement/i },
  { role: "admin", path: "/settings", needle: /settings|organi|people/i },
];

const OVERLAY = /Application error|Internal Server Error|Unhandled Runtime|This page could not be found/i;

for (const { role, path, needle } of PAGES) {
  test(`webkit renders ${role} ${path}`, async ({ page }) => {
    await loginAs(page, role);
    const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(resp!.status(), `${path} status`).toBeLessThan(500);
    await page.waitForTimeout(700);
    const body = await page.locator("body").innerText();
    expect(body, `${path} error overlay`).not.toMatch(OVERLAY);
    expect(body, `${path} real content`).toMatch(needle);
  });
}
