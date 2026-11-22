# ruff: noqa: E501

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

RECEIPT = "youtube-dc9d5920069de317ef51-1794758924984"
BATCH = "playlist-40"
IMPORTED_AT = date(2026, 11, 15).isoformat()

# These were the 21 failures recorded before the controlled 2026-11-15 retry.
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


CATEGORY_PACKS = {
    "coding_ai_agents": "knowledge_pool/coding/ai_agents",
    "coding_security": "knowledge_pool/coding/security",
    "coding_devops_cloud": "knowledge_pool/coding/devops_cloud",
    "coding_software_engineering": "knowledge_pool/coding/software_architecture",
    "coding_product_design": "knowledge_pool/coding/product_design",
    "business_private_equity_ma": "knowledge_pool/business/private_equity",
    "business_fundraising_vc": "knowledge_pool/business/fundraising",
    "business_marketing_sales": "knowledge_pool/business/ads",
    "business_startups_saas": "knowledge_pool/business/saas_bootstrapping",
    "business_management_governance": "knowledge_pool/business/group_governance",
    "finance_personal_wealth": "knowledge_pool/finance/portfolio_management",
    "finance_portfolio_markets": "knowledge_pool/finance/portfolio_management",
    "finance_crypto": "knowledge_pool/finance/portfolio_management",
    "finance_real_estate": "knowledge_pool/finance/real_estate_finance",
    "finance_corporate_banking": "knowledge_pool/finance/source_research",
    "finance_tax_legal": "knowledge_pool/finance/source_research",
    "research_economics_geopolitics": "knowledge_pool/research",
    "research_infrastructure_energy": "knowledge_pool/research",
    "research_health_psychology": "knowledge_pool/research",
    "research_history_culture": "knowledge_pool/research",
    "research_technology": "knowledge_pool/research",
    "research_general": "knowledge_pool/research",
}


PACK_USAGE = {
    "knowledge_pool/coding/ai_agents": "veille sur agents, modèles, outils IA et workflows de développement assisté",
    "knowledge_pool/coding/security": "veille défensive sur cybersécurité, sécurité agentique et protection des actifs numériques",
    "knowledge_pool/coding/devops_cloud": "veille sur Docker, infrastructure, réseaux et exécution locale/cloud",
    "knowledge_pool/coding/software_architecture": "veille sur architecture, développement logiciel et pratiques d'ingénierie",
    "knowledge_pool/coding/product_design": "veille sur design produit, interfaces et systèmes visuels",
    "knowledge_pool/business/private_equity": "veille sur acquisitions, private equity, M&A et reprise d'entreprise",
    "knowledge_pool/business/fundraising": "veille sur capital-risque, levées et relation investisseurs",
    "knowledge_pool/business/ads": "veille sur marketing, vente, e-commerce et acquisition clients",
    "knowledge_pool/business/saas_bootstrapping": "veille sur entrepreneuriat, SaaS, startups et modèles économiques",
    "knowledge_pool/business/group_governance": "veille sur management, leadership, holdings et gouvernance",
    "knowledge_pool/finance/portfolio_management": "recherche contradictoire sur patrimoine, marchés, trading et crypto ; aucune recommandation",
    "knowledge_pool/finance/real_estate_finance": "veille sur actifs immobiliers, construction et économie urbaine",
    "knowledge_pool/finance/source_research": "sources financières, bancaires, fiscales et macro à vérifier avant toute application",
}


