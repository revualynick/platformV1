import { test } from "@playwright/test";
import { loginAs, type Role } from "../helpers/auth";
import { mkdirSync } from "node:fs";

/**
 * Capture full-page screenshots of every route per role for visual review
 * (z-order, clipping, overflow, layout). Not assertions — artifacts to inspect.
 */

const SHOTS = "shots";
mkdirSync(`${__dirname}/../${SHOTS}`, { recursive: true });

const ANON = ["/", "/features", "/pricing", "/login", "/demo"];
const ROLE_ROUTES: Record<Role, string[]> = {
  employee: [
    "/home", "/dashboard", "/dashboard/engagement", "/dashboard/feedback",
    "/dashboard/goals", "/dashboard/kudos", "/dashboard/one-on-ones",
    "/dashboard/profile", "/dashboard/reflections", "/dashboard/settings",
  ],
  manager: [
    "/team", "/team/feedback", "/team/flagged", "/team/goals",
    "/team/leaderboard", "/team/members", "/team/org-chart", "/team/profiles",
    "/team/questions",
  ],
  admin: [
    "/settings", "/settings/access", "/settings/escalations", "/settings/goals",
    "/settings/integrations", "/settings/org-chart", "/settings/people",
    "/settings/questions", "/settings/values",
  ],
};

function slug(role: string, path: string) {
  return `${role}${path.replace(/\//g, "_") || "_root"}`;
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("screenshots", () => {
  for (const path of ANON) {
    test(`anon ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${__dirname}/../${SHOTS}/${slug("anon", path)}.png`, fullPage: true });
    });
  }
  for (const role of Object.keys(ROLE_ROUTES) as Role[]) {
    for (const path of ROLE_ROUTES[role]) {
      test(`${role} ${path}`, async ({ page }) => {
        await loginAs(page, role);
        await page.goto(path, { waitUntil: "networkidle" }).catch(() => {});
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${__dirname}/../${SHOTS}/${slug(role, path)}.png`, fullPage: true });
      });
    }
  }
});
