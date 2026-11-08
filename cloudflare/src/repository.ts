import { ApiError } from "./http";
import type {
  DecisionRow,
  JobRow,
  NoteRow,
  ReviewDecision,
  SourceRow,
  TranscriptBlockInput,
  VideoRow,
  WorkerLease,
} from "./types";
import type { NormalizedYouTubeSource } from "./youtube";

interface IdempotencyRow {
  resource_id: string;
}

interface CountRow {
  total: number;
  ready: number;
  failed: number;
  pending: number;
  active: number;
}

interface PersistedPlanVideo {
  id: string;
  youtube_id: string;
  playlist_index: number;
}

interface PlannedVideo {
  videoId: string;
  youtubeId: string;
  playlistIndex: number;
}

export class Repository {
  constructor(private readonly db: D1Database) {}

  async createSource(ownerId: string, source: NormalizedYouTubeSource, idempotencyKey: string) {
    const scope = "source:create";
    const existingKey = await this.db
      .prepare("SELECT resource_id FROM idempotency_keys WHERE owner_id = ? AND scope = ? AND idempotency_key = ?")
      .bind(ownerId, scope, idempotencyKey)
      .first<IdempotencyRow>();

    if (existingKey) {
      const existing = await this.getJobBySource(ownerId, existingKey.resource_id);
      if (!existing || existing.source.normalized_url !== source.normalizedUrl) {
        throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "Cette clé d’idempotence désigne une autre requête.");
      }
      return existing;
    }

