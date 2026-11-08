import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArchiveIcon,
  CardStackIcon,
  CheckIcon,
  CheckCircledIcon,
  ChatBubbleIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  Cross1Icon,
  Cross2Icon,
  CrossCircledIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  KeyboardIcon,
  LockClosedIcon,
  MagicWandIcon,
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
import playlist32 from "./generated/playlist32.json";

const videos = playlist32;

const playlist = {
  title: "Playlist 32 — Synthèses YouTube",
  sourceLabel: `${videos.length} résumé${videos.length > 1 ? "s" : ""} structuré${videos.length > 1 ? "s" : ""}`,
};

const navigation = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "review", label: "Review", icon: CardStackIcon },
  { id: "history", label: "History", icon: ClockIcon },
];

const STORAGE_KEYS = {
  decisions: "fluid-knowledge-playlist-32-decisions",
  history: "fluid-knowledge-history",
  finalized: "fluid-knowledge-playlist-32-finalized",
  notes: "fluid-knowledge-playlist-32-notes",
};

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

function buildExportEntries(decisions, notes) {
  return videos
    .map((video, index) => ({ ...video, decision: decisions[index], note: notes[video.id] || "" }))
    .filter((video) => video.decision === "keep");
}

function buildReadme(entries, exportedAt) {
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

function loadDecisions() {
  const stored = readStoredValue(STORAGE_KEYS.decisions, []);
  if (!Array.isArray(stored) || stored.length !== videos.length) {
    return Array(videos.length).fill(null);
  }
  return stored.map((decision) => (decision === "keep" || decision === "discard" ? decision : null));
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
  const [section, setSection] = useState("review");
  const [decisions, setDecisions] = useState(loadDecisions);
  const [videoIndex, setVideoIndex] = useState(() => {
    const firstPending = loadDecisions().findIndex((decision) => !decision);
    return firstPending < 0 ? videos.length : firstPending;
  });
  const [lastDecision, setLastDecision] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("summary");
  const [isDeciding, setIsDeciding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceState, setSourceState] = useState("idle");
  const [historyEntries, setHistoryEntries] = useState(() => readStoredValue(STORAGE_KEYS.history, []));
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [finalized, setFinalized] = useState(() => readStoredValue(STORAGE_KEYS.finalized, false));
  const [maxiBrainAvailable, setMaxiBrainAvailable] = useState(false);
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [apiKeys, setApiKeys] = useState({ geminiSummary: false, geminiDeepDive: false });
  const [apiKeySettings, setApiKeySettings] = useState({ open: false, reason: "settings" });
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [notes, setNotes] = useState(() => readStoredValue(STORAGE_KEYS.notes, {}));
  const [exportState, setExportState] = useState({ status: "idle", message: "" });
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-140, 0, 140], [-7, 0, 7]);
  const keepOpacity = useTransform(x, [12, 62], [0, 1]);
  const discardOpacity = useTransform(x, [-62, -12], [1, 0]);
  const scale = useTransform(x, [-300, 0, 300], [0.985, 1, 0.985]);
  const decidedCount = decisions.filter(Boolean).length;
  const keptCount = decisions.filter((decision) => decision === "keep").length;
  const discardedCount = decisions.filter((decision) => decision === "discard").length;
  const reviewComplete = decidedCount === videos.length;
  const activeVideo = videos[Math.min(videoIndex, videos.length - 1)];
  const currentPosition = reviewComplete ? videos.length : Math.min(videoIndex + 1, videos.length);
  const progressPercent = reviewComplete ? 100 : Math.round((currentPosition / videos.length) * 100);
  const activeHistoryEntry = finalized ? null : {
    id: "active-playlist-32",
    sourceTitle: playlist.title,
    finishedAt: null,
    videoCount: videos.length,
    keptCount,
    discardedCount,
    failedCount: 0,
    finalStatus: reviewComplete ? "Prête à terminer" : "Review",
    exportStatus: "En attente",
    destination: null,
    decisions: videos.map((video, index) => ({ id: video.id, title: video.title, url: video.url, decision: decisions[index] })),
    active: true,
  };
  const selectedHistory = selectedHistoryId === activeHistoryEntry?.id
    ? activeHistoryEntry
    : historyEntries.find((entry) => entry.id === selectedHistoryId) ?? null;

  useEffect(() => saveStoredValue(STORAGE_KEYS.decisions, decisions), [decisions]);
  useEffect(() => saveStoredValue(STORAGE_KEYS.history, historyEntries), [historyEntries]);
  useEffect(() => saveStoredValue(STORAGE_KEYS.finalized, finalized), [finalized]);
  useEffect(() => saveStoredValue(STORAGE_KEYS.notes, notes), [notes]);

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
            geminiDeepDive: Boolean(capabilities?.apiKeys?.geminiDeepDive),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMaxiBrainAvailable(false);
          setGeminiAvailable(false);
          setApiKeys({ geminiSummary: false, geminiDeepDive: false });
        }
      });
    return () => { cancelled = true; };
  }, []);

  const returnCard = useCallback(() => {
    animate(
      x,
      0,
      reducedMotion
        ? { duration: 0.12 }
        : { type: "spring", stiffness: 420, damping: 36, mass: 0.74 },
    );
  }, [reducedMotion, x]);

  const decide = useCallback(async (decision) => {
    if (isDeciding || reviewComplete || finalized) return;
    setIsDeciding(true);
    const direction = decision === "keep" ? 1 : -1;

    await animate(
      x,
      direction * 920,
      reducedMotion
        ? { duration: 0.14 }
        : { type: "spring", bounce: 0.12, duration: 0.4 },
    );

    setDecisions((current) => {
      const next = [...current];
      next[videoIndex] = decision;
      return next;
    });
    setLastDecision({ index: videoIndex, decision });
    setAnnouncement(`${activeVideo.title} — ${decision === "keep" ? "gardée" : "écartée"}`);
    setVideoIndex((current) => Math.min(current + 1, videos.length));
    x.set(0);
    setIsDeciding(false);
  }, [activeVideo.title, finalized, isDeciding, reducedMotion, reviewComplete, videoIndex, x]);

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
      if (section !== "review" || detailOpen || selectedHistoryId || isDeciding || reviewComplete || finalized) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

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
  }, [decide, detailOpen, finalized, isDeciding, reviewComplete, section, selectedHistoryId, undo]);

  const completeExport = useCallback(({ destination, exportStatus, receiptId, exportedAt }) => {
    const entry = {
      id: receiptId,
      sourceTitle: playlist.title,
      finishedAt: exportedAt,
      videoCount: videos.length,
      keptCount,
      discardedCount,
      failedCount: 0,
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
  }, [decisions, discardedCount, keptCount]);

  const exportSelection = useCallback(async (format) => {
    if (!reviewComplete || exportState.status === "exporting") return;
    const entries = buildExportEntries(decisions, notes);
    const exportedAt = new Date().toISOString();
    const receiptId = `playlist-32-${Date.now()}`;
    setExportState({ status: "exporting", message: "Préparation de l'export…" });

    try {
      if (format === "zip") {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        zip.file("README.md", buildReadme(entries, exportedAt));
        zip.file("manifest.json", JSON.stringify({ receiptId, exportedAt, playlist: playlist.title, keptCount: entries.length }, null, 2));
        const folder = zip.folder("videos");
        entries.forEach((video, index) => {
          const frontmatter = `---\ntitle: ${JSON.stringify(video.title)}\nurl: ${JSON.stringify(video.url)}\nvideo_id: ${video.id}\n---\n\n`;
          const noteSection = video.note.trim() ? `\n\n## Note personnelle\n\n${video.note.trim()}\n` : "\n";
          folder.file(`${String(index + 1).padStart(3, "0")}-${slugifyFilename(video.title)}.md`, frontmatter + video.fullSummary + noteSection);
        });
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        downloadBlob(blob, `playlist-32-${entries.length}-videos.zip`);
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
          y += 6;
        });
        document.save(`playlist-32-${entries.length}-videos.pdf`);
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
            entries: entries.map(({ id, title, url, fullSummary, sourceFile, note }) => ({ id, title, url, fullSummary, sourceFile, note })),
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
  }, [completeExport, decisions, exportState.status, notes, reviewComplete]);

  const deleteHistoryEntry = useCallback((entryId) => {
    setHistoryEntries((current) => current.filter((entry) => entry.id !== entryId));
    setSelectedHistoryId(null);
    setAnnouncement("Entrée retirée de l'historique. Les fichiers exportés restent intacts.");
  }, []);

  const submitSource = (event) => {
    event.preventDefault();
    if (!sourceUrl.trim()) return;
    setSourceState("processing");
    window.setTimeout(() => setSourceState("ready"), 700);
  };

  return (
    <div className="app-shell">
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
          <div className="progress-copy"><span>{finalized ? "Playlist archivée" : "Playlist active"}</span><strong>{currentPosition} / {videos.length}</strong></div>
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
              totalVideos={videos.length}
              maxiBrainAvailable={maxiBrainAvailable}
              exportState={exportState}
              onExport={exportSelection}
              onUndo={undo}
            />
          ) : (
            <ReviewWorkspace
              activeVideo={activeVideo}
              videoIndex={videoIndex}
              totalVideos={videos.length}
              playlistTitle={playlist.title}
              sourceLabel={playlist.sourceLabel}
              progressPercent={progressPercent}
              x={x}
              rotate={rotate}
              scale={scale}
              keepOpacity={keepOpacity}
              discardOpacity={discardOpacity}
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
            onSubmit={submitSource}
            onReview={() => setSection("review")}
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

      {detailOpen && !reviewComplete && !finalized ? (
        <DetailDialog
          video={activeVideo}
          tab={detailTab}
          setTab={setDetailTab}
          note={notes[activeVideo.id] || ""}
          onNoteChange={(value) => setNotes((current) => ({ ...current, [activeVideo.id]: value }))}
          geminiAvailable={geminiAvailable}
          geminiConfigured={apiKeys.geminiDeepDive}
          onOpenApiKeys={(reason = "first-use") => setApiKeySettings({ open: true, reason })}
          onQuotaReached={() => setQuotaDialogOpen(true)}
          onAnnounce={setAnnouncement}
          onClose={() => setDetailOpen(false)}
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
  totalVideos,
  playlistTitle,
  sourceLabel,
  progressPercent,
  x,
  rotate,
  scale,
  keepOpacity,
  discardOpacity,
  reducedMotion,
  isDeciding,
  lastDecision,
  onDragEnd,
  onDecide,
  onUndo,
  onOpenDetail,
}) {
  return (
    <div className="review-page" data-testid="review-page">
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
            <motion.div className="desktop-underlay discard-underlay" style={{ opacity: discardOpacity }} aria-hidden="true">
              <Cross2Icon width="28" height="28" /><strong>Écarter</strong><span>Flèche gauche</span>
            </motion.div>
            <motion.div className="desktop-underlay keep-underlay" style={{ opacity: keepOpacity }} aria-hidden="true">
              <CheckIcon width="28" height="28" /><strong>Garder</strong><span>Flèche droite</span>
            </motion.div>

            <article className="desktop-review-card next-card" aria-hidden="true" />
            <motion.article
              key={activeVideo.id}
              className="desktop-review-card active-card"
              data-testid="active-review-card"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.42}
              dragMomentum={false}
              onDragEnd={onDragEnd}
              style={{ x, rotate: reducedMotion ? 0 : rotate, scale }}
              whileTap={reducedMotion ? undefined : { scale: 0.994 }}
              aria-label={`${activeVideo.title}. Glisser à droite pour garder, à gauche pour écarter.`}
            >
              <VideoThumbnail video={activeVideo} />
              <div className="card-copy">
                <div className="source-line"><span className="language-chip">YT</span><span>{activeVideo.source}</span></div>
                <h2>{activeVideo.title}</h2>
                <p>{activeVideo.summary}</p>
                <button className="detail-link" type="button" onClick={onOpenDetail}>
                  <ExternalLinkIcon width="18" height="18" aria-hidden="true" />
                  Ouvrir la fiche
                  <ChevronRightIcon width="19" height="19" aria-hidden="true" />
                </button>
              </div>
            </motion.article>
          </div>

          <div className="decision-row" aria-label="Décider pour cette vidéo">
            <button className="decision-button discard-button" type="button" onClick={() => void onDecide("discard")} disabled={isDeciding}>
              <ArrowLeftIcon aria-hidden="true" /> Écarter <kbd>←</kbd>
            </button>
            <button className="undo-button" type="button" onClick={onUndo} disabled={!lastDecision || isDeciding}>
              <ReloadIcon aria-hidden="true" /> Annuler
            </button>
            <button className="decision-button keep-button" type="button" onClick={() => void onDecide("keep")} disabled={isDeciding}>
              Garder <ArrowRightIcon aria-hidden="true" /> <kbd>→</kbd>
            </button>
          </div>
        </section>

        <aside className="context-panel" aria-label="Contexte de la vidéo">
          <section>
            <div className="panel-heading"><FileTextIcon aria-hidden="true" /><h2>À retenir</h2></div>
            <ul>{activeVideo.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </section>
          <section>
            <div className="panel-heading"><KeyboardIcon aria-hidden="true" /><h2>Raccourcis</h2></div>
            <dl className="shortcut-list"><div><dt>Écarter</dt><dd>←</dd></div><div><dt>Garder</dt><dd>→</dd></div><div><dt>Annuler</dt><dd>⌘ Z</dd></div></dl>
          </section>
          <section className="queue-section">
            <div className="panel-heading"><CardStackIcon aria-hidden="true" /><h2>Ensuite</h2></div>
            <p>{videos[(videoIndex + 1) % videos.length].title}</p>
            <span>Prête à examiner</span>
          </section>
        </aside>
      </div>
    </div>
  );
}

function HomeWorkspace({ sourceUrl, setSourceUrl, sourceState, onSubmit, onReview }) {
  return (
    <div className="simple-page" data-testid="home-page">
      <header className="page-heading"><div><p className="eyebrow">Nouvelle source</p><h1>Commencer</h1><p>Ajoute une vidéo ou une playlist YouTube.</p></div></header>
      <form className="source-form" onSubmit={onSubmit}>
        <label htmlFor="source-url">URL YouTube</label>
        <div className="source-input-wrap"><MagnifyingGlassIcon aria-hidden="true" /><input id="source-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://youtube.com/watch?v=…" /><button type="submit">Analyser</button></div>
        {sourceState === "processing" ? <p className="form-status">Détection de la source…</p> : null}
        {sourceState === "ready" ? <div className="ready-state"><CheckIcon aria-hidden="true" /><div><strong>Source prête</strong><span>La première vidéo peut être examinée.</span></div><button type="button" onClick={onReview}>Ouvrir Review</button></div> : null}
      </form>
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

function VideoThumbnail({ video }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [video.id, video.thumbnail]);

  return (
    <div className="thumbnail-wrap">
      {video.thumbnail && !failed ? (
        <>
          <img className="thumbnail-backdrop" src={video.thumbnail} alt="" aria-hidden="true" />
          <img
            className="thumbnail-main"
            src={video.thumbnail}
            alt={`Miniature YouTube de ${video.title}`}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <div className="thumbnail-unavailable" role="img" aria-label="Miniature YouTube indisponible">
          <VideoIcon width="30" height="30" aria-hidden="true" />
          <span>Miniature indisponible</span>
        </div>
      )}
      {video.duration ? <span className="duration">{video.duration}</span> : null}
    </div>
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
  geminiAvailable,
  geminiConfigured,
  onOpenApiKeys,
  onQuotaReached,
  onAnnounce,
  onClose,
}) {
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const [question, setQuestion] = useState("");
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false);
  const [aiState, setAiState] = useState({ status: "idle", answer: "", model: "", error: "" });

  useEffect(() => {
    setSelectedExcerpt("");
    setQuestion("");
    setMobileNoteOpen(false);
    setAiState({ status: "idle", answer: "", model: "", error: "" });
  }, [video.id]);

  const captureSelection = (event) => {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    if (!text || text.length < 8 || !selection?.anchorNode || !event.currentTarget.contains(selection.anchorNode)) return;
    setSelectedExcerpt(text.slice(0, 4_000));
    setMobileNoteOpen(true);
    onAnnounce("Passage sélectionné pour l'approfondissement.");
  };

  const promptForExternalChat = () => {
    const context = selectedExcerpt || video.summary;
    const userQuestion = question.trim() || "Approfondis ce passage, explique les mécanismes et indique ce qui doit être vérifié.";
    return `Je travaille sur cette vidéo : ${video.title}\nSource : ${video.url}\n\nPassage sélectionné :\n${context}\n\nQuestion :\n${userQuestion}\n\nRéponds en séparant les faits présents dans la source, tes inférences et les points qui nécessitent une vérification externe.`;
  };

  const askGemini = async () => {
    if (!geminiAvailable || aiState.status === "loading") return;
    if (!geminiConfigured) {
      onOpenApiKeys("first-use");
      return;
    }
    setAiState({ status: "loading", answer: "", model: "", error: "" });
    try {
      const response = await fetch("/api/ai/deep-dive", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title: video.title,
          url: video.url,
          excerpt: selectedExcerpt || video.summary,
          summary: video.fullSummary.slice(0, 40_000),
          question: question.trim() || "Approfondis ce passage, explique les mécanismes et indique ce qui doit être vérifié.",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.code === "GEMINI_KEY_REQUIRED") {
        onOpenApiKeys("first-use");
        setAiState({ status: "idle", answer: "", model: "", error: "" });
        return;
      }
      if (payload.code === "GEMINI_QUOTA_EXHAUSTED") {
        onQuotaReached();
        setAiState({ status: "idle", answer: "", model: "", error: "" });
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Gemini n'a pas pu répondre.");
      setAiState({ status: "success", answer: payload.answer, model: payload.model || "Gemini", error: "" });
      onAnnounce("Approfondissement Gemini disponible.");
    } catch (error) {
      setAiState({ status: "error", answer: "", model: "", error: error instanceof Error ? error.message : "Gemini est indisponible." });
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

  const addAiToNote = () => {
    if (!aiState.answer) return;
    const quote = selectedExcerpt ? `> ${selectedExcerpt.replace(/\n/g, "\n> ")}\n\n` : "";
    const block = `## Approfondissement IA\n\n${quote}${aiState.answer}\n\n_Source : ${aiState.model || "Gemini"} · à vérifier avant usage._`;
    onNoteChange([note.trim(), block].filter(Boolean).join("\n\n"));
    onAnnounce("Réponse IA ajoutée à la Note.");
  };

  const copyAiAnswer = async () => {
    try {
      await navigator.clipboard.writeText(aiState.answer);
      onAnnounce("Réponse IA copiée.");
    } catch {
      onAnnounce("La copie de la réponse IA a échoué.");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="detail-dialog reading-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
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
                  <div className="selection-hint"><MagicWandIcon aria-hidden="true" /> Sélectionne un passage pour l'approfondir avec l'IA.</div>
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
            selectedExcerpt={selectedExcerpt}
            onClearSelection={() => setSelectedExcerpt("")}
            question={question}
            onQuestionChange={setQuestion}
            aiState={aiState}
            geminiAvailable={geminiAvailable}
            geminiConfigured={geminiConfigured}
            onAskGemini={() => void askGemini()}
            onOpenChatGpt={() => void openChatGpt()}
            onAddAiToNote={addAiToNote}
            onCopyAi={() => void copyAiAnswer()}
            mobileOpen={mobileNoteOpen}
            onMobileClose={() => setMobileNoteOpen(false)}
          />
        </div>
      </section>
    </div>
  );
}

function NoteAssistantPanel({
  note,
  onNoteChange,
  selectedExcerpt,
  onClearSelection,
  question,
  onQuestionChange,
  aiState,
  geminiAvailable,
  geminiConfigured,
  onAskGemini,
  onOpenChatGpt,
  onAddAiToNote,
  onCopyAi,
  mobileOpen,
  onMobileClose,
}) {
  const [saveState, setSaveState] = useState("saved");

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => setSaveState("saved"), 350);
    return () => window.clearTimeout(timer);
  }, [note]);

  return (
    <aside className="note-assistant-panel" data-mobile-open={mobileOpen} aria-label="Note et approfondissement IA">
      <header className="note-panel-header">
        <div><p className="eyebrow">Espace de travail</p><h3>Note & IA</h3></div>
        <button className="mobile-note-close" type="button" onClick={onMobileClose} aria-label="Fermer la Note"><Cross1Icon aria-hidden="true" /></button>
      </header>

      <label className="note-field-label" htmlFor="video-note">Note personnelle</label>
      <textarea id="video-note" aria-label="Note personnelle" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Copie un passage, ajoute une idée ou prépare une question…" />
      <p className={`save-state ${saveState}`}><CheckIcon aria-hidden="true" /> {saveState === "saving" ? "Sauvegarde locale…" : "Enregistré localement"}</p>

      <div className="ai-divider"><span>Approfondir</span></div>
      {selectedExcerpt ? (
        <blockquote className="selected-excerpt"><button type="button" onClick={onClearSelection} aria-label="Effacer la sélection"><Cross1Icon aria-hidden="true" /></button>{selectedExcerpt}</blockquote>
      ) : (
        <p className="ai-context-empty">Aucun passage sélectionné : l’IA utilisera le résumé courant comme contexte.</p>
      )}

      <label className="note-field-label" htmlFor="deep-dive-question">Question</label>
      <textarea id="deep-dive-question" className="ai-question" value={question} onChange={(event) => onQuestionChange(event.target.value)} placeholder="Ex. Quelles affirmations faut-il vérifier ?" />

      <div className="ai-actions">
        {geminiAvailable ? <button className="gemini-action" type="button" onClick={onAskGemini} disabled={aiState.status === "loading"}><MagicWandIcon aria-hidden="true" /> {aiState.status === "loading" ? "Analyse…" : geminiConfigured ? "Approfondir avec Gemini" : "Configurer Gemini"}</button> : null}
        <button className="chatgpt-action" type="button" onClick={onOpenChatGpt}><OpenInNewWindowIcon aria-hidden="true" /> Copier et ouvrir ChatGPT</button>
      </div>

      {aiState.status === "error" ? <p className="ai-error" role="alert"><ExclamationTriangleIcon aria-hidden="true" /> {aiState.error}</p> : null}
      {aiState.answer ? (
        <article className="ai-answer">
          <div><span><MagicWandIcon aria-hidden="true" /> Réponse IA</span><small>{aiState.model}</small></div>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiState.answer}</ReactMarkdown>
          <footer><button type="button" onClick={onAddAiToNote}><PlusIcon aria-hidden="true" /> Ajouter à la Note</button><button type="button" onClick={onCopyAi}><CopyIcon aria-hidden="true" /> Copier</button></footer>
        </article>
      ) : null}
    </aside>
  );
}

function ApiKeySettingsDialog({ reason, configured, onConfigured, onClose }) {
  const [summaryKey, setSummaryKey] = useState("");
  const [deepDiveKey, setDeepDiveKey] = useState("");
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
    ? "Ajoute une clé pour utiliser Gemini. Cette étape n'apparaît pas lorsqu'une clé est déjà configurée."
    : reason === "quota"
      ? "Le quota courant est atteint. Tu peux remplacer une clé ou vérifier son projet Google."
      : "Gère ici les clés utilisées par les fonctions d'intelligence artificielle.";

  const saveKeys = async (event) => {
    event.preventDefault();
    setSaveState({ status: "saving", message: "Enregistrement sécurisé…" });
    try {
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          keys: {
            geminiSummary: summaryKey.trim(),
            geminiDeepDive: deepDiveKey.trim(),
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.");
      onConfigured({
        geminiSummary: Boolean(payload.configured?.geminiSummary),
        geminiDeepDive: Boolean(payload.configured?.geminiDeepDive),
      });
      setSecurityInfo({
        storage: payload.storage || securityInfo.storage,
        legacyEnvironment: Boolean(payload.legacyEnvironment),
      });
      setSummaryKey("");
      setDeepDiveKey("");
      setSaveState({ status: "success", message: "Clés enregistrées côté serveur." });
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : "Enregistrement impossible." });
    }
  };

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

  const removeKey = async (name) => {
    setSaveState({ status: "saving", message: "Retrait de la clé…" });
    try {
      const response = await fetch("/api/settings/api-keys", {
        method: "DELETE",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Retrait impossible.");
      onConfigured(payload.configured);
      setSecurityInfo({
        storage: payload.storage || securityInfo.storage,
        legacyEnvironment: Boolean(payload.legacyEnvironment),
      });
      setSaveState({ status: "success", message: "Clé retirée du coffre local." });
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : "Retrait impossible." });
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="detail-dialog api-key-dialog" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
        <header>
          <div><p className="eyebrow">Paramètres</p><h2 id="api-key-title">Clés API</h2><p className="dialog-intro">{intro}</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><CrossCircledIcon width="23" height="23" /></button>
        </header>

        <div className="free-key-callout">
          <span className="provider-mark"><MagicWandIcon width="19" height="19" aria-hidden="true" /></span>
          <div><strong>Google fournit des clés Gemini gratuites</strong><p>L'accès gratuit est soumis aux quotas du projet Google.</p></div>
          <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">Créer une clé <ExternalLinkIcon aria-hidden="true" /></a>
        </div>

        <form className="api-key-form" onSubmit={saveKeys}>
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
            value={summaryKey}
            onChange={setSummaryKey}
            onRemove={removeKey}
          />
          <ApiKeyField
            name="geminiDeepDive"
            id="gemini-deep-dive-key"
            label="Approfondissements"
            description="Utilisée pour les questions posées depuis un passage sélectionné."
            configured={configured.geminiDeepDive}
            value={deepDiveKey}
            onChange={setDeepDiveKey}
            onRemove={removeKey}
          />

          <div className="two-key-advice">
            <MagicWandIcon aria-hidden="true" />
            <p>Tu peux séparer les résumés et les approfondissements avec deux clés. Deux clés du même projet Google partagent toutefois généralement le même quota.</p>
          </div>
          <div className="key-security-note"><LockClosedIcon aria-hidden="true" /><span>{securityInfo.storage === "macos-keychain" ? "Sur ce Mac, les clés sont chiffrées dans le Trousseau macOS." : "Les clés sont confiées au coffre de secrets du serveur."} Leur valeur n'est jamais renvoyée au navigateur, affichée dans les paramètres ou écrite dans les logs.</span></div>

          {saveState.status !== "idle" ? <p className={`key-save-feedback ${saveState.status}`} role="status">{saveState.message}</p> : null}
          <footer className="dialog-actions"><button type="button" onClick={onClose}>Annuler</button><button className="primary-dialog-action" type="submit" disabled={saveState.status === "saving"}>{saveState.status === "saving" ? "Enregistrement…" : "Enregistrer"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function ApiKeyField({ name, id, label, description, configured, value, onChange, onRemove }) {
  return (
    <section className="api-key-field">
      <div className="api-key-field-heading"><div><label htmlFor={id}>{label}</label><p>{description}</p></div><div className="key-field-status"><span data-configured={configured}>{configured ? "Configurée" : "À configurer"}</span>{configured ? <button type="button" onClick={() => void onRemove(name)}>Retirer</button> : null}</div></div>
      <div className="secret-input-wrap"><LockClosedIcon aria-hidden="true" /><input id={id} type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={configured ? "Laisser vide pour conserver la clé" : "Coller la clé API"} autoComplete="off" spellCheck="false" /></div>
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
        <p>Les approfondissements et les nouveaux résumés utilisant ce projet Google peuvent être bloqués jusqu'au renouvellement du quota.</p>
        <div className="dialog-actions"><button type="button" onClick={onClose}>Plus tard</button><button className="primary-dialog-action" type="button" onClick={onOpenSettings}>Ouvrir Clés API</button></div>
      </section>
    </div>
  );
}
