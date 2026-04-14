"""
Identification IMDB depuis un nom de torrent.

Stratégie (dans l'ordre de fiabilité) :
1. parse-torrent-name (PTN) pour extraire titre + année proprement
2. Lookup Radarr /api/v3/movie/lookup comme proxy TMDB
3. Lookup Sonarr /api/v3/series/lookup pour les séries
4. Retour None si aucun match suffisant
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import TYPE_CHECKING, Optional

try:
    import PTN  # parse-torrent-name
    _PTN_AVAILABLE = True
except ImportError:
    _PTN_AVAILABLE = False

if TYPE_CHECKING:
    from .radarr import RadarrClient
    from .sonarr import SonarrClient

logger = logging.getLogger(__name__)

# Regex de nettoyage pour fallback si PTN non disponible
_QUALITY_RE = re.compile(
    r"\b(?:multi|vff?|vostfr|truefrench|french|english|dubbed|subbed"
    r"|bluray|blu[-.]?ray|webrip|web[-.]?dl|web|hdtv|hdrip|bdrip|dvdrip"
    r"|4k(?:light)?|uhd|remux|hdr(?:10(?:plus)?)?|sdr|dolby\.?vision|atmos|dv"
    r"|2160p|1080p|720p|480p|576p"
    r"|x26[45]|h\.?26[45]|avc|hevc|av1|10bit|8bit"
    r"|truehd|eac3|ddp?|dd5|dts|flac|opus|aac|ac3"
    r"|5\.1|7\.1|2\.0"
    r"|proper|repack|extended|theatrical|unrated|directors|edition|cut)\b",
    re.IGNORECASE,
)


def extract_title_year(torrent_name: str) -> tuple[str, Optional[int]]:
    """
    Extrait un titre lisible et une année depuis un nom de torrent.
    Utilise PTN si disponible, sinon fallback regex.
    """
    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            title: str = parsed.get("title") or ""
            year: Optional[int] = parsed.get("year")
            if title:
                return title.strip(), year
        except Exception:
            pass

    # Fallback : nettoyage regex
    name = torrent_name
    # Retirer extension
    name = re.sub(r"\.[a-z0-9]{2,4}$", "", name, flags=re.IGNORECASE)
    # Capturer l'année si présente avant de la retirer
    year_match = re.search(r"\b(19|20)\d{2}\b", name)
    year_int: Optional[int] = int(year_match.group()) if year_match else None
    # Retirer tags qualité
    name = _QUALITY_RE.sub(" ", name)
    # Retirer l'année du titre
    name = re.sub(r"\b(19|20)\d{2}\b", " ", name)
    # Normaliser les séparateurs
    name = re.sub(r"[._\-\[\](){}+]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name, year_int


def _normalize(s: str) -> str:
    """Normalise une chaîne pour comparaison : minuscules, sans accents, sans ponctuation."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _title_match_score(a: str, b: str) -> float:
    """Score de similarité entre deux titres (0.0–1.0)."""
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0

    tokens_a = set(na.split())
    tokens_b = set(nb.split())
    if not tokens_a or not tokens_b:
        return 0.0

    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)  # Jaccard similarity


async def resolve_imdb_from_torrent(
    torrent_name: str,
    radarr_client: Optional["RadarrClient"] = None,
    sonarr_client: Optional["SonarrClient"] = None,
) -> tuple[Optional[str], Optional[str], Optional[int]]:
    """
    Tente de résoudre l'IMDB ID d'un torrent.

    Returns (imdb_id, guessed_title, guessed_year).
    imdb_id peut être None si non trouvé.
    """
    title, year = extract_title_year(torrent_name)
    if not title:
        return None, None, year

    best_imdb: Optional[str] = None
    best_score: float = 0.0
    threshold = 0.6  # score minimum pour accepter un match

    # Essai Radarr en premier (films)
    if radarr_client:
        try:
            results = await radarr_client.lookup_movie(title)
            for r in results[:10]:  # limiter à 10 résultats
                candidate_title = r.get("title", "")
                candidate_year = r.get("year")
                imdb = r.get("imdbId") or None

                # Gate année : doit correspondre si on en a une
                if year and candidate_year and abs(candidate_year - year) > 1:
                    continue

                score = _title_match_score(title, candidate_title)
                if score > best_score and score >= threshold:
                    best_score = score
                    best_imdb = imdb
        except Exception as e:
            logger.debug("Radarr lookup failed for '%s': %s", title, e)

    # Essai Sonarr si pas trouvé (séries)
    if not best_imdb and sonarr_client:
        try:
            results = await sonarr_client.lookup_series(title)
            for r in results[:10]:
                candidate_title = r.get("title", "")
                candidate_year = r.get("year")
                imdb = r.get("imdbId") or None

                if year and candidate_year and abs(candidate_year - year) > 1:
                    continue

                score = _title_match_score(title, candidate_title)
                if score > best_score and score >= threshold:
                    best_score = score
                    best_imdb = imdb
        except Exception as e:
            logger.debug("Sonarr lookup failed for '%s': %s", title, e)

    return best_imdb, title, year
