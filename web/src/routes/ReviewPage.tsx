import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, VideoRecord } from "../api/client";

const POLL_DELAY_MS = 1_500;

export function ReviewPage() {
  const [videos, setVideos] = useState<VideoRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    async function refresh() {
      try {
        const next = await api.listReview(controller.signal);
        setVideos(next);
        setError(null);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Review est momentanément indisponible.");
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

  if (error) {
    return <ReviewState title="Review indisponible" message={error} />;
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

  return (
    <section className="content-column" aria-labelledby="review-title">
      <p className="eyebrow">Review</p>
      <h1 id="review-title">{videos.length === 1 ? "1 vidéo prête" : `${videos.length} vidéos prêtes`}</h1>
      <ol className="review-list">
        {videos.map((video) => (
          <li key={video.id}>
            <article>
              <p className="review-meta">{formatDuration(video.duration_seconds)}</p>
              <h2>{video.title}</h2>
              <p>{excerpt(video.summary_markdown)}</p>
              <Link className="primary-link" to={`/review/${video.id}`}>
                Ouvrir la fiche
              </Link>
            </article>
          </li>
        ))}
      </ol>
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

function excerpt(markdown: string | null): string {
  if (!markdown) return "Résumé prêt à consulter.";
  return markdown.replace(/^#+\s+/gm, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Vidéo prête";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
