from src.config import ModelConfig
from src.llm.model_router import ModelRouter


def test_model_router_video_simple_and_dense() -> None:
    router = ModelRouter(_models())

    assert router.for_video(100).name == "video_simple"
    assert router.for_video(101).name == "video_dense"


def test_model_router_pdf_deep_chunk_and_final() -> None:
    router = ModelRouter(_models())

    assert router.for_pdf(100).name == "pdf_deep"
    assert router.for_pdf(101).name == "pdf_chunk"
    assert router.for_pdf(100, final_synthesis=True).name == "pdf_final_synthesis"


def _models() -> dict[str, ModelConfig]:
    return {
        "video_simple": ModelConfig("video_simple", "a", 100, 10, 0.2),
        "video_dense": ModelConfig("video_dense", "b", 200, 10, 0.2),
        "pdf_deep": ModelConfig("pdf_deep", "c", 100, 10, 0.1),
        "pdf_chunk": ModelConfig("pdf_chunk", "d", 50, 10, 0.1),
        "pdf_final_synthesis": ModelConfig("pdf_final_synthesis", "e", 100, 10, 0.1),
    }
