#!/usr/bin/env bash
set -euo pipefail

PLAYLIST_URL="${1:-}"
if [[ -z "$PLAYLIST_URL" ]]; then
  echo "Usage: $0 <playlist_url>"
  exit 1
fi

COOKIES="$HOME/cookies.txt"

PL_ID="$(printf '%s' "$PLAYLIST_URL" | sed -n 's/.*[?&]list=\([^&]*\).*/\1/p')"
if [[ -z "$PL_ID" ]]; then
  echo "Erreur: impossible d'extraire list=... depuis l'URL"
  exit 1
fi

OUTDIR="$HOME/transcripts/$PL_ID"
mkdir -p "$OUTDIR"

echo "Playlist: $PLAYLIST_URL"
echo "Outdir:   $OUTDIR"

TOTAL="$(yt-dlp --cookies "$COOKIES" --flat-playlist --print "%(id)s" "$PLAYLIST_URL" 2>/dev/null | wc -l | tr -d ' ')"
echo "TOTAL items accessibles: $TOTAL"

BATCH=20
START=1
while [[ "$START" -le "$TOTAL" ]]; do
  END=$((START + BATCH - 1))
  if [[ "$END" -gt "$TOTAL" ]]; then END="$TOTAL"; fi
  echo "=== Batch $START-$END ==="

  yt-dlp --cookies "$COOKIES" \
    --skip-download \
    --write-subs --write-auto-subs \
    --sub-langs "en-orig,en" \
    --sub-format "srt" \
    --ignore-errors \
    --sleep-interval 15 --max-sleep-interval 30 \
    --sleep-subtitles 5 \
    --retries 20 --fragment-retries 20 \
    --concurrent-fragments 1 \
    --yes-playlist \
    --playlist-start "$START" --playlist-end "$END" \
    -o "$OUTDIR/%(playlist_index)s - %(title).200B.%(ext)s" \
    "$PLAYLIST_URL"

  COUNT="$(find "$OUTDIR" -type f -name "*.en*.srt" -o -name "*.en-orig*.srt" | wc -l | tr -d ' ')"
  echo "Fichiers .srt EN cumulés: $COUNT"
  
  # ⭐ PAUSE ENTRE LES BATCHES (crucial!)
  if [[ "$END" -lt "$TOTAL" ]]; then
    echo "Pause 30s avant le prochain batch..."
    sleep 30
  fi
  
  START=$((END + 1))
done

echo "Done. Dossier: $OUTDIR"