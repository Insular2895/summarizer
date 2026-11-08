import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "../../..");
const envPath = process.env.TRANSCRIPT_ENV_PATH
  ? path.resolve(process.env.TRANSCRIPT_ENV_PATH)
  : path.join(repoDir, ".env");
const SERVICE = process.env.TRANSCRIPT_KEYCHAIN_SERVICE || "com.graphipy.transcript.api-keys";
const SUPPORTED_KEYS = new Set(["geminiSummary", "geminiDeepDive"]);
const LEGACY_ENV_KEYS = new Set([
  "GEMINI_API_KEY",
  "GEMINI_SUMMARY_API_KEY",
  "GEMINI_DEEP_DIVE_API_KEY",
]);
const memoryStore = new Map();

function backendName() {
  if (process.env.TRANSCRIPT_STORE_BACKEND === "memory") return "memory";
  return process.platform === "darwin" ? "macos-keychain" : "unavailable";
}

function runSecurity(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, {
      env: { PATH: "/usr/bin:/bin" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Le Trousseau macOS ne répond pas."));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4_096) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 16_384) child.kill("SIGTERM");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function readRootEnvironment() {
  try {
    const source = await fs.readFile(envPath, "utf8");
    const values = {};
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    }
    return { source, values };
  } catch {
    return { source: "", values: {} };
  }
}

function validateKeyValue(value) {
  if (typeof value !== "string") throw new Error("Clé API invalide.");
  const key = value.trim();
  if (key.length < 20 || key.length > 512 || /\s/.test(key)) throw new Error("Clé API invalide.");
  return key;
}

async function hasStoredKey(name) {
  if (backendName() === "memory") return memoryStore.has(name);
  if (backendName() !== "macos-keychain") return false;
  const result = await runSecurity(["find-generic-password", "-a", name, "-s", SERVICE]);
  return result.code === 0;
}

async function readStoredKey(name) {
  if (backendName() === "memory") return memoryStore.get(name) || "";
  if (backendName() !== "macos-keychain") return "";
  const result = await runSecurity(["find-generic-password", "-a", name, "-s", SERVICE, "-w"]);
  return result.code === 0 ? result.stdout.replace(/[\r\n]+$/, "") : "";
}

async function writeStoredKey(name, value) {
  if (backendName() === "memory") {
    memoryStore.set(name, value);
    return;
  }
  if (backendName() !== "macos-keychain") {
    throw new Error("Aucun coffre de secrets sécurisé n'est disponible sur ce système.");
  }
  const result = await runSecurity(
    ["add-generic-password", "-a", name, "-s", SERVICE, "-U", "-w"],
    `${value}\n${value}\n`,
  );
  if (result.code !== 0) throw new Error("Enregistrement dans le Trousseau macOS impossible.");
}

async function deleteStoredKey(name) {
  if (backendName() === "memory") {
    memoryStore.delete(name);
    return;
  }
  if (backendName() !== "macos-keychain") return;
  await runSecurity(["delete-generic-password", "-a", name, "-s", SERVICE]);
}

function environmentKeys(envFile) {
  const generic = process.env.GEMINI_API_KEY || envFile.GEMINI_API_KEY || "";
  return {
    geminiSummary: process.env.GEMINI_SUMMARY_API_KEY || envFile.GEMINI_SUMMARY_API_KEY || generic,
    geminiDeepDive: process.env.GEMINI_DEEP_DIVE_API_KEY || envFile.GEMINI_DEEP_DIVE_API_KEY || generic,
  };
}

function hasLegacyEnvironment(envFile) {
  return [...LEGACY_ENV_KEYS].some((name) => Boolean(process.env[name] || envFile[name]));
}

export async function getApiKeySettingsStatus() {
  if (process.env.GEMINI_DEEP_DIVE_MOCK === "1") {
    return {
      configured: { geminiSummary: true, geminiDeepDive: true },
      storage: backendName(),
      legacyEnvironment: false,
    };
  }
  const { values } = await readRootEnvironment();
  const environment = environmentKeys(values);
  const [summaryStored, deepDiveStored] = await Promise.all([
    hasStoredKey("geminiSummary"),
    hasStoredKey("geminiDeepDive"),
  ]);
  return {
    configured: {
      geminiSummary: summaryStored || Boolean(environment.geminiSummary),
      geminiDeepDive: deepDiveStored || Boolean(environment.geminiDeepDive),
    },
    storage: backendName(),
    legacyEnvironment: hasLegacyEnvironment(values),
  };
}

export async function getApiKeyStatus() {
  return (await getApiKeySettingsStatus()).configured;
}

export async function getApiKey(name) {
  if (!SUPPORTED_KEYS.has(name)) throw new Error("Usage de clé inconnu.");
  const stored = await readStoredKey(name);
  if (stored) return stored;
  const { values } = await readRootEnvironment();
  return environmentKeys(values)[name] || "";
}

export async function saveApiKeys(values) {
  if (!values || typeof values !== "object") throw new Error("Clés API invalides.");
  const writes = [];
  for (const [name, value] of Object.entries(values)) {
    if (!SUPPORTED_KEYS.has(name) || value === "") continue;
    writes.push(writeStoredKey(name, validateKeyValue(value)));
  }
  await Promise.all(writes);
  return getApiKeySettingsStatus();
}

export async function removeApiKey(name) {
  if (!SUPPORTED_KEYS.has(name)) throw new Error("Usage de clé inconnu.");
  await deleteStoredKey(name);
  return getApiKeySettingsStatus();
}

function secretMatches(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function migrateLegacyApiKeys() {
  if (backendName() !== "macos-keychain" && backendName() !== "memory") {
    throw new Error("Aucun coffre de secrets sécurisé n'est disponible sur ce système.");
  }
  const { source, values } = await readRootEnvironment();
  const environment = environmentKeys(values);
  const migrated = [];
  for (const name of SUPPORTED_KEYS) {
    const value = environment[name];
    if (!value) continue;
    const validated = validateKeyValue(value);
    await writeStoredKey(name, validated);
    const verified = await readStoredKey(name);
    if (!secretMatches(validated, verified)) throw new Error("La vérification du coffre a échoué.");
    migrated.push(name);
  }
  if (migrated.length === 0) return { ...(await getApiKeySettingsStatus()), migrated: false };

  if (source) {
    const cleaned = source
      .split(/\r?\n/)
      .filter((line) => {
        const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
        return !match || !LEGACY_ENV_KEYS.has(match[1]);
      })
      .join("\n");
    const stat = await fs.stat(envPath);
    const temporaryPath = `${envPath}.secure-migration-${process.pid}`;
    await fs.writeFile(temporaryPath, cleaned.endsWith("\n") ? cleaned : `${cleaned}\n`, {
      encoding: "utf8",
      mode: stat.mode & 0o777,
    });
    await fs.rename(temporaryPath, envPath);
  }
  for (const name of LEGACY_ENV_KEYS) delete process.env[name];
  return { ...(await getApiKeySettingsStatus()), migrated: true };
}
