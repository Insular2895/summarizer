from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from src.converters.srt_to_text import subtitle_to_text
from src.storage.youtube_library import YouTubeLibrary

YOUTUBE_ID_RE = re.compile(r"([A-Za-z0-9_-]{11})$")


@dataclass
class MigrationReport:
    modern_imported: int = 0
    legacy_imported: int = 0
    legacy_mapped_to_youtube: int = 0
    duplicates_skipped: int = 0
    ambiguous_skipped: int = 0
    empty_directories_removed: int = 0
    legacy_entries_merged: int = 0
    files_removed: int = 0


@dataclass
class RepairReport:
    entries_repaired: int = 0
    entries_merged: int = 0
    conflicts_skipped: int = 0
    unresolved_reclassified_legacy: int = 0


def migrate_youtube_sources(
    project_root: Path,
    apply: bool = False,
    library_root: Path | None = None,
) -> MigrationReport:
    library = YouTubeLibrary(library_root or project_root / "library" / "youtube")
    report = MigrationReport()
    _migrate_modern(project_root, library, report, apply)
    _migrate_legacy(project_root, library, report, apply)
    _merge_duplicate_legacy_entries(library, report, apply)
    return report


def repair_youtube_library_from_outputs(
    project_root: Path,
    library_root: Path,
    apply: bool = False,
) -> RepairReport:
    report = RepairReport()
    library = YouTubeLibrary(library_root)
    output_sources = _output_sources_by_slug(project_root / "output" / "videos")
    for entry in library.entries():
        metadata_path = entry / "metadata.json"
        if not metadata_path.exists():
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("kind") != "youtube":
            continue
        candidates: set[tuple[str, str, str]] = set()
        for source_path in metadata.get("source_paths", []):
            if str(source_path).startswith("cache/transcripts/"):
                candidates.update(output_sources.get(Path(str(source_path)).name, set()))
        if len(candidates) != 1:
            if candidates:
                report.conflicts_skipped += 1
            report.unresolved_reclassified_legacy += 1
            if apply:
                metadata.update({"kind": "legacy", "url": None, "video_id": None})
                metadata_path.write_text(
                    json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
            continue
        video_id, url, title = next(iter(candidates))
        if entry.name == video_id:
            continue
        target = library.entry_dir(video_id)
        if target.exists():
            source_transcript = entry / "transcript.txt"
            target_transcript = target / "transcript.txt"
            if (
                not source_transcript.exists()
                or not target_transcript.exists()
                or source_transcript.read_bytes() != target_transcript.read_bytes()
            ):
                report.conflicts_skipped += 1
                report.unresolved_reclassified_legacy += 1
                if apply:
                    metadata.update({"kind": "legacy", "url": None, "video_id": None})
                    metadata_path.write_text(
                        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                continue
            report.entries_merged += 1
            if apply:
                library.merge_entry(video_id, entry.name)
            continue
        report.entries_repaired += 1
        if apply:
            shutil.move(str(entry), target)
            target_metadata_path = target / "metadata.json"
            metadata.update({"kind": "youtube", "video_id": video_id, "url": url, "title": title})
            target_metadata_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
    return report


def _migrate_modern(
    project_root: Path,
    library: YouTubeLibrary,
    report: MigrationReport,
    apply: bool,
) -> None:
    cache_root = project_root / "cache" / "transcripts"
    for directory in sorted(path for path in cache_root.glob("*") if path.is_dir()):
        match = YOUTUBE_ID_RE.search(directory.name)
        transcript_paths = sorted(directory.glob("*.txt"))
        subtitles = sorted([*directory.glob("*.srt"), *directory.glob("*.vtt")])
        if not transcript_paths and not subtitles and not any(directory.iterdir()):
            report.empty_directories_removed += 1
            if apply:
                directory.rmdir()
            continue
        if match is None or (not transcript_paths and not subtitles):
            report.ambiguous_skipped += 1
            continue
        video_id = match.group(1)
        subtitle = next(iter(subtitles), None)
        if transcript_paths:
            transcript = transcript_paths[0].read_text(encoding="utf-8", errors="ignore")
        else:
            assert subtitle is not None
            transcript = subtitle_to_text(subtitle.read_text(encoding="utf-8", errors="ignore"))
        if not transcript.strip():
            report.ambiguous_skipped += 1
            continue
        report.modern_imported += 1
        if not apply:
            continue
        library.store(
            video_id=video_id,
            title=directory.name.removesuffix(f"-{video_id}"),
            url=f"https://www.youtube.com/watch?v={video_id}",
            transcript=transcript,
            source_path=subtitle,
            source_reference=str(directory.relative_to(project_root)),
        )
        report.files_removed += _remove_files_and_empty_dirs(directory)


def _migrate_legacy(
    project_root: Path,
    library: YouTubeLibrary,
    report: MigrationReport,
    apply: bool,
) -> None:
    playlists_root = project_root / "playlists"
    groups: dict[tuple[Path, str], list[Path]] = {}
    for path in sorted([*playlists_root.rglob("*.txt"), *playlists_root.rglob("*.srt")]):
        if path.name == "yt-dlp.log":
            continue
        key = _legacy_group_key(path.name)
        groups.setdefault((path.parent, key), []).append(path)
    seen_ids = {entry.name for entry in library.entries()}
    for (parent, key), paths in groups.items():
        preferred = _preferred_legacy_path(paths)
        raw = preferred.read_text(encoding="utf-8", errors="ignore")
        transcript = subtitle_to_text(raw) if preferred.suffix.lower() == ".srt" else raw
        if not transcript.strip():
            report.ambiguous_skipped += 1
            continue
        video_id = _playlist_video_id(parent, key)
        library_id = video_id or _legacy_id(transcript)
        if library_id in seen_ids:
            report.duplicates_skipped += 1
        else:
            report.legacy_imported += 1
            if video_id:
                report.legacy_mapped_to_youtube += 1
            seen_ids.add(library_id)
        report.duplicates_skipped += max(0, len(paths) - 1)
        if not apply:
            continue
        if video_id:
            library.store(
                video_id=video_id,
                title=_legacy_title(key),
                url=f"https://www.youtube.com/watch?v={video_id}",
                transcript=transcript,
                source_path=preferred if preferred.suffix.lower() == ".srt" else None,
                source_reference=str(preferred.relative_to(project_root)),
            )
        else:
            library.store_legacy(
                title=key,
                transcript=transcript,
                source_reference=str(preferred.relative_to(project_root)),
            )
        for path in paths:
            if video_id:
                library.store(
                    video_id=video_id,
                    title=_legacy_title(key),
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    transcript=transcript,
                    source_path=path if path.suffix.lower() == ".srt" else None,
                    source_reference=str(path.relative_to(project_root)),
                )
            else:
                library.store_legacy(
                    title=key,
                    transcript=transcript,
                    source_reference=str(path.relative_to(project_root)),
                )
            path.unlink()
            report.files_removed += 1
        _remove_empty_parents(parent, playlists_root)


def _legacy_group_key(filename: str) -> str:
    name = filename
    for suffix in [
        ".en-orig.txt",
        ".fr-orig.txt",
        "-orig.txt",
        ".en.txt",
        ".fr.txt",
        ".en.srt",
        ".fr.srt",
        ".srt",
        ".txt",
    ]:
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return Path(name).stem


def _preferred_legacy_path(paths: list[Path]) -> Path:
    cleaned = [path for path in paths if "-orig" not in path.name and path.suffix == ".txt"]
    return sorted(cleaned or paths, key=lambda path: (len(path.name), path.name))[0]


def _playlist_video_id(directory: Path, key: str) -> str | None:
    index_match = re.match(r"^(\d+)\s*-\s*", key)
    if index_match is None:
        return None
    index = int(index_match.group(1))
    tsv = directory / "playlist_items.tsv"
    if not tsv.exists():
        return None
    for line in tsv.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.replace("\\t", "\t").split("\t", 2)
        if len(parts) >= 2 and parts[0].isdigit() and int(parts[0]) == index:
            return parts[1]
    return None


def _legacy_title(key: str) -> str:
    return re.sub(r"^\d+\s*-\s*", "", key)


def _legacy_id(transcript: str) -> str:
    normalized = transcript.strip() + "\n"
    return f"legacy-{hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:20]}"


def _merge_duplicate_legacy_entries(
    library: YouTubeLibrary,
    report: MigrationReport,
    apply: bool,
) -> None:
    by_hash: dict[str, list[Path]] = {}
    for entry in library.entries():
        transcript = entry / "transcript.txt"
        if transcript.exists():
            digest = hashlib.sha256(transcript.read_bytes()).hexdigest()
            by_hash.setdefault(digest, []).append(entry)
    for entries in by_hash.values():
        youtube_entries = [entry for entry in entries if not entry.name.startswith("legacy-")]
        legacy_entries = [entry for entry in entries if entry.name.startswith("legacy-")]
        if not youtube_entries or not legacy_entries:
            continue
        target = sorted(youtube_entries)[0]
        for legacy in legacy_entries:
            report.legacy_entries_merged += 1
            if apply:
                library.merge_legacy_entry(target.name, legacy.name)


def _remove_files_and_empty_dirs(directory: Path) -> int:
    removed = 0
    for path in sorted(directory.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
            removed += 1
        elif path.is_dir() and not any(path.iterdir()):
            path.rmdir()
    if directory.exists() and not any(directory.iterdir()):
        directory.rmdir()
    return removed


def _remove_empty_parents(directory: Path, stop: Path) -> None:
    current = directory
    while current != stop and current.exists() and not any(current.iterdir()):
        current.rmdir()
        current = current.parent


def _output_sources_by_slug(videos_root: Path) -> dict[str, set[tuple[str, str, str]]]:
    sources: dict[str, set[tuple[str, str, str]]] = {}
    for path in videos_root.rglob("*.md"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        url_match = re.search(r'^url:\s*["\']?([^"\'\n]+)', text, flags=re.MULTILINE)
        title_match = re.search(r'^title:\s*["\']?([^"\'\n]+)', text, flags=re.MULTILINE)
        if url_match is None:
            continue
        url = url_match.group(1).strip()
        id_match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
        if id_match is None:
            continue
        slug = re.sub(r"^\d{3}-", "", path.stem)
        title = title_match.group(1).strip() if title_match else slug
        sources.setdefault(slug, set()).add((id_match.group(1), url, title))
    return sources
