from __future__ import annotations

from src.config import ModelConfig, load_models


class ModelRouter:
    def __init__(self, models: dict[str, ModelConfig] | None = None) -> None:
        self.models = models or load_models()

    def for_video(self, token_count: int) -> ModelConfig:
        if token_count > self.models["video_simple"].max_input_tokens:
            return self.models["video_dense"]
        return self.models["video_simple"]

    def for_pdf(self, token_count: int, final_synthesis: bool = False) -> ModelConfig:
        if final_synthesis:
            return self.models["pdf_final_synthesis"]
        if token_count > self.models["pdf_deep"].max_input_tokens:
            return self.models["pdf_chunk"]
        return self.models["pdf_deep"]
