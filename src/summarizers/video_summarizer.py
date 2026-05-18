from __future__ import annotations

from pathlib import Path

from src.converters.token_counter import count_tokens
from src.exporters.graphipy import frontmatter_video
from src.llm.gemini_client import GeminiClient
from src.llm.model_router import ModelRouter
from src.paths import ensure_dir, project_path


class VideoSummarizer:
    def __init__(
        self,
        client: GeminiClient | None = None,
        router: ModelRouter | None = None,
        prompt_path: Path | None = None,
    ) -> None:
        self.client = client
        self.router = router or ModelRouter()
        self.prompt_path = prompt_path or project_path("prompts", "video_summary.md")

    def summarize(
        self, title: str, url: str, transcript: str, output_path: Path
    ) -> tuple[Path, str]:
        model = self.router.for_video(count_tokens(transcript))
        client = self.client or GeminiClient()
        prompt = self.prompt_path.read_text(encoding="utf-8")
        summary = client.generate(prompt, transcript, model)
        ensure_dir(output_path.parent)
        output_path.write_text(
            f"{frontmatter_video(title, url)}\n{summary.strip()}\n",
            encoding="utf-8",
        )
        return output_path, model.model
