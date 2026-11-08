import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localEvents } from "./local-events.mjs";
import { hasSameOrigin, isLoopbackRequest } from "./local-request-guard.mjs";
import { readPlaylistCards } from "./playlist-data.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const prototypeDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(prototypeDir, "../..");
const localStateRoot = process.env.TRANSCRIPT_WEB_STATE_DIR
  ? path.resolve(process.env.TRANSCRIPT_WEB_STATE_DIR)
  : path.join(repoDir, "cache");
const jobsDir = path.join(localStateRoot, "web_jobs");
const sessionsDir = path.join(localStateRoot, "web_review_sessions");
const pythonBin = process.env.PYTHON_BIN || path.join(repoDir, ".venv", "bin", "python");
const MAX_SOURCE_BODY_BYTES = 4 * 1024;
const MAX_SESSION_BODY_BYTES = 2 * 1024 * 1024;
const children = new Map();

const PROVIDER_SECRET_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_SUMMARY_API_KEY",
  "GEMINI_DEEP_DIVE_API_KEY",
  "GEMINI_SUMMARY_BACKUP_API_KEY",
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

async function readJsonBody(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("La requête dépasse la taille autorisée.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function canonicalYoutubeUrl(value) {
  if (typeof value !== "string" || value.length > 1_000) throw new Error("URL YouTube invalide.");
  const parsed = new URL(value.trim());
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    throw new Error("URL YouTube invalide.");
  }
  const list = parsed.searchParams.get("list");
  if (list) return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
  const videoId = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
  if (videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  throw new Error("Ajoute une URL de vidéo ou de playlist YouTube complète.");
}

function jobIdFor(url) {
  return `youtube-${createHash("sha256").update(url).digest("hex").slice(0, 20)}`;
}

function childEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of PROVIDER_SECRET_NAMES) delete environment[name];
  return environment;
}

function jobPath(jobId) {
  if (!/^youtube-[a-f0-9]{20}$/.test(jobId)) throw new Error("Identifiant de job invalide.");
  return path.join(jobsDir, `${jobId}.json`);
}

async function readJob(jobId) {
  const raw = await fs.readFile(jobPath(jobId), "utf8");
  const state = JSON.parse(raw);
  let cards = state.outputDir ? await readPlaylistCards(state.outputDir, repoDir) : [];
  if (state.mockFixture) {
    cards = JSON.parse(await fs.readFile(path.join(prototypeDir, "src", "generated", "playlist32.example.json"), "utf8"));
  }
  return { ...state, cards };
}

async function completeMockJob(state) {
  const completed = {
    ...state,
    title: "Démo locale",
    status: "completed",
    total: 3,
    done: 3,
    failed: 0,
    mockFixture: true,
    updatedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  await fs.writeFile(jobPath(state.id), `${JSON.stringify(completed, null, 2)}\n`, "utf8");
}

async function writeInitialJob(jobId, url) {
  await fs.mkdir(jobsDir, { recursive: true });
  const target = jobPath(jobId);
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const now = new Date().toISOString();
  const state = {
    id: jobId,
    url,
    title: "Playlist YouTube",
    status: "queued",
    total: 0,
    done: 0,
    failed: 0,
    createdAt: now,
    updatedAt: now,
    error: null,
    nextRetryAt: null,
  };
  await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

async function listJobs() {
  await fs.mkdir(jobsDir, { recursive: true });
  const filenames = (await fs.readdir(jobsDir)).filter((name) => /^youtube-[a-f0-9]{20}\.json$/.test(name));
  const jobs = [];
  for (const filename of filenames) {
    try {
      jobs.push(await readJob(filename.replace(/\.json$/, "")));
    } catch {
      // Keep a damaged local state isolated from the other jobs.
    }
  }
  return jobs.sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
}

function startJob(state) {
  if (children.has(state.id) || state.status === "completed" || isProcessAlive(state.workerPid)) return;
  const child = spawn(
    pythonBin,
    ["-m", "src.web_playlist_job", "--job-id", state.id, "--url", state.url, "--state", jobPath(state.id)],
    {
      cwd: repoDir,
      env: childEnvironment(),
      stdio: "ignore",
    },
  );
  children.set(state.id, child);
  child.once("error", async () => {
    children.delete(state.id);
    const failed = { ...state, status: "failed", error: "local_runtime_unavailable", updatedAt: new Date().toISOString() };
    await fs.writeFile(jobPath(state.id), `${JSON.stringify(failed, null, 2)}\n`, "utf8").catch(() => {});
  });
  child.once("close", () => children.delete(state.id));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function resumePausedJobs({ force = false } = {}) {
  await fs.mkdir(jobsDir, { recursive: true });
  const filenames = await fs.readdir(jobsDir);
  const now = Date.now();
  for (const filename of filenames.filter((name) => /^youtube-[a-f0-9]{20}\.json$/.test(name))) {
    try {
      const state = JSON.parse(await fs.readFile(path.join(jobsDir, filename), "utf8"));
      const retryDue = !state.nextRetryAt || Date.parse(state.nextRetryAt) <= now;
      if (["queued", "running"].includes(state.status) || (state.status === "paused_quota" && (force || retryDue))) {
        startJob(state);
      }
    } catch {
      // A malformed local state file is ignored instead of breaking every job.
    }
  }
}

function sessionPath(sessionId) {
  if (!/^[-a-zA-Z0-9_]{4,100}$/.test(sessionId)) throw new Error("Identifiant de session invalide.");
  return path.join(sessionsDir, `${sessionId}.json`);
}

function validateSession(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Session invalide.");
  if (!Array.isArray(payload.decisions)) throw new Error("Décisions invalides.");
  const decisions = payload.decisions.map((value) => (value === "keep" || value === "discard" ? value : null));
  const notes = validateTextRecord(payload.notes, 100_000);
  const deepDives = validateDeepDives(payload.deepDives);
  return {
    decisions,
    notes,
    deepDives,
    finalized: Boolean(payload.finalized),
    updatedAt: new Date().toISOString(),
  };
}

function validateTextRecord(value, maximumLength) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, text] of Object.entries(value)) {
    if (!/^[-a-zA-Z0-9_]{4,100}$/.test(key) || typeof text !== "string" || text.length > maximumLength) {
      throw new Error("Contenu de session invalide.");
    }
    result[key] = text;
  }
  return result;
}

