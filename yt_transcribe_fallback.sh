#!/usr/bin/env bash
set -u

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: ./yt_transcribe_fallback.sh 'https://youtube.com/playlist?list=...'"
  exit 1
fi

COOKIES="$HOME/cookies.txt"
BASE="$HOME/transcripts_fallback"
mkdir -p "$BASE"

LIST_ID="$(echo "$URL" | sed -n 's/.*[?&]list=\([^&]*\).*/\1/p')"
if [[ -n "$LIST_ID" ]]; then
  URL="https://www.youtube.com/playlist?list=$LIST_ID"
fi

IDS="$(yt-dlp --cookies "$COOKIES" --flat-playlist --get-id "$URL" 2>/dev/null || true)"

if [[ -z "$IDS" ]]; then
  IDS="$(yt-dlp --cookies "$COOKIES" --get-id "$URL" 2>/dev/null || true)"
fi

if [[ -z "$IDS" ]]; then
  echo "Impossible de récupérer des IDs (URL invalide ou accès refusé)."
  exit 2
fi

count_ids="$(echo "$IDS" | sed '/^\s*$/d' | wc -l | tr -d ' ')"
echo "Videos to process: $count_ids"
echo "Output base: $BASE"

counter=0
echo "$IDS" | while IFS= read -r id; do
  [[ -z "$id" ]] && continue
  counter=$((counter + 1))
  vurl="https://www.youtube.com/watch?v=$id"
  outdir="$BASE/$id"
  mkdir -p "$outdir"

  echo "=== [$counter/$count_ids] $id ==="

  # ⭐ PAUSE entre chaque vidéo
  if [[ "$counter" -gt 1 ]]; then
    sleep_time=$((5 + RANDOM % 8))  # pause aléatoire 5-12s
    echo "Pause ${sleep_time}s..."
    sleep "$sleep_time"
  fi

  # 1) Tentative: sous-titres YouTube
  yt-dlp --cookies "$COOKIES" \
    --skip-download \
    --write-subs --write-auto-subs \
    --sub-langs all \
    --sub-format srt \
    --ignore-errors \
    --sleep-subtitles 3 \
    --retries 10 \
    -o "$outdir/%(id)s.%(ext)s" \
    "$vurl" >/dev/null 2>&1 || true

  srt_count="$(find "$outdir" -maxdepth 1 -name "*.srt" 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$srt_count" -gt 0 ]]; then
    best_srt="$(ls -S "$outdir"/*.srt 2>/dev/null | head -n 1 || true)"
    if [[ -n "$best_srt" ]]; then
      python3 - <<PY
import re, pathlib
p = pathlib.Path(r"$best_srt")
txt = p.read_text(errors="ignore")
txt = re.sub(r"^\d+\s*$", "", txt, flags=re.M)
txt = re.sub(r"^\d{2}:\d{2}:\d{2},\d{3} --> .*?$", "", txt, flags=re.M)
txt = re.sub(r"\n{3,}", "\n\n", txt).strip() + "\n"
(pathlib.Path(r"$outdir") / (p.stem + ".txt")).write_text(txt)
print("SUBS_OK:", p.name)
PY
    fi
    continue
  fi

  # 2) Fallback: audio -> whisper local
  echo "No YouTube subs -> Whisper fallback"

  yt-dlp --cookies "$COOKIES" \
    -x --audio-format mp3 \
    --ignore-errors \
    --retries 10 \
    -o "$outdir/%(id)s.%(ext)s" \
    "$vurl" >/dev/null 2>&1 || true

  mp3="$(ls "$outdir"/*.mp3 2>/dev/null | head -n 1 || true)"
  if [[ -z "$mp3" ]]; then
    echo "AUDIO_FAIL (private/blocked?): $id"
    continue
  fi

  WHISPER_BIN="$(command -v whisper || true)"
  if [[ -z "$WHISPER_BIN" && -x "$HOME/Library/Python/3.9/bin/whisper" ]]; then
    WHISPER_BIN="$HOME/Library/Python/3.9/bin/whisper"
  fi
  if [[ -z "$WHISPER_BIN" ]]; then
    echo "WHISPER_NOT_FOUND"
    continue
  fi

  "$WHISPER_BIN" "$mp3" \
    --model turbo \
    --output_format txt \
    --output_dir "$outdir" >/dev/null 2>&1 || true

  txt="$(ls "$outdir"/*.txt 2>/dev/null | head -n 1 || true)"
  if [[ -n "$txt" ]]; then
    mv -f "$txt" "$outdir/$id.whisper.txt"
    echo "WHISPER_OK: $id.whisper.txt"
  else
    echo "WHISPER_FAIL: $id"
  fi
done

echo "Done. Base folder: $BASE"