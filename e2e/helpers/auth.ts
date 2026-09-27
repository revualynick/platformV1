import type { Page } from "@playwright/test";

/**
 * Seeded users by role (from packages/db/src/seed.ts).
 * Reporting structure: dana(super_admin) → alex → {jordan, priya};
 * jordan → {sarah, david, ...}; priya → {tom, ...}.
 */
export const USERS = {
  employee: "sarah.chen@acmecorp.com", // reports to jordan
  employee2: "tom.nguyen@acmecorp.com", // reports to priya
  manager: "jordan.wells@acmecorp.com", // HAS direct reports (sarah, david...)
  manager2: "priya.sharma@acmecorp.com", // sibling manager (tom) — cross-tree tests
  managerNoReports: "alex.thompson@acmecorp.com", // top manager (jordan/priya report to him)
  admin: "dana.whitfield@acmecorp.com", // super_admin — passes every requireRole
} as const;

export type Role = keyof typeof USERS;

const KEY = process.env.TEST_LOGIN_KEY ?? "";

/** Mint a real DB session for an arbitrary seeded email and land on `redirect`. */
export async function loginAsEmail(page: Page, email: string, redirect = "/home") {
  if (!KEY) throw new Error("TEST_LOGIN_KEY not set in test env");
  const url = `/api/test-login?email=${encodeURIComponent(email)}&key=${encodeURIComponent(KEY)}&redirect=${encodeURIComponent(redirect)}`;
  await page.goto(url);
}

/** Log in as a seeded user by role. */
export async function loginAs(page: Page, role: Role, redirect = "/home") {
  await loginAsEmail(page, USERS[role], redirect);
}

/** Clear the session cookie (sign-out simulation). */
export async function logout(page: Page) {
  // Let in-flight requests finish first: a session refresh still loading
  // (/api/auth/session) sets the cookie again after it's cleared, which the
  // fast production build exposed (staging, 2026-09-27).
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.context().clearCookies();
}

/**
 * Attach console/page-error collectors to a page; returns the error array.
 * Filters benign noise (favicons, optional-asset 404s, and — on WebKit — the
 * known NextAuth /api/auth/session ClientFetchError which is a dev/test-login
 * cookie artifact, not a page bug; tracked separately).
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/favicon|Failed to load resource.*404|ClientFetchError|__nextjs_original-stack-frames|access control checks/.test(t)) return;
    errors.push(`console.error: ${t}`);
  });
  return errors;
}

const OVERLAY =
  /Application error|Internal Server Error|Unhandled Runtime|This page could not be found|500 - /i;

/** Assert a page rendered cleanly: <500, no error overlay, no collected errors. */
export async function assertClean(
  page: Page,
  errors: string[],
  resp: import("@playwright/test").Response | null,
  label: string,
) {
  const { expect } = await import("@playwright/test");
  if (resp) expect(resp.status(), `${label} HTTP`).toBeLessThan(500);
  const body = await page.locator("body").innerText().catch(() => "");
  expect(body, `${label} error overlay`).not.toMatch(OVERLAY);
  expect(errors, `${label} console/page errors:\n${errors.join("\n")}`).toHaveLength(0);
}

/** Verify a locator is genuinely the top-most element (z-order / no clipping). */
export async function assertTopMost(page: Page, selector: string) {
  const { expect } = await import("@playwright/test");
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + Math.min(r.height / 2, window.innerHeight / 2),
    );
    return el.contains(hit);
  }, selector);
  expect(ok, `${selector} is top-most`).toBe(true);
}
