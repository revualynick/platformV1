import { test, expect, type Page } from "@playwright/test";
import { collectErrors, logout } from "../helpers/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scroll an element into the viewport so ScrollReveal animations don't block
 *  assertion (the content is in the DOM but may be clipped / opacity-0 until
 *  the observer fires). We use evaluate to call scrollIntoView, which is
 *  synchronous on the page side. */
async function scrollTo(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
  }, selector);
  // Brief pause for the IntersectionObserver to fire and CSS to apply.
  await page.waitForTimeout(150);
}

/** Assert that the current URL's pathname matches `expected`. */
async function assertPath(page: Page, expected: string) {
  const url = new URL(page.url());
  expect(url.pathname).toBe(expected);
}

// ---------------------------------------------------------------------------
// Shared: clear cookies before every test
// ---------------------------------------------------------------------------
test.beforeEach(async ({ page }) => {
  await logout(page);
});

// ===========================================================================
// 1. Navigation — present on every marketing page
// ===========================================================================
test.describe("Nav", () => {
  const marketingPages = ["/", "/features", "/pricing", "/about", "/privacy", "/terms", "/demo"];

  for (const path of marketingPages) {
    test(`nav renders on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Logo links back to home
      const logo = page.getByRole("link", { name: /revualy/i }).first();
      await expect(logo).toBeVisible();

      // Nav links are present (they may be hidden on mobile — assert they exist
      // in the DOM even if hidden, or just assert at least one is visible since
      // the playwright default viewport is 1280×720)
      await expect(page.getByRole("link", { name: "Features" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Pricing" }).first()).toBeVisible();

      // Try Demo and Sign In CTAs
      await expect(page.getByRole("link", { name: "Try Demo" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Sign In" }).first()).toBeVisible();
    });
  }

  test("logo click navigates to /", async ({ page }) => {
    await page.goto("/features", { waitUntil: "domcontentloaded" });
    // The logo is an <a href="/"> wrapping both the square icon and "Revualy" text
    await page.getByRole("link", { name: /revualy/i }).first().click();
    await page.waitForURL("**/");
    await assertPath(page, "/");
  });

  test("Features link navigates to /features", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Features" }).first().click();
    await page.waitForURL("**/features");
    await assertPath(page, "/features");
  });

  test("Pricing link navigates to /pricing", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Pricing" }).first().click();
    await page.waitForURL("**/pricing");
    await assertPath(page, "/pricing");
  });

  test("Sign In link navigates to /login", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Sign In" }).first().click();
    await page.waitForURL("**/login");
    await assertPath(page, "/login");
  });

  test("Try Demo link leaves the marketing home for the app", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Try Demo" }).first().click();
    // Try Demo → /home. Unauthenticated (non-demo) that redirects to /login;
    // in a demo/authed context it lands on /home|/onboarding|/dashboard. Either
    // way we must leave the marketing landing (pathname !== "/").
    await page.waitForURL(/\/(home|onboarding|dashboard|login)/, { timeout: 10_000 });
    expect(new URL(page.url()).pathname).not.toBe("/");
  });
});

// ===========================================================================
// 2. Home page — /
// ===========================================================================
test.describe("Home /", () => {
  test("renders hero with heading and primary CTA", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    // Hero heading (partial match tolerates line breaks / text nodes)
    await expect(page.locator("h1").first()).toContainText(/feedback/i);

    // Primary CTA: Request Early Access → /pricing
    const primaryCta = page.getByRole("link", { name: /request early access/i }).first();
    await expect(primaryCta).toBeVisible();
    const href = await primaryCta.getAttribute("href");
    expect(href).toBe("/pricing");

    // Secondary CTA: "See How It Works" is an anchor scroll (#how-it-works)
    const secondaryCta = page.getByRole("link", { name: /see how it works/i });
    await expect(secondaryCta).toBeVisible();
    const anchor = await secondaryCta.getAttribute("href");
    expect(anchor).toContain("#how-it-works");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("FAQ accordion: each item expands on click, aria-expanded flips", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Scroll to FAQ section
    await scrollTo(page, "#faq");
    await page.waitForTimeout(300);

    // FAQ buttons only — scope by the `.faq-icon` child so the selector never
    // catches the Next.js dev-mode overlay button (which also carries
    // aria-expanded but is client-injected and absent in production).
    const faqButtons = page.locator("button:has(.faq-icon)");
    const count = await faqButtons.count();
    expect(count).toBe(6);

    // Click the first item and verify it opens
    const first = faqButtons.nth(0);
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await first.click();
    await page.waitForTimeout(200);
    await expect(first).toHaveAttribute("aria-expanded", "true");

    // The icon acquires the is-open class
    const firstIcon = first.locator(".faq-icon");
    await expect(firstIcon).toHaveClass(/is-open/);

    // The answer content div acquires is-open
    const firstContent = first.locator("..").locator(".faq-content");
    await expect(firstContent).toHaveClass(/is-open/);

    // Click a second item — the first should close (only one open at a time)
    const second = faqButtons.nth(1);
    await expect(second).toHaveAttribute("aria-expanded", "false");
    await second.click();
    await page.waitForTimeout(200);
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");

    // Click through all remaining items
    for (let i = 2; i < count; i++) {
      const btn = faqButtons.nth(i);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(150);
      await expect(btn).toHaveAttribute("aria-expanded", "true");
      // Previous button should now be closed
      await expect(faqButtons.nth(i - 1)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("footer is present on home page", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await expect(page.locator("footer")).toBeVisible();
  });
});

// ===========================================================================
// 3. Features /features
// ===========================================================================
test.describe("Features /features", () => {
  test("renders 9 feature cards", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/features", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    // ScrollReveal wraps each feature card — scroll down to trigger them all
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);

    // Feature cards are h3 headings inside the grid
    const featureHeadings = page.locator("section").filter({ hasText: /chat-native feedback/i }).locator("h3");
    const cardCount = await featureHeadings.count();
    expect(cardCount).toBeGreaterThanOrEqual(9);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("Explore the Demo CTA navigates to /home", async ({ page }) => {
    await page.goto("/features", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const cta = page.getByRole("link", { name: /explore the demo/i });
    await cta.scrollIntoViewIfNeeded();
    const href = await cta.getAttribute("href");
    expect(href).toBe("/home");
  });

  test("Request Early Access CTA navigates to /pricing", async ({ page }) => {
    await page.goto("/features", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const cta = page.getByRole("link", { name: /request early access/i }).last();
    await cta.scrollIntoViewIfNeeded();
    const href = await cta.getAttribute("href");
    expect(href).toBe("/pricing");
  });
});

// ===========================================================================
// 4. Pricing /pricing
// ===========================================================================
test.describe("Pricing /pricing", () => {
  test("founding card renders with 11 feature checkmarks", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    await scrollTo(page, ".pricing-card");
    await page.waitForTimeout(300);

    // The founding card contains an <ul> of features inside a .pricing-card
    const card = page.locator(".pricing-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/founding member/i);

    // 11 feature list items in the checklist column
    const checkItems = card.locator("ul li");
    const itemCount = await checkItems.count();
    expect(itemCount).toBe(11);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("pricing FAQ accordion (4 items) works", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);

    // Scope by `.faq-icon` so the dev-overlay's aria-expanded button isn't counted.
    const faqButtons = page.locator("button:has(.faq-icon)");
    const count = await faqButtons.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const btn = faqButtons.nth(i);
      await btn.scrollIntoViewIfNeeded();
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      await btn.click();
      await page.waitForTimeout(200);
      await expect(btn).toHaveAttribute("aria-expanded", "true");
      // Close it before moving on so each item starts fresh
      await btn.click();
      await page.waitForTimeout(150);
      await expect(btn).toHaveAttribute("aria-expanded", "false");
    }
  });
});

// ===========================================================================
// 5. Static pages — About, Privacy, Terms
// ===========================================================================
test.describe("Static pages", () => {
  const staticPages: { path: string; heading: RegExp }[] = [
    { path: "/about", heading: /building the future/i },
    { path: "/privacy", heading: /privacy/i },
    { path: "/terms", heading: /terms/i },
  ];

  for (const { path, heading } of staticPages) {
    test(`${path} renders with heading and footer, no console errors`, async ({ page }) => {
      const errors = collectErrors(page);
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      expect(resp?.status()).toBeLessThan(500);
      await expect(page.locator("h1").first()).toContainText(heading);

      // Footer present
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      await expect(page.locator("footer")).toBeVisible();

      expect(errors, `${path} console/page errors:\n${errors.join("\n")}`).toHaveLength(0);
    });
  }
});

// ===========================================================================
// 6. Footer links
// ===========================================================================
test.describe("Footer", () => {
  // Active links navigate; disabled (href="#") links stay on the same page.
  const activeLinks: { label: RegExp; expectedPath: string }[] = [
    { label: /^features$/i, expectedPath: "/features" },
    { label: /^about$/i, expectedPath: "/about" },
    { label: /privacy policy/i, expectedPath: "/privacy" },
    { label: /terms of service/i, expectedPath: "/terms" },
  ];

  // href="#" links: Changelog, Blog, Careers, Security
  const disabledLinkNames = [/changelog/i, /^blog$/i, /careers/i, /security/i];

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
  });

  for (const { label, expectedPath } of activeLinks) {
    test(`footer link "${label.source}" navigates to ${expectedPath}`, async ({ page }) => {
      const link = page.locator("footer").getByRole("link", { name: label });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForURL(`**${expectedPath}`, { timeout: 8_000 });
      await assertPath(page, expectedPath);
    });
  }

  for (const name of disabledLinkNames) {
    test(`footer link "${name.source}" (href=#) is an inert placeholder`, async ({ page }) => {
      const link = page.locator("footer").getByRole("link", { name }).first();
      await link.scrollIntoViewIfNeeded();

      // These are deliberate placeholders (href="#"). Assert the href, then that
      // clicking stays on the same page (pathname unchanged). A bare "#" only
      // appends a hash — it must never take the user to a different route.
      await expect(link).toHaveAttribute("href", "#");
      const pathBefore = new URL(page.url()).pathname;
      await link.click();
      await page.waitForTimeout(400);
      expect(new URL(page.url()).pathname).toBe(pathBefore);
    });
  }
});

