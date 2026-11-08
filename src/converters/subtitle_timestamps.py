from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path

TAG_RE = re.compile(r"<[^>]+>")
TIMING_RE = re.compile(
    r"(?P<start>(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s+-->\s+"
    r"(?P<end>(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$"
)


@dataclass(frozen=True, slots=True)
class TimestampedTextBlock:
    block_index: int
    start_ms: int
    end_ms: int
    text: str


def subtitle_file_to_blocks(path: Path) -> list[TimestampedTextBlock]:
    return subtitle_to_blocks(path.read_text(encoding="utf-8", errors="ignore"))


def subtitle_to_blocks(subtitle: str) -> list[TimestampedTextBlock]:
    """Parse SRT or WebVTT cues while keeping the plain-text converter unchanged."""
    normalized = subtitle.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    blocks: list[TimestampedTextBlock] = []
    previous_text: str | None = None

    for cue in re.split(r"\n\s*\n", normalized):
        lines = [line.strip() for line in cue.splitlines() if line.strip()]
        timing_index = next(
            (index for index, line in enumerate(lines) if TIMING_RE.fullmatch(line)), None
        )
        if timing_index is None:
            continue
        timing = TIMING_RE.fullmatch(lines[timing_index])
        if timing is None:
            continue
        text = _clean_text(" ".join(lines[timing_index + 1 :]))
        if not text or text == previous_text:
            continue
        blocks.append(
            TimestampedTextBlock(
                block_index=len(blocks),
                start_ms=_timestamp_to_ms(timing.group("start")),
                end_ms=_timestamp_to_ms(timing.group("end")),
                text=text,
            )
        )
        previous_text = text
    return blocks


def _timestamp_to_ms(timestamp: str) -> int:
    components = timestamp.replace(",", ".").split(":")
    if len(components) == 2:
        hours = "0"
        minutes, seconds = components
    else:
        hours, minutes, seconds = components
    seconds_value, milliseconds = seconds.split(".", maxsplit=1)
    return (
        int(hours) * 3_600_000
        + int(minutes) * 60_000
        + int(seconds_value) * 1_000
        + int(milliseconds)
    )


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub("", value))).strip()
