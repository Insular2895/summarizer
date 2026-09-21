# Prompt de reprise Web V1

Copier-coller ce prompt dans une nouvelle session Codex ouverte sur le Codespace du repository :

```text
Reprends le Web V1 de `Insular2895/summarizer` sur la branche `feat/web-v1`.

Avant toute modification, lis `AGENTS.md`, `AI_MAINTENANCE.md`, puis `docs/CODESPACES_HANDOFF.md`. Respecte `docs/UI_UX_SPEC.md` et les choix figés dans `docs/WEB_V1_DESIGN_DECISIONS.md`.

Le design choisi est l'option 3 Fluid Knowledge, adaptée en interface blanche Apple-like avec liquid glass discret, cartes visibles par des blancs différents et boutons uniquement bleu/blanc. La référence est `docs/design/web-v1-review-fluid-light-reference.png`. Ne réintroduis ni thème sombre ni boutons verts/rouges.

Commence par lancer la fixture déterministe décrite dans le handoff, puis termine la Phase 15 en faisant la comparaison navigateur et en passant `design-qa.md` de `blocked` à `passed`. Continue ensuite les Phases 16 à 22 dans l'ordre. Exécute les tests, le lint, les builds et le scan de secrets avant chaque commit. Ne committe jamais `.env`, `.dev.vars`, cookies, PDF, outputs, caches, playlists ou transcripts privés. Pousse chaque étape validée sur `origin/feat/web-v1`.

Si je joins de nouvelles images, utilise-les comme références complémentaires sauf si je demande explicitement de remplacer la direction actuelle.
```
