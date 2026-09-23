import { test, expect } from "@playwright/test";
import { loginAs } from "../../e2e/helpers/auth";

test.use({ viewport: { width: 1440, height: 900 } });

test("diag: questionnaire toggle structure", async ({ page }) => {
  await loginAs(page, "admin", "/settings/questions");
  await page.waitForLoadState("networkidle");
  
  const buttons = await page.locator("button[title]").all();
  for (const btn of buttons) {
    const title = await btn.getAttribute("title");
    console.log("BTN TITLE:", title);
  }
  
  const firstCard = page.locator("div.rounded-2xl.border").first();
  const cardText = await firstCard.innerText().catch(() => "not found");
  console.log("FIRST CARD TEXT (first 300):", cardText.substring(0, 300));
  expect(true).toBe(true);
});

test("diag: people deactivate - check if action actually fires", async ({ page }) => {
  const ts = Date.now();
  const personEmail = `diag-${ts}@acmecorp.com`;
  const personName = `Diag Person ${ts}`;

  await loginAs(page, "admin", "/settings/people");
  await page.waitForLoadState("networkidle");

  // Add person
  await page.getByRole("button", { name: /\+ add person/i }).click();
  const addModal = page.locator("div.fixed.inset-0").filter({ has: page.getByText(/Add Person/) });
  await addModal.waitFor({ state: "visible" });
  await page.locator('input[name="name"]').fill(personName);
  await page.locator('input[name="email"]').fill(personEmail);
  await page.getByRole("button", { name: /^add person$/i }).click();
  await addModal.waitFor({ state: "hidden", timeout: 10000 });
  
  // Wait for row
  await page.waitForLoadState("networkidle");
  const personRow = page.locator("tr").filter({ hasText: personEmail });
  await personRow.waitFor({ state: "visible", timeout: 8000 });
  
  // Deactivate
  await personRow.getByRole("button", { name: /deactivate/i }).click();
  const confirmModal = page.locator("div.fixed.inset-0").filter({ has: page.getByText(/Deactivate user\?/) });
  await confirmModal.waitFor({ state: "visible", timeout: 5000 });
  
  await confirmModal.getByRole("button", { name: /^deactivate$/i }).click();
  
  // Wait and check the row text
  await page.waitForTimeout(5000);
  const rowText = await page.locator("tr").filter({ hasText: personEmail }).innerText().catch(() => "ROW GONE");
  console.log("ROW TEXT AFTER DEACTIVATE:", rowText);
  
  // Check if page reloaded (RSC refresh may have replaced the table)
  const allText = await page.locator("body").innerText();
  const hasInactive = allText.includes("Inactive");
  console.log("PAGE HAS 'Inactive' text:", hasInactive);
  console.log("EMAIL STILL IN PAGE:", allText.includes(personEmail));
  
  expect(true).toBe(true);
});
