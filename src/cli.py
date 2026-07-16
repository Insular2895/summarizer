from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from src.llm.usage import summarize_gemini_usage
from src.menu import run_interactive_menu
from src.motion.schema import MotionOptions
from src.paths import project_path, youtube_library_path
from src.pdf_evidence.core import BoundingBox, write_json
from src.pdf_evidence.golden import evaluate_sidecar_file
from src.pdf_evidence.inspect import inspect_pdf_element
from src.pdf_evidence.regression import evaluate_regression_manifest
from src.pdf_evidence.resolution import apply_human_review, create_human_review_template
from src.pipeline import (
    run_pdf,
    run_pdf_batch,
    run_playlist,
    run_video,
    run_video_batch,
    run_youtube_source,
)
from src.storage.manifest import manifest_summary
from src.storage.output_organizer import organize_outputs
from src.storage.retention import cleanup_all_temp, cleanup_cache, cleanup_outputs_older_than
from src.storage.youtube_library import YouTubeLibrary
from src.storage.youtube_library_migration import (
    migrate_youtube_sources,
    repair_youtube_library_from_outputs,
)

app = typer.Typer(no_args_is_help=True)
console = Console()


@app.command()
def video(
    url: Annotated[str, typer.Option("--url")],
    ask_each: bool = False,
    keep_all: bool = False,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
) -> None:
    _ = resume
    try:
        status = run_video(
            url,
            ask_each=ask_each,
            keep_all=keep_all,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
        )
    except Exception as exc:
        _fail(exc)
    console.print(status)


@app.command("run-youtube")
def run_youtube(
    source: Annotated[
        str,
        typer.Argument(help="YouTube video URL, playlist URL, or local legacy playlist directory."),
    ],
    ask_each: bool = False,
    keep_all: bool = True,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
    mode: str = "summary",
    product_type: str = "premium tech product",
    target_format: str = "9:16",
    target_duration: str = "15s",
    style: str = "premium minimal tech, inspired by high-end product films without copying brands",
    reference_type: str = "visual_reference",
    tutorials_last: int = 0,
    mixed_indices: str = "",
    user_description: str = "",
) -> None:
    try:
        motion_options = _motion_options(
            mode=mode,
            product_type=product_type,
            target_format=target_format,
            target_duration=target_duration,
            style=style,
            reference_type=reference_type,
            user_description=user_description,
        )
        result = run_youtube_source(
            source,
            ask_each=ask_each,
            keep_all=keep_all,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            resume=resume,
            dry_run=dry_run,
            limit=limit,
            mode=mode,
            motion_options=motion_options,
            tutorials_last=tutorials_last,
            mixed_indices=_parse_indices(mixed_indices),
        )
    except Exception as exc:
        _fail(exc)
    if hasattr(result, "videos"):
        console.print(manifest_summary(result))  # type: ignore[arg-type]
    else:
        console.print(result)


@app.command("video-batch")
def video_batch(
    file: Annotated[Path, typer.Option("--file")],
    ask_each: bool = False,
    keep_all: bool = False,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
) -> None:
    _ = resume
    try:
        manifest = run_video_batch(
            file,
            ask_each=ask_each,
            keep_all=keep_all,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
        )
    except Exception as exc:
        _fail(exc)
    console.print(manifest_summary(manifest))


