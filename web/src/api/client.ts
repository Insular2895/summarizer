export type SourceKind = "youtube_video" | "youtube_playlist";
export type JobState = "QUEUED" | "PROCESSING" | "READY" | "DONE" | "FAILED";

export interface SourceRecord {
  id: string;
  normalized_url: string;
  source_kind: SourceKind;
  title: string | null;
  status: JobState;
}

export interface JobRecord {
  id: string;
  source_id: string;
  state: JobState;
  stage: string;
  progress: number;
  total_videos: number | null;
  ready_videos: number;
  failed_videos: number;
  public_error: string | null;
}

export interface VideoRecord {
  id: string;
  job_id: string;
  youtube_id: string;
  playlist_index: number;
  title: string;
  url: string;
  channel: string | null;
  duration_seconds: number | null;
  state: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  summary_markdown: string | null;
  public_error: string | null;
  provenance: Record<string, string>;
}

export interface NoteRecord {
  video_id: string;
  body: string;
  excerpts_json: string;
  version: number;
  updated_at: string;
}

export interface DecisionRecord {
  video_id: string;
  decision: "PENDING" | "KEPT" | "DISCARDED";
  previous_decision: "PENDING" | "KEPT" | "DISCARDED" | null;
  version: number;
}

export interface TranscriptBlock {
  block_index: number;
  start_ms: number;
  end_ms: number | null;
  text: string;
}

export interface SourceReceipt {
  source: SourceRecord;
  job: JobRecord;
}

export interface JobDetail extends SourceReceipt {
  videos: VideoRecord[];
}

export interface VideoDetail {
  video: VideoRecord;
  note: NoteRecord | null;
  decision: DecisionRecord | null;
  transcript: TranscriptBlock[];
}

export interface SummarizerApi {
  createSource(url: string, signal?: AbortSignal): Promise<SourceReceipt>;
  getJob(jobId: string, signal?: AbortSignal): Promise<JobDetail>;
  listReview(signal?: AbortSignal): Promise<VideoRecord[]>;
  getVideo(videoId: string, signal?: AbortSignal): Promise<VideoDetail>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export const api: SummarizerApi = {
  createSource: (url, signal) =>
    request<SourceReceipt>(
      "/api/sources",
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ url }),
      },
      signal,
    ),
  getJob: (jobId, signal) => request<JobDetail>(`/api/jobs/${encodeURIComponent(jobId)}`, {}, signal),
  listReview: async (signal) => {
    const response = await request<{ videos: VideoRecord[] }>("/api/review", {}, signal);
    return response.videos;
  },
  getVideo: (videoId, signal) =>
    request<VideoDetail>(`/api/videos/${encodeURIComponent(videoId)}`, {}, signal),
};

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (import.meta.env.DEV) {
    headers.set("X-Summarizer-User", import.meta.env.VITE_LOCAL_USER || "local@example.test");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal,
      credentials: "include",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Connexion impossible. Vérifie le réseau puis réessaie.", 0);
  }

  if (!response.ok) {
    let message = "La demande n’a pas pu aboutir. Réessaie.";
    try {
      const payload = (await response.json()) as { error?: { message?: unknown } };
      if (typeof payload.error?.message === "string") message = payload.error.message;
    } catch {
      // The public fallback stays stable when an intermediary returns non-JSON.
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}
