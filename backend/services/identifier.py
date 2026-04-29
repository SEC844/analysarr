"""
Identification IMDB/TVDB/TMDB depuis un nom de torrent.

Méthode inspirée de Radarr/Sonarr (Parser.cs, MIT). Pas de score fuzzy :
la comparaison se fait après normalisation stricte (minuscules, sans accents,
sans ponctuation, sans articles). Deux titres match si leurs versions normalisées
sont égales, ou si l'une est contenue dans l'autre (min 4 chars, ratio ≥ 50 %).

Stratégie (priorité décroissante) :
1. IMDB inline   : le nom contient tt1234567 → match direct par IMDB ID
2. TVDB inline   : le nom contient {tvdb-12345} ou tvdb12345 → match série
3. TMDB inline   : le nom contient {tmdb-12345} ou tmdb12345 → match film
4. Parsing regex Radarr-style : titre avant l'année (19|20)\\d{2}, nettoyage
   des tokens de qualité, puis comparaison par normalisation contre :
     - le titre principal de chaque média
     - TOUS ses titres alternatifs (titres étrangers inclus, fournis par Radarr/Sonarr)
5. Fallback API  : Radarr lookup_movie / Sonarr lookup_series comme proxy TMDB/TVDB
   → renvoie IMDB ID → re-match par IMDB contre la bibliothèque locale
"""
from __future__ import annotations

import logging
import os
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

# TVDB ID : {tvdb-12345}, [tvdb-12345], tvdb12345, tvdb:12345
_TVDB_RE = re.compile(r'(?:tvdb[-:_]?)(\d{4,})', re.IGNORECASE)

# TMDB ID : {tmdb-12345}, [tmdb-12345], tmdb12345, tmdb:12345
_TMDB_RE = re.compile(r'(?:tmdb[-:_]?)(\d{4,})', re.IGNORECASE)

# Tokens de qualité à supprimer avant d'extraire le titre — exhaustif pour
# les releases françaises + internationales, inspiré de Radarr Parser.cs.
_QUALITY_TOKENS = re.compile(
    r'\b(?:'
    # Résolution
    r'2160p|1080p|1080i|720p|720i|576p|480p|4k|uhd'
    r'|upscaled?|remastered?'
    # Source
    r'|blu[-. ]?ray|bluray|bdrip|brrip|bdremux|remux'
    r'|web[-. ]?dl|webrip|web'
    r'|hdtv|pdtv|dsr|tvrip|dvdrip|dvdscr|dvd'
    r'|hdrip|hd[-. ]?rip'
    r'|cam|ts|tc|r5|scr|workprint'
    # Codec vidéo
    r'|x264|x265|h264|h265|h\.264|h\.265|hevc|avc|av1|xvid|divx|mpeg2'
    r'|10bit|8bit|hdr(?:10(?:plus)?)?|dolby\.?vision|dv|sdr|hlg'
    # Codec audio
    r'|truehd|eac3|ddp?|dd5|dd7|dts[-. ]?(?:hd|ma|x)?|flac|opus|aac|ac3|mp3'
    r'|5\.1|7\.1|2\.0|atmos'
    # Langue (FR important)
    r'|multi(?:[-. ]?(?:vf|vff|vo|sub))?'
    r'|vff?|vostfr|truefrench|french|english|german|spanish|italian'
    r'|subfrench|dubbed|subbed'
    # Edition
    r'|extended|theatrical|unrated|directors?\.?cut|final\.?cut|imax'
    r'|proper|repack|real|read\.?nfo|nfofix'
    r'|complete|limited|retail'
    r')\b',
    re.IGNORECASE,
)

# Regex principale : titre jusqu'à l'année (inspirée de Radarr Parser.cs).
_TITLE_YEAR_RE = re.compile(
    r'^(?P<title>(?![(\[]).+?)'
    r'[\s._\-()\[\]]+'
    r'(?P<year>(?:19|20)\d{2})(?!p|i|\])'
    r'(?:[\s._\-()\[\]]|$)',
    re.IGNORECASE,
)

# Regex secondaire : [Group] Title (Year) — releases anime
_ANIME_RE = re.compile(
    r'^\[(?P<group>[^\]]+)\][-_. ]?(?P<title>.+?)(?:[-_. ]+(?P<year>(?:19|20)\d{2}))?(?:\[.+\])?$',
    re.IGNORECASE,
)

# Articles à supprimer lors de la normalisation (Radarr NormalizeRegex)
_ARTICLES_RE = re.compile(
    r'\b(?:a|an|the|le|la|les|un|une|des|l|el|los|las|o|os|as|il|i|lo|gli)\b',
    re.IGNORECASE,
)


# ── Extraction IDs ─────────────────────────────────────────────────────────────

