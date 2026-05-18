<div align="center">

<img src="docs/assets/readme-hero.svg" alt="Summarizer - pipeline local YouTube et PDF vers Markdown" width="100%" />

<h1>Summarizer</h1>

<p>
  <a href="https://github.com/yt-dlp/yt-dlp"><img src="docs/assets/badge-ytdlp-animated.svg" alt="powered by yt-dlp" height="28" /></a>
  <a href="https://www.gnu.org/software/bash/"><img src="docs/assets/badge-shell-bash-animated.svg" alt="Shell Bash" height="28" /></a>
  <a href="https://www.apple.com/macos/"><img src="docs/assets/badge-platform-macos-animated.svg" alt="Platform macOS" height="28" /></a>
</p>

**Pipeline local pour transformer YouTube, playlists et PDF en résumés Markdown propres avec Gemini.**

`input/` pour déposer les sources. `output/` pour récupérer les résultats. `prompts/` pour piloter le style.

</div>

---

## Démarrage Rapide

```bash
git clone https://github.com/Insular2895/summarizer.git
cd summarizer
./runhelp
```

Au premier lancement, `./runpdf` et `./runyoutube` créent automatiquement `.venv` et installent les dépendances de base.

Il reste une seule étape manuelle : ajouter ta clé Gemini dans `.env`.

Si `.env` n'existe pas encore, la première commande le crée depuis `.env.example`, puis te demande d'ajouter :

```env
GEMINI_API_KEY=ta_cle_api_gemini
```

`.env` est privé et ignoré par Git.

---

## Commandes Essentielles

| Besoin | Commande |
|---|---|
| Voir l'aide simple | `./runhelp` |
| Résumer un PDF | `./runpdf "input/pdf/mon-livre.pdf"` |
| Résumer une vidéo | `./runyoutube "https://youtube.com/watch?v=..."` |
| Résumer une playlist | `./runyoutube "https://youtube.com/playlist?list=..."` |
| Lancer un fichier d'URLs | `./runyoutube --file input/youtube/urls.txt` |
| Tester sans écrire | `./runpdf "input/pdf/mon-livre.pdf" --dry-run` |

Toutes les variantes utiles sont dans [COMMANDS.md](COMMANDS.md).

Pour une correction future par une IA ou un assistant de code, le point d'entrée est [AGENTS.md](AGENTS.md) et le guide complet est dans [AI_MAINTENANCE.md](AI_MAINTENANCE.md).

---

## Ce Que Fait Le Pipeline

```txt
YouTube / PDF
  -> extraction, transcription ou OCR
  -> nettoyage texte / Markdown
  -> résumé Gemini
  -> Markdown final
  -> export Graphipy-ready
```

| Dossier | Rôle |
|---|---|
| `input/youtube/` | URLs YouTube et playlists à traiter |
| `input/pdf/` | PDF ou livres à analyser |
| `cache/` | fichiers temporaires supprimables |
| `output/videos/` | résumés vidéo |
| `output/books/` | résumés PDF/livres |
| `output/graphipy_ready/` | Markdown prêt pour Graphipy |
| `prompts/` | prompts Gemini modifiables |

La V1 reste volontairement locale : pas de dashboard, pas de base de données, pas de SaaS.

---

## PDF

Dépose ton fichier dans :

```txt
input/pdf/
```

Puis lance :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine smart
```

Le mode `smart` choisit automatiquement le meilleur plan :

| Type de PDF | Stratégie |
|---|---|
| PDF texte simple | `text -> mineru -> ocrmypdf -> marker` |
| PDF long ou dense | `mineru -> text -> ocrmypdf -> marker` |
| Livre scanné | `ocrmypdf -> mineru -> marker -> text` |
| PDF visuel, tableaux, formules | `mineru -> ocrmypdf -> marker -> text` |

Commandes pratiques :

```bash
./runpdf "input/pdf/mon-livre.pdf" --max-pages 10 --overwrite
./runpdf "input/pdf/mon-livre.pdf" --engine ocrmypdf --ocr-language fra
./runpdf "input/pdf/mon-livre.pdf" --engine mineru
./runpdf "input/pdf/mon-livre.pdf" --engine marker
```

Résultats :

```txt
output/books/
output/graphipy_ready/
```

---

## Moteurs PDF

Le fallback texte `pypdf` est inclus dans l'installation de base.

Pour les livres scannés longs, OCRmyPDF est recommandé :

```bash
brew install ocrmypdf
```

Ou, si les dépendances système sont déjà disponibles :

```bash
pip install -r requirements-pdf-ocrmypdf.txt
```

Pour les PDF complexes avec mise en page riche :

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

Playlist complète :

```bash
./runyoutube "https://youtube.com/playlist?list=..."
```

Reprendre une playlist :

```bash
./runyoutube "https://youtube.com/playlist?list=..." --resume
```

Tester seulement les premières vidéos :

```bash
./runyoutube "https://youtube.com/playlist?list=..." --limit 2
```

Le traitement playlist est sécurisé :

- une vidéo = un fichier Markdown ;
- une vidéo = un statut dans le manifest ;
- si une vidéo échoue, la suivante continue ;
- aucune suppression globale de `output/videos/`.

Les anciens scripts Bash dans `run/` sont conservés comme legacy.

---

## Sorties Markdown

Les fichiers finaux sont lisibles directement et compatibles Graphipy.

```txt
output/videos/          résumés de vidéos
output/books/           résumés de PDF/livres
output/graphipy_ready/  exports Markdown prêts pour Graphipy
cache/jobs/             manifests de suivi
```

Les fichiers Graphipy-ready n'incluent pas `model_used` dans le frontmatter.

---

## Nettoyage

```bash
python3.11 -m src.cli cleanup --cache
python3.11 -m src.cli cleanup --all-temp
python3.11 -m src.cli cleanup --outputs --older-than 7
```

Le pipeline ne supprime jamais `input/` sans confirmation explicite.

---

## Qualité Et Sécurité

```bash
python3.11 -m black src tests
python3.11 -m ruff check src tests
python3.11 -m pytest -q
detect-secrets scan $(git ls-files -co --exclude-standard)
```

Ne jamais committer :

- `.env`
- `cookies.txt`
- PDF utilisateur
- transcripts
- cache
- outputs générés

Le `.gitignore` protège ces fichiers et la CI GitHub Actions vérifie format, lint, tests et scan de secrets.

<div align="center">

**Local. Simple. Relançable. Sans exposer les sources utilisateur.**

</div>
