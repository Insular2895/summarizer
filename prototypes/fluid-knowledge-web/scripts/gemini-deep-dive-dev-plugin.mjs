import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApiKey } from "./api-key-store.mjs";
import { hasSameOrigin, isLoopbackRequest } from "./local-request-guard.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const prototypeDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(prototypeDir, "../..");
const pythonScript = path.join(scriptDir, "gemini_deep_dive.py");
const MAX_BODY_BYTES = 256 * 1024;
const PROVIDER_SECRET_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_SUMMARY_API_KEY",
  "GEMINI_DEEP_DIVE_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MISTRAL_API_KEY",
  "OPENROUTER_API_KEY",
  "LLM_API_KEY",
];

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
    if (size > MAX_BODY_BYTES) throw new Error("Le contexte IA dépasse la taille autorisée.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validatePayload(payload) {
  const limits = { title: 300, url: 500, excerpt: 4_000, summary: 40_000, question: 1_500 };
  const result = {};
  for (const [key, limit] of Object.entries(limits)) {
    const value = payload?.[key];
    if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`Contexte invalide : ${key}.`);
    result[key] = value.trim();
  }
  if (!result.url.startsWith("https://www.youtube.com/")) throw new Error("Source vidéo invalide.");
  return result;
}

export function childEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of PROVIDER_SECRET_NAMES) delete environment[name];
  return environment;
}

function runPython(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || "python3.11", [pythonScript], {
      cwd: repoDir,
      env: childEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Gemini a dépassé le délai autorisé."));
    }, 90_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(stdout.trim() || "{}");
        if (code === 0 && parsed.answer) resolve(parsed);
        else reject(new Error(parsed.error || stderr.trim() || "Gemini est indisponible."));
      } catch {
        reject(new Error("Réponse Gemini invalide."));
      }
    });
    child.stdin.end(JSON.stringify({ ...payload, apiKey }));
  });
}

export function geminiDeepDiveDevPlugin() {
  return {
    name: "gemini-deep-dive-local-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://local.test");
        if (requestUrl.pathname !== "/api/ai/deep-dive") {
          next();
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Méthode non autorisée." });
          return;
        }
        if (!isLoopbackRequest(request)) {
          sendJson(response, 403, { error: "Accès local uniquement." });
          return;
        }
        if (!hasSameOrigin(request)) {
          sendJson(response, 403, { error: "Origine refusée." });
          return;
        }

        try {
          const payload = validatePayload(await readJsonBody(request));
          if (process.env.GEMINI_DEEP_DIVE_MOCK === "1") {
            if (payload.question.includes("[quota-test]")) {
              sendJson(response, 429, {
                code: "GEMINI_QUOTA_EXHAUSTED",
                error: "Le quota Gemini est atteint.",
              });
              return;
            }
            sendJson(response, 200, {
              answer: "## Réponse\n\nLe passage doit être relié aux mécanismes cités dans la source.\n\n## Limites / vérifications\n\n- Vérifier les affirmations avec une source primaire.",
              model: "Gemini · test local",
            });
            return;
          }
          const apiKey = await getApiKey("geminiDeepDive");
          if (!apiKey) {
            sendJson(response, 428, {
              code: "GEMINI_KEY_REQUIRED",
              error: "Ajoute une clé API Gemini pour lancer l'approfondissement.",
            });
            return;
          }
          sendJson(response, 200, await runPython(payload, apiKey));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Gemini est indisponible.";
          if (/quota|resource_exhausted|free_tier_requests|\b429\b/i.test(message)) {
            sendJson(response, 429, {
              code: "GEMINI_QUOTA_EXHAUSTED",
              error: "Le quota Gemini est atteint.",
            });
            return;
          }
          sendJson(response, 503, { error: message });
        }
      });
    },
  };
}
