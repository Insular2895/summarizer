import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
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
    const planResponse = await api(`/api/worker/jobs/${created.job.id}/plan`, {
      method: "PUT",
      headers: WORKER_HEADERS,
      body: {
        ...leaseBody,
        title: "Fixture vidéo",
        videos: [
          {
            video_id: videoId,
            youtube_id: "dQw4w9WgXcQ",
            playlist_index: 1,
            title: "Fixture vidéo",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        ],
      },
    });
    expect(await bodyOf(planResponse)).toEqual({ accepted: true, total_videos: 1 });
    const planned = await bodyOf<{ job: { progress: number }; videos: Array<{ id: string; state: string }> }>(
      await api(`/api/jobs/${created.job.id}`, { user: USER }),
    );
    expect(planned.job.progress).toBe(0);
    expect(planned.videos).toEqual([expect.objectContaining({ id: videoId, state: "QUEUED" })]);

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
    const processing = await bodyOf<{
      job: { progress: number };
      videos: Array<{ id: string; state: string; progress: number }>;
    }>(await api(`/api/jobs/${created.job.id}`, { user: USER }));
    expect(processing.job.progress).toBe(0);
    expect(processing.videos).toEqual([
      expect.objectContaining({ id: videoId, state: "PROCESSING", progress: 0.5 }),
    ]);

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
    const notedDetail = await bodyOf<{ note: { body: string; excerpts_json: string } }>(
      await api(`/api/videos/${videoId}`, { user: USER }),
    );
    expect(notedDetail.note.body).toBe("Ma note");
    expect(JSON.parse(notedDetail.note.excerpts_json)).toEqual([{ text: "Premier bloc", start_ms: 0 }]);
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

    const staleDiscard = await api(`/api/videos/${videoId}/decision`, {
      method: "PUT",
      user: USER,
      body: { decision: "DISCARDED", base_version: 1 },
    });
    expect(staleDiscard.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(staleDiscard)).error.diagnostic_code).toBe("DECISION_VERSION_CONFLICT");

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

    const repeatedFinalize = await api(`/api/jobs/${created.job.id}/finalize`, {
      method: "POST",
      user: USER,
      idempotencyKey: "finalize-flow-0002",
      body: {},
    });
    expect((await bodyOf<{ job: { finalize_state: string } }>(repeatedFinalize)).job.finalize_state).toBe("REQUESTED");

    const frozenDecision = await api(`/api/videos/${videoId}/decision`, {
      method: "PUT",
      user: USER,
      body: { decision: "KEPT", base_version: 4 },
    });
    expect(frozenDecision.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(frozenDecision)).error.diagnostic_code).toBe("REVIEW_FROZEN");

    const firstFinalizeClaim = await bodyOf<ClaimResponse>(
      await api("/api/worker/jobs/claim", {
        method: "POST",
        headers: WORKER_HEADERS,
        body: { worker_id: "finalizer-crashed", lease_seconds: 15 },
      }),
    );
    expect(firstFinalizeClaim.lease.work_kind).toBe("FINALIZE");
    expect(firstFinalizeClaim.lease.job.finalize_state).toBe("EXPORTING");

    // Simulate a crash after an idempotent outbox write but before its confirmation.
    await env.DB.prepare("UPDATE jobs SET lease_expires_at = ? WHERE id = ?")
      .bind("2000-01-01T00:00:00.000Z", created.job.id)
      .run();
    const resumedFinalizeClaim = await bodyOf<ClaimResponse>(
      await api("/api/worker/jobs/claim", {
        method: "POST",
        headers: WORKER_HEADERS,
        body: { worker_id: "finalizer-resumed", lease_seconds: 15 },
      }),
    );
    expect(resumedFinalizeClaim.lease.job.finalize_state).toBe("EXPORTING");
    const resumedLease = {
      worker_id: "finalizer-resumed",
      lease_token: resumedFinalizeClaim.lease.lease_token,
    };

    const failedExport = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...resumedLease,
        success: false,
        cleanup_complete: false,
        diagnostic_code: "OUTBOX_WRITE_FAILED",
      },
    });
    expect((await bodyOf<{ job: { state: string; finalize_state: string } }>(failedExport)).job).toMatchObject({
      state: "READY",
      finalize_state: "FAILED",
    });
    expect((await bodyOf<{ videos: unknown[] }>(await api("/api/review", { user: USER }))).videos).toHaveLength(1);
    expect((await bodyOf<{ entries: unknown[] }>(await api("/api/history", { user: USER }))).entries).toHaveLength(0);

    const retryFinalize = await api(`/api/jobs/${created.job.id}/finalize`, {
      method: "POST",
      user: USER,
      idempotencyKey: "finalize-flow-retry-0001",
      body: {},
    });
    expect((await bodyOf<{ job: { finalize_state: string } }>(retryFinalize)).job.finalize_state).toBe("REQUESTED");
    const exportClaim = await bodyOf<ClaimResponse>(
      await api("/api/worker/jobs/claim", {
        method: "POST",
        headers: WORKER_HEADERS,
        body: { worker_id: "finalizer-export", lease_seconds: 15 },
      }),
    );
    const exportLease = { worker_id: "finalizer-export", lease_token: exportClaim.lease.lease_token };

    const exportManifest = await bodyOf<{ manifest: { kept_videos: unknown[] } }>(
      await api(`/api/worker/jobs/${created.job.id}/export-manifest`, {
        method: "POST",
        headers: WORKER_HEADERS,
        body: exportLease,
      }),
    );
    expect(exportManifest.manifest.kept_videos).toEqual([]);
    const discardedExportItem = await api(`/api/worker/jobs/${created.job.id}/export-items/${videoId}`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: exportLease,
    });
    expect(discardedExportItem.status).toBe(404);
    expect((await bodyOf<ErrorResponse>(discardedExportItem)).error.diagnostic_code).toBe("EXPORT_ITEM_NOT_FOUND");

    const prematureCleanup = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...exportLease,
        success: true,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: true,
      },
    });
    expect(prematureCleanup.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(prematureCleanup)).error.diagnostic_code).toBe("EXPORT_NOT_CONFIRMED");

    const exportResponse = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...exportLease,
        success: true,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: false,
      },
    });
    expect((await bodyOf<{ job: { state: string; finalize_state: string } }>(exportResponse)).job).toMatchObject({
      state: "READY",
      finalize_state: "EXPORTED",
    });
    const repeatedExport = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...exportLease,
        success: true,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: false,
      },
    });
    expect((await bodyOf<{ job: { finalize_state: string } }>(repeatedExport)).job.finalize_state).toBe("EXPORTED");

    const failedCleanup = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...exportLease,
        success: false,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: false,
        diagnostic_code: "CLEANUP_FAILED",
      },
    });
    expect((await bodyOf<{ job: { finalize_state: string; stage: string } }>(failedCleanup)).job).toMatchObject({
      finalize_state: "EXPORTED",
      stage: "CLEANUP_FAILED",
    });
    expect((await bodyOf<{ entries: unknown[] }>(await api("/api/history", { user: USER }))).entries).toHaveLength(0);

    const cleanupClaim = await bodyOf<ClaimResponse>(
      await api("/api/worker/jobs/claim", {
        method: "POST",
        headers: WORKER_HEADERS,
        body: { worker_id: "finalizer-cleanup", lease_seconds: 15 },
      }),
    );
    expect(cleanupClaim.lease.job.finalize_state).toBe("EXPORTED");
    const cleanupLease = { worker_id: "finalizer-cleanup", lease_token: cleanupClaim.lease.lease_token };
    const cleanupResponse = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...cleanupLease,
        success: true,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: true,
      },
    });
    expect((await bodyOf<{ job: { state: string; finalize_state: string } }>(cleanupResponse)).job).toMatchObject({
      state: "DONE",
      finalize_state: "CLEANED",
    });
    const repeatedCleanup = await api(`/api/worker/jobs/${created.job.id}/export-result`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: {
        ...cleanupLease,
        success: true,
        export_reference: "output/graphipy_ready/session-flow",
        cleanup_complete: true,
      },
    });
    expect((await bodyOf<{ job: { state: string } }>(repeatedCleanup)).job.state).toBe("DONE");

    const history = await bodyOf<{ entries: Array<{ source_id: string; discarded_videos: number }> }>(
      await api("/api/history", { user: USER }),
    );
    expect(history.entries).toContainEqual(expect.objectContaining({ source_id: created.source.id, discarded_videos: 1 }));
    expect(Object.keys(history.entries[0]).sort()).toEqual(
      [
        "completed_at",
        "discarded_videos",
        "export_status",
        "failed_videos",
        "final_status",
        "first_kept_video_id",
        "id",
        "kept_videos",
        "normalized_url",
        "source_id",
        "source_kind",
        "title",
        "total_videos",
      ].sort(),
    );
    expect((await bodyOf<{ videos: unknown[] }>(await api("/api/review", { user: USER }))).videos).toEqual([]);
  });

  it("allows only one active lease and reclaims it after expiration", async () => {
    const created = await bodyOf<CreatedResponse>(
      await api("/api/sources", {
        method: "POST",
        user: "lease-owner@example.test",
        idempotencyKey: "lease-source-0001",
        body: { url: "https://www.youtube.com/watch?v=leaseid1234" },
      }),
    );
    const first = await api("/api/worker/jobs/claim", {
      method: "POST",
      headers: WORKER_HEADERS,
      body: { worker_id: "worker-one", lease_seconds: 15 },
    });
    expect(first.status).toBe(200);
    expect((await bodyOf<ClaimResponse>(first)).lease.job.id).toBe(created.job.id);

    const concurrent = await api("/api/worker/jobs/claim", {
      method: "POST",
      headers: WORKER_HEADERS,
      body: { worker_id: "worker-two", lease_seconds: 15 },
    });
    expect(concurrent.status).toBe(204);

    await env.DB.prepare("UPDATE jobs SET lease_expires_at = ? WHERE id = ?")
      .bind("2000-01-01T00:00:00.000Z", created.job.id)
      .run();
    const reclaimed = await api("/api/worker/jobs/claim", {
      method: "POST",
      headers: WORKER_HEADERS,
      body: { worker_id: "worker-two", lease_seconds: 15 },
    });
    expect(reclaimed.status).toBe(200);
    expect((await bodyOf<ClaimResponse>(reclaimed)).lease.job.id).toBe(created.job.id);
  });

  it("preserves duplicate playlist occurrences and resumes only exact ready entries", async () => {
    const owner = "playlist-owner@example.test";
    const created = await bodyOf<CreatedResponse>(
      await api("/api/sources", {
        method: "POST",
        user: owner,
        idempotencyKey: "playlist-source-0001",
        body: { url: "https://www.youtube.com/playlist?list=PL1234567890" },
      }),
    );
    const firstClaim = await bodyOf<ClaimResponse>(
      await api("/api/worker/jobs/claim", {
        method: "POST",
        headers: WORKER_HEADERS,
        body: { worker_id: "playlist-worker-one", lease_seconds: 300 },
      }),
    );
    const firstLease = {
      worker_id: "playlist-worker-one",
      lease_token: firstClaim.lease.lease_token,
    };
    const plannedVideos = [
      {
        video_id: "video_playlist_a_1",
        youtube_id: "aaaaaaaaaaa",
        playlist_index: 1,
        title: "A",
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      },
      {
        video_id: "video_playlist_b_2",
        youtube_id: "bbbbbbbbbbb",
        playlist_index: 2,
        title: "B",
        url: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
      },
      {
        video_id: "video_playlist_a_3",
        youtube_id: "aaaaaaaaaaa",
        playlist_index: 3,
        title: "A (copie)",
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      },
    ];
    await api(`/api/worker/jobs/${created.job.id}/plan`, {
      method: "PUT",
      headers: WORKER_HEADERS,
      body: { ...firstLease, title: "Playlist fixture", videos: plannedVideos },
    });

    const planned = await bodyOf<{ videos: Array<{ id: string; youtube_id: string; playlist_index: number }> }>(
      await api(`/api/jobs/${created.job.id}`, { user: owner }),
    );
    expect(planned.videos.map(({ id, youtube_id, playlist_index }) => ({ id, youtube_id, playlist_index }))).toEqual(
      plannedVideos.map(({ video_id: id, youtube_id, playlist_index }) => ({ id, youtube_id, playlist_index })),
    );

    await api(`/api/worker/jobs/${created.job.id}/videos/video_playlist_a_3/result`, {
      method: "PUT",
      headers: WORKER_HEADERS,
      body: resultBody(firstLease, "aaaaaaaaaaa", 3, "A (copie)"),
    });
    const prematureComplete = await api(`/api/worker/jobs/${created.job.id}/complete`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: firstLease,
    });
    expect(prematureComplete.status).toBe(409);
    expect((await bodyOf<ErrorResponse>(prematureComplete)).error.diagnostic_code).toBe("JOB_INCOMPLETE");

    await env.DB.prepare("UPDATE jobs SET lease_expires_at = ? WHERE id = ?")
      .bind("2000-01-01T00:00:00.000Z", created.job.id)
      .run();
    const resumed = await bodyOf<ClaimResponse>(
      await api("/api/worker/jobs/claim", {
        method: "POST",
        headers: WORKER_HEADERS,
        body: { worker_id: "playlist-worker-two", lease_seconds: 300 },
      }),
    );
    expect(resumed.lease.ready_video_occurrences).toEqual([
      { youtube_id: "aaaaaaaaaaa", playlist_index: 3 },
    ]);
    const resumedLease = {
      worker_id: "playlist-worker-two",
      lease_token: resumed.lease.lease_token,
    };
    for (const video of plannedVideos.slice(0, 2)) {
      await api(`/api/worker/jobs/${created.job.id}/videos/${video.video_id}/error`, {
        method: "PUT",
        headers: WORKER_HEADERS,
        body: {
          ...resumedLease,
          youtube_id: video.youtube_id,
          playlist_index: video.playlist_index,
          title: video.title,
          url: video.url,
          public_error: "Sous-titres indisponibles.",
          diagnostic_code: "SUBTITLES_UNAVAILABLE",
        },
      });
    }
    const finished = await bodyOf<{
      job: { progress: number; ready_videos: number; failed_videos: number };
      videos: Array<{ state: string }>;
    }>(await api(`/api/jobs/${created.job.id}`, { user: owner }));
    expect(finished.job).toMatchObject({ progress: 1, ready_videos: 1, failed_videos: 2 });
    expect(finished.videos.map((video) => video.state)).toEqual(["FAILED", "FAILED", "READY"]);

    const completed = await api(`/api/worker/jobs/${created.job.id}/complete`, {
      method: "POST",
      headers: WORKER_HEADERS,
      body: resumedLease,
    });
    expect(completed.status).toBe(200);
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
  lease: {
    job: { id: string; finalize_state: string };
    work_kind: "PROCESS" | "FINALIZE";
    lease_token: string;
    ready_video_occurrences: Array<{ youtube_id: string; playlist_index: number }>;
  };
}

interface DecisionResponse {
  decision: { decision: string; version: number };
}

interface ErrorResponse {
  error: { message: string; diagnostic_code: string };
}

function resultBody(
  lease: { worker_id: string; lease_token: string },
  youtubeId: string,
  playlistIndex: number,
  title: string,
) {
  return {
    ...lease,
    youtube_id: youtubeId,
    playlist_index: playlistIndex,
    title,
    url: `https://www.youtube.com/watch?v=${youtubeId}`,
    summary_markdown: `# ${title}`,
    provenance: {
      source_type: "youtube",
      source_url: `https://www.youtube.com/watch?v=${youtubeId}`,
      subtitle_format: "srt",
    },
    transcript: [{ block_index: 0, start_ms: 0, end_ms: 1_000, text: "Fixture" }],
  };
}
