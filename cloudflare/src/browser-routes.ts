import { authenticateBrowser } from "./auth";
import { ApiError, json, readJson, requireIdempotencyKey, requireInteger, requireString } from "./http";
import { Repository } from "./repository";
import type { Env } from "./types";
import { normalizeYouTubeUrl } from "./youtube";

interface RouteMatch {
  id?: string;
}

export async function handleBrowserRoute(request: Request, env: Env, path: string): Promise<Response> {
  const ownerId = authenticateBrowser(request, env);
  const repository = new Repository(env.DB);

  if (request.method === "POST" && path === "/api/sources") {
    const body = await readJson<{ url?: unknown }>(request);
    const source = normalizeYouTubeUrl(requireString(body.url, "url", { max: 2_048 }));
    const created = await repository.createSource(ownerId, source, requireIdempotencyKey(request));
    return json(created, 201);
  }

  let match = matchPath(path, /^\/api\/jobs\/(?<id>[A-Za-z0-9_-]+)$/);
  if (request.method === "GET" && match.id) {
    return json(await repository.getJob(ownerId, match.id));
  }

  if (request.method === "GET" && path === "/api/review") {
    return json({ videos: await repository.listReview(ownerId) });
  }

  match = matchPath(path, /^\/api\/videos\/(?<id>[A-Za-z0-9_-]+)$/);
  if (request.method === "GET" && match.id) {
    return json(await repository.getVideo(ownerId, match.id));
  }

  match = matchPath(path, /^\/api\/videos\/(?<id>[A-Za-z0-9_-]+)\/note$/);
  if (request.method === "PUT" && match.id) {
    const body = await readJson<{ body?: unknown; excerpts?: unknown; base_version?: unknown }>(request);
    const noteBody = typeof body.body === "string" ? body.body : "";
    if (noteBody.length > 100_000) {
      throw new ApiError(413, "NOTE_TOO_LARGE", "La note dépasse la taille autorisée.");
    }
    const excerpts = parseExcerpts(body.excerpts);
    const note = await repository.saveNote(
      ownerId,
      match.id,
      noteBody,
      JSON.stringify(excerpts),
      requireInteger(body.base_version, "base_version", { min: 1 }),
    );
    return json({ note: { ...note, excerpts: JSON.parse(note.excerpts_json) } });
  }

  match = matchPath(path, /^\/api\/videos\/(?<id>[A-Za-z0-9_-]+)\/decision$/);
  if (request.method === "PUT" && match.id) {
    const body = await readJson<{ decision?: unknown; base_version?: unknown }>(request);
    if (body.decision !== "KEPT" && body.decision !== "DISCARDED") {
      throw new ApiError(400, "INVALID_DECISION", "La décision doit être KEPT ou DISCARDED.");
    }
    const decision = await repository.setDecision(
      ownerId,
      match.id,
      body.decision,
      requireInteger(body.base_version, "base_version", { min: 1 }),
    );
    return json({ decision });
  }

  match = matchPath(path, /^\/api\/videos\/(?<id>[A-Za-z0-9_-]+)\/decision\/undo$/);
  if (request.method === "POST" && match.id) {
    const body = await readJson<{ base_version?: unknown }>(request);
    const decision = await repository.undoDecision(
      ownerId,
      match.id,
      requireInteger(body.base_version, "base_version", { min: 1 }),
      requireIdempotencyKey(request),
    );
    return json({ decision });
  }

  match = matchPath(path, /^\/api\/jobs\/(?<id>[A-Za-z0-9_-]+)\/finalize$/);
  if (request.method === "POST" && match.id) {
    const job = await repository.requestFinalize(ownerId, match.id, requireIdempotencyKey(request));
    return json({ job }, 202);
  }

  if (request.method === "GET" && path === "/api/history") {
    return json({ entries: await repository.listHistory(ownerId) });
  }

  throw new ApiError(404, "ROUTE_NOT_FOUND", "Route introuvable.");
}

function matchPath(path: string, pattern: RegExp): RouteMatch {
  return pattern.exec(path)?.groups ?? {};
}

function parseExcerpts(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) {
    throw new ApiError(400, "INVALID_EXCERPTS", "La liste d’extraits est invalide.");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ApiError(400, "INVALID_EXCERPTS", `L’extrait ${index + 1} est invalide.`);
    }
    const excerpt = item as Record<string, unknown>;
    return {
      text: requireString(excerpt.text, `excerpts[${index}].text`, { max: 5_000 }),
      start_ms: requireInteger(excerpt.start_ms, `excerpts[${index}].start_ms`, { min: 0 }),
    };
  });
}
