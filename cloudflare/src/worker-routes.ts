import { authenticateWorker } from "./auth";
import { ApiError, json, readJson, requireInteger, requireString } from "./http";
import { Repository } from "./repository";
import type { Env, TranscriptBlockInput } from "./types";
import { normalizeYouTubeUrl } from "./youtube";

const JOB_ROUTE = /^\/api\/worker\/jobs\/(?<jobId>[A-Za-z0-9_-]+)(?<suffix>.*)$/;
const VIDEO_SUFFIX = /^\/videos\/(?<videoId>[A-Za-z0-9_-]+)\/(?<action>result|error)$/;

interface LeaseBody {
  worker_id?: unknown;
  lease_token?: unknown;
}

export async function handleWorkerRoute(request: Request, env: Env, path: string): Promise<Response> {
  authenticateWorker(request, env);
  const repository = new Repository(env.DB);

  if (request.method === "POST" && path === "/api/worker/jobs/claim") {
    const body = await readJson<{ worker_id?: unknown; lease_seconds?: unknown }>(request);
    const workerId = requireString(body.worker_id, "worker_id", { max: 100 });
    const leaseSeconds = optionalLeaseSeconds(body.lease_seconds);
    const lease = await repository.claimJob(workerId, leaseSeconds);
    return lease ? json({ lease }) : new Response(null, { status: 204 });
  }

  const jobMatch = JOB_ROUTE.exec(path)?.groups;
  if (!jobMatch) throw new ApiError(404, "ROUTE_NOT_FOUND", "Route worker introuvable.");
  const jobId = jobMatch.jobId;
  const suffix = jobMatch.suffix;

  if (request.method === "POST" && suffix === "/heartbeat") {
    const body = await readJson<LeaseBody & { lease_seconds?: unknown }>(request);
    const lease = parseLease(body);
    const job = await repository.heartbeat(jobId, lease.workerId, lease.leaseToken, optionalLeaseSeconds(body.lease_seconds));
    return json({ job });
  }

  if (request.method === "POST" && suffix === "/events") {
    const body = await readJson<
      LeaseBody & {
        event_id?: unknown;
        video_id?: unknown;
        status?: unknown;
        stage?: unknown;
        progress?: unknown;
        diagnostic_code?: unknown;
        occurred_at?: unknown;
      }
    >(request);
    const lease = parseLease(body);
    const progress = parseProgress(body.progress);
    const occurredAt = requireDate(body.occurred_at, "occurred_at");
    const status = requireString(body.status, "status", { max: 32 });
    if (!["QUEUED", "PROCESSING", "READY", "FAILED"].includes(status)) {
      throw new ApiError(400, "INVALID_STATUS", "Le statut d’événement est invalide.");
    }
    const result = await repository.publishEvent(jobId, lease, {
      eventId: requireString(body.event_id, "event_id", { max: 120 }),
      videoId: optionalString(body.video_id, "video_id", 120),
      status,
      stage: requireString(body.stage, "stage", { max: 80 }),
      progress,
      diagnosticCode: optionalString(body.diagnostic_code, "diagnostic_code", 120),
      occurredAt,
    });
    return json(result, 202);
  }

  const videoMatch = VIDEO_SUFFIX.exec(suffix)?.groups;
  if (request.method === "PUT" && videoMatch?.videoId && videoMatch.action === "result") {
    const body = await readJson<
      LeaseBody & {
        youtube_id?: unknown;
        playlist_index?: unknown;
        title?: unknown;
        url?: unknown;
        channel?: unknown;
        duration_seconds?: unknown;
        summary_markdown?: unknown;
        model_used?: unknown;
        transcript?: unknown;
      }
    >(request, 2_000_000);
    const lease = parseLease(body);
    const youtubeId = requireString(body.youtube_id, "youtube_id", { max: 128 });
    const resultUrl = normalizeVideoResultUrl(body.url, youtubeId);
    const video = await repository.publishVideoResult(jobId, videoMatch.videoId, lease, {
      youtubeId,
      playlistIndex: requireInteger(body.playlist_index, "playlist_index", { min: 1, max: 100_000 }),
      title: requireString(body.title, "title", { max: 1_000 }),
      url: resultUrl.normalizedUrl,
      channel: optionalString(body.channel, "channel", 500),
      durationSeconds:
        body.duration_seconds === null || body.duration_seconds === undefined
          ? null
          : requireInteger(body.duration_seconds, "duration_seconds", { min: 0, max: 604_800 }),
      summaryMarkdown: requireString(body.summary_markdown, "summary_markdown", { max: 200_000 }),
      modelUsed: optionalString(body.model_used, "model_used", 200),
      transcript: parseTranscript(body.transcript),
    });
    return json({ video });
  }

  if (request.method === "PUT" && videoMatch?.videoId && videoMatch.action === "error") {
    const body = await readJson<
      LeaseBody & {
        youtube_id?: unknown;
        playlist_index?: unknown;
        title?: unknown;
        url?: unknown;
        public_error?: unknown;
        diagnostic_code?: unknown;
      }
    >(request);
    const lease = parseLease(body);
    const youtubeId = requireString(body.youtube_id, "youtube_id", { max: 128 });
    const video = await repository.publishVideoError(jobId, videoMatch.videoId, lease, {
      youtubeId,
      playlistIndex: requireInteger(body.playlist_index, "playlist_index", { min: 1, max: 100_000 }),
      title: requireString(body.title, "title", { max: 1_000 }),
      url: normalizeVideoResultUrl(body.url, youtubeId).normalizedUrl,
      publicError: requireString(body.public_error, "public_error", { max: 1_000 }),
      diagnosticCode: requireString(body.diagnostic_code, "diagnostic_code", { max: 120 }),
    });
    return json({ video });
  }

  if (request.method === "POST" && suffix === "/complete") {
    const body = await readJson<LeaseBody>(request);
    const lease = parseLease(body);
    return json({ job: await repository.completeJob(jobId, lease.workerId, lease.leaseToken) });
  }

  if (request.method === "POST" && suffix === "/export-result") {
    const body = await readJson<
      LeaseBody & {
        success?: unknown;
        export_reference?: unknown;
        cleanup_complete?: unknown;
        diagnostic_code?: unknown;
      }
    >(request);
    const lease = parseLease(body);
    if (typeof body.success !== "boolean" || typeof body.cleanup_complete !== "boolean") {
      throw new ApiError(400, "INVALID_INPUT", "success et cleanup_complete doivent être booléens.");
    }
    const job = await repository.confirmExport(jobId, lease.workerId, lease.leaseToken, {
      success: body.success,
      exportReference: optionalString(body.export_reference, "export_reference", 2_048),
      cleanupComplete: body.cleanup_complete,
      diagnosticCode: optionalString(body.diagnostic_code, "diagnostic_code", 120),
    });
    return json({ job });
  }

  throw new ApiError(404, "ROUTE_NOT_FOUND", "Route worker introuvable.");
}

