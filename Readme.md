# Summarizer

## Transforme une vidéo ou un livre en connaissance utilisable

Summarizer est un outil local qui transforme des vidéos YouTube, des playlists et des PDF complexes
en documents Markdown clairs, structurés et réellement exploitables.

L'objectif n'est pas de produire un résumé générique. L'outil préserve les concepts, les méthodes,
les exemples, les limites et les points incertains pour rendre une expertise compréhensible,
vérifiable et réutilisable.

```text
Une source difficile à lire
        -> extraction robuste
        -> transcription / OCR / analyse visuelle
        -> synthèse claire
        -> connaissance prête à utiliser
```

## Pourquoi c'est puissant

- Un PDF peut être natif, scanné, rempli de tableaux, de formules ou de graphiques.
- Une playlist est traitée vidéo par vidéo, avec reprise possible si le traitement est interrompu.
- Sans question précise, le PDF devient une lecture neutre, chapitre par chapitre.
- Avec une consigne, le même document devient une analyse ciblée sur ton problème.
- Les preuves et contrôles techniques restent disponibles pour vérifier les résultats, sans encombrer
  la lecture principale.
- Tout fonctionne localement : tes documents, transcriptions et sorties restent sur ta machine.

## Installation et lancement

```bash
git clone https://github.com/Insular2895/summarizer.git
cd summarizer
cp .env.example .env
./summarizer
```

Ajoute ensuite ta clé dans `.env` :

```env
GEMINI_API_KEY=ta_cle_api_gemini
```

Le menu devient le point d'entrée unique. Il reste ouvert après chaque job : choisis une nouvelle
action ou `8` pour quitter.

> GitHub ne peut pas exécuter automatiquement un programme après un téléchargement. L'utilisateur
> ne retient donc qu'une seule commande : `./summarizer`.

## Utilisation

### PDF

Choisis `1` dans le menu. Si aucun PDF n'est présent, Summarizer ouvre le dossier `input/pdf/`.
Dépose ton fichier, appuie sur Entrée, puis choisis le mode de lecture.

Par défaut, tu obtiens une lecture neutre et précise, chapitre par chapitre. Tu peux aussi donner
une consigne, par exemple :

```bash
./runpdf "input/pdf/mon-livre.pdf" \
  --instruction "Explique les méthodes utiles pour construire un outil de gestion du risque."
```

Le résultat principal se trouve dans `output/books/`. Les fichiers techniques de preuve, de qualité
et de transcription restent disponibles pour l'audit, mais ne gênent pas la lecture.

### YouTube

Choisis `2`, puis colle une URL. Une vidéo seule ou une playlist est détectée automatiquement :

```bash
./runyoutube "https://youtube.com/watch?v=..."
./runyoutube "https://youtube.com/playlist?list=..."
```

Les transcriptions sont réutilisées localement afin d'éviter les téléchargements inutiles. Les
résumés finaux sont écrits dans `output/videos/`.

## Étude de cas : Trading Option Greeks

Pour montrer la différence entre un simple résumé et une vraie base de connaissance, nous avons
traité *Trading Option Greeks* de Dan Passarelli, un ouvrage technique de **357 pages** consacré aux
options, à la volatilité et à la gestion des risques.

Le document combinait texte, pages scannées, formules, graphiques et payoffs. Le pipeline a réalisé :

- **354 pages OCR** lorsque l'extraction native était insuffisante ;
- **197 éléments complexes détectés**, notamment des figures, formules et graphiques ;
- **14 contrôles visuels Gemini** sur des preuves ciblées ;
- une transcription auditable, un rapport de qualité et une synthèse finale lisible.

La sortie ne se contente pas d'énumérer des chapitres. Elle rend compréhensibles les Greeks,
la volatilité implicite et réalisée, le delta-neutral, le gamma scalping, les spreads, les straddles,
les strangles et les risques d'exécution.

Cette connaissance peut ensuite servir à concevoir des outils spécialisés :

```text
Expertise métier
  -> concepts et mécanismes
  -> scénarios et exemples
  -> hypothèses et limites
  -> spécification d'un outil
  -> tests et validation humaine
```

Par exemple, elle peut alimenter un calculateur de Greeks, un moteur de scénarios de risque, un
analyseur de volatilité ou un système de garde-fous. Le livre ne devient jamais automatiquement
une décision financière : les points ambigus restent signalés et doivent être validés.

C'est la vocation de Summarizer : transformer une connaissance experte difficile à transmettre en
matière première claire pour apprendre, documenter et construire des outils plus précis.

## Léger par défaut, puissant à la demande

L'installation standard reste légère. Les moteurs avancés pour les PDF scannés ou très complexes
ne sont pas imposés à tout le monde. Si un document en a besoin, le terminal propose clairement
d'installer le pack recommandé **OCRmyPDF + MinerU + Marker**, ou d'annuler.

Une image Docker reproductible est également disponible :

```bash
cp .env.example .env
docker compose build
docker compose run --rm summarizer run-pdf input/pdf/mon-livre.pdf
docker compose run --rm summarizer run-youtube "https://youtube.com/..."
```

## Organisation simple

```text
input/       tes PDF et URLs
output/      les résultats lisibles
cache/       les fichiers temporaires
prompts/     les consignes modifiables
.env         ta configuration privée
```

Les données personnelles, PDF, caches, outputs et bibliothèques locales ne sont pas destinés à être
publiés dans GitHub.

## Commandes utiles

| Besoin | Commande |
|---|---|
| Ouvrir le menu | `./summarizer` |
| Voir l'aide | `./runhelp` |
| Résumer un PDF | `./runpdf "input/pdf/mon-livre.pdf"` |
| Résumer une vidéo ou playlist | `./runyoutube "https://youtube.com/..."` |
| Vérifier les moteurs PDF | `./runpdf --engines-status` |
| Nettoyer le cache | `./.venv/bin/python -m src.cli cleanup --cache` |

Pour les options avancées, consulte [COMMANDS.md](COMMANDS.md).

## Licence et sécurité

Le projet est conçu pour fonctionner localement et garder les sources privées. Ne commit jamais
`.env`, des clés API, des PDF, des cookies ou des sorties personnelles.
