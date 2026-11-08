import { ApiError } from "./http";
import type { SourceKind } from "./types";

export interface NormalizedYouTubeSource {
  originalUrl: string;
  normalizedUrl: string;
  sourceKind: SourceKind;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const IDENTIFIER = /^[A-Za-z0-9_-]{6,128}$/;

export function normalizeYouTubeUrl(input: string): NormalizedYouTubeSource {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw invalidUrl();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw invalidUrl();
  }

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    if (!videoId || !IDENTIFIER.test(videoId)) {
      throw invalidUrl();
    }
    const playlistId = url.searchParams.get("list");
    if (playlistId && IDENTIFIER.test(playlistId)) {
      return playlist(input, playlistId);
    }
    return video(input, videoId);
  }

  if (!YOUTUBE_HOSTS.has(host)) {
    throw invalidUrl();
  }

  const playlistId = url.searchParams.get("list");
  if (playlistId) {
    if (!IDENTIFIER.test(playlistId)) {
      throw invalidUrl();
    }
    return playlist(input, playlistId);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const videoId =
    url.pathname === "/watch"
      ? url.searchParams.get("v")
      : ["shorts", "live", "embed"].includes(segments[0] ?? "")
        ? segments[1]
        : null;
  if (!videoId || !IDENTIFIER.test(videoId)) {
    throw invalidUrl();
  }
  return video(input, videoId);
}

function video(originalUrl: string, videoId: string): NormalizedYouTubeSource {
  return {
    originalUrl: originalUrl.trim(),
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    sourceKind: "youtube_video",
  };
}

function playlist(originalUrl: string, playlistId: string): NormalizedYouTubeSource {
  return {
    originalUrl: originalUrl.trim(),
    normalizedUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    sourceKind: "youtube_playlist",
  };
}

function invalidUrl(): ApiError {
  return new ApiError(400, "INVALID_YOUTUBE_URL", "Colle une URL de vidéo ou playlist YouTube valide.");
}
