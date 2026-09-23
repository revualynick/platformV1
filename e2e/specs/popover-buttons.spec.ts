import { test, expect } from "@playwright/test";
import { loginAs, type Role } from "../helpers/auth";

test.use({ viewport: { width: 1440, height: 900 } });

test("InfoHint glossary popover opens on top", async ({ page }) => {
  await loginAs(page, "employee");
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  const hint = page.getByRole("button", { name: /what is|more information/i }).first();
  expect(await hint.count(), "expected an InfoHint trigger").toBeGreaterThan(0);
  await hint.click();
  const tip = page.locator('[role="tooltip"]');
  await expect(tip).toBeVisible();
  const onTop = await page.evaluate(() => {
    const el = document.querySelector('[role="tooltip"]') as HTMLElement | null;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(hit);
  });
  expect(onTop, "InfoHint tooltip is topmost").toBe(true);
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

/**
 * Safe dead-button audit: on each page, click every enabled, non-destructive
 * button and record whether anything observable happened (URL change, a dialog/
 * tooltip/menu opened, aria-expanded toggled, or the DOM changed materially).
 * Buttons where nothing happened are reported as candidates for manual review.
 * This is a REPORT (console), not a hard assertion — heuristics have false
 * positives (e.g. a button firing a background fetch).
 */
const AUDIT: Array<{ role: Role; path: string }> = [
  { role: "employee", path: "/dashboard" },
  { role: "manager", path: "/team" },
  { role: "admin", path: "/settings" },
];

const DESTRUCTIVE = /delete|remove|deactivate|archive|sign ?out|log ?out|reset|clear|resolve|dismiss|close|cancel|revoke|rotate/i;

for (const { role, path } of AUDIT) {
  test(`dead-button audit: ${role} ${path}`, async ({ page }) => {
    test.setTimeout(150_000);
    await loginAs(page, role);
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Snapshot handles + labels upfront so a modal opening mid-loop can't make
    // the button list ambiguous.
    const handles = await page.locator("button:visible:enabled").elementHandles();
    const total = handles.length;
    const suspects: string[] = [];
    let audited = 0;

    const snap = () =>
      page.evaluate(() => ({
        url: location.href,
        dialogs: document.querySelectorAll('[role="dialog"],[role="tooltip"],[role="menu"]').length,
        nodes: document.body.querySelectorAll("*").length,
        expanded: document.querySelectorAll('[aria-expanded="true"]').length,
      }));

    for (const h of handles.slice(0, 20)) {
      const label = ((await h.textContent().catch(() => "")) ?? "").trim().slice(0, 40);
      if (!label || DESTRUCTIVE.test(label)) continue;
      if (!(await h.isVisible().catch(() => false))) continue;
      audited++;

      const before = await snap();
      await h.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(150);
      const after = await snap();

      const changed =
        before.url !== after.url ||
        after.dialogs !== before.dialogs ||
        after.expanded !== before.expanded ||
        Math.abs(after.nodes - before.nodes) > 3;
      if (!changed) suspects.push(label);

      // Force-close any modal/menu that opened before the next button.
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(80);
      if (after.url !== before.url) {
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(150);
      }
    }

    console.log(`[audit] ${role} ${path}: audited ${audited}/${total} enabled buttons, ${suspects.length} did nothing observable → ${JSON.stringify(suspects)}`);
  });
}
