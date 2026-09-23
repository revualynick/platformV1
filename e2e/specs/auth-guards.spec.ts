import { test, expect } from "@playwright/test";
import { loginAs, logout, collectErrors } from "../helpers/auth";

/**
 * Phase 1.1/1.2 — auth, route guards, sign-out, and sidebar nav per role.
 * (Real Google OAuth is stubbed out here; we exercise the session/guard layer
 * via the key-gated test-login. The OAuth click itself is covered in marketing.)
 */

const PROTECTED = ["/home", "/dashboard", "/dashboard/goals", "/team", "/settings"];

test.describe("unauthenticated guards", () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });
  for (const path of PROTECTED) {
    test(`anon ${path} → /login`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test("authed user on /login → redirected to home hub", async ({ page }) => {
  await loginAs(page, "employee");
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login$/);
});

test.describe("role guards", () => {
  test("employee cannot reach /team (redirected away)", async ({ page }) => {
    await loginAs(page, "employee");
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    expect(page.url(), "employee should not stay on /team").not.toMatch(/\/team$/);
  });

  test("employee cannot reach /settings (redirected away)", async ({ page }) => {
    await loginAs(page, "employee");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    expect(page.url(), "employee should not stay on /settings").not.toMatch(/\/settings$/);
  });

  test("manager cannot reach /settings (redirected away)", async ({ page }) => {
    await loginAs(page, "manager");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    expect(page.url(), "manager should not stay on /settings").not.toMatch(/\/settings$/);
  });

  test("super_admin can reach every area", async ({ page }) => {
    await loginAs(page, "admin");
    for (const path of ["/dashboard", "/team", "/settings"]) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(resp!.status(), `${path} status`).toBeLessThan(400);
    }
  });
});

test("sign-out clears session → protected route redirects to /login", async ({ page }) => {
  await loginAs(page, "employee");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(page.url()).toMatch(/\/dashboard/);
  await logout(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login/);
});

test.describe("sidebar navigation per role", () => {
  test("employee sidebar links route correctly", async ({ page }) => {
    await loginAs(page, "employee");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const targets = [
      { name: /my feedback|feedback/i, url: /\/dashboard\/feedback/ },
      { name: /reflections/i, url: /\/dashboard\/reflections/ },
      { name: /kudos/i, url: /\/dashboard\/kudos/ },
      { name: /goals/i, url: /\/dashboard\/goals/ },
      { name: /settings/i, url: /\/dashboard\/settings/ },
    ];
    for (const t of targets) {
      const link = page.locator("nav a, aside a").filter({ hasText: t.name }).first();
      if ((await link.count()) === 0) continue;
      await link.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page, `nav ${t.name}`).toHaveURL(t.url);
    }
  });

  test("manager sidebar links route correctly", async ({ page }) => {
    await loginAs(page, "manager", "/team");
    const targets = [
      { name: /flagged/i, url: /\/team\/flagged/ },
      { name: /leaderboard/i, url: /\/team\/leaderboard/ },
      { name: /members/i, url: /\/team\/members/ },
      { name: /org chart/i, url: /\/team\/org-chart/ },
      { name: /question/i, url: /\/team\/questions/ },
    ];
    for (const t of targets) {
      const link = page.locator("nav a, aside a").filter({ hasText: t.name }).first();
      if ((await link.count()) === 0) continue;
      await link.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page, `nav ${t.name}`).toHaveURL(t.url);
    }
  });

  test("admin sidebar links route correctly", async ({ page }) => {
    await loginAs(page, "admin", "/settings");
    const targets = [
      { name: /people/i, url: /\/settings\/people/ },
      { name: /access/i, url: /\/settings\/access/ },
      { name: /values/i, url: /\/settings\/values/ },
      { name: /escalation/i, url: /\/settings\/escalations/ },
      { name: /integration/i, url: /\/settings\/integrations/ },
    ];
    for (const t of targets) {
      const link = page.locator("nav a, aside a").filter({ hasText: t.name }).first();
      if ((await link.count()) === 0) continue;
      await link.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page, `nav ${t.name}`).toHaveURL(t.url);
    }
  });
});
