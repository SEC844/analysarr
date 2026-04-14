"""
Identification IMDB depuis un nom de torrent.

Stratégie (priorité décroissante) :
1. IMDB inline : le nom contient tt1234567 → match direct par IMDB ID
2. PTN/regex  : extrait titre + année du nom de torrent
3. Matching en mémoire contre les titres Radarr/Sonarr (O(n), sans API)
   - Score Jaccard + bonus année + bonus articles
4. Fallback API : Radarr lookup_movie / Sonarr lookup_series comme proxy TMDB/TVDB
   → renvoie IMDB ID → re-match contre bibliothèque par IMDB
5. Fallback final : retourne le meilleur IMDB trouvé par API même sans match biblio

Inspiré de l'approche Radarr/Sonarr : parser le nom, chercher via TMDB proxy,
réconcilier par IMDB ID plutôt que par titre (beaucoup plus fiable).
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import TYPE_CHECKING, Optional

try:
    import PTN
    _PTN_AVAILABLE = True
except ImportError:
    _PTN_AVAILABLE = False

if TYPE_CHECKING:
    from ..models.schemas import RadarrMovie, SonarrSeries
    from .radarr import RadarrClient
    from .sonarr import SonarrClient

logger = logging.getLogger(__name__)

# ── Patterns regex ────────────────────────────────────────────────────────────

# IMDB ID directement dans le nom (ex: "Film.Name.tt1234567.mkv")
_IMDB_RE = re.compile(r'\b(tt\d{7,8})\b', re.IGNORECASE)

_QUALITY_RE = re.compile(
    r"\b(?:multi|vff?|vostfr|truefrench|french|english|dubbed|subbed"
    r"|bluray|blu[-.]?ray|webrip|web[-.]?dl|web|hdtv|hdrip|bdrip|dvdrip"
    r"|4k(?:light)?|uhd|remux|hdr(?:10(?:plus)?)?|sdr|dolby\.?vision|atmos|dv"
    r"|2160p|1080p|720p|480p|576p"
    r"|x26[45]|h\.?26[45]|avc|hevc|av1|10bit|8bit"
    r"|truehd|eac3|ddp?|dd5|dts|flac|opus|aac|ac3"
    r"|5\.1|7\.1|2\.0"
    r"|proper|repack|extended|theatrical|unrated|directors|edition|cut|complete)\b",
    re.IGNORECASE,
)

_ARTICLES = {"the", "a", "an", "le", "la", "les", "un", "une", "des", "l"}


# ── Extraction ────────────────────────────────────────────────────────────────

def extract_imdb_from_name(torrent_name: str) -> Optional[str]:
    """Extrait un IMDB ID directement si présent dans le nom (tt1234567)."""
    m = _IMDB_RE.search(torrent_name)
    return m.group(1) if m else None


def extract_title_year(torrent_name: str) -> tuple[str, Optional[int]]:
    """Extrait titre lisible + année depuis un nom de torrent."""
    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            title: str = parsed.get("title") or ""
            year: Optional[int] = parsed.get("year")
            if title:
                return title.strip(), year
        except Exception:
            pass

    # Fallback regex
    name = torrent_name
    name = re.sub(r"\.[a-z0-9]{2,4}$", "", name, flags=re.IGNORECASE)
    year_match = re.search(r"\b(19|20)\d{2}\b", name)
    year_int: Optional[int] = int(year_match.group()) if year_match else None
    name = re.sub(r"\b[Ss]\d{1,2}[Ee]\d{1,2}\b.*$", "", name)
    name = _QUALITY_RE.sub(" ", name)
    name = re.sub(r"\b(19|20)\d{2}\b", " ", name)
    name = re.sub(r"[._\-\[\](){}+]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name, year_int


def is_episode(torrent_name: str) -> bool:
    """True si le torrent semble être un épisode de série (S01E01, saison…)."""
    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            return bool(parsed.get("season") or parsed.get("episode"))
        except Exception:
            pass
    return bool(re.search(r"\b[Ss]\d{1,2}[Ee]\d{1,2}\b", torrent_name))


# ── Scoring ───────────────────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    """Minuscules, sans accents, sans ponctuation."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _tokens_no_articles(s: str) -> set[str]:
    return {t for t in _normalize(s).split() if t not in _ARTICLES}


def _title_score(a: str, b: str) -> float:
    """Score 0-1 combinant Jaccard et bonus correspondance sans articles."""
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0

    tokens_a = set(na.split())
    tokens_b = set(nb.split())
    jaccard = len(tokens_a & tokens_b) / len(tokens_a | tokens_b) if (tokens_a | tokens_b) else 0.0

    ta = _tokens_no_articles(a)
    tb = _tokens_no_articles(b)
    if ta and tb and ta == tb:
        jaccard = min(1.0, jaccard + 0.15)

    return jaccard