@app.command()
def playlist(
    url: Annotated[str, typer.Option("--url")],
    ask_each: bool = False,
    keep_all: bool = False,
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    try:
        manifest = run_playlist(
            url,
            resume=resume,
            limit=limit,
            ask_each=ask_each,
            keep_all=keep_all,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
        )
    except Exception as exc:
        _fail(exc)
    console.print(manifest_summary(manifest))


@app.command()
def pdf(
    file: Annotated[Path, typer.Option("--file")],
    engine: str = "auto",
    mode: str = "deep",
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    max_pages: int | None = None,
    ocr_language: str = "eng",
    technical_evidence: bool = True,
    visual_review: bool = True,
) -> None:
    _ = resume
    try:
        output = run_pdf(
            file,
            engine=engine,
            mode=mode,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
            max_pages=max_pages,
            ocr_language=ocr_language,
            technical_evidence=technical_evidence,
            visual_review=visual_review,
        )
    except Exception as exc:
        _fail(exc)
    console.print(f"Output: {output}")


@app.command("run-pdf")
def run_pdf_full(
    file: Annotated[Path, typer.Argument(help="PDF file to summarize.")],
    engine: str = "auto",
    mode: str = "deep",
    export_graphipy: bool = True,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    max_pages: int | None = None,
    ocr_language: str = "eng",
    technical_evidence: bool = True,
    visual_review: bool = True,
) -> None:
    _ = resume
    try:
        output = run_pdf(
            file,
            engine=engine,
            mode=mode,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
            max_pages=max_pages,
            ocr_language=ocr_language,
            technical_evidence=technical_evidence,
            visual_review=visual_review,
        )
    except Exception as exc:
        _fail(exc)
    console.print(f"Output: {output}")


@app.command("pdf-batch")
def pdf_batch(
    dir: Annotated[Path, typer.Option("--dir")],
    engine: str = "auto",
    mode: str = "deep",
    export_graphipy: bool = False,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    max_pages: int | None = None,
    ocr_language: str = "eng",
    technical_evidence: bool = True,
    visual_review: bool = True,
) -> None:
    _ = resume
    try:
        outputs = run_pdf_batch(
            dir,
            engine=engine,
            mode=mode,
            export_graphipy=export_graphipy,
            delete_cache=delete_cache,
            overwrite=overwrite,
            dry_run=dry_run,
            max_pages=max_pages,
            ocr_language=ocr_language,
            technical_evidence=technical_evidence,
            visual_review=visual_review,
        )
    except Exception as exc:
        _fail(exc)
    console.print(f"Generated: {len(outputs)}")


@app.command("pdf-evidence-inspect")
def pdf_evidence_inspect(
    file: Annotated[Path, typer.Argument(help="Local source PDF (read-only).")],
    pdf_page: Annotated[int, typer.Option("--pdf-page", min=1)],
    element_id: str | None = None,
    bbox: str = "",
    dpi: Annotated[int, typer.Option(min=72, max=600)] = 450,
    include_context: bool = True,
    open_images: bool = False,
    ocr_language: str = "eng",
) -> None:
    try:
        parsed_bbox = _parse_bbox(bbox) if bbox else None
        packet = inspect_pdf_element(
            file,
            pdf_page,
            project_path("cache", "pdf_evidence_inspection"),
            element_id=element_id,
            bbox=parsed_bbox,
            dpi=dpi,
            include_context=include_context,
            open_images=open_images,
            ocr_language=ocr_language,
        )
    except Exception as exc:
        _fail(exc)
    console.print(
        {
            "pdf_page_number": pdf_page,
            "pdf_page_index": pdf_page - 1,
            "evidence_packet": str(packet),
            "full_page": str(packet / "full_page_original.png"),
            "crop": str(packet / "element_crop_normalized.png"),
        }
    )


@app.command("pdf-evidence-score")
def pdf_evidence_score(
    sidecar: Annotated[Path, typer.Argument(help="Technical PDF sidecar JSON.")],
    annotations_dir: Annotated[
        Path | None,
        typer.Option("--annotations-dir", help="Human-authored golden annotations."),
    ] = None,
    output: Annotated[
        Path | None,
        typer.Option("--output", help="Optional JSON report path."),
    ] = None,
) -> None:
    """Score a sidecar without modifying the PDF or its transcription."""
    try:
        if annotations_dir is None:
            annotations_dir = project_path("tests", "golden", "pdf_evidence", "annotations")
        report = evaluate_sidecar_file(sidecar, annotations_dir)
        if output is not None:
            write_json(output, report)
    except Exception as exc:
        _fail(exc)
    console.print(report)


@app.command("pdf-evidence-regression")
def pdf_evidence_regression(
    manifest: Annotated[
        Path | None,
        typer.Option("--manifest", help="G01-G19 regression manifest."),
    ] = None,
    output: Annotated[
        Path | None,
        typer.Option("--output", help="Optional JSON coverage report path."),
    ] = None,
) -> None:
    """Verify that every G01-G19 case is backed by a named regression test."""
    try:
        if manifest is None:
            manifest = project_path("tests", "golden", "pdf_evidence", "manifest.json")
        report = evaluate_regression_manifest(manifest)
        if output is not None:
            write_json(output, report)
    except Exception as exc:
        _fail(exc)
    console.print(report)
    if report["status"] != "pass":
        raise typer.Exit(code=1)


@app.command("pdf-evidence-review-template")
def pdf_evidence_review_template(
    sidecar: Annotated[Path, typer.Argument(help="Technical PDF sidecar JSON.")],
    element_id: Annotated[str, typer.Option("--element-id")],
    output: Annotated[Path, typer.Option("--output")],
    visual_review: Annotated[
        Path | None,
        typer.Option("--visual-review", help="Optional Gemini visual review JSON."),
    ] = None,
) -> None:
    """Prepare an explicit human-review form; it cannot validate content by itself."""
    try:
        result = create_human_review_template(
            sidecar,
            element_id,
            output=output,
            visual_review_path=visual_review,
        )
    except Exception as exc:
        _fail(exc)
    console.print({"review_template": str(result), "applicable": False})


@app.command("pdf-evidence-resolve")
def pdf_evidence_resolve(
    sidecar: Annotated[Path, typer.Argument(help="Technical PDF sidecar JSON.")],
    review: Annotated[
        Path,
        typer.Option("--review", help="Explicit human-review JSON."),
    ],
    output_sidecar: Annotated[
        Path | None,
        typer.Option("--output-sidecar", help="New canonical sidecar path."),
    ] = None,
    output_markdown: Annotated[
        Path | None,
        typer.Option("--output-markdown", help="New verified Markdown path."),
    ] = None,
) -> None:
    """Apply a human-approved correction without mutating OCR or source files."""
    try:
        resolved_sidecar, verified_markdown = apply_human_review(
            sidecar,
            review,
            output_sidecar=output_sidecar,
            output_markdown=output_markdown,
        )
    except Exception as exc:
        _fail(exc)
    console.print(
        {
            "resolved_sidecar": str(resolved_sidecar),
            "verified_markdown": str(verified_markdown),
        }
    )


@app.command()
def cleanup(
    cache: bool = False,
    outputs: bool = False,
    older_than: int = 7,
    all_temp: bool = False,
    dry_run: bool = False,
) -> None:
    if cache:
        targets = cleanup_cache(dry_run=dry_run)
    elif outputs:
        if not dry_run:
            confirm = console.input(f"Supprimer les outputs de plus de {older_than} jours ? [y/N] ")
            if confirm.strip().lower() not in {"y", "yes", "oui"}:
                console.print("Cancelled")
                return
        targets = cleanup_outputs_older_than(older_than, dry_run=dry_run)
    elif all_temp:
        targets = cleanup_all_temp(dry_run=dry_run)
    else:
        raise typer.BadParameter("Use --cache, --outputs or --all-temp.")
    console.print(f"Targets: {len(targets)}")


@app.command()
def usage() -> None:
    summary = summarize_gemini_usage()
    console.print(
        {
            "requests": summary.request_count,
            "success": summary.successful_requests,
            "failed": summary.failed_requests,
            "input_tokens": summary.input_tokens,
            "output_tokens": summary.output_tokens,
            "estimated_cost_usd": summary.estimated_cost_usd,
            "budget_usd": summary.budget_usd,
            "budget_remaining_usd": summary.budget_remaining_usd,
            "by_model": summary.by_model,
        }
    )


@app.command("migrate-youtube-library")
def migrate_youtube_library(apply: bool = False) -> None:
    report = migrate_youtube_sources(
        project_path(), apply=apply, library_root=youtube_library_path()
    )
    console.print({"mode": "apply" if apply else "dry-run", **asdict(report)})


@app.command("youtube-library-status")
def youtube_library_status() -> None:
    library = YouTubeLibrary(youtube_library_path())
    entries = library.entries()
    files = [path for entry in entries for path in entry.rglob("*") if path.is_file()]
    console.print(
        {
            "entries": len(entries),
            "size_bytes": sum(path.stat().st_size for path in files),
            "path": str(library.root),
        }
    )


@app.command("repair-youtube-library")
def repair_youtube_library(apply: bool = False) -> None:
    report = repair_youtube_library_from_outputs(
        project_path(),
        youtube_library_path(),
        apply=apply,
    )
    console.print({"mode": "apply" if apply else "dry-run", **asdict(report)})


@app.command("organize-outputs")
def organize_output_files(apply: bool = False) -> None:
    report = organize_outputs(project_path(), apply=apply)
    console.print({"mode": "apply" if apply else "dry-run", **asdict(report)})


@app.command()
def menu() -> None:
    run_interactive_menu()


def _fail(exc: Exception) -> None:
    console.print(f"[red]Error:[/] {exc}")
    raise typer.Exit(1) from exc


def _motion_options(
    mode: str,
    product_type: str,
    target_format: str,
    target_duration: str,
    style: str,
    reference_type: str,
    user_description: str,
) -> MotionOptions | None:
    if mode == "summary":
        return None
    if mode != "motion-director":
        raise typer.BadParameter("--mode must be summary or motion-director")
    if reference_type not in {"visual_reference", "tutorial", "mixed"}:
        raise typer.BadParameter("--reference-type must be visual_reference, tutorial or mixed")
    return MotionOptions(
        product_type=product_type,
        target_format=target_format,
        target_duration=target_duration,
        style=style,
        reference_type=reference_type,  # type: ignore[arg-type]
        user_description=user_description,
    )


def _parse_indices(value: str) -> set[int]:
    if not value.strip():
        return set()
    try:
        indices = {int(item.strip()) for item in value.split(",") if item.strip()}
    except ValueError as exc:
        raise typer.BadParameter("--mixed-indices must be comma-separated integers") from exc
    if any(index < 1 for index in indices):
        raise typer.BadParameter("--mixed-indices values must be positive")
    return indices


def _parse_bbox(value: str) -> BoundingBox:
    try:
        parts = [float(item.strip()) for item in value.split(",")]
    except ValueError as exc:
        raise typer.BadParameter("--bbox must be x0,y0,x1,y1 in PDF points") from exc
    if len(parts) != 4 or parts[2] <= parts[0] or parts[3] <= parts[1]:
        raise typer.BadParameter("--bbox must be x0,y0,x1,y1 with positive area")
    return BoundingBox(*parts)


if __name__ == "__main__":
    app()