function validateDeepDives(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, entries] of Object.entries(value)) {
    if (!/^[-a-zA-Z0-9_]{4,100}$/.test(key) || !Array.isArray(entries)) throw new Error("Approfondissements invalides.");
    result[key] = entries.slice(-50).map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("Approfondissement invalide.");
      const answer = typeof entry.answer === "string" ? entry.answer : "";
      const question = typeof entry.question === "string" ? entry.question : "";
      const excerpt = typeof entry.excerpt === "string" ? entry.excerpt : "";
      if (!answer || answer.length > 100_000 || question.length > 1_500 || excerpt.length > 4_000) {
        throw new Error("Approfondissement invalide.");
      }
      return {
        answer,
        question,
        excerpt,
        model: typeof entry.model === "string" ? entry.model.slice(0, 120) : "Gemini",
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
      };
    });
  }
  return result;
}

export function youtubeJobsDevPlugin() {
  let retryTimer;
  const handleKeysUpdated = () => void resumePausedJobs({ force: true });
  return {
    name: "youtube-jobs-local-api",
    configureServer(server) {
      localEvents.on("api-keys-updated", handleKeysUpdated);
      void resumePausedJobs();
      retryTimer = setInterval(() => void resumePausedJobs(), 60_000);
      retryTimer.unref?.();
      server.httpServer?.once("close", () => {
        localEvents.off("api-keys-updated", handleKeysUpdated);
        if (retryTimer) clearInterval(retryTimer);
      });

      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://local.test");
        const jobMatch = requestUrl.pathname.match(/^\/api\/youtube\/jobs\/([^/]+)$/);
        const sessionMatch = requestUrl.pathname.match(/^\/api\/review-sessions\/([^/]+)$/);
        if (requestUrl.pathname !== "/api/youtube/jobs" && !jobMatch && !sessionMatch) {
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
          if (requestUrl.pathname === "/api/youtube/jobs" && request.method === "POST") {
            const payload = await readJsonBody(request, MAX_SOURCE_BODY_BYTES);
            const url = canonicalYoutubeUrl(payload?.url);
            const id = jobIdFor(url);
            const state = await writeInitialJob(id, url);
            if (process.env.TRANSCRIPT_YOUTUBE_JOB_MOCK === "1") await completeMockJob(state);
            else startJob(state);
            sendJson(response, 202, await readJob(id));
            return;
          }
          if (requestUrl.pathname === "/api/youtube/jobs" && request.method === "GET") {
            sendJson(response, 200, { jobs: await listJobs() });
            return;
          }
          if (jobMatch && request.method === "GET") {
            const state = await readJob(jobMatch[1]);
            if (state.status === "paused_quota" && (!state.nextRetryAt || Date.parse(state.nextRetryAt) <= Date.now())) {
              startJob(state);
            }
            sendJson(response, 200, state);
            return;
          }
          if (jobMatch && request.method === "POST") {
            const state = await readJob(jobMatch[1]);
            if (!["running", "completed"].includes(state.status)) startJob(state);
            sendJson(response, 202, state);
            return;
          }
          if (sessionMatch && request.method === "GET") {
            try {
              sendJson(response, 200, JSON.parse(await fs.readFile(sessionPath(sessionMatch[1]), "utf8")));
            } catch (error) {
              if (error?.code === "ENOENT") sendJson(response, 404, { error: "Session absente." });
              else throw error;
            }
            return;
          }
          if (sessionMatch && request.method === "POST") {
            const session = validateSession(await readJsonBody(request, MAX_SESSION_BODY_BYTES));
            await fs.mkdir(sessionsDir, { recursive: true });
            const target = sessionPath(sessionMatch[1]);
            const temporary = `${target}.tmp-${process.pid}`;
            await fs.writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, "utf8");
            await fs.rename(temporary, target);
            sendJson(response, 200, { saved: true, updatedAt: session.updatedAt });
            return;
          }
          sendJson(response, 405, { error: "Méthode non autorisée." });
        } catch (error) {
          const status = error?.code === "ENOENT" ? 404 : 400;
          sendJson(response, status, { error: error instanceof Error ? error.message : "Opération impossible." });
        }
      });
    },
  };
}
