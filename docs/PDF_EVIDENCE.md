# Preuves PDF techniques V2

## But et limite

Ce pipeline complète la transcription Markdown par une couche de preuves pour les livres
techniques. Il vise en priorité les erreurs dangereuses : signe perdu, décimale déplacée,
colonne décalée, formule altérée ou page mal référencée.

Le PDF source est ouvert en lecture seule. Son SHA-256 est calculé avant le traitement puis
contrôlé à la fin. Le JSON sidecar est canonique pour les éléments techniques ; le Markdown
reste une vue de lecture et ne doit pas être utilisé seul pour une règle quantitative.

## Orchestration

```text
PDF immuable
  -> texte natif + rendu local
  -> OCR Tesseract si le texte natif est trop faible
  -> détection des régions complexes
  -> contrôles déterministes
  -> page + crop + extraction candidate
  -> Gemini visuel avec JSON strict
  -> paquet de fallback Codex/humain si non résolu
```

Gemini ne reçoit jamais le livre entier dans une demande vague. Chaque appel concerne un
élément identifié et deux médias : la page complète et le crop normalisé. Sa réponse doit
respecter exactement `schemas/pdf-evidence/gemini_visual_review.schema.json` ainsi que les
contrôles Python. Une réponse invalide est conservée, puis réparée une seule fois.

Codex n'est pas une seconde source de vérité. Le fallback écrit `fallback_request.json` avec
les chemins des preuves et une commande d'inspection. Une revue doit être écrite séparément.
Le sidecar et le Markdown d'origine ne sont jamais écrasés : une validation humaine explicite
produit un nouveau sidecar `.resolved.sidecar.json` et une vue `.verified.md` contenant la
lecture canonique corrigée. L'OCR erroné reste conservé dans le sidecar pour l'audit.

## Sorties

Pour `output/books/exemple.md` :

```text
output/books/exemple.transcription.md
output/books/exemple.sidecar.json
output/books/exemple.quality.json
output/books/exemple.evidence/manifest.json
output/books/exemple.evidence/<element_id>/
  full_page_original.png
  full_page_preprocessed.png
  element_crop_original.png
  element_crop_normalized.png
  native_text.txt
  ocr_text.txt
  extraction_candidate.json
  metadata.json
  gemini_review.json                 # si l'appel a abouti
  gemini_review_invalid_attempt.json # si la première réponse était invalide
  fallback_request.json              # si une revue reste nécessaire
```

La pagination conserve simultanément :

- `pdf_page_index` : index technique à partir de 0 ;
- `pdf_page_number` : page PDF à partir de 1 ;
- `printed_page_raw` et `printed_page_normalized` : pagination visible, si détectable ;
- un score de confiance séparé pour cette correspondance.

## Statuts

| Statut | Sens opérationnel |
|---|---|
| `machine_verified` | Contrôles locaux suffisants pour un contenu non critique. |
| `machine_verified_with_visual_check` | Contrôles locaux et lecture visuelle concordent. |
| `machine_reviewed` | Revue de fallback structurée effectuée. |
| `human_verified` | Lecture corrigée et approuvée explicitement à partir des preuves. |
| `needs_visual_review` | Ambiguïté non résolue ; ne pas utiliser quantitativement. |
| `human_review_required` | Gemini indisponible, invalide ou insuffisant. |
| `blocked` | Divergence critique ou contrôle déterministe échoué. |
| `unextractable` | Élément illisible. |
| `image_only` | Figure décrite mais données non numérisées. |

Les contrôles déterministes ont priorité. `column_shift_risk` et
`arithmetic_check_failed` produisent `blocked`. Une différence de signature numérique entre
l'OCR et la lecture visuelle bloque également l'élément.

Les scores restent séparés (`text`, `layout`, `table_structure`, `numeric`, `formula`,
`page_mapping`). Il n'existe pas de moyenne globale pouvant masquer un signe incertain.

## Commandes

Traitement complet :

```bash
./runpdf "/chemin/vers/livre.pdf" --engine smart --overwrite
```

Diagnostic local sans Gemini :

```bash
./.venv/bin/python -m src.cli run-pdf "/chemin/vers/livre.pdf" \
  --no-visual-review --max-pages 10 --overwrite
```

Inspection ciblée :

```bash
./pdf-evidence inspect "/chemin/vers/livre.pdf" \
  --pdf-page 132 \
  --element-id p000132-table-7-2 \
  --dpi 450 \
  --include-context \
  --open-images
```

Une bounding box manuelle peut être fournie au format `x0,y0,x1,y1` si un élément n'a pas
été détecté automatiquement :

```bash
./pdf-evidence inspect "livre.pdf" --pdf-page 132 --bbox "80,100,520,700"
```

Création d'un formulaire de revue, puis production des sorties corrigées :

```bash
./pdf-evidence review-template "livre.sidecar.json" \
  --element-id p000132-table-7-2 \
  --visual-review evidence/p000132-table-7-2/gemini_review.json \
  --output evidence/p000132-table-7-2/human_review.json

# Un humain contrôle les preuves, corrige le JSON et remplace `pending` par
# `approve_corrected_structure` ou `keep_blocked`.

./pdf-evidence resolve "livre.sidecar.json" \
  --review evidence/p000132-table-7-2/human_review.json
```

