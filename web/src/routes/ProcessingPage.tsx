import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, JobDetail } from "../api/client";

const POLL_DELAY_MS = 1_500;

export function ProcessingPage() {
  const { jobId } = useParams();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const currentJobId = jobId;
    const controller = new AbortController();
    let timer: number | undefined;

    async function refresh() {
      try {
        const next = await api.getJob(currentJobId, controller.signal);
        setDetail(next);
        setError(null);
        if (
          !controller.signal.aborted &&
          next.job.state !== "DONE" &&
          next.job.state !== "FAILED" &&
          next.job.stage !== "PROCESSING_COMPLETE"
        ) {
          timer = window.setTimeout(refresh, POLL_DELAY_MS);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Impossible de suivre le traitement.");
        timer = window.setTimeout(refresh, POLL_DELAY_MS);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId]);

  const total = detail?.job.total_videos;
  const ready = detail?.job.ready_videos ?? 0;
  const failed = detail?.job.failed_videos ?? 0;
  const completed = ready + failed;
  const readyLabel = ready === 1 ? "1 prête" : `${ready} prêtes`;
  const failedLabel = failed === 1 ? "1 échec" : `${failed} échecs`;
  const progressLabel = total
    ? `${completed} sur ${total} traitées · ${readyLabel} · ${failedLabel}`
    : "Analyse de la source en cours";
  const statusMessage =
    error ??
    (detail?.job.state === "FAILED"
      ? detail.job.public_error || "Cette source n’a pas pu être analysée. Réessaie depuis Home."
      : progressLabel);

  return (
    <section className="content-column" aria-labelledby="processing-title">
      <p className="eyebrow">Traitement</p>
      <h1 id="processing-title">Source prise en charge</h1>
      <p className="lede" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {detail?.videos.length ? (
        <ol className="processing-list" aria-label="Vidéos de la source">
          {detail.videos.map((video) => (
            <li key={video.id}>
              <div>
                <span className={`video-state video-state-${video.state.toLowerCase()}`}>
                  {stateLabel(video.state)}
                </span>
                <h2>{video.title}</h2>
                {video.state === "FAILED" ? <p>{video.public_error || "Traitement impossible."}</p> : null}
              </div>
              {video.state === "READY" ? (
                <Link className="primary-link" to={`/review/${video.id}`}>
                  Ouvrir « {video.title} »
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      <Link className="secondary-link" to="/review">
        Aller à Review
      </Link>
    </section>
  );
}

function stateLabel(state: JobDetail["videos"][number]["state"]): string {
  if (state === "READY") return "Prête";
  if (state === "PROCESSING") return "En cours";
  if (state === "FAILED") return "Échec";
  return "En attente";
}
