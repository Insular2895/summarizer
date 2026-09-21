import { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { ReviewVideoRecord } from "../api/client";
import { ReviewCard } from "../components/ReviewCard";

const POLL_DELAY_MS = 1_500;
const UNDO_WINDOW_MS = 6_000;
type Decision = "KEPT" | "DISCARDED";

interface UndoState {
  videoId: string;
  videoTitle: string;
  decision: Decision;
  baseVersion: number;
}

interface DecisionOverride {
  decision: Decision | "PENDING";
  version: number | null;
}

export function ReviewPage() {
  const [videos, setVideos] = useState<ReviewVideoRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const optimisticRef = useRef(new Map<string, DecisionOverride>());
  const busyRef = useRef<string | null>(null);
  const currentRef = useRef<ReviewVideoRecord | null>(null);
  const decideRef = useRef<(decision: Decision) => void>(() => undefined);
  const undoTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    async function refresh() {
      try {
        const next = await api.listReview(controller.signal);
        setVideos(
          next.map((video) => {
            const optimistic = optimisticRef.current.get(video.id);
            if (!optimistic) return video;
            if (optimistic.version === null || video.decision_version < optimistic.version) {
              return {
                ...video,
                decision: optimistic.decision,
                decision_version: optimistic.version ?? video.decision_version,
              };
            }
            optimisticRef.current.delete(video.id);
            return video;
          }),
        );
        setLoadError(null);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setLoadError(caught instanceof Error ? caught.message : "Review est momentanément indisponible.");
        }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, POLL_DELAY_MS);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const pendingVideos = videos?.filter((video) => video.decision === "PENDING") ?? [];
  const current = pendingVideos[0] ?? null;
  currentRef.current = current;

  async function decide(decision: Decision) {
    const video = currentRef.current;
    if (!video || busyRef.current) return;
    busyRef.current = video.id;
    setBusyId(video.id);
    setActionError(null);
    optimisticRef.current.set(video.id, { decision, version: null });
    setVideos((currentVideos) =>
      currentVideos?.map((item) => (item.id === video.id ? { ...item, decision } : item)) ?? null,
    );
    try {
      const saved = await api.setDecision(video.id, decision, video.decision_version);
      optimisticRef.current.set(video.id, { decision: saved.decision, version: saved.version });
      setVideos((currentVideos) =>
        currentVideos?.map((item) =>
          item.id === video.id
            ? { ...item, decision: saved.decision, decision_version: saved.version }
            : item,
        ) ?? null,
      );
      showUndo({
        videoId: video.id,
        videoTitle: video.title,
        decision,
        baseVersion: saved.version,
      });
    } catch (caught) {
      optimisticRef.current.delete(video.id);
      setVideos((currentVideos) =>
        currentVideos?.map((item) => (item.id === video.id ? video : item)) ?? null,
      );
      setActionError(caught instanceof Error ? caught.message : "La décision n’a pas été enregistrée.");
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }
  decideRef.current = decide;

  function showUndo(next: UndoState) {
    if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    setUndo(next);
    undoTimerRef.current = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }

  async function undoDecision() {
    if (!undo || busyRef.current) return;
    busyRef.current = undo.videoId;
    setBusyId(undo.videoId);
    setActionError(null);
    try {
      const restored = await api.undoDecision(undo.videoId, undo.baseVersion);
      optimisticRef.current.set(undo.videoId, {
        decision: restored.decision,
        version: restored.version,
      });
      setVideos((currentVideos) =>
        currentVideos?.map((video) =>
          video.id === undo.videoId
            ? { ...video, decision: restored.decision, decision_version: restored.version }
            : video,
        ) ?? null,
      );
      setUndo(null);
      if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "La décision n’a pas pu être annulée.");
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !currentRef.current ||
        busyRef.current ||
        editableTarget(event.target) ||
        hasTextSelection()
      ) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        decideRef.current(event.key === "ArrowRight" ? "KEPT" : "DISCARDED");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  if (videos === null && loadError) {
    return <ReviewState title="Review indisponible" message={loadError} />;
  }
  if (videos === null) {
    return <ReviewState title="Chargement de Review…" message="Recherche des vidéos prêtes." />;
  }
  if (videos.length === 0) {
    return (
      <ReviewState
        title="Aucune vidéo prête"
        message="Les vidéos prêtes apparaîtront ici pendant que le reste de la source continue d’être traité."
      />
    );
  }

  const sessionVideos = current ? videos.filter((video) => video.job_id === current.job_id) : videos;
  const reviewedCount = sessionVideos.filter((video) => video.decision !== "PENDING").length;
  const keptCount = videos.filter((video) => video.decision === "KEPT").length;
  const discardedCount = videos.filter((video) => video.decision === "DISCARDED").length;

  return (
    <section className="review-screen" aria-labelledby="review-title">
      <div className="review-heading">
        <p className="eyebrow">Review</p>
        <h1 id="review-title">Décider, une vidéo à la fois</h1>
        <p className="review-progress" role="status">
          {current
            ? `${reviewedCount + 1} sur ${sessionVideos.length}`
            : `${keptCount} conservées · ${discardedCount} écartées`}
        </p>
      </div>

      {loadError || actionError ? (
        <p className="review-error" role="alert">
          {actionError ?? loadError}
        </p>
      ) : null}

      {current ? (
        <ReviewCard video={current} busy={busyId !== null} onDecision={decide} />
      ) : (
        <div className="review-caught-up">
          <h2>Tout ce qui est prêt a été revu</h2>
          <p>Les prochaines vidéos apparaîtront ici dès qu’elles seront disponibles.</p>
        </div>
      )}

      {undo ? (
        <div className="undo-bar" role="status">
          <span>
            « {undo.videoTitle} » {undo.decision === "KEPT" ? "conservée" : "écartée"}.
          </span>
          <button type="button" disabled={busyId === undo.videoId} onClick={undoDecision}>
            Annuler
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ReviewState({ title, message }: { title: string; message: string }) {
  return (
    <section className="content-column" aria-labelledby="review-title">
      <p className="eyebrow">Review</p>
      <h1 id="review-title">{title}</h1>
      <p className="lede" role="status">
        {message}
      </p>
    </section>
  );
}

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}
