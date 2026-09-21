import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewPage } from "./ReviewPage";

afterEach(() => vi.unstubAllGlobals());

describe("ReviewPage decisions", () => {
  it("optimistically advances then restores the previous card with Undo", async () => {
    const requests = stubReviewApi();
    const user = userEvent.setup();
    renderReview();

    expect(await screen.findByRole("heading", { name: "Première vidéo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Garder/ }));

    expect(screen.getByRole("heading", { name: "Deuxième vidéo" })).toBeInTheDocument();
    expect(await screen.findByText(/« Première vidéo » conservée/)).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: "PUT",
      path: "/api/videos/video-1/decision",
      body: { decision: "KEPT", base_version: 1 },
    });

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(await screen.findByRole("heading", { name: "Première vidéo" })).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: "POST",
      path: "/api/videos/video-1/decision/undo",
      body: { base_version: 2 },
    });
  });

  it("maps desktop arrows to decisions but ignores typing fields", async () => {
    const requests = stubReviewApi();
    renderReview(<textarea aria-label="Note de test" />);

    await screen.findByRole("heading", { name: "Première vidéo" });
    const note = screen.getByRole("textbox", { name: "Note de test" });
    note.focus();
    fireEvent.keyDown(note, { key: "ArrowRight" });
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(0);

    note.blur();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(requests).toContainEqual({
        method: "PUT",
        path: "/api/videos/video-1/decision",
        body: { decision: "DISCARDED", base_version: 1 },
      });
    });
  });

  it("also restores a discarded card with Undo", async () => {
    const requests = stubReviewApi();
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: /Écarter/ }));
    expect(await screen.findByText(/« Première vidéo » écartée/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(await screen.findByRole("heading", { name: "Première vidéo" })).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: "POST",
      path: "/api/videos/video-1/decision/undo",
      body: { base_version: 2 },
    });
  });

  it("restores the card and reports a version conflict", async () => {
    stubReviewApi({ conflict: true });
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: /Écarter/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Décision modifiée dans un autre onglet.");
    expect(screen.getByRole("heading", { name: "Première vidéo" })).toBeInTheDocument();
  });
});

function renderReview(extra?: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ReviewPage />
      {extra}
    </MemoryRouter>,
  );
}

function stubReviewApi(options: { conflict?: boolean } = {}) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "https://summarizer.test");
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : null;
      if (method !== "GET") requests.push({ method, path: url.pathname, body });

      if (url.pathname === "/api/review") return json({ videos });
      if (url.pathname === "/api/videos/video-1/decision" && options.conflict) {
        return json(
          { error: { message: "Décision modifiée dans un autre onglet.", diagnostic_code: "DECISION_VERSION_CONFLICT" } },
          409,
        );
      }
      if (url.pathname === "/api/videos/video-1/decision") {
        return json({
          decision: {
            video_id: "video-1",
            decision: body.decision,
            previous_decision: "PENDING",
            version: 2,
          },
        });
      }
      if (url.pathname === "/api/videos/video-1/decision/undo") {
        return json({
          decision: {
            video_id: "video-1",
            decision: "PENDING",
            previous_decision: body.decision,
            version: 3,
          },
        });
      }
      return json({ error: { message: "Route de test inconnue" } }, 404);
    }),
  );
  return requests;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const videoBase = {
  job_id: "job-1",
  youtube_id: "abcdefghijk",
  playlist_index: 1,
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  channel: "Chaîne fixture",
  duration_seconds: 120,
  state: "READY",
  summary_markdown: "Résumé fixture",
  public_error: null,
  provenance: { source_type: "youtube" },
  note_body: "",
  note_version: 1,
  decision: "PENDING",
  decision_version: 1,
};

const videos = [
  { ...videoBase, id: "video-1", title: "Première vidéo" },
  { ...videoBase, id: "video-2", title: "Deuxième vidéo", playlist_index: 2 },
];
