import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeftIcon,
  ArchiveIcon,
  BookmarkIcon,
  CardStackIcon,
  CheckIcon,
  CheckCircledIcon,
  ChatBubbleIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  Cross1Icon,
  CrossCircledIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  InfoCircledIcon,
  LockClosedIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  OpenInNewWindowIcon,
  PlusIcon,
  ReaderIcon,
  ReloadIcon,
  TrashIcon,
  UploadIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { SiGooglegemini, SiYoutube } from "react-icons/si";
import pearlRibbonsBackground from "./assets/summariz-pearl-ribbons.webp";
import playlist32 from "./generated/playlist32.json";

const INITIAL_PLAYLIST = {
  id: "playlist-32",
  title: "Playlist 32 — Synthèses YouTube",
  sourceLabel: `${playlist32.length} résumé${playlist32.length > 1 ? "s" : ""} structuré${playlist32.length > 1 ? "s" : ""}`,
  videos: playlist32,
  total: playlist32.length,
  jobStatus: "completed",
};

const navigation = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "review", label: "Review", icon: CardStackIcon },
  { id: "history", label: "History", icon: ClockIcon },
];

// Experimental Review surface selected on 2026-11-15. The query flag keeps the comparison
// reversible without changing review state, gestures or persistence.
const REVIEW_LAYOUT_VARIANT = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("reviewLayout") === "legacy"
  ? "legacy"
  : "integrated-card";

const HISTORY_STORAGE_KEY = "fluid-knowledge-history";
const ACTIVE_JOB_STORAGE_KEY = "fluid-knowledge-active-youtube-job";
const EMPTY_DEEP_DIVES = [];

function storageKeysFor(playlistId) {
  const legacy = playlistId === "playlist-32";
  return {
    decisions: legacy ? "fluid-knowledge-playlist-32-decisions" : `fluid-knowledge-${playlistId}-decisions`,
    decisionMap: legacy ? "fluid-knowledge-playlist-32-decision-map" : `fluid-knowledge-${playlistId}-decision-map`,
    finalized: legacy ? "fluid-knowledge-playlist-32-finalized" : `fluid-knowledge-${playlistId}-finalized`,
    notes: legacy ? "fluid-knowledge-playlist-32-notes" : `fluid-knowledge-${playlistId}-notes`,
    deepDives: `fluid-knowledge-${playlistId}-deep-dives`,
    position: `fluid-knowledge-${playlistId}-position`,
  };
}

function readStoredValue(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The prototype remains usable when private browsing blocks local storage.
  }
}

function slugifyFilename(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72) || "video";
}

function buildExportEntries(videos, decisions, notes, deepDives) {
  return videos
    .map((video, index) => ({
      ...video,
      decision: decisions[index],
      note: notes[video.id] || "",
      deepDives: deepDives[video.id] || [],
    }))
    .filter((video) => video.decision === "keep");
}

