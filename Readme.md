# Summarizer

Pipeline local pour transformer des vidéos YouTube, playlists et PDF en résumés Markdown propres avec Gemini.

Objectif V1 : rester simple.

```txt
input/   -> tu déposes les sources
output/  -> tu récupères les résumés
cache/   -> fichiers temporaires supprimables
```

Pas de dashboard, pas de base de données, pas de SaaS. Tout tourne en local.

## Démarrage Rapide

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Créer le fichier de secrets local :

```bash
cp .env.example .env
```

Puis remplir :

```env
GEMINI_API_KEY=ta_vraie_cle_api
```

Ne commit jamais `.env`. Il est ignoré par Git.

## Commandes Simples

PDF complet :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf"
```

Vidéo YouTube :

```bash
python -m src.cli run-youtube "https://youtube.com/watch?v=..."
```

Playlist YouTube :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..."
```

Playlist déjà téléchargée avec les anciens scripts :

```bash
python -m src.cli run-youtube "playlists/Playlist 38"
```

Tester sans rien écrire :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --dry-run
python -m src.cli run-youtube "playlists/Playlist 38" --dry-run --limit 1
```

Toutes les commandes pratiques sont regroupées dans [COMMANDS.md](COMMANDS.md).

## PDF

Dépose les PDF dans :

```txt
input/pdf/
```

Puis lance :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf"
```

Par défaut, `--engine auto` analyse rapidement le PDF et choisit le meilleur moteur disponible :

```txt
PDF texte simple                 -> text -> mineru -> ocrmypdf -> marker
PDF long ou moyennement complexe -> mineru -> text -> ocrmypdf -> marker
PDF scanné / livre long          -> ocrmypdf -> mineru -> marker -> text
PDF visuel / tableaux / formules -> mineru -> ocrmypdf -> marker -> text
```

Forcer un moteur :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine mineru
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine ocrmypdf
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine marker
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine text
```

Pour un OCR en français après installation des données Tesseract françaises :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine ocrmypdf --ocr-language fra
```

Tester rapidement un gros PDF sur les premières pages :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --max-pages 10 --overwrite
```

OCRmyPDF est recommandé pour les livres scannés longs. MinerU reste utile pour les PDF complexes avec mise en page riche. Le fallback `text` via `pypdf` est inclus dans l’installation de base.

## Installer OCRmyPDF, MinerU Ou Marker

Pour les gros livres scannés :

```bash
brew install ocrmypdf
```

Le moteur OCRmyPDF utilise `eng` par défaut. Pour OCR en français, installe aussi les données de langue Tesseract puis lance avec `--ocr-language fra`.

Si l’installation pip d’OCRmyPDF entre en conflit avec un autre moteur PDF, installe-le dans un environnement séparé et expose la commande avec :

```bash
export OCRMYPDF_COMMAND="/chemin/vers/python -m ocrmypdf"
```

Ou, si les dépendances système sont déjà présentes :

```bash
pip install -r requirements-pdf-ocrmypdf.txt
```

MinerU et Marker ne cohabitent pas proprement dans le même environnement Python actuel :

```txt
MinerU 3.1.x  -> Pillow >= 11
Marker 1.10.x -> Pillow < 11
```

Pour le moteur principal MinerU :

```bash
pip install -r requirements-pdf-mineru.txt
mineru-models-download --source modelscope --model_type pipeline
```

Le téléchargement des modèles est nécessaire pour les PDF scannés ou très visuels. Il se fait une seule fois, puis MinerU réutilise le cache local.

Pour Marker, utilise un environnement séparé :

```bash
python3.11 -m venv .venv-marker
source .venv-marker/bin/activate
pip install -r requirements.txt
pip install -r requirements-pdf-marker.txt
```

## YouTube

Vidéo unique :

```bash
python -m src.cli run-youtube "https://youtube.com/watch?v=..."
```

Playlist :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..."
```

Tester seulement les premières vidéos d’une playlist :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..." --limit 2
```

Batch d’URLs :

```bash
python -m src.cli video-batch --file input/youtube/urls.txt
```

Exemple de fichier :

```txt
input/youtube/urls.txt
```

```txt
https://youtube.com/watch?v=...
https://youtube.com/watch?v=...
```

Pour une playlist locale legacy :

```bash
python -m src.cli run-youtube "playlists/Playlist 38"
```

Le traitement playlist est toujours vidéo par vidéo :

- une vidéo = un fichier Markdown ;
- une vidéo = un statut dans le manifest ;
- si une vidéo échoue, la suivante continue ;
- aucune suppression globale de `output/videos/`.

## Outputs

Résumés vidéo :

```txt
output/videos/
```

Résumés PDF :

```txt
output/books/
```

Exports Graphipy-ready :

```txt
output/graphipy_ready/
```

Manifests de jobs :

```txt
cache/jobs/
```

Les fichiers Graphipy-ready n’incluent pas `model_used` dans le frontmatter.

## Nettoyage

Supprimer le cache :

```bash
python -m src.cli cleanup --cache
```

Supprimer les temporaires :

```bash
python -m src.cli cleanup --all-temp
```

Supprimer les vieux outputs avec confirmation :

```bash
python -m src.cli cleanup --outputs --older-than 7
```

Le pipeline ne supprime jamais `input/` sans confirmation explicite.

## Structure

```txt
input/
  youtube/
  pdf/
output/
  videos/
  books/
  graphipy_ready/
cache/
prompts/
config/
src/
run/
```

Les scripts Bash dans `run/` sont conservés comme legacy, mais l’usage recommandé passe par `python -m src.cli`.

## Qualité

```bash
black src tests
ruff check src tests
pytest -q
```

La CI GitHub Actions vérifie format, lint, tests et scan de secrets.

## Sécurité

Ne jamais committer :

- `.env`
- `cookies.txt`
- PDF utilisateur
- transcripts
- cache
- outputs générés

Le `.gitignore` protège ces fichiers.
