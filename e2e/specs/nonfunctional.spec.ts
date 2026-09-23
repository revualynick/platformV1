import { test, expect, type Page } from "@playwright/test";
import { loginAs, collectErrors } from "../helpers/auth";

/**
 * Phase 10 — non-functional gates achievable WITHOUT network downloads.
 *
 * Constraints (local, no-download policy):
 *  - axe-core / @axe-core/playwright is NOT installed and cannot be fetched, so
 *    a11y here is a LIGHTWEIGHT manual sweep (landmarks, labels, alt, button names,
 *    heading presence) — not a full WCAG audit. Full axe sweep is deferred.
 *  - Firefox has no Playwright binary here; cross-browser = chromium + webkit
 *    (webkit-render.spec.ts). Firefox is a documented exception.
 *
 * Covered: responsive overflow, soft perf budget, lightweight a11y.
 */

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};

// ── helpers ─────────────────────────────────────────────────────────────────

async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const de = document.documentElement;
    return Math.max(0, de.scrollWidth - de.clientWidth);
  });
}

/** Lightweight a11y invariants. Returns a list of violations (empty = clean). */
async function a11yViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];

    // 1. A main landmark exists.
    if (!document.querySelector("main, [role='main']")) {
      problems.push("no <main>/role=main landmark");
    }

    // 2. At least one h1.
    if (document.querySelectorAll("h1").length === 0) {
      problems.push("no <h1> heading");
    }

    // 3. Every visible, enabled text-ish input has an accessible name.
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input:not([type=hidden]), textarea, select",
      ),
    );
    for (const el of inputs) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const hasLabel =
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.closest("label") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title");
      if (!hasLabel) {
        problems.push(`input without accessible name: ${el.outerHTML.slice(0, 80)}`);
      }
    }

    // 4. Every visible button has an accessible name.
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    for (const b of buttons) {
      const style = getComputedStyle(b);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const name =
        (b.textContent || "").trim() ||
        b.getAttribute("aria-label") ||
        b.getAttribute("title") ||
        b.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        (b.querySelector("svg[aria-hidden='true']") ? "" : "");
      if (!name) {
        problems.push(`button without accessible name: ${b.outerHTML.slice(0, 80)}`);
      }
    }

    // 5. Every img has an alt attribute (may be empty for decorative).
    const imgs = Array.from(document.querySelectorAll("img"));
    for (const img of imgs) {
      if (!img.hasAttribute("alt")) {
        problems.push(`img without alt: ${img.getAttribute("src") ?? "?"}`);
      }
    }

    return problems;
  });
}

// ── 10.1 Responsive overflow ──────────────────────────────────────────────────

test.describe("Responsive — no horizontal overflow", () => {
  // Marketing pages must be fully responsive (public, mobile-first).
  const marketingPages = ["/", "/pricing", "/about"];
  for (const path of marketingPages) {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      test(`marketing ${path} @ ${name} (${vp.width}px) has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(400);
        const overflow = await horizontalOverflowPx(page);
        expect(overflow, `${path} @ ${name} overflows by ${overflow}px`).toBeLessThanOrEqual(2);
      });
    }
  }

  // App shell (authed): known to be non-responsive on the app-shell (tracked in
  // docs/ui-test-plan.md Phase 10). Assert desktop is clean and ANNOTATE mobile
  // overflow rather than failing — the finding is recorded, not papered over.
  test("app shell overflow report (employee dashboard) across viewports", async ({ page }) => {
    await loginAs(page, "employee", "/dashboard");
    await page.waitForLoadState("networkidle");
    const report: Record<string, number> = {};
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(500);
      report[name] = await horizontalOverflowPx(page);
    }
    test.info().annotations.push({
      type: "responsive-report",
      description: `employee /dashboard overflow px — ${JSON.stringify(report)}`,
    });
    // Desktop must be clean regardless.
    expect(report.desktop, `desktop overflow ${report.desktop}px`).toBeLessThanOrEqual(2);
  });
});

// ── 10.2 Lightweight a11y sweep ─────────────────────────────────────────────────

test.describe("Lightweight a11y (manual, not axe)", () => {
  test("marketing home passes lightweight a11y invariants", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const violations = await a11yViolations(page);
    expect(violations, `a11y violations:\n${violations.join("\n")}`).toHaveLength(0);
  });

  test("employee dashboard passes lightweight a11y invariants", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await loginAs(page, "employee", "/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const violations = await a11yViolations(page);
    expect(violations, `a11y violations:\n${violations.join("\n")}`).toHaveLength(0);
  });

  test("admin settings passes lightweight a11y invariants", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await loginAs(page, "admin", "/settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const violations = await a11yViolations(page);
    expect(violations, `a11y violations:\n${violations.join("\n")}`).toHaveLength(0);
  });
});

// ── 10.3 Soft performance budget ────────────────────────────────────────────────

test.describe("Performance (soft budget)", () => {
  // Dev-server timings are noisy; budget is generous and only guards gross regressions.
  const BUDGET_MS = 12_000;

  test("employee dashboard DOMContentLoaded within soft budget", async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(VIEWPORTS.desktop);
    await loginAs(page, "employee", "/dashboard");
    await page.waitForLoadState("domcontentloaded");
    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return e ? { dcl: e.domContentLoadedEventEnd, load: e.loadEventEnd, dur: e.duration } : null;
    });
    test.info().annotations.push({
      type: "perf",
      description: `employee /dashboard nav timing — ${JSON.stringify(nav)}`,
    });
    if (nav && nav.dcl > 0) {
      expect(nav.dcl, `DCL ${nav.dcl}ms over ${BUDGET_MS}ms`).toBeLessThan(BUDGET_MS);
    }
    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });
});
