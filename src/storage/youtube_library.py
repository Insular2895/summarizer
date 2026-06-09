from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.paths import ensure_dir


class YouTubeLibrary:
    def __init__(self, root: Path) -> None:
        self.root = ensure_dir(root)

    def entry_dir(self, video_id: str) -> Path:
        return self.root / video_id

    def transcript_path(self, video_id: str) -> Path:
        return self.entry_dir(video_id) / "transcript.txt"

    def has_transcript(self, video_id: str) -> bool:
        path = self.transcript_path(video_id)
        return path.exists() and bool(path.read_text(encoding="utf-8", errors="ignore").strip())

    def store(
        self,
        video_id: str,
        title: str,
        url: str,
        transcript: str,
        source_path: Path | None,
        source_reference: str | None = None,
    ) -> Path:
        entry_dir = ensure_dir(self.entry_dir(video_id))
        transcript_path = entry_dir / "transcript.txt"
        if not transcript_path.exists():
            transcript_path.write_text(_normalize_transcript(transcript), encoding="utf-8")
        if source_path is not None and source_path.exists():
            suffix = source_path.suffix.lower() or ".txt"
            target = entry_dir / f"subtitle_source{suffix}"
            if not target.exists():
                shutil.copy2(source_path, target)
        metadata = self._read_metadata(entry_dir)
        source_paths = _append_unique(metadata.get("source_paths", []), source_reference)
        self._write_metadata(
            entry_dir,
            {
                **metadata,
                "kind": "youtube",
                "video_id": video_id,
                "title": title,
                "url": url,
                "source_paths": source_paths,
                "updated_at": _now(),
            },
        )
        return entry_dir

    def store_legacy(self, title: str, transcript: str, source_reference: str) -> Path:
        normalized = _normalize_transcript(transcript)
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        legacy_id = f"legacy-{digest[:20]}"
        entry_dir = ensure_dir(self.entry_dir(legacy_id))
        transcript_path = entry_dir / "transcript.txt"
        if not transcript_path.exists():
            transcript_path.write_text(normalized, encoding="utf-8")
        metadata = self._read_metadata(entry_dir)
        source_paths = _append_unique(metadata.get("source_paths", []), source_reference)
        self._write_metadata(
            entry_dir,
            {
                **metadata,
                "kind": "legacy",
                "video_id": None,
                "library_id": legacy_id,
                "title": metadata.get("title") or title,
                "url": None,
                "content_sha256": digest,
                "source_paths": source_paths,
                "updated_at": _now(),
            },
        )
        return entry_dir

    def entries(self) -> list[Path]:
        return sorted(path for path in self.root.iterdir() if path.is_dir())

    def merge_legacy_entry(self, target_id: str, legacy_id: str) -> None:
        self.merge_entry(target_id, legacy_id)

    def merge_entry(self, target_id: str, source_id: str) -> None:
        target_dir = self.entry_dir(target_id)
        source_dir = self.entry_dir(source_id)
        target = self._read_metadata(target_dir)
        source = self._read_metadata(source_dir)
        source_paths = target.get("source_paths", [])
        for source_path in source.get("source_paths", []):
            source_paths = _append_unique(source_paths, str(source_path))
        merged_ids = _append_unique(target.get("merged_library_ids", []), source_id)
        self._write_metadata(
            target_dir,
            {
                **target,
                "source_paths": source_paths,
                "merged_library_ids": merged_ids,
                "updated_at": _now(),
            },
        )
        if source_dir.exists():
            shutil.rmtree(source_dir)

    def _read_metadata(self, entry_dir: Path) -> dict[str, Any]:
        path = entry_dir / "metadata.json"
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}

    def _write_metadata(self, entry_dir: Path, metadata: dict[str, Any]) -> None:
        path = entry_dir / "metadata.json"
        path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _normalize_transcript(transcript: str) -> str:
    return transcript.strip() + "\n"


def _append_unique(values: object, value: str | None) -> list[str]:
    result = [str(item) for item in values] if isinstance(values, list) else []
    if value and value not in result:
        result.append(value)
    return result


def _now() -> str:
    return datetime.now(UTC).isoformat()
