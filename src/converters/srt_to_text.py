from __future__ import annotations

import html
import re
from pathlib import Path

TIMESTAMP_RE = re.compile(r"^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}")
WEBVTT_TIMESTAMP_RE = re.compile(
    r"^\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}\.\d{3}|"
    r"^\d{1,2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}\.\d{3}"
)
TAG_RE = re.compile(r"<[^>]+>")


def subtitle_to_text(subtitle: str) -> str:
    lines: list[str] = []
    seen_consecutive: str | None = None
    for raw_line in subtitle.splitlines():
        line = raw_line.strip()
        if not line or line.isdigit() or line.upper() == "WEBVTT":
            continue
        if TIMESTAMP_RE.match(line) or WEBVTT_TIMESTAMP_RE.match(line):
            continue
        if line.startswith(("NOTE", "STYLE", "REGION")):
            continue
        line = html.unescape(TAG_RE.sub("", line)).strip()
        line = re.sub(r"\s+", " ", line)
        if not line or line == seen_consecutive:
            continue
        lines.append(line)
        seen_consecutive = line
    return "\n".join(lines).strip() + ("\n" if lines else "")


def convert_srt_to_text(input_path: Path, output_path: Path) -> Path:
    text = subtitle_to_text(input_path.read_text(encoding="utf-8", errors="ignore"))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    return output_path
