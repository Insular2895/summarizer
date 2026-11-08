import { useEffect, useRef, useState } from "react";

import { NoteExcerpt, TranscriptBlock } from "../api/client";

interface TranscriptSectionProps {
  blocks: TranscriptBlock[];
  onAddExcerpt(excerpt: NoteExcerpt): void;
}

export function TranscriptSection({ blocks, onAddExcerpt }: TranscriptSectionProps) {
  const containerRef = useRef<HTMLElement>(null);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const [selection, setSelection] = useState<NoteExcerpt | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function updateSelection() {
    const selected = selectedTranscriptExcerpt(containerRef.current);
    setSelection(selected.excerpt);
    setSelectionError(selected.error);
  }

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      if (feedbackTimerRef.current !== undefined) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  function addToNote() {
    if (!selection) return;
    onAddExcerpt(selection);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setSelectionError(null);
    setFeedback("Ajouté à la note.");
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 2_500);
  }

  return (
    <section
      ref={containerRef}
      aria-labelledby="transcript-title"
      onPointerUp={updateSelection}
      onKeyUp={updateSelection}
    >
      <h2 id="transcript-title">Transcript</h2>
      {selection ? (
        <div className="selection-action" role="toolbar" aria-label="Action sur la sélection">
          <span>{selection.text.length} caractères sélectionnés</span>
          <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={addToNote}>
            Ajouter à la note
          </button>
        </div>
      ) : null}
      {feedback || selectionError ? (
        <p className="selection-feedback" role="status">
          {feedback ?? selectionError}
        </p>
      ) : null}
      {blocks.length > 0 ? (
        <ol className="transcript-list">
          {blocks.map((block) => (
            <li key={block.block_index} data-transcript-start={block.start_ms}>
              <time>{formatTimestamp(block.start_ms)}</time>
              <p>{block.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>Transcript indisponible.</p>
      )}
    </section>
  );
}

function selectedTranscriptExcerpt(container: HTMLElement | null): {
  excerpt: NoteExcerpt | null;
  error: string | null;
} {
  const selection = window.getSelection();
  if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { excerpt: null, error: null };
  }
  const range = selection.getRangeAt(0);
  const startElement = elementForNode(range.startContainer);
  const endElement = elementForNode(range.endContainer);
  if (!startElement || !endElement || !container.contains(startElement) || !container.contains(endElement)) {
    return { excerpt: null, error: null };
  }
  const startBlock = startElement.closest<HTMLElement>("[data-transcript-start]");
  if (!startBlock) return { excerpt: null, error: null };

  const fragment = range.cloneContents();
  fragment.querySelectorAll("time").forEach((time) => time.remove());
  fragment.querySelectorAll("p").forEach((paragraph) => paragraph.append(document.createTextNode(" ")));
  const text = (fragment.textContent ?? selection.toString()).replace(/\s+/g, " ").trim();
  if (!text) return { excerpt: null, error: null };
  if (text.length > 5_000) {
    return { excerpt: null, error: "Sélection trop longue. Choisissez un passage plus court." };
  }
  const startMs = Number(startBlock.dataset.transcriptStart);
  if (!Number.isSafeInteger(startMs) || startMs < 0) return { excerpt: null, error: null };
  return { excerpt: { text, start_ms: startMs }, error: null };
}

function elementForNode(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
