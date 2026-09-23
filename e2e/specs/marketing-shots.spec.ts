import { test } from "@playwright/test";

/** Re-capture marketing pages with scroll-reveal forced visible so the full
 *  layout can be reviewed (fullPage screenshots don't fire IntersectionObserver). */
const ROUTES = ["/", "/features", "/pricing", "/about"];

test.use({ viewport: { width: 1440, height: 900 } });

for (const path of ROUTES) {
  test(`marketing ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" }).catch(() => {});
    // Force every scroll-reveal element visible.
    await page.addStyleTag({
      content: `.scroll-reveal, [class*="scroll-reveal"] { opacity: 1 !important; transform: none !important; }`,
    });
    await page.evaluate(() => {
      document.querySelectorAll(".scroll-reveal").forEach((el) => el.classList.add("is-visible"));
    });
    await page.waitForTimeout(500);
    const name = path === "/" ? "_root" : path.replace(/\//g, "_");
    await page.screenshot({ path: `${__dirname}/../shots/marketing${name}.png`, fullPage: true });
  });
}
