from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    index: int
    text: str
    token_count: int


def count_tokens(text: str) -> int:
    try:
        import tiktoken

        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        return max(1, len(text) // 4)


def split_markdown_by_tokens(text: str, max_tokens: int) -> list[TextChunk]:
    sections = _split_sections(text)
    chunks: list[TextChunk] = []
    current: list[str] = []
    current_tokens = 0
    for section in sections:
        section_tokens = count_tokens(section)
        if current and current_tokens + section_tokens > max_tokens:
            body = "\n\n".join(current).strip()
            chunks.append(TextChunk(len(chunks), body, count_tokens(body)))
            current = []
            current_tokens = 0
        if section_tokens > max_tokens:
            for part in _split_long_section(section, max_tokens):
                chunks.append(TextChunk(len(chunks), part, count_tokens(part)))
            continue
        current.append(section)
        current_tokens += section_tokens
    if current:
        body = "\n\n".join(current).strip()
        chunks.append(TextChunk(len(chunks), body, count_tokens(body)))
    return chunks


def _split_sections(text: str) -> list[str]:
    sections: list[str] = []
    current: list[str] = []
    for line in text.splitlines():
        if line.startswith("#") and current:
            sections.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current).strip())
    return [section for section in sections if section]


def _split_long_section(section: str, max_tokens: int) -> list[str]:
    paragraphs = [part.strip() for part in section.split("\n\n") if part.strip()]
    parts: list[str] = []
    current: list[str] = []
    for paragraph in paragraphs:
        candidate = "\n\n".join([*current, paragraph]).strip()
        if current and count_tokens(candidate) > max_tokens:
            parts.append("\n\n".join(current).strip())
            current = [paragraph]
        else:
            current.append(paragraph)
    if current:
        parts.append("\n\n".join(current).strip())
    return parts
