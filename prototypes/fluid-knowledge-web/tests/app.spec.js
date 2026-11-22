import { expect, test } from "@playwright/test";
import { access, readFile, readdir } from "node:fs/promises";
import JSZip from "jszip";

async function openNotePanel(page, testInfo) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Note & IA/ }).click();
  }
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("source actions from the video sheet")) {
    await page.route("**/api/youtube/jobs", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "source-actions-test",
          title: "Actions de la fiche",
          status: "completed",
          total: 1,
          cards: [{
            id: "source-actions-video",
            title: "Une vidéo avec des actions concrètes",
            url: "https://www.youtube.com/watch?v=source-actions-video",
            thumbnail: null,
            duration: null,
            source: "YouTube · synthèse",
            summary: "Le résumé fournit des actions concrètes et directement consultables.",
            points: ["Le contenu à retenir reste distinct des actions."],
            actions: ["Créer un fichier .dockerignore.", "Utiliser npm ci dans le Dockerfile."],
            fullSummary: "## Actions possibles\n\n- **Action :** Créer un fichier `.dockerignore`.\n- **Action :** Utiliser `npm ci` dans le Dockerfile.",
          }],
        }),
      });
    });
  }
  if (testInfo.title.includes("4:3 thumbnails")) {
    const fourThreeThumbnail = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#111"/><rect y="38" width="400" height="224" fill="#f5f2dc"/></svg>')}`;
    await page.route("**/api/youtube/jobs", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "thumbnail-crop-test",
          title: "Cadrage miniature",
          status: "completed",
          total: 1,
          cards: [{
            id: "thumbnail-crop-video",
            title: "Miniature 4:3 avec bandes intégrées",
            url: "https://www.youtube.com/watch?v=thumbnail-crop-video",
            thumbnail: fourThreeThumbnail,
            duration: null,
            source: "YouTube · synthèse",
            summary: "Carte synthétique utilisée uniquement pour vérifier le recadrage de la miniature.",
            points: ["Le sujet reste centré."],
            fullSummary: "## Vérification\n\nLe recadrage supprime les bandes sans déformer l'image.",
          }],
        }),
      });
    });
  }
  await page.goto("/");
  await expect(page.getByTestId("review-page")).toBeVisible();
});

test("responsive navigation matches the viewport", async ({ page }, testInfo) => {
  const youtubeLogo = page.locator("svg.source-logo");
  await expect(youtubeLogo).toBeVisible();
  await expect(youtubeLogo).toHaveCSS("color", "rgb(255, 0, 51)");
  await expect(youtubeLogo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(youtubeLogo).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".source-line")).not.toContainText("YT");
  const activeNavigation = testInfo.project.name === "mobile"
    ? page.locator(".bottom-nav button[data-active='true']")
    : page.locator(".sidebar-nav button[data-active='true']");
  const activeMaterial = await activeNavigation.evaluate((button) => {
    const style = getComputedStyle(button);
    return { background: style.backgroundImage, shadow: style.boxShadow };
  });
  expect(activeMaterial.background).toContain("radial-gradient");
  expect(activeMaterial.background).toContain("linear-gradient");
  expect(activeMaterial.shadow).not.toBe("none");
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".context-panel")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toBeHidden();
  } else if (testInfo.project.name === "mobile") {
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".bottom-nav")).toBeVisible();
    await expect(page.locator(".compact-header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Actions possibles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ensuite" })).toHaveCount(0);
  } else {
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".context-panel")).toBeVisible();
  }
});

test("the pearl ribbon background stays full-screen, animated and non-interactive", async ({ page }) => {
  const background = page.locator(".ambient-background");
  const primary = page.locator(".ambient-ribbon-primary");
  const secondary = page.locator(".ambient-ribbon-secondary");
  await expect(background).toBeVisible();
  await expect(primary).toBeVisible();
  await expect(secondary).toBeVisible();
  await expect(background).toHaveCSS("position", "fixed");
  await expect(background).toHaveCSS("pointer-events", "none");
  await expect(primary).not.toHaveCSS("animation-name", "none");
  await expect(primary).toHaveCSS("animation-duration", "26s");
  await expect(primary).toHaveJSProperty("complete", true);
  expect(await primary.evaluate((image) => image.naturalWidth)).toBeGreaterThan(1000);
  await page.mouse.move(20, 20);
  await expect.poll(() => background.evaluate((element) => element.style.getPropertyValue("--ambient-parallax-x"))).not.toBe("");
  expect(await background.evaluate((element) => element.style.getPropertyValue("--ambient-parallax-x"))).not.toBe("0px");
});

test("reduced motion freezes the ambient background", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The shared reduced-motion treatment is covered once.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ambient-background")).toHaveCSS("transform", "none");
  await expect(page.locator(".ambient-ribbon-primary")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".ambient-ribbon-secondary")).toBeHidden();
});

