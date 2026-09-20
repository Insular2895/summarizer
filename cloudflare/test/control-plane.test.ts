import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ApiError, readJson } from "../src/http";
import { normalizeYouTubeUrl } from "../src/youtube";

const USER = "owner@example.test";
const WORKER_HEADERS = {
  authorization: "Bearer test-worker-token",
  "content-type": "application/json",
};

describe("Summarizer Web V1 control plane", () => {
  it("runs the full create, lease, review, finalization and history flow", async () => {
    const createdResponse = await api("/api/sources", {
      method: "POST",
      user: USER,
      idempotencyKey: "create-flow-0001",
      body: { url: "https://youtu.be/dQw4w9WgXcQ" },
    });
    expect(createdResponse.status).toBe(201);
    const created = await bodyOf<CreatedResponse>(createdResponse);
    expect(created.source.source_kind).toBe("youtube_video");
    expect(created.job.state).toBe("QUEUED");
    expect((await api(`/api/jobs/${created.job.id}`, { user: "other-owner@example.test" })).status).toBe(404);

    const claimResponse = await api("/api/worker/jobs/claim", {
      method: "POST",
      headers: WORKER_HEADERS,
      body: { worker_id: "worker-test", lease_seconds: 300 },
    });
    expect(claimResponse.status).toBe(200);
    const claim = await bodyOf<ClaimResponse>(claimResponse);
    expect(claim.lease.job.id).toBe(created.job.id);

    const leaseBody = {
      worker_id: "worker-test",
      lease_token: claim.lease.lease_token,
    };
    const videoId = "video_flow_1";
    const event = {
      ...leaseBody,
      event_id: "evt-flow-transcript",
      video_id: videoId,
      status: "PROCESSING",
      stage: "TRANSCRIPT",
      progress: 0.5,
      occurred_at: new Date().toISOString(),
    };
    const eventResponse = await api(`/api/worker/jobs/${created.job.id}/events`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: event,
    });
    expect(eventResponse.status).toBe(202);
    expect(await bodyOf<{ duplicate: boolean }>(eventResponse)).toEqual({ accepted: true, duplicate: false });
    const repeatedEvent = await api(`/api/worker/jobs/${created.job.id}/events`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: event,
    });
    expect((await bodyOf<{ duplicate: boolean }>(repeatedEvent)).duplicate).toBe(true);

    const resultResponse = await api(`/api/worker/jobs/${created.job.id}/videos/${videoId}/result`, {
      method: "PUT",
      headers: WORKER_HEADERS,
      body: {
        ...leaseBody,
        youtube_id: "dQw4w9WgXcQ",
        playlist_index: 1,
        title: "Fixture vidéo",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        channel: "Fixture channel",
        duration_seconds: 213,
        summary_markdown: "# Résumé\n\nUn contenu de test.",
        model_used: "fixture-model",
        provenance: {
          source_type: "youtube",
          source_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          subtitle_format: "srt",
        },
        transcript: [
          { block_index: 0, start_ms: 0, end_ms: 1_500, text: "Premier bloc" },
          { block_index: 1, start_ms: 1_500, end_ms: 3_000, text: "Deuxième bloc" },
        ],
      },
    });
    expect(resultResponse.status).toBe(200);

    const completeResponse = await api(`/api/worker/jobs/${created.job.id}/complete`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: leaseBody,
    });
    expect((await bodyOf<{ job: { state: string; total_videos: number } }>(completeResponse)).job).toMatchObject({
      state: "READY",
      total_videos: 1,
    });

    const review = await bodyOf<{ videos: Array<{ id: string }> }>(await api("/api/review", { user: USER }));
    expect(review.videos.map((video) => video.id)).toContain(videoId);
    const detail = await bodyOf<{ video: { provenance: Record<string, string> }; transcript: unknown[] }>(
      await api(`/api/videos/${videoId}`, { user: USER }),
    );
    expect(detail.transcript).toHaveLength(2);
    expect(detail.video.provenance.subtitle_format).toBe("srt");

    const noteResponse = await api(`/api/videos/${videoId}/note`, {
      method: "PUT",
      user: USER,
      body: {
        body: "Ma note",
        excerpts: [{ text: "Premier bloc", start_ms: 0 }],
        base_version: 1,
      },
    });
    expect((await bodyOf<{ note: { version: number } }>(noteResponse)).note.version).toBe(2);
    const staleNote = await api(`/api/videos/${videoId}/note`, {
      method: "PUT",
      user: USER,
      body: { body: "Écrasement tardif", excerpts: [], base_version: 1 },
    });
    expect(staleNote.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(staleNote)).error.diagnostic_code).toBe("NOTE_VERSION_CONFLICT");

    const keepResponse = await api(`/api/videos/${videoId}/decision`, {
      method: "PUT",
      user: USER,
      body: { decision: "KEPT", base_version: 1 },
    });
    expect((await bodyOf<DecisionResponse>(keepResponse)).decision).toMatchObject({ decision: "KEPT", version: 2 });
    const repeatedKeep = await api(`/api/videos/${videoId}/decision`, {
      method: "PUT",
      user: USER,
      body: { decision: "KEPT", base_version: 1 },
    });
    expect((await bodyOf<DecisionResponse>(repeatedKeep)).decision.version).toBe(2);

    const undoResponse = await api(`/api/videos/${videoId}/decision/undo`, {
      method: "POST",
      user: USER,
      idempotencyKey: "undo-flow-0001",
      body: { base_version: 2 },
    });
    expect((await bodyOf<DecisionResponse>(undoResponse)).decision).toMatchObject({ decision: "PENDING", version: 3 });
    const repeatedUndo = await api(`/api/videos/${videoId}/decision/undo`, {
      method: "POST",
      user: USER,
      idempotencyKey: "undo-flow-0001",
      body: { base_version: 2 },
    });
    expect((await bodyOf<DecisionResponse>(repeatedUndo)).decision).toMatchObject({ decision: "PENDING", version: 3 });

    await api(`/api/videos/${videoId}/decision`, {
      method: "PUT",
      user: USER,
      body: { decision: "DISCARDED", base_version: 3 },
    });
    const finalizeResponse = await api(`/api/jobs/${created.job.id}/finalize`, {
      method: "POST",
      user: USER,
      idempotencyKey: "finalize-flow-0001",
      body: {},
    });
    expect(finalizeResponse.status).toBe(202);
    expect((await bodyOf<{ job: { finalize_state: string } }>(finalizeResponse)).job.finalize_state).toBe("REQUESTED");

    const exportResponse = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...leaseBody,
        success: true,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: true,
      },
    });
    expect((await bodyOf<{ job: { state: string; finalize_state: string } }>(exportResponse)).job).toMatchObject({
      state: "DONE",
      finalize_state: "CLEANED",
    });

    const history = await bodyOf<{ entries: Array<{ source_id: string; discarded_videos: number }> }>(
      await api("/api/history", { user: USER }),
    );
    expect(history.entries).toContainEqual(expect.objectContaining({ source_id: created.source.id, discarded_videos: 1 }));
  });

  it("keeps source creation idempotent and rejects key reuse for another URL", async () => {
    const options: ApiOptions = {
      method: "POST",
      user: "idempotency@example.test",
      idempotencyKey: "source-repeat-0001",
      body: { url: "https://www.youtube.com/watch?v=abcdefghijk" },
    };
    const first = await bodyOf<CreatedResponse>(await api("/api/sources", options));
    const second = await bodyOf<CreatedResponse>(await api("/api/sources", options));
    expect(second.job.id).toBe(first.job.id);

    const prematureFinalize = await api(`/api/jobs/${first.job.id}/finalize`, {
      method: "POST",
      user: options.user,
      idempotencyKey: "finalize-too-soon-0001",
      body: {},
    });
    expect(prematureFinalize.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(prematureFinalize)).error.diagnostic_code).toBe("JOB_NOT_REVIEWABLE");

    const collision = await api("/api/sources", {
      ...options,
      body: { url: "https://www.youtube.com/watch?v=lmnopqrstuv" },
    });
    expect(collision.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(collision)).error.diagnostic_code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("separates browser and worker authentication", async () => {
    expect((await api("/api/history")).status).toBe(401);
    const worker = await api("/api/worker/jobs/claim", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
      body: { worker_id: "worker-test" },
    });
    expect(worker.status).toBe(401);
    expect((await bodyOf<ErrorResponse>(worker)).error.diagnostic_code).toBe("WORKER_AUTH_INVALID");
  });

  it("exposes health without authentication", async () => {
    const response = await api("/api/health");
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ status: "ok", service: "summarizer-control-plane" });
  });
});

describe("input boundaries", () => {
  it("normalizes supported YouTube video and playlist URLs", () => {
    expect(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      normalizedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      sourceKind: "youtube_video",
    });
    expect(normalizeYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890")).toMatchObject({
      normalizedUrl: "https://www.youtube.com/playlist?list=PL1234567890",
      sourceKind: "youtube_playlist",
    });
    expect(() => normalizeYouTubeUrl("https://example.com/video")).toThrowError(ApiError);
  });

  it("rejects a declared payload over the configured limit before parsing", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "257000" },
      body: "{}",
    });
    await expect(readJson(request)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });
});

interface ApiOptions {
  method?: string;
  user?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

async function api(path: string, options: ApiOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.user) headers.set("x-summarizer-user", options.user);
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return SELF.fetch(`https://summarizer.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function bodyOf<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

interface CreatedResponse {
  source: { id: string; source_kind: string };
  job: { id: string; state: string };
}

interface ClaimResponse {
  lease: { job: { id: string }; lease_token: string };
}

interface DecisionResponse {
  decision: { decision: string; version: number };
}

interface ErrorResponse {
  error: { message: string; diagnostic_code: string };
}
