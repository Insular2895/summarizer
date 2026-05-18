from __future__ import annotations

import re


def clean_markdown(markdown: str) -> str:
    markdown = markdown.replace("\r\n", "\n")
    markdown = re.sub(r"\n{4,}", "\n\n\n", markdown)
    lines = [line.rstrip() for line in markdown.splitlines()]
    lines = _drop_repeated_running_headers(lines)
    cleaned: list[str] = []
    previous_non_empty = ""
    for line in lines:
        if _is_empty_page_marker(line):
            continue
        if line.strip() and line.strip() == previous_non_empty:
            continue
        cleaned.append(line)
        if line.strip():
            previous_non_empty = line.strip()
    result = "\n".join(cleaned)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip() + "\n" if result.strip() else ""


def _is_empty_page_marker(line: str) -> bool:
    return bool(re.match(r"^\s*(page\s+\d+|\d+\s*/\s*\d+)\s*$", line, re.IGNORECASE))


def _drop_repeated_running_headers(lines: list[str]) -> list[str]:
    short_counts: dict[str, int] = {}
    for line in lines:
        stripped = line.strip()
        if stripped and len(stripped) <= 80 and not stripped.startswith(("#", "|", "-", "*")):
            short_counts[stripped] = short_counts.get(stripped, 0) + 1
    repeated = {line for line, count in short_counts.items() if count >= 4}
    return [line for line in lines if line.strip() not in repeated]
