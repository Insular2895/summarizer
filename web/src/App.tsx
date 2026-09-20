import { Link, NavLink, Route, Routes } from "react-router-dom";

import { HistoryPage } from "./routes/HistoryPage";
import { HomePage } from "./routes/HomePage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { ReviewPage } from "./routes/ReviewPage";
import { VideoPage } from "./routes/VideoPage";

const navigation = [
  { to: "/", label: "Home", end: true },
  { to: "/review", label: "Review", end: false },
  { to: "/history", label: "History", end: true },
] as const;

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/" aria-label="Summarizer, accueil">
          Summarizer
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="main-navigation">
            {navigation.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? "is-active" : undefined)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main-content" className="page-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/review/:videoId" element={<VideoPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
