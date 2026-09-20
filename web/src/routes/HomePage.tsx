import { FormEvent, useState } from "react";

import { unavailableApi } from "../api/client";

export function HomePage() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      setMessage("Collez une URL YouTube pour commencer.");
      return;
    }

    setIsSubmitting(true);
    setMessage("Prise en charge de la source…");

    try {
      await unavailableApi.createSource(normalizedUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de traiter cette source.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="home-page" aria-labelledby="home-title">
      <div className="content-column">
        <p className="eyebrow">Source → Résumé → Note → Décision</p>
        <h1 id="home-title">Transformez une source en connaissance exploitable</h1>
        <p className="lede">
          Collez une vidéo ou une playlist YouTube. Summarizer détecte automatiquement la source.
        </p>

        <form className="source-form" onSubmit={handleSubmit}>
          <label htmlFor="source-url">Source YouTube</label>
          <div className="source-input-row">
            <input
              id="source-url"
              name="source-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="Coller une URL YouTube…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-describedby={message ? "source-feedback" : undefined}
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Traitement…" : "Commencer"}
            </button>
          </div>
        </form>

        {message ? (
          <p id="source-feedback" className="status-message" role="status">
            {message}
          </p>
        ) : null}

        <section className="recent-section" aria-labelledby="recent-title">
          <h2 id="recent-title">Récents</h2>
          <p>Aucune session terminée pour le moment.</p>
        </section>
      </div>
    </section>
  );
}
