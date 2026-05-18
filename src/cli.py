from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from src.llm.usage import summarize_gemini_usage
from src.menu import run_interactive_menu
from src.pipeline import (
    run_pdf,
    run_pdf_batch,
    run_playlist,
    run_video,
    run_video_batch,
    run_youtube_source,
)
from src.storage.manifest import manifest_summary
from src.storage.retention import cleanup_all_temp, cleanup_cache, cleanup_outputs_older_than

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
    export_graphipy: bool = True,
    delete_cache: bool = False,
    overwrite: bool = False,
    resume: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    try:
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
        )
    except Exception as exc:
        _fail(exc)
    console.print(f"Generated: {len(outputs)}")


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


@app.command()
def menu() -> None:
    run_interactive_menu()


def _fail(exc: Exception) -> None:
    console.print(f"[red]Error:[/] {exc}")
    raise typer.Exit(1) from exc


if __name__ == "__main__":
    app()