La sortie vérifiée n'utilise que `canonical_extraction`. Par exemple, si l'OCR avait lu
`Theta +0.50` et que l'image validée montre `Theta -0.50`, le sidecar résolu conserve les deux
faits séparément : `raw_ocr = +0.50` pour l'audit et `canonical_extraction = -0.50` pour
l'usage. Le Markdown `.verified.md` publie seulement `-0.50`. Gemini ou Codex ne peuvent pas
promouvoir seuls une valeur critique ; seul un fichier de revue humaine explicite le peut.

## Politique figures et formules

Une figure peut être extraite et décrite sans être numérisée. Sans calibration explicite des
axes et des séries, `data_digitized` reste `false` et le statut reste `image_only`.

Une formule conserve son OCR brut, sa structure candidate et ses ambiguïtés. Ni Gemini ni le
fallback ne peuvent la remplacer par la formule théorique attendue sans preuve visuelle.

## Validation

Les tests couvrent notamment :

- signes `+` / `-`, décimales et fractions ;
- calculs explicites et décalages de colonnes ;
- pagination PDF distincte de la pagination imprimée ;
- tableaux tournés et rotations ;
- JSON Gemini invalide ou avec clés non conformes ;
- collision d'identifiants de figures ;
- référence de figure dans le corps du texte ;
- génération du fallback sans mutation de la source.

Le manifeste du golden set est dans `tests/golden/pdf_evidence/manifest.json`. Les PDF et
captures protégés restent locaux et hors Git. Les références humaines versionnées sont dans
`tests/golden/pdf_evidence/annotations/` et sont associées au PDF par son SHA-256.

Les cas G01 à G19 forment une matrice de régression : chaque identifiant représente une
difficulté connue (scan propre, page inclinée, tableau tourné, signe décimal, fraction,
formule, payoff, graphique multi-séries, échec Gemini, etc.). Chaque cas possède désormais un
test reproductible nommé dans le manifeste. Selon le cas, le test utilise une fixture
synthétique, une panne simulée ou une annotation de page réelle. À chaque modification du
pipeline, il vérifie que le résultat est soit correct et fiable, soit explicitement bloqué.

La couverture de la matrice se contrôle séparément :

```bash
./pdf-evidence regression \
  --output cache/pdf_evidence_golden/regression-report.json
```

Le 2026-07-16, les 19 cas sur 19 sont couverts par une régression locale déterministe. Huit
familles de difficultés sur 19 ont en plus une annotation réelle Passarelli associée. Cette
distinction est volontaire : `synthetic_regression_coverage = 1.0` prouve que les garde-fous
réagissent comme prévu ; elle ne prétend pas que chaque variante de scan réel possible a déjà
été observée.

| Cas | Risque couvert | Comportement exigé |
|---|---|---|
| G01-G02 | texte natif et scan propre | structure et valeurs conservées |
| G03-G05 | inclinaison, faible contraste, rotation | revue visuelle obligatoire |
| G06-G08 | en-têtes, signes, fractions | colonnes et représentation brute conservées |
| G09-G11 | formule, payoff, graphique | ambiguïté bloquée ou `image_only` |
| G12-G15 | annotations et contexte inter-page | alerte et contexte de preuve |
| G16-G19 | erreurs Gemini et fallback Codex | aucune promotion silencieuse ; revue humaine |

Le corpus Passarelli actif couvre actuellement cinq cas ciblés : Greeks signés long gamma,
calcul de gamma scalping, Greeks signés short gamma, payoff positif-gamma et graphique IV/RV.
Il peut être mesuré sans modifier la transcription :

```bash
./pdf-evidence score output.sidecar.json \
  --output output.golden-report.json
```

Deux résultats doivent toujours être lus ensemble :

- `dangerous_quantitative_errors_accepted_without_alert` doit rester à zéro ;
- `trusted_coverage` doit augmenter vers 100 %. Une valeur bloquée est sûre, mais elle n'est
  pas encore une valeur validée.

La première métrique signifie concrètement qu'un signe faux, une décimale fausse ou une valeur
placée dans la mauvaise colonne ne peut jamais recevoir un statut de confiance sans alerte. Un
blocage est sûr mais incomplet ; la commande `resolve` permet ensuite de transformer la preuve
humaine en valeur canonique réellement exploitable, sans effacer la lecture machine fautive.

Le test réel ciblé du 2026-07-16 a détecté les cinq éléments attendus et n'a accepté aucune
erreur dangereuse sans alerte. Sans seconde lecture, 14 assertions sur 18 sont restées bloquées
ou absentes : le résultat est donc `safe_but_incomplete`, et non « parfait ». Un appel Gemini
réel sur la figure 13.1 a reçu les deux images, produit un JSON valide et lu correctement
`Delta 0`, `Gamma +2.80`, `Theta -0.50`, `Vega +1.15`. Ces valeurs restent non promues
automatiquement lorsque l'OCR local n'apporte pas une confirmation indépendante. Après revue
humaine de la preuve liée au SHA-256 du PDF, le resolveur a produit un sidecar canonique et un
Markdown vérifié avec ces quatre valeurs, ainsi que la pagination corrigée PDF 273 / imprimée
249. La couverture fiable mesurée est désormais de 4 assertions sur 18 ; les dix assertions
incorrectes ou absentes restantes sont toutes signalées et exclues de l'usage quantitatif.