# The source summaries already contain a human-readable primary domain.  It is
# deliberately weighted above secondary tags: a security keyword mentioned in
# a finance video must not turn the whole source into a cybersecurity source.
DOMAIN_CATEGORIES = {
    # Coding / product
    "intelligence artificielle": "coding_ai_agents",
    "developpement logiciel": "coding_software_engineering",
    "developpement web": "coding_software_engineering",
    "developpement de logiciel (saas)": "business_startups_saas",
    "architecture logicielle": "coding_software_engineering",
    "carriere en ingenierie logicielle": "coding_software_engineering",
    "education / informatique": "coding_software_engineering",
    "informatique": "coding_software_engineering",
    "informatique (devops)": "coding_devops_cloud",
    "reseaux informatiques": "coding_devops_cloud",
    "infrastructure it / ia": "coding_devops_cloud",
    "cybersecurite": "coding_security",
    "cybercriminalite": "coding_security",
    "design produit (ux/ui)": "coding_product_design",
    "design graphique": "coding_product_design",
    # Business
    "capital-risque (vc)": "business_fundraising_vc",
    "capital-risque (venture capital)": "business_fundraising_vc",
    "finance (m&a)": "business_private_equity_ma",
    "reprise d'entreprise (m&a)": "business_private_equity_ma",
    "finance / private equity": "business_private_equity_ma",
    "entrepreneuriat / m&a (fusions-acquisitions)": "business_private_equity_ma",
    "finance / acquisition d'entreprises": "business_private_equity_ma",
    "agence web / marketing digital": "business_marketing_sales",
    "marketing b2b": "business_marketing_sales",
    "marketing digital": "business_marketing_sales",
    "economie / marketing": "business_marketing_sales",
    "vente b2b": "business_marketing_sales",
    "mode / retail": "business_marketing_sales",
    "e-commerce": "business_marketing_sales",
    "business / saas": "business_startups_saas",
    "business / tech": "business_startups_saas",
    "business / entrepreneuriat": "business_startups_saas",
    "entrepreneuriat technologique": "business_startups_saas",
    "entrepreneuriat / saas": "business_startups_saas",
    "economie du logiciel (saas)": "business_startups_saas",
    "strategie business": "business_startups_saas",
    "strategie d'entreprise": "business_management_governance",
    "management": "business_management_governance",
    "management / strategie d'entreprise": "business_management_governance",
    "productivite / management": "business_management_governance",
    "leadership": "business_management_governance",
    # Finance
    "finance / cryptomonnaies": "finance_crypto",
    "cryptomonnaies": "finance_crypto",
    "finance decentralisee (defi)": "finance_crypto",
    "finance decentralisee": "finance_crypto",
    "finance / crypto-actifs": "finance_crypto",
    "finance decentralisee / trading": "finance_crypto",
    "trading de cryptomonnaies": "finance_crypto",
    "trading": "finance_portfolio_markets",
    "finance de marche": "finance_portfolio_markets",
    "finance quantitative": "finance_portfolio_markets",
    "finance / bourse": "finance_portfolio_markets",
    "investissement boursier": "finance_portfolio_markets",
    "investissement": "finance_portfolio_markets",
    "finance personnelle": "finance_personal_wealth",
    "finances personnelles": "finance_personal_wealth",
    "education financiere": "finance_personal_wealth",
    "gestion de patrimoine": "finance_personal_wealth",
    "fiscalite d'entreprise": "finance_tax_legal",
    "fiscalite": "finance_tax_legal",
    "fiscalite internationale": "finance_tax_legal",
    "expatriation fiscale": "finance_tax_legal",
    "finance d'entreprise": "finance_corporate_banking",
    "fintech": "finance_corporate_banking",
    "finance internationale": "finance_corporate_banking",
    "finance d'infrastructure": "finance_corporate_banking",
    "technologie / finance": "finance_corporate_banking",
    "immobilier": "finance_real_estate",
    "urbanisme": "finance_real_estate",
    "industrie de la construction": "finance_real_estate",
    "construction / proptech": "finance_real_estate",
    # Research / reference material
    "geopolitique": "research_economics_geopolitics",
    "geopolitique technologique": "research_economics_geopolitics",
    "economie politique": "research_economics_geopolitics",
    "economie internationale": "research_economics_geopolitics",
    "histoire economique": "research_economics_geopolitics",
    "economie des transports": "research_infrastructure_energy",
    "economie de l'energie": "research_infrastructure_energy",
    "energie": "research_infrastructure_energy",
    "telecommunications": "research_infrastructure_energy",
    "technologie spatiale": "research_technology",
    "technologie": "research_technology",
    "histoire de l'informatique": "research_technology",
    "sante / biologie": "research_health_psychology",
    "economie de la sante": "research_health_psychology",
    "psychologie sociale": "research_health_psychology",
    "sociologie du travail": "research_health_psychology",
    "developpement personnel": "research_health_psychology",
    "analyse culturelle": "research_history_culture",
    "histoire": "research_history_culture",
    "philosophie de l'histoire": "research_history_culture",
    "droit penal": "research_general",
}


