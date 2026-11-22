# Summariz premium UI/UX — audit Review

Date: 2026-11-13
Scope: Review, fiche vidéo, Note & IA, responsive 320/375/768/1024/1440 px.
User goal: examiner rapidement une vidéo, garder ou écarter la carte sans perdre les notes ni le
contexte d'approfondissement.

## Evidence

Before:

- `before/review-320.png`
- `before/review-375.png`
- `before/review-768.png`
- `before/review-1024.png`
- `before/review-1440.png`
- `before/detail-375.png`
- `before/detail-1440.png`

After:

- `after/review-320.png`
- `after/review-375.png`
- `after/review-768.png`
- `after/review-1024.png`
- `after/review-1440.png`
- `after/conversation-375.png`
- `after/conversation-1440.png`

Latest card feedback:

- `after-feedback/review-375.png`
- `after-feedback/review-1440.png`

The latest feedback supersedes the inset 16:9 treatment shown in the initial `after/` captures. The
thumbnail now fills the former large media region with a centered crop; decision buttons are neutral
at rest and use green/red only as a short activation animation.

## Numbered flow audit

1. **Enter Review — healthy after correction.**
   The title, source, queue position and primary card are immediately identifiable. The previous
   desktop card was taller than its information justified and gave the image column excessive weight.

2. **Read the thumbnail and summary — healthy after the latest correction.**
   The authentic thumbnail fills the large media region again. `object-fit: cover` accepts a crop but
   keeps the subject centered; title and summary remain visible at every audited width.

3. **Keep, discard or undo — healthy in automated Chromium coverage.**
   Buttons, ArrowLeft, ArrowRight, Command/Ctrl+Z and horizontal drag still use the same decision
   handlers. Buttons are neutral at rest and briefly fill green or red after activation. On mobile,
   Undo stays in the same action row instead of falling behind the fixed navigation.

4. **Use context panels — healthy after correction.**
   `À retenir`, `Raccourcis` and `Ensuite` share one restrained panel system. The previous mobile CSS
   hid the last two panels; all information now remains available below the card.

5. **Open the full video card — healthy.**
   The explicit action, thumbnail and every non-control card area open the same reading dialog.
   Enter opens the active card as a keyboard alternative. Dragging suppresses the card click so one
   gesture cannot both decide and open the sheet.

6. **Decide from the open sheet — healthy in desktop and mobile-layout pointer coverage.**
   A deliberate right/left gesture keeps/discards, closes the sheet and advances. The gesture does
   not start from Note & IA, controls or links, remains subordinate to vertical scrolling, and
   cancels under the threshold or when text selection changes.

7. **Write a note — healthy in automated coverage.**
   The unique per-video Note remains beside the summary on desktop and in the mobile bottom sheet.
   Autosave behavior and export inclusion are unchanged.

8. **Ask Gemini and continue the discussion — healthy in mocked end-to-end coverage.**
   The previous UI replaced a single answer and did not send prior messages. The new thread persists
   each question/answer, sends a bounded recent history to the server, keeps the source passage, and
   uses compact video context after the first turn. Retry, loading, copy, add-to-Note and ChatGPT
   transfer remain available.

## Accessibility and evidence limits

- Semantic buttons, labels, live status, keyboard alternatives and reduced-motion behavior are
  preserved and covered in Chromium.
- Color is not the only decision signal.
- No horizontal overflow is accepted at the five target widths.
- A screenshot cannot prove screen-reader quality, real iOS safe-area behavior or physical touch
  interruption. Safari/iPhone hardware verification remains a release check rather than a claim of
  full WCAG compliance.

## Highest-impact changes

1. Restore the large media region with a centered full-bleed crop.
2. Preserve the full card anatomy and all context panels on mobile.
3. Keep Undo visible with the two decisions.
4. Replace the single-response AI form with a real bounded multi-turn conversation.
5. Use self-hosted Geist, quieter neutral surfaces and temporary semantic decision feedback.
