from __future__ import annotations

import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path

JOB_ID = "youtube-dc9d5920069de317ef51"
ORIGINAL_FAILURE_IDS = {
    "gXiV2tJOJwk",
    "TMRT1mObK8U",
    "DhhHeZuLxxE",
    "vQAD3JMx1_E",
    "JtM_iTPJIJw",
    "fUDn-c6ih9A",
    "7Xy_w1HUMWA",
    "i2ir4ZlnkNU",
    "ocCH8a2-ML0",
    "VazFihoa7AU",
    "iM816V2QtXY",
    "2jcPoyge6A8",
    "rFHn0Pwqcao",
    "xenE-DMnk_k",
    "PkjQvL1LoG4",
    "1SUeJs0Sm8g",
    "nYNfdSQqk3o",
    "PGwxjV714sk",
    "nCxicMtgFVc",
    "AkHbB9GuCkE",
    "OuKRx2BHpA8",
}


def frontmatter_value(raw: str, key: str) -> str:
    match = re.search(rf'^{re.escape(key)}:\s*"([\s\S]*?)"$', raw, re.MULTILINE)
    return match.group(1).strip() if match else ""


def video_id_from_url(url: str) -> str:
    match = re.search(r"[?&]v=([-_A-Za-z0-9]+)", url)
    return match.group(1) if match else ""


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def migrate(repo: Path, apply: bool) -> dict[str, object]:
    manifest_path = repo / "cache" / "jobs" / "playlist-40_manifest.json"
    session_path = repo / "cache" / "web_review_sessions" / f"{JOB_ID}.json"
    job_path = repo / "cache" / "web_jobs" / f"{JOB_ID}.json"
    output_dir = repo / "output" / "videos" / "playlist-40"

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    session = json.loads(session_path.read_text(encoding="utf-8"))
    job = json.loads(job_path.read_text(encoding="utf-8"))

    manifest_status = {
        video_id_from_url(item.get("url", "")): item.get("status")
        for item in manifest.get("videos", [])
    }
    recovered_ids = {
        video_id for video_id in ORIGINAL_FAILURE_IDS if manifest_status.get(video_id) == "done"
    }
    unavailable_ids = ORIGINAL_FAILURE_IDS - recovered_ids

    current_sources: list[tuple[int, str, str]] = []
    for path in output_dir.glob("*.md"):
        position_match = re.match(r"^(\d+)-", path.name)
        raw = path.read_text(encoding="utf-8")
        video_id = video_id_from_url(frontmatter_value(raw, "url"))
        if not position_match or not video_id:
            raise RuntimeError(f"Source Playlist 40 invalide: {path.name}")
        current_sources.append((int(position_match.group(1)), video_id, position_match.group(1)))
    current_sources.sort()

    if len(current_sources) != 357:
        raise RuntimeError(f"357 résumés attendus, {len(current_sources)} trouvés.")
    if len(recovered_ids) != 15 or len(unavailable_ids) != 6:
        raise RuntimeError(
            "Répartition de reprise inattendue: "
            f"{len(recovered_ids)} récupérées, {len(unavailable_ids)} indisponibles."
        )

    legacy_sources = [source for source in current_sources if source[1] not in recovered_ids]
    legacy_decisions = session.get("decisions", [])
    if len(legacy_sources) != 342 or len(legacy_decisions) != 342:
        raise RuntimeError("La session historique ne correspond plus aux 342 cartes revues.")

    decision_by_video_id = {
        video_id: decision
        for (_, video_id, _), decision in zip(legacy_sources, legacy_decisions, strict=True)
        if decision in {"keep", "discard"}
    }
    if len(decision_by_video_id) != 342:
        raise RuntimeError("Les 342 décisions historiques ne sont pas complètes.")

    stable_id_by_video = {
        video_id: f"{video_id}-{source_position}"
        for _, video_id, source_position in current_sources
    }

    def migrate_keyed_record(record: object) -> dict[str, object]:
        if not isinstance(record, dict):
            return {}
        migrated: dict[str, object] = {}
        for legacy_key, value in record.items():
            match = re.match(r"^(.+)-\d{3}$", legacy_key)
            video_id = match.group(1) if match else legacy_key
            stable_id = stable_id_by_video.get(video_id)
            if not stable_id:
                raise RuntimeError(f"Donnée de session orpheline: {legacy_key}")
            migrated[stable_id] = value
        return migrated

    migrated_decisions = [decision_by_video_id.get(video_id) for _, video_id, _ in current_sources]
    migrated_notes = migrate_keyed_record(session.get("notes"))
    migrated_deep_dives = migrate_keyed_record(session.get("deepDives"))
    nonempty_notes = sum(
        isinstance(value, str) and bool(value.strip()) for value in migrated_notes.values()
    )
    deep_dive_turns = sum(
        len(value) for value in migrated_deep_dives.values() if isinstance(value, list)
    )

    if sum(decision in {"keep", "discard"} for decision in migrated_decisions) != 342:
        raise RuntimeError("La migration des décisions a perdu des choix.")
    if nonempty_notes != 30 or deep_dive_turns != 15:
        raise RuntimeError(
            "Contenu de session inattendu: "
            f"{nonempty_notes} notes, {deep_dive_turns} approfondissements."
        )

    now = datetime.now(UTC).isoformat()
    migrated_session = {
        **session,
        "decisions": migrated_decisions,
        "decisionByVideoId": decision_by_video_id,
        "notes": migrated_notes,
        "deepDives": migrated_deep_dives,
        "currentIndex": (
            len(current_sources) if session.get("finalized") else migrated_decisions.index(None)
        ),
        "updatedAt": now,
    }
    migrated_job = {
        **job,
        "status": "completed",
        "done": 357,
        "failed": 6,
        "error": None,
        "nextRetryAt": None,
        "currentVideo": None,
        "workerPid": None,
        "updatedAt": now,
        "finishedAt": now,
    }

    summary = {
        "reviewed_decisions_preserved": len(decision_by_video_id),
        "recovered_pending_review": len(recovered_ids),
        "unavailable": len(unavailable_ids),
        "nonempty_notes_preserved": nonempty_notes,
        "deep_dive_turns_preserved": deep_dive_turns,
        "session_finalized": bool(migrated_session.get("finalized")),
    }
    if apply:
        atomic_json(session_path, migrated_session)
        atomic_json(job_path, migrated_job)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Stabiliser la session locale de la Playlist 40 après reprise."
    )
    parser.add_argument("--repo", type=Path, default=Path("/Users/insular/transcripts"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(migrate(args.repo.resolve(), args.apply), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
