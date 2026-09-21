import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";

import type { ReviewVideoRecord } from "../api/client";

type Decision = "KEPT" | "DISCARDED";

interface ReviewCardProps {
  video: ReviewVideoRecord;
  busy: boolean;
  onDecision(decision: Decision): void;
}

export function ReviewCard({ video, busy, onDecision }: ReviewCardProps) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const originRef = useRef({ x: 0, time: 0 });

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if (busy || event.button !== 0 || interactiveTarget(event.target)) return;
    originRef.current = { x: event.clientX, time: performance.now() };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging) return;
    setDragX(event.clientX - originRef.current.x);
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging) return;
    const distance = event.clientX - originRef.current.x;
    const elapsed = Math.max(performance.now() - originRef.current.time, 1);
    const velocity = distance / elapsed;
    const distanceThreshold = Math.max(72, event.currentTarget.clientWidth * 0.28);
    const committed =
      Math.abs(distance) >= distanceThreshold ||
      (Math.abs(distance) >= 32 && Math.abs(velocity) >= 0.55);
    setDragging(false);
    setDragX(0);
    if (committed) onDecision(distance > 0 ? "KEPT" : "DISCARDED");
  }

  function cancelDrag() {
    setDragging(false);
    setDragX(0);
  }

  const intent = dragX > 20 ? "keep" : dragX < -20 ? "discard" : "neutral";
  const hintOpacity = Math.min(Math.abs(dragX) / 110, 1);

  return (
    <article
      className={`review-card${dragging ? " is-dragging" : ""}`}
      data-swipe-intent={intent}
      style={{ transform: `translate3d(${dragX}px, 0, 0)` }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    >
      <span className="swipe-hint swipe-hint-discard" style={{ opacity: dragX < 0 ? hintOpacity : 0 }} aria-hidden>
        Écarter
      </span>
      <span className="swipe-hint swipe-hint-keep" style={{ opacity: dragX > 0 ? hintOpacity : 0 }} aria-hidden>
        Garder
      </span>
      <img
        className="review-thumbnail"
        src={`https://i.ytimg.com/vi/${encodeURIComponent(video.youtube_id)}/hqdefault.jpg`}
        alt=""
        draggable={false}
      />
      <div className="review-card-copy">
        <p className="review-meta">
          {video.channel ? `${video.channel} · ` : ""}
          {formatDuration(video.duration_seconds)}
        </p>
        <h2>{video.title}</h2>
        <p>{summaryExcerpt(video.summary_markdown)}</p>
        <Link className="secondary-link" to={`/review/${video.id}`}>
          Ouvrir la fiche
        </Link>
      </div>
      <div className="review-actions" aria-label="Décision">
        <button type="button" disabled={busy} onClick={() => onDecision("DISCARDED")}>
          Écarter <kbd>←</kbd>
        </button>
        <button type="button" disabled={busy} onClick={() => onDecision("KEPT")}>
          Garder <kbd>→</kbd>
        </button>
      </div>
    </article>
  );
}

function interactiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("a, button, input, textarea, select"));
}

function summaryExcerpt(markdown: string | null): string {
  if (!markdown) return "Résumé prêt à consulter.";
  return markdown.replace(/^#+\s+/gm, "").replace(/\s+/g, " ").trim().slice(0, 280);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Durée indisponible";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
