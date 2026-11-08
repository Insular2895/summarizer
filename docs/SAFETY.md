# Safety

## Branches

Le développement Web V1 se fait sur `feat/web-v1`. `main` reste la branche stable. Les travaux
historiques du pipeline Python peuvent vivre sur leurs branches dédiées ; ils ne doivent pas être
mélangés silencieusement avec les phases Web.

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
