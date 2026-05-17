from __future__ import annotations

from pathlib import Path

from rich.console import Console

from src.converters.markdown_cleaner import clean_markdown
from src.converters.srt_to_text import convert_srt_to_text
from src.exporters.graphipy import export_graphipy_ready
from src.extractors.pdf_analyzer import build_pdf_engine_plan
from src.extractors.pdf_marker import extract_pdf_with_marker
from src.extractors.pdf_mineru import extract_pdf_with_mineru
from src.extractors.pdf_text import extract_pdf_with_pypdf
from src.extractors.youtube import YouTubeExtractor, YouTubeVideo
from src.paths import project_path, safe_slug
from src.storage.manifest import JobManifest, VideoStatus, manifest_path_for_playlist
from src.storage.retention import safe_delete
from src.summarizers.pdf_summarizer import PdfSummarizer
from src.summarizers.video_summarizer import VideoSummarizer

console = Console()


def run_video(
    url: str,
    ask_each: bool = False,
    keep_all: bool = False,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
) -> VideoStatus:
    extractor = YouTubeExtractor(project_path("cache", "transcripts"))
    info = extractor.get_video_info(url)
    return _process_video(
        info,
        extractor,
        ask_each=ask_each,
        keep_all=keep_all,
        export_graphipy=export_graphipy,
        delete_cache=delete_cache,
        overwrite=overwrite,
        dry_run=dry_run,
    )


