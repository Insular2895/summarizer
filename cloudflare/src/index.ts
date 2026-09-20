import { handleBrowserRoute } from "./browser-routes";
import { errorResponse, json, preflight, withCors } from "./http";
import type { Env } from "./types";
import { handleWorkerRoute } from "./worker-routes";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request, env);

    const url = new URL(request.url);
    try {
      const response =
        url.pathname === "/api/health"
          ? json({ status: "ok", service: "summarizer-control-plane" })
          : url.pathname.startsWith("/api/worker/")
            ? await handleWorkerRoute(request, env, url.pathname)
            : await handleBrowserRoute(request, env, url.pathname);
      return secure(withCors(request, response, env));
    } catch (error) {
      return secure(withCors(request, errorResponse(error), env));
    }
  },
} satisfies ExportedHandler<Env>;

function secure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