test("desktop Review uses the reversible integrated card while preserving current progress", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The integrated card experiment applies to the wide desktop layout.");
  const reviewPage = page.getByTestId("review-page");
  const reviewCard = page.getByTestId("active-review-card");
  const decisionRow = page.locator(".decision-row");
  const cardBox = await page.locator(".desktop-card-deck").boundingBox();
  const contextPanel = await page.locator(".context-panel").boundingBox();
  const decisionBox = await decisionRow.boundingBox();

  await expect(reviewPage).toHaveAttribute("data-review-layout", "integrated-card");
  await expect(page.locator(".page-progress > span")).toHaveText(/^\d+ sur \d+$/);
  await expect(page.locator(".page-progress strong")).toHaveText(/^\d+%$/);
  expect(cardBox).not.toBeNull();
  expect(contextPanel).not.toBeNull();
  expect(decisionBox).not.toBeNull();
  expect(Math.abs(cardBox.y - contextPanel.y)).toBeLessThan(1);
  expect(Math.abs(cardBox.height - contextPanel.height)).toBeLessThan(1);
  expect(decisionBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height + 13);
  await expect(page.locator(".panel-heading > svg")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Actions possibles" })).toBeVisible();
  await expect(page.locator(".source-actions-panel")).toBeVisible();
  await expect(page.locator(".source-actions-panel .shortcut-list")).toHaveCount(0);
  const keepMaterial = await page.getByRole("button", { name: "Garder", exact: true }).evaluate((button) => {
    const style = getComputedStyle(button);
    return { background: style.backgroundImage, blur: style.backdropFilter, radius: style.borderRadius, shadow: style.boxShadow };
  });
  expect(keepMaterial.background).toContain("linear-gradient");
  expect(keepMaterial.background).toContain("radial-gradient");
  expect(keepMaterial.blur).toContain("blur(26px)");
  expect(keepMaterial.radius).toBe("10px");
  expect(keepMaterial.shadow).not.toBe("none");
  const inspectorSurface = await page.locator(".context-panel section").first().evaluate((panel) => {
    const style = getComputedStyle(panel);
    return { background: style.backgroundImage, blur: style.backdropFilter, shadow: style.boxShadow };
  });
  expect(inspectorSurface.background).toBe("none");
  expect(inspectorSurface.blur).toBe("none");
  expect(inspectorSurface.shadow).toBe("none");
  const reviewCardSurface = await reviewCard.evaluate((card) => {
    const style = getComputedStyle(card);
    return { background: style.backgroundImage, blur: style.backdropFilter, shadow: style.boxShadow };
  });
  expect(reviewCardSurface.background).toBe("none");
  expect(reviewCardSurface.blur).toBe("none");
  expect(reviewCardSurface.shadow).toBe("none");
});

test("Review shows source actions from the video sheet without opening it", async ({ page }) => {
  const actionPanel = page.locator(".source-actions-panel");
  await expect(actionPanel).toBeVisible();
  await expect(actionPanel.locator("li")).toHaveText([
    "Créer un fichier .dockerignore.",
    "Utiliser npm ci dans le Dockerfile.",
  ]);
  await expect(actionPanel).not.toContainText("Ouvrir");
  await expect(actionPanel).not.toContainText("Écarter");
  await expect(actionPanel).not.toContainText("Garder");
  await expect(actionPanel).not.toContainText("Annuler");
});

test("the Review experiment can return to the legacy desktop composition without changing progress", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The comparison flag targets the desktop experiment.");
  await page.goto("/?reviewLayout=legacy");
  await expect(page.getByTestId("review-page")).toHaveAttribute("data-review-layout", "legacy");
  await expect(page.locator(".page-progress > span")).toHaveText(/^\d+ sur \d+$/);
  await expect(page.locator(".page-progress strong")).toHaveText(/^\d+%$/);
  const panelSurface = await page.locator(".context-panel section").first().evaluate((panel) => {
    const style = getComputedStyle(panel);
    return { background: style.backgroundImage, shadow: style.boxShadow };
  });
  expect(panelSurface.background).toContain("linear-gradient");
  expect(panelSurface.shadow).not.toBe("none");
});

