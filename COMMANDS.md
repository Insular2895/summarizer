# Commandes

Ce fichier sert de mémo rapide. Les commandes sont à lancer depuis la racine du repo.

## Setup

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Créer le `.env` :

```bash
cp .env.example .env
```

Puis remplir :

```env
GEMINI_API_KEY=ta_vraie_cle_api
```

## PDF

Déposer les PDF dans :

```txt
input/pdf/
```

Commande simple :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf"
```

Dry-run :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --dry-run
```

Test rapide sur les 10 premières pages :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --max-pages 10 --overwrite
```

PDF hors du repo :

```bash
python -m src.cli run-pdf "/chemin/vers/mon-livre.pdf"
```

Choix intelligent explicite :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine smart
```

Forcer un moteur :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine mineru
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine ocrmypdf
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine marker
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine text
```

OCR en français, si les données Tesseract françaises sont installées :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine ocrmypdf --ocr-language fra
```

Installer OCRmyPDF pour les livres scannés longs :

```bash
brew install ocrmypdf
```

Ou, si les dépendances système sont déjà présentes :

```bash
pip install -r requirements-pdf-ocrmypdf.txt
```

OCRmyPDF dans un environnement séparé :

```bash
export OCRMYPDF_COMMAND="/chemin/vers/python -m ocrmypdf"
```

Installer MinerU :

```bash
pip install -r requirements-pdf-mineru.txt
mineru-models-download --source modelscope --model_type pipeline
```

Installer Marker dans un environnement séparé :

```bash
python3.11 -m venv .venv-marker
source .venv-marker/bin/activate
pip install -r requirements.txt
pip install -r requirements-pdf-marker.txt
```

## YouTube

Vidéo :

```bash
python -m src.cli run-youtube "https://youtube.com/watch?v=..."
```

Playlist :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..."
```

Playlist locale legacy :

```bash
python -m src.cli run-youtube "playlists/Playlist 38"
```

Tester une seule vidéo d’une playlist locale :

```bash
python -m src.cli run-youtube "playlists/Playlist 38" --limit 1
```

Tester seulement les 2 premières vidéos d’une playlist YouTube :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..." --limit 2
```

Reprendre un job :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..." --resume
```

Écraser un output existant :

```bash
python -m src.cli run-youtube "playlists/Playlist 38" --overwrite
```

## Batch URLs

Créer :

```txt
input/youtube/urls.txt
```

Puis lancer :

```bash
python -m src.cli video-batch --file input/youtube/urls.txt
```

## Cleanup

```bash
python -m src.cli cleanup --cache
python -m src.cli cleanup --all-temp
python -m src.cli cleanup --outputs --older-than 7
```

## Résultats

```txt
output/videos/
output/books/
output/graphipy_ready/
cache/jobs/
```
