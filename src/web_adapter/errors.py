from __future__ import annotations

from dataclasses import dataclass

from src.llm.base import LLMError, LLMQuotaError


@dataclass(frozen=True, slots=True)
class PublicPipelineError:
    message: str
    diagnostic_code: str


def map_pipeline_error(error: Exception) -> PublicPipelineError:
    """Map internal exceptions without sending their raw, possibly sensitive text."""
    if isinstance(error, LLMQuotaError):
        return PublicPipelineError(
            "Le service de synthèse est temporairement limité.",
            "LLM_QUOTA",
        )
    if isinstance(error, LLMError):
        return PublicPipelineError(
            "La synthèse de cette vidéo a échoué.",
            "LLM_FAILED",
        )
    if isinstance(error, FileExistsError):
        return PublicPipelineError(
            "Un résultat existe déjà pour cette vidéo.",
            "OUTPUT_EXISTS",
        )
    if "subtitle" in str(error).lower() or "sous-titre" in str(error).lower():
        return PublicPipelineError(
            "Aucun transcript exploitable n’est disponible pour cette vidéo.",
            "SUBTITLES_UNAVAILABLE",
        )
    return PublicPipelineError(
        "Le traitement de cette vidéo a échoué.",
        "VIDEO_PROCESSING_FAILED",
    )
