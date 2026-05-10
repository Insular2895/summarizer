#!/usr/bin/env bash
set -euo pipefail

PLAYLIST="https://www.youtube.com/playlist?list=PLuSyKaki_miQMpnmUJquGLBexamQ5ntV0"
OUTDIR="$HOME/transcripts/PLuSyKaki_miQMpnmUJquGLBexamQ5ntV0"
COOKIES="$HOME/cookies.txt"
STEP=20

mkdir -p "$OUTDIR"

# Récupère le nombre total d’items de la playlist (évite de le saisir à la main)
TOTAL="$(yt-dlp --cookies "$COOKIES" --flat-playlist --print "%(id)s" "$PLAYLIST" | wc -l | tr -d ' ')"
echo "TOTAL items: $TOTAL"

for ((start=1; start<=TOTAL; start+=STEP)); do
  end=$((start+STEP-1))
  if (( end > TOTAL )); then end=$TOTAL; fi

  echo "=== Batch ${start}-${end} ==="

  yt-dlp --cookies "$COOKIES" \
    --skip-download \
    --write-auto-subs \
    --sub-langs en \
    --sub-format srt \
    --ignore-errors \
    --sleep-interval 12 --max-sleep-interval 25 \
    --retries 10 \
    --playlist-start "$start" --playlist-end "$end" \
    -o "$OUTDIR/%(playlist_index)s - %(title).200B.%(ext)s" \
    "$PLAYLIST" | tee -a "$OUTDIR/yt-dlp.log"

  if tail -n 200 "$OUTDIR/yt-dlp.log" | grep -q "HTTP Error 429"; then
    echo "429 détecté sur le batch ${start}-${end}. Stop."
    exit 2
  fi

  count=$(find "$OUTDIR" -type f -name "*.srt" | wc -l | tr -d ' ')
  echo "Fichiers .srt actuels: $count"
done

echo "Done. Dossier: $OUTDIR"
