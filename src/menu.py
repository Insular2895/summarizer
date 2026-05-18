from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.table import Table

from src.llm.usage import summarize_gemini_usage
from src.paths import project_path

console = Console()


def run_interactive_menu(root_dir: Path | None = None) -> None:
    root = root_dir or project_path()
    while True:
        _print_header()
        choice = Prompt.ask(
            "Choix",
            choices=["1", "2", "3", "4", "5", "6", "7", "8", "9"],
            default="1",
        )
        if choice == "1":
            run_pdf_flow(root)
        elif choice == "2":
            run_youtube_flow(root, playlist=False)
        elif choice == "3":
            run_youtube_flow(root, playlist=True)
        elif choice == "4":
            run_youtube_batch(root)
        elif choice == "5":
            run_command([str(root / "runpdf"), "--engines-status"], root)
        elif choice == "6":
            args = [str(root / "runpdf"), "--setup-engines"]
            if Confirm.ask("Télécharger aussi les modèles MinerU ?", default=False):
                args.append("--download-mineru-models")
            run_command(args, root)
        elif choice == "7":
            run_command([sys.executable, "-m", "src.cli", "cleanup", "--cache"], root)
        elif choice == "8":
            print_usage_summary()
        else:
            console.print("À bientôt.")
            return
        if not Confirm.ask("Revenir au menu ?", default=True):
            return


def discover_pdf_files(root_dir: Path) -> list[Path]:
    input_dir = root_dir / "input" / "pdf"
    return sorted(path for path in input_dir.glob("*.pdf") if path.is_file())


def build_pdf_command(root_dir: Path, pdf_path: Path, mode: str, overwrite: bool) -> list[str]:
    command = [str(root_dir / "runpdf"), str(pdf_path)]
    if mode == "smart":
        command.extend(["--engine", "smart"])
    elif mode == "ocrmypdf":
        command.extend(["--engine", "ocrmypdf"])
    elif mode == "mineru":
        command.extend(["--engine", "mineru"])
    elif mode == "marker":
        command.extend(["--engine", "marker"])
    elif mode == "sample":
        command.extend(["--engine", "smart", "--max-pages", "10"])
    else:
        raise ValueError(f"Unknown PDF mode: {mode}")
    if overwrite:
        command.append("--overwrite")
    return command


def run_pdf_flow(root: Path) -> None:
    pdf_path = choose_pdf(root)
    if pdf_path is None:
        return
    mode = choose_pdf_mode()
    overwrite = Confirm.ask("Écraser l'output s'il existe déjà ?", default=False)
    run_command(build_pdf_command(root, pdf_path, mode, overwrite), root)


def choose_pdf(root: Path) -> Path | None:
    pdfs = discover_pdf_files(root)
    if not pdfs:
        console.print("[yellow]Aucun PDF trouvé dans input/pdf/.[/]")
        manual = Prompt.ask("Chemin du PDF, ou Entrée pour annuler", default="")
        return Path(manual).expanduser() if manual else None
    if len(pdfs) == 1:
        console.print(f"PDF détecté : [cyan]{pdfs[0]}[/]")
        return pdfs[0]
    table = Table(title="PDF détectés")
    table.add_column("#", justify="right")
    table.add_column("Fichier")
    for index, pdf in enumerate(pdfs, start=1):
        table.add_row(str(index), str(pdf.relative_to(root)))
    console.print(table)
    choice = Prompt.ask("Choisir un PDF", choices=[str(i) for i in range(1, len(pdfs) + 1)])
    return pdfs[int(choice) - 1]


def choose_pdf_mode() -> str:
    table = Table(title="Mode PDF")
    table.add_column("#", justify="right")
    table.add_column("Mode")
    table.add_column("Usage")
    modes = [
        ("1", "smart", "choix automatique"),
        ("2", "ocrmypdf", "forcer OCR"),
        ("3", "mineru", "forcer MinerU"),
        ("4", "marker", "forcer Marker"),
        ("5", "sample", "tester les 10 premières pages"),
    ]
    for number, mode, help_text in modes:
        table.add_row(number, mode, help_text)
    console.print(table)
    choice = Prompt.ask("Mode", choices=[number for number, _, _ in modes], default="1")
    return modes[int(choice) - 1][1]


def run_youtube_flow(root: Path, playlist: bool) -> None:
    label = "playlist" if playlist else "vidéo"
    url = Prompt.ask(f"URL de la {label} YouTube").strip()
    if not url:
        console.print("[yellow]Annulé.[/]")
        return
    command = [str(root / "runyoutube"), url]
    if playlist and Confirm.ask("Reprendre si un manifest existe déjà ?", default=True):
        command.append("--resume")
    limit = Prompt.ask("Limiter le nombre de vidéos ? Entrée = non", default="").strip()
    if limit:
        command.extend(["--limit", limit])
    run_command(command, root)


def run_youtube_batch(root: Path) -> None:
    url_file = root / "input" / "youtube" / "urls.txt"
    if not url_file.exists():
        console.print("[yellow]input/youtube/urls.txt n'existe pas encore.[/]")
        console.print("Crée ce fichier avec une URL par ligne, puis relance le menu.")
        return
    run_command([str(root / "runyoutube"), "--file", str(url_file)], root)


def print_usage_summary() -> None:
    summary = summarize_gemini_usage()
    table = Table(title="Gemini usage")
    table.add_column("Métrique")
    table.add_column("Valeur", justify="right")
    table.add_row("Requêtes", str(summary.request_count))
    table.add_row("Succès", str(summary.successful_requests))
    table.add_row("Échecs", str(summary.failed_requests))
    table.add_row("Tokens input", str(summary.input_tokens))
    table.add_row("Tokens output", str(summary.output_tokens))
    cost = "non configuré"
    if summary.estimated_cost_usd is not None:
        cost = f"${summary.estimated_cost_usd:.4f}"
    table.add_row("Coût estimé", cost)
    if summary.budget_usd is not None:
        table.add_row("Budget", f"${summary.budget_usd:.2f}")
    if summary.budget_remaining_usd is not None:
        table.add_row("Budget restant", f"${summary.budget_remaining_usd:.4f}")
    console.print(table)

    if not summary.by_model:
        return
    by_model = Table(title="Par modèle")
    by_model.add_column("Modèle")
    by_model.add_column("Requêtes", justify="right")
    by_model.add_column("Input", justify="right")
    by_model.add_column("Output", justify="right")
    by_model.add_column("Coût", justify="right")
    for model, data in sorted(summary.by_model.items()):
        model_cost = data.get("estimated_cost_usd")
        by_model.add_row(
            model,
            str(data["requests"]),
            str(data["input_tokens"]),
            str(data["output_tokens"]),
            "non configuré" if model_cost is None else f"${float(model_cost):.4f}",
        )
    console.print(by_model)


def run_command(command: list[str], root: Path) -> None:
    console.print(f"[dim]$ {' '.join(command)}[/]")
    subprocess.run(command, cwd=root, check=False)


def _print_header() -> None:
    console.print(
        Panel.fit(
            "\n".join(
                [
                    "[bold]Summarizer[/]",
                    "1. Résumer un PDF",
                    "2. Résumer une vidéo YouTube",
                    "3. Résumer une playlist YouTube",
                    "4. Lancer input/youtube/urls.txt",
                    "5. Vérifier les moteurs PDF",
                    "6. Installer les moteurs PDF",
                    "7. Nettoyer le cache",
                    "8. Voir l'usage Gemini",
                    "9. Quitter",
                ]
            ),
            border_style="cyan",
        )
    )
