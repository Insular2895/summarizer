# Commandes simples

## Préparer

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Ajoute ta clé Gemini dans `.env` :

```env
GEMINI_API_KEY=ta_cle
```

## Moteurs PDF optionnels

Le fallback texte `pypdf` est inclus dans `requirements.txt`, donc `run-pdf` peut déjà extraire les PDF texte.

MinerU et Marker ne doivent pas être installés ensemble dans le même environnement Python actuellement :

- MinerU `3.1.x` demande `Pillow >= 11`.
- Marker `1.10.x` / Surya demande `Pillow < 11`.

Pour le moteur principal MinerU :

```bash
pip install -r requirements-pdf-mineru.txt
```

Pour un environnement séparé Marker :

```bash
python3.11 -m venv .venv-marker
source .venv-marker/bin/activate
pip install -r requirements.txt
pip install -r requirements-pdf-marker.txt
```

## PDF complet

Une seule commande pour extraire, nettoyer, résumer et exporter Graphipy :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf"
```

Avec un PDF ailleurs sur le Mac :

```bash
python -m src.cli run-pdf "/chemin/vers/mon-livre.pdf"
```

Tester sans exécuter :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --dry-run
```

Forcer un moteur :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine mineru
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine marker
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine text
```

`--engine auto` analyse rapidement le PDF et choisit l’ordre des moteurs :

- PDF texte simple : `text -> mineru -> marker`
- PDF moyen ou technique : `mineru -> text -> marker`
- PDF scanné, visuel, tableaux ou formules : `mineru -> marker -> text`

Tu peux aussi écrire explicitement :

```bash
python -m src.cli run-pdf "input/pdf/mon-livre.pdf" --engine smart
```

## YouTube complet

Vidéo YouTube :

```bash
python -m src.cli run-youtube "https://youtube.com/watch?v=..."
```

Playlist YouTube :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..."
```

Playlist legacy déjà téléchargée :

```bash
python -m src.cli run-youtube "playlists/Playlist 38"
```

Tester seulement la première vidéo d’une playlist locale :

```bash
python -m src.cli run-youtube "playlists/Playlist 38" --limit 1
```

Reprendre un job :

```bash
python -m src.cli run-youtube "https://youtube.com/playlist?list=..." --resume
```

Écraser les outputs existants :

```bash
python -m src.cli run-youtube "playlists/Playlist 38" --overwrite
```

## Outputs

```txt
output/videos/
output/books/
output/graphipy_ready/
cache/jobs/
```
