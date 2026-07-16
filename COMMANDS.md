# Commandes

Ce fichier sert de mémo rapide. Les commandes sont à lancer depuis la racine du repo.

## Setup

Le setup de base est automatique.

Au premier lancement, `./runpdf` ou `./runyoutube` :

- crée `.venv` si besoin ;
- installe `requirements.txt` ;
- crée `.env` depuis `.env.example` si besoin.

La seule étape manuelle est d'ajouter la clé Gemini dans `.env` :

```env
GEMINI_API_KEY=ta_vraie_cle_api
```

Le fournisseur par défaut est Gemini. Pour utiliser une autre IA, configure `LLM_PROVIDER`,
`LLM_API_KEY`, `LLM_BASE_URL` si nécessaire et les variables `LLM_MODEL_...`. Voir le README pour
les exemples OpenAI-compatible et Anthropic.

## Menu interactif

```bash
./summarizer
```

Le menu propose PDF, YouTube (vidéo ou playlist), batch d'URLs, moteurs PDF, nettoyage cache et usage Gemini.
Après chaque job, il revient automatiquement au menu. La commande unique à retenir est `./summarizer`.

Installer les moteurs PDF avancés en local :

```bash
./runpdf --setup-engines
./runpdf --engines-status
```

## PDF

Depuis le menu, choisir `1. Résumer un PDF`. Si aucun PDF n'est trouvé, le dossier suivant s'ouvre
automatiquement quand le système le permet :

```txt
input/pdf/
```

Dépose le fichier dans ce dossier puis appuie sur Entrée. Tu peux aussi coller directement son chemin
dans le terminal. Une consigne vide produit une lecture neutre chapitre par chapitre ; une consigne
personnalisée produit un résumé orienté par ta question.

Commande simple :

```bash
./runpdf "input/pdf/mon-livre.pdf"
```

Sans consigne, le résultat est une lecture neutre chapitre par chapitre. Pour demander une
analyse ciblée :

```bash
./runpdf "input/pdf/mon-livre.pdf" \
  --instruction "Explique les concepts utiles pour construire une stratégie de couverture du risque."
```

Dry-run :

```bash
./runpdf "input/pdf/mon-livre.pdf" --dry-run
```

Test rapide sur les 10 premières pages :

```bash
./runpdf "input/pdf/mon-livre.pdf" --max-pages 10 --overwrite
```

Le pipeline de preuves techniques et la vérification visuelle Gemini sont actifs par défaut.
Pour isoler un diagnostic local sans appel visuel :

```bash
./.venv/bin/python -m src.cli run-pdf "input/pdf/mon-livre.pdf" \
  --no-visual-review --overwrite
```

Pour désactiver entièrement les preuves techniques (résumé classique uniquement) :

```bash
./.venv/bin/python -m src.cli run-pdf "input/pdf/mon-livre.pdf" \
  --no-technical-evidence --overwrite
```

Inspecter une page précise sans modifier le PDF ni la transcription :

```bash
./pdf-evidence inspect "/chemin/vers/livre.pdf" \
  --pdf-page 132 \
  --element-id p000132-table-7-2 \
  --dpi 450 \
  --include-context \
  --open-images
```

`--pdf-page` désigne toujours la page PDF, à partir de 1. Le paquet écrit sous
`cache/pdf_evidence_inspection/` conserve séparément la page PDF et la page imprimée détectée.

Vérifier que les 19 garde-fous de régression sont tous reliés à un test nommé :

```bash
./pdf-evidence regression \
  --output cache/pdf_evidence_golden/regression-report.json
```

Comparer un sidecar local aux annotations humaines disponibles, sans modifier la
transcription :

```bash
./pdf-evidence score "output/books/mon-livre.sidecar.json" \
  --output cache/pdf_evidence_golden/mon-livre-score.json
```

Une correction quantitative ne peut être promue qu'avec une revue humaine explicite :

```bash
./pdf-evidence review-template "output/books/mon-livre.sidecar.json" \
  --element-id p000132-table-7-2 \
  --visual-review "output/books/mon-livre.evidence/p000132-table-7-2/gemini_review.json" \
  --output "cache/pdf_evidence_reviews/p000132-table-7-2.human-review.json"

# Après contrôle et approbation explicite du JSON de revue :
./pdf-evidence resolve "output/books/mon-livre.sidecar.json" \
  --review "cache/pdf_evidence_reviews/p000132-table-7-2.human-review.json"
```

`resolve` crée de nouveaux fichiers `.resolved.sidecar.json` et `.verified.md`. Il ne
modifie ni le PDF, ni l'OCR brut, ni la transcription initiale.

PDF hors du repo :

```bash
./runpdf "/chemin/vers/mon-livre.pdf"
```

Choix intelligent explicite :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine smart
```

Forcer un moteur :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine mineru
./runpdf "input/pdf/mon-livre.pdf" --engine ocrmypdf
./runpdf "input/pdf/mon-livre.pdf" --engine marker
./runpdf "input/pdf/mon-livre.pdf" --engine text
```

OCR en français, si les données Tesseract françaises sont installées :

```bash
./runpdf "input/pdf/mon-livre.pdf" --engine ocrmypdf --ocr-language fra
```

Important pour macOS : OCRmyPDF peut avoir besoin d'outils système comme `tesseract`, `ghostscript` et `qpdf`.

Sur Mac, le plus simple :

```bash
./runpdf --setup-engines
brew install ocrmypdf
```

Si les dépendances système sont déjà présentes :

```bash
pip install -r requirements-pdf-ocrmypdf.txt
```

OCRmyPDF dans un environnement séparé :

```bash
export OCRMYPDF_COMMAND="/chemin/vers/python -m ocrmypdf"
```

Installer MinerU :

```bash
./runpdf --setup-engines
mineru-models-download --source modelscope --model_type pipeline
```

Installer Marker :

```bash
./runpdf --setup-engines
```

## YouTube

Vidéo :

```bash
./runyoutube "https://youtube.com/watch?v=..."
```

Playlist :

```bash
./runyoutube "https://youtube.com/playlist?list=..."
```

Playlist locale legacy :

```bash
./runyoutube "playlists/nom-de-la-playlist"
```

Tester une seule vidéo d’une playlist locale :

```bash
./runyoutube "playlists/nom-de-la-playlist" --limit 1
```

Tester seulement les 2 premières vidéos d’une playlist YouTube :

```bash
./runyoutube "https://youtube.com/playlist?list=..." --limit 2
```

Reprendre un job :

```bash
./runyoutube "https://youtube.com/playlist?list=..." --resume
```

Écraser un output existant :

```bash
./runyoutube "playlists/nom-de-la-playlist" --overwrite
```

## Batch URLs

Créer :

```txt
input/youtube/urls.txt
```

Puis lancer :

```bash
./runyoutube --file input/youtube/urls.txt
```

## Cleanup

```bash
python -m src.cli cleanup --cache
python -m src.cli cleanup --all-temp
python -m src.cli cleanup --outputs --older-than 7
```

## Aide Rapide

```bash
./runhelp
```

## Résultats

```txt
output/videos/
output/books/
output/graphipy_ready/
cache/jobs/
```

## Usage Gemini

```bash
python3.11 -m src.cli usage
```

Le log local est dans :

```txt
cache/jobs/gemini_usage.jsonl
```