def extract_imdb_from_name(torrent_name: str) -> Optional[str]:
    """Extrait un IMDB ID directement si présent dans le nom (tt1234567)."""
    m = _IMDB_RE.search(torrent_name)
    return m.group(1) if m else None


def _extract_tvdb_from_name(torrent_name: str) -> Optional[int]:
    """Extrait un TVDB ID si présent dans le nom ({tvdb-12345}, tvdb12345…)."""
    m = _TVDB_RE.search(torrent_name)
    return int(m.group(1)) if m else None


def _extract_tmdb_from_name(torrent_name: str) -> Optional[int]:
    """Extrait un TMDB ID si présent dans le nom ({tmdb-12345}, tmdb12345…)."""
    m = _TMDB_RE.search(torrent_name)
    return int(m.group(1)) if m else None


# ── Extraction titre + année ──────────────────────────────────────────────────

def extract_title_year(torrent_name: str) -> tuple[str, Optional[int]]:
    """
    Extrait titre lisible + année depuis un nom de torrent ou de fichier.

    Stratégie en cascade (Radarr-style) :
      1. Nettoyer extension + chemin
      2. Regex principale : tout ce qui est AVANT l'année = titre
      3. Regex anime : [Group] Title (Year)
      4. Fallback PTN si dispo
      5. Dernier recours : nom brut, espaces à la place des séparateurs
    """
    name = os.path.splitext(os.path.basename(torrent_name))[0]

    m = _TITLE_YEAR_RE.match(name)
    if m:
        raw_title = m.group('title')
        year_str = m.group('year')
        title = _clean_title(raw_title)
        year: Optional[int] = int(year_str) if year_str else None
        if title:
            return title, year

    m = _ANIME_RE.match(name)
    if m:
        raw_title = m.group('title')
        year_str = m.group('year')
        title = _clean_title(raw_title)
        year = int(year_str) if year_str else None
        if title:
            return title, year

    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            ptn_title: str = (parsed.get("title") or "").strip()
            ptn_year: Optional[int] = parsed.get("year")
            if ptn_title:
                return ptn_title, ptn_year
        except Exception:
            pass

    fallback = _clean_title(name)
    return fallback, None


