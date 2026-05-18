# Safety

## Branches

Le développement V1 se fait sur `feat/ai-pipeline-gemini-pdf-youtube`. `main` reste la branche stable.

Commandes Git destructrices à éviter sans validation explicite :

```bash
git reset --hard
git clean -fd
git push --force
git branch -D
```

## Secrets

Ne jamais committer :

- `.env`
- `cookies.txt`
- clés API
- PDF utilisateur
- transcripts
- outputs générés
- cache

## Suppression contrôlée

La suppression programmatique est limitée à `cache/` et `output/`. Les sources dans `input/` ne sont pas supprimées par le pipeline.

Pour les playlists, aucun cleanup global de `output/videos/` n’est autorisé. Une décision de suppression ne concerne que le Markdown de la vidéo en cours.

## Reprise

Les manifests dans `cache/jobs/` permettent de savoir quelles vidéos sont terminées, échouées, gardées ou supprimées. `--resume` évite de retraiter les vidéos déjà réussies.
