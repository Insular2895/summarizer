PRAGMA foreign_keys = ON;

CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    original_url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('youtube_video', 'youtube_playlist')),
    title TEXT,
    status TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'PROCESSING', 'READY', 'DONE', 'FAILED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX sources_owner_created_idx ON sources(owner_id, created_at DESC);

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (state IN ('QUEUED', 'PROCESSING', 'READY', 'DONE', 'FAILED')),
    stage TEXT NOT NULL DEFAULT 'QUEUED',
    progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
    total_videos INTEGER,
    ready_videos INTEGER NOT NULL DEFAULT 0,
    failed_videos INTEGER NOT NULL DEFAULT 0,
    worker_id TEXT,
    lease_token TEXT,
    lease_expires_at TEXT,
    attempt INTEGER NOT NULL DEFAULT 0,
    public_error TEXT,
    diagnostic_code TEXT,
    finalize_state TEXT NOT NULL DEFAULT 'NOT_STARTED'
        CHECK (finalize_state IN ('NOT_STARTED', 'REQUESTED', 'EXPORTING', 'EXPORTED', 'CLEANED', 'FAILED')),
    export_reference TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX jobs_claim_idx ON jobs(state, lease_expires_at, created_at);

CREATE TABLE videos (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    youtube_id TEXT NOT NULL,
    playlist_index INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    channel TEXT,
    duration_seconds INTEGER,
    state TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (state IN ('QUEUED', 'PROCESSING', 'READY', 'FAILED')),
    stage TEXT NOT NULL DEFAULT 'QUEUED',
    progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
    summary_markdown TEXT,
    model_used TEXT,
    public_error TEXT,
    diagnostic_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(job_id, playlist_index)
);

CREATE INDEX videos_job_state_idx ON videos(job_id, state, playlist_index);

CREATE TABLE transcript_blocks (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    block_index INTEGER NOT NULL,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER CHECK (end_ms IS NULL OR end_ms >= start_ms),
    text TEXT NOT NULL,
    UNIQUE(video_id, block_index)
);

CREATE INDEX transcript_blocks_video_idx ON transcript_blocks(video_id, block_index);

CREATE TABLE notes (
    video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    excerpts_json TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TEXT NOT NULL
);

CREATE TABLE review_decisions (
    video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    decision TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (decision IN ('PENDING', 'KEPT', 'DISCARDED')),
    previous_decision TEXT
        CHECK (previous_decision IS NULL OR previous_decision IN ('PENDING', 'KEPT', 'DISCARDED')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    decided_at TEXT
);

CREATE TABLE job_events (
    event_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    -- A progress event can arrive before its video row is published.
    video_id TEXT,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    progress REAL,
    diagnostic_code TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX job_events_job_idx ON job_events(job_id, occurred_at);

CREATE TABLE history_entries (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL,
    total_videos INTEGER NOT NULL DEFAULT 0,
    kept_videos INTEGER NOT NULL DEFAULT 0,
    discarded_videos INTEGER NOT NULL DEFAULT 0,
    failed_videos INTEGER NOT NULL DEFAULT 0,
    final_status TEXT NOT NULL,
    export_status TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX history_owner_completed_idx ON history_entries(owner_id, completed_at DESC);

CREATE TABLE idempotency_keys (
    owner_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(owner_id, scope, idempotency_key)
);
