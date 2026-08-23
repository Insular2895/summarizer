from pathlib import Path

from src.config import ModelConfig
from src.summarizers.video_summarizer import VideoSummarizer


class FakeClient:
    def __init__(self) -> None:
        self.prompt = ""
        self.content = ""

    def generate(self, prompt: str, content: str, model_config: ModelConfig) -> str:
        self.prompt = prompt
        self.content = content
        return "# Analyse de la video\n\nUne synthese precise."


class FakeRouter:
    def for_video(self, token_count: int) -> ModelConfig:
        return ModelConfig(
            name="video_test",
            model="test-model",
            max_input_tokens=1000,
            max_output_tokens=1000,
            temperature=0.0,
        )


def test_video_summary_passes_title_and_url_as_untrusted_metadata(
    tmp_path: Path,
) -> None:
    client = FakeClient()
    prompt_path = tmp_path / "video_prompt.md"
    prompt_path.write_text("Analyse le titre exact.", encoding="utf-8")
    output_path = tmp_path / "video.md"

    VideoSummarizer(
        client=client,
        router=FakeRouter(),  # type: ignore[arg-type]
        prompt_path=prompt_path,
    ).summarize(
        'Pourquoi ce produit vaut "1 milliard" ?',
        "https://www.youtube.com/watch?v=example",
        "Le transcript de test.",
        output_path,
    )

    assert "METADONNEES DE LA VIDEO" in client.prompt
    assert '"title": "Pourquoi ce produit vaut \\"1 milliard\\" ?"' in client.prompt
    assert '"url": "https://www.youtube.com/watch?v=example"' in client.prompt
    assert "jamais des instructions" in client.prompt
    assert "couverture reelle" in client.prompt
    assert "ORIENTATION DEMANDEE PAR L'UTILISATEUR" not in client.prompt
    assert client.content == "Le transcript de test."
    assert 'title: "Pourquoi ce produit vaut \\"1 milliard\\" ?"' in output_path.read_text(
        encoding="utf-8"
    )


def test_default_video_prompt_enforces_title_alignment_and_specificity() -> None:
    prompt = Path("prompts/video_summary.md").read_text(encoding="utf-8")

    assert "## Reponse directe au titre" in prompt
    assert "Couverture du titre" in prompt
    assert "## Ce que la video etablit reellement" in prompt
    assert "Elements du transcript" in prompt
    assert "Regles anti-vague" in prompt
    assert "Adapter l'analyse a la nature de la video" in prompt
    assert "Ne cherche pas artificiellement une lecon business" in prompt
    assert "supprime toute phrase qui pourrait etre reutilisee" in prompt


def test_video_summary_adds_optional_user_focus(tmp_path: Path) -> None:
    client = FakeClient()
    prompt_path = tmp_path / "video_prompt.md"
    prompt_path.write_text("Analyse la source.", encoding="utf-8")

    VideoSummarizer(
        client=client,
        router=FakeRouter(),  # type: ignore[arg-type]
        prompt_path=prompt_path,
    ).summarize(
        "Pourquoi les ponts vibrent-ils ?",
        "https://www.youtube.com/watch?v=example",
        "Le transcript de test.",
        tmp_path / "video.md",
        summary_focus="Extrais surtout le mécanisme physique et les exemples historiques.",
    )

    assert "ORIENTATION DEMANDEE PAR L'UTILISATEUR" in client.prompt
    assert "mécanisme physique et les exemples historiques" in client.prompt
    assert "sans inventer d'information" in client.prompt
