import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoteRecord } from "../api/client";
import { NoteEditor } from "./NoteEditor";

const VIDEO_ID = "video-note-fixture";
const DRAFT_KEY = `summarizer:note-draft:v1:${VIDEO_ID}`;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("NoteEditor autosave", () => {
  it("serializes saves so a late response cannot overwrite newer typing", async () => {
    vi.useFakeTimers();
    const first = deferred<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(noteResponse("Deuxième version", 3));
    vi.stubGlobal("fetch", fetchMock);
    render(<NoteEditor videoId={VIDEO_ID} note={note()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Note personnelle" }), {
      target: { value: "Première version" },
    });
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("textbox", { name: "Note personnelle" }), {
      target: { value: "Deuxième version" },
    });
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(noteResponse("Première version", 2));
      await first.promise;
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestPayload(fetchMock, 1)).toMatchObject({
      body: "Deuxième version",
      base_version: 2,
    });
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("keeps a conflicting draft and only reapplies it after an explicit retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: "Une version plus récente de la note existe.",
              diagnostic_code: "NOTE_VERSION_CONFLICT",
              details: { current_version: 2 },
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          video: {},
          note: note("Modification distante", 2),
          decision: null,
          transcript: [],
        }),
      )
      .mockResolvedValueOnce(noteResponse("Mon brouillon", 3));
    vi.stubGlobal("fetch", fetchMock);
    render(<NoteEditor videoId={VIDEO_ID} note={note()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Note personnelle" }), {
      target: { value: "Mon brouillon" },
    });
    await act(() => vi.advanceTimersByTimeAsync(750));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("textbox")).toHaveValue("Mon brouillon");
    expect(screen.getByRole("status")).toHaveTextContent("Note modifiée ailleurs");
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}")).toMatchObject({
      body: "Mon brouillon",
      baseVersion: 2,
    });

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await act(async () => Promise.resolve());

    expect(requestPayload(fetchMock, 2)).toMatchObject({ body: "Mon brouillon", base_version: 2 });
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré");
  });

  it("retains an offline draft and resumes automatically when connectivity returns", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(<NoteEditor videoId={VIDEO_ID} note={note()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Note personnelle" }), {
      target: { value: "Brouillon hors ligne" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1_950));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("status")).toHaveTextContent("Synchronisation interrompue");
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}")).toMatchObject({
      body: "Brouillon hors ligne",
      baseVersion: 1,
    });

    fetchMock.mockResolvedValueOnce(noteResponse("Brouillon hors ligne", 2));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("Enregistré");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("restores and autosaves a compatible draft after a reload", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        body: "Brouillon restauré",
        baseVersion: 1,
        updatedAt: "2026-09-20T20:00:00Z",
      }),
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(noteResponse("Brouillon restauré", 2));
    vi.stubGlobal("fetch", fetchMock);

    render(<NoteEditor videoId={VIDEO_ID} note={note()} />);

    expect(screen.getByRole("textbox", { name: "Note personnelle" })).toHaveValue("Brouillon restauré");
    expect(screen.getByRole("status")).toHaveTextContent("Modifications locales");
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(requestPayload(fetchMock, 0)).toMatchObject({ body: "Brouillon restauré", base_version: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Enregistré");
  });

  it("flushes a quick navigation with keepalive while preserving the local draft", async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<NoteEditor videoId={VIDEO_ID} note={note()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Note personnelle" }), {
      target: { value: "Texte avant navigation" },
    });
    view.unmount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}")).toMatchObject({
      body: "Texte avant navigation",
    });

    await act(async () => {
      pending.resolve(noteResponse("Texte avant navigation", 2));
      await pending.promise;
    });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

function note(body = "", version = 1): NoteRecord {
  return {
    video_id: VIDEO_ID,
    body,
    excerpts_json: "[]",
    version,
    updated_at: "2026-09-20T20:00:00Z",
  };
}

function noteResponse(body: string, version: number): Response {
  return jsonResponse({ note: note(body, version) });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestPayload(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number) {
  const init = fetchMock.mock.calls[callIndex]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
