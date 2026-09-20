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
        if (!controller.signal.aborted && next.job.state !== "DONE" && next.job.state !== "FAILED") {
          timer = window.setTimeout(refresh, POLL_DELAY_MS);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Impossible de suivre le traitement.");
      }
    }

    void refresh();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId]);

  const readyVideos = detail?.videos.filter((video) => video.state === "READY") ?? [];
  const total = detail?.job.total_videos;
  const progressLabel = total
    ? `${detail?.job.ready_videos ?? 0} sur ${total} prêtes`
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

      {readyVideos.length > 0 ? (
        <div className="processing-ready">
          <h2>Prête à consulter</h2>
          {readyVideos.map((video) => (
            <Link className="primary-link" to={`/review/${video.id}`} key={video.id}>
              Ouvrir « {video.title} »
            </Link>
          ))}
        </div>
      ) : null}

      <Link className="secondary-link" to="/review">
        Aller à Review
      </Link>
    </section>
  );
}
