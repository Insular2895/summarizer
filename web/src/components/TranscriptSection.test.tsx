import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TranscriptSection } from "./TranscriptSection";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
});

describe("TranscriptSection selection", () => {
  it("adds an exact partial selection with the timestamp of its block", () => {
    const onAddExcerpt = vi.fn();
    render(
      <TranscriptSection
        blocks={[
          { block_index: 0, start_ms: 1_000, end_ms: 2_000, text: "Premier passage utile." },
        ]}
        onAddExcerpt={onAddExcerpt}
      />,
    );

    const paragraph = screen.getByText("Premier passage utile.");
    selectRange(paragraph, 8, paragraph, 15);

    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la note" }));

    expect(onAddExcerpt).toHaveBeenCalledWith({ text: "passage", start_ms: 1_000 });
    expect(screen.getByRole("status")).toHaveTextContent("Ajouté à la note");
  });

  it("keeps one readable excerpt and the earliest timestamp for a multiblock selection", () => {
    const onAddExcerpt = vi.fn();
    render(
      <TranscriptSection
        blocks={[
          { block_index: 0, start_ms: 5_000, end_ms: 8_000, text: "Alpha important" },
          { block_index: 1, start_ms: 8_000, end_ms: 11_000, text: "Bêta finale" },
        ]}
        onAddExcerpt={onAddExcerpt}
      />,
    );

    selectRange(screen.getByText("Alpha important"), 6, screen.getByText("Bêta finale"), 4);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la note" }));

    expect(onAddExcerpt).toHaveBeenCalledWith({ text: "important Bêta", start_ms: 5_000 });
  });
});

function selectRange(
  startElement: HTMLElement,
  startOffset: number,
  endElement: HTMLElement,
  endOffset: number,
) {
  const start = startElement.firstChild;
  const end = endElement.firstChild;
  if (!start || !end) throw new Error("Transcript fixture is missing text nodes.");
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  act(() => document.dispatchEvent(new Event("selectionchange")));
}
