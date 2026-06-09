from typer.testing import CliRunner

from src.cli import app


def test_cleanup_outputs_dry_run_does_not_request_confirmation(monkeypatch) -> None:
    monkeypatch.setattr("src.cli.cleanup_outputs_older_than", lambda days, dry_run: [])
    runner = CliRunner()

    result = runner.invoke(app, ["cleanup", "--outputs", "--older-than", "30", "--dry-run"])

    assert result.exit_code == 0
    assert "Targets: 0" in result.stdout
    assert "Supprimer" not in result.stdout
