import { promises as fs } from "node:fs";
import path from "node:path";

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
    return truncateAtWord(
      cleanInlineMarkdown(responseLine.replace(/^.*?R[ée]ponse fournie par la vid[ée]o\s*:\s*/i, "")),
      360,
    );
  }

  const paragraph = directSection
    .split(/\n\s*\n/)
    .map(cleanInlineMarkdown)
    .find((value) => value && !value.startsWith("Promesse du titre :"));
  if (paragraph) return truncateAtWord(paragraph, 360);

  const firstUsefulLine = body
    .split("\n")
    .map(cleanInlineMarkdown)
    .find((line) => line.length > 60 && !line.startsWith("Analyse de la video"));
  return truncateAtWord(firstUsefulLine ?? "Résumé local disponible dans la fiche complète.", 360);
}

function extractKeyPoints(body) {
  const retained = extractSection(body, /^(?:A|À) retenir$/i)
    .split("\n")
    .filter((line) => /^[-*]\s+/.test(line))
    .map(cleanInlineMarkdown)
    .filter(Boolean);
  if (retained.length) return retained.slice(0, 3);

  return body
    .split("\n")
    .filter((line) => /^###\s+/.test(line))
    .map((line) => cleanInlineMarkdown(line.replace(/^###\s+/, "")))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeMarkdown(body) {
  return body
    .replace(/^#\s+[^\n]+\n+/, "")
    .replace(/==([^=]+)==/g, "**$1**")
    .replace(/^-==\s*/gm, "- ")
    .trim();
}

export async function readPlaylistCards(outputDir, repoDir) {
  const resolvedOutput = path.resolve(outputDir);
  const videosRoot = path.resolve(repoDir, "output", "videos");
  if (resolvedOutput !== videosRoot && !resolvedOutput.startsWith(`${videosRoot}${path.sep}`)) {
    throw new Error("Dossier de résumés invalide.");
  }

  let filenames = [];
  try {
    filenames = (await fs.readdir(resolvedOutput))
      .filter((filename) => filename.endsWith(".md"))
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const cards = [];
  for (const [index, filename] of filenames.entries()) {
    const raw = await fs.readFile(path.join(resolvedOutput, filename), "utf8");
    const title = readFrontmatterValue(raw, "title");
    const url = readFrontmatterValue(raw, "url");
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const videoId = parsed.searchParams.get("v");
    if (!title || !videoId) continue;
    const body = stripFrontmatter(raw);
    cards.push({
      id: `${videoId}-${String(index + 1).padStart(3, "0")}`,
      videoId,
      title,
      url,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: null,
      source: "YouTube · résumé local",
      summary: extractCardSummary(body),
      points: extractKeyPoints(body),
      fullSummary: normalizeMarkdown(body),
      sourceFile: path.relative(repoDir, path.join(resolvedOutput, filename)),
    });
  }
  return cards;
}