test("restrained glass geometry is shared across secondary screens", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The shared desktop material system is covered once.");
  await page.getByRole("button", { name: "Home" }).first().click();
  const analyzeStyle = await page.getByRole("button", { name: "Analyser" }).evaluate((button) => {
    const style = getComputedStyle(button);
    return { background: style.backgroundImage, blur: style.backdropFilter, radius: style.borderRadius, shadow: style.boxShadow };
  });
  expect(analyzeStyle.background).toContain("linear-gradient");
  expect(analyzeStyle.background).toContain("radial-gradient");
  expect(analyzeStyle.blur).toContain("blur(18px)");
  expect(analyzeStyle.radius).toBe("10px");
  expect(analyzeStyle.shadow).not.toBe("none");

  const formStyle = await page.locator(".source-form").evaluate((form) => {
    const style = getComputedStyle(form);
    return { background: style.backgroundImage, blur: style.backdropFilter, radius: style.borderRadius };
  });
  expect(formStyle.background).toContain("linear-gradient");
  expect(formStyle.background).toContain("radial-gradient");
  expect(formStyle.blur).toContain("blur(24px)");
  expect(formStyle.radius).toBe("12px");

  await page.getByRole("button", { name: "Clés API" }).click();
  const dialog = page.getByRole("dialog", { name: "Clés API" });
  await expect(dialog).toHaveCSS("border-radius", "12px");
  await expect(dialog).toHaveCSS("backdrop-filter", /blur\(30px\)/);
  const keyFieldHeights = await dialog.locator(".api-key-field").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(keyFieldHeights).toHaveLength(3);
  expect(Math.max(...keyFieldHeights) - Math.min(...keyFieldHeights)).toBeLessThan(1);
  const secretFieldHeights = await dialog.locator(".secret-input-wrap").evaluateAll((fields) => fields.map((field) => field.getBoundingClientRect().height));
  expect(secretFieldHeights.every((height) => Math.abs(height - 44) < 1)).toBe(true);
  const calloutMaterial = await dialog.locator(".free-key-callout").evaluate((callout) => {
    const style = getComputedStyle(callout);
    return { background: style.backgroundImage, shadow: style.boxShadow };
  });
  expect(calloutMaterial.background).toContain("radial-gradient");
  expect(calloutMaterial.background).toContain("linear-gradient");
  expect(calloutMaterial.shadow).not.toBe("none");
  const closeButton = dialog.getByRole("button", { name: "Fermer" });
  await expect(closeButton).toHaveCSS("border-radius", "6px");
  await expect(closeButton).toHaveCSS("background-image", /linear-gradient/);
  const apiCardStyle = await dialog.locator(".api-key-field").first().evaluate((card) => {
    const style = getComputedStyle(card);
    return { background: style.backgroundImage, shadow: style.boxShadow };
  });
  expect(apiCardStyle.background).toContain("radial-gradient");
  expect(apiCardStyle.background).toContain("linear-gradient");
  expect(apiCardStyle.shadow).not.toBe("none");
  await closeButton.click();
  await page.getByRole("button", { name: "History" }).first().click();
  const historyCardStyle = await page.locator(".history-table").evaluate((card) => {
    const style = getComputedStyle(card);
    return { background: style.backgroundImage, shadow: style.boxShadow };
  });
  expect(historyCardStyle.background).toContain("radial-gradient");
  expect(historyCardStyle.background).toContain("linear-gradient");
  expect(historyCardStyle.shadow).not.toBe("none");
});

test("Review restores a centered full-bleed thumbnail and no horizontal overflow at target widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The five responsive acceptance widths are covered once.");
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 812 : 1024 });
    await page.reload();
    const card = page.getByTestId("active-review-card");
    await expect(card.locator(".card-copy")).toBeVisible();
    const thumbnail = await page.locator(".thumbnail-button").boundingBox();
    const cardBox = await card.boundingBox();
    expect(thumbnail, `thumbnail at ${width}px`).not.toBeNull();
    expect(cardBox, `card at ${width}px`).not.toBeNull();
    if (width >= 768) {
      expect(Math.abs(thumbnail.height - cardBox.height), `full-height thumbnail at ${width}px`).toBeLessThan(2.1);
    } else {
      expect(Math.abs(thumbnail.width - cardBox.width), `full-width thumbnail at ${width}px`).toBeLessThan(2.1);
      expect(thumbnail.height, `mobile thumbnail height at ${width}px`).toBeGreaterThanOrEqual(188);
    }
    const layout = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(layout.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport);
  }
});

test("4:3 thumbnails keep their source resolution without an extra zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The no-zoom media rule is covered once.");
  const image = page.locator(".thumbnail-main");
  await expect(image).toHaveClass("thumbnail-main");
  const crop = await image.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      naturalRatio: element.naturalWidth / element.naturalHeight,
      fit: style.objectFit,
      position: style.objectPosition,
    };
  });
  expect(crop.transform).toBe("none");
  expect(crop.naturalRatio).toBeCloseTo(4 / 3, 2);
  expect(crop.fit).toBe("cover");
  expect(crop.position).toBe("50% 50%");
  expect(await readFile("scripts/playlist-data.mjs", "utf8")).toContain("/maxresdefault.jpg");
});

test("API key settings explain Google's free keys at every viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Clés API" }).click();
  const dialog = page.getByRole("dialog", { name: "Clés API" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Gemini est le fournisseur actif");
  await expect(dialog).toContainText("OpenAI (GPT)");
  await expect(dialog).toContainText("Anthropic (Claude)");
  await expect(dialog).toContainText("deux projets Google AI Studio distincts");
  await expect(dialog.locator(".gemini-provider-logo")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Créer une clé/ })).toHaveAttribute("href", "https://ai.google.dev/gemini-api/docs/api-key");
  await expect(dialog.getByLabel("Résumés vidéo")).toHaveAttribute("type", "password");
  await expect(dialog.getByLabel("Clé de secours · résumés")).toHaveAttribute("type", "password");
  await expect(dialog.getByLabel("Approfondissements")).toHaveAttribute("type", "password");
  await expect(dialog.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Retirer" })).toHaveCount(0);
});

