# Fluid Knowledge Web/PC — Design QA

- Source visual truth: `/Users/insular/transcripts/docs/assets/web-v1-fluid-knowledge-review-mobile.png`
- Implementation: `/Users/insular/transcripts/prototypes/fluid-knowledge-web/`
- Local preview: `http://127.0.0.1:4175/`
- Dataset: local playlist 32, 33 current long Markdown summaries from `output/videos/playlist-32/`
- Assets: 33 genuine YouTube thumbnails; no generated or approximated fallback
- States: responsive Review card, complete long-summary sheet, persistent Note and contextual AI

## Captured evidence

- Desktop Review: `qa/playlist-32/desktop-review.png`, `1440 x 1024` pixels, CSS viewport `1440 x 1024`, device scale factor `1`.
- Desktop long summary: `qa/playlist-32/desktop-long-summary.png`, `1440 x 1024` pixels, CSS viewport `1440 x 1024`, device scale factor `1`.
- Mobile Review: `qa/playlist-32/mobile-review.png`, `786 x 1704` pixels, CSS viewport `393 x 852`, device scale factor `2`.
- Mobile long summary: `qa/playlist-32/mobile-long-summary.png`, `786 x 1704` pixels, CSS viewport `393 x 852`, device scale factor `2`.
- Normalized source: `qa/source-fluid-knowledge-mobile-normalized.png`, resized from `852 x 1846` to `786 x 1704` with Lanczos scaling.
- Source comparison: `qa/playlist-32/compare-source-vs-mobile-review.png`.

The Review and long-summary captures above remain the accepted evidence for the selected visual
direction. The 2026-11-07 completion, export, active-History, Note, contextual-AI and Clés API
extensions have automated responsive coverage but no accepted browser capture: the Codex in-app
Browser reported that no browser surface was available. Their visual comparison is therefore
blocked rather than inferred from build output.

The normalized source and implementation were reviewed side by side. The final UI preserves the selected hierarchy—identity, Review context, progress, dominant card, Keep/Discard decisions, Undo and bottom navigation—while using the real playlist 32 content.

## Findings

No actionable P0, P1 or P2 issue remains on the previously captured Review and detail surfaces.
Visual P0/P1/P2 assessment of completion, History, Note/AI, Clés API and quota recovery remains
blocked until a browser capture can be opened and compared.

- [P3] The prototype bundles the 33 long summaries and Markdown renderer in the main JavaScript chunk. Production should lazy-load each full summary when its sheet opens.
- [P3] Duration and channel metadata are absent from the current Markdown source, so the UI intentionally omits them instead of inventing values.
- [P3] Desktop presents the exact 16:9 thumbnail with a blurred extension of the same asset inside the taller card media region; the source image itself remains uncropped and fully visible.

## Required fidelity surfaces

- Typography: compact Apple-like hierarchy with responsive system/Inter typography; long titles wrap on desktop and clamp safely on mobile.
- Layout rhythm: desktop uses a navigation rail, central review card and context panel; mobile keeps the card, decisions, Undo and bottom navigation visible in the first viewport.
- Visual tokens: off-white canvas, elevated white cards, blue navigation, green Keep and neutral gray Discard match the selected Fluid Knowledge direction.
- Asset fidelity: all 33 entries use their genuine YouTube thumbnail. A neutral “Miniature indisponible” state is used if a genuine asset later fails; no synthetic thumbnail is generated.
- Content fidelity: the card excerpt and “À retenir” points are extracted from each current Markdown summary. “Ouvrir la fiche” renders the complete Markdown and names the exact local source file.
- Responsive behavior: no horizontal overflow at desktop, tablet or mobile test widths. The
  long-summary sheet is scrollable, keeps the Note beside the reading column on desktop/tablet and
  exposes Note & IA as a bottom sheet on mobile.

## Focused interaction evidence

- Swipe/drag supports right to keep and left to discard, with explicit buttons as accessible alternatives.
- Keyboard arrows trigger the same decisions; Command/Ctrl+Z restores the latest decision.
- The Review flow advances to the next real playlist entry and updates progress from 1/33.
- The long-summary sheet exposes the complete structured summary, a persistent per-video Note and
  an honest transcript placeholder linked to the exact YouTube source.
- Selecting summary text feeds a bounded Gemini request; the simulated response can be copied or
  explicitly added to the Note. The ChatGPT fallback copies its context before opening the official
  site.
- Clés API is reachable from desktop, tablet and mobile chrome; it exposes two password fields,
  Google free-key guidance and a quota-recovery route without echoing secrets.

## Verification

- Responsive interaction suite: 25 tests passed and 14 environment-specific cases skipped. ZIP,
  PDF, Maxi Brain, contextual Gemini, Keychain-backed key status, quota recovery and foreign-origin
  rejection are exercised on desktop; navigation, Review, Clés API, persistent Note, detail and
  active History are exercised across desktop, tablet and mobile.
- Secret-storage suite: 5 tests passed, including a real isolated macOS Keychain save/read/remove
  cycle, a legacy `.env` migration and a clean child-process environment boundary. Fake test keys
  are removed after each run. Two request-guard tests cover loopback-only access and mandatory
  same-origin mutations.
- Sites packaging suite: 4 tests passed.
- Production build: passed.
- Console and page errors during captures: none.
- Horizontal overflow: none at `1440`, `900` or `393` CSS pixels.
- Thumbnail sync: 33 summaries and 33 genuine YouTube thumbnails.

final result: blocked
