from __future__ import annotations

from pathlib import Path

from src.converters.token_counter import count_tokens, split_markdown_by_tokens
from src.exporters.graphipy import frontmatter_pdf
from src.llm.gemini_client import GeminiClient
from src.llm.model_router import ModelRouter
from src.paths import ensure_dir, project_path

CHUNK_SYNTHESIS_INSTRUCTIONS = """\
Tu analyses une partie d’un document plus long.
Ne conclus pas que le document entier est partiel.
Ta mission est de produire une synthèse partielle dense et fidèle de cette partie.

Conserve précisément :
- les thèses ;
- les arguments ;
- les concepts ;
- les exemples ;
- les noms propres ;
- les dates ;
- les mécanismes ;
- les limites ;
- les implications utiles.

N’évalue pas la qualité du chunk comme un document autonome.
Prépare cette synthèse pour une fusion finale avec les autres parties.
"""

FINAL_SYNTHESIS_INSTRUCTIONS = """\
Les textes ci-dessous sont des synthèses partielles d’un document source plus long.
Tu ne dois pas analyser la qualité des synthèses partielles.
Tu ne dois pas dire que “le document fourni est une synthèse”.
Tu dois rédiger la synthèse finale du document source original.

Objectif :
- fusionner les parties ;
- supprimer les répétitions ;
- conserver les détails importants ;
- reconstruire la thèse globale ;
- expliquer les concepts centraux ;
- récupérer les exemples majeurs ;
- produire une réponse finale directement exploitable.

Si les parties se contredisent, signale la contradiction.
Si une information est absente des parties, écris “Non précisé dans le contenu”.
"""


class PdfSummarizer:
    def __init__(
        self,
        client: GeminiClient | None = None,
        router: ModelRouter | None = None,
        prompt_path: Path | None = None,
    ) -> None:
        self.client = client
        self.router = router or ModelRouter()
        self.prompt_path = prompt_path or project_path("prompts", "pdf_knowledge.md")

    def summarize(
        self, title: str, source_file: str, markdown: str, output_path: Path
    ) -> tuple[Path, str]:
        client = self.client or GeminiClient()
        prompt = self.prompt_path.read_text(encoding="utf-8")
        token_count = count_tokens(markdown)
        model = self.router.for_pdf(token_count)
        if token_count <= model.max_input_tokens:
            summary = client.generate(prompt, markdown, model)
            model_name = model.model
        else:
            chunk_model = self.router.for_pdf(token_count)
            chunks = split_markdown_by_tokens(markdown, chunk_model.max_input_tokens)
            chunk_summaries = [
                client.generate(
                    prompt,
                    (
                        f"{CHUNK_SYNTHESIS_INSTRUCTIONS}\n\n"
                        f"PARTIE {chunk.index + 1}/{len(chunks)}\n\n"
                        f"{chunk.text}"
                    ),
                    chunk_model,
                )
                for chunk in chunks
            ]
            final_model = self.router.for_pdf(count_tokens("\n\n".join(chunk_summaries)), True)
            summary = client.generate(
                prompt,
                f"{FINAL_SYNTHESIS_INSTRUCTIONS}\n\n"
                "SYNTHESES PARTIELLES A FUSIONNER :\n\n" + "\n\n---\n\n".join(chunk_summaries),
                final_model,
            )
            model_name = f"{chunk_model.model} + {final_model.model}"
        ensure_dir(output_path.parent)
        output_path.write_text(
            f"{frontmatter_pdf(title, source_file)}\n{summary.strip()}\n",
            encoding="utf-8",
        )
        return output_path, model_name