# Broad source domains such as "Finance" or "Entrepreneuriat" require an
# explicit editorial choice.  These overrides are auditable and stable by
# YouTube video ID instead of depending on incidental wording in a summary.
VIDEO_CATEGORY_OVERRIDES = {
    # Broad Finance domain
    "zaeHzTS6Pck": "business_private_equity_ma",
    "laj--sexNcI": "finance_crypto",
    "WJDGibYHFKg": "business_private_equity_ma",
    "_3C65eZuv1w": "finance_corporate_banking",
    "eZg0UZnaEDY": "finance_corporate_banking",
    "9QweTNq2tOM": "finance_portfolio_markets",
    "G-L8MAC3RXc": "finance_portfolio_markets",
    "gJTiw9qU8RQ": "finance_portfolio_markets",
    "oEC_-YuD6mA": "coding_ai_agents",
    "Yp47tIrAm-s": "business_management_governance",
    "A30_KekfXEA": "finance_corporate_banking",
    "LzRYtdNZKC8": "finance_crypto",
    "9aM2SsQRT5I": "business_private_equity_ma",
    "wQaJmQWfb9U": "finance_portfolio_markets",
    "2Bgg8ADKaUw": "finance_corporate_banking",
    "nyUCVI_JHvQ": "business_fundraising_vc",
    "2jcPoyge6A8": "finance_corporate_banking",
    "i2ir4ZlnkNU": "finance_portfolio_markets",
    # Broad Entrepreneurship domain
    "F0bDM26kZGs": "business_management_governance",
    "mRdXyRYX1aM": "business_startups_saas",
    "6dTdYCRWGXI": "research_health_psychology",
    "5SYRSMDY_vk": "business_private_equity_ma",
    "hxBfoP2WvVs": "business_startups_saas",
    "mSuES0czgRw": "research_economics_geopolitics",
    "yW1cTG3wzCQ": "research_health_psychology",
    "A4T2kjEleQs": "business_fundraising_vc",
    "86LiyytGuA4": "business_private_equity_ma",
    "ZZdfSRK_9sI": "business_private_equity_ma",
    "6KFLGhEAh0A": "business_startups_saas",
    # Broad Economy domain
    "ZFbieeFQA0Y": "research_economics_geopolitics",
    "81slcgZIXgY": "research_economics_geopolitics",
    "qm3RYpurVyQ": "research_economics_geopolitics",
    "R7VmXzAjSqM": "finance_portfolio_markets",
    "UgYnjB2es2s": "research_economics_geopolitics",
    # Intentionally re-routed out of their broad source domains
    "HcVKDYEw7uo": "research_health_psychology",
    "Y4HAWhzu1KQ": "finance_portfolio_markets",
    "4ovPtkSFxuk": "finance_real_estate",
    "gCQ8TEEYiGQ": "finance_real_estate",
    "HS_jjhmrXfY": "business_management_governance",
    "ocCH8a2-ML0": "research_health_psychology",
    "hP1EK6TtT7E": "coding_ai_agents",
    "wWwucO6iu84": "research_health_psychology",
    "kbumKQwcxLI": "research_health_psychology",
    "o4-or2W8qHc": "coding_ai_agents",
    "Pfnq2ikwJSs": "business_management_governance",
    "V77dzdX8uQs": "coding_product_design",
    "IpIAfjyRg5U": "business_startups_saas",
    "S73KLJmPbqE": "business_startups_saas",
    # AI/reverse-engineering sources whose secondary security tags are noisy
    "dnWqOu85fn4": "coding_ai_agents",
    "CZUtIIK4fdw": "coding_ai_agents",
    "ibMU_E7XzBY": "coding_ai_agents",
    "dAzs_rU6080": "coding_ai_agents",
    "_Up4YpZe5H8": "coding_ai_agents",
    "vv4j1NRllGk": "coding_ai_agents",
    # Domain-specific editorial refinements
    "cZSkucl4Png": "business_management_governance",
    "MCR5Zmmg-bE": "business_marketing_sales",
    "2rNDzcQiuoc": "business_management_governance",
    "Ify5AUOHY3s": "business_startups_saas",
    "VazFihoa7AU": "finance_real_estate",
    "CTT7NZgEj9I": "finance_crypto",
    "PP2Np_wCXQM": "business_private_equity_ma",
    "1zW6Uu21Q40": "finance_portfolio_markets",
    "tZctUU1LtOA": "research_infrastructure_energy",
    "0gSBQsuPMaQ": "finance_corporate_banking",
    "MwXoY7hO3Dg": "finance_corporate_banking",
    "Mt_R-oea7e4": "research_history_culture",
    "JtM_iTPJIJw": "research_history_culture",
    "kvvQopagbcs": "research_infrastructure_energy",
    "1SUeJs0Sm8g": "research_technology",
    "TqeE7dem2KI": "business_management_governance",
    "4MAupwjl3pc": "coding_software_engineering",
    "4fS-yQzcclc": "coding_software_engineering",
}