def _clean_title(raw: str) -> str:
    """Remplace séparateurs par espaces, retire les tokens de qualité, normalise."""
    s = raw.replace('.', ' ').replace('_', ' ')
    s = _IMDB_RE.sub(' ', s)
    s = _QUALITY_TOKENS.sub(' ', s)
    s = re.sub(r'\b[Ss]\d{1,2}([EeXx]\d{1,3})?\b', ' ', s)
    s = re.sub(r'\b\d{1,2}x\d{1,3}\b', ' ', s)
    s = re.sub(r'[\[\](){}+]+', ' ', s)
    s = re.sub(r'[-–—]\s*[A-Z0-9]{2,}\s*$', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def is_episode(torrent_name: str) -> bool:
    """True si le torrent semble être un épisode ou une saison de série."""
    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            if parsed.get("season") or parsed.get("episode"):
                return True
        except Exception:
            pass
    if re.search(r'\b[Ss]\d{1,2}[Ee]\d{1,3}\b', torrent_name):
        return True
    if re.search(r'\b[Ss]\d{1,2}\b', torrent_name):
        return True
    if re.search(r'\b\d{1,2}x\d{1,3}\b', torrent_name):
        return True
    if re.search(r'\b(?:season|saison)\s+\d+\b', torrent_name, re.IGNORECASE):
        return True
    return False


# ── Normalisation & matching Radarr-style ─────────────────────────────────────

def normalize_title(title: str) -> str:
    """
    Normalisation Radarr-style pour comparaison :
      - NFD + strip diacritiques (accents)
      - minuscules
      - apostrophes supprimées sans espace (life's → lifes)
      - ponctuation → espaces
      - suppression des articles
      - réduction des espaces multiples
    """
    if not title:
        return ""
    s = unicodedata.normalize('NFD', title)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r"[‘’ʼ`']+", '', s)
    s = re.sub(r"[^\w\s]", ' ', s, flags=re.UNICODE)
    s = s.replace('_', ' ')
    s = _ARTICLES_RE.sub(' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def titles_match(title_a: str, title_b: str) -> bool:
    """
    Match style Radarr : exact après normalisation, ou l'un contient l'autre.

    Pour le "contains" : minimum 4 caractères ET l'un doit représenter
    au moins 50 % de l'autre (évite "One" ↔ "One Piece" avec year=None).
    """
    na, nb = normalize_title(title_a), normalize_title(title_b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # contains avec garde-fou longueur : au moins 4 chars ET ratio ≥ 50 %
    if len(na) >= 4 and na in nb and len(na) >= len(nb) * 0.5:
        return True
    if len(nb) >= 4 and nb in na and len(nb) >= len(na) * 0.5:
        return True
    return False


# ── Matching principal (en mémoire — O(n), pas d'appel API) ──────────────────

def match_against_known_media(
    torrent_name: str,
    movies: list["RadarrMovie"],
    series: list["SonarrSeries"],
) -> tuple[Optional[str], Optional[str], Optional[int], Optional[str]]:
    """
    Associe un torrent à un média connu (Radarr/Sonarr) sans appel réseau.

    Ordre de priorité :
      1. IMDB inline (tt\\d{7,8}) → match direct
      2. TVDB inline ({tvdb-\\d+}) → match direct série
      3. TMDB inline ({tmdb-\\d+}) → match direct film
      4. extract_title_year() → titles_match() contre titre principal + titres alternatifs
         (priorité Sonarr si épisode détecté, sinon Radarr)

    Returns : (media_id, guessed_title, guessed_year, imdb_id)
    media_id = "radarr_123" ou "sonarr_456", None si pas de match.
    """
    # ── 1. IMDB inline ────────────────────────────────────────────────────────
    inline_imdb = extract_imdb_from_name(torrent_name)
    if inline_imdb:
        for m in movies:
            if m.imdb_id and m.imdb_id.lower() == inline_imdb.lower():
                return f"radarr_{m.id}", m.title, m.year, m.imdb_id
        for s in series:
            if s.imdb_id and s.imdb_id.lower() == inline_imdb.lower():
                return f"sonarr_{s.id}", s.title, s.year, s.imdb_id
        title, year = extract_title_year(torrent_name)
        return None, title, year, inline_imdb

    # ── 2. TVDB inline ────────────────────────────────────────────────────────
    inline_tvdb = _extract_tvdb_from_name(torrent_name)
    if inline_tvdb:
        for s in series:
            if s.tvdb_id and s.tvdb_id == inline_tvdb:
                return f"sonarr_{s.id}", s.title, s.year, s.imdb_id
        # TVDB trouvé mais pas dans la lib → continue avec matching titre
        inline_tvdb = None  # réinitialise pour ne pas bloquer la suite

    # ── 3. TMDB inline ────────────────────────────────────────────────────────
    inline_tmdb = _extract_tmdb_from_name(torrent_name)
    if inline_tmdb:
        for m in movies:
            if m.tmdb_id and m.tmdb_id == inline_tmdb:
                return f"radarr_{m.id}", m.title, m.year, m.imdb_id
        inline_tmdb = None

    # ── 4. Matching titre + année ─────────────────────────────────────────────
    title, year = extract_title_year(torrent_name)
    if not title:
        return None, None, year, None

    episode = is_episode(torrent_name)

    if episode:
        primary_label, primary = "sonarr", series
        secondary_label, secondary = "radarr", movies
    else:
        primary_label, primary = "radarr", movies
        secondary_label, secondary = "sonarr", series

    def _search(label: str, candidates: list) -> Optional[tuple[str, str, int, Optional[str]]]:
        """Cherche dans la liste en vérifiant titre principal + titres alternatifs."""
        for c in candidates:
            cyear: int = getattr(c, "year", 0) or 0
            if year and cyear and abs(cyear - year) > 1:
                continue
            imdb = getattr(c, "imdb_id", None)
            # Titre principal
            if titles_match(title, c.title):
                return f"{label}_{c.id}", c.title, cyear, imdb
            # Titres alternatifs (titres étrangers, variantes) — clé pour les
            # releases françaises qui ne correspondent pas au titre anglais
            for alt in getattr(c, "alternate_titles", []):
                if alt and titles_match(title, alt):
                    return f"{label}_{c.id}", c.title, cyear, imdb
        return None

    hit = _search(primary_label, primary) or _search(secondary_label, secondary)
    if hit:
        media_id, _matched_title, _matched_year, imdb_id = hit
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

    Retourne (imdb_id, guessed_title, guessed_year).
    """
    inline_imdb = extract_imdb_from_name(torrent_name)
    if inline_imdb:
        return inline_imdb, None, None

    title, year = extract_title_year(torrent_name)
    if not title:
        return None, None, year

    episode = is_episode(torrent_name)
    best_imdb: Optional[str] = None

    search_term = f"{title} {year}" if year else title

    async def _search(client, method: str) -> None:
        nonlocal best_imdb
        try:
            results = await getattr(client, method)(search_term)
            for r in results[:20]:
                ctitle = r.get("title", "")
                cyear = r.get("year")
                imdb = r.get("imdbId") or None
                if year and cyear and abs(cyear - year) > 1:
                    continue
                if not imdb:
                    continue
                if titles_match(title, ctitle):
                    best_imdb = imdb
                    return
                # Vérifier les titres alternatifs renvoyés par l'API
                for alt in r.get("alternateTitles", []):
                    alt_title = alt.get("title", "") if isinstance(alt, dict) else str(alt)
                    if alt_title and titles_match(title, alt_title):
                        best_imdb = imdb
                        return
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
