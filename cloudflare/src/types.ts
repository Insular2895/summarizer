export type SourceKind = "youtube_video" | "youtube_playlist";
export type JobState = "QUEUED" | "PROCESSING" | "READY" | "DONE" | "FAILED";
export type VideoState = "QUEUED" | "PROCESSING" | "READY" | "FAILED";
export type ReviewDecision = "PENDING" | "KEPT" | "DISCARDED";

export interface Env {
  DB: D1Database;
  APP_ENV: "local" | "test" | "production";
  ALLOWED_ORIGIN?: string;
  WORKER_API_TOKEN?: string;
}

export interface SourceRow {
  id: string;
  owner_id: string;
  original_url: string;
  normalized_url: string;
  source_kind: SourceKind;
  title: string | null;
  status: JobState;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  source_id: string;
  state: JobState;
  stage: string;
  progress: number;
  total_videos: number | null;
  ready_videos: number;
  failed_videos: number;
  worker_id: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  attempt: number;
  public_error: string | null;
  diagnostic_code: string | null;
  finalize_state:
    | "NOT_STARTED"
    | "REQUESTED"
    | "EXPORTING"
    | "EXPORTED"
    | "CLEANED"
    | "FAILED";
  export_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoRow {
  id: string;
  job_id: string;
  youtube_id: string;
  playlist_index: number;
  title: string;
  url: string;
  channel: string | null;
  duration_seconds: number | null;
  state: VideoState;
  stage: string;
  progress: number;
  summary_markdown: string | null;
  model_used: string | null;
  provenance_json: string;
  public_error: string | null;
  diagnostic_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  video_id: string;
  body: string;
  excerpts_json: string;
  version: number;
  updated_at: string;
}

export interface DecisionRow {
  video_id: string;
  decision: ReviewDecision;
  previous_decision: ReviewDecision | null;
  version: number;
  decided_at: string | null;
}

export interface TranscriptBlockInput {
  block_index: number;
  start_ms: number;
  end_ms?: number | null;
  text: string;
}

export interface WorkerLease {
  job: JobRow;
  source: SourceRow;
  work_kind: "PROCESS" | "FINALIZE";
  lease_token: string;
  ready_video_occurrences: Array<{ youtube_id: string; playlist_index: number }>;
}
