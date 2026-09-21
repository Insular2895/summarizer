import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Summarizer application shell", () => {
  it("renders the Home source entry without mode choices", () => {
    renderApp();

    expect(
      screen.getByRole("heading", {
        name: "Transformez une source en connaissance exploitable",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Source YouTube")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vidéo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Playlist" })).not.toBeInTheDocument();
  });

  it("navigates between the three primary destinations", async () => {
    stubApi((path) => (path === "/api/review" ? { videos: [] } : {}));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("link", { name: "Review" }));
    expect(await screen.findByRole("heading", { name: "Aucune vidéo prête" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByRole("heading", { name: "Aucune session terminée" })).toBeInTheDocument();
  });

  it("renders a ready video with summary and timestamped transcript", async () => {
    stubApi((path) => {
      if (path === "/api/videos/video-123") return videoDetail;
      return {};
    });
    renderApp("/review/video-123");

    expect(await screen.findByRole("heading", { name: "Fixture vidéo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Résumé" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Résumé déterministe", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note personnelle" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Enregistrer" })).not.toBeInTheDocument();
    expect(screen.getByText("Premier bloc")).toBeInTheDocument();
    expect(screen.getByText("0:01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Garder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Écarter" })).not.toBeInTheDocument();
  });

  it("submits one URL and navigates to readable processing feedback", async () => {
    stubApi((path) => {
      if (path === "/api/sources") return sourceReceipt;
      if (path === "/api/jobs/job-123") {
        return { ...sourceReceipt, videos: [videoDetail.video] };
      }
      return {};
    });
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Source YouTube"), "https://youtu.be/abcdefghijk");
    await user.click(screen.getByRole("button", { name: "Commencer" }));

    expect(await screen.findByRole("heading", { name: "Source prise en charge" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Ouvrir « Fixture vidéo »" })).toHaveAttribute(
      "href",
      "/review/video-123",
    );
  });

  it("shows every playlist occurrence in source order while results arrive", async () => {
    stubApi((path) => {
      if (path === "/api/jobs/job-playlist") return playlistDetail;
      return {};
    });

    renderApp("/processing/job-playlist");

    expect(await screen.findByText("2 sur 4 traitées · 1 prête · 1 échec")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Première",
      "Deuxième",
      "Première (copie)",
      "Quatrième",
    ]);
    expect(screen.getByText("En attente")).toBeInTheDocument();
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("Prête")).toBeInTheDocument();
    expect(screen.getByText("Échec")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir « Première (copie) »" })).toHaveAttribute(
      "href",
      "/review/video-copy",
    );
  });

  it("shows clear feedback when Home is submitted without a URL", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Commencer" }));

    expect(screen.getByRole("status")).toHaveTextContent("Collez une URL YouTube pour commencer.");
  });
});

function stubApi(resolve: (path: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://summarizer.test");
      return new Response(JSON.stringify(resolve(url.pathname)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const source = {
  id: "source-123",
  normalized_url: "https://www.youtube.com/watch?v=abcdefghijk",
  source_kind: "youtube_video",
  title: "Fixture vidéo",
  status: "READY",
};

const job = {
  id: "job-123",
  source_id: "source-123",
  state: "READY",
  stage: "PROCESSING_COMPLETE",
  progress: 1,
  total_videos: 1,
  ready_videos: 1,
  failed_videos: 0,
  public_error: null,
};

const sourceReceipt = { source, job };

const videoDetail = {
  video: {
    id: "video-123",
    job_id: "job-123",
    youtube_id: "abcdefghijk",
    playlist_index: 1,
    title: "Fixture vidéo",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    channel: "Fixture channel",
    duration_seconds: 61,
    state: "READY",
    summary_markdown: "# Résumé déterministe",
    public_error: null,
    provenance: { source_type: "youtube" },
  },
  note: { video_id: "video-123", body: "", excerpts_json: "[]", version: 1, updated_at: "2026-09-20" },
  decision: { video_id: "video-123", decision: "PENDING", previous_decision: null, version: 1 },
  transcript: [{ block_index: 0, start_ms: 1_000, end_ms: 2_000, text: "Premier bloc" }],
};

const playlistDetail = {
  source: {
    ...source,
    id: "source-playlist",
    source_kind: "youtube_playlist",
    title: "Playlist fixture",
  },
  job: {
    ...job,
    id: "job-playlist",
    source_id: "source-playlist",
    state: "READY",
    stage: "SUMMARIZATION",
    progress: 0.5,
    total_videos: 4,
    ready_videos: 1,
    failed_videos: 1,
  },
  videos: [
    { ...videoDetail.video, id: "video-queued", title: "Première", playlist_index: 1, state: "QUEUED" },
    { ...videoDetail.video, id: "video-processing", title: "Deuxième", playlist_index: 2, state: "PROCESSING" },
    { ...videoDetail.video, id: "video-copy", title: "Première (copie)", playlist_index: 3, state: "READY" },
    {
      ...videoDetail.video,
      id: "video-failed",
      title: "Quatrième",
      playlist_index: 4,
      state: "FAILED",
      public_error: "Sous-titres indisponibles.",
    },
  ],
};
