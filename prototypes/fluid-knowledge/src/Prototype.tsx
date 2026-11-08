import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CardStackIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  ExternalLinkIcon,
  HomeIcon,
  ReaderIcon,
  ReloadIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import { BottomSheet, MobileScroll } from "./mobile";

type Section = "home" | "review" | "history";
type Decision = "keep" | "discard";
type DetailTab = "summary" | "note" | "transcript";

type Video = {
  id: string;
  title: string;
  channel: string;
  duration: string;
  summary: string;
  thumbnail: string;
};

const videos: Video[] = [
  {
    id: "N7FGbBq1mI4",
    title: "Deploy ANY AI Agent to Production in Minutes",
    channel: "AWS Developers",
    duration: "15:56",
    summary:
      "Un tutoriel concret pour déployer un agent IA avec AgentCore, relier son runtime, sa mémoire et ses outils, puis observer son comportement en production.",
    thumbnail: "/assets/video-thumbnail-youtube.jpg",
  },
  {
    id: "agent-patterns",
    title: "Trois patterns avancés pour des agents IA plus fiables",
    channel: "Engineering Notes",
    duration: "12:08",
    summary:
      "Une lecture pratique des garde-fous, de l'orchestration et de l'observabilité qui rendent les agents plus prévisibles en conditions réelles.",
    thumbnail: "/assets/video-thumbnail.png",
  },
  {
    id: "mcp-production",
    title: "MCP ou API : choisir la bonne frontière d'intégration",
    channel: "Systems Lab",
    duration: "10:31",
    summary:
      "Comparaison des deux approches à partir de leurs contrats, de leur sécurité et de leur coût d'exploitation dans une architecture agentique.",
    thumbnail: "/assets/video-thumbnail.png",
  },
];

const decisionLabels: Record<Decision, string> = {
  keep: "Gardée",
  discard: "Écartée",
};

