import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="content-column" aria-labelledby="not-found-title">
      <p className="eyebrow">Page introuvable</p>
      <h1 id="not-found-title">Cette page n’existe pas</h1>
      <Link to="/">Revenir à Home</Link>
    </section>
  );
}
