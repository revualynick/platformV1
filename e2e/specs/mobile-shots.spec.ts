import { test, expect } from "@playwright/test";
import { loginAs, type Role } from "../helpers/auth";
import { mkdirSync } from "node:fs";

/**
 * Mobile viewport pass (iPhone-ish 390x844). Captures a representative set of
 * routes per role for responsive review, and flags horizontal overflow
 * (content wider than the viewport = layout break).
 */

const SHOTS = `${__dirname}/../shots-mobile`;
mkdirSync(SHOTS, { recursive: true });

const ROUTES: Array<{ role: Role | "anon"; path: string }> = [
  { role: "anon", path: "/" },
  { role: "anon", path: "/login" },
  { role: "employee", path: "/dashboard" },
  { role: "employee", path: "/dashboard/kudos" },
  { role: "employee", path: "/dashboard/goals" },
  { role: "employee", path: "/dashboard/profile" },
  { role: "manager", path: "/team" },
  { role: "manager", path: "/team/members" },
  { role: "manager", path: "/team/org-chart" },
  { role: "manager", path: "/team/leaderboard" },
  { role: "admin", path: "/settings" },
  { role: "admin", path: "/settings/people" },
  { role: "admin", path: "/settings/escalations" },
];

test.use({ viewport: { width: 390, height: 844 } });

for (const { role, path } of ROUTES) {
  test(`mobile ${role} ${path}`, async ({ page }) => {
    if (role !== "anon") await loginAs(page, role);
    await page.goto(path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(600);
    const name = `${role}${path.replace(/\//g, "_") || "_root"}`;
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

    // Horizontal overflow check: scrollWidth should not exceed the viewport by
    // more than a small tolerance (scrollbars / rounding).
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, `${path} horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
  });
}
