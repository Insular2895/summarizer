import type { Env } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      {
        error: {
          message: error.message,
          diagnostic_code: error.code,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      error.status,
    );
  }

  console.error("Unhandled request error", error);
  return json(
    {
      error: {
        message: "Une erreur interne est survenue.",
        diagnostic_code: "INTERNAL_ERROR",
      },
    },
    500,
  );
}

export async function readJson<T>(request: Request, maxBytes = 256_000): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "La requête est trop volumineuse.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "La requête est trop volumineuse.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Le corps JSON est invalide.");
  }
}

export function requireString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_INPUT", `Le champ ${field} est obligatoire.`);
  }
  const normalized = value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 10_000;
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(400, "INVALID_INPUT", `Le champ ${field} a une taille invalide.`);
  }
  return normalized;
}

export function requireInteger(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): number {
  if (!Number.isInteger(value)) {
    throw new ApiError(400, "INVALID_INPUT", `Le champ ${field} doit être un entier.`);
  }
  const numberValue = value as number;
  if (numberValue < (options.min ?? Number.MIN_SAFE_INTEGER) || numberValue > (options.max ?? Number.MAX_SAFE_INTEGER)) {
    throw new ApiError(400, "INVALID_INPUT", `Le champ ${field} est hors limites.`);
  }
  return numberValue;
}

export function requireIdempotencyKey(request: Request): string {
  return requireString(request.headers.get("idempotency-key"), "Idempotency-Key", {
    min: 8,
    max: 200,
  });
}

export function withCors(request: Request, response: Response, env: Env): Response {
  const origin = request.headers.get("origin");
  const allowedOrigin = env.APP_ENV === "production" ? env.ALLOWED_ORIGIN : origin ?? "*";
  if (!allowedOrigin || (env.APP_ENV === "production" && origin !== allowedOrigin)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", allowedOrigin);
  headers.set(
    "access-control-allow-headers",
    "Authorization, Content-Type, Idempotency-Key, X-Request-Id, X-Summarizer-User",
  );
  headers.set("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
  headers.set("access-control-max-age", "86400");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function preflight(request: Request, env: Env): Response {
  return withCors(request, new Response(null, { status: 204 }), env);
}