test("API keys are saved server-side without being returned to the browser", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The local secret adapter is covered once on desktop.");
  const summaryKey = "test-summary-key-1234567890";
  const deepDiveKey = "test-deep-dive-key-1234567890";
  await page.getByRole("button", { name: "Clés API" }).click();
  const dialog = page.getByRole("dialog", { name: "Clés API" });
  const summarySave = page.waitForRequest((request) => request.url().endsWith("/api/settings/api-keys")
    && request.method() === "POST"
    && request.postDataJSON()?.keys?.geminiSummary === summaryKey);
  await dialog.getByLabel("Résumés vidéo").fill(summaryKey);
  await dialog.getByLabel("Résumés vidéo").press("Tab");
  await summarySave;
  const deepDiveSave = page.waitForRequest((request) => request.url().endsWith("/api/settings/api-keys")
    && request.method() === "POST"
    && request.postDataJSON()?.keys?.geminiDeepDive === deepDiveKey);
  await dialog.getByLabel("Approfondissements").fill(deepDiveKey);
  await dialog.getByLabel("Approfondissements").press("Tab");
  await deepDiveSave;
  await expect(dialog.getByLabel("Résumés vidéo").locator("..").getByText("Synchronisée")).toBeVisible();
  await expect(dialog.getByLabel("Approfondissements").locator("..").getByText("Synchronisée")).toBeVisible();
  const response = await page.request.get("/api/settings/api-keys");
  const body = await response.text();
  expect(body).not.toContain(summaryKey);
  expect(body).not.toContain(deepDiveKey);
  expect(JSON.parse(body).configured).toEqual({
    geminiSummary: true,
    geminiSummaryBackup: false,
    geminiDeepDive: true,
  });
  let plaintextStoreExists = true;
  try {
    await access("test-results/api-keys.json");
  } catch {
    plaintextStoreExists = false;
  }
  expect(plaintextStoreExists).toBe(false);
});

test("API key replacement and removal synchronize automatically", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The automatic key lifecycle is covered once on desktop.");
  const requests = [];
  let configured = { geminiSummary: true, geminiSummaryBackup: false, geminiDeepDive: true };
  await page.route("**/api/settings/api-keys", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured, storage: "memory", legacyEnvironment: false }) });
      return;
    }
    const payload = request.postDataJSON();
    requests.push({ method: request.method(), payload });
    if (request.method() === "DELETE") configured = { ...configured, [payload.name]: false };
    if (request.method() === "POST") {
      configured = Object.keys(payload.keys || {}).reduce((state, name) => ({ ...state, [name]: true }), configured);
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured, storage: "memory", legacyEnvironment: false }) });
  });

  await page.getByRole("button", { name: "Clés API" }).click();
  const dialog = page.getByRole("dialog", { name: "Clés API" });
  const summary = dialog.getByLabel("Résumés vidéo");
  await summary.fill("replacement-summary-key-1234567890");
  await summary.press("Tab");
  await expect.poll(() => requests.some((entry) => entry.method === "POST" && entry.payload.keys?.geminiSummary)).toBe(true);
  await expect(summary.locator("..").getByText("Synchronisée")).toBeVisible();

  await summary.fill("");
  await summary.press("Tab");
  await expect.poll(() => requests.some((entry) => entry.method === "DELETE" && entry.payload.name === "geminiSummary")).toBe(true);
  await expect(summary.locator("..").getByText("Ajoute une clé")).toBeVisible();
});

test("keep, Undo and keyboard shortcuts share the same decision flow", async ({ page }) => {
  const card = page.getByTestId("active-review-card");
  await expect(card).toContainText("Carte de démonstration 1");
  await expect(card.locator(".thumbnail-unavailable")).toBeVisible();
  await expect(page.getByText("1 sur 3")).toBeVisible();
  const keepButton = page.getByRole("button", { name: "Garder", exact: true });
  await keepButton.click();
  await expect(card).toContainText("Carte de démonstration 2");
  await expect(page.getByText("2 sur 3")).toBeVisible();
  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  const discardButton = page.getByRole("button", { name: "Écarter", exact: true });
  await discardButton.click();
  await expect(card).toContainText("Carte de démonstration 2");
  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  await page.keyboard.press("ArrowLeft");
  await expect(card).toContainText("Carte de démonstration 2");
});

