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

Optionnel, pour préparer les moteurs PDF avancés en local :

```bash
./runpdf --setup-engines
./runpdf --engines-status
```

Ensuite `./runpdf ... --engine smart` active automatiquement le meilleur moteur disponible.

---

## Commandes Essentielles

| Besoin | Commande |
|---|---|
| Menu interactif | `./summarizer` |
| Voir l'aide simple | `./runhelp` |
| Résumer un PDF | `./runpdf "input/pdf/mon-livre.pdf"` |
| Résumer une vidéo | `./runyoutube "https://youtube.com/watch?v=..."` |
| Résumer une playlist | `./runyoutube "https://youtube.com/playlist?list=..."` |
| Lancer un fichier d'URLs | `./runyoutube --file input/youtube/urls.txt` |
| Tester sans écrire | `./runpdf "input/pdf/mon-livre.pdf" --dry-run` |

Toutes les variantes utiles sont dans [COMMANDS.md](COMMANDS.md).

Le menu interactif `./summarizer` propose PDF, vidéo, playlist, batch, moteurs PDF, nettoyage cache et usage Gemini sans retenir les commandes.

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

Pour installer les moteurs avancés dans des environnements locaux séparés :

```bash
./runpdf --setup-engines
```

Cette commande prépare OCRmyPDF, MinerU et Marker sans les mélanger dans la même `.venv`, car certains moteurs peuvent avoir des dépendances incompatibles entre eux.

Vérifier les moteurs disponibles :

```bash
./runpdf --engines-status
```

Important pour macOS : OCRmyPDF peut avoir besoin d'outils système comme `tesseract`, `ghostscript` et `qpdf`. Le plus simple est de passer par Homebrew :

```bash
brew install ocrmypdf
```

Cette commande installe OCRmyPDF avec les dépendances système nécessaires. Si elles sont déjà disponibles, tu peux aussi installer seulement le package Python :

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

## Usage Gemini

Chaque appel Gemini ajoute une ligne dans :

```txt
cache/jobs/gemini_usage.jsonl
```

Voir le résumé :

```bash
python3.11 -m src.cli usage
```

Le coût estimé reste désactivé par défaut. Pour l'activer, renseigne les prix par modèle dans `config/settings.yaml`, section `usage.model_prices_per_1m`.

---

## Nettoyage

```bash
python3.11 -m src.cli cleanup --cache
python3.11 -m src.cli cleanup --all-temp
python3.11 -m src.cli cleanup --outputs --older-than 7
```

Le pipeline ne supprime jamais `input/` sans confirmation explicite.

---

## Évolutions Envisagées

La V1 reste locale-first. Les évolutions suivantes sont prévues comme options, sans remplacer les commandes simples actuelles.

### Docker robuste

Objectif : fournir un environnement reproductible quand une machine locale a des problèmes de dépendances PDF/OCR.

Mode visé :

```bash
./summarizer-docker
./runpdf-docker "input/pdf/mon-livre.pdf"
./runyoutube-docker "https://youtube.com/playlist?list=..."
```

Le container monterait les dossiers locaux :

```txt
input/
output/
cache/
prompts/
.env
```

Avantage : Python, OCRmyPDF, Tesseract, Ghostscript, qpdf et les dépendances système seraient installés dans l'image Docker plutôt que sur la machine utilisateur.

Compromis : l'image peut être lourde, plus longue à télécharger/build, et Docker Desktop reste nécessaire sur Mac.

### Images Docker standard et heavy

Pour éviter une image unique trop lourde :

```txt
Image standard
- Python
- dépendances du pipeline
- yt-dlp
- pypdf
- OCRmyPDF
- tesseract
- ghostscript
- qpdf

Image heavy optionnelle
- image standard
- MinerU
- Marker
- modèles lourds éventuels
```

Le mode standard couvrirait la majorité des usages. Le mode heavy serait réservé aux PDF très complexes.

### Mise à jour contrôlée

Pas d'auto-update silencieux au lancement.

Commande envisagée :

```bash
./update
```

Elle pourrait :

- faire `git pull` ;
- reconstruire l'image Docker avec `docker compose build --pull` ;
- vérifier `.env` ;
- vérifier les moteurs PDF ;
- ne jamais toucher à `input/` ni `output/`.

### Cloud plus tard

Vercel seul n'est pas adapté au coeur du pipeline, car les traitements PDF/OCR/playlists sont longs et lourds.

Options plus adaptées :

- VPS + Docker pour un serveur privé simple ;
- Cloud Run / Fly.io / Railway pour exécuter un container ;
- Vercel uniquement plus tard pour une interface web légère ;
- worker séparé pour les jobs longs si une vraie app cloud est créée.

Architecture cloud possible plus tard :

```txt
Frontend
  -> upload PDF / URL playlist
  -> job queue
  -> worker Docker
  -> Gemini
  -> stockage output
```

Pour l'instant, la priorité reste : local simple, Docker en plan robuste, cloud en V2.

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
