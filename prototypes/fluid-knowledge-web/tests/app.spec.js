import { expect, test } from "@playwright/test";
import { access, readFile, readdir } from "node:fs/promises";
import JSZip from "jszip";

async function openNotePanel(page, testInfo) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Note & IA/ }).click();
  }
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("review-page")).toBeVisible();
});

test("responsive navigation matches the viewport", async ({ page }, testInfo) => {
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".context-panel")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toBeHidden();
  } else if (testInfo.project.name === "mobile") {
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".bottom-nav")).toBeVisible();
    await expect(page.locator(".compact-header")).toBeVisible();
  } else {
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".context-panel")).toBeVisible();
  }
});

test("API key settings explain Google's free keys at every viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Clés API" }).click();
  const dialog = page.getByRole("dialog", { name: "Clés API" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Google fournit des clés Gemini gratuites");
  await expect(dialog).toContainText("soumis aux quotas");
  await expect(dialog.getByRole("link", { name: /Créer une clé/ })).toHaveAttribute("href", "https://ai.google.dev/gemini-api/docs/api-key");
  await expect(dialog.getByLabel("Résumés vidéo")).toHaveAttribute("type", "password");
  await expect(dialog.getByLabel("Clé de secours · résumés")).toHaveAttribute("type", "password");
  await expect(dialog.getByLabel("Approfondissements")).toHaveAttribute("type", "password");
});

test("API keys are saved server-side without being returned to the browser", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The local secret adapter is covered once on desktop.");
  const summaryKey = "test-summary-key-1234567890";
  const deepDiveKey = "test-deep-dive-key-1234567890";
  await page.getByRole("button", { name: "Clés API" }).click();
  const dialog = page.getByRole("dialog", { name: "Clés API" });
  await dialog.getByLabel("Résumés vidéo").fill(summaryKey);
  await dialog.getByLabel("Approfondissements").fill(deepDiveKey);
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog.getByText("Clés enregistrées côté serveur.")).toBeVisible();
  await expect(dialog.getByLabel("Résumés vidéo")).toHaveValue("");
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

test("keep, Undo and keyboard shortcuts share the same decision flow", async ({ page }) => {
  const card = page.getByTestId("active-review-card");
  await expect(card).toContainText("Carte de démonstration 1");
  await expect(card.locator(".thumbnail-unavailable")).toBeVisible();
  await expect(page.getByText("1 sur 3")).toBeVisible();
  await page.getByRole("button", { name: /Garder/ }).click();
  await expect(card).toContainText("Carte de démonstration 2");
  await expect(page.getByText("2 sur 3")).toBeVisible();
  await page.getByRole("button", { name: /Annuler/ }).click();
  await expect(card).toContainText("Carte de démonstration 1");
  await page.keyboard.press("ArrowLeft");
  await expect(card).toContainText("Carte de démonstration 2");
});

test("detail dialog keeps a persistent note beside the long summary and transcript", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Ouvrir la fiche" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("Données locales requises");
  await expect(page.getByRole("tabpanel")).toContainText("Confidentialité locale");
  await expect(page.getByRole("tabpanel")).toContainText("src/generated/playlist32.example.json");
  await openNotePanel(page, testInfo);
  await page.getByRole("textbox", { name: "Note personnelle" }).fill("Note persistante pour cette vidéo");
  await expect(page.getByText("Enregistré automatiquement")).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get("/api/review-sessions/playlist-32");
    if (!response.ok()) return "";
    return (await response.json()).notes?.["demo-local-1"] || "";
  }).toBe("Note persistante pour cette vidéo");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Fermer la Note" }).click();
  }
  await page.getByRole("tab", { name: "Transcript" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("transcript canonique local");
  await expect(page.getByRole("link", { name: "Ouvrir la vidéo source" })).toHaveAttribute("href", "https://www.youtube.com/");
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Ouvrir la fiche" }).click();
  await openNotePanel(page, testInfo);
  await expect(page.getByRole("textbox", { name: "Note personnelle" })).toHaveValue("Note persistante pour cette vidéo");
});

test("a highlighted passage can be deepened with Gemini and added to the note", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The contextual AI flow is covered once on desktop.");
  await page.getByRole("button", { name: "Ouvrir la fiche" }).click();

  const paragraph = page.locator(".selectable-summary p").first();
  await paragraph.selectText();
  await page.locator(".selectable-summary").dispatchEvent("mouseup");
  await expect(page.locator(".selected-excerpt")).toBeVisible();

  await page.getByLabel("Question").fill("Quelles affirmations dois-je vérifier ?");
  await page.getByRole("button", { name: "Approfondir avec Gemini" }).click();
  await expect(page.getByText("Réponse IA", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sauvegardée automatiquement/)).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get("/api/review-sessions/playlist-32");
    if (!response.ok()) return 0;
    return (await response.json()).deepDives?.["demo-local-1"]?.length || 0;
  }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ajouter à la Note" }).click();
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
  await page.getByRole("button", { name: "Ouvrir la fiche" }).click();
  await page.getByLabel("Question").fill("[quota-test]");
  await page.getByRole("button", { name: "Approfondir avec Gemini" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Quota Gemini atteint" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("nouvelles vidéos");
  await dialog.getByRole("button", { name: "Ajouter une clé de secours" }).click();
  await expect(page.getByRole("dialog", { name: "Clés API" })).toContainText("quota courant est atteint");
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