test("horizontal drag keeps or discards without opening the detail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The shared Motion gesture is exercised once.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = page.getByTestId("active-review-card");
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await expect(page.locator(".desktop-underlay")).toHaveCount(0);

  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.45, { steps: 8 });
  await expect.poll(() => page.getByTestId("keep-swipe-layer").evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.2);
  await expect(page.getByTestId("keep-swipe-layer")).toHaveCSS("background-image", /rgba\(0, 0, 0, 0\.9\).*rgba\(41, 194, 101, 0\.92\)/);
  await expect.poll(() => page.getByTestId("discard-swipe-layer").evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(0.05);
  await page.mouse.up();
  await expect(card).toContainText("Carte de démonstration 2");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  const restoredBox = await card.boundingBox();
  await page.mouse.move(restoredBox.x + restoredBox.width * 0.65, restoredBox.y + restoredBox.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(restoredBox.x + restoredBox.width * 0.2, restoredBox.y + restoredBox.height * 0.45, { steps: 8 });
  await expect.poll(() => page.getByTestId("discard-swipe-layer").evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.2);
  await expect(page.getByTestId("discard-swipe-layer")).toHaveCSS("background-image", /rgba\(0, 0, 0, 0\.9\).*rgba\(232, 65, 84, 0\.92\)/);
  await expect.poll(() => page.getByTestId("keep-swipe-layer").evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(0.05);
  await page.mouse.up();
  await expect(card).toContainText("Carte de démonstration 2");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("clicking the card body opens the full card", async ({ page }) => {
  await page.getByTestId("active-review-card").getByRole("heading", { name: "Carte de démonstration 1" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Carte de démonstration 1" })).toBeVisible();
});

test("Enter opens the active Review card", async ({ page }) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Carte de démonstration 1" })).toBeVisible();
});

test("arrow keys use the rotated ease-in-out exit inside the open sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The shared keyboard exit animation is exercised once.");
  const card = page.getByTestId("active-review-card");
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  await page.keyboard.press("ArrowRight");
  await expect(dialog).toHaveAttribute("data-swipe-direction", "keep");
  await expect.poll(() => dialog.evaluate((element) => element.style.getPropertyValue("--detail-swipe-rotate"))).toBe("7deg");
  await expect(dialog.locator(".detail-swipe-layer.keep")).toHaveCSS("opacity", "0.72");
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Carte de démonstration 2");

  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog).toHaveAttribute("data-swipe-direction", "discard");
  await expect.poll(() => dialog.evaluate((element) => element.style.getPropertyValue("--detail-swipe-rotate"))).toBe("-7deg");
  await expect(dialog.locator(".detail-swipe-layer.discard")).toHaveCSS("opacity", "0.72");
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Carte de démonstration 2");
});

test("up and down arrows scroll the open sheet without deciding the card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The reading-sheet keyboard scroll is covered once.");
  await page.setViewportSize({ width: 1280, height: 560 });
  const card = page.getByTestId("active-review-card");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  const scrollArea = dialog.locator(".reading-dialog-scroll");
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const positionAfterDown = await scrollArea.evaluate((element) => element.scrollTop);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBeLessThan(positionAfterDown);

  await expect(dialog).toBeVisible();
  await expect(card).toContainText("Carte de démonstration 1");
});

test("an intentional swipe in the open sheet keeps or discards and advances", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "Desktop and mobile layouts cover the shared open-sheet gesture.");
  const card = page.getByTestId("active-review-card");
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  let header = dialog.locator(":scope .reading-dialog-scroll > header");
  let box = await header.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.55, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Carte de démonstration 2");

  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog");
  header = dialog.locator(":scope .reading-dialog-scroll > header");
  box = await header.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.55, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Carte de démonstration 2");
});

test("the swipe tint covers the visible sheet after its content is scrolled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The fixed desktop sheet viewport is covered once.");
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  const scrollArea = dialog.locator(".reading-dialog-scroll");
  const swipeLayer = dialog.locator(".detail-swipe-layer");

  const scrollState = await scrollArea.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { top: element.scrollTop, maximum: element.scrollHeight - element.clientHeight };
  });
  expect(scrollState.maximum).toBeGreaterThan(0);
  expect(scrollState.top).toBe(scrollState.maximum);

  const dialogBox = await dialog.boundingBox();
  const layerBox = await swipeLayer.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(layerBox).not.toBeNull();
  expect(Math.abs(layerBox.y - dialogBox.y)).toBeLessThan(2);
  expect(Math.abs((layerBox.y + layerBox.height) - (dialogBox.y + dialogBox.height))).toBeLessThan(2);

  const startX = dialogBox.x + 14;
  const y = dialogBox.y + dialogBox.height - 14;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 80, y);
  await expect(dialog).toHaveAttribute("data-swipe-direction", "keep");
  await expect.poll(() => swipeLayer.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.1);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
});

test("a deliberate text selection does not move or dismiss the open sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Mouse text-selection arbitration is covered once on desktop.");
  const card = page.getByTestId("active-review-card");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  const paragraph = dialog.locator(".selectable-summary p").first();
  const box = await paragraph.boundingBox();
  expect(box).not.toBeNull();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  const startX = box.x + 12;
  const selectionWidth = Math.min(190, Math.max(80, box.width - 30));
  const y = box.y + Math.min(box.height / 2, 18);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.waitForTimeout(220);
  await page.mouse.move(startX + selectionWidth, y, { steps: 14 });
  await page.mouse.up();

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-swiping", "false");
  await expect.poll(() => dialog.evaluate((element) => element.style.getPropertyValue("--detail-swipe-x"))).toBe("0px");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim().length || 0)).toBeGreaterThan(7);
  await expect(dialog.locator(".selected-excerpt")).toBeVisible();
  await expect(card).toContainText("Carte de démonstration 1");
});