def run_video_batch(file_path: Path, **kwargs: object) -> JobManifest:
    urls = [
        line.strip()
        for line in file_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    manifest = JobManifest(playlist_title=file_path.stem)
    extractor = YouTubeExtractor(project_path("cache", "transcripts"))
    manifest_path = manifest_path_for_playlist(file_path.stem)
    for url in urls:
        try:
            info = extractor.get_video_info(url)
            status = _process_video(info, extractor, **kwargs)
        except Exception as exc:
            status = VideoStatus(url=url, status="failed", error=str(exc))
        manifest.upsert_video(status)
        manifest.save(manifest_path)
    return manifest


def run_playlist(
    url: str,
    resume: bool = False,
    limit: int | None = None,
    **kwargs: object,
) -> JobManifest:
    extractor = YouTubeExtractor(project_path("cache", "transcripts"))
    title, videos = extractor.list_playlist(url)
    if limit is not None:
        videos = videos[:limit]
    manifest_path = manifest_path_for_playlist(f"playlist-{title}")
    manifest = JobManifest.load_or_create(manifest_path, title) if resume else JobManifest(title)
    for video in videos:
        existing = manifest.get(video.url)
        if resume and existing and existing.status == "done":
            console.print(f"[cyan]Skip already done:[/] {video.title}")
            continue
        try:
            status = _process_video(video, extractor, **kwargs)
        except Exception as exc:
            status = VideoStatus(url=video.url, title=video.title, status="failed", error=str(exc))
            console.print(f"[red]Failed:[/] {video.title} - {exc}")
        manifest.upsert_video(status)
        manifest.save(manifest_path)
    return manifest


def run_local_playlist_dir(
    directory: Path,
    ask_each: bool = False,
    keep_all: bool = False,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
) -> JobManifest:
    playlist_slug = safe_slug(directory.name, "playlist")
    manifest_path = manifest_path_for_playlist(f"playlist-{playlist_slug}")
    manifest = JobManifest.load_or_create(manifest_path, directory.name)
    transcript_files = [
        path
        for path in sorted(directory.glob("*.txt"))
        if not path.name.endswith("-orig.txt") and path.name != "yt-dlp.log"
    ]
    if limit is not None:
        transcript_files = transcript_files[:limit]
    for transcript_path in transcript_files:
        title = transcript_path.stem.removesuffix(".en")
        slug = safe_slug(f"{playlist_slug}-{title}", "video")
        output_path = project_path("output", "videos", playlist_slug, f"{slug}.md")
        try:
            if dry_run:
                console.print(f"[dry-run] Local transcript: {transcript_path}")
                console.print(f"[dry-run] Output: {output_path}")
                status = VideoStatus(
                    url=str(transcript_path),
                    title=title,
                    status="dry-run",
                    output_path=str(output_path),
                    kept=False,
                )
            elif output_path.exists() and not overwrite:
                status = VideoStatus(
                    url=str(transcript_path),
                    title=title,
                    status="done",
                    output_path=str(output_path),
                    kept=True,
                )
            else:
                console.print(f"[1/3] Lecture transcript local: {title}")
                transcript = transcript_path.read_text(encoding="utf-8", errors="ignore")
                console.print("[2/3] Appel Gemini")
                output_path, model_used = VideoSummarizer().summarize(
                    title,
                    str(transcript_path),
                    transcript,
                    output_path,
                )
                kept = keep_all or _confirm_keep(output_path, ask_each)
                if not kept:
                    safe_delete(output_path)
                if export_graphipy and kept:
                    export_graphipy_ready(output_path, slug)
                    console.print("[3/3] Export Graphipy")
                if delete_cache:
                    console.print("No transcript cache to delete for local legacy playlist.")
                status = VideoStatus(
                    url=str(transcript_path),
                    title=title,
                    status="done",
                    output_path=str(output_path),
                    kept=kept,
                    model_used=model_used,
                )
        except Exception as exc:
            status = VideoStatus(
                url=str(transcript_path),
                title=title,
                status="failed",
                error=str(exc),
            )
            console.print(f"[red]Failed:[/] {title} - {exc}")
        manifest.upsert_video(status)
        manifest.save(manifest_path)
    return manifest


def run_youtube_source(
    source: str,
    ask_each: bool = False,
    keep_all: bool = True,
    export_graphipy: bool = True,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
) -> JobManifest | VideoStatus:
    path = Path(source).expanduser()
    if path.exists() and path.is_dir():
        return run_local_playlist_dir(
            path,
            ask_each=ask_each,
            keep_all=keep_all,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
            limit=limit,
        )
    if "playlist" in source or "list=" in source:
        return run_playlist(
            source,
            resume=resume,
            limit=limit,
            ask_each=ask_each,
            keep_all=keep_all,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
        )
    return run_video(
        source,
        ask_each=ask_each,
        keep_all=keep_all,
        export_graphipy=export_graphipy,
        delete_cache=delete_cache,
        overwrite=overwrite,
        dry_run=dry_run,
    )


def run_pdf(
    file_path: Path,
    engine: str = "auto",
    mode: str = "deep",
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
    max_pages: int | None = None,
) -> Path:
    slug = safe_slug(file_path.stem, "book")
    output_path = project_path("output", "books", f"{slug}.md")
    cache_dir = project_path("cache", "pdf_md")
    if dry_run:
        console.print(f"[dry-run] PDF: {file_path}")
        console.print(f"[dry-run] Engine: {engine} / mode: {mode}")
        if max_pages is not None:
            console.print(f"[dry-run] Max pages: {max_pages}")
        if engine in {"auto", "smart"}:
            plan = build_pdf_engine_plan(file_path)
            console.print(f"[dry-run] Complexity: {plan.complexity.complexity}")
            console.print(f"[dry-run] Reasons: {', '.join(plan.complexity.reasons)}")
            console.print(f"[dry-run] Engine order: {' -> '.join(plan.fallback_order)}")
            console.print(f"[dry-run] Available engines: {plan.available_engines}")
        console.print(f"[dry-run] Output: {output_path}")
        return output_path
    if output_path.exists() and not overwrite:
        raise FileExistsError(f"Output already exists: {output_path}. Use --overwrite.")
    console.print("[1/5] Extraction PDF")
    markdown_path = _extract_pdf(file_path, cache_dir, engine, max_pages=max_pages)
    markdown = markdown_path.read_text(encoding="utf-8", errors="ignore")
    if not _is_usable_markdown(markdown):
        raise RuntimeError("PDF extraction produced weak or empty Markdown.")
    console.print("[2/5] Nettoyage Markdown")
    cleaned = clean_markdown(markdown)
    console.print("[3/5] Appel Gemini")
    output_path, _model = PdfSummarizer().summarize(
        file_path.stem, file_path.name, cleaned, output_path
    )
    console.print(f"[4/5] Écriture Markdown: {output_path}")
    if export_graphipy:
        export_graphipy_ready(output_path, slug)
        console.print("[5/5] Export Graphipy")
    if delete_cache:
        safe_delete(cache_dir / slug)
    return output_path


def run_pdf_batch(directory: Path, **kwargs: object) -> list[Path]:
    outputs: list[Path] = []
    for file_path in sorted(directory.glob("*.pdf")):
        try:
            outputs.append(run_pdf(file_path, **kwargs))
        except Exception as exc:
            console.print(f"[red]PDF failed:[/] {file_path.name} - {exc}")
    return outputs


def _process_video(
    video: YouTubeVideo,
    extractor: YouTubeExtractor,
    ask_each: bool = False,
    keep_all: bool = False,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
) -> VideoStatus:
    output_path = project_path("output", "videos", f"{video.slug}.md")
    text_path = project_path("cache", "transcripts", video.slug, f"{video.slug}.txt")
    if dry_run:
        console.print(f"[dry-run] Video: {video.title}")
        console.print(f"[dry-run] Output: {output_path}")
        return VideoStatus(video.url, video.title, "dry-run", str(output_path), kept=False)
    if output_path.exists() and not overwrite:
        return VideoStatus(video.url, video.title, "done", str(output_path), kept=True)
    console.print(f"[1/5] Extraction transcript: {video.title}")
    subtitle_path = extractor.download_subtitles(video.url, video.slug)
    console.print("[2/5] Conversion TXT")
    convert_srt_to_text(subtitle_path, text_path)
    transcript = text_path.read_text(encoding="utf-8")
    console.print("[3/5] Appel Gemini")
    output_path, model_used = VideoSummarizer().summarize(
        video.title,
        video.url,
        transcript,
        output_path,
    )
    console.print(f"[4/5] Écriture Markdown: {output_path}")
    kept = keep_all or _confirm_keep(output_path, ask_each)
    if not kept:
        safe_delete(output_path)
    if export_graphipy and kept:
        export_graphipy_ready(output_path, video.slug)
        console.print("[5/5] Export Graphipy")
    if delete_cache:
        safe_delete(project_path("cache", "transcripts", video.slug))
    return VideoStatus(
        url=video.url,
        title=video.title,
        status="done",
        output_path=str(output_path),
        kept=kept,
        model_used=model_used,
    )


def _confirm_keep(output_path: Path, ask_each: bool) -> bool:
    if not ask_each:
        return True
    return console.input(f"Garder ce résumé ? {output_path} [Y/n] ").strip().lower() not in {
        "n",
        "no",
        "non",
    }


def _extract_pdf(
    file_path: Path,
    cache_dir: Path,
    engine: str,
    max_pages: int | None = None,
) -> Path:
    if engine == "mineru":
        return extract_pdf_with_mineru(file_path, cache_dir, max_pages=max_pages)
    if engine == "marker":
        return extract_pdf_with_marker(file_path, cache_dir)
    if engine == "text":
        return extract_pdf_with_pypdf(file_path, cache_dir, max_pages=max_pages)
    if engine not in {"auto", "smart"}:
        raise ValueError("engine must be auto, smart, mineru, marker or text")

    plan = build_pdf_engine_plan(file_path)
    console.print(f"[cyan]PDF complexity:[/] {plan.complexity.complexity}")
    console.print(f"[cyan]Engine order:[/] {' -> '.join(plan.fallback_order)}")
    last_error: Exception | None = None
    for candidate in plan.fallback_order:
        try:
            markdown = _extract_pdf(file_path, cache_dir, candidate, max_pages=max_pages)
            if _is_usable_markdown(markdown.read_text(encoding="utf-8", errors="ignore")):
                return markdown
            raise RuntimeError(f"{candidate} produced weak or empty Markdown.")
        except Exception as exc:
            last_error = exc
            console.print(f"[yellow]{candidate} fallback:[/] {exc}")
    raise RuntimeError(f"No PDF engine produced usable Markdown: {last_error}") from last_error


def _is_usable_markdown(markdown: str) -> bool:
    text = markdown.strip()
    if len(text) < 200:
        return False
    headings = sum(1 for line in text.splitlines() if line.startswith("#"))
    paragraphs = sum(1 for block in text.split("\n\n") if len(block.strip()) > 80)
    return headings >= 1 or paragraphs >= 3
