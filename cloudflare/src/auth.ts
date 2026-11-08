import { ApiError, requireString } from "./http";
import type { Env } from "./types";

export function authenticateBrowser(request: Request, env: Env): string {
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  if (accessEmail) {
    return normalizeOwner(accessEmail);
  }

  if (env.APP_ENV === "local" || env.APP_ENV === "test") {
    const localUser = request.headers.get("x-summarizer-user");
    if (localUser) {
      return normalizeOwner(localUser);
    }
  }

  throw new ApiError(401, "USER_AUTH_REQUIRED", "Authentification utilisateur requise.");
}

export function authenticateWorker(request: Request, env: Env): void {
  if (!env.WORKER_API_TOKEN) {
    throw new ApiError(503, "WORKER_AUTH_NOT_CONFIGURED", "L’accès worker n’est pas configuré.");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix) || !constantTimeEqual(authorization.slice(prefix.length), env.WORKER_API_TOKEN)) {
    throw new ApiError(401, "WORKER_AUTH_INVALID", "Authentification worker invalide.");
  }
}

function normalizeOwner(value: string): string {
  return requireString(value.toLowerCase(), "identité utilisateur", { max: 320 });
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let different = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    different |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return different === 0;
}