    const digest = await stableDigest(`${ownerId}\u0000${scope}\u0000${idempotencyKey}`);
    const sourceId = `src_${digest.slice(0, 24)}`;
    const jobId = `job_${digest.slice(24, 48)}`;
    const now = nowIso();

    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO sources
             (id, owner_id, original_url, normalized_url, source_kind, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, ?)`,
        )
        .bind(sourceId, ownerId, source.originalUrl, source.normalizedUrl, source.sourceKind, now, now),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO jobs
             (id, source_id, state, stage, progress, created_at, updated_at)
           VALUES (?, ?, 'QUEUED', 'QUEUED', 0, ?, ?)`,
        )
        .bind(jobId, sourceId, now, now),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO idempotency_keys
             (owner_id, scope, idempotency_key, resource_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(ownerId, scope, idempotencyKey, sourceId, now),
    ]);

    const created = await this.getJobBySource(ownerId, sourceId);
    if (!created) {
      throw new ApiError(500, "SOURCE_CREATE_FAILED", "La source n’a pas pu être créée.");
    }
    if (created.source.normalized_url !== source.normalizedUrl) {
      throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "Cette clé d’idempotence désigne une autre requête.");
    }
    return created;
  }

  async getJob(ownerId: string, jobId: string) {
    const job = await this.db
      .prepare(
        `SELECT jobs.* FROM jobs
         JOIN sources ON sources.id = jobs.source_id
         WHERE jobs.id = ? AND sources.owner_id = ?`,
      )
      .bind(jobId, ownerId)
      .first<JobRow>();
    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Traitement introuvable.");
    }
    const source = await this.db.prepare("SELECT * FROM sources WHERE id = ?").bind(job.source_id).first<SourceRow>();
    const videos = await this.db
      .prepare("SELECT * FROM videos WHERE job_id = ? ORDER BY playlist_index")
      .bind(job.id)
      .all<VideoRow>();
    return { source, job, videos: videos.results.map(videoView) };
  }

  async listReview(ownerId: string) {
    const rows = await this.db
      .prepare(
        `SELECT videos.*, notes.body AS note_body, notes.version AS note_version,
                review_decisions.decision, review_decisions.version AS decision_version,
                jobs.state AS job_state, jobs.stage AS job_stage,
                jobs.finalize_state AS job_finalize_state,
                jobs.total_videos AS job_total_videos,
                jobs.failed_videos AS job_failed_videos
         FROM videos
         JOIN jobs ON jobs.id = videos.job_id
         JOIN sources ON sources.id = jobs.source_id
         LEFT JOIN notes ON notes.video_id = videos.id
         LEFT JOIN review_decisions ON review_decisions.video_id = videos.id
         WHERE sources.owner_id = ? AND videos.state = 'READY' AND jobs.state != 'DONE'
         ORDER BY sources.created_at, videos.playlist_index`,
      )
      .bind(ownerId)
      .all<
        VideoRow & {
          note_body: string;
          note_version: number;
          decision: ReviewDecision;
          decision_version: number;
          job_state: JobRow["state"];
          job_stage: string;
          job_finalize_state: JobRow["finalize_state"];
          job_total_videos: number | null;
          job_failed_videos: number;
        }
      >();
    return rows.results.map(videoView);
  }

  async getVideo(ownerId: string, videoId: string) {
    const video = await this.getOwnedVideo(ownerId, videoId);
    const [note, decision, transcript] = await Promise.all([
      this.db.prepare("SELECT * FROM notes WHERE video_id = ?").bind(videoId).first<NoteRow>(),
      this.db.prepare("SELECT * FROM review_decisions WHERE video_id = ?").bind(videoId).first<DecisionRow>(),
      this.db
        .prepare(
          "SELECT block_index, start_ms, end_ms, text FROM transcript_blocks WHERE video_id = ? ORDER BY block_index",
        )
        .bind(videoId)
        .all<TranscriptBlockInput>(),
    ]);
    return { video: videoView(video), note, decision, transcript: transcript.results };
  }

  async saveNote(
    ownerId: string,
    videoId: string,
    body: string,
    excerptsJson: string,
    baseVersion: number,
  ): Promise<NoteRow> {
    await this.getOwnedVideo(ownerId, videoId);
    const updated = await this.db
      .prepare(
        `UPDATE notes
         SET body = ?, excerpts_json = ?, version = version + 1, updated_at = ?
         WHERE video_id = ? AND version = ?
         RETURNING *`,
      )
      .bind(body, excerptsJson, nowIso(), videoId, baseVersion)
      .first<NoteRow>();
    if (updated) return updated;

    const current = await this.db.prepare("SELECT * FROM notes WHERE video_id = ?").bind(videoId).first<NoteRow>();
    if (!current) {
      throw new ApiError(409, "NOTE_NOT_READY", "La note n’est pas encore disponible.");
    }
    throw new ApiError(409, "NOTE_VERSION_CONFLICT", "Une version plus récente de la note existe.", {
      current_version: current.version,
    });
  }

  async setDecision(
    ownerId: string,
    videoId: string,
    decision: Exclude<ReviewDecision, "PENDING">,
    baseVersion: number,
  ): Promise<DecisionRow> {
    const video = await this.getOwnedVideo(ownerId, videoId);
    await this.requireMutableReview(video.job_id);
    const current = await this.getDecision(videoId);
    if (current.decision === decision) return current;
    if (current.version !== baseVersion) {
      throw decisionConflict(current.version);
    }

    const updated = await this.db
      .prepare(
        `UPDATE review_decisions
         SET previous_decision = decision, decision = ?, version = version + 1, decided_at = ?
         WHERE video_id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM videos JOIN jobs ON jobs.id = videos.job_id
             WHERE videos.id = review_decisions.video_id AND jobs.finalize_state = 'NOT_STARTED'
           )
         RETURNING *`,
      )
      .bind(decision, nowIso(), videoId, baseVersion)
      .first<DecisionRow>();
    if (!updated) {
      await this.requireMutableReview(video.job_id);
      throw decisionConflict((await this.getDecision(videoId)).version);
    }
    return updated;
  }

  async undoDecision(
    ownerId: string,
    videoId: string,
    baseVersion: number,
    idempotencyKey: string,
  ): Promise<DecisionRow> {
    const video = await this.getOwnedVideo(ownerId, videoId);
    await this.requireMutableReview(video.job_id);
    const scope = `decision:undo:${videoId}`;
    const repeated = await this.hasIdempotencyKey(ownerId, scope, idempotencyKey);
    if (repeated) return this.getDecision(videoId);

    const current = await this.getDecision(videoId);
    if (current.version !== baseVersion) throw decisionConflict(current.version);
    if (!current.previous_decision) {
      throw new ApiError(409, "NOTHING_TO_UNDO", "Aucune décision ne peut être annulée.");
    }

    const updated = await this.db
      .prepare(
        `UPDATE review_decisions
         SET decision = previous_decision, previous_decision = decision,
             version = version + 1, decided_at = ?
         WHERE video_id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM videos JOIN jobs ON jobs.id = videos.job_id
             WHERE videos.id = review_decisions.video_id AND jobs.finalize_state = 'NOT_STARTED'
           )
         RETURNING *`,
      )
      .bind(nowIso(), videoId, baseVersion)
      .first<DecisionRow>();
    if (!updated) {
      await this.requireMutableReview(video.job_id);
      throw decisionConflict((await this.getDecision(videoId)).version);
    }
    await this.rememberIdempotencyKey(ownerId, scope, idempotencyKey, videoId);
    return updated;
  }

  async requestFinalize(ownerId: string, jobId: string, idempotencyKey: string): Promise<JobRow> {
    const scope = `job:finalize:${jobId}`;
    const { job } = await this.getJob(ownerId, jobId);
    if (["REQUESTED", "EXPORTING", "EXPORTED", "CLEANED"].includes(job.finalize_state)) return job;
    if (job.finalize_state === "NOT_STARTED") {
      if (job.stage !== "PROCESSING_COMPLETE") {
        throw new ApiError(409, "JOB_NOT_REVIEWABLE", "Le traitement n’est pas terminé.");
      }
      const counts = await this.countJob(jobId);
      if (counts.total === 0 || counts.active > 0) {
        throw new ApiError(409, "JOB_NOT_REVIEWABLE", "Le traitement n’est pas terminé.");
      }
      if (counts.pending > 0) {
        throw new ApiError(409, "REVIEW_INCOMPLETE", "Décide pour chaque vidéo prête avant de terminer.", {
          pending: counts.pending,
        });
      }
    }

    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE jobs SET finalize_state = 'REQUESTED', stage = 'EXPORT_REQUESTED',
             worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
             diagnostic_code = NULL, updated_at = ?
           WHERE id = ? AND finalize_state IN ('NOT_STARTED', 'FAILED')`,
        )
        .bind(now, jobId),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO idempotency_keys
             (owner_id, scope, idempotency_key, resource_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(ownerId, scope, idempotencyKey, jobId, now),
    ]);
    return (await this.getJob(ownerId, jobId)).job;
  }

  async listHistory(ownerId: string) {
    const rows = await this.db
      .prepare(
        `SELECT history_entries.id, history_entries.source_id, history_entries.completed_at,
                history_entries.total_videos, history_entries.kept_videos,
                history_entries.discarded_videos, history_entries.failed_videos,
                history_entries.final_status, history_entries.export_status,
                sources.title, sources.normalized_url, sources.source_kind,
                (
                  SELECT videos.id FROM videos
                  JOIN review_decisions ON review_decisions.video_id = videos.id
                  JOIN jobs ON jobs.id = videos.job_id
                  WHERE jobs.source_id = history_entries.source_id
                    AND review_decisions.decision = 'KEPT'
                  ORDER BY videos.playlist_index LIMIT 1
                ) AS first_kept_video_id
         FROM history_entries
         JOIN sources ON sources.id = history_entries.source_id
         WHERE history_entries.owner_id = ?
         ORDER BY history_entries.completed_at DESC`,
      )
      .bind(ownerId)
      .all();
    return rows.results;
  }

  async claimJob(workerId: string, leaseSeconds: number): Promise<WorkerLease | null> {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const leaseToken = crypto.randomUUID();
    const job = await this.db
      .prepare(
        `UPDATE jobs
         SET state = CASE
               WHEN finalize_state = 'NOT_STARTED' THEN CASE WHEN ready_videos > 0 THEN 'READY' ELSE 'PROCESSING' END
               ELSE state
             END,
             stage = CASE
               WHEN finalize_state IN ('REQUESTED', 'FAILED') THEN 'EXPORTING'
               WHEN finalize_state = 'EXPORTED' THEN 'CLEANUP'
               WHEN stage = 'QUEUED' THEN 'CLAIMED'
               ELSE stage
             END,
             finalize_state = CASE
               WHEN finalize_state IN ('REQUESTED', 'FAILED') THEN 'EXPORTING'
               ELSE finalize_state
             END,
             worker_id = ?, lease_token = ?, lease_expires_at = ?,
             attempt = attempt + 1, updated_at = ?
         WHERE id = (
           SELECT id FROM jobs
           WHERE (
               finalize_state IN ('REQUESTED', 'FAILED', 'EXPORTING', 'EXPORTED')
               AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
             ) OR (
               finalize_state = 'NOT_STARTED'
               AND (
                 state = 'QUEUED'
                 OR (
                   state IN ('PROCESSING', 'READY')
                   AND stage != 'PROCESSING_COMPLETE'
                   AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
                 )
               )
             )
           ORDER BY CASE WHEN finalize_state = 'NOT_STARTED' THEN 1 ELSE 0 END, created_at
           LIMIT 1
         )
         RETURNING *`,
      )
      .bind(workerId, leaseToken, expiresAt, now, now, now)
      .first<JobRow>();
    if (!job) return null;

    const source = await this.db.prepare("SELECT * FROM sources WHERE id = ?").bind(job.source_id).first<SourceRow>();
    if (!source) throw new ApiError(500, "SOURCE_MISSING", "La source du traitement est introuvable.");
    await this.db
      .prepare("UPDATE sources SET status = ?, updated_at = ? WHERE id = ?")
      .bind(job.state, now, source.id)
      .run();
    const ready = await this.db
      .prepare(
        "SELECT youtube_id, playlist_index FROM videos WHERE job_id = ? AND state = 'READY' ORDER BY playlist_index",
      )
      .bind(job.id)
      .all<{ youtube_id: string; playlist_index: number }>();
    return {
      job,
      source,
      work_kind: job.finalize_state === "NOT_STARTED" ? "PROCESS" : "FINALIZE",
      lease_token: leaseToken,
      ready_video_occurrences: ready.results,
    };
  }

  async publishPlan(
    jobId: string,
    lease: { workerId: string; leaseToken: string },
    plan: {
      title: string;
      videos: Array<{
        videoId: string;
        youtubeId: string;
        playlistIndex: number;
        title: string;
        url: string;
      }>;
    },
  ) {
    await this.requireLease(jobId, lease.workerId, lease.leaseToken);
    const persistedBefore = await this.db
      .prepare("SELECT id, youtube_id, playlist_index FROM videos WHERE job_id = ? ORDER BY playlist_index")
      .bind(jobId)
      .all<{ id: string; youtube_id: string; playlist_index: number }>();
    if (persistedBefore.results.length > 0) {
      assertStablePlan(persistedBefore.results, plan.videos);
    }
    const now = nowIso();
    await this.db.batch([
      ...plan.videos.map((video) =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO videos
               (id, job_id, youtube_id, playlist_index, title, url, state, stage,
                progress, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', 'QUEUED', 0, ?, ?)`,
          )
          .bind(
            video.videoId,
            jobId,
            video.youtubeId,
            video.playlistIndex,
            video.title,
            video.url,
            now,
            now,
          ),
      ),
      this.db
        .prepare(
          `UPDATE jobs SET
             state = CASE WHEN ready_videos > 0 THEN 'READY' ELSE 'PROCESSING' END,
             stage = 'SOURCE_DISCOVERED', total_videos = ?,
             progress = CASE WHEN ? > 0 THEN CAST(ready_videos + failed_videos AS REAL) / ? ELSE 0 END,
             updated_at = ? WHERE id = ?`,
        )
        .bind(plan.videos.length, plan.videos.length, plan.videos.length, now, jobId),
      this.db
        .prepare("UPDATE sources SET title = ?, updated_at = ? WHERE id = (SELECT source_id FROM jobs WHERE id = ?)")
        .bind(plan.title, now, jobId),
    ]);

    const persisted = await this.db
      .prepare("SELECT id, youtube_id, playlist_index FROM videos WHERE job_id = ? ORDER BY playlist_index")
      .bind(jobId)
      .all<{ id: string; youtube_id: string; playlist_index: number }>();
    assertStablePlan(persisted.results, plan.videos);
    return { accepted: true, total_videos: plan.videos.length };
  }

  async heartbeat(jobId: string, workerId: string, leaseToken: string, leaseSeconds: number): Promise<JobRow> {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const job = await this.db
      .prepare(
        `UPDATE jobs SET lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND worker_id = ? AND lease_token = ? AND lease_expires_at > ?
         RETURNING *`,
      )
      .bind(expiresAt, now, jobId, workerId, leaseToken, now)
      .first<JobRow>();
    if (!job) throw invalidLease();
    return job;
  }

  async publishEvent(
    jobId: string,
    lease: { workerId: string; leaseToken: string },
    event: {
      eventId: string;
      videoId: string | null;
      status: string;
      stage: string;
      progress: number | null;
      diagnosticCode: string | null;
      occurredAt: string;
    },
  ) {
    await this.requireLease(jobId, lease.workerId, lease.leaseToken);
    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO job_events
           (event_id, job_id, video_id, status, stage, progress, diagnostic_code, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.eventId,
        jobId,
        event.videoId,
        event.status,
        event.stage,
        event.progress,
        event.diagnosticCode,
        event.occurredAt,
        nowIso(),
      )
      .run();
    if ((inserted.meta.changes ?? 0) > 0) {
      const now = nowIso();
      const statements = [
        this.db
          .prepare("UPDATE jobs SET stage = ?, updated_at = ? WHERE id = ?")
          .bind(event.stage, now, jobId),
      ];
      if (event.videoId) {
        statements.push(
          this.db
            .prepare(
              `UPDATE videos SET
                 state = CASE WHEN state = 'QUEUED' AND ? = 'PROCESSING' THEN 'PROCESSING' ELSE state END,
                 stage = CASE WHEN state IN ('READY', 'FAILED') THEN stage ELSE ? END,
                 progress = CASE WHEN state IN ('READY', 'FAILED') THEN progress ELSE COALESCE(?, progress) END,
                 updated_at = ?
               WHERE id = ? AND job_id = ?`,
            )
            .bind(event.status, event.stage, event.progress, now, event.videoId, jobId),
        );
      }
      await this.db.batch(statements);
    }
    return { accepted: true, duplicate: (inserted.meta.changes ?? 0) === 0 };
  }

  async publishVideoResult(
    jobId: string,
    videoId: string,
    lease: { workerId: string; leaseToken: string },
    result: {
      youtubeId: string;
      playlistIndex: number;
      title: string;
      url: string;
      channel: string | null;
      durationSeconds: number | null;
      summaryMarkdown: string;
      modelUsed: string | null;
      provenanceJson: string;
      transcript: TranscriptBlockInput[];
    },
  ): Promise<VideoRow> {
    await this.requireLease(jobId, lease.workerId, lease.leaseToken);
    const existing = await this.db.prepare("SELECT * FROM videos WHERE id = ?").bind(videoId).first<VideoRow>();
    if (existing && existing.job_id !== jobId) {
      throw new ApiError(409, "VIDEO_ID_CONFLICT", "Cet identifiant vidéo appartient à un autre traitement.");
    }
    if (existing?.state === "READY") return existing;

    const now = nowIso();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO videos
             (id, job_id, youtube_id, playlist_index, title, url, channel, duration_seconds,
              state, stage, progress, summary_markdown, model_used, provenance_json,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'READY', 'READY', 1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             youtube_id = excluded.youtube_id, playlist_index = excluded.playlist_index,
             title = excluded.title, url = excluded.url, channel = excluded.channel,
             duration_seconds = excluded.duration_seconds, state = 'READY', stage = 'READY',
             progress = 1, summary_markdown = excluded.summary_markdown,
             model_used = excluded.model_used, provenance_json = excluded.provenance_json,
             public_error = NULL, diagnostic_code = NULL,
             updated_at = excluded.updated_at`,
        )
        .bind(
          videoId,
          jobId,
          result.youtubeId,
          result.playlistIndex,
          result.title,
          result.url,
          result.channel,
          result.durationSeconds,
          result.summaryMarkdown,
          result.modelUsed,
          result.provenanceJson,
          now,
          now,
        ),
      this.db.prepare("DELETE FROM transcript_blocks WHERE video_id = ?").bind(videoId),
      ...result.transcript.map((block) =>
        this.db
          .prepare(
            `INSERT INTO transcript_blocks (id, video_id, block_index, start_ms, end_ms, text)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `${videoId}_block_${block.block_index}`,
            videoId,
            block.block_index,
            block.start_ms,
            block.end_ms ?? null,
            block.text,
          ),
      ),
      this.db
        .prepare("INSERT OR IGNORE INTO notes (video_id, body, excerpts_json, version, updated_at) VALUES (?, '', '[]', 1, ?)")
        .bind(videoId, now),
      this.db
        .prepare("INSERT OR IGNORE INTO review_decisions (video_id, decision, version) VALUES (?, 'PENDING', 1)")
        .bind(videoId),
      this.db
        .prepare(
          `UPDATE jobs SET state = 'READY', stage = 'REVIEW_AVAILABLE',
             ready_videos = (SELECT COUNT(*) FROM videos WHERE job_id = ? AND state = 'READY'),
             failed_videos = (SELECT COUNT(*) FROM videos WHERE job_id = ? AND state = 'FAILED'),
             progress = CASE WHEN total_videos > 0 THEN
               CAST((SELECT COUNT(*) FROM videos WHERE job_id = ? AND state IN ('READY', 'FAILED')) AS REAL) / total_videos
               ELSE progress END,
             updated_at = ? WHERE id = ?`,
        )
        .bind(jobId, jobId, jobId, now, jobId),
      this.db
        .prepare(
          `UPDATE sources SET status = 'READY', title = COALESCE(title, ?), updated_at = ?
           WHERE id = (SELECT source_id FROM jobs WHERE id = ?)`,
        )
        .bind(result.title, now, jobId),
    ];
    await this.db.batch(statements);
    const video = await this.db.prepare("SELECT * FROM videos WHERE id = ?").bind(videoId).first<VideoRow>();
    if (!video) throw new ApiError(500, "VIDEO_RESULT_FAILED", "Le résultat vidéo n’a pas pu être enregistré.");
    return video;
  }

  async publishVideoError(
    jobId: string,
    videoId: string,
    lease: { workerId: string; leaseToken: string },
    error: {
      youtubeId: string;
      playlistIndex: number;
      title: string;
      url: string;
      publicError: string;
      diagnosticCode: string;
    },
  ): Promise<VideoRow> {
    await this.requireLease(jobId, lease.workerId, lease.leaseToken);
    const existing = await this.db.prepare("SELECT * FROM videos WHERE id = ?").bind(videoId).first<VideoRow>();
    if (existing && existing.job_id !== jobId) {
      throw new ApiError(409, "VIDEO_ID_CONFLICT", "Cet identifiant vidéo appartient à un autre traitement.");
    }
    if (existing?.state === "READY") return existing;
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO videos
             (id, job_id, youtube_id, playlist_index, title, url, state, stage, progress,
              public_error, diagnostic_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'FAILED', 'FAILED', 1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET state = 'FAILED', stage = 'FAILED', progress = 1,
             public_error = excluded.public_error, diagnostic_code = excluded.diagnostic_code,
             updated_at = excluded.updated_at`,
        )
        .bind(
          videoId,
          jobId,
          error.youtubeId,
          error.playlistIndex,
          error.title,
          error.url,
          error.publicError,
          error.diagnosticCode,
          now,
          now,
        ),
      this.db
        .prepare(
          `UPDATE jobs SET
             failed_videos = (SELECT COUNT(*) FROM videos WHERE job_id = ? AND state = 'FAILED'),
             progress = CASE WHEN total_videos > 0 THEN
               CAST((SELECT COUNT(*) FROM videos WHERE job_id = ? AND state IN ('READY', 'FAILED')) AS REAL) / total_videos
               ELSE progress END,
             updated_at = ? WHERE id = ?`,
        )
        .bind(jobId, jobId, now, jobId),
    ]);
    const video = await this.db.prepare("SELECT * FROM videos WHERE id = ?").bind(videoId).first<VideoRow>();
    if (!video) throw new ApiError(500, "VIDEO_ERROR_FAILED", "L’erreur vidéo n’a pas pu être enregistrée.");
    return video;
  }

  async completeJob(jobId: string, workerId: string, leaseToken: string): Promise<JobRow> {
    await this.requireLease(jobId, workerId, leaseToken);
    const counts = await this.countJob(jobId);
    if (counts.active > 0) {
      throw new ApiError(
        409,
        "JOB_INCOMPLETE",
        "Toutes les occurrences de la source doivent être traitées avant de terminer.",
        { active: counts.active },
      );
    }
    const state = counts.ready > 0 ? "READY" : "FAILED";
    const diagnosticCode = counts.total === 0 ? "NO_VIDEO_RESULT" : null;
    const publicError = counts.total === 0 ? "Aucune vidéo exploitable n’a été produite." : null;
    const now = nowIso();
    const job = await this.db
      .prepare(
        `UPDATE jobs SET state = ?, stage = 'PROCESSING_COMPLETE', progress = 1,
           total_videos = ?, ready_videos = ?, failed_videos = ?,
           public_error = ?, diagnostic_code = ?, updated_at = ?
         WHERE id = ? RETURNING *`,
      )
      .bind(state, counts.total, counts.ready, counts.failed, publicError, diagnosticCode, now, jobId)
      .first<JobRow>();
    if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "Traitement introuvable.");
    await this.db.prepare("UPDATE sources SET status = ?, updated_at = ? WHERE id = ?").bind(state, now, job.source_id).run();
    return job;
  }

  async confirmExport(
    jobId: string,
    workerId: string,
    leaseToken: string,
    outcome: { success: boolean; exportReference: string | null; cleanupComplete: boolean; diagnosticCode: string | null },
  ): Promise<JobRow> {
    const current = await this.db.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<JobRow>();
    if (!current) throw new ApiError(404, "JOB_NOT_FOUND", "Traitement introuvable.");
    if (current.finalize_state === "CLEANED" && current.state === "DONE") {
      if (current.worker_id === workerId && current.lease_token === leaseToken) return current;
      throw invalidLease();
    }
    const leasedJob = await this.requireLease(jobId, workerId, leaseToken);
    if (!["EXPORTING", "EXPORTED"].includes(leasedJob.finalize_state)) {
      throw new ApiError(409, "EXPORT_NOT_REQUESTED", "L’export n’a pas été demandé.");
    }

    const now = nowIso();
    if (leasedJob.finalize_state === "EXPORTING") {
      if (!outcome.success) {
        const failed = await this.db
          .prepare(
            `UPDATE jobs SET finalize_state = 'FAILED', stage = 'EXPORT_FAILED',
               diagnostic_code = ?, worker_id = NULL, lease_token = NULL,
               lease_expires_at = NULL, updated_at = ? WHERE id = ? RETURNING *`,
          )
          .bind(outcome.diagnosticCode ?? "EXPORT_FAILED", now, jobId)
          .first<JobRow>();
        if (!failed) throw new ApiError(404, "JOB_NOT_FOUND", "Traitement introuvable.");
        return failed;
      }
      if (outcome.cleanupComplete) {
        throw new ApiError(409, "EXPORT_NOT_CONFIRMED", "Confirme l’export avant de lancer le cleanup.");
      }
      if (!outcome.exportReference) {
        throw new ApiError(400, "EXPORT_PROOF_INCOMPLETE", "La référence d’export confirmée est requise.");
      }
      const exported = await this.db
        .prepare(
          `UPDATE jobs SET finalize_state = 'EXPORTED', stage = 'EXPORT_CONFIRMED',
             export_reference = ?, diagnostic_code = NULL, updated_at = ?
           WHERE id = ? RETURNING *`,
        )
        .bind(outcome.exportReference, now, jobId)
        .first<JobRow>();
      if (!exported) throw new ApiError(404, "JOB_NOT_FOUND", "Traitement introuvable.");
      return exported;
    }

    if (outcome.exportReference && outcome.exportReference !== leasedJob.export_reference) {
      throw new ApiError(409, "EXPORT_REFERENCE_CONFLICT", "La référence d’export confirmée ne correspond pas.");
    }
    if (!outcome.success) {
      const failed = await this.db
        .prepare(
          `UPDATE jobs SET stage = 'CLEANUP_FAILED', diagnostic_code = ?,
             worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
             updated_at = ? WHERE id = ? RETURNING *`,
        )
        .bind(outcome.diagnosticCode ?? "CLEANUP_FAILED", now, jobId)
        .first<JobRow>();
      if (!failed) throw new ApiError(404, "JOB_NOT_FOUND", "Traitement introuvable.");
      return failed;
    }
    if (!outcome.cleanupComplete) return leasedJob;

    const source = await this.db.prepare("SELECT * FROM sources WHERE id = ?").bind(leasedJob.source_id).first<SourceRow>();
    if (!source) throw new ApiError(500, "SOURCE_MISSING", "La source du traitement est introuvable.");
    const counts = await this.countJob(jobId);
    const decisions = await this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN decision = 'KEPT' THEN 1 ELSE 0 END) AS kept,
           SUM(CASE WHEN decision = 'DISCARDED' THEN 1 ELSE 0 END) AS discarded
         FROM review_decisions
         JOIN videos ON videos.id = review_decisions.video_id
         WHERE videos.job_id = ?`,
      )
      .bind(jobId)
      .first<{ kept: number | null; discarded: number | null }>();

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO history_entries
             (id, owner_id, source_id, completed_at, total_videos, kept_videos,
              discarded_videos, failed_videos, final_status, export_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DONE', 'EXPORTED', ?)
           ON CONFLICT(source_id) DO UPDATE SET
             completed_at = excluded.completed_at, total_videos = excluded.total_videos,
             kept_videos = excluded.kept_videos, discarded_videos = excluded.discarded_videos,
             failed_videos = excluded.failed_videos, final_status = 'DONE', export_status = 'EXPORTED'`,
        )
        .bind(
          `hist_${jobId.slice(4)}`,
          source.owner_id,
          source.id,
          now,
          counts.total,
          decisions?.kept ?? 0,
          decisions?.discarded ?? 0,
          counts.failed,
          now,
        ),
      this.db
        .prepare(
          `UPDATE jobs SET state = 'DONE', stage = 'DONE', finalize_state = 'CLEANED',
             diagnostic_code = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, jobId),
      this.db.prepare("UPDATE sources SET status = 'DONE', updated_at = ? WHERE id = ?").bind(now, source.id),
    ]);
    return (await this.db.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<JobRow>())!;
  }

  async getExportManifest(jobId: string, workerId: string, leaseToken: string) {
    const job = await this.requireLease(jobId, workerId, leaseToken);
    if (job.finalize_state !== "EXPORTING" && job.finalize_state !== "EXPORTED") {
      throw new ApiError(409, "EXPORT_NOT_REQUESTED", "L’export n’a pas été demandé.");
    }
    const source = await this.db.prepare("SELECT * FROM sources WHERE id = ?").bind(job.source_id).first<SourceRow>();
    if (!source) throw new ApiError(500, "SOURCE_MISSING", "La source du traitement est introuvable.");
    const kept = await this.db
      .prepare(
        `SELECT videos.id, videos.youtube_id, videos.playlist_index, videos.title
         FROM videos
         JOIN review_decisions ON review_decisions.video_id = videos.id
         WHERE videos.job_id = ? AND videos.state = 'READY' AND review_decisions.decision = 'KEPT'
         ORDER BY videos.playlist_index`,
      )
      .bind(jobId)
      .all<{ id: string; youtube_id: string; playlist_index: number; title: string }>();
    return {
      job_id: job.id,
      source: {
        id: source.id,
        title: source.title,
        normalized_url: source.normalized_url,
        source_kind: source.source_kind,
        created_at: source.created_at,
      },
      kept_videos: kept.results,
    };
  }

  async getExportItem(jobId: string, videoId: string, workerId: string, leaseToken: string) {
    const job = await this.requireLease(jobId, workerId, leaseToken);
    if (job.finalize_state !== "EXPORTING" && job.finalize_state !== "EXPORTED") {
      throw new ApiError(409, "EXPORT_NOT_REQUESTED", "L’export n’a pas été demandé.");
    }
    const video = await this.db
      .prepare(
        `SELECT videos.* FROM videos
         JOIN review_decisions ON review_decisions.video_id = videos.id
         WHERE videos.job_id = ? AND videos.id = ? AND videos.state = 'READY'
           AND review_decisions.decision = 'KEPT'`,
      )
      .bind(jobId, videoId)
      .first<VideoRow>();
    if (!video) {
      throw new ApiError(404, "EXPORT_ITEM_NOT_FOUND", "Élément d’export introuvable.");
    }
    const [note, transcript] = await Promise.all([
      this.db.prepare("SELECT * FROM notes WHERE video_id = ?").bind(videoId).first<NoteRow>(),
      this.db
        .prepare(
          "SELECT block_index, start_ms, end_ms, text FROM transcript_blocks WHERE video_id = ? ORDER BY block_index",
        )
        .bind(videoId)
        .all<TranscriptBlockInput>(),
    ]);
    return { video: videoView(video), note, transcript: transcript.results };
  }

  private async getJobBySource(ownerId: string, sourceId: string) {
    const source = await this.db
      .prepare("SELECT * FROM sources WHERE id = ? AND owner_id = ?")
      .bind(sourceId, ownerId)
      .first<SourceRow>();
    if (!source) return null;
    const job = await this.db.prepare("SELECT * FROM jobs WHERE source_id = ?").bind(sourceId).first<JobRow>();
    if (!job) return null;
    return { source, job };
  }

  private async getOwnedVideo(ownerId: string, videoId: string): Promise<VideoRow> {
    const video = await this.db
      .prepare(
        `SELECT videos.* FROM videos
         JOIN jobs ON jobs.id = videos.job_id
         JOIN sources ON sources.id = jobs.source_id
         WHERE videos.id = ? AND sources.owner_id = ?`,
      )
      .bind(videoId, ownerId)
      .first<VideoRow>();
    if (!video) throw new ApiError(404, "VIDEO_NOT_FOUND", "Vidéo introuvable.");
    return video;
  }

  private async getDecision(videoId: string): Promise<DecisionRow> {
    const decision = await this.db
      .prepare("SELECT * FROM review_decisions WHERE video_id = ?")
      .bind(videoId)
      .first<DecisionRow>();
    if (!decision) throw new ApiError(409, "DECISION_NOT_READY", "La décision n’est pas encore disponible.");
    return decision;
  }

  private async requireMutableReview(jobId: string): Promise<void> {
    const job = await this.db.prepare("SELECT finalize_state FROM jobs WHERE id = ?").bind(jobId).first<{
      finalize_state: JobRow["finalize_state"];
    }>();
    if (!job || job.finalize_state !== "NOT_STARTED") {
      throw new ApiError(409, "REVIEW_FROZEN", "La sélection est figée pendant la finalisation.");
    }
  }

  private async countJob(jobId: string): Promise<CountRow> {
    const counts = await this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN state = 'READY' THEN 1 ELSE 0 END) AS ready,
           SUM(CASE WHEN state = 'FAILED' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN state IN ('QUEUED', 'PROCESSING') THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN state = 'READY' AND review_decisions.decision = 'PENDING' THEN 1 ELSE 0 END) AS pending
         FROM videos
         LEFT JOIN review_decisions ON review_decisions.video_id = videos.id
         WHERE videos.job_id = ?`,
      )
      .bind(jobId)
      .first<CountRow>();
    return {
      total: counts?.total ?? 0,
      ready: counts?.ready ?? 0,
      failed: counts?.failed ?? 0,
      active: counts?.active ?? 0,
      pending: counts?.pending ?? 0,
    };
  }

  private async requireLease(jobId: string, workerId: string, leaseToken: string): Promise<JobRow> {
    const job = await this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE id = ? AND worker_id = ? AND lease_token = ? AND lease_expires_at > ?`,
      )
      .bind(jobId, workerId, leaseToken, nowIso())
      .first<JobRow>();
    if (!job) throw invalidLease();
    return job;
  }

  private async hasIdempotencyKey(ownerId: string, scope: string, idempotencyKey: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT resource_id FROM idempotency_keys WHERE owner_id = ? AND scope = ? AND idempotency_key = ?")
      .bind(ownerId, scope, idempotencyKey)
      .first<IdempotencyRow>();
    return Boolean(row);
  }

  private async rememberIdempotencyKey(ownerId: string, scope: string, idempotencyKey: string, resourceId: string) {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO idempotency_keys
           (owner_id, scope, idempotency_key, resource_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(ownerId, scope, idempotencyKey, resourceId, nowIso())
      .run();
  }
}

