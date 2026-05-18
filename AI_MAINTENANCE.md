# AI Maintenance Guide

Ce fichier sert de mode d'emploi pour une IA qui reprend le projet en cas de bug.
Le but est de corriger vite, sans casser les donnees utilisateur ni exposer de secrets.

## Regles Absolues

- Ne jamais commiter `.env`, `cookies.txt`, les PDF, les outputs, les caches ou les playlists locales.
- Ne jamais supprimer `input/`, `output/`, `cache/` ou `playlists/` sans demande explicite.
- Ne jamais faire `git reset --hard`, `git clean -fd`, `rm -rf` ou `git push --force`.
- Ne jamais supprimer les scripts legacy dans `run/`.
- Ne jamais hardcoder une cle API.
- Toujours verifier `git status --short` avant et apres une modification.
- Garder les corrections petites, lisibles et testables.

## Vue Rapide Du Projet

Commandes utilisateur :

- `./runhelp` : affiche les commandes simples.
- `./runpdf "input/pdf/mon-livre.pdf"` : lance le pipeline PDF complet.
- `./runyoutube "https://youtube.com/watch?v=..."` : lance le pipeline YouTube complet.
- `./runyoutube --file input/youtube/urls.txt` : lance un batch d'URLs.

Dossiers utilisateur :

- `input/` : sources a traiter.
- `output/` : resumes finaux.
- `prompts/` : prompts Gemini modifiables.
- `.env` : configuration locale privee.

Dossiers techniques :

- `src/` : code Python du pipeline.
- `tests/` : tests unitaires.
- `config/` : configuration YAML.
- `docs/` : documentation technique.
- `cache/` : fichiers temporaires.

## Pipeline PDF

Flux attendu :

```txt
PDF
  -> extraction texte ou OCR
  -> Markdown nettoye
  -> comptage tokens
  -> Gemini one-shot ou chunking
  -> output/books/
  -> output/graphipy_ready/
```

Modules importants :

- `src/extractors/pdf_text.py`
- `src/extractors/pdf_mineru.py`
- `src/extractors/pdf_marker.py`
- `src/extractors/pdf_ocrmypdf.py`
- `src/converters/markdown_cleaner.py`
- `src/converters/token_counter.py`
- `src/summarizers/pdf_summarizer.py`
- `src/pipeline.py`

Regle de debug :

- Si le PDF ne contient que le sommaire ou quelques pages, verifier d'abord l'extraction dans `cache/pdf_md/`.
- Si le PDF est scanne, tester `--engine ocrmypdf`.
- Si le PDF est complexe, tester `--engine smart`, puis `mineru`, puis `marker`.
- Si Gemini echoue par longueur, verifier le chunking et le manifest de job.

Commandes utiles :

```bash
./runpdf --engines-status
./runpdf --setup-engines
./runpdf "input/pdf/mon-livre.pdf" --dry-run
./runpdf "input/pdf/mon-livre.pdf" --max-pages 10 --overwrite
./runpdf "input/pdf/mon-livre.pdf" --engine smart --overwrite
./runpdf "input/pdf/mon-livre.pdf" --engine ocrmypdf --ocr-language eng --overwrite
```

## Pipeline YouTube

Flux attendu :

```txt
URL ou playlist
  -> yt-dlp
  -> SRT/VTT
  -> texte nettoye
  -> Gemini
  -> output/videos/
  -> output/graphipy_ready/
  -> manifest video par video
```

Modules importants :

- `src/extractors/youtube.py`
- `src/converters/srt_to_text.py`
- `src/summarizers/video_summarizer.py`
- `src/storage/manifest.py`
- `src/pipeline.py`

Regles obligatoires :

- Une playlist se traite video par video.
- Une video qui echoue ne doit pas bloquer la suite.
- Ne jamais supprimer globalement `output/videos/`.
- Ne jamais supprimer les outputs deja valides.
- Les erreurs doivent etre ecrites dans le manifest.

Commandes utiles :

```bash
./runyoutube "https://youtube.com/watch?v=..." --dry-run
./runyoutube "https://youtube.com/playlist?list=..." --limit 2 --dry-run
./runyoutube "https://youtube.com/playlist?list=..." --resume
./runyoutube --file input/youtube/urls.txt
```

## Gemini Et Prompts

Modules importants :

- `src/llm/gemini_client.py`
- `src/llm/model_router.py`
- `src/llm/rate_limiter.py`
- `prompts/video_summary.md`
- `prompts/pdf_knowledge.md`

Regles :

- Les tests ne doivent jamais appeler Gemini.
- Ne pas afficher la cle API dans les logs.
- En cas de quota ou timeout, sauvegarder l'etat du job si possible.
- Ne pas envoyer un contenu vide ou manifestement mal extrait a Gemini.

## Workflow De Correction

1. Comprendre le bug.

```bash
git status --short
./runhelp
```

2. Reproduire sans risque.

```bash
./runpdf "input/pdf/mon-livre.pdf" --dry-run
./runyoutube "https://youtube.com/playlist?list=..." --limit 1 --dry-run
```

3. Isoler le module responsable.

- Bug extraction PDF : regarder `src/extractors/`.
- Bug nettoyage : regarder `src/converters/`.
- Bug modele/prompt : regarder `src/llm/` et `src/summarizers/`.
- Bug suppression/cache/output : regarder `src/storage/`.
- Bug CLI : regarder `src/cli.py`.

4. Corriger petit.

- Modifier le minimum de fichiers.
- Respecter les patterns existants.
- Ne pas refactorer autre chose en meme temps.

5. Verifier.

```bash
python3.11 -m black src tests
python3.11 -m ruff check src tests
python3.11 -m pytest -q
detect-secrets scan $(git ls-files -co --exclude-standard)
git status --short
git diff --stat
```

6. Commit/push seulement si demande.

```bash
git add <fichiers>
git commit -m "fix: describe the bug fixed"
git push origin main
```

## Checklist Avant De Dire Que C'est Corrige

- Le bug a ete reproduit ou compris.
- La correction est limitee au bon module.
- Les tests passent ou l'echec est explique clairement.
- Aucun secret n'est detecte.
- Aucun fichier prive n'est stage.
- Le README ou `COMMANDS.md` est mis a jour si la commande utilisateur change.
- Le comportement playlist reste video par video.
- Le comportement PDF garde plusieurs plans B.
