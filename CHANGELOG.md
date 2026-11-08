# Changelog

## Unreleased

### Added
- Local-only `./runweb` launcher, private-data-free fallback dataset and a staged SaaS deployment
  plan covering tenancy, jobs, secrets, storage, CI, operations and rollback.
- Fluid Knowledge Web prototype completion flow with portable Markdown ZIP, clean PDF, a
  capability-gated Maxi Brain inbox connector and consultable History receipts.
- Fluid Knowledge reading workspace with a persistent per-video Note, contextual Gemini deep-dive
  from selected summary text, explicit add-to-Note, and copy/open ChatGPT fallback.
- General API key settings with separate Gemini summary/deep-dive slots, official free-key guidance,
  first-use onboarding and quota-exhaustion recovery.
- macOS Keychain custody for local Gemini keys, verified migration from legacy `.env`, per-usage key
  removal and isolated Keychain integration tests.
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
- Review now ends after the final decision instead of looping, and History separates the active
  session from completed exports. Removing a History receipt never deletes source or export files.
- Per-video Notes now persist locally in the prototype and travel with Markdown ZIP, PDF and private
  Maxi Brain exports.
- Gemini keys are no longer stored in the prototype's plaintext JSON file or passed to the Python
  deep-dive process through its environment; local secrets use macOS Keychain and bounded stdin.
- Private prototype routes now bind to loopback, reject network clients and require same-origin
  browser mutations.
- README updated for the local AI pipeline.
- PDF runs now preserve a separate transcription Markdown before the final synthesis and enable
  technical evidence by default.

### Fixed
- Figure references in prose no longer create duplicate evidence elements.
- Invalid or schema-drifting Gemini JSON is rejected, preserved, and repaired at most once.