def _find_best(
    title: str,
    year: Optional[int],
    candidates: list[tuple[str, str, int, Optional[str]]],  # (id, title, year, imdb)
    threshold: float = 0.50,
) -> Optional[tuple[str, str, Optional[str]]]:  # (media_id, title, imdb)
    best_score = 0.0
    best: Optional[tuple[str, str, Optional[str]]] = None

    for media_id, ctitle, cyear, imdb in candidates:
        # Filtre année strict (±1 an) seulement si les deux années sont connues
        if year and cyear and abs(cyear - year) > 1:
            continue

        score = _title_score(title, ctitle)

        # Bonus si année exacte
        if year and cyear and year == cyear:
            score = min(1.0, score + 0.10)

        if score > best_score and score >= threshold:
            best_score = score
            best = (media_id, ctitle, imdb)

    return best


# ── Matching principal (en mémoire — O(n), pas d'appel API) ──────────────────

def match_against_known_media(
    torrent_name: str,
    movies: list["RadarrMovie"],
    series: list["SonarrSeries"],
) -> tuple[Optional[str], Optional[str], Optional[int], Optional[str]]:
    """
    Associe un torrent à un média connu (Radarr/Sonarr) sans appel réseau.

    Stratégie :
    1. IMDB inline dans le nom → match direct par IMDB ID
    2. Titre + année → scoring Jaccard contre biblio

    Returns : (media_id, guessed_title, guessed_year, imdb_id)
    media_id = "radarr_123" ou "sonarr_456", None si pas de match.
    """
    # ── Étape 0 : IMDB inline (tt1234567 dans le nom) ─────────────────────────
    inline_imdb = extract_imdb_from_name(torrent_name)
    if inline_imdb:
        for m in movies:
            if m.imdb_id and m.imdb_id.lower() == inline_imdb.lower():
                return f"radarr_{m.id}", m.title, m.year, m.imdb_id
        for s in series:
            if s.imdb_id and s.imdb_id.lower() == inline_imdb.lower():
                return f"sonarr_{s.id}", s.title, s.year, s.imdb_id
        # IMDB trouvé mais pas dans la bibliothèque — on le retourne quand même
        title, year = extract_title_year(torrent_name)
        return None, title, year, inline_imdb

    # ── Étape 1 : extraction titre + année ────────────────────────────────────
    title, year = extract_title_year(torrent_name)
    if not title:
        return None, None, year, None

    episode = is_episode(torrent_name)

    movie_candidates  = [(f"radarr_{m.id}", m.title, m.year, m.imdb_id) for m in movies]
    series_candidates = [(f"sonarr_{s.id}", s.title, s.year, s.imdb_id) for s in series]

    # Séries en premier si épisode détecté, films sinon
    primary, secondary = (series_candidates, movie_candidates) if episode else (movie_candidates, series_candidates)

    match = _find_best(title, year, primary) or _find_best(title, year, secondary)

    if match:
        media_id, matched_title, imdb_id = match
        return media_id, title, year, imdb_id

    return None, title, year, None


# ── Fallback API via Radarr/Sonarr (proxy TMDB/TVDB) ─────────────────────────

async def resolve_imdb_from_torrent(
    torrent_name: str,
    radarr_client: Optional["RadarrClient"] = None,
    sonarr_client: Optional["SonarrClient"] = None,
) -> tuple[Optional[str], Optional[str], Optional[int]]:
    """
    Résolution IMDB via les API Radarr/Sonarr (proxy TMDB/TVDB).

    Radarr/Sonarr acceptent :
    - une recherche texte : "Avatar 2009"
    - une recherche par IMDB : "imdb:tt0499549"

    Retourne (imdb_id, guessed_title, guessed_year).
    """
    # IMDB inline → lookup direct par ID (très fiable)
    inline_imdb = extract_imdb_from_name(torrent_name)
    if inline_imdb:
        return inline_imdb, None, None

    title, year = extract_title_year(torrent_name)
    if not title:
        return None, None, year

    episode = is_episode(torrent_name)
    best_imdb: Optional[str] = None
    best_score = 0.0
    threshold = 0.50

    # Inclure l'année dans le terme de recherche pour plus de précision
    search_term = f"{title} {year}" if year else title

    async def _search(client, method: str) -> None:
        nonlocal best_imdb, best_score
        try:
            results = await getattr(client, method)(search_term)
            for r in results[:20]:
                ctitle = r.get("title", "")
                cyear = r.get("year")
                imdb = r.get("imdbId") or None
                if year and cyear and abs(cyear - year) > 1:
                    continue
                score = _title_score(title, ctitle)
                if year and cyear and year == cyear:
                    score = min(1.0, score + 0.10)
                if score > best_score and score >= threshold and imdb:
                    best_score = score
                    best_imdb = imdb
        except Exception as e:
            logger.debug("Lookup failed for '%s': %s", title, e)

    if episode:
        if sonarr_client:
            await _search(sonarr_client, "lookup_series")
        if not best_imdb and radarr_client:
            await _search(radarr_client, "lookup_movie")
    else:
        if radarr_client:
            await _search(radarr_client, "lookup_movie")
        if not best_imdb and sonarr_client:
            await _search(sonarr_client, "lookup_series")

    return best_imdb, title, year
