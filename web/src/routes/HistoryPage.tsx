import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { HistoryEntry } from "../api/client";

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listHistory(controller.signal)
      .then((next) => {
        setEntries(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "History est momentanément indisponible.");
        }
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return <HistoryState title="History indisponible" message={error} />;
  }
  if (entries === null) {
    return <HistoryState title="Chargement de History…" message="Lecture des sessions finalisées." />;
  }
  if (entries.length === 0) {
    return (
      <HistoryState
        title="Aucune session terminée"
        message="Les sessions finalisées apparaîtront ici sous forme de journal léger."
      />
    );
  }

  return (
    <section className="content-column" aria-labelledby="history-title">
      <p className="eyebrow">History</p>
      <h1 id="history-title">Sessions terminées</h1>
      <ol className="history-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <article>
              <div className="history-title-row">
                <div>
                  <p className="history-meta">
                    {entry.source_kind === "youtube_playlist" ? "Playlist" : "Vidéo"} ·{" "}
                    <time dateTime={entry.completed_at}>{formatDate(entry.completed_at)}</time>
                  </p>
                  <h2>{entry.title ?? "Source YouTube"}</h2>
                </div>
                <span className="history-export-state">Exporté</span>
              </div>
              <p className="history-counts">
                {entry.total_videos} analysées · {entry.kept_videos} conservées · {entry.discarded_videos} écartées
                {entry.failed_videos > 0 ? ` · ${entry.failed_videos} en erreur` : ""}
              </p>
              <div className="history-links">
                {entry.first_kept_video_id ? (
                  <Link to={`/review/${entry.first_kept_video_id}`}>Ouvrir le premier contenu gardé</Link>
                ) : null}
                <a href={entry.normalized_url} target="_blank" rel="noreferrer">
                  Voir la source
                </a>
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HistoryState({ title, message }: { title: string; message: string }) {
  return (
    <section className="content-column" aria-labelledby="history-title">
      <p className="eyebrow">History</p>
      <h1 id="history-title">{title}</h1>
      <p className="lede" role="status">
        {message}
      </p>
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}