@dataclass
class SourceRecord:
    source_path: Path
    raw: str
    body: str
    video_id: str
    title: str
    url: str
    source_file: str
    original_domain: str
    cold_status: str
    decision: str
    category: str
    pack: str
    has_note: bool
    deep_dive_count: int


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(
        character for character in decomposed if not unicodedata.combining(character)
    ).lower()


def frontmatter_value(raw: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.+)$", raw, re.MULTILINE)
    if not match:
        return ""
    value = match.group(1).strip()
    try:
        parsed = json.loads(value)
        return str(parsed)
    except json.JSONDecodeError:
        return value.strip('"')


def markdown_body(raw: str) -> str:
    match = re.match(r"^---\n[\s\S]*?\n---\n?", raw)
    return raw[match.end() :].lstrip() if match else raw


def section_value(body: str, label: str) -> str:
    pattern = rf"^- \*\*{label}\s*:\*\*\s*`?([^`\n]+?)`?\.?$"
    match = re.search(pattern, body, re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def video_id_from_url(url: str) -> str:
    match = re.search(r"[?&]v=([-_A-Za-z0-9]+)", url)
    return match.group(1) if match else ""


def classify(title: str, domain: str, body: str, video_id: str = "") -> str:
    if video_id in VIDEO_CATEGORY_OVERRIDES:
        return VIDEO_CATEGORY_OVERRIDES[video_id]

    normalized_domain = normalize(domain)
    if normalized_domain in DOMAIN_CATEGORIES:
        return DOMAIN_CATEGORIES[normalized_domain]

    # Only use the title for genuinely broad or previously unseen domains.
    # Secondary tags remain useful metadata but are intentionally excluded from
    # routing because they caused cross-domain false positives during dry runs.
    text = normalize(title)
    if any(word in text for word in ("chatgpt", "claude", "openai", "gemini", " ai ", "ia ")):
        return "coding_ai_agents"
    if any(word in text for word in ("bitcoin", "crypto", "memecoin")):
        return "finance_crypto"
    if any(word in text for word in ("stock", "trading", "market", "investor", "silver", "gold")):
        return "finance_portfolio_markets"
    if any(
        word in text for word in ("private equity", "acquire", "buy a business", "holding company")
    ):
        return "business_private_equity_ma"
    if any(word in text for word in ("startup", "saas", "entrepreneur", "business")):
        return "business_startups_saas"
    if any(word in text for word in ("tax", "fiscal", "insurance")):
        return "finance_tax_legal"
    if any(word in text for word in ("bank", "finance", "money")):
        return "finance_corporate_banking"
    if any(word in text for word in ("debt", "econom", "china", "country")):
        return "research_economics_geopolitics"
    return "research_general"


def add_frontmatter(raw: str, fields: dict[str, str]) -> str:
    match = re.match(r"^---\n([\s\S]*?)\n---\n?", raw)
    existing_lines = match.group(1).splitlines() if match else []
    ordered: list[tuple[str, str]] = []
    seen: set[str] = set()
    for line in existing_lines:
        key_match = re.match(r"^([A-Za-z0-9_]+):", line)
        if not key_match:
            continue
        key = key_match.group(1)
        value = fields.get(key, line.split(":", 1)[1].strip())
        ordered.append((key, value))
        seen.add(key)
    for key, value in fields.items():
        if key not in seen:
            ordered.append((key, value))
    body = markdown_body(raw)
    frontmatter = "\n".join(f"{key}: {value}" for key, value in ordered)
    return f"---\n{frontmatter}\n---\n\n{body.rstrip()}\n"


def record_from_raw(
    path: Path,
    raw: str,
    decision: str,
    source_file: str = "",
    deep_dive_count: int = 0,
) -> SourceRecord:
    body = markdown_body(raw)
    title = frontmatter_value(raw, "title")
    url = frontmatter_value(raw, "url")
    video_id = frontmatter_value(raw, "video_id") or video_id_from_url(url)
    original_domain = section_value(body, "Domaine principal") or "Non classé par la source"
    cold_status = section_value(body, "Statut source froide") or "to_review"
    category = classify(title, original_domain, body, video_id)
    return SourceRecord(
        source_path=path,
        raw=raw,
        body=body,
        video_id=video_id,
        title=title,
        url=url,
        source_file=source_file or frontmatter_value(raw, "source_file"),
        original_domain=original_domain,
        cold_status=cold_status,
        decision=decision,
        category=category,
        pack=CATEGORY_PACKS[category],
        has_note="\n## Note personnelle\n" in raw,
        deep_dive_count=deep_dive_count,
    )


def section(raw: str, heading: str) -> str:
    match = re.search(rf"^## {re.escape(heading)}\s*$\n([\s\S]*?)(?=^## |\Z)", raw, re.MULTILINE)
    return match.group(1).strip() if match else ""


def read_records(repo: Path, vault: Path) -> tuple[list[SourceRecord], list[dict[str, str]]]:
    export_root = vault / "inbox" / "to_process" / f"transcript-export-{RECEIPT}"
    export_videos = export_root / "videos"
    if not export_videos.is_dir():
        raise RuntimeError(f"Export source absent: {export_videos}")

    records: list[SourceRecord] = []
    exported_video_ids: set[str] = set()
    session_path = repo / "cache" / "web_review_sessions" / "youtube-dc9d5920069de317ef51.json"
    session = json.loads(session_path.read_text(encoding="utf-8"))
    notes_by_video = {
        re.sub(r"-\d{3}$", "", key): value.strip()
        for key, value in session.get("notes", {}).items()
        if isinstance(value, str) and value.strip()
    }
    dives_by_video = {
        re.sub(r"-\d{3}$", "", key): len(value)
        for key, value in session.get("deepDives", {}).items()
        if isinstance(value, list) and value
    }
    for path in sorted(export_videos.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        exported_id = frontmatter_value(raw, "video_id")
        record = record_from_raw(
            path,
            raw,
            "keep",
            deep_dive_count=dives_by_video.get(exported_id, 0),
        )
        if not record.video_id or not record.title or not record.url:
            raise RuntimeError(f"Métadonnées incomplètes: {path}")
        if record.video_id in exported_video_ids:
            raise RuntimeError(f"ID vidéo dupliqué: {record.video_id}")
        expected_note = notes_by_video.get(record.video_id, "")
        if expected_note and expected_note not in raw:
            raise RuntimeError(f"Note personnelle absente de l'export: {record.video_id}")
        exported_video_ids.add(record.video_id)
        records.append(record)

    manifest_path = repo / "cache" / "jobs" / "playlist-40_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_by_id = {
        video_id_from_url(item.get("url", "")): item for item in manifest.get("videos", [])
    }
    recovered_ids = {
        video_id
        for video_id in ORIGINAL_FAILURE_IDS
        if manifest_by_id.get(video_id, {}).get("status") == "done"
    }
    remaining_failures = [
        {
            "video_id": video_id,
            "title": manifest_by_id.get(video_id, {}).get("title", video_id),
            "url": manifest_by_id.get(video_id, {}).get(
                "url", f"https://www.youtube.com/watch?v={video_id}"
            ),
            "error": manifest_by_id.get(video_id, {}).get("error", "Échec non détaillé"),
        }
        for video_id in sorted(ORIGINAL_FAILURE_IDS)
        if manifest_by_id.get(video_id, {}).get("status") != "done"
    ]

    output_dir = repo / "output" / "videos" / "playlist-40"
    outputs_by_id: dict[str, Path] = {}
    for path in output_dir.glob("*.md"):
        raw = path.read_text(encoding="utf-8")
        outputs_by_id[video_id_from_url(frontmatter_value(raw, "url"))] = path
    for video_id in sorted(recovered_ids):
        path = outputs_by_id.get(video_id)
        if not path:
            raise RuntimeError(f"Résumé récupéré absent: {video_id}")
        raw = path.read_text(encoding="utf-8")
        records.append(
            record_from_raw(
                path,
                raw,
                "unreviewed_recovered",
                source_file=str(path.relative_to(repo)),
            )
        )
    return records, remaining_failures


def target_filename(record: SourceRecord) -> str:
    if record.source_file:
        return Path(record.source_file).name
    return record.source_path.name


def render_inventory(records: list[SourceRecord], failures: list[dict[str, str]]) -> str:
    decisions = Counter(record.decision for record in records)
    categories = Counter(record.category for record in records)
    packs = Counter(record.pack for record in records)
    notes = sum(record.has_note for record in records)
    dives = sum(record.deep_dive_count for record in records)
    lines = [
        "---",
        "type: source_batch_inventory",
        "status: processed_with_caveats",
        "domain: multidisciplinary",
        f"created: {IMPORTED_AT}",
        "tags: [#youtube, #playlist_40, #summarizer, #source_research]",
        "---",
        "",
        "# Playlist 40 — inventaire classé",
        "",
        "## Source",
        "",
        f"- Reçu Transcript : `{RECEIPT}`.",
        "- Playlist : `https://www.youtube.com/playlist?list=PLKJI73lecGR8`.",
        "- Les résumés viennent du pipeline local Summarizer ; les vidéos YouTube restent des sources secondaires.",
        "",
        "## Résultat",
        "",
        f"- {decisions['keep']} vidéos explicitement gardées et importées.",
        f"- {decisions['unreviewed_recovered']} vidéos récupérées après erreur Gemini, classées `unreviewed_recovered` sans décision Garder/Écarter inventée.",
        f"- {len(failures)} vidéos toujours indisponibles, tracées dans `inbox/to_review/playlist-40-unavailable-videos.md`.",
        f"- {notes} notes personnelles et {dives} tours d'approfondissement IA conservés dans les fiches importées.",
        "",
        "## Classement canonique",
        "",
        "| Catégorie | Nombre | Pack de référence |",
        "| --- | ---: | --- |",
    ]
    for category, count in sorted(categories.items()):
        lines.append(f"| `{category}` | {count} | `{CATEGORY_PACKS[category]}` |")
    lines.extend(["", "## Packs reliés", ""])
    for pack, count in sorted(packs.items()):
        lines.append(f"- `{pack}` : {count} sources.")
    lines.extend(
        [
            "",
            "## Limites",
            "",
            "- Le classement canonique organise les sources ; il ne valide pas leurs affirmations.",
            "- Finance, fiscalité, droit, santé, cybersécurité et produits temporels exigent des sources primaires avant application.",
            "- Les catégories d'origine générées par le résumé sont conservées dans le manifeste pour audit.",
            "- Les vidéos récupérées après l'export initial restent à revoir dans l'interface ; aucune décision utilisateur n'a été simulée.",
            "",
        ]
    )
    return "\n".join(lines)


def render_failures(failures: list[dict[str, str]]) -> str:
    lines = [
        "---",
        "type: source_failure_register",
        "status: to_review",
        f"created: {IMPORTED_AT}",
        "tags: [#youtube, #playlist_40, #source_unavailable]",
        "---",
        "",
        "# Playlist 40 — vidéos indisponibles",
        "",
        "Ces vidéos n'ont pas de résumé classable. Aucun contenu n'a été inventé.",
        "",
        "| Vidéo | URL | Motif |",
        "| --- | --- | --- |",
    ]
    for item in failures:
        reason = re.sub(r"\s+", " ", item["error"]).replace("|", "\\|")
        title = item["title"].replace("|", "\\|")
        lines.append(f"| {title} | {item['url']} | {reason} |")
    lines.extend(["", "Statut : `to_review`.", ""])
    return "\n".join(lines)


def render_pack_section(pack: str, records: list[SourceRecord]) -> str:
    categories = sorted({record.category for record in records})
    kept = sum(record.decision == "keep" for record in records)
    recovered = sum(record.decision == "unreviewed_recovered" for record in records)
    return "\n".join(
        [
            "",
            "<!-- playlist-40-import:start -->",
            "## 2026-11-15 - Playlist 40 - sources classées",
            "",
            f"- Sources : {kept} vidéos gardées"
            + (f" et {recovered} récupérées à revoir" if recovered else "")
            + ".",
            "- Inventaire : `knowledge_pool/research/sources/youtube_batches/2026-11-15-playlist-40-selected.md`.",
            "- Sources froides : `knowledge_pool/research/sources/summarizer_outputs/playlist_40_selected/`.",
            f"- Catégories : {', '.join(f'`{category}`' for category in categories)}.",
            f"- Usage : {PACK_USAGE.get(pack, 'veille et recherche secondaire à vérifier')}.",
            "- Limites : résumés YouTube secondaires ; chiffres, causalités, produits, règles et recommandations doivent être vérifiés avec des sources primaires datées.",
            "- Statut : `source_research` / `to_review` ; aucune décision d'exécution ou recommandation validée.",
            "<!-- playlist-40-import:end -->",
            "",
        ]
    )


def replace_marked_section(current: str, replacement: str) -> str:
    pattern = re.compile(
        r"\n?<!-- playlist-40-import:start -->[\s\S]*?<!-- playlist-40-import:end -->\n?"
    )
    if pattern.search(current):
        return pattern.sub("\n" + replacement.strip() + "\n", current).rstrip() + "\n"
    return current.rstrip() + "\n" + replacement


def write_atomically(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def process(repo: Path, vault: Path, apply: bool) -> dict[str, object]:
    records, failures = read_records(repo, vault)
    kept = [record for record in records if record.decision == "keep"]
    recovered = [record for record in records if record.decision == "unreviewed_recovered"]
    if len(kept) != 169:
        raise RuntimeError(f"169 vidéos gardées attendues, {len(kept)} trouvées.")

    final_root = (
        vault
        / "knowledge_pool"
        / "research"
        / "sources"
        / "summarizer_outputs"
        / "playlist_40_selected"
    )
    inventory_path = (
        vault
        / "knowledge_pool"
        / "research"
        / "sources"
        / "youtube_batches"
        / "2026-11-15-playlist-40-selected.md"
    )
    failure_path = vault / "inbox" / "to_review" / "playlist-40-unavailable-videos.md"
    export_root = vault / "inbox" / "to_process" / f"transcript-export-{RECEIPT}"
    processed_root = vault / "inbox" / "processed" / export_root.name
    temp_root = final_root.with_name(f".{final_root.name}.tmp")

    summary = {
        "kept": len(kept),
        "recovered_pending_review": len(recovered),
        "remaining_failures": len(failures),
        "notes": sum(record.has_note for record in records),
        "deep_dive_turns": sum(record.deep_dive_count for record in records),
        "categories": dict(sorted(Counter(record.category for record in records).items())),
        "packs": dict(sorted(Counter(record.pack for record in records).items())),
        "final_root": str(final_root),
        "processed_receipt": str(processed_root),
    }
    if not apply:
        return summary
    if final_root.exists() or temp_root.exists() or processed_root.exists():
        raise RuntimeError(
            "Une destination Playlist 40 existe déjà ; arrêt pour éviter tout écrasement."
        )

    temp_root.mkdir(parents=True)
    moved_sources: list[tuple[Path, Path, str]] = []
    try:
        manifest_rows = []
        for record in records:
            target = temp_root / record.category / target_filename(record)
            target.parent.mkdir(parents=True, exist_ok=True)
            if record.decision == "keep":
                shutil.move(str(record.source_path), str(target))
                moved_sources.append((record.source_path, target, record.raw))
            else:
                shutil.copy2(record.source_path, target)
            fields = {
                "type": "source_research_video",
                "status": "source_research",
                "source_batch": json.dumps(BATCH, ensure_ascii=False),
                "source_receipt": json.dumps(RECEIPT, ensure_ascii=False),
                "user_review_decision": json.dumps(record.decision, ensure_ascii=False),
                "canonical_category": json.dumps(record.category, ensure_ascii=False),
                "canonical_pack": json.dumps(record.pack, ensure_ascii=False),
                "source_cold_status": json.dumps(record.cold_status, ensure_ascii=False),
                "imported_at": json.dumps(IMPORTED_AT),
            }
            transformed = add_frontmatter(record.raw, fields)
            write_atomically(target, transformed)
            if (
                hashlib.sha256(markdown_body(transformed).encode()).hexdigest()
                != hashlib.sha256(record.body.encode()).hexdigest()
            ):
                raise RuntimeError(f"Le corps Markdown a changé: {record.video_id}")
            manifest_rows.append(
                {
                    "video_id": record.video_id,
                    "title": record.title,
                    "url": record.url,
                    "user_review_decision": record.decision,
                    "original_domain": record.original_domain,
                    "canonical_category": record.category,
                    "canonical_pack": record.pack,
                    "source_cold_status": record.cold_status,
                    "has_note": record.has_note,
                    "deep_dive_count": record.deep_dive_count,
                    "file": str(Path(record.category) / target.name),
                    "body_sha256": hashlib.sha256(record.body.encode()).hexdigest(),
                }
            )

        write_atomically(temp_root / "README.md", render_inventory(records, failures))
        write_atomically(
            temp_root / "CLASSIFICATION_MANIFEST.json",
            json.dumps(
                {
                    "receipt_id": RECEIPT,
                    "playlist": BATCH,
                    "imported_at": IMPORTED_AT,
                    "summary": summary,
                    "sources": manifest_rows,
                    "remaining_failures": failures,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
        )
        temp_root.replace(final_root)
    except Exception:
        for original, moved, original_raw in reversed(moved_sources):
            actual = final_root / moved.relative_to(temp_root) if final_root.exists() else moved
            if actual.exists():
                original.parent.mkdir(parents=True, exist_ok=True)
                original.write_text(original_raw, encoding="utf-8")
                actual.unlink()
        if temp_root.exists():
            shutil.rmtree(temp_root)
        if final_root.exists():
            shutil.rmtree(final_root)
        raise

    write_atomically(inventory_path, render_inventory(records, failures))
    write_atomically(failure_path, render_failures(failures))

    by_pack: dict[str, list[SourceRecord]] = defaultdict(list)
    for record in records:
        if record.pack != "knowledge_pool/research":
            by_pack[record.pack].append(record)
    for pack, pack_records in by_pack.items():
        index_path = vault / pack / "SOURCE_INDEX.md"
        if not index_path.exists():
            raise RuntimeError(f"Index de pack absent: {index_path}")
        current = index_path.read_text(encoding="utf-8")
        write_atomically(
            index_path, replace_marked_section(current, render_pack_section(pack, pack_records))
        )

    videos_dir = export_root / "videos"
    if videos_dir.exists() and not any(videos_dir.iterdir()):
        videos_dir.rmdir()
    manifest_path = export_root / "manifest.json"
    if manifest_path.exists():
        receipt_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        receipt_manifest.update(
            status="processed",
            categorized_count=len(records),
            categorized_at=IMPORTED_AT,
            inventory=str(inventory_path.relative_to(vault)),
        )
        write_atomically(
            manifest_path, json.dumps(receipt_manifest, ensure_ascii=False, indent=2) + "\n"
        )
    report = (
        "# Traitement Playlist 40\n\n"
        f"- {len(kept)} sources gardées déplacées vers `{final_root.relative_to(vault)}`.\n"
        f"- {len(recovered)} sources récupérées copiées avec statut `unreviewed_recovered`.\n"
        f"- {len(failures)} échecs conservés dans `{failure_path.relative_to(vault)}`.\n"
        "- Les notes et approfondissements ont été conservés dans leur fiche source.\n"
    )
    write_atomically(export_root / "PROCESSING_REPORT.md", report)
    processed_root.parent.mkdir(parents=True, exist_ok=True)
    export_root.replace(processed_root)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Classer l'export Playlist 40 dans Maxi Brain.")
    parser.add_argument("--repo", type=Path, default=Path("/Users/insular/transcripts"))
    parser.add_argument("--vault", type=Path, default=Path("/Users/insular/Graphipy maxi brain"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    result = process(args.repo.resolve(), args.vault.resolve(), args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
