# Changelog

## Unreleased

### Added
- Gemini summarization pipeline.
- YouTube transcript extraction and video-by-video playlist processing.
- PDF extraction hooks with MinerU and Marker fallback.
- Graphipy-ready Markdown export.
- Tests, CI, and safety documentation.
- Technical-PDF evidence pipeline with immutable source manifests, page rendering, local OCR,
  element detection, strict Gemini visual review, canonical JSON sidecars and quality reports.
- Read-only `pdf-evidence inspect` command and explicit Codex/human fallback packets.
- JSON schemas and a local-only golden-set manifest for dangerous quantitative OCR cases.

### Changed
- README updated for the local AI pipeline.
- PDF runs now preserve a separate transcription Markdown before the final synthesis and enable
  technical evidence by default.

### Fixed
- Figure references in prose no longer create duplicate evidence elements.
- Invalid or schema-drifting Gemini JSON is rejected, preserved, and repaired at most once.