function buildReadme(playlist, entries, exportedAt) {
  const list = entries.map((video, index) => `${index + 1}. [${video.title}](${video.url})`).join("\n");
  return `# ${playlist.title}\n\nExporté le ${new Date(exportedAt).toLocaleString("fr-FR")}\n\n${entries.length} vidéo${entries.length > 1 ? "s" : ""} gardée${entries.length > 1 ? "s" : ""}.\n\n## Contenu\n\n${list}\n`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function normalizeDecisions(stored, videoCount) {
  const source = Array.isArray(stored) ? stored : [];
  return Array.from({ length: videoCount }, (_, index) => {
    const decision = source[index];
    return decision === "keep" || decision === "discard" ? decision : null;
  });
}

function decisionMapFor(videos, decisions) {
  return Object.fromEntries(videos
    .map((video, index) => [video.videoId || video.id, decisions[index]])
    .filter(([, decision]) => decision === "keep" || decision === "discard"));
}

function decisionsFromMap(videos, stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  return videos.map((video) => {
    const decision = stored[video.videoId || video.id];
    return decision === "keep" || decision === "discard" ? decision : null;
  });
}

function restoreDecisions(videos, storedDecisions, storedMap) {
  return decisionsFromMap(videos, storedMap) ?? normalizeDecisions(storedDecisions, videos.length);
}

function loadDecisions(playlistId, videos) {
  const keys = storageKeysFor(playlistId);
  const positional = normalizeDecisions(readStoredValue(keys.decisions, []), videos.length);
  const mapped = decisionsFromMap(videos, readStoredValue(keys.decisionMap, null));
  if (!mapped) return positional;
  const mappedCount = mapped.filter(Boolean).length;
  const positionalCount = positional.filter(Boolean).length;
  return mappedCount >= positionalCount ? mapped : positional;
}

function deepDiveMarkdown(entries) {
  if (!entries?.length) return "";
  return `\n\n## Approfondissements IA sauvegardés\n\n${entries
    .map((entry) => `### ${entry.question || "Approfondissement"}\n\n${entry.answer}`)
    .join("\n\n")}\n`;
}

function markdownToPlainText(markdown) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function App() {
  const initialDecisions = loadDecisions(INITIAL_PLAYLIST.id, INITIAL_PLAYLIST.videos);
  const [section, setSection] = useState("review");
  const [currentPlaylist, setCurrentPlaylist] = useState(INITIAL_PLAYLIST);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [videoIndex, setVideoIndex] = useState(() => {
    const firstPending = initialDecisions.findIndex((decision) => !decision);
    return firstPending < 0 ? INITIAL_PLAYLIST.videos.length : firstPending;
  });
  const [lastDecision, setLastDecision] = useState(null);
  const [reviewingSavedCards, setReviewingSavedCards] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("summary");
  const [isDeciding, setIsDeciding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceState, setSourceState] = useState("idle");
  const [sourceError, setSourceError] = useState("");
  const [sourceJob, setSourceJob] = useState(null);
  const [historyEntries, setHistoryEntries] = useState(() => readStoredValue(HISTORY_STORAGE_KEY, []));
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [finalized, setFinalized] = useState(() => readStoredValue(storageKeysFor(INITIAL_PLAYLIST.id).finalized, false));
  const [maxiBrainAvailable, setMaxiBrainAvailable] = useState(false);
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [apiKeys, setApiKeys] = useState({ geminiSummary: false, geminiSummaryBackup: false, geminiDeepDive: false });
  const [apiKeySettings, setApiKeySettings] = useState({ open: false, reason: "settings" });
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [notes, setNotes] = useState(() => readStoredValue(storageKeysFor(INITIAL_PLAYLIST.id).notes, {}));
  const [deepDives, setDeepDives] = useState(() => readStoredValue(storageKeysFor(INITIAL_PLAYLIST.id).deepDives, {}));
  const [sessionHydrated, setSessionHydrated] = useState(true);
  const [sessionSaveState, setSessionSaveState] = useState("saved");
  const [exportState, setExportState] = useState({ status: "idle", message: "" });
  const ambientBackgroundRef = useRef(null);
  const activePlaylistIdRef = useRef(INITIAL_PLAYLIST.id);
  const currentPlaylistRef = useRef(INITIAL_PLAYLIST);
  const quotaSeenRef = useRef(new Set());
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-140, 0, 140], [-7, 0, 7]);
  const keepTintOpacity = useTransform(x, [8, 52, 160], [0, 0.24, 0.72]);
  const discardTintOpacity = useTransform(x, [-160, -52, -8], [0.72, 0.24, 0]);
  const scale = useTransform(x, [-300, 0, 300], [0.985, 1, 0.985]);
  const playlist = currentPlaylist;
  const videos = currentPlaylist.videos;
  const totalVideos = Math.max(currentPlaylist.total || 0, videos.length);
  const playlistProcessing = ["queued", "running", "paused_quota"].includes(currentPlaylist.jobStatus);
  const decidedCount = decisions.filter(Boolean).length;
  const keptCount = decisions.filter((decision) => decision === "keep").length;
  const discardedCount = decisions.filter((decision) => decision === "discard").length;
  const reviewComplete = videos.length > 0 && decidedCount === videos.length && !playlistProcessing;
  const waitingForCards = videos.length === 0 || (decidedCount === videos.length && playlistProcessing && !reviewingSavedCards);
  const activeVideo = videoIndex < videos.length ? videos[videoIndex] : null;
  const currentPosition = reviewComplete ? totalVideos : Math.min(videoIndex + 1, Math.max(totalVideos, 1));
  const progressPercent = reviewComplete ? 100 : Math.round((currentPosition / Math.max(totalVideos, 1)) * 100);
  const activeHistoryEntry = finalized ? null : {
    id: `active-${playlist.id}`,
    sourceTitle: playlist.title,
    finishedAt: null,
    videoCount: totalVideos,
    keptCount,
    discardedCount,
    failedCount: playlist.failed || 0,
    finalStatus: playlist.jobStatus === "paused_quota" ? "En pause · quota API" : reviewComplete ? "Prête à terminer" : playlistProcessing ? "Traitement en cours" : "Review",
    exportStatus: "En attente",
    destination: null,
    decisions: videos.map((video, index) => ({ id: video.id, title: video.title, url: video.url, decision: decisions[index] })),
    active: true,
  };
  const selectedHistory = selectedHistoryId === activeHistoryEntry?.id
    ? activeHistoryEntry
    : historyEntries.find((entry) => entry.id === selectedHistoryId) ?? null;

  useEffect(() => saveStoredValue(storageKeysFor(playlist.id).decisions, decisions), [decisions, playlist.id]);
  useEffect(() => saveStoredValue(storageKeysFor(playlist.id).decisionMap, decisionMapFor(videos, decisions)), [decisions, playlist.id, videos]);
  useEffect(() => saveStoredValue(HISTORY_STORAGE_KEY, historyEntries), [historyEntries]);
  useEffect(() => saveStoredValue(storageKeysFor(playlist.id).finalized, finalized), [finalized, playlist.id]);
  useEffect(() => saveStoredValue(storageKeysFor(playlist.id).notes, notes), [notes, playlist.id]);
  useEffect(() => saveStoredValue(storageKeysFor(playlist.id).deepDives, deepDives), [deepDives, playlist.id]);
  useEffect(() => saveStoredValue(storageKeysFor(playlist.id).position, videoIndex), [playlist.id, videoIndex]);

  useEffect(() => {
    const background = ambientBackgroundRef.current;
    if (!background || reducedMotion) return undefined;

    let animationFrame = null;
    const moveWithPointer = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const horizontal = ((event.clientX / Math.max(window.innerWidth, 1)) - 0.5) * 18;
      const vertical = ((event.clientY / Math.max(window.innerHeight, 1)) - 0.5) * 12;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        background.style.setProperty("--ambient-parallax-x", `${horizontal.toFixed(2)}px`);
        background.style.setProperty("--ambient-parallax-y", `${vertical.toFixed(2)}px`);
      });
    };
    const resetPointer = () => {
      background.style.setProperty("--ambient-parallax-x", "0px");
      background.style.setProperty("--ambient-parallax-y", "0px");
    };

    window.addEventListener("pointermove", moveWithPointer, { passive: true });
    window.addEventListener("blur", resetPointer);
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", moveWithPointer);
      window.removeEventListener("blur", resetPointer);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!sessionHydrated) return undefined;
    setSessionSaveState("saving");
    const timer = window.setTimeout(() => {
      fetch(`/api/review-sessions/${encodeURIComponent(playlist.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          decisions,
          decisionByVideoId: decisionMapFor(videos, decisions),
          notes,
          deepDives,
          currentIndex: videoIndex,
          finalized,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("sync_failed");
          setSessionSaveState("saved");
        })
        .catch(() => setSessionSaveState("local"));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [decisions, deepDives, finalized, notes, playlist.id, sessionHydrated, videoIndex, videos]);

  useEffect(() => {
    currentPlaylistRef.current = currentPlaylist;
  }, [currentPlaylist]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities", { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((capabilities) => {
        if (!cancelled) {
          setMaxiBrainAvailable(Boolean(capabilities?.maxiBrainExport));
          setGeminiAvailable(Boolean(capabilities?.geminiDeepDive));
          setApiKeys({
            geminiSummary: Boolean(capabilities?.apiKeys?.geminiSummary),
            geminiSummaryBackup: Boolean(capabilities?.apiKeys?.geminiSummaryBackup),
            geminiDeepDive: Boolean(capabilities?.apiKeys?.geminiDeepDive),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMaxiBrainAvailable(false);
          setGeminiAvailable(false);
          setApiKeys({ geminiSummary: false, geminiSummaryBackup: false, geminiDeepDive: false });
        }
      });
    return () => { cancelled = true; };
  }, []);

  const playlistFromJob = useCallback((job) => {
    const cards = Array.isArray(job?.cards) ? job.cards : [];
    const rawTitle = job?.title && job.title !== "Playlist YouTube" ? job.title : "YouTube";
    const displayTitle = /^playlist\b/i.test(rawTitle)
      ? `${rawTitle} — Synthèses YouTube`
      : `Playlist ${rawTitle} — Synthèses YouTube`;
    return {
      id: job.id,
      title: displayTitle,
      sourceLabel: job.total
        ? `${cards.length} résumé${cards.length > 1 ? "s" : ""} prêt${cards.length > 1 ? "s" : ""} sur ${job.total}`
        : "Analyse de la playlist en cours",
      videos: cards,
      total: job.total || cards.length,
      failed: job.failed || 0,
      jobStatus: job.status,
      nextRetryAt: job.nextRetryAt || null,
      batchSize: job.batchSize || 50,
      currentBatch: job.currentBatch || null,
      totalBatches: job.totalBatches || null,
      batchStart: job.batchStart || null,
      batchEnd: job.batchEnd || null,
    };
  }, []);

  const applyJobUpdate = useCallback((job) => {
    setSourceJob(job);
    if (job.status === "failed") {
      setSourceState("error");
      setSourceError(job.error === "api_key_required"
        ? "Ajoute une clé Gemini pour produire les résumés."
        : job.error === "youtube_pagination_incomplete"
          ? "YouTube annonce davantage de vidéos que la version locale de yt-dlp ne peut en charger. Mets les dépendances à jour puis relance le job."
          : "La playlist n'a pas pu être traitée.");
    } else if (job.status === "paused_quota") {
      setSourceState("paused");
      if (!quotaSeenRef.current.has(job.id)) {
        quotaSeenRef.current.add(job.id);
        setQuotaDialogOpen(true);
      }
    } else if (job.status === "completed" || job.cards?.length) {
      setSourceState("ready");
      setSourceError("");
    } else {
      setSourceState("processing");
      setSourceError("");
    }

    if (activePlaylistIdRef.current === job.id) {
      const nextPlaylist = playlistFromJob(job);
      const previousVideos = currentPlaylistRef.current.videos;
      setCurrentPlaylist(nextPlaylist);
      setDecisions((currentDecisions) => restoreDecisions(
        nextPlaylist.videos,
        currentDecisions,
        decisionMapFor(previousVideos, currentDecisions),
      ));
      setVideoIndex((currentIndex) => Math.min(currentIndex, job.cards?.length || 0));
    }
  }, [playlistFromJob]);

  const activateJob = useCallback((job, { navigate = true } = {}) => {
    const nextPlaylist = playlistFromJob(job);
    const keys = storageKeysFor(job.id);
    const localDecisions = loadDecisions(job.id, nextPlaylist.videos);
    const storedPosition = readStoredValue(keys.position, null);
    activePlaylistIdRef.current = job.id;
    saveStoredValue(ACTIVE_JOB_STORAGE_KEY, job.id);
    setSessionHydrated(false);
    setSourceUrl(job.url || "");
    setCurrentPlaylist(nextPlaylist);
    setDecisions(localDecisions);
    setNotes(readStoredValue(keys.notes, {}));
    setDeepDives(readStoredValue(keys.deepDives, {}));
    setFinalized(readStoredValue(keys.finalized, false));
    const firstPending = localDecisions.findIndex((decision) => !decision);
    const fallbackPosition = firstPending < 0 ? nextPlaylist.videos.length : firstPending;
    setVideoIndex(Number.isInteger(storedPosition) && storedPosition >= 0 && storedPosition <= nextPlaylist.videos.length
      ? storedPosition
      : fallbackPosition);
    setLastDecision(null);
    setReviewingSavedCards(false);
    setExportState({ status: "idle", message: "" });
    setDetailOpen(false);
    if (navigate) setSection("review");

    fetch(`/api/review-sessions/${encodeURIComponent(job.id)}`, { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((session) => {
        if (!session || activePlaylistIdRef.current !== job.id) return;
        const restoredDecisions = restoreDecisions(
          nextPlaylist.videos,
          session.decisions,
          session.decisionByVideoId,
        );
        setDecisions(restoredDecisions);
        setNotes(session.notes && typeof session.notes === "object" ? session.notes : {});
        setDeepDives(session.deepDives && typeof session.deepDives === "object" ? session.deepDives : {});
        setFinalized(Boolean(session.finalized));
        const firstPendingIndex = restoredDecisions.findIndex((decision) => !decision);
        const fallbackIndex = firstPendingIndex < 0 ? nextPlaylist.videos.length : firstPendingIndex;
        setVideoIndex(Number.isInteger(session.currentIndex) && session.currentIndex >= 0 && session.currentIndex <= nextPlaylist.videos.length
          ? session.currentIndex
          : fallbackIndex);
      })
      .catch(() => {})
      .finally(() => {
        if (activePlaylistIdRef.current === job.id) setSessionHydrated(true);
      });
  }, [playlistFromJob]);

  useEffect(() => {
    const jobId = readStoredValue(ACTIVE_JOB_STORAGE_KEY, "");
    const endpoint = jobId && typeof jobId === "string"
      ? `/api/youtube/jobs/${encodeURIComponent(jobId)}`
      : "/api/youtube/jobs";
    fetch(endpoint, { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const job = payload?.jobs
          ? payload.jobs.find((item) => ["queued", "running", "paused_quota", "paused_key"].includes(item.status))
            ?? payload.jobs.find((item) => item.reviewSession
              && !item.reviewSession.finalized
              && (item.reviewSession.decidedCount > 0 || item.reviewSession.noteCount > 0 || item.reviewSession.deepDiveVideoCount > 0))
          : payload;
        if (!job) return;
        applyJobUpdate(job);
        activateJob(job, { navigate: false });
      })
      .catch(() => {});
  }, [activateJob, applyJobUpdate]);

  useEffect(() => {
    if (!sourceJob?.id || !["queued", "running", "paused_quota"].includes(sourceJob.status)) return undefined;
    const poll = () => {
      fetch(`/api/youtube/jobs/${encodeURIComponent(sourceJob.id)}`, { headers: { accept: "application/json" } })
        .then((response) => response.ok ? response.json() : null)
        .then((job) => { if (job) applyJobUpdate(job); })
        .catch(() => {});
    };
    const timer = window.setInterval(poll, 5_000);
    return () => window.clearInterval(timer);
  }, [applyJobUpdate, sourceJob?.id, sourceJob?.status]);

  const returnCard = useCallback(() => {
    animate(
      x,
      0,
      reducedMotion
        ? { duration: 0.1 }
        : { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
    );
  }, [reducedMotion, x]);

  const decide = useCallback(async (decision, options = {}) => {
    if (!activeVideo || isDeciding || reviewComplete || finalized) return;
    setIsDeciding(true);
    const direction = decision === "keep" ? 1 : -1;

    if (options.animateCard !== false) {
      await animate(
        x,
        direction * 920,
        reducedMotion
          ? { duration: 0.12 }
          : { duration: 0.34, ease: [0.4, 0, 0.2, 1] },
      );
    }

    setDecisions((current) => {
      const next = [...current];
      next[videoIndex] = decision;
      return next;
    });
    setLastDecision({ index: videoIndex, decision });
    setAnnouncement(`${activeVideo.title} — ${decision === "keep" ? "gardée" : "écartée"}`);
    const nextIndex = Math.min(videoIndex + 1, videos.length);
    setVideoIndex(nextIndex);
    if (nextIndex >= videos.length && playlistProcessing) setReviewingSavedCards(false);
    x.set(0);
    setIsDeciding(false);
  }, [activeVideo, finalized, isDeciding, playlistProcessing, reducedMotion, reviewComplete, videoIndex, videos.length, x]);

  const undo = useCallback(() => {
    if (!lastDecision || isDeciding) return;
    setDecisions((current) => {
      const next = [...current];
      next[lastDecision.index] = null;
      return next;
    });
    setVideoIndex(lastDecision.index);
    setAnnouncement(`Décision annulée pour ${videos[lastDecision.index].title}`);
    setLastDecision(null);
    setExportState({ status: "idle", message: "" });
    x.set(0);
  }, [isDeciding, lastDecision, x]);

  const handleDragEnd = useCallback((_, info) => {
    const projected = info.offset.x + info.velocity.x * 0.14;
    if (projected > 132) void decide("keep");
    else if (projected < -132) void decide("discard");
    else returnCard();
  }, [decide, returnCard]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && detailOpen) {
        setDetailOpen(false);
        return;
      }
      if (event.key === "Escape" && selectedHistoryId) {
        setSelectedHistoryId(null);
        return;
      }
      if (section !== "review" || selectedHistoryId || isDeciding || reviewComplete || finalized || !activeVideo) return;
      const interactiveTarget = event.target instanceof Element
        && event.target.closest("button, a, input, textarea, select, [contenteditable='true']");
      if (interactiveTarget) return;
      if (detailOpen) return;

      if (event.key === "Enter") {
        event.preventDefault();
        setDetailTab("summary");
        setDetailOpen(true);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        void decide("keep");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void decide("discard");
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeVideo, decide, detailOpen, finalized, isDeciding, reviewComplete, section, selectedHistoryId, undo]);

  const completeExport = useCallback(({ destination, exportStatus, receiptId, exportedAt }) => {
    const entry = {
      id: receiptId,
      sourceTitle: playlist.title,
      finishedAt: exportedAt,
      videoCount: totalVideos,
      keptCount,
      discardedCount,
      failedCount: playlist.failed || 0,
      finalStatus: "Terminé",
      exportStatus,
      destination,
      decisions: videos.map((video, index) => ({ id: video.id, title: video.title, url: video.url, decision: decisions[index] })),
      active: false,
    };
    setHistoryEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
    setFinalized(true);
    setExportState({ status: "success", message: `Export confirmé vers ${destination}.` });
    setSelectedHistoryId(entry.id);
    setSection("history");
    setAnnouncement(`Playlist terminée et exportée vers ${destination}`);
  }, [decisions, discardedCount, keptCount, playlist.failed, playlist.title, totalVideos, videos]);

  const exportSelection = useCallback(async (format) => {
    if (!reviewComplete || exportState.status === "exporting") return;
    const entries = buildExportEntries(videos, decisions, notes, deepDives);
    const exportedAt = new Date().toISOString();
    const receiptId = `${playlist.id}-${Date.now()}`;
    const exportSlug = slugifyFilename(playlist.title.split("—")[0].trim());
    setExportState({ status: "exporting", message: "Préparation de l'export…" });

    try {
      if (format === "zip") {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        zip.file("README.md", buildReadme(playlist, entries, exportedAt));
        zip.file("manifest.json", JSON.stringify({ receiptId, exportedAt, playlist: playlist.title, keptCount: entries.length }, null, 2));
        const folder = zip.folder("videos");
        entries.forEach((video, index) => {
          const frontmatter = `---\ntitle: ${JSON.stringify(video.title)}\nurl: ${JSON.stringify(video.url)}\nvideo_id: ${video.videoId || video.id}\n---\n\n`;
          const noteSection = video.note.trim() ? `\n\n## Note personnelle\n\n${video.note.trim()}\n` : "\n";
          folder.file(`${String(index + 1).padStart(3, "0")}-${slugifyFilename(video.title)}.md`, frontmatter + video.fullSummary + noteSection + deepDiveMarkdown(video.deepDives));
        });
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        downloadBlob(blob, `${exportSlug}-${entries.length}-videos.zip`);
        completeExport({ destination: "ZIP Markdown", exportStatus: "Téléchargement lancé", receiptId, exportedAt });
        return;
      }

      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const document = new jsPDF({ unit: "mm", format: "a4" });
        const margin = 18;
        const pageHeight = 297;
        let y = 20;
        const writeLines = (text, { size = 10, gap = 5, bold = false } = {}) => {
          document.setFont("helvetica", bold ? "bold" : "normal");
          document.setFontSize(size);
          const lines = document.splitTextToSize(text, 210 - margin * 2);
          for (const line of lines) {
            if (y > pageHeight - 18) {
              document.addPage();
              y = 20;
            }
            document.text(line, margin, y);
            y += gap;
          }
        };
        writeLines(playlist.title, { size: 18, gap: 8, bold: true });
        writeLines(`${entries.length} vidéos gardées · ${new Date(exportedAt).toLocaleString("fr-FR")}`, { size: 10, gap: 7 });
        entries.forEach((video, index) => {
          if (y > pageHeight - 45) {
            document.addPage();
            y = 20;
          }
          writeLines(`${index + 1}. ${video.title}`, { size: 14, gap: 7, bold: true });
          writeLines(video.url, { size: 9, gap: 6 });
          writeLines(markdownToPlainText(video.fullSummary), { size: 9, gap: 4.7 });
          if (video.note.trim()) {
            y += 4;
            writeLines("Note personnelle", { size: 12, gap: 6, bold: true });
            writeLines(video.note.trim(), { size: 9, gap: 4.7 });
          }
          if (video.deepDives.length) {
            y += 4;
            writeLines("Approfondissements IA sauvegardés", { size: 12, gap: 6, bold: true });
            for (const item of video.deepDives) {
              writeLines(item.question || "Approfondissement", { size: 10, gap: 5, bold: true });
              writeLines(markdownToPlainText(item.answer), { size: 9, gap: 4.7 });
            }
          }
          y += 6;
        });
        document.save(`${exportSlug}-${entries.length}-videos.pdf`);
        completeExport({ destination: "PDF propre", exportStatus: "Téléchargement lancé", receiptId, exportedAt });
        return;
      }

      if (format === "maxi-brain") {
        const response = await fetch("/api/exports/maxi-brain", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            receiptId,
            exportedAt,
            playlist: playlist.title,
            entries: entries.map(({ id, videoId, title, url, fullSummary, sourceFile, note, deepDives: savedDeepDives }) => ({
              id: videoId || id,
              title,
              url,
              fullSummary,
              sourceFile,
              note,
              deepDives: savedDeepDives,
            })),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Maxi Brain n'a pas confirmé l'export.");
        completeExport({ destination: "Maxi Brain", exportStatus: "Reçu par l'inbox", receiptId: payload.receiptId || receiptId, exportedAt });
        return;
      }

      if (format === "none") {
        completeExport({ destination: "Aucun fichier", exportStatus: "Aucun contenu gardé", receiptId, exportedAt });
      }
    } catch (error) {
      setExportState({ status: "error", message: error instanceof Error ? error.message : "L'export a échoué." });
    }
  }, [completeExport, decisions, deepDives, exportState.status, notes, playlist, reviewComplete, videos]);

  const deleteHistoryEntry = useCallback((entryId) => {
    setHistoryEntries((current) => current.filter((entry) => entry.id !== entryId));
    setSelectedHistoryId(null);
    setAnnouncement("Entrée retirée de l'historique. Les fichiers exportés restent intacts.");
  }, []);

  const submitSource = async (event) => {
    event.preventDefault();
    if (!sourceUrl.trim()) return;
    setSourceState("processing");
    setSourceError("");
    try {
      const response = await fetch("/api/youtube/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url: sourceUrl.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "La playlist ne peut pas être analysée.");
      applyJobUpdate(payload);
    } catch (error) {
      setSourceState("error");
      setSourceError(error instanceof Error ? error.message : "La playlist ne peut pas être analysée.");
    }
  };

  return (
    <div className="app-shell">
      <div ref={ambientBackgroundRef} className="ambient-background" aria-hidden="true">
        <img className="ambient-ribbon ambient-ribbon-primary" src={pearlRibbonsBackground} alt="" decoding="async" fetchPriority="low" draggable="false" />
        <img className="ambient-ribbon ambient-ribbon-secondary" src={pearlRibbonsBackground} alt="" decoding="async" fetchPriority="low" draggable="false" />
      </div>
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand-lockup">
          <span className="brand-mark"><VideoIcon aria-hidden="true" /></span>
          <div><strong>Transcript</strong><span>Fluid Knowledge</span></div>
        </div>
        <nav className="sidebar-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-label={label} data-active={section === id} onClick={() => setSection(id)}>
              <Icon width="20" height="20" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar-settings" type="button" aria-label="Clés API" onClick={() => setApiKeySettings({ open: true, reason: "settings" })}>
          <GearIcon width="20" height="20" aria-hidden="true" />
          <span>Clés API</span>
        </button>
        <div className="sidebar-progress">
          <div className="progress-copy"><span>{finalized ? "Playlist archivée" : playlist.jobStatus === "paused_quota" ? "Playlist en pause" : "Playlist active"}</span><strong>{currentPosition} / {totalVideos}</strong></div>
          <div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
          <p>{playlist.title}</p>
        </div>
      </aside>

      <header className="compact-header">
        <div className="brand-lockup">
          <span className="brand-mark"><VideoIcon aria-hidden="true" /></span>
          <div><strong>Transcript</strong><span>Fluid Knowledge</span></div>
        </div>
        <button className="icon-button" type="button" aria-label="Clés API" onClick={() => setApiKeySettings({ open: true, reason: "settings" })}>
          <GearIcon width="21" height="21" />
        </button>
      </header>

      <main className="workspace">
        {section === "review" ? (
          finalized ? (
            <FinalizedWorkspace onHistory={() => setSection("history")} onHome={() => setSection("home")} />
          ) : reviewComplete ? (
            <CompletionWorkspace
              keptCount={keptCount}
              discardedCount={discardedCount}
              totalVideos={totalVideos}
              maxiBrainAvailable={maxiBrainAvailable}
              exportState={exportState}
              onExport={exportSelection}
              onUndo={undo}
            />
          ) : waitingForCards ? (
            <WaitingWorkspace
              playlist={playlist}
              readyCount={videos.length}
              decidedCount={decidedCount}
              onHome={() => setSection("home")}
              onOpenApiKeys={() => setApiKeySettings({ open: true, reason: "quota" })}
              onReadCards={() => { setVideoIndex(0); setReviewingSavedCards(true); }}
            />
          ) : (
            <ReviewWorkspace
              activeVideo={activeVideo}
              videoIndex={videoIndex}
              activeDecision={decisions[videoIndex]}
              hasSavedNote={Boolean(notes[activeVideo.id]?.trim())}
              hasSavedDeepDive={Boolean(deepDives[activeVideo.id]?.length)}
              totalVideos={totalVideos}
              playlistTitle={playlist.title}
              sourceLabel={playlist.sourceLabel}
              progressPercent={progressPercent}
              x={x}
              rotate={rotate}
              scale={scale}
              keepTintOpacity={keepTintOpacity}
              discardTintOpacity={discardTintOpacity}
              reducedMotion={reducedMotion}
              isDeciding={isDeciding}
              lastDecision={lastDecision}
              onDragEnd={handleDragEnd}
              onDecide={decide}
              onUndo={undo}
              onOpenDetail={() => { setDetailTab("summary"); setDetailOpen(true); }}
            />
          )
        ) : section === "home" ? (
          <HomeWorkspace
            sourceUrl={sourceUrl}
            setSourceUrl={setSourceUrl}
            sourceState={sourceState}
            sourceJob={sourceJob}
            sourceError={sourceError}
            onSubmit={submitSource}
            onReview={() => { if (sourceJob) activateJob(sourceJob); }}
            onOpenApiKeys={() => setApiKeySettings({ open: true, reason: "quota" })}
          />
        ) : (
          <HistoryWorkspace
            activeEntry={activeHistoryEntry}
            entries={historyEntries}
            onOpen={setSelectedHistoryId}
            onReview={() => setSection("review")}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale mobile">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-label={label} data-active={section === id} onClick={() => setSection(id)}>
            <Icon width="22" height="22" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {detailOpen && activeVideo && !reviewComplete && !finalized ? (
        <DetailDialog
          video={activeVideo}
          tab={detailTab}
          setTab={setDetailTab}
          note={notes[activeVideo.id] || ""}
          onNoteChange={(value) => setNotes((current) => ({ ...current, [activeVideo.id]: value }))}
          savedDeepDives={deepDives[activeVideo.id] || EMPTY_DEEP_DIVES}
          onDeepDiveSaved={(entry) => setDeepDives((current) => ({
            ...current,
            [activeVideo.id]: [...(current[activeVideo.id] || []), entry].slice(-50),
          }))}
          saveState={sessionSaveState}
          geminiAvailable={geminiAvailable}
          geminiConfigured={apiKeys.geminiDeepDive}
          onOpenApiKeys={(reason = "first-use") => setApiKeySettings({ open: true, reason })}
          onQuotaReached={() => setQuotaDialogOpen(true)}
          onAnnounce={setAnnouncement}
          onClose={() => setDetailOpen(false)}
          onSwipeDecision={(decision) => {
            setDetailOpen(false);
            void decide(decision, { animateCard: false });
          }}
          isDeciding={isDeciding}
          reducedMotion={reducedMotion}
        />
      ) : null}

      {selectedHistory ? (
        <HistoryDetailDialog
          entry={selectedHistory}
          onClose={() => setSelectedHistoryId(null)}
          onReview={() => { setSelectedHistoryId(null); setSection("review"); }}
          onDelete={deleteHistoryEntry}
        />
      ) : null}

      {apiKeySettings.open ? (
        <ApiKeySettingsDialog
          reason={apiKeySettings.reason}
          configured={apiKeys}
          onConfigured={setApiKeys}
          onClose={() => setApiKeySettings({ open: false, reason: "settings" })}
        />
      ) : null}

      {quotaDialogOpen ? (
        <QuotaDialog
          onOpenSettings={() => {
            setQuotaDialogOpen(false);
            setApiKeySettings({ open: true, reason: "quota" });
          }}
          onClose={() => setQuotaDialogOpen(false)}
        />
      ) : null}

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}

function ReviewWorkspace({
  activeVideo,
  videoIndex,
  activeDecision,
  hasSavedNote,
  hasSavedDeepDive,
  totalVideos,
  playlistTitle,
  sourceLabel,
  progressPercent,
  x,
  rotate,
  scale,
  keepTintOpacity,
  discardTintOpacity,
  reducedMotion,
  isDeciding,
  lastDecision,
  onDragEnd,
  onDecide,
  onUndo,
  onOpenDetail,
}) {
  const blockThumbnailOpen = useRef(false);
  const sourceActions = Array.isArray(activeVideo.actions)
    ? activeVideo.actions.filter((action) => typeof action === "string" && action.trim()).slice(0, 3)
    : [];

  const handleCardDragEnd = (event, info) => {
    onDragEnd(event, info);
    window.setTimeout(() => {
      blockThumbnailOpen.current = false;
    }, 0);
  };

  const openDetailFromThumbnail = () => {
    if (!blockThumbnailOpen.current) onOpenDetail();
  };

  const openDetailFromCard = (event) => {
    if (blockThumbnailOpen.current || event.target.closest("button, a")) return;
    onOpenDetail();
  };

  const decideFromButton = (decision) => {
    void onDecide(decision);
  };

  return (
    <div className="review-page" data-testid="review-page" data-review-layout={REVIEW_LAYOUT_VARIANT}>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{sourceLabel} · {playlistTitle}</p>
          <h1>Review</h1>
          <p>Examine chaque vidéo dès qu'elle est prête.</p>
        </div>
        <div className="page-progress"><span>{videoIndex + 1} sur {totalVideos}</span><strong>{progressPercent}%</strong></div>
      </header>

      <div className="review-layout">
        <section className="review-column" aria-label="Vidéo à examiner">
          <div className="desktop-card-deck">
            <article className="desktop-review-card next-card" aria-hidden="true" />
            <motion.article
              key={activeVideo.id}
              className="desktop-review-card active-card"
              data-testid="active-review-card"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.42}
              dragMomentum={false}
              onDragStart={() => {
                blockThumbnailOpen.current = true;
              }}
              onDragEnd={handleCardDragEnd}
              onClick={openDetailFromCard}
              style={{ x, rotate: reducedMotion ? 0 : rotate, scale }}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              whileTap={reducedMotion ? undefined : { scale: 0.994 }}
              aria-label={`${activeVideo.title}. Glisser à droite pour garder, à gauche pour écarter.`}
            >
              <VideoThumbnail video={activeVideo} onOpen={openDetailFromThumbnail} />
              <div className="card-copy">
                <div className="source-line"><SiYoutube className="source-logo" aria-hidden="true" /><span>{activeVideo.source}</span></div>
                {activeDecision || hasSavedNote || hasSavedDeepDive ? (
                  <div className="review-memory" aria-label="Mémoire sauvegardée pour cette vidéo">
                    {activeDecision === "keep" ? <span data-kind="keep"><CheckCircledIcon aria-hidden="true" /> Gardée</span> : null}
                    {activeDecision === "discard" ? <span data-kind="discard"><CrossCircledIcon aria-hidden="true" /> Écartée</span> : null}
                    {hasSavedNote ? <span><FileTextIcon aria-hidden="true" /> Note enregistrée</span> : null}
                    {hasSavedDeepDive ? <span><SiGooglegemini aria-hidden="true" /> IA enregistrée</span> : null}
                  </div>
                ) : null}
                <h2>{activeVideo.title}</h2>
                <p>{activeVideo.summary}</p>
                <button className="detail-link" type="button" onClick={onOpenDetail}>
                  <ExternalLinkIcon width="18" height="18" aria-hidden="true" />
                  Ouvrir la fiche
                  <ChevronRightIcon width="19" height="19" aria-hidden="true" />
                </button>
              </div>
              <motion.div
                className="card-swipe-layer discard-swipe-layer"
                data-testid="discard-swipe-layer"
                style={{ opacity: discardTintOpacity }}
                aria-hidden="true"
              />
              <motion.div
                className="card-swipe-layer keep-swipe-layer"
                data-testid="keep-swipe-layer"
                style={{ opacity: keepTintOpacity }}
                aria-hidden="true"
              />
            </motion.article>
          </div>

          <div className="decision-row" aria-label="Décider pour cette vidéo">
            <button
              className="decision-button discard-button"
              type="button"
              onClick={() => decideFromButton("discard")}
              disabled={isDeciding}
            >
              Écarter
            </button>
            <button className="undo-button" type="button" onClick={onUndo} disabled={!lastDecision || isDeciding}>
              <ReloadIcon aria-hidden="true" /> Annuler
            </button>
            <button
              className="decision-button keep-button"
              type="button"
              onClick={() => decideFromButton("keep")}
              disabled={isDeciding}
            >
              Garder
            </button>
          </div>
        </section>

        <aside className="context-panel" aria-label="Contexte de la vidéo">
          <section>
            <div className="panel-heading"><BookmarkIcon aria-hidden="true" /><h2>À retenir</h2></div>
            <ul>{activeVideo.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </section>
          <section className="source-actions-panel">
            <div className="panel-heading"><LightningBoltIcon aria-hidden="true" /><h2>Actions possibles</h2></div>
            {sourceActions.length ? (
              <ul className="source-action-list">{sourceActions.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ul>
            ) : (
              <p className="empty-source-actions">Aucune action explicite dans cette fiche.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function HomeWorkspace({ sourceUrl, setSourceUrl, sourceState, sourceJob, sourceError, onSubmit, onReview, onOpenApiKeys }) {
  const readyCount = sourceJob?.cards?.length || 0;
  const total = sourceJob?.total || 0;
  const batchLabel = sourceJob?.currentBatch && sourceJob?.totalBatches
    ? ` Lot ${sourceJob.currentBatch}/${sourceJob.totalBatches} · vidéos ${sourceJob.batchStart}–${sourceJob.batchEnd}.`
    : "";
  return (
    <div className="simple-page" data-testid="home-page">
      <header className="page-heading"><div><p className="eyebrow">Nouvelle source</p><h1>Commencer</h1><p>Ajoute une vidéo ou une playlist YouTube.</p></div></header>
      <form className="source-form" onSubmit={onSubmit}>
        <label htmlFor="source-url">URL YouTube</label>
        <div className="source-input-wrap"><MagnifyingGlassIcon aria-hidden="true" /><input id="source-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://youtube.com/playlist?list=…" /><button type="submit" disabled={sourceState === "processing"}>Analyser</button></div>
        <p className="source-help">Toutes les vidéos sont prises en charge : aucune limite artificielle n'est appliquée.</p>
        {sourceState === "processing" ? <p className="form-status" role="status">{total ? `${readyCount} résumé${readyCount > 1 ? "s" : ""} prêt${readyCount > 1 ? "s" : ""} sur ${total}.${batchLabel} Le traitement continue en arrière-plan.` : "Détection de la source…"}</p> : null}
        {sourceState === "ready" ? <div className="ready-state"><CheckIcon aria-hidden="true" /><div><strong>{sourceJob?.status === "completed" ? "Playlist prête" : "Premières cartes prêtes"}</strong><span>{readyCount} résumé{readyCount > 1 ? "s" : ""} disponible{readyCount > 1 ? "s" : ""}{total ? ` sur ${total}` : ""}. Le reste continue automatiquement.</span></div><button type="button" onClick={onReview}>Ouvrir Review</button></div> : null}
        {sourceState === "paused" ? <div className="ready-state quota-ready-state"><ExclamationTriangleIcon aria-hidden="true" /><div><strong>Traitement en pause</strong><span>{readyCount} carte{readyCount > 1 ? "s" : ""} reste{readyCount > 1 ? "nt" : ""} lisible{readyCount > 1 ? "s" : ""}. Une reprise automatique est programmée.</span></div><div className="ready-actions">{readyCount ? <button type="button" onClick={onReview}>Lire les cartes</button> : null}<button type="button" onClick={onOpenApiKeys}>Clé de secours</button></div></div> : null}
        {sourceState === "error" ? <p className="form-error" role="alert"><ExclamationTriangleIcon aria-hidden="true" /> {sourceError}</p> : null}
      </form>
    </div>
  );
}

function WaitingWorkspace({ playlist, readyCount, decidedCount, onHome, onOpenApiKeys, onReadCards }) {
  const paused = playlist.jobStatus === "paused_quota";
  return (
    <div className="completion-page waiting-page" data-testid="waiting-page">
      <section className="completion-card waiting-card">
        <span className={`completion-mark ${paused ? "warning-mark" : ""}`}>{paused ? <ExclamationTriangleIcon width="28" height="28" aria-hidden="true" /> : <ReloadIcon width="28" height="28" aria-hidden="true" />}</span>
        <p className="eyebrow">{paused ? "Quota API atteint" : "Traitement en arrière-plan"}</p>
        <h1>{paused ? "Les cartes restent disponibles" : "Les prochaines cartes arrivent"}</h1>
        <p>{readyCount ? `${decidedCount} carte${decidedCount > 1 ? "s" : ""} déjà enregistrée${decidedCount > 1 ? "s" : ""}. ` : ""}{paused ? "Le job reprendra automatiquement quand la clé sera de nouveau utilisable, ou immédiatement après l'ajout d'une clé de secours." : "Tu peux quitter cet écran : le job et les sauvegardes continuent localement."}</p>
        <div className="dialog-actions">{readyCount ? <button type="button" onClick={onReadCards}>Relire les cartes</button> : <button type="button" onClick={onHome}>Nouvelle source</button>}{paused ? <button className="primary-dialog-action" type="button" onClick={onOpenApiKeys}>Ajouter une clé de secours</button> : null}</div>
      </section>
    </div>
  );
}

function CompletionWorkspace({ keptCount, discardedCount, totalVideos, maxiBrainAvailable, exportState, onExport, onUndo }) {
  const exporting = exportState.status === "exporting";
  const noSelection = keptCount === 0;

  return (
    <div className="completion-page" data-testid="completion-page">
      <header className="page-heading completion-heading">
        <div><p className="eyebrow">Review terminée</p><h1>Choisir la sortie</h1><p>Les décisions sont enregistrées. Rien n'est nettoyé avant la confirmation de l'export.</p></div>
        <span className="completion-mark"><CheckCircledIcon width="30" height="30" aria-hidden="true" /></span>
      </header>

      <section className="completion-card" aria-labelledby="completion-title">
        <div className="completion-summary">
          <div><span>Vidéos traitées</span><strong>{totalVideos}</strong></div>
          <div><span>Gardées</span><strong className="positive-number">{keptCount}</strong></div>
          <div><span>Écartées</span><strong>{discardedCount}</strong></div>
        </div>

        <div className="completion-copy">
          <p className="eyebrow">Destination</p>
          <h2 id="completion-title">Que veux-tu recevoir ?</h2>
          <p>Le ZIP Markdown est le format portable recommandé. Le PDF est pensé pour la lecture et le partage.</p>
        </div>

        {noSelection ? (
          <div className="empty-selection">
            <ArchiveIcon width="24" height="24" aria-hidden="true" />
            <div><strong>Aucune vidéo gardée</strong><span>Tu peux terminer sans créer de fichier.</span></div>
            <button type="button" onClick={() => void onExport("none")} disabled={exporting}>Terminer sans export</button>
          </div>
        ) : (
          <div className="export-options">
            <button className="export-option primary-export" type="button" onClick={() => void onExport("zip")} disabled={exporting}>
              <span className="export-icon"><DownloadIcon width="22" height="22" aria-hidden="true" /></span>
              <span><strong>ZIP Markdown</strong><small>README, manifeste et un fichier par vidéo</small></span>
              <span className="recommended-chip">Recommandé</span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
            <button className="export-option" type="button" onClick={() => void onExport("pdf")} disabled={exporting}>
              <span className="export-icon"><ReaderIcon width="22" height="22" aria-hidden="true" /></span>
              <span><strong>PDF propre</strong><small>Un document lisible, prêt à partager</small></span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
            {maxiBrainAvailable ? (
              <button className="export-option owner-export" type="button" onClick={() => void onExport("maxi-brain")} disabled={exporting}>
                <span className="export-icon"><UploadIcon width="22" height="22" aria-hidden="true" /></span>
                <span><strong>Envoyer vers Maxi Brain</strong><small>Connecteur privé · inbox du vault</small></span>
                <span className="private-chip">Privé</span>
                <ChevronRightIcon aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}

        {exportState.status !== "idle" ? (
          <p className={`export-feedback ${exportState.status}`} role="status">
            {exportState.status === "error" ? <ExclamationTriangleIcon aria-hidden="true" /> : <ReloadIcon aria-hidden="true" />}
            {exportState.message}
          </p>
        ) : null}

        <button className="completion-undo" type="button" onClick={onUndo} disabled={exporting}>
          <ArrowLeftIcon aria-hidden="true" /> Revenir à la dernière vidéo
        </button>
      </section>
    </div>
  );
}

function FinalizedWorkspace({ onHistory, onHome }) {
  return (
    <div className="completion-page" data-testid="finalized-page">
      <section className="finalized-card">
        <span className="completion-mark"><CheckCircledIcon width="34" height="34" aria-hidden="true" /></span>
        <p className="eyebrow">Export confirmé</p>
        <h1>Playlist archivée</h1>
        <p>Le reçu est disponible dans History. Les fichiers exportés restent indépendants de l'entrée d'historique.</p>
        <div><button type="button" onClick={onHistory}>Ouvrir History</button><button type="button" onClick={onHome}>Nouvelle source</button></div>
      </section>
    </div>
  );
}

function VideoThumbnail({ video, onOpen }) {
  const thumbnailKey = `${video.id}:${video.thumbnail ?? ""}`;
  const [thumbnailState, setThumbnailState] = useState({ key: "", source: null, failed: false });
  const currentThumbnailState = thumbnailState.key === thumbnailKey
    ? thumbnailState
    : { source: video.thumbnail, failed: false };

  return (
    <button
      className="thumbnail-button"
      type="button"
      onClick={onOpen}
      aria-label={`Ouvrir la fiche de ${video.title}`}
      title="Ouvrir la fiche"
    >
      <div className="thumbnail-wrap">
        {currentThumbnailState.source && !currentThumbnailState.failed ? (
          <img
            className="thumbnail-main"
            src={currentThumbnailState.source}
            alt={`Miniature YouTube de ${video.title}`}
            draggable="false"
            onError={() => {
              const fallback = currentThumbnailState.source?.replace(/\/maxresdefault\.jpg$/i, "/hqdefault.jpg");
              if (fallback && fallback !== currentThumbnailState.source) {
                setThumbnailState({ key: thumbnailKey, source: fallback, failed: false });
              } else {
                setThumbnailState({ key: thumbnailKey, source: null, failed: true });
              }
            }}
          />
        ) : (
          <div className="thumbnail-unavailable" role="img" aria-label="Miniature YouTube indisponible">
            <VideoIcon width="30" height="30" aria-hidden="true" />
            <span>Miniature indisponible</span>
          </div>
        )}
        {video.duration ? <span className="duration">{video.duration}</span> : null}
      </div>
    </button>
  );
}

function HistoryWorkspace({ activeEntry, entries, onOpen, onReview }) {
  return (
    <div className="simple-page" data-testid="history-page">
      <header className="page-heading"><div><p className="eyebrow">Activité et reçus</p><h1>History</h1><p>Consulte les décisions et la destination de chaque export.</p></div></header>

      {activeEntry ? (
        <section className="history-section" aria-labelledby="active-history-title">
          <div className="history-section-heading"><div><p className="eyebrow">En cours</p><h2 id="active-history-title">Session active</h2></div><button type="button" onClick={onReview}>Reprendre Review</button></div>
          <HistoryTable entries={[activeEntry]} onOpen={onOpen} />
        </section>
      ) : null}

      <section className="history-section" aria-labelledby="finished-history-title">
        <div className="history-section-heading"><div><p className="eyebrow">Exports confirmés</p><h2 id="finished-history-title">Terminés</h2></div><span>{entries.length}</span></div>
        {entries.length > 0 ? (
          <HistoryTable entries={entries} onOpen={onOpen} />
        ) : (
          <div className="history-empty"><ArchiveIcon width="26" height="26" aria-hidden="true" /><strong>Aucun export terminé</strong><span>La première entrée apparaîtra après la fin de Review.</span></div>
        )}
      </section>
    </div>
  );
}

function HistoryTable({ entries, onOpen }) {
  return (
    <div className="history-table" aria-label="Historique des traitements">
      <div className="history-head" aria-hidden="true"><span>Source</span><span>Vidéos</span><span>Gardées</span><span>Statut</span><span /></div>
      {entries.map((entry) => (
        <button className="history-item" type="button" key={entry.id} onClick={() => onOpen(entry.id)} aria-label={`Consulter ${entry.sourceTitle}`}>
          <div><VideoIcon aria-hidden="true" /><div><strong>{entry.sourceTitle}</strong><span>{entry.finishedAt ? new Date(entry.finishedAt).toLocaleString("fr-FR") : `${entry.videoCount - entry.decisions.filter((item) => item.decision).length} à examiner`}</span></div></div>
          <span>{entry.videoCount}</span>
          <span>{entry.keptCount}</span>
          <span className={`status-chip ${entry.active ? "active-status" : ""}`}>{entry.finalStatus}</span>
          <ChevronRightIcon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function HistoryDetailDialog({ entry, onClose, onReview, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const kept = entry.decisions.filter((item) => item.decision === "keep");
  const discarded = entry.decisions.filter((item) => item.decision === "discard");

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="detail-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-detail-title">
        <header><div><p className="eyebrow">{entry.active ? "Session active" : "Reçu d'export"}</p><h2 id="history-detail-title">{entry.sourceTitle}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><CrossCircledIcon width="23" height="23" /></button></header>

        <div className="history-detail-stats">
          <div><span>Total</span><strong>{entry.videoCount}</strong></div>
          <div><span>Gardées</span><strong>{entry.keptCount}</strong></div>
          <div><span>Écartées</span><strong>{entry.discardedCount}</strong></div>
          <div><span>Échec</span><strong>{entry.failedCount}</strong></div>
        </div>

        <dl className="history-receipt">
          <div><dt>Statut</dt><dd>{entry.finalStatus}</dd></div>
          <div><dt>Export</dt><dd>{entry.exportStatus}</dd></div>
          <div><dt>Destination</dt><dd>{entry.destination || "Pas encore choisie"}</dd></div>
          {entry.finishedAt ? <div><dt>Terminé le</dt><dd>{new Date(entry.finishedAt).toLocaleString("fr-FR")}</dd></div> : null}
        </dl>

        <div className="decision-audit">
          <section><h3>Gardées · {kept.length}</h3>{kept.length ? <ul>{kept.slice(0, 6).map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <p>Aucune vidéo gardée.</p>}</section>
          <section><h3>Écartées · {discarded.length}</h3>{discarded.length ? <ul>{discarded.slice(0, 6).map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <p>Aucune vidéo écartée.</p>}</section>
        </div>

        {entry.active ? (
          <button className="history-primary-action" type="button" onClick={onReview}>Reprendre Review</button>
        ) : confirmDelete ? (
          <div className="delete-confirmation" role="alert">
            <div><strong>Retirer cette entrée ?</strong><span>Les fichiers exportés, résumés et transcripts ne seront pas supprimés.</span></div>
            <div><button type="button" onClick={() => setConfirmDelete(false)}>Annuler</button><button className="danger-button" type="button" onClick={() => onDelete(entry.id)}>Retirer</button></div>
          </div>
        ) : (
          <button className="remove-history-action" type="button" onClick={() => setConfirmDelete(true)}><TrashIcon aria-hidden="true" /> Retirer de l'historique</button>
        )}
      </section>
    </div>
  );
}

function DetailDialog({
  video,
  tab,
  setTab,
  note,
  onNoteChange,
  savedDeepDives,
  onDeepDiveSaved,
  saveState,
  geminiAvailable,
  geminiConfigured,
  onOpenApiKeys,
  onQuotaReached,
  onAnnounce,
  onClose,
  onSwipeDecision,
  isDeciding,
  reducedMotion,
}) {
  const detailSwipe = useRef(null);
  const detailSwipeTimer = useRef(null);
  const detailScrollRef = useRef(null);
  const suppressDetailClick = useRef(false);
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const [question, setQuestion] = useState("");
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false);
  const [conversation, setConversation] = useState(savedDeepDives);
  const [aiState, setAiState] = useState({ status: "idle", error: "", pendingQuestion: "" });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [swipeDragging, setSwipeDragging] = useState(false);

  useEffect(() => {
    setSelectedExcerpt("");
    setQuestion("");
    setMobileNoteOpen(false);
    setAiState({ status: "idle", error: "", pendingQuestion: "" });
    detailSwipe.current = null;
    suppressDetailClick.current = false;
    setSwipeOffset(0);
    setSwipeDirection(null);
    setSwipeDragging(false);
  }, [video.id]);

  useEffect(() => () => window.clearTimeout(detailSwipeTimer.current), []);

  useEffect(() => {
    setConversation(savedDeepDives);
  }, [savedDeepDives]);

  const captureSelection = (event) => {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    if (!text || text.length < 8 || !selection?.anchorNode || !event.currentTarget.contains(selection.anchorNode)) return;
    setSelectedExcerpt(text.slice(0, 4_000));
    setMobileNoteOpen(true);
    onAnnounce("Passage sélectionné pour l'approfondissement.");
  };

  const promptForExternalChat = () => {
    const context = selectedExcerpt || conversation.at(-1)?.excerpt || video.summary;
    const userQuestion = question.trim() || (conversation.length
      ? "Poursuis cette conversation et indique ce qui mérite une vérification supplémentaire."
      : "Approfondis ce passage, explique les mécanismes et indique ce qui doit être vérifié.");
    const existingConversation = conversation
      .slice(-8)
      .map((entry, index) => `Tour ${index + 1}\nUtilisateur : ${entry.question}\n${entry.model || "Gemini"} : ${entry.answer}`)
      .join("\n\n")
      .slice(0, 12_000);
    const conversationContext = existingConversation
      ? `\n\nConversation déjà menée avec Gemini :\n${existingConversation}\n\nReprends cette conversation, vérifie sa logique, complète ce qui manque et signale clairement tout désaccord.`
      : "";
    return `Je travaille sur cette vidéo : ${video.title}\nSource : ${video.url}\n\nPassage de référence :\n${context}\n\nNouvelle question :\n${userQuestion}${conversationContext}\n\nRéponds en séparant les faits présents dans la source, les éléments issus de la conversation IA, tes propres inférences et les points qui nécessitent une vérification externe.`;
  };

  const askGemini = async (event) => {
    event?.preventDefault();
    if (!geminiAvailable || aiState.status === "loading") return;
    if (!geminiConfigured) {
      onOpenApiKeys("first-use");
      return;
    }
    const nextQuestion = question.trim() || (conversation.length
      ? "Peux-tu préciser le point précédent et indiquer comment le vérifier ?"
      : "Approfondis ce passage, explique les mécanismes et indique ce qui doit être vérifié.");
    const excerpt = selectedExcerpt || conversation.at(-1)?.excerpt || video.summary;
    const history = conversation.slice(-10).flatMap((entry) => [
      { role: "user", content: entry.question },
      { role: "assistant", content: entry.answer },
    ]);
    setAiState({ status: "loading", error: "", pendingQuestion: nextQuestion });
    try {
      const response = await fetch("/api/ai/deep-dive", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title: video.title,
          url: video.url,
          excerpt,
          summary: conversation.length ? video.summary.slice(0, 6_000) : video.fullSummary.slice(0, 40_000),
          question: nextQuestion,
          history,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.code === "GEMINI_KEY_REQUIRED") {
        onOpenApiKeys("first-use");
        setAiState({ status: "idle", error: "", pendingQuestion: "" });
        return;
      }
      if (payload.code === "GEMINI_QUOTA_EXHAUSTED") {
        onQuotaReached();
        setAiState({ status: "idle", error: "", pendingQuestion: "" });
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Gemini n'a pas pu répondre.");
      const savedEntry = {
        answer: payload.answer,
        model: payload.model || "Gemini",
        question: nextQuestion,
        excerpt,
        createdAt: new Date().toISOString(),
        turn: conversation.length + 1,
      };
      setConversation((current) => [...current, savedEntry].slice(-50));
      onDeepDiveSaved(savedEntry);
      setQuestion("");
      setAiState({ status: "success", error: "", pendingQuestion: "" });
      onAnnounce("Réponse Gemini ajoutée à la conversation et sauvegardée automatiquement.");
    } catch (error) {
      setAiState({
        status: "error",
        error: error instanceof Error ? error.message : "Gemini est indisponible.",
        pendingQuestion: nextQuestion,
      });
    }
  };

  const openChatGpt = async () => {
    const prompt = promptForExternalChat();
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      onAnnounce("Prompt copié. Colle-le dans ChatGPT.");
    } catch {
      onAnnounce("ChatGPT est ouvert. La copie automatique du prompt a échoué.");
    }
  };

  const addAiToNote = (entry) => {
    if (!entry?.answer) return;
    const quote = entry.excerpt ? `> ${entry.excerpt.replace(/\n/g, "\n> ")}\n\n` : "";
    const block = `## Approfondissement IA\n\n**Question :** ${entry.question}\n\n${quote}${entry.answer}\n\n_Source : ${entry.model || "Gemini"} · à vérifier avant usage._`;
    onNoteChange([note.trim(), block].filter(Boolean).join("\n\n"));
    onAnnounce("Réponse IA ajoutée à la Note.");
  };

  const copyAiAnswer = async (answer) => {
    try {
      await navigator.clipboard.writeText(answer);
      onAnnounce("Réponse IA copiée.");
    } catch {
      onAnnounce("La copie de la réponse IA a échoué.");
    }
  };

  const commitDetailDecision = useCallback((decision) => {
    if (isDeciding || detailSwipeTimer.current) return;
    detailSwipe.current = null;
    setSwipeDragging(false);
    setSwipeDirection(decision);
    setSwipeOffset((decision === "keep" ? 1 : -1) * Math.min(window.innerWidth * 0.72, 760));
    onAnnounce(`${video.title} — ${decision === "keep" ? "gardée" : "écartée"} depuis la fiche.`);
    detailSwipeTimer.current = window.setTimeout(() => {
      detailSwipeTimer.current = null;
      onSwipeDecision(decision);
      setSwipeOffset(0);
      setSwipeDirection(null);
    }, reducedMotion ? 0 : 300);
  }, [isDeciding, onAnnounce, onSwipeDecision, reducedMotion, video.title]);

  useEffect(() => {
    const handleDetailKeyDown = (event) => {
      if (isDeciding || detailSwipeTimer.current) return;
      const interactiveTarget = event.target instanceof Element
        && event.target.closest("button, a, input, textarea, select, [contenteditable='true']");
      if (interactiveTarget) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        detailScrollRef.current?.scrollBy({
          top: event.key === "ArrowDown" ? 72 : -72,
          behavior: reducedMotion ? "auto" : "smooth",
        });
        return;
      }
      if (event.repeat) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        commitDetailDecision(event.key === "ArrowRight" ? "keep" : "discard");
      }
    };
    window.addEventListener("keydown", handleDetailKeyDown);
    return () => window.removeEventListener("keydown", handleDetailKeyDown);
  }, [commitDetailDecision, isDeciding, reducedMotion]);

  const startDetailSwipe = (event) => {
    if (isDeciding || detailSwipeTimer.current || !event.isPrimary || event.button > 0) return;
    const selection = window.getSelection();
    const pointerTarget = event.target instanceof Element ? event.target : null;
    const selectionTarget = pointerTarget && !pointerTarget.closest(".reading-dialog-scroll > header")
      ? pointerTarget.closest("input, textarea, [contenteditable='true'], .selectable-summary, .transcript-placeholder, .chat-message, .selected-excerpt, p, li, blockquote, pre, code, h1, h2, h3, h4, td, th")
      : null;
    suppressDetailClick.current = false;
    detailSwipe.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      selectionTarget,
      initialSelection: selection?.toString() || "",
      initialInputSelection: selectionTarget instanceof HTMLInputElement || selectionTarget instanceof HTMLTextAreaElement
        ? `${selectionTarget.selectionStart}:${selectionTarget.selectionEnd}`
        : null,
      lock: "pending",
    };
  };

  const selectionChangedDuringGesture = (swipe, root) => {
    const target = swipe.selectionTarget;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return `${target.selectionStart}:${target.selectionEnd}` !== swipe.initialInputSelection
        && target.selectionStart !== target.selectionEnd;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
    const selectionInsideDialog = root.contains(selection.anchorNode)
      || (selection.focusNode ? root.contains(selection.focusNode) : false);
    return selectionInsideDialog && selection.toString() !== swipe.initialSelection;
  };

  const lockDetailSelection = () => {
    const swipe = detailSwipe.current;
    if (!swipe || swipe.lock === "horizontal") return;
    swipe.lock = "selection";
    suppressDetailClick.current = false;
    setSwipeOffset(0);
    setSwipeDirection(null);
    setSwipeDragging(false);
  };

  const noteDetailSelectionStart = () => {
    const swipe = detailSwipe.current;
    if (!swipe || swipe.lock === "horizontal") return;
    swipe.selectionStarted = true;
  };

  const moveDetailSwipe = (event) => {
    const swipe = detailSwipe.current;
    if (!swipe || swipe.pointerId !== event.pointerId || swipe.lock === "vertical" || swipe.lock === "selection") return;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (swipe.lock === "pending") {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 10) return;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);
      if (absoluteY >= absoluteX * 1.12) {
        swipe.lock = "vertical";
        return;
      }

      const elapsed = Math.max(performance.now() - swipe.startedAt, 1);
      const horizontalIntent = absoluteX > absoluteY * 1.35;
      const averageVelocity = absoluteX / elapsed;
      const fastTextFlick = swipe.pointerType === "touch"
        ? horizontalIntent && absoluteX >= 18 && elapsed <= 260
        : horizontalIntent && absoluteX >= 34 && elapsed <= 180 && averageVelocity >= 0.62;

      if (swipe.selectionTarget && !fastTextFlick) {
        if (swipe.selectionStarted || selectionChangedDuringGesture(swipe, event.currentTarget)) {
          lockDetailSelection();
          return;
        }
        if (elapsed < 180 || absoluteX < 52) return;
        if (!horizontalIntent) return;
      }

      swipe.lock = "horizontal";
      suppressDetailClick.current = true;
      window.getSelection()?.removeAllRanges();
      setSwipeDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    const maximum = Math.min(window.innerWidth * 0.42, 320);
    setSwipeOffset(Math.max(-maximum, Math.min(maximum, deltaX)));
    setSwipeDirection(deltaX > 0 ? "keep" : "discard");
  };

  const finishDetailSwipe = (event) => {
    const swipe = detailSwipe.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    detailSwipe.current = null;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const threshold = Math.min(120, window.innerWidth * 0.22);
    const shouldDecide = swipe.lock === "horizontal"
      && Math.abs(deltaX) >= threshold
      && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    setSwipeDragging(false);

    if (!shouldDecide) {
      setSwipeOffset(0);
      setSwipeDirection(null);
      return;
    }

    commitDetailDecision(deltaX > 0 ? "keep" : "discard");
  };

  const cancelDetailSwipe = () => {
    detailSwipe.current = null;
    suppressDetailClick.current = false;
    setSwipeOffset(0);
    setSwipeDirection(null);
    setSwipeDragging(false);
  };

  const suppressClickAfterDetailSwipe = (event) => {
    if (!suppressDetailClick.current) return;
    suppressDetailClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const swipeRotation = Math.max(-7, Math.min(7, swipeOffset / 20));
  const swipeTintOpacity = Math.min(0.72, Math.abs(swipeOffset) / 320 * 0.72);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section
        className="detail-dialog reading-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        data-swiping={swipeDragging}
        data-swipe-direction={swipeDirection || undefined}
        style={{
          "--detail-swipe-x": `${swipeOffset}px`,
          "--detail-swipe-rotate": `${swipeRotation}deg`,
        }}
        onPointerDown={startDetailSwipe}
        onPointerMove={moveDetailSwipe}
        onPointerUp={finishDetailSwipe}
        onPointerCancel={cancelDetailSwipe}
        onSelectStart={noteDetailSelectionStart}
        onClickCapture={suppressClickAfterDetailSwipe}
      >
        <div
          className={`detail-swipe-layer${swipeDirection ? ` ${swipeDirection}` : ""}`}
          style={{ opacity: swipeTintOpacity }}
          aria-hidden="true"
        />
        <div className="reading-dialog-scroll" ref={detailScrollRef}>
          <header><div><p className="eyebrow">Fiche vidéo</p><h2 id="detail-title">{video.title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><CrossCircledIcon width="23" height="23" /></button></header>
          <div className="reading-layout">
            <div className="reading-main">
              <div className="detail-tabs" role="tablist" aria-label="Contenu de la vidéo">
                {[{ id: "summary", label: "Résumé complet" }, { id: "transcript", label: "Transcript" }].map((item) => (
                  <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>
                ))}
              </div>
              <div className="detail-content" role="tabpanel">
                {tab === "summary" ? (
                  <article className="long-summary selectable-summary" onMouseUp={captureSelection} onKeyUp={captureSelection}>
                    <div className="summary-provenance"><FileTextIcon aria-hidden="true" /><span>Résumé long local · {video.sourceFile}</span></div>
                    <div className="selection-hint"><SiGooglegemini className="gemini-brand-icon" aria-hidden="true" /> Sélectionne un passage pour l'approfondir avec l'IA.</div>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{video.fullSummary}</ReactMarkdown>
                  </article>
                ) : null}
                {tab === "transcript" ? <><h3>Transcript</h3><p className="transcript-placeholder">L'extrait textuel n'est pas chargé dans ce prototype visuel. La version finale reprendra le transcript canonique local quand il est disponible.</p><a className="youtube-link" href={video.url} target="_blank" rel="noreferrer"><ExternalLinkIcon aria-hidden="true" /> Ouvrir la vidéo source</a></> : null}
              </div>
            </div>

            <button className="mobile-note-toggle" type="button" onClick={() => setMobileNoteOpen(true)}><ChatBubbleIcon aria-hidden="true" /> Note & IA{note.trim() ? <span /> : null}</button>
            <NoteAssistantPanel
              note={note}
              onNoteChange={onNoteChange}
              saveState={saveState}
              selectedExcerpt={selectedExcerpt}
              onClearSelection={() => setSelectedExcerpt("")}
              question={question}
              onQuestionChange={setQuestion}
              aiState={aiState}
              conversation={conversation}
              geminiAvailable={geminiAvailable}
              geminiConfigured={geminiConfigured}
              onAskGemini={askGemini}
              onOpenChatGpt={() => void openChatGpt()}
              onAddAiToNote={addAiToNote}
              onCopyAi={(answer) => void copyAiAnswer(answer)}
              mobileOpen={mobileNoteOpen}
              onMobileClose={() => setMobileNoteOpen(false)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function NoteAssistantPanel({
  note,
  onNoteChange,
  saveState,
  selectedExcerpt,
  onClearSelection,
  question,
  onQuestionChange,
  aiState,
  conversation,
  geminiAvailable,
  geminiConfigured,
  onAskGemini,
  onOpenChatGpt,
  onAddAiToNote,
  onCopyAi,
  mobileOpen,
  onMobileClose,
}) {
  return (
    <aside className="note-assistant-panel" data-mobile-open={mobileOpen} aria-label="Note et approfondissement IA">
      <header className="note-panel-header">
        <div><p className="eyebrow">Espace de travail</p><h3>Note & IA</h3></div>
        <button className="mobile-note-close" type="button" onClick={onMobileClose} aria-label="Fermer la Note"><Cross1Icon aria-hidden="true" /></button>
      </header>

      <label className="note-field-label" htmlFor="video-note">Note personnelle</label>
      <textarea id="video-note" aria-label="Note personnelle" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Copie un passage, ajoute une idée ou prépare une question…" />
      <p className={`save-state ${saveState}`}>
        {saveState === "saving" ? <ReloadIcon className="save-state-icon" aria-hidden="true" /> : <CheckCircledIcon className="save-state-icon" aria-hidden="true" />}
        {saveState === "saving" ? "Synchronisation automatique…" : saveState === "saved" ? "Enregistré automatiquement" : "Enregistré sur cet appareil"}
      </p>

      <div className="ai-divider"><span className="ai-divider-label"><ChatBubbleIcon aria-hidden="true" /> Conversation IA</span><small>{conversation.length} échange{conversation.length > 1 ? "s" : ""}</small></div>
      {selectedExcerpt ? (
        <blockquote className="selected-excerpt"><button type="button" onClick={onClearSelection} aria-label="Effacer la sélection"><Cross1Icon aria-hidden="true" /></button>{selectedExcerpt}</blockquote>
      ) : (
        <p className="ai-context-empty">{conversation.length ? "La prochaine question conserve le contexte des échanges précédents." : "Aucun passage sélectionné : l’IA utilisera le résumé courant comme contexte."}</p>
      )}

      <div className="ai-conversation" role="log" aria-label="Conversation avec Gemini" aria-live="polite">
        {conversation.length === 0 && aiState.status !== "loading" ? (
          <div className="conversation-empty"><span className="gemini-empty-mark"><SiGooglegemini className="gemini-brand-icon" aria-hidden="true" /></span><p>Pose une première question, puis poursuis naturellement avec des questions complémentaires.</p></div>
        ) : null}
        {conversation.map((entry, index) => (
          <div className="chat-turn" key={`${entry.createdAt || index}-${index}`}>
            <div className="chat-message user-message"><span>Vous</span><p>{entry.question}</p></div>
            <article className="chat-message assistant-message">
              <header><span><SiGooglegemini className="gemini-brand-icon" aria-hidden="true" /> Gemini</span><small>{entry.model || "Gemini"}</small></header>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.answer}</ReactMarkdown>
              <footer>
                <button type="button" onClick={() => onAddAiToNote(entry)}><PlusIcon aria-hidden="true" /> Ajouter à la Note</button>
                <button type="button" onClick={() => onCopyAi(entry.answer)}><CopyIcon aria-hidden="true" /> Copier</button>
              </footer>
            </article>
          </div>
        ))}
        {aiState.status === "loading" ? (
          <div className="chat-turn pending-turn">
            <div className="chat-message user-message"><span>Vous</span><p>{aiState.pendingQuestion}</p></div>
            <div className="chat-message assistant-message ai-typing" aria-label="Gemini rédige une réponse"><i /><i /><i /><span>Gemini analyse le contexte…</span></div>
          </div>
        ) : null}
      </div>

      {aiState.status === "error" ? <p className="ai-error" role="alert"><ExclamationTriangleIcon aria-hidden="true" /> {aiState.error} Tu peux réessayer sans perdre la conversation.</p> : null}

      <form className="ai-composer" onSubmit={onAskGemini}>
        <label className="note-field-label" htmlFor="deep-dive-question">Question</label>
        <textarea
          id="deep-dive-question"
          className="ai-question"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit();
          }}
          placeholder={conversation.length ? "Pose une question complémentaire…" : "Ex. Quelles affirmations faut-il vérifier ?"}
        />
        <div className="ai-actions">
          {geminiAvailable ? <button className="gemini-action" type="submit" disabled={aiState.status === "loading"}><SiGooglegemini className="gemini-brand-icon" aria-hidden="true" /> {aiState.status === "loading" ? "Analyse…" : geminiConfigured ? aiState.status === "error" ? "Réessayer" : "Envoyer à Gemini" : "Configurer Gemini"}</button> : null}
          <button className="chatgpt-action" type="button" onClick={onOpenChatGpt}><OpenInNewWindowIcon aria-hidden="true" /> Copier et ouvrir ChatGPT</button>
        </div>
      </form>
    </aside>
  );
}

function ApiKeySettingsDialog({ reason, configured, onConfigured, onClose }) {
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });
  const [securityInfo, setSecurityInfo] = useState({ storage: "unknown", legacyEnvironment: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/api-keys", { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled || !payload) return;
        onConfigured(payload.configured);
        setSecurityInfo({
          storage: payload.storage || "unknown",
          legacyEnvironment: Boolean(payload.legacyEnvironment),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [onConfigured]);

  const intro = reason === "first-use"
    ? "Transcript utilise Gemini dans cette version. Colle une clé Google AI Studio : elle sera chiffrée et synchronisée automatiquement."
    : reason === "quota"
      ? "Le quota Gemini courant est atteint. Colle une clé issue d'un autre projet Google : le job en pause reprendra automatiquement."
      : "Gemini est actif aujourd'hui. Le moteur Transcript est aussi compatible avec OpenAI (GPT) et Anthropic (Claude) ; ces choix apparaîtront ici lorsque leurs connecteurs Web seront activés.";

  const syncKey = useCallback(async (name, value) => {
    setSaveState({ status: "saving", message: "Synchronisation sécurisée…" });
    try {
      const response = await fetch("/api/settings/api-keys", {
        method: value === null ? "DELETE" : "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(value === null ? { name } : { keys: { [name]: value } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Synchronisation impossible.");
      onConfigured({
        geminiSummary: Boolean(payload.configured?.geminiSummary),
        geminiSummaryBackup: Boolean(payload.configured?.geminiSummaryBackup),
        geminiDeepDive: Boolean(payload.configured?.geminiDeepDive),
      });
      setSecurityInfo({
        storage: payload.storage || securityInfo.storage,
        legacyEnvironment: Boolean(payload.legacyEnvironment),
      });
      setSaveState({ status: "success", message: value === null ? "Clé retirée du coffre." : "Clé synchronisée dans le coffre." });
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synchronisation impossible.";
      setSaveState({ status: "error", message });
      throw new Error(message);
    }
  }, [onConfigured, securityInfo.storage]);

  const migrateLegacyKeys = async () => {
    setSaveState({ status: "saving", message: "Migration vers le coffre sécurisé…" });
    try {
      const response = await fetch("/api/settings/api-keys/migrate", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Migration impossible.");
      onConfigured(payload.configured);
      setSecurityInfo({
        storage: payload.storage || "unknown",
        legacyEnvironment: Boolean(payload.legacyEnvironment),
      });
      setSaveState({ status: "success", message: payload.migrated ? "Clés déplacées dans le Trousseau macOS." : "Aucune ancienne clé à migrer." });
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : "Migration impossible." });
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="detail-dialog api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
        <header>
          <div><p className="eyebrow">Paramètres</p><h2 id="api-key-title">Clés API</h2><p className="dialog-intro">{intro}</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><CrossCircledIcon width="23" height="23" /></button>
        </header>

        <div className="free-key-callout">
          <span className="provider-mark"><SiGooglegemini className="gemini-provider-logo" aria-hidden="true" /></span>
          <div><strong>Gemini est le fournisseur actif</strong><p>Google fournit des clés gratuites via AI Studio, avec un quota propre à chaque projet.</p></div>
          <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">Créer une clé <ExternalLinkIcon aria-hidden="true" /></a>
        </div>

        <div className="api-key-form">
          {securityInfo.legacyEnvironment ? (
            <div className="legacy-key-warning" role="status">
              <ExclamationTriangleIcon aria-hidden="true" />
              <div><strong>Ancienne clé détectée en clair</strong><p>Déplace-la dans le Trousseau macOS, puis retire-la automatiquement du fichier `.env`.</p></div>
              <button type="button" onClick={() => void migrateLegacyKeys()} disabled={saveState.status === "saving"}>Sécuriser maintenant</button>
            </div>
          ) : null}
          <ApiKeyField
            name="geminiSummary"
            id="gemini-summary-key"
            label="Résumés vidéo"
            description="Utilisée pour produire les résumés des vidéos et playlists."
            configured={configured.geminiSummary}
            onSync={syncKey}
          />
          <ApiKeyField
            name="geminiDeepDive"
            id="gemini-deep-dive-key"
            label="Approfondissements"
            description="Utilisée pour les questions posées depuis un passage sélectionné."
            configured={configured.geminiDeepDive}
            onSync={syncKey}
          />
          <ApiKeyField
            name="geminiSummaryBackup"
            id="gemini-summary-backup-key"
            label="Clé de secours · résumés"
            description="Essayée automatiquement si la clé principale atteint son quota. Le job reprend aussi après son renouvellement."
            configured={configured.geminiSummaryBackup}
            onSync={syncKey}
          />

          <div className="two-key-advice">
            <InfoCircledIcon aria-hidden="true" />
            <p><strong>Astuce quota :</strong> crée deux projets Google AI Studio distincts si tu veux séparer Résumés et Approfondissements. Deux clés du même projet partagent généralement le même quota.</p>
          </div>
          <div className="key-security-note"><LockClosedIcon aria-hidden="true" /><span>{securityInfo.storage === "macos-keychain" ? "Sur ce Mac, les clés sont chiffrées dans le Trousseau macOS." : "Les clés sont confiées au coffre de secrets du serveur."} Leur valeur n'est jamais renvoyée au navigateur, affichée dans les paramètres ou écrite dans les logs.</span></div>

          {saveState.status === "error" ? <p className="key-save-feedback error" role="alert">{saveState.message}</p> : null}
        </div>
      </section>
    </div>
  );
}

const MASKED_API_KEY = "••••••••••••";

function isValidApiKeyDraft(value) {
  return value.length >= 20 && value.length <= 512 && !/\s/.test(value);
}

function ApiKeyField({ name, id, label, description, configured, onSync }) {
  const [draft, setDraft] = useState(configured ? MASKED_API_KEY : "");
  const [dirty, setDirty] = useState(false);
  const [syncState, setSyncState] = useState(configured ? "saved" : "empty");
  const inFlightValue = useRef(null);

  useEffect(() => {
    if (dirty || inFlightValue.current !== null) return;
    setDraft(configured ? MASKED_API_KEY : "");
    setSyncState(configured ? "saved" : "empty");
  }, [configured, dirty]);

  const commitDraft = useCallback(async (candidate) => {
    const normalized = candidate.trim();
    if (normalized === MASKED_API_KEY || inFlightValue.current === normalized) return;
    if (normalized && !isValidApiKeyDraft(normalized)) {
      setSyncState("incomplete");
      return;
    }
    inFlightValue.current = normalized;
    setSyncState("saving");
    try {
      await onSync(name, normalized || null);
      setDraft(normalized ? MASKED_API_KEY : "");
      setDirty(false);
      setSyncState(normalized ? "saved" : "empty");
    } catch {
      setSyncState("error");
    } finally {
      if (inFlightValue.current === normalized) inFlightValue.current = null;
    }
  }, [name, onSync]);

  useEffect(() => {
    if (!dirty) return undefined;
    const normalized = draft.trim();
    if (normalized && normalized !== MASKED_API_KEY && !isValidApiKeyDraft(normalized)) {
      setSyncState("incomplete");
      return undefined;
    }
    setSyncState("pending");
    const timer = window.setTimeout(() => void commitDraft(draft), 700);
    return () => window.clearTimeout(timer);
  }, [commitDraft, dirty, draft]);

  const statusLabel = {
    empty: "Ajoute une clé",
    incomplete: "Saisie en cours",
    pending: "Synchronisation…",
    saving: "Synchronisation…",
    saved: "Synchronisée",
    error: "À vérifier",
  }[syncState];

  return (
    <section className="api-key-field">
      <div className="api-key-field-heading">
        <label htmlFor={id}>{label}</label>
        <p>{description}</p>
      </div>
      <div className="secret-input-wrap" data-sync-state={syncState}>
        <LockClosedIcon aria-hidden="true" />
        <input
          id={id}
          type="password"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setDirty(true); }}
          onFocus={(event) => { if (!dirty && configured) event.currentTarget.select(); }}
          onBlur={() => { if (dirty) void commitDraft(draft); }}
          placeholder="Coller la clé API"
          aria-describedby={`${id}-sync`}
          autoComplete="off"
          spellCheck="false"
        />
        <span className="api-key-sync-state" id={`${id}-sync`} data-state={syncState}>
          {syncState === "saved" ? <CheckIcon aria-hidden="true" /> : syncState === "saving" || syncState === "pending" ? <ReloadIcon aria-hidden="true" /> : null}
          {statusLabel}
        </span>
      </div>
      <small className="api-key-field-help">Colle une nouvelle clé pour la remplacer ; efface le champ pour la retirer. Aucun bouton Enregistrer n'est nécessaire.</small>
    </section>
  );
}

function QuotaDialog({ onOpenSettings, onClose }) {
  return (
    <div className="dialog-backdrop quota-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="detail-dialog quota-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quota-title">
        <span className="quota-icon"><ExclamationTriangleIcon width="26" height="26" aria-hidden="true" /></span>
        <p className="eyebrow">Usage maximal atteint</p>
        <h2 id="quota-title">Quota Gemini atteint</h2>
        <p>Le traitement des nouvelles vidéos est mis en pause, mais les cartes, notes et réponses IA déjà enregistrées restent lisibles. Le job réessaiera automatiquement, ou reprendra dès qu'une clé de secours est enregistrée.</p>
        <div className="dialog-actions"><button type="button" onClick={onClose}>Continuer à lire</button><button className="primary-dialog-action" type="button" onClick={onOpenSettings}>Ajouter une clé de secours</button></div>
      </section>
    </div>
  );
}