export default function Prototype() {
  const [section, setSection] = useState<Section>("review");
  const [videoIndex, setVideoIndex] = useState(0);
  const [lastDecision, setLastDecision] = useState<{
    index: number;
    decision: Decision;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [isDeciding, setIsDeciding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-7, 0, 7]);
  const keepOpacity = useTransform(x, [12, 116], [0, 1]);
  const discardOpacity = useTransform(x, [-116, -12], [1, 0]);
  const cardScale = useTransform(x, [-220, 0, 220], [0.985, 1, 0.985]);
  const activeVideo = videos[videoIndex];
  const nextVideo = videos[(videoIndex + 1) % videos.length];

  const returnCard = useCallback(() => {
    animate(x, 0, reducedMotion
      ? { duration: 0.12 }
      : { type: "spring", stiffness: 410, damping: 34, mass: 0.72 });
  }, [reducedMotion, x]);

  const decide = useCallback(async (decision: Decision) => {
    if (isDeciding) return;
    setIsDeciding(true);

    const direction = decision === "keep" ? 1 : -1;
    await animate(
      x,
      direction * 520,
      reducedMotion
        ? { duration: 0.14 }
        : { type: "spring", bounce: 0.14, duration: 0.38 },
    );

    setLastDecision({ index: videoIndex, decision });
    setAnnouncement(`${activeVideo.title} — ${decisionLabels[decision]}`);
    setVideoIndex((current) => (current + 1) % videos.length);
    x.set(0);
    setIsDeciding(false);
  }, [activeVideo.title, isDeciding, reducedMotion, videoIndex, x]);

  const undo = useCallback(() => {
    if (!lastDecision || isDeciding) return;
    setVideoIndex(lastDecision.index);
    setAnnouncement(`Décision annulée pour ${videos[lastDecision.index].title}`);
    setLastDecision(null);
    x.set(0);
  }, [isDeciding, lastDecision, x]);

  const handleDragEnd = useCallback((_: PointerEvent, info: PanInfo) => {
    const projectedX = info.offset.x + info.velocity.x * 0.13;
    if (projectedX > 108) {
      void decide("keep");
    } else if (projectedX < -108) {
      void decide("discard");
    } else {
      returnCard();
    }
  }, [decide, returnCard]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (section !== "review" || detailOpen || isDeciding) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        void decide("keep");
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void decide("discard");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [decide, detailOpen, isDeciding, section, undo]);

  const openDetail = () => {
    setDetailTab("summary");
    setDetailOpen(true);
  };

  return (
    <div className="prototype-shell">
      {section === "review" ? (
        <MobileScroll className="app-scroll">
          <main className="review-screen" data-testid="review-screen">
            <header className="brand-row">
              <div>
                <p className="eyebrow">Transcript</p>
                <h1>Fluid Knowledge</h1>
              </div>
              <button className="icon-button" type="button" aria-label="Plus d'options">
                <DotsHorizontalIcon width="22" height="22" aria-hidden="true" />
              </button>
            </header>

            <section className="review-context" aria-labelledby="review-title">
              <div className="context-topline">
                <h2 id="review-title">Review</h2>
                <span className="progress-pill">{videoIndex + 7} sur 24</span>
              </div>
              <div className="playlist-row">
                <VideoIcon width="19" height="19" aria-hidden="true" />
                <span>Agents IA en production</span>
              </div>
            </section>

            <section className="card-deck" aria-label="Carte vidéo à examiner">
              <motion.div
                className="decision-underlay decision-underlay-discard"
                style={{ opacity: discardOpacity }}
                aria-hidden="true"
              >
                <Cross2Icon width="24" height="24" />
                <strong>Écarter</strong>
              </motion.div>
              <motion.div
                className="decision-underlay decision-underlay-keep"
                style={{ opacity: keepOpacity }}
                aria-hidden="true"
              >
                <CheckIcon width="25" height="25" />
                <strong>Garder</strong>
              </motion.div>

              <article className="review-card next-card" aria-hidden="true">
                <img src={nextVideo.thumbnail} alt="" />
              </article>

              <motion.article
                key={activeVideo.id}
                className="review-card active-card"
                data-testid="active-review-card"
                data-scroll-drag="ignore"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                dragMomentum={false}
                onDragEnd={handleDragEnd}
                style={{ x, rotate: reducedMotion ? 0 : rotate, scale: cardScale }}
                whileTap={reducedMotion ? undefined : { scale: 0.992 }}
                aria-label={`${activeVideo.title}. Glisser à droite pour garder, à gauche pour écarter.`}
              >
                <div className="thumbnail-wrap">
                  <img src={activeVideo.thumbnail} alt={`Miniature de ${activeVideo.title}`} />
                  <span className="duration">{activeVideo.duration}</span>
                </div>
                <div className="card-content">
                  <h3>{activeVideo.title}</h3>
                  <div className="source-row">
                    <span className="language-chip">EN</span>
                    <span>{activeVideo.channel}</span>
                  </div>
                  <p>{activeVideo.summary}</p>
                  <button className="detail-link" type="button" onClick={openDetail}>
                    <ExternalLinkIcon width="19" height="19" aria-hidden="true" />
                    Ouvrir la fiche
                    <ChevronRightIcon className="detail-chevron" width="20" height="20" aria-hidden="true" />
                  </button>
                </div>
              </motion.article>
            </section>

            <div className="decision-actions" aria-label="Décider pour cette vidéo">
              <button
                className="decision-button discard-button"
                type="button"
                onClick={() => void decide("discard")}
                disabled={isDeciding}
              >
                <ArrowLeftIcon width="19" height="19" aria-hidden="true" />
                Écarter
              </button>
              <button
                className="decision-button keep-button"
                type="button"
                onClick={() => void decide("keep")}
                disabled={isDeciding}
              >
                Garder
                <ArrowRightIcon width="19" height="19" aria-hidden="true" />
              </button>
            </div>

            <button className="undo-button" type="button" onClick={undo} disabled={!lastDecision || isDeciding}>
              <ReloadIcon width="17" height="17" aria-hidden="true" />
              Annuler
            </button>
          </main>
        </MobileScroll>
      ) : section === "home" ? (
        <MobileScroll className="app-scroll">
          <main className="secondary-screen">
            <p className="eyebrow">Transcript</p>
            <h1>Commencer</h1>
            <section className="secondary-panel">
              <VideoIcon width="25" height="25" aria-hidden="true" />
              <h2>Ajouter une source YouTube</h2>
              <p>Colle une URL vidéo ou playlist pour lancer le traitement progressif.</p>
              <button type="button" onClick={() => setSection("review")}>Voir la Review</button>
            </section>
          </main>
        </MobileScroll>
      ) : (
        <MobileScroll className="app-scroll">
          <main className="secondary-screen">
            <p className="eyebrow">Transcript</p>
            <h1>History</h1>
            <section className="history-row">
              <ClockIcon width="22" height="22" aria-hidden="true" />
              <div>
                <h2>Agents IA en production</h2>
                <p>24 vidéos · 6 gardées · export prêt</p>
              </div>
            </section>
          </main>
        </MobileScroll>
      )}

      <nav className="bottom-nav" aria-label="Navigation principale">
        <button type="button" data-active={section === "home"} onClick={() => setSection("home")}>
          <HomeIcon width="23" height="23" aria-hidden="true" />
          <span>Home</span>
        </button>
        <button type="button" data-active={section === "review"} onClick={() => setSection("review")}>
          <CardStackIcon width="23" height="23" aria-hidden="true" />
          <span>Review</span>
        </button>
        <button type="button" data-active={section === "history"} onClick={() => setSection("history")}>
          <ClockIcon width="23" height="23" aria-hidden="true" />
          <span>History</span>
        </button>
      </nav>

      <BottomSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title="Fiche vidéo"
        description={activeVideo.title}
        snap={0.82}
      >
        <div className="detail-sheet">
          <div className="detail-tabs" role="tablist" aria-label="Contenu de la vidéo">
            <button type="button" role="tab" aria-selected={detailTab === "summary"} onClick={() => setDetailTab("summary")}>
              <ReaderIcon aria-hidden="true" /> Résumé
            </button>
            <button type="button" role="tab" aria-selected={detailTab === "note"} onClick={() => setDetailTab("note")}>
              Note
            </button>
            <button type="button" role="tab" aria-selected={detailTab === "transcript"} onClick={() => setDetailTab("transcript")}>
              Transcript
            </button>
          </div>
          {detailTab === "summary" ? (
            <div className="detail-copy" role="tabpanel">
              <h3>À retenir</h3>
              <p>{activeVideo.summary}</p>
              <p>La vidéo sépare le runtime, les outils, la mémoire et l'observabilité pour rendre le déploiement compréhensible et reproductible.</p>
            </div>
          ) : detailTab === "note" ? (
            <div className="detail-copy empty-detail" role="tabpanel">
              <h3>Note</h3>
              <p>Aucune note pour le moment. L'autosave sera branché dans la version connectée.</p>
            </div>
          ) : (
            <div className="detail-copy transcript-copy" role="tabpanel">
              <h3>Transcript</h3>
              <p><time>00:42</time> Today we're going to deploy an AI agent and connect the pieces it needs to run safely in production.</p>
              <p><time>02:18</time> AgentCore separates runtime, identity, memory and observability so every layer can evolve independently.</p>
            </div>
          )}
        </div>
      </BottomSheet>

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
