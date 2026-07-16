# Pipeline

## Vidéo

```txt
URL YouTube
  -> yt-dlp télécharge SRT/VTT dans cache/transcripts/<slug>/
  -> conversion SRT/VTT vers TXT
  -> Gemini résume avec prompts/video_summary.md
  -> output/videos/<video_slug>.md
  -> export optionnel output/graphipy_ready/<video_slug>.md
```

En playlist, les vidéos sont traitées séquentiellement. Chaque vidéo a son propre statut dans `cache/jobs/<playlist_slug>_manifest.json`. Si une vidéo échoue, le pipeline enregistre l’erreur et continue avec la suivante.

## PDF

```txt
PDF dans input/pdf/
  -> analyse de complexité
  -> choix intelligent du moteur PDF
  -> OCRmyPDF, MinerU, Marker ou fallback texte pypdf convertit en Markdown
  -> cache/pdf_md/<book_slug>/
  -> nettoyage Markdown
  -> manifeste SHA-256 et analyse page par page
  -> rendu local + OCR Tesseract si le texte natif est insuffisant
  -> détection tableaux / formules / figures / graphiques / payoff diagrams
  -> contrôles déterministes et evidence packets
  -> vérification visuelle Gemini ciblée si nécessaire
  -> fallback inspectable Codex/humain si l'ambiguïté persiste
  -> sidecar JSON canonique + rapport qualité
  -> comptage tokens
  -> one-shot Gemini si possible
  -> chunking si trop gros
  -> output/books/<book_slug>.md
```

Gemini n'est pas la source de vérité du pipeline technique. Il compare les médias à une
extraction candidate. Une divergence déterministe bloquante ne peut pas être levée par le
modèle visuel. Voir [PDF_EVIDENCE.md](PDF_EVIDENCE.md).

## Chunking

Le chunking préserve les sections Markdown quand c’est possible. Si une section est trop grosse, elle est découpée par paragraphes. Les chunks sont résumés puis fusionnés par une synthèse finale.

## Choix Intelligent Du Moteur PDF

`--engine auto` et `--engine smart` lisent quelques pages du PDF avec `pypdf` pour estimer :

- nombre de pages ;
- densité de texte extractible ;
- présence d’images ;
- indices de tableaux ;
- indices de formules ou notation technique ;
- probabilité de PDF scanné.

Ordre de moteur :

- PDF texte simple : `text -> mineru -> ocrmypdf -> marker`
- PDF moyen ou technique : `mineru -> text -> ocrmypdf -> marker`
- PDF scanné ou livre long : `ocrmypdf -> mineru -> marker -> text`
- PDF visuel / tableaux / formules : `mineru -> ocrmypdf -> marker -> text`

Le pipeline saute automatiquement les moteurs non installés.
