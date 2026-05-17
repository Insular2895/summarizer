# Summarizer

Pipeline local pour extraire, convertir et résumer des vidéos YouTube et des PDF avec Gemini.

Le repo garde les scripts Bash historiques dans `run/`, mais la V1 cible un usage simple :

```txt
input/  -> sources utilisateur
cache/  -> fichiers temporaires supprimables
output/ -> résumés finaux Markdown
```

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

Les moteurs PDF sont optionnels et lourds :

```bash
pip install -r requirements-pdf-mineru.txt
```

MinerU et Marker ne cohabitent pas proprement dans un seul environnement Python actuel : MinerU demande `Pillow >= 11`, tandis que Marker / Surya demande `Pillow < 11`. Le pipeline garde donc MinerU comme moteur principal et utilise `pypdf` comme fallback texte inclus dans `requirements.txt`. Marker peut être installé dans un environnement séparé avec `requirements-pdf-marker.txt`.

## Configuration

```bash
cp .env.example .env
```

Ajoute `GEMINI_API_KEY` dans `.env`. Ne commit jamais `.env`, `cookies.txt`, PDF, transcripts, caches ou outputs générés.

## Utilisation YouTube

Commande simple recommandée :

```bash
python -m src.cli run-youtube "https://youtube.com/watch?v=..."
python -m src.cli run-youtube "https://youtube.com/playlist?list=..."
python -m src.cli run-youtube "playlists/Playlist 38"
```

Vidéo unique :

```bash
python -m src.cli video --url "https://youtube.com/watch?v=..."
```

Batch depuis `input/youtube/urls.txt` :

```bash
python -m src.cli video-batch --file input/youtube/urls.txt
```

Playlist :

```bash
python -m src.cli playlist --url "https://youtube.com/playlist?list=..."
```

Options utiles :

```bash
--ask-each
--keep-all
--export-graphipy
--delete-cache
--overwrite
--resume
--dry-run
```

La logique playlist est vidéo par vidéo : une vidéo produit un Markdown, possède son statut dans un manifest, et peut être gardée ou supprimée sans toucher aux autres outputs. Les manifests sont dans `cache/jobs/`.

## Utilisation PDF

Commande simple recommandée :

```bash
python -m src.cli run-pdf "input/pdf/book.pdf"
```

```bash
python -m src.cli pdf --file input/pdf/book.pdf --engine auto --mode deep
python -m src.cli pdf-batch --dir input/pdf --engine mineru --mode deep
python -m src.cli pdf --file input/pdf/book.pdf --engine marker --mode deep
```

`--engine auto` essaie MinerU, puis Marker si disponible, puis un fallback texte léger avec `pypdf`.

## Modèles Gemini

Les modèles sont configurés dans `config/models.yaml` :

- vidéo simple : `gemini-3.1-flash-lite`
- vidéo dense : `gemini-2.5-flash-lite`
- PDF dense : `gemini-2.5-flash`
- PDF trop gros : chunks avec `gemini-2.5-flash-lite`, synthèse finale avec `gemini-2.5-flash`

Le modèle utilisé peut être gardé dans les manifests internes, mais il n’est pas écrit dans les fichiers Graphipy-ready.

## Structure

```txt
input/
  youtube/urls.example.txt
  pdf/
output/
  videos/
  books/
  graphipy_ready/
cache/
  transcripts/
  pdf_md/
  jobs/
prompts/
config/
src/
run/
```

## Conservation et suppression

- `input/` contient les sources utilisateur : jamais supprimées sans confirmation.
- `cache/` contient les fichiers temporaires : supprimables.
- `output/` contient les résultats finaux : suppression fichier par fichier ou avec confirmation explicite.
- Une playlist ne supprime jamais globalement `output/videos/`.

Cleanup :

```bash
python -m src.cli cleanup --cache
python -m src.cli cleanup --all-temp
python -m src.cli cleanup --outputs --older-than 7
```

## Export Graphipy

```bash
python -m src.cli video --url "<url>" --export-graphipy
python -m src.cli pdf --file input/pdf/book.pdf --export-graphipy
```

Les fichiers sont copiés dans `output/graphipy_ready/` avec frontmatter Markdown propre et sans `model_used`.

## Tests et qualité

```bash
black src tests
ruff check src tests --fix
pytest -q
```

La CI GitHub Actions lance Black, Ruff, pytest, un scan de secrets, et un mypy non bloquant au début.

## Scripts legacy

Les scripts Bash existants restent disponibles :

```txt
run/run_transcripts.sh
run/run_transcripts_playlist2.sh
run/yt_transcribe_fallback.sh
```

Ils ne sont pas supprimés et peuvent continuer à servir d’extracteurs legacy.

## Roadmap

- `v0.1.0` : pipeline vidéo.
- `v0.2.0` : pipeline PDF.
- `v0.3.0` : export Graphipy.
