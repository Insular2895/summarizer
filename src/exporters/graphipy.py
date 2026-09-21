from __future__ import annotations

import hashlib
import json
import os
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any
from uuid import uuid4

from src.paths import assert_inside, ensure_dir, project_path, safe_slug


def export_graphipy_ready(source_path: Path, slug: str, output_dir: Path | None = None) -> Path:
    output_dir = output_dir or project_path("output", "graphipy_ready")
    ensure_dir(output_dir)
    content = source_path.read_text(encoding="utf-8")
    content = re.sub(r"^model_used:.*\n", "", content, flags=re.MULTILINE)
    target = output_dir / f"{slug}.md"
    target.write_text(content, encoding="utf-8")
    return target


def frontmatter_video(title: str, url: str) -> str:
    return f"""---
title: "{_escape(title)}"
source_type: "youtube"
url: "{_escape(url)}"
content_value: "non précisé"
technical_level: "non précisé"
bullshit_risk: "non précisé"
graphipy_ready: true
tags:
  - video
---
"""


def frontmatter_pdf(title: str, source_file: str) -> str:
    return f"""---
title: "{_escape(title)}"
source_type: "pdf"
source_file: "{_escape(source_file)}"
domain: "non précisé"
technical_level: "non précisé"
content_value: "non précisé"
bullshit_risk: "non précisé"
graphipy_ready: true
tags:
  - pdf
  - livre
---
"""