function decisionConflict(currentVersion: number): ApiError {
  return new ApiError(409, "DECISION_VERSION_CONFLICT", "La décision a été modifiée entre-temps.", {
    current_version: currentVersion,
  });
}

function assertStablePlan(persisted: PersistedPlanVideo[], plannedVideos: PlannedVideo[]): void {
  const expected = new Map(plannedVideos.map((video) => [video.playlistIndex, video]));
  if (
    persisted.length !== plannedVideos.length ||
    persisted.some((video) => {
      const planned = expected.get(video.playlist_index);
      return !planned || planned.videoId !== video.id || planned.youtubeId !== video.youtube_id;
    })
  ) {
    throw new ApiError(409, "SOURCE_PLAN_CONFLICT", "Le plan de cette source a changé entre deux tentatives.");
  }
}

function invalidLease(): ApiError {
  return new ApiError(409, "LEASE_INVALID", "La lease est absente, invalide ou expirée.");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function stableDigest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function videoView<T extends VideoRow>(video: T): Omit<T, "provenance_json"> & { provenance: Record<string, string> } {
  const { provenance_json: provenanceJson, ...rest } = video;
  let provenance: Record<string, string> = {};
  try {
    provenance = JSON.parse(provenanceJson) as Record<string, string>;
  } catch {
    // A malformed historical row must not make the whole Review queue unavailable.
  }
  return { ...rest, provenance };
}
