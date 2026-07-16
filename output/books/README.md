# Lecture PDF et livres

Pour chaque PDF traité, le fichier principal `<nom>.md` est le vrai résumé Gemini, lisible et
structuré comme un résumé YouTube. Il ne s'agit pas seulement d'une extraction de texte.

Les autres fichiers ont un rôle précis :

| Fichier | Rôle |
|---|---|
| `<nom>.md` | résumé intelligent du livre ou document |
| `<nom>.transcription.md` | texte extrait nettoyé, à contrôler si nécessaire |
| `<nom>.quality.json` | qualité de l'extraction et alertes |
| `<nom>.sidecar.json` | données techniques canoniques |
| `<nom>.evidence/` | pages, crops et preuves visuelles ciblées |
| `<nom>.summary-error.json` | diagnostic si Gemini n'a pas pu produire le résumé |

Commencer par `<nom>.md`. Ouvrir la transcription et les preuves uniquement pour vérifier une
information, une page, un tableau ou une figure.
