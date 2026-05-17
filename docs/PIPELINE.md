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
  -> MinerU ou Marker convertit en Markdown
  -> cache/pdf_md/<book_slug>/
  -> nettoyage Markdown
  -> comptage tokens
  -> one-shot Gemini si possible
  -> chunking si trop gros
  -> output/books/<book_slug>.md
```

## Chunking

Le chunking préserve les sections Markdown quand c’est possible. Si une section est trop grosse, elle est découpée par paragraphes. Les chunks sont résumés puis fusionnés par une synthèse finale.