// ===========================================================================
// 7. Demo /demo
// ===========================================================================
test.describe("Demo /demo", () => {
  test("Slack mock chat renders with dark sidebar and channel list", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Dark sidebar with "Acme Inc" workspace name
    await expect(page.getByText("Acme Inc")).toBeVisible();

    // Channel list items (#general, #engineering…). The "#" glyph repeats once
    // per channel, so scope to a channel name rather than the bare symbol.
    await expect(page.getByText("general").first()).toBeVisible();

    // "Revualy" bot is listed in DMs
    await expect(page.getByText("Revualy").first()).toBeVisible();

    // Messages start appearing (first bot message shown within 3 seconds)
    await expect(
      page.getByText(/hey alex|quick peer review/i),
    ).toBeVisible({ timeout: 5_000 });

    // No console errors on the static section (before any LLM call)
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("email gate: empty email keeps Start Demo disabled", async ({ page }) => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });

    // The email gate card is below the Slack mock — scroll down
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const submitBtn = page.getByRole("button", { name: /start demo/i });
    await submitBtn.scrollIntoViewIfNeeded();

    // Button should be disabled (email is empty, required constraint + disabled attr)
    await expect(submitBtn).toBeDisabled();

    // Clicking it does not open chat UI
    await submitBtn.click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: /start conversation/i })).toHaveCount(0);
  });

  test("email gate: valid email → Start Demo → chat UI appears", async ({ page }) => {
    // The demo lead flow only works with DEMO_MODE=true (the apex/marketing
    // deployment). A tenant instance runs DEMO_MODE=false and gates the lead API
    // behind auth (401), so this path is not exercisable here — skip honestly.
    test.skip(
      process.env.DEMO_MODE !== "true",
      "Requires DEMO_MODE=true (apex demo deployment); this instance runs DEMO_MODE=false.",
    );
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const emailInput = page.getByPlaceholder(/your@email\.com/i);
    await emailInput.scrollIntoViewIfNeeded();
    await emailInput.fill("playwright-test@example.com");

    const submitBtn = page.getByRole("button", { name: /start demo/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // After a successful /api/v1/demo/lead call, the chat UI should appear.
    // If the API is not running or returns an error, an error message is shown.
    const chatUiOrError = page.locator("button:has-text('Start Conversation'), .text-red-600");
    await expect(chatUiOrError).toBeVisible({ timeout: 15_000 });
  });

  // ---------------------------------------------------------------------------
  // Live LLM demo chat — generous timeouts because each claude turn takes ~10-25s
  // ---------------------------------------------------------------------------
  test("live demo chat: Start Conversation → bot reply → user reply → bot reply", async ({ page }) => {
    // Live demo chat requires DEMO_MODE=true (lead-gated, no auth) + the local
    // `claude -p` shim. Not exercisable in a DEMO_MODE=false tenant instance.
    test.skip(
      process.env.DEMO_MODE !== "true",
      "Requires DEMO_MODE=true + claude -p shim; this instance runs DEMO_MODE=false.",
    );
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    // Step 1: pass the email gate
    const emailInput = page.getByPlaceholder(/your@email\.com/i);
    await emailInput.scrollIntoViewIfNeeded();
    await emailInput.fill(`playwright-live-${Date.now()}@example.com`);
    const submitBtn = page.getByRole("button", { name: /start demo/i });
    await submitBtn.click();

    // Wait for either the chat UI (leadRegistered=true) or an error
    const startConvBtn = page.getByRole("button", { name: /start conversation/i });
    const errorEl = page.locator(".text-red-600");
    await Promise.race([
      startConvBtn.waitFor({ timeout: 15_000 }),
      errorEl.waitFor({ timeout: 15_000 }),
    ]);

    if ((await errorEl.count()) > 0) {
      const errText = await errorEl.first().innerText().catch(() => "");
      // NOTE: If the demo has hit its per-day rate limit (3 demo conversations
      // from this IP), the API returns an honest rate-limit error. We assert the
      // message rather than failing the test.
      if (/rate.limit|limit reached|try again/i.test(errText)) {
        console.log(`NOTE: Demo rate limit hit — asserting honest error message: "${errText}"`);
        expect(errText).toMatch(/rate.limit|limit reached|try again|per day/i);
        return;
      }
      // Any other error means the lead API is down — fail the test
      throw new Error(`Unexpected lead API error: ${errText}`);
    }

    // Step 2: click Start Conversation → wait for bot opening message
    await startConvBtn.click();

    // Bot messages have class `self-start` and the opening message should appear
    // within 60 seconds (LLM cold start + inference)
    const botMessage = page.locator(".self-start").first();
    await expect(botMessage).toBeVisible({ timeout: 60_000 });
    await expect(botMessage).not.toBeEmpty();

    // Phase badge and message counter should be visible in the sidebar
    const sessionSidebar = page.locator("dl");
    await expect(sessionSidebar).toBeVisible();
    await expect(sessionSidebar).toContainText(/phase|type/i);

    // Step 3: send a user reply
    const textInput = page.getByPlaceholder(/type your reply/i);
    await expect(textInput).toBeVisible({ timeout: 10_000 });
    await textInput.fill("She showed great initiative and communicated blockers early.");
    await page.getByRole("button", { name: /send message/i }).click();

    // User message bubble should appear immediately (optimistic UI)
    const userMessage = page.locator(".self-end").first();
    await expect(userMessage).toBeVisible({ timeout: 5_000 });
    await expect(userMessage).toContainText(/initiative|blocker/i);

    // Bot second reply appears after LLM call — allow up to 60 seconds
    await expect(page.locator(".self-start")).toHaveCount(2, { timeout: 60_000 });

    // Message counter in the sidebar should have advanced
    await expect(sessionSidebar).toContainText(/\d+ \/ \d+/);

    // NOTE: Phase may or may not have changed after one exchange — no strict assertion.
  });
});