def export_web_job(
    manifest: Mapping[str, Any],
    items: Sequence[Mapping[str, Any]],
    output_dir: Path | None = None,
) -> Path:
    """Write one deterministic, replay-safe Graphipy outbox directory for a Web job."""
    job_id = _required_string(manifest, "job_id")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", job_id):
        raise ValueError("Invalid export job id.")
    source = _required_mapping(manifest, "source")
    expected = _required_sequence(manifest, "kept_videos")
    expected_ids = [_required_string(entry, "id") for entry in expected]
    indexed_items = {
        _required_string(_required_mapping(item, "video"), "id"): item for item in items
    }
    if len(indexed_items) != len(items) or set(indexed_items) != set(expected_ids):
        raise ValueError("Export items do not match the frozen kept selection.")

    root = ensure_dir(output_dir or project_path("output", "graphipy_ready")).resolve()
    target_dir = assert_inside(root / job_id, root)
    rendered: dict[str, str] = {}
    written: list[dict[str, str]] = []
    for expected_item in expected:
        video_id = _required_string(expected_item, "id")
        item = indexed_items[video_id]
        video = _required_mapping(item, "video")
        playlist_index = _required_integer(video, "playlist_index")
        youtube_slug = safe_slug(
            _required_string(video, "youtube_id"), fallback="youtube", max_length=32
        )
        filename = (
            f"{playlist_index:04d}-"
            f"{safe_slug(_required_string(video, 'title'), fallback='video', max_length=60)}-"
            f"{youtube_slug}.md"
        )
        content = render_web_video_markdown(job_id, source, item)
        if filename in rendered:
            raise ValueError("Export filenames are not unique.")
        rendered[filename] = content
        written.append(
            {
                "video_id": video_id,
                "file": filename,
                "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
            }
        )

    proof = {
        "format": "summarizer-graphipy-outbox",
        "version": 1,
        "job_id": job_id,
        "source_id": _required_string(source, "id"),
        "files": written,
    }
    rendered["_export.json"] = (
        json.dumps(proof, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    if target_dir.exists():
        _verify_existing_export(target_dir, rendered)
        return target_dir

    staging = assert_inside(root / f".{job_id}.{uuid4().hex}.tmp", root)
    staging.mkdir(mode=0o700)
    try:
        for filename, content in rendered.items():
            _atomic_write_text(assert_inside(staging / filename, staging), content)
        try:
            os.replace(staging, target_dir)
        except OSError:
            if not target_dir.exists():
                raise
            _verify_existing_export(target_dir, rendered)
    finally:
        if staging.exists():
            for child in staging.iterdir():
                assert_inside(child, staging).unlink(missing_ok=True)
            staging.rmdir()
    return target_dir


def render_web_video_markdown(
    job_id: str,
    source: Mapping[str, Any],
    item: Mapping[str, Any],
) -> str:
    video = _required_mapping(item, "video")
    note = _required_mapping(item, "note")
    transcript = _required_sequence(item, "transcript")
    title = _required_string(video, "title")
    url = _required_string(video, "url")
    provenance = video.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("Invalid export provenance.")
    excerpts = _parse_excerpts(note.get("excerpts_json"))

    frontmatter = [
        "---",
        f"title: {_yaml_string(title)}",
        'source_type: "youtube"',
        f"url: {_yaml_string(url)}",
        f"youtube_id: {_yaml_string(_required_string(video, 'youtube_id'))}",
        f"source_id: {_yaml_string(_required_string(source, 'id'))}",
        f"source_url: {_yaml_string(_required_string(source, 'normalized_url'))}",
        f"source_kind: {_yaml_string(_required_string(source, 'source_kind'))}",
        f"source_created_at: {_yaml_string(_required_string(source, 'created_at'))}",
        f"job_id: {_yaml_string(job_id)}",
        f"playlist_index: {_required_integer(video, 'playlist_index')}",
        'decision: "KEPT"',
        f"note_version: {_required_integer(note, 'version')}",
        "graphipy_ready: true",
    ]
    source_title = source.get("title")
    if isinstance(source_title, str) and source_title:
        frontmatter.append(f"source_title: {_yaml_string(source_title)}")
    channel = video.get("channel")
    if isinstance(channel, str) and channel:
        frontmatter.append(f"channel: {_yaml_string(channel)}")
    duration = video.get("duration_seconds")
    if isinstance(duration, int) and not isinstance(duration, bool):
        frontmatter.append(f"duration_seconds: {duration}")
    model_used = video.get("model_used")
    if isinstance(model_used, str) and model_used:
        frontmatter.append(f"model_used: {_yaml_string(model_used)}")
    frontmatter.extend(["tags:", "  - video", "  - graphipy-ready", "---", ""])

    sections = [*frontmatter, f"# {title.replace(chr(10), ' ').strip()}", "", "## Résumé", ""]
    summary = video.get("summary_markdown")
    sections.extend(
        [
            (
                summary.strip()
                if isinstance(summary, str) and summary.strip()
                else "Résumé indisponible."
            ),
            "",
        ]
    )
    sections.extend(["## Note personnelle", "", _note_body(note), ""])
    sections.extend(["## Extraits horodatés", ""])
    if excerpts:
        for excerpt in excerpts:
            timestamp = _format_timestamp(excerpt["start_ms"])
            sections.append(
                f"- [{timestamp}]({_timestamp_url(url, excerpt['start_ms'])}) — {excerpt['text']}"
            )
    else:
        sections.append("Aucun extrait enregistré.")
    sections.extend(["", "## Transcript", ""])
    if transcript:
        for raw_block in transcript:
            block = _as_mapping(raw_block, "transcript block")
            start_ms = _required_integer(block, "start_ms")
            text = _required_string(block, "text").replace("\n", " ").strip()
            sections.append(f"- [{_format_timestamp(start_ms)}] {text}")
    else:
        sections.append("Transcript indisponible.")
    sections.extend(
        [
            "",
            "## Provenance",
            "",
            "```json",
            json.dumps(provenance, ensure_ascii=False, indent=2, sort_keys=True),
            "```",
            "",
        ]
    )
    return "\n".join(sections)


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _atomic_write_text(path: Path, content: str) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        temporary.write_text(content, encoding="utf-8")
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _verify_existing_export(target_dir: Path, rendered: Mapping[str, str]) -> None:
    if not target_dir.is_dir():
        raise ValueError("The export target is not a directory.")
    existing = {path.name for path in target_dir.iterdir() if not path.name.startswith(".")}
    if existing != set(rendered):
        raise ValueError("An incompatible export already exists for this job.")
    for filename, expected in rendered.items():
        path = assert_inside(target_dir / filename, target_dir)
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise ValueError("An incompatible export already exists for this job.")


def _required_mapping(value: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    return _as_mapping(value.get(key), key)


def _as_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"Invalid export {label}.")
    return value


def _required_sequence(value: Mapping[str, Any], key: str) -> list[Mapping[str, Any]]:
    raw = value.get(key)
    if not isinstance(raw, list):
        raise ValueError(f"Invalid export {key}.")
    return [_as_mapping(item, key) for item in raw]


def _required_string(value: Mapping[str, Any], key: str) -> str:
    raw = value.get(key)
    if not isinstance(raw, str) or not raw:
        raise ValueError(f"Invalid export {key}.")
    return raw


def _required_integer(value: Mapping[str, Any], key: str) -> int:
    raw = value.get(key)
    if not isinstance(raw, int) or isinstance(raw, bool) or raw < 0:
        raise ValueError(f"Invalid export {key}.")
    return raw


def _parse_excerpts(value: Any) -> list[dict[str, Any]]:
    try:
        raw = json.loads(value) if isinstance(value, str) else value
    except json.JSONDecodeError as error:
        raise ValueError("Invalid export excerpts.") from error
    if not isinstance(raw, list):
        raise ValueError("Invalid export excerpts.")
    excerpts: list[dict[str, Any]] = []
    for entry in raw:
        item = _as_mapping(entry, "excerpt")
        excerpts.append(
            {
                "text": _required_string(item, "text").replace("\n", " ").strip(),
                "start_ms": _required_integer(item, "start_ms"),
            }
        )
    return excerpts


def _note_body(note: Mapping[str, Any]) -> str:
    body = note.get("body")
    return body.strip() if isinstance(body, str) and body.strip() else "Aucune note personnelle."


def _format_timestamp(milliseconds: int) -> str:
    seconds = milliseconds // 1_000
    hours, remainder = divmod(seconds, 3_600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes}:{seconds:02d}"


def _timestamp_url(url: str, milliseconds: int) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}t={milliseconds // 1_000}s"


def _yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)
