PRAGMA foreign_keys = ON;

DELETE FROM sources WHERE id = 'demo_source_review';

INSERT OR IGNORE INTO sources (
    id, owner_id, original_url, normalized_url, source_kind, title, status, created_at, updated_at
) VALUES (
    'demo_source_review',
    'local@example.test',
    'https://www.youtube.com/playlist?list=DEMO_REVIEW',
    'https://www.youtube.com/playlist?list=DEMO_REVIEW',
    'youtube_playlist',
    'Playlist de démonstration Review',
    'READY',
    '2026-09-21T08:00:00.000Z',
    '2026-09-21T08:03:00.000Z'
);

INSERT OR IGNORE INTO jobs (
    id, source_id, state, stage, progress, total_videos, ready_videos, failed_videos,
    attempt, finalize_state, created_at, updated_at
) VALUES (
    'demo_job_review',
    'demo_source_review',
    'READY',
    'SUMMARIZATION',
    0.2222,
    18,
    4,
    0,
    1,
    'NOT_STARTED',
    '2026-09-21T08:00:00.000Z',
    '2026-09-21T08:03:00.000Z'
);

INSERT OR IGNORE INTO videos (
    id, job_id, youtube_id, playlist_index, title, url, channel, duration_seconds,
    state, stage, progress, summary_markdown, model_used, provenance_json, created_at, updated_at
) VALUES
    (
        'demo_video_1', 'demo_job_review', 'demo-ready-001', 1, 'Mémoire et contexte',
        'https://www.youtube.com/watch?v=demo-ready-001', 'AI Engineering', 754,
        'READY', 'READY', 1, 'Première fiche déjà revue.', 'fixture', '{"source_type":"youtube","fixture":"review-demo"}',
        '2026-09-21T08:00:10.000Z', '2026-09-21T08:01:00.000Z'
    ),
    (
        'demo_video_2', 'demo_job_review', 'demo-ready-002', 2, 'Outils et planification',
        'https://www.youtube.com/watch?v=demo-ready-002', 'AI Engineering', 1042,
        'READY', 'READY', 1, 'Deuxième fiche déjà revue.', 'fixture', '{"source_type":"youtube","fixture":"review-demo"}',
        '2026-09-21T08:00:20.000Z', '2026-09-21T08:01:30.000Z'
    ),
    (
        'demo_video_3', 'demo_job_review', 'demo-ready-003', 3, 'Évaluer un agent',
        'https://www.youtube.com/watch?v=demo-ready-003', 'AI Engineering', 1280,
        'READY', 'READY', 1, 'Troisième fiche déjà revue.', 'fixture', '{"source_type":"youtube","fixture":"review-demo"}',
        '2026-09-21T08:00:30.000Z', '2026-09-21T08:02:00.000Z'
    ),
    (
        'demo_video_4', 'demo_job_review', 'M7lc1UVf-VE', 4, 'Construire des agents IA fiables',
        'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'AI Engineering', 1938,
        'READY', 'READY', 1,
        'Une exploration concrète de l’évaluation des agents IA, des stratégies de mémoire et des mécanismes de récupération pour des systèmes plus fiables et robustes.',
        'fixture', '{"source_type":"youtube","fixture":"review-demo"}',
        '2026-09-21T08:00:40.000Z', '2026-09-21T08:03:00.000Z'
    );

INSERT OR IGNORE INTO notes (video_id, body, excerpts_json, version, updated_at) VALUES
    ('demo_video_1', '', '[]', 1, '2026-09-21T08:01:00.000Z'),
    ('demo_video_2', '', '[]', 1, '2026-09-21T08:01:30.000Z'),
    ('demo_video_3', '', '[]', 1, '2026-09-21T08:02:00.000Z'),
    ('demo_video_4', '', '[]', 1, '2026-09-21T08:03:00.000Z');

INSERT OR IGNORE INTO review_decisions (
    video_id, decision, previous_decision, version, decided_at
) VALUES
    ('demo_video_1', 'KEPT', 'PENDING', 2, '2026-09-21T08:02:10.000Z'),
    ('demo_video_2', 'DISCARDED', 'PENDING', 2, '2026-09-21T08:02:20.000Z'),
    ('demo_video_3', 'KEPT', 'PENDING', 2, '2026-09-21T08:02:30.000Z'),
    ('demo_video_4', 'PENDING', NULL, 1, NULL);

INSERT OR IGNORE INTO transcript_blocks (
    id, video_id, block_index, start_ms, end_ms, text
) VALUES
    ('demo_video_4_block_0', 'demo_video_4', 0, 0, 12000, 'Un agent fiable commence par un objectif observable et une boucle d’évaluation explicite.'),
    ('demo_video_4_block_1', 'demo_video_4', 1, 12000, 29000, 'La mémoire ne remplace pas le raisonnement : elle fournit le contexte vérifié dont le système a besoin.'),
    ('demo_video_4_block_2', 'demo_video_4', 2, 29000, 47000, 'Les mécanismes de récupération doivent rester mesurables, interrompables et simples à reprendre.');
