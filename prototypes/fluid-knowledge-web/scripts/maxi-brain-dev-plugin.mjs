import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getApiKeyStatus } from "./api-key-store.mjs";
import { hasSameOrigin, isLoopbackRequest } from "./local-request-guard.mjs";

const MAX_BODY_BYTES = 6 * 1024 * 1024;

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
    if (size > MAX_BODY_BYTES) throw new Error("Le paquet dépasse la taille autorisée.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validatePackage(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Paquet invalide.");
  if (!Array.isArray(payload.entries) || payload.entries.length < 1) {
    throw new Error("Le paquet doit contenir au moins une vidéo gardée.");
  }
  if (typeof payload.receiptId !== "string" || !/^[-a-zA-Z0-9]{8,100}$/.test(payload.receiptId)) {
    throw new Error("Identifiant d'export invalide.");
  }
  if (typeof payload.playlist !== "string" || payload.playlist.length > 240) throw new Error("Playlist invalide.");
  if (!Number.isFinite(Date.parse(payload.exportedAt))) throw new Error("Date d'export invalide.");

  return payload.entries.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Entrée vidéo invalide.");
    if (typeof entry.id !== "string" || !/^[-_a-zA-Z0-9]{4,40}$/.test(entry.id)) throw new Error("ID vidéo invalide.");
    if (typeof entry.title !== "string" || entry.title.length < 1 || entry.title.length > 300) throw new Error("Titre vidéo invalide.");
    if (typeof entry.url !== "string" || !entry.url.startsWith("https://www.youtube.com/")) throw new Error("URL vidéo invalide.");
    if (typeof entry.fullSummary !== "string" || entry.fullSummary.length < 1 || entry.fullSummary.length > 1_000_000) throw new Error("Résumé vidéo invalide.");
    if (entry.note !== undefined && (typeof entry.note !== "string" || entry.note.length > 100_000)) throw new Error("Note vidéo invalide.");
    if (entry.deepDives !== undefined && (!Array.isArray(entry.deepDives) || entry.deepDives.length > 50)) throw new Error("Approfondissements invalides.");
    return { ...entry, note: entry.note?.trim() || "", deepDives: entry.deepDives || [] };
  });
}

function buildReadme(payload, entries) {
  const list = entries.map((entry, index) => `${index + 1}. [${entry.title}](${entry.url})`).join("\n");
  return `# ${payload.playlist}\n\nExport Transcript reçu le ${new Date(payload.exportedAt).toLocaleString("fr-FR")} dans l'inbox Maxi Brain.\n\n${entries.length} vidéo${entries.length > 1 ? "s" : ""} gardée${entries.length > 1 ? "s" : ""}.\n\n## Contenu\n\n${list}\n`;
}

export function maxiBrainDevPlugin() {
  const configuredInbox = process.env.MAXI_BRAIN_INBOX;
  const inboxDir = configuredInbox
    ? path.resolve(configuredInbox)
    : path.join(os.homedir(), "Graphipy maxi brain", "inbox", "to_process");

  const ensureInbox = async () => {
    if (configuredInbox) await fs.mkdir(inboxDir, { recursive: true });
    await fs.access(inboxDir, fsConstants.W_OK);
  };

  return {
    name: "maxi-brain-local-export",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://local.test");
        if (requestUrl.pathname === "/api/capabilities" && request.method === "GET") {
          if (!isLoopbackRequest(request)) {
            sendJson(response, 403, { error: "Accès local uniquement." });
            return;
          }
          const apiKeys = await getApiKeyStatus();
          try {
            await ensureInbox();
            sendJson(response, 200, { maxiBrainExport: true, geminiDeepDive: true, apiKeys });
          } catch {
            sendJson(response, 200, { maxiBrainExport: false, geminiDeepDive: true, apiKeys });
          }
          return;
        }

        if (requestUrl.pathname !== "/api/exports/maxi-brain") {
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

        let temporaryDir;
        try {
          await ensureInbox();
          const payload = await readJsonBody(request);
          const entries = validatePackage(payload);
          temporaryDir = await fs.mkdtemp(path.join(inboxDir, ".transcript-export-"));
          const videosDir = path.join(temporaryDir, "videos");
          await fs.mkdir(videosDir);
          await fs.writeFile(path.join(temporaryDir, "README.md"), buildReadme(payload, entries), "utf8");
          await fs.writeFile(path.join(temporaryDir, "manifest.json"), `${JSON.stringify({
            receipt_id: payload.receiptId,
            source: "Transcript Fluid Knowledge",
            playlist: payload.playlist,
            exported_at: payload.exportedAt,
            kept_count: entries.length,
            status: "to_process",
          }, null, 2)}\n`, "utf8");

          for (const [index, entry] of entries.entries()) {
            const filename = `${String(index + 1).padStart(3, "0")}-${entry.id}.md`;
            const frontmatter = `---\ntype: transcript_export\nstatus: to_process\ntitle: ${JSON.stringify(entry.title)}\nurl: ${JSON.stringify(entry.url)}\nvideo_id: ${entry.id}\nsource_file: ${JSON.stringify(entry.sourceFile || "")}\n---\n\n`;
            const noteSection = entry.note ? `\n\n## Note personnelle\n\n${entry.note}\n` : "\n";
            const deepDiveSection = entry.deepDives.length
              ? `\n\n## Approfondissements IA sauvegardés\n\n${entry.deepDives.map((item) => `### ${item.question || "Approfondissement"}\n\n${item.answer}`).join("\n\n")}\n`
              : "";
            await fs.writeFile(path.join(videosDir, filename), `${frontmatter}${entry.fullSummary}${noteSection}${deepDiveSection}`, "utf8");
          }

          const folderName = `transcript-export-${payload.receiptId}`;
          await fs.rename(temporaryDir, path.join(inboxDir, folderName));
          temporaryDir = undefined;
          sendJson(response, 201, { receiptId: payload.receiptId, folderName });
        } catch (error) {
          if (temporaryDir) await fs.rm(temporaryDir, { recursive: true, force: true }).catch(() => {});
          sendJson(response, 400, { error: error instanceof Error ? error.message : "Export Maxi Brain impossible." });
        }
      });
    },
  };
}
