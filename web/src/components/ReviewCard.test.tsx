import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ReviewCard } from "./ReviewCard";

const video = {
  id: "video-1",
  job_id: "job-1",
  youtube_id: "abcdefghijk",
  playlist_index: 1,
  title: "Une vidéo à décider",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  channel: "Chaîne fixture",
  duration_seconds: 125,
  state: "READY" as const,
  summary_markdown: "# Résumé\n\nUn aperçu utile.",
  public_error: null,
  provenance: { source_type: "youtube" },
  note_body: "",
  note_version: 1,
  decision: "PENDING" as const,
  decision_version: 1,
  job_state: "READY" as const,
  job_stage: "PROCESSING_COMPLETE",
  job_finalize_state: "NOT_STARTED" as const,
  job_total_videos: 1,
  job_failed_videos: 0,
};

function renderCard(onDecision = vi.fn()) {
  render(
    <MemoryRouter>
      <ReviewCard video={video} busy={false} onDecision={onDecision} />
    </MemoryRouter>,
  );
  return { card: screen.getByRole("article"), onDecision };
}

describe("ReviewCard swipe", () => {
  it("returns to its origin below the decision threshold", () => {
    const { card, onDecision } = renderCard();

    fireEvent.pointerDown(card, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 125, pointerId: 1 });
    expect(card).toHaveStyle({ transform: "translate3d(25px, 0, 0)" });
    fireEvent.pointerUp(card, { clientX: 125, pointerId: 1 });

    expect(onDecision).not.toHaveBeenCalled();
    expect(card).toHaveStyle({ transform: "translate3d(0px, 0, 0)" });
  });

  it("commits in either direction above the threshold", () => {
    const { card, onDecision } = renderCard();

    fireEvent.pointerDown(card, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 190, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 190, pointerId: 1 });
    expect(onDecision).toHaveBeenLastCalledWith("KEPT");

    fireEvent.pointerDown(card, { button: 0, clientX: 200, pointerId: 2 });
    fireEvent.pointerMove(card, { clientX: 100, pointerId: 2 });
    fireEvent.pointerUp(card, { clientX: 100, pointerId: 2 });
    expect(onDecision).toHaveBeenLastCalledWith("DISCARDED");
  });

  it("keeps both visible buttons usable without a gesture", () => {
    const { onDecision } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: /Écarter/ }));
    fireEvent.click(screen.getByRole("button", { name: /Garder/ }));

    expect(onDecision.mock.calls).toEqual([["DISCARDED"], ["KEPT"]]);
  });
});
