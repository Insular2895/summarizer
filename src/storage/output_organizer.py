from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass
class OutputOrganizationReport:
    duplicate_video_summaries_removed: int = 0
    graphipy_copies_removed: int = 0
    unique_exports_moved: int = 0
    root_video_summaries_moved: int = 0


def organize_outputs(project_root: Path, apply: bool = False) -> OutputOrganizationReport:
    report = OutputOrganizationReport()
    output = project_root / "output"
    videos = output / "videos"
    graphipy = output / "graphipy_ready"
    _deduplicate_video_summaries(videos, report, apply)
    _retire_graphipy_exports(output, videos, graphipy, report, apply)
    _move_root_video_summaries(videos, report, apply)
    if apply:
        _remove_empty_directories(output)
    return report


def _deduplicate_video_summaries(
    videos: Path,
    report: OutputOrganizationReport,
    apply: bool,
) -> None:
    by_url: dict[str, list[Path]] = {}
    for path in videos.rglob("*.md"):
        url = _frontmatter_value(path, "url")
        if url:
            by_url.setdefault(url, []).append(path)
    for paths in by_url.values():
        if len(paths) < 2:
            continue
        keep = max(paths, key=lambda path: (path.stat().st_size, path.stat().st_mtime))
        for path in paths:
            if path == keep:
                continue
            report.duplicate_video_summaries_removed += 1
            if apply:
                path.unlink()


def _retire_graphipy_exports(
    output: Path,
    videos: Path,
    graphipy: Path,
    report: OutputOrganizationReport,
    apply: bool,
) -> None:
    video_urls = {
        url for path in videos.rglob("*.md") if (url := _frontmatter_value(path, "url")) is not None
    }
    for path in graphipy.rglob("*.md"):
        video_path = videos / path.relative_to(graphipy)
        url = _frontmatter_value(path, "url")
        if video_path.exists() or (url is not None and url in video_urls):
            report.graphipy_copies_removed += 1
            if apply:
                path.unlink()
            continue
        source_type = _frontmatter_value(path, "source_type")
        destination_root = output / ("books" if source_type == "pdf" else "archive")
        destination = destination_root / path.name
        report.unique_exports_moved += 1
        if apply:
            destination_root.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                shutil.move(str(path), destination)
            else:
                path.unlink()


def _frontmatter_value(path: Path, key: str) -> str | None:
    text = path.read_text(encoding="utf-8", errors="ignore")
    match = re.search(rf"^{re.escape(key)}:\s*[\"']?([^\"'\n]+)", text, flags=re.MULTILINE)
    return match.group(1).strip() if match else None


def _move_root_video_summaries(
    videos: Path,
    report: OutputOrganizationReport,
    apply: bool,
) -> None:
    destination_root = videos / "playlist-before"
    for path in sorted(videos.glob("*.md")):
        destination = destination_root / path.name
        if destination.exists():
            continue
        report.root_video_summaries_moved += 1
        if apply:
            destination_root.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), destination)


def _remove_empty_directories(root: Path) -> None:
    for path in sorted((item for item in root.rglob("*") if item.is_dir()), reverse=True):
        if not any(path.iterdir()):
            path.rmdir()