test("swipe starts from summary text and Note controls across the whole open card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The full-card desktop pointer surface is covered once.");
  const card = page.getByTestId("active-review-card");
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  const summaryText = dialog.getByText(/Cette première carte permet de vérifier/);
  let box = await summaryText.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 22, box.y + box.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(card).toContainText("Carte de démonstration 1");

  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Carte de démonstration 2");

  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog");
  const note = page.getByRole("textbox", { name: "Note personnelle" });
  box = await note.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + 24, box.y + 36);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 24, box.y + 36, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Carte de démonstration 2");
});

test("detail dialog keeps a persistent note beside the long summary and transcript", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Ouvrir la fiche", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("Données locales requises");
  await expect(page.getByRole("tabpanel")).toContainText("Confidentialité locale");
  await expect(page.getByRole("tabpanel")).toContainText("src/generated/playlist32.example.json");
  await openNotePanel(page, testInfo);
  const notePanel = page.getByLabel("Note et approfondissement IA");
  await expect(notePanel.locator(".save-state-icon")).toBeVisible();
  await expect(notePanel.locator(".ai-divider-label svg")).toBeVisible();
  await expect(notePanel.locator(".gemini-empty-mark .gemini-brand-icon")).toBeVisible();
  await expect(notePanel.getByRole("button", { name: /Gemini/ }).locator(".gemini-brand-icon")).toBeVisible();
  await page.getByRole("textbox", { name: "Note personnelle" }).fill("Note persistante pour cette vidéo");
  await expect(page.getByText("Enregistré automatiquement")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect.poll(async () => {
      const response = await page.request.get("/api/review-sessions/playlist-32");
      if (!response.ok()) return "";
      return (await response.json()).notes?.["demo-local-1"] || "";
    }).toBe("Note persistante pour cette vidéo");
  }
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Fermer la Note" }).click();
  }
  await page.getByRole("tab", { name: "Transcript" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("transcript canonique local");
  await expect(page.getByRole("link", { name: "Ouvrir la vidéo source" })).toHaveAttribute("href", "https://www.youtube.com/");
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Ouvrir la fiche", exact: true }).click();
  await openNotePanel(page, testInfo);
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toHaveValue("Note persistante pour cette vidéo");
});

test("a highlighted passage can be deepened with Gemini and added to the note", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The contextual AI flow is covered once on desktop.");
  await page.getByRole("button", { name: "Ouvrir la fiche", exact: true }).click();

  const paragraph = page.locator(".selectable-summary p").first();
  await paragraph.selectText();
  await page.locator(".selectable-summary").dispatchEvent("mouseup");
  await expect(page.locator(".selected-excerpt")).toBeVisible();

  await page.getByLabel("Question").fill("Quelles affirmations dois-je vérifier ?");
  await page.getByRole("button", { name: "Envoyer à Gemini" }).click();
  await expect(page.locator(".assistant-message")).toContainText("Le passage doit être relié aux mécanismes cités dans la source.");
  await expect.poll(async () => {
    const response = await page.request.get("/api/review-sessions/playlist-32");
    if (!response.ok()) return 0;
    return (await response.json()).deepDives?.["demo-local-1"]?.length || 0;
  }).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__lastChatGptUrl = "";
    window.__copiedChatGptPrompt = "";
    window.open = (url) => {
      window.__lastChatGptUrl = String(url);
      return null;
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedChatGptPrompt = text;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copier et ouvrir ChatGPT" }).click();
  const chatGptTransfer = await page.evaluate(() => ({
    url: window.__lastChatGptUrl,
    prompt: window.__copiedChatGptPrompt,
  }));
  expect(chatGptTransfer.url).toBe("https://chatgpt.com/");
  expect(chatGptTransfer.prompt).toContain("Conversation déjà menée avec Gemini");
  expect(chatGptTransfer.prompt).toContain("Gemini · test local");
  expect(chatGptTransfer.prompt).toContain("Le passage doit être relié aux mécanismes cités dans la source.");
  expect(chatGptTransfer.prompt).toContain("Vérifier les affirmations avec une source primaire.");
  expect(chatGptTransfer.prompt).toContain("Quelles affirmations dois-je vérifier ?");

  await page.getByLabel("Question").fill("Et comment le vérifier concrètement ?");
  await page.getByRole("button", { name: "Envoyer à Gemini" }).click();
  await expect(page.getByText("Suite de la conversation", { exact: true })).toBeVisible();
  await expect(page.getByText(/La conversation précédente a bien été transmise/)).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get("/api/review-sessions/playlist-32");
    if (!response.ok()) return 0;
    return (await response.json()).deepDives?.["demo-local-1"]?.length || 0;
  }).toBeGreaterThan(1);

  await page.getByRole("button", { name: "Ajouter à la Note" }).last().click();
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toHaveValue(/Approfondissement IA/);
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toHaveValue(/Vérifier les affirmations/);
});

