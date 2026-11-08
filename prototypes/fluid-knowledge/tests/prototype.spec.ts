import { expect, test, type Locator, type Page } from "@playwright/test";

async function drag(page: Page, locator: Locator, deltaX: number, deltaY: number, steps = 10) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Drag target has no bounding box");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      startX + (deltaX * step) / steps,
      startY + (deltaY * step) / steps,
    );
    await page.waitForTimeout(12);
  }

  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("review-screen")).toBeVisible();
});

test("review decisions work by button and Undo", async ({ page }) => {
  const firstTitle = "Deploy ANY AI Agent to Production in Minutes";
  await expect(page.getByTestId("active-review-card")).toContainText(firstTitle);

  await page.getByRole("button", { name: "Garder" }).click();
  await expect(page.getByTestId("active-review-card")).not.toContainText(firstTitle);

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByTestId("active-review-card")).toContainText(firstTitle);
});

test("horizontal drag commits a keep decision", async ({ page }) => {
  const card = page.getByTestId("active-review-card");
  await drag(page, card, 175, 3);
  await expect(card).not.toContainText("Deploy ANY AI Agent to Production in Minutes");
});

test("detail sheet and tabs are interactive", async ({ page }) => {
  await page.getByRole("button", { name: "Ouvrir la fiche" }).click();
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();

  await page.getByRole("tab", { name: "Transcript" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("00:42");
  await page.getByRole("tab", { name: "Note" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Aucune note");
});

test("primary navigation switches between all three destinations", async ({ page }) => {
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  await page.getByTestId("mobile-app-viewport").getByRole("button", { name: "Review" }).click();
  await expect(page.getByTestId("review-screen")).toBeVisible();
});

test("desktop keyboard shortcuts mirror the visible decisions", async ({ page }) => {
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("active-review-card")).toContainText("Trois patterns avancés");
  await page.keyboard.press("Meta+z");
  await expect(page.getByTestId("active-review-card")).toContainText("Deploy ANY AI Agent");
});