function parseLease(body: LeaseBody): { workerId: string; leaseToken: string } {
  return {
    workerId: requireString(body.worker_id, "worker_id", { max: 100 }),
    leaseToken: requireString(body.lease_token, "lease_token", { max: 200 }),
  };
}

function optionalLeaseSeconds(value: unknown): number {
  return value === undefined ? 120 : requireInteger(value, "lease_seconds", { min: 15, max: 300 });
}

function optionalString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, field, { max });
}

function parseProgress(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ApiError(400, "INVALID_INPUT", "progress doit être compris entre 0 et 1.");
  }
  return value;
}

function requireDate(value: unknown, field: string): string {
  const date = requireString(value, field, { max: 40 });
  if (Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, "INVALID_INPUT", `${field} doit être une date RFC3339.`);
  }
  return new Date(date).toISOString();
}

function parseTranscript(value: unknown): TranscriptBlockInput[] {
  if (!Array.isArray(value) || value.length > 20_000) {
    throw new ApiError(400, "INVALID_TRANSCRIPT", "Le transcript est invalide.");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ApiError(400, "INVALID_TRANSCRIPT", `Le bloc ${index + 1} est invalide.`);
    }
    const block = item as Record<string, unknown>;
    const startMs = requireInteger(block.start_ms, `transcript[${index}].start_ms`, { min: 0 });
    const endMs =
      block.end_ms === null || block.end_ms === undefined
        ? null
        : requireInteger(block.end_ms, `transcript[${index}].end_ms`, { min: startMs });
    return {
      block_index: requireInteger(block.block_index, `transcript[${index}].block_index`, { min: 0 }),
      start_ms: startMs,
      end_ms: endMs,
      text: requireString(block.text, `transcript[${index}].text`, { max: 20_000 }),
    };
  });
}

function normalizeVideoResultUrl(value: unknown, youtubeId: string) {
  const source = normalizeYouTubeUrl(requireString(value, "url", { max: 2_048 }));
  const normalizedId = new URL(source.normalizedUrl).searchParams.get("v");
  if (source.sourceKind !== "youtube_video" || normalizedId !== youtubeId) {
    throw new ApiError(400, "INVALID_VIDEO_URL", "L’URL du résultat ne correspond pas à la vidéo YouTube.");
  }
  return source;
}