test("the Gemini endpoint refuses a foreign web origin", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The local endpoint policy is covered once on desktop.");
  const response = await request.post("/api/ai/deep-dive", {
    headers: { origin: "https://evil.example" },
    data: {
      title: "Titre",
      url: "https://www.youtube.com/watch?v=NuYFnGlVFzA",
      excerpt: "Un passage suffisamment long pour être utilisé.",
      summary: "Résumé de contexte.",
      question: "Que faut-il vérifier ?",
    },
  });
  expect(response.status()).toBe(403);
  const settingsResponse = await request.post("/api/settings/api-keys", {
    headers: { origin: "https://evil.example" },
    data: { keys: { geminiSummary: "test-summary-key-1234567890" } },
  });
  expect(settingsResponse.status()).toBe(403);
});

test("a Gemini quota error opens the API key recovery popup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The quota recovery path is covered once on desktop.");
  await page.getByRole("button", { name: "Ouvrir la fiche", exact: true }).click();
  await page.getByLabel("Question").fill("[quota-test]");
  await page.getByRole("button", { name: "Envoyer à Gemini" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Quota Gemini atteint" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("nouvelles vidéos");
  await dialog.getByRole("button", { name: "Ajouter une clé de secours" }).click();
  await expect(page.getByRole("dialog", { name: "Clés API" })).toContainText("quota Gemini courant est atteint");
});

test("Home form and History navigation remain usable", async ({ page }) => {
  await page.getByRole("button", { name: "Home" }).first().click();
  await page.getByLabel("URL YouTube").fill("https://youtube.com/playlist?list=demo");
  await page.getByRole("button", { name: "Analyser" }).click();
  await expect(page.getByText("Playlist prête")).toBeVisible();
  await page.getByRole("button", { name: "History" }).first().click();
  await expect(page.getByTestId("history-page")).toBeVisible();
});

