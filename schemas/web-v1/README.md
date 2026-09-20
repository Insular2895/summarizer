# Web V1 shared contracts

These JSON Schemas define the payload boundary between the replaceable Python
worker and the Cloudflare control plane. They contain no provider secret and no
browser-only state.

- `job-event.schema.json`: idempotent progress event.
- `video-result.schema.json`: one progressively published, reviewable video.

The HTTP envelope adds `worker_id` and `lease_token`; those credentials are not
part of persisted result artifacts.
