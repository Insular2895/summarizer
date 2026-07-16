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

## Menu interactif

```bash
./summarizer
```

Le menu propose PDF, vidéo, playlist, batch d'URLs, moteurs PDF, nettoyage cache et usage Gemini.

Installer les moteurs PDF avancés en local :

```bash
./runpdf --setup-engines
./runpdf --engines-status
```

## PDF

Déposer les PDF dans :

```txt
input/pdf/
```

Commande simple :

```bash
./runpdf "input/pdf/mon-livre.pdf"
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

Créer des briefs et prompts Motion MCP sans modifier le mode résumé :

```bash
./runyoutube "https://youtube.com/playlist?list=..." \
  --mode motion-director \
  --product-type "iPhone case" \
  --target-format "9:16" \
  --target-duration "15s" \
  --tutorials-last 8 \
  --mixed-indices "9"
```

Le mode `motion-director` écrit un JSON par vidéo dans `output/motion/`. Pour une playlist,
`--tutorials-last 8` classe les 8 dernières vidéos comme tutoriels et `--mixed-indices "9"` classe
la vidéo 9 comme référence mixte. Les autres vidéos restent des références visuelles.

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

Voir ce qui serait supprimé sans rien effacer :

```bash
python -m src.cli cleanup --cache --dry-run
python -m src.cli cleanup --outputs --older-than 30 --dry-run
```

Après avoir intégré les connaissances utiles dans Maxi Brain, supprimer les transcripts et
extractions temporaires :

```bash
python -m src.cli cleanup --cache
python -m src.cli cleanup --all-temp
python -m src.cli cleanup --outputs --older-than 7
```

Politique recommandée :

- conserver dans Maxi Brain les synthèses, playbooks, checklists, URL et provenance ;
- supprimer régulièrement `cache/`, qui peut toujours être reconstruit ;
- conserver les outputs longs uniquement s'ils sont marqués `keep_cold_source` ;
- déplacer les sources froides importantes sur SSD plutôt que les laisser dans ce repo ;
- ne supprimer `output/` qu'après vérification de l'import dans Maxi Brain.

## Bibliothèque YouTube Canonique

Les transcripts réutilisables sont conservés une seule fois dans :

```txt
library/youtube/<video_id>/
  transcript.txt
  subtitle_source.srt
  metadata.json
```

Le pipeline consulte automatiquement cette bibliothèque avant tout téléchargement. Une même vidéo
peut donc être réanalysée avec un autre prompt sans retélécharger ou dupliquer sa transcription.

`output/videos/`, `output/books/` et `output/motion/` sont des résultats dérivés régénérables.
Ils ne sont pas la source de référence. `output/graphipy_ready/` est réservé aux exports explicites
temporaires et n'est plus généré automatiquement.

Inventorier la bibliothèque :

```bash
python3.11 -m src.cli youtube-library-status
```

Simuler le tri des anciens transcripts :

```bash
python3.11 -m src.cli migrate-youtube-library
```

Appliquer la migration après lecture du rapport :

```bash
python3.11 -m src.cli migrate-youtube-library --apply
```

Réparer les anciennes références déduites depuis les résumés existants :

```bash
python3.11 -m src.cli repair-youtube-library
python3.11 -m src.cli repair-youtube-library --apply
```

Nettoyer les anciens exports redondants et doublons de résumés :

```bash
python3.11 -m src.cli organize-outputs
python3.11 -m src.cli organize-outputs --apply
```

Cette commande range aussi tous les anciens résumés vidéo qui ne viennent pas d'une playlist
identifiée dans `output/videos/playlist-before/`.

Pour placer la bibliothèque sur un SSD, ajouter dans `.env` :

```env
YOUTUBE_LIBRARY_DIR=/Volumes/MonSSD/youtube-library
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