test("a different playlist starts a fresh review after the previous one is archived", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The playlist replacement flow is covered once on desktop.");
  await page.evaluate(() => {
    localStorage.setItem("fluid-knowledge-playlist-32-finalized", "true");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Playlist archivée" })).toBeVisible();
  await page.getByRole("button", { name: "Nouvelle source" }).click();
  await page.getByLabel("URL YouTube").fill("https://youtube.com/playlist?list=another-playlist");
  await page.getByRole("button", { name: "Analyser" }).click();
  await expect(page.getByText("Playlist prête")).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir Review" }).click();
  await expect(page.getByTestId("active-review-card")).toContainText("Carte de démonstration 1");
  await expect(page.locator(".sidebar-progress")).toContainText("Playlist active");
  await expect(page.locator(".sidebar-progress")).toContainText("Playlist Démo locale");
});

test("the latest unfinished playlist restores its exact card, notes and decisions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The durable local resume path is covered once on desktop.");
  const jobId = "youtube-restore-playlist-40";
  const cards = Array.from({ length: 40 }, (_, index) => ({
    id: `restore-video-${index + 1}`,
    videoId: `restore-video-${index + 1}`,
    title: `Playlist 40 · vidéo ${index + 1}`,
    url: `https://www.youtube.com/watch?v=restore-video-${index + 1}`,
    thumbnail: null,
    duration: null,
    source: "YouTube · synthèse",
    summary: `Résumé local de la vidéo ${index + 1}.`,
    points: [`Point clé ${index + 1}`],
    fullSummary: `## Résumé complet\n\nContenu de la vidéo ${index + 1}.`,
  }));
  const decisions = Array.from({ length: 40 }, (_, index) => index < 39 ? "keep" : null);
  const savedNote = "Note déjà sauvegardée pour la vidéo 33";
  const job = {
    id: jobId,
    url: "https://www.youtube.com/playlist?list=restore-playlist-40",
    title: "40",
    status: "completed",
    total: 363,
    done: 342,
    failed: 21,
    cards,
    reviewSession: {
      finalized: false,
      currentIndex: 32,
      decidedCount: 39,
      noteCount: 1,
      deepDiveVideoCount: 1,
    },
  };

  await page.addInitScript(() => localStorage.removeItem("fluid-knowledge-active-youtube-job"));
  await page.route("**/api/youtube/jobs", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobs: [job] }) });
  });
  await page.route(`**/api/review-sessions/${jobId}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          decisions,
          notes: { "restore-video-33": savedNote },
          deepDives: { "restore-video-33": [{ question: "Question sauvegardée", answer: "Réponse sauvegardée", excerpt: "Passage", model: "Gemini", createdAt: "2026-11-13T20:00:00.000Z" }] },
          currentIndex: 32,
          finalized: false,
        }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ saved: true }) });
  });

  await page.reload();
  await expect(page.locator(".sidebar-progress")).toContainText("Playlist 40");
  await expect(page.locator(".progress-copy strong")).toHaveText("33 / 363");
  await expect(page.getByTestId("active-review-card")).toContainText("Playlist 40 · vidéo 33");
  await expect(page.getByTestId("active-review-card")).toContainText("Gardée");
  await expect(page.getByTestId("active-review-card")).toContainText("Note enregistrée");
  await expect(page.getByTestId("active-review-card")).toContainText("IA enregistrée");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toHaveValue(savedNote);
  await expect(page.getByText("Question sauvegardée")).toBeVisible();
});

test("History opens the active session without offering destructive deletion", async ({ page }) => {
  await page.getByRole("button", { name: "History" }).first().click();
  await page.getByRole("button", { name: /Consulter Playlist 32/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Session active");
  await expect(dialog).toContainText("Pas encore choisie");
  await expect(dialog.getByRole("button", { name: "Reprendre Review" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Retirer de l'historique/ })).toHaveCount(0);
});

test("the last decision ends Review, downloads a portable ZIP and creates a removable receipt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The full export path is covered once on desktop.");
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const decisions = Array(3).fill("keep");
    decisions[2] = null;
    localStorage.setItem("fluid-knowledge-playlist-32-decisions", JSON.stringify(decisions));
    localStorage.setItem("fluid-knowledge-playlist-32-notes", JSON.stringify({ "demo-local-1": "Ma note exportée dans le ZIP" }));
  });
  await page.reload();
  await page.getByRole("button", { name: /^Garder/ }).click();

  await expect(page.getByTestId("completion-page")).toBeVisible();
  await expect(page.getByText("3", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /ZIP Markdown/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /PDF propre/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Envoyer vers Maxi Brain/ })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /ZIP Markdown/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("playlist-32-3-videos.zip");
  const archive = await JSZip.loadAsync(await readFile(await download.path()));
  expect(archive.file("README.md")).not.toBeNull();
  expect(archive.file("manifest.json")).not.toBeNull();
  expect(Object.keys(archive.files).filter((name) => name.startsWith("videos/") && name.endsWith(".md"))).toHaveLength(3);
  const firstVideoFile = Object.keys(archive.files).find((name) => name.startsWith("videos/001-") && name.endsWith(".md"));
  expect(firstVideoFile).toBeTruthy();
  expect(await archive.file(firstVideoFile).async("string")).toContain("## Note personnelle\n\nMa note exportée dans le ZIP");

  const receipt = page.getByRole("dialog");
  await expect(receipt).toContainText("Reçu d'export");
  await expect(receipt).toContainText("ZIP Markdown");
  await receipt.getByRole("button", { name: "Retirer de l'historique" }).click();
  await expect(receipt).toContainText("Les fichiers exportés, résumés et transcripts ne seront pas supprimés.");
  await receipt.getByRole("button", { name: "Retirer", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Aucun export terminé")).toBeVisible();
});

test("the local Maxi Brain adapter returns a durable receipt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The local adapter is environment-specific.");
  await page.evaluate(() => {
    localStorage.setItem("fluid-knowledge-playlist-32-decisions", JSON.stringify(Array(3).fill("keep")));
    localStorage.setItem("fluid-knowledge-playlist-32-notes", JSON.stringify({ "demo-local-1": "Note envoyée à Maxi Brain" }));
  });
  await page.reload();
  await page.getByRole("button", { name: /Envoyer vers Maxi Brain/ }).click();
  const receipt = page.getByRole("dialog");
  await expect(receipt).toContainText("Maxi Brain");
  await expect(receipt).toContainText("Reçu par l'inbox");
  const exportedFiles = await readdir("test-results/maxi-brain-inbox", { recursive: true });
  const exportedNotes = await Promise.all(
    exportedFiles
      .filter((name) => name.endsWith("demo-local-1.md"))
      .map((name) => readFile(`test-results/maxi-brain-inbox/${name}`, "utf8")),
  );
  expect(exportedNotes.some((contents) => contents.includes("## Note personnelle\n\nNote envoyée à Maxi Brain"))).toBe(true);
});

test("the clean PDF export downloads and records its destination", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The PDF generation path is covered once on desktop.");
  await page.evaluate(() => {
    localStorage.setItem("fluid-knowledge-playlist-32-decisions", JSON.stringify(Array(3).fill("keep")));
    localStorage.setItem("fluid-knowledge-playlist-32-notes", JSON.stringify({ "demo-local-1": "Note exportee dans le PDF" }));
  });
  await page.reload();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /PDF propre/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("playlist-32-3-videos.pdf");
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  expect(pdf.toString("latin1")).toContain("Note personnelle");
  expect(pdf.toString("latin1")).toContain("Note exportee dans le PDF");
  await expect(page.getByRole("dialog")).toContainText("PDF propre");
});
