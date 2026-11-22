import test from "node:test";
import assert from "node:assert/strict";
import { extractActions, stableCardId } from "../scripts/playlist-data.mjs";

test("extractActions keeps the concrete actions and omits their metadata", () => {
  const markdown = `
## Actions possibles

- **Action :** Créer un fichier \`.dockerignore\`.
- **Quand :** Avant tout build d'image.
- **Comment :** Exclure node_modules et .env.

- **Action :** Utiliser \`npm ci\` au lieu de \`npm install\`.
- **Risque ou limite :** Le lockfile doit être à jour.

## A retenir

- Une autre information.
`;

  assert.deepEqual(extractActions(markdown), [
    "Créer un fichier .dockerignore.",
    "Utiliser npm ci au lieu de npm install.",
  ]);
});

test("extractActions preserves an explicit no-action statement", () => {
  const markdown = `## Actions possibles\n\nPas d'action directe fiable extraite du transcript.\n\n## A retenir\n\n- Point.`;
  assert.deepEqual(extractActions(markdown), ["Pas d'action directe fiable extraite du transcript."]);
});

test("extractActions returns no invented fallback when the section is absent", () => {
  assert.deepEqual(extractActions("## A retenir\n\n- Point."), []);
});

test("stableCardId follows the playlist source position instead of the compressed file index", () => {
  assert.equal(stableCardId("video-a", "033-video-a.md", 10), "video-a-033");
  assert.equal(stableCardId("video-b", "120-video-b.md", 11), "video-b-120");
});

test("stableCardId keeps a deterministic fallback for legacy filenames", () => {
  assert.equal(stableCardId("video-a", "video-a.md", 10), "video-a-011");
});
