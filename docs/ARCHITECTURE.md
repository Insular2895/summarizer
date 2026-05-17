# Architecture

## Dossiers

- `input/` : sources utilisateur, comme `input/youtube/urls.txt` et les PDF dans `input/pdf/`.
- `cache/` : transcripts, Markdown PDF extrait, manifests de jobs.
- `output/` : résumés finaux dans `videos/`, `books/` et `graphipy_ready/`.
- `prompts/` : prompts Gemini versionnés.
- `config/` : routing modèles et réglages de chemins/rétention.
- `run/` : scripts Bash legacy conservés.

## Modules

- `extractors/` récupère le contenu brut.
- `converters/` transforme SRT/VTT et Markdown.
- `llm/` gère Gemini, routing et rate limit.
- `summarizers/` prépare prompt + contenu et écrit le Markdown final.
- `exporters/` produit les fichiers Graphipy-ready.
- `storage/` gère manifests et suppression contrôlée.

## Routing modèle

- Vidéo courte/simple : `video_simple`.
- Vidéo longue/dense : `video_dense`.
- PDF sous la limite : `pdf_deep`.
- PDF au-dessus de la limite : `pdf_chunk`, puis `pdf_final_synthesis`.
