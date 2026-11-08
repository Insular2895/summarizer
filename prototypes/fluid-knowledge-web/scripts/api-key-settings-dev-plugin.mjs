import {
  getApiKeySettingsStatus,
  migrateLegacyApiKeys,
  removeApiKey,
  saveApiKeys,
} from "./api-key-store.mjs";
import { hasSameOrigin, isLoopbackRequest } from "./local-request-guard.mjs";

const MAX_BODY_BYTES = 4 * 1024;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Le formulaire dépasse la taille autorisée.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function apiKeySettingsDevPlugin() {
  return {
    name: "api-key-settings-local-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://local.test");
        const allowedPaths = new Set([
          "/api/settings/api-keys",
          "/api/settings/api-keys/migrate",
        ]);
        if (!allowedPaths.has(requestUrl.pathname)) {
          next();
          return;
        }
        if (!isLoopbackRequest(request)) {
          sendJson(response, 403, { error: "Accès local uniquement." });
          return;
        }
        if (!hasSameOrigin(request, { allowMissing: request.method === "GET" })) {
          sendJson(response, 403, { error: "Origine refusée." });
          return;
        }

        try {
          if (request.method === "GET") {
            sendJson(response, 200, await getApiKeySettingsStatus());
            return;
          }
          if (request.method === "POST" && requestUrl.pathname === "/api/settings/api-keys") {
            const payload = await readJsonBody(request);
            sendJson(response, 200, await saveApiKeys(payload?.keys));
            return;
          }
          if (request.method === "POST" && requestUrl.pathname === "/api/settings/api-keys/migrate") {
            sendJson(response, 200, await migrateLegacyApiKeys());
            return;
          }
          if (request.method === "DELETE" && requestUrl.pathname === "/api/settings/api-keys") {
            const payload = await readJsonBody(request);
            sendJson(response, 200, await removeApiKey(payload?.name));
            return;
          }
          sendJson(response, 405, { error: "Méthode non autorisée." });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "Enregistrement impossible." });
        }
      });
    },
  };
}
