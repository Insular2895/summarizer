import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const prototypeDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(prototypeDir, "../..");
const sourceDir = path.join(repoDir, "output/videos/playlist-32");
const generatedDir = path.join(prototypeDir, "src/generated");
const generatedFile = path.join(generatedDir, "playlist32.json");
const exampleFile = path.join(generatedDir, "playlist32.example.json");
const thumbnailDir = path.join(prototypeDir, "public/assets/playlist-32");

function readFrontmatterValue(raw, key) {
  const match = raw.match(new RegExp(`^${key}:\\s*"([\\s\\S]*?)"$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function stripFrontmatter(raw) {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function extractSection(markdown, headingPattern) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => {
    const heading = line.match(/^##\s+(.+)$/)?.[1]?.trim();
    return heading ? headingPattern.test(heading) : false;
  });

  if (start < 0) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start + 1, end).join("\n").trim();
}

function cleanInlineMarkdown(value) {
  return value
    .replace(/==/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^[-*]\s*/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value, maxLength) {
  if (value.length <= maxLength) return value;
  const candidate = value.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}…`;
}

function extractCardSummary(body) {
  const directSection = extractSection(body, /^R[ée]ponse directe(?: au titre)?$/i);
  const responseLine = directSection
    .split("\n")
    .find((line) => /R[ée]ponse fournie par la vid[ée]o\s*:/i.test(line));

  if (responseLine) {
    const response = responseLine.replace(/^.*?R[ée]ponse fournie par la vid[ée]o\s*:\s*/i, "");
    return truncateAtWord(cleanInlineMarkdown(response), 360);
  }

  const paragraphs = directSection
    .split(/\n\s*\n/)
    .map(cleanInlineMarkdown)
    .filter((paragraph) => paragraph && !paragraph.startsWith("Promesse du titre :"));

  if (paragraphs[0]) return truncateAtWord(paragraphs[0], 360);

  const firstUsefulLine = body
    .split("\n")
    .map(cleanInlineMarkdown)
    .find((line) => line.length > 60 && !line.startsWith("Analyse de la video"));

  return truncateAtWord(firstUsefulLine ?? "Résumé local disponible dans la fiche complète.", 360);
}

function extractKeyPoints(body) {
  const retainSection = extractSection(body, /^(?:A|À) retenir$/i);
  const retained = retainSection
    .split("\n")
    .filter((line) => /^[-*]\s+/.test(line))
    .map(cleanInlineMarkdown)
    .filter(Boolean);

  if (retained.length > 0) return retained.slice(0, 3);

  const establishedSection = extractSection(body, /^Ce que la vid[ée]o [ée]tablit r[ée]ellement$/i);
  const establishedHeadings = establishedSection
    .split("\n")
    .filter((line) => /^###\s+/.test(line))
    .map((line) => cleanInlineMarkdown(line.replace(/^###\s+/, "")))
    .filter(Boolean);

  if (establishedHeadings.length > 0) return establishedHeadings.slice(0, 3);

  const bodyHeadings = body
    .split("\n")
    .filter((line) => /^###\s+/.test(line))
    .map((line) => cleanInlineMarkdown(line.replace(/^###\s+/, "")))
    .filter(Boolean);

  return bodyHeadings.slice(0, 3);
}

function normalizeMarkdown(body) {
  return body
    .replace(/^#\s+[^\n]+\n+/, "")
    .replace(/==([^=]+)==/g, "**$1**")
    .replace(/^-==\s*/gm, "- ")
    .trim();
}

async function downloadThumbnail(videoId) {
  const target = path.join(thumbnailDir, `${videoId}.jpg`);

  try {
    const current = await fs.stat(target);
    if (current.size > 10_000) return `/assets/playlist-32/${videoId}.jpg`;
  } catch {
    // Continue with the real YouTube sources below.
  }

  const candidates = ["maxresdefault", "sddefault", "hqdefault"];

  for (const quality of candidates) {
    try {
      const response = await fetch(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 10_000) continue;
      await fs.writeFile(target, bytes);
      return `/assets/playlist-32/${videoId}.jpg`;
    } catch {
      // A missing thumbnail is an accepted state; never synthesize one here.
    }
  }

  return null;
}

await fs.mkdir(generatedDir, { recursive: true });
await fs.mkdir(thumbnailDir, { recursive: true });

if (process.env.TRANSCRIPT_PUBLIC_FIXTURE === "1") {
  await fs.copyFile(exampleFile, generatedFile);
  console.log("Jeu de démonstration neutre activé pour les tests publics.");
  process.exit(0);
}

let sourceEntries = [];
try {
  sourceEntries = await fs.readdir(sourceDir);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const filenames = sourceEntries
  .filter((filename) => filename.endsWith(".md"))
  .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));

if (filenames.length === 0) {
  await fs.copyFile(exampleFile, generatedFile);
  console.log("Playlist 32 locale absente: jeu de démonstration neutre activé.");
  process.exit(0);
}

const videos = [];

for (const filename of filenames) {
  const raw = await fs.readFile(path.join(sourceDir, filename), "utf8");
  const title = readFrontmatterValue(raw, "title");
  const url = readFrontmatterValue(raw, "url");
  const body = stripFrontmatter(raw);
  const videoId = new URL(url).searchParams.get("v");

  if (!title || !videoId) continue;

  const thumbnail = await downloadThumbnail(videoId);
  videos.push({
    id: videoId,
    title,
    url,
    thumbnail,
    duration: null,
    source: "YouTube · résumé local",
    summary: extractCardSummary(body),
    points: extractKeyPoints(body),
    fullSummary: normalizeMarkdown(body),
    sourceFile: `output/videos/playlist-32/${filename}`,
  });
}

await fs.writeFile(generatedFile, `${JSON.stringify(videos, null, 2)}\n`);

const thumbnails = videos.filter((video) => video.thumbnail).length;
console.log(`Playlist 32 synced: ${videos.length} summaries, ${thumbnails} real thumbnails.`);
