<div align="center">

# Summarizer

**Pipeline local YouTube + PDF vers résumés Markdown avec Gemini**

<p>
  <a href="https://github.com/yt-dlp/yt-dlp"><img src="docs/assets/badge-ytdlp-animated.svg" alt="powered by yt-dlp" height="28" /></a>
  <a href="https://www.gnu.org/software/bash/"><img src="docs/assets/badge-shell-bash-animated.svg" alt="Shell Bash" height="28" /></a>
  <a href="https://www.apple.com/macos/"><img src="docs/assets/badge-platform-macos-animated.svg" alt="Platform macOS" height="28" /></a>
</p>

</div>

---

## Vue Rapide

Summarizer transforme des vidéos YouTube, playlists et PDF en fichiers Markdown propres, prêts à lire ou à importer dans Graphipy.

```txt
input/   -> sources utilisateur
cache/   -> fichiers temporaires supprimables
output/  -> résumés finaux
```

Pipeline :

```txt
YouTube / PDF
  -> extraction ou OCR
  -> Markdown ou texte nettoyé
  -> Gemini
  -> output Markdown
  -> export Graphipy-ready
```

V1 reste volontairement locale et simple : pas de dashboard, pas de base de données, pas de Redis, pas de SaaS.

---

## Installation

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Créer le fichier local de configuration :

```bash
cp .env.example .env
```

Puis remplir dans `.env` :

```env
GEMINI_API_KEY=ta_cle_api_gemini
```

`.env` est ignoré par Git. Ne le commit jamais.

---

## Commandes Simples

Afficher l’aide client :

```bash
./runhelp
```

PDF :

```bash
./runpdf "input/pdf/mon-livre.pdf"
```

Vidéo YouTube :

```bash
./runyoutube "https://youtube.com/watch?v=..."
```

Playlist YouTube :

```bash
./runyoutube "https://youtube.com/playlist?list=..."
```

Tester sans écrire :

```bash
./runpdf "input/pdf/mon-livre.pdf" --dry-run
./runyoutube "https://youtube.com/playlist?list=..." --dry-run --limit 2
```

Toutes les commandes utiles sont regroupées dans [COMMANDS.md](COMMANDS.md).

Pour une correction future par une IA ou un assistant de code, le point d'entree est [AGENTS.md](AGENTS.md) et le guide complet est dans [AI_MAINTENANCE.md](AI_MAINTENANCE.md).

---

## PDF

Dépose les fichiers dans :

```txt
input/pdf/
```

Lancement recommandé :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine smart
```

Le mode `smart` analyse rapidement le document et choisit le meilleur moteur disponible :

```txt
PDF texte simple                 -> text -> mineru -> ocrmypdf -> marker
PDF long ou moyennement complexe -> mineru -> text -> ocrmypdf -> marker
PDF scanné / livre long          -> ocrmypdf -> mineru -> marker -> text
PDF visuel / tableaux / formules -> mineru -> ocrmypdf -> marker -> text
```

Forcer un moteur :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine text
./runpdf "input/pdf/mon-livre.pdf" --engine ocrmypdf
./runpdf "input/pdf/mon-livre.pdf" --engine mineru
./runpdf "input/pdf/mon-livre.pdf" --engine marker
```

Tester seulement les premières pages d’un gros PDF :

```bash
./runpdf "input/pdf/mon-livre.pdf" --max-pages 10 --overwrite
```

OCR en français, si les données Tesseract françaises sont installées :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine ocrmypdf --ocr-language fra
```

Le résultat final est écrit dans :

```txt
output/books/
output/graphipy_ready/
```

---

## Moteurs PDF

Le fallback texte `pypdf` est inclus dans l’installation de base.

Pour les livres scannés longs, OCRmyPDF est recommandé :

```bash
brew install ocrmypdf
```

Ou, si les dépendances système sont déjà disponibles :

```bash
pip install -r requirements-pdf-ocrmypdf.txt
```

Pour les PDF complexes avec mise en page riche, MinerU est disponible séparément :

```bash
pip install -r requirements-pdf-mineru.txt
mineru-models-download --source modelscope --model_type pipeline
```

Pour Marker, utilise de préférence un environnement séparé :

```bash
python3.11 -m venv .venv-marker
source .venv-marker/bin/activate
pip install -r requirements.txt
pip install -r requirements-pdf-marker.txt
```

Si OCRmyPDF est installé dans un environnement séparé :

```bash
export OCRMYPDF_COMMAND="/chemin/vers/python -m ocrmypdf"
```

---

## YouTube

Vidéo unique :

```bash
./runyoutube "https://youtube.com/watch?v=..."
```

Playlist :

```bash
./runyoutube "https://youtube.com/playlist?list=..."
```

Reprendre une playlist déjà commencée :

```bash
./runyoutube "https://youtube.com/playlist?list=..." --resume
```

Tester seulement les premières vidéos :

```bash
./runyoutube "https://youtube.com/playlist?list=..." --limit 2
```

Batch d’URLs :

```bash
./runyoutube --file input/youtube/urls.txt
```

Le traitement playlist est toujours vidéo par vidéo :

- une vidéo = un fichier Markdown ;
- une vidéo = un statut dans le manifest ;
- si une vidéo échoue, la suivante continue ;
- aucune suppression globale de `output/videos/`.

Les anciens scripts Bash dans `run/` sont conservés comme legacy.

---

## Outputs

```txt
output/videos/          résumés de vidéos
output/books/           résumés de PDF/livres
output/graphipy_ready/  exports Markdown prêts pour Graphipy
cache/jobs/             manifests de suivi
```

Les fichiers Graphipy-ready n’incluent pas `model_used` dans le frontmatter.

---

## Nettoyage

Supprimer le cache :

```bash
python3.11 -m src.cli cleanup --cache
```

Supprimer les temporaires :

```bash
python3.11 -m src.cli cleanup --all-temp
```

Supprimer les vieux outputs avec confirmation :

```bash
python3.11 -m src.cli cleanup --outputs --older-than 7
```

Le pipeline ne supprime jamais `input/` sans confirmation explicite.

---

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
docs/
```

---

## Qualité

```bash
python3.11 -m black src tests
python3.11 -m ruff check src tests
python3.11 -m pytest -q
```

La CI GitHub Actions vérifie format, lint, tests et scan de secrets.

---

## Sécurité

Ne jamais committer :

- `.env`
- `cookies.txt`
- PDF utilisateur
- transcripts
- cache
- outputs générés

Le `.gitignore` protège ces fichiers.

<div align="center">

Pipeline local, simple, relançable, sans exposer les sources utilisateur.

</div>
