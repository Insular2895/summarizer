import { Link, useParams } from "react-router-dom";

export function VideoPage() {
  const { videoId } = useParams();

  return (
    <article className="reading-column" aria-labelledby="video-title">
      <Link className="back-link" to="/review">
        Retour à Review
      </Link>
      <p className="eyebrow">Fiche vidéo</p>
      <h1 id="video-title">Vidéo {videoId ?? "inconnue"}</h1>
      <section aria-labelledby="summary-title">
        <h2 id="summary-title">Résumé</h2>
        <p>Le résumé sera disponible lorsque le traitement sera terminé.</p>
      </section>
      <section aria-labelledby="note-title">
        <h2 id="note-title">Note</h2>
        <p>La Note unique de cette vidéo apparaîtra ici.</p>
      </section>
      <section aria-labelledby="transcript-title">
        <h2 id="transcript-title">Transcript</h2>
        <p>Le transcript horodaté sera disponible avec la fiche.</p>
      </section>
    </article>
  );
}
