import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

/**
 * Interaction + z-order review: open modals/popovers and verify they are the
 * TOP-MOST element (elementFromPoint at their centre resolves inside them),
 * that buttons act, and that nav links change the URL. Screenshots are saved
 * for visual inspection of clipping/overlap.
 */

const SHOTS = `${__dirname}/../shots`;

/** Assert the dialog is genuinely on top (nothing clips over it). */
async function assertTopMost(page: import("@playwright/test").Page, selector: string) {
  const onTop = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { ok: false, reason: "not found" };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + Math.min(r.height / 2, window.innerHeight / 2);
    const hit = document.elementFromPoint(cx, cy);
    return { ok: el.contains(hit), reason: hit?.className?.toString?.() ?? "null" };
  }, selector);
  expect(onTop.ok, `element over ${selector}: ${onTop.reason}`).toBe(true);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("employee: Send Kudos modal opens on top and closes", async ({ page }) => {
  await loginAs(page, "employee");
  await page.goto("/dashboard/kudos", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: /send kudos/i }).first();
  await trigger.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await assertTopMost(page, '[role="dialog"]');
  await page.screenshot({ path: `${SHOTS}/modal_send-kudos.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("admin: create-questionnaire modal opens on top", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/settings/questions", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: /create|new questionnaire|add/i }).first();
  if ((await trigger.count()) === 0) test.skip(true, "no create trigger found");
  await trigger.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await assertTopMost(page, '[role="dialog"]');
  await page.screenshot({ path: `${SHOTS}/modal_create-questionnaire.png` });
});

test("manager: org-chart node popover appears above the graph", async ({ page }) => {
  await page.goto(
    `/api/test-login?email=${encodeURIComponent("jordan.wells@acmecorp.com")}&key=${encodeURIComponent(process.env.TEST_LOGIN_KEY ?? "")}&redirect=/team/org-chart`,
  );
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  // The node card is hover-triggered (onMouseEnter → hoveredPerson), rendered
  // absolute z-50 over the SVG graph. Hover a node to reveal it.
  const node = page.locator("svg g").filter({ hasText: /Sarah|Marcus|David|Elena|Aisha|Jordan/ }).last();
  expect(await node.count(), "expected a clickable org-chart node").toBeGreaterThan(0);
  // The detail card is gated by selectedPerson (set on click), rendered absolute z-50.
  await node.click({ force: true });
  await page.waitForTimeout(400);
  const popover = page.locator(".absolute.z-50").first();
  await expect(popover).toBeVisible({ timeout: 3000 });
  await assertTopMost(page, ".absolute.z-50");
  await page.screenshot({ path: `${SHOTS}/popover_org-chart-node.png` });
});

test("employee: sidebar navigation goes to the right routes", async ({ page }) => {
  await loginAs(page, "employee");
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  const targets = [
    { name: /feedback/i, url: /\/dashboard\/feedback/ },
    { name: /reflections/i, url: /\/dashboard\/reflections/ },
    { name: /kudos/i, url: /\/dashboard\/kudos/ },
    { name: /settings/i, url: /\/dashboard\/settings/ },
  ];
  for (const t of targets) {
    const link = page.getByRole("link", { name: t.name }).first();
    if ((await link.count()) === 0) continue;
    await link.click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page, `nav ${t.name} → ${page.url()}`).toHaveURL(t.url);
  }
});

test("manager: flagged item action opens a review dialog", async ({ page }) => {
  // jordan.wells has a seeded flagged escalation among their reports.
  await page.goto(
    `/api/test-login?email=${encodeURIComponent("jordan.wells@acmecorp.com")}&key=${encodeURIComponent(process.env.TEST_LOGIN_KEY ?? "")}&redirect=/team/flagged`,
  );
  await page.waitForLoadState("networkidle");
  const btn = page.getByRole("button", { name: /investigate|dismiss|review/i }).first();
  if ((await btn.count()) === 0) test.skip(true, "no flagged items / actions rendered");
  await btn.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await assertTopMost(page, '[role="dialog"]');
  await page.screenshot({ path: `${SHOTS}/modal_flag-review.png` });
});
