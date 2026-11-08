import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router-dom";

import { api, VideoDetail } from "../api/client";
import { NoteEditor, NoteEditorHandle } from "../components/NoteEditor";
import { TranscriptSection } from "../components/TranscriptSection";

export function VideoPage() {
  const { videoId } = useParams();
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteEditorRef = useRef<NoteEditorHandle>(null);

  useEffect(() => {
    if (!videoId) return;
    const controller = new AbortController();
    api
      .getVideo(videoId, controller.signal)
      .then(setDetail)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Cette fiche est indisponible.");
        }
      });
    return () => controller.abort();
  }, [videoId]);

  if (error) return <VideoState title="Fiche indisponible" message={error} />;
  if (!detail) return <VideoState title="Chargement de la fiche…" message="Récupération du contenu." />;

  return (
    <article className="reading-column" aria-labelledby="video-title">
      <Link className="back-link" to="/review">
        Retour à Review
      </Link>
      <p className="eyebrow">Fiche vidéo</p>
      <h1 id="video-title">{detail.video.title}</h1>
      {detail.video.channel ? <p className="video-byline">{detail.video.channel}</p> : null}
      <section aria-labelledby="summary-title">
        <h2 id="summary-title">Résumé</h2>
        <div className="summary-copy">
          <Markdown components={{ h1: "h3", h2: "h3", h3: "h4" }}>
            {detail.video.summary_markdown ?? "Résumé indisponible."}
          </Markdown>
        </div>
      </section>
      <section aria-labelledby="note-title">
        <h2 id="note-title">Note</h2>
        <NoteEditor ref={noteEditorRef} key={detail.video.id} videoId={detail.video.id} note={detail.note} />
      </section>
      <TranscriptSection
        blocks={detail.transcript}
        onAddExcerpt={(excerpt) => noteEditorRef.current?.addExcerpt(excerpt)}
      />
    </article>
  );
}

function VideoState({ title, message }: { title: string; message: string }) {
  return (
    <section className="reading-column" aria-labelledby="video-title">
      <Link className="back-link" to="/review">
        Retour à Review
      </Link>
      <p className="eyebrow">Fiche vidéo</p>
      <h1 id="video-title">{title}</h1>
      <p className="lede" role="status">
        {message}
      </p>
    </section>
  );
}
