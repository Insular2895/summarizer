from pathlib import Path

from src.summarizers.pdf_summarizer import PdfSummarizer


class FakeGeminiClient:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def generate(self, prompt: str, content: str, model_config: object) -> str:
        self.prompts.append(prompt)
        return "# Résumé\n\nContenu de test."


def test_pdf_summary_defaults_to_neutral_chapter_reading(tmp_path: Path) -> None:
    client = FakeGeminiClient()
    output = tmp_path / "book.md"

    PdfSummarizer(client=client).summarize(
        "Book",
        "book.pdf",
        "# Chapitre 1\n\n" + ("Un contenu suffisamment long. " * 30),
        output,
    )

    assert "Aucun objectif particulier" in client.prompts[0]
    assert "chapitre par chapitre" in client.prompts[0]


def test_pdf_summary_adds_user_instruction_when_provided(tmp_path: Path) -> None:
    client = FakeGeminiClient()
    output = tmp_path / "book.md"

    PdfSummarizer(client=client).summarize(
        "Book",
        "book.pdf",
        "# Chapitre 1\n\n" + ("Un contenu suffisamment long. " * 30),
        output,
        instruction="Compare les méthodes avec mon projet.",
    )

    assert "Une consigne spécifique" in client.prompts[0]
    assert "Compare les méthodes avec mon projet." in client.prompts[0]
