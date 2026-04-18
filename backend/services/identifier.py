"""
Identification IMDB depuis un nom de torrent.

Méthode inspirée de Radarr/Sonarr (Parser.cs, MIT). Pas de score fuzzy Jaccard :
la comparaison se fait après normalisation stricte (minuscules, sans accents,
sans ponctuation, sans articles). Deux titres match si leurs versions normalisées
sont égales, ou si l'une est contenue dans l'autre.

Stratégie (priorité décroissante) :
1. IMDB inline : le nom contient tt1234567 → match direct par IMDB ID, 100% fiable
2. Parsing regex Radarr-style : titre avant l'année (19|20)\\d{2}, nettoyage
   des tokens de qualité, puis comparaison par normalisation contre la biblio
3. Fallback API : Radarr lookup_movie / Sonarr lookup_series comme proxy TMDB/TVDB
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
#   - tout ce qui est AVANT l'année = titre candidat
#   - l'année doit avoir 4 chiffres (19xx ou 20xx) et NE PAS être suivie de p/i
#     (sinon 1080p/720i seraient captés) ni d'un crochet fermant.
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


# ── Extraction ────────────────────────────────────────────────────────────────

def extract_imdb_from_name(torrent_name: str) -> Optional[str]:
    """Extrait un IMDB ID directement si présent dans le nom (tt1234567)."""
    m = _IMDB_RE.search(torrent_name)
    return m.group(1) if m else None


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
    # Nettoyer l'extension et le chemin
    name = os.path.splitext(os.path.basename(torrent_name))[0]

    # Essai 1 : regex principale Radarr-style
    m = _TITLE_YEAR_RE.match(name)
    if m:
        raw_title = m.group('title')
        year_str = m.group('year')
        title = _clean_title(raw_title)
        year: Optional[int] = int(year_str) if year_str else None
        if title:
            return title, year

    # Essai 2 : format anime [Group] Title (Year)
    m = _ANIME_RE.match(name)
    if m:
        raw_title = m.group('title')
        year_str = m.group('year')
        title = _clean_title(raw_title)
        year = int(year_str) if year_str else None
        if title:
            return title, year

    # Essai 3 : PTN si disponible
    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            ptn_title: str = (parsed.get("title") or "").strip()
            ptn_year: Optional[int] = parsed.get("year")
            if ptn_title:
                return ptn_title, ptn_year
        except Exception:
            pass

    # Dernier recours : le nom brut avec séparateurs → espaces,
    # et un stripping best-effort des tokens de qualité.
    fallback = _clean_title(name)
    return fallback, None


def _clean_title(raw: str) -> str:
    """Remplace séparateurs par espaces, retire les tokens de qualité, normalise."""
    s = raw.replace('.', ' ').replace('_', ' ')
    # Retire l'IMDB ID s'il est collé au titre (ex: "Avatar tt0499549")
    s = _IMDB_RE.sub(' ', s)
    s = _QUALITY_TOKENS.sub(' ', s)
    # Retire les marqueurs d'épisode éventuels (S01E02, 1x02…)
    s = re.sub(r'\b[Ss]\d{1,2}([EeXx]\d{1,3})?\b', ' ', s)
    s = re.sub(r'\b\d{1,2}x\d{1,3}\b', ' ', s)
    # Crochets/parenthèses + ponctuation résiduelle → espace
    s = re.sub(r'[\[\](){}+]+', ' ', s)
    # Suffixe "- GROUP" à la fin (tag du releaser)
    s = re.sub(r'[-–—]\s*[A-Z0-9]{2,}\s*$', '', s)
    # Espaces multiples
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def is_episode(torrent_name: str) -> bool:
    """True si le torrent semble être un épisode de série (S01E01, saison…)."""
    if _PTN_AVAILABLE:
        try:
            parsed = PTN.parse(torrent_name)
            if parsed.get("season") or parsed.get("episode"):
                return True
        except Exception:
            pass
    # Détection manuelle : S01E02, S01, 1x02, "Season 1", "Saison 1"
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
      - ponctuation → espaces
      - suppression des articles (the/a/an/le/la/les/un/une/des/l…)
      - réduction des espaces multiples
    """
    if not title:
        return ""
    # NFD pour décomposer les accents puis supprimer les diacritiques
    s = unicodedata.normalize('NFD', title)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    # Supprimer les apostrophes SANS insérer d'espace (sinon "life's" → "life s"
    # alors que la release dit "lifes" — match impossible)
    s = re.sub(r"[\u2018\u2019\u02bc`']+", '', s)
    # Autre ponctuation → espace
    s = re.sub(r"[^\w\s]", ' ', s, flags=re.UNICODE)
    # Séparer les underscores aussi (inclus dans \w)
    s = s.replace('_', ' ')
    # Supprimer les articles
    s = _ARTICLES_RE.sub(' ', s)
    # Espaces multiples
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def titles_match(title_a: str, title_b: str) -> bool:
    """
    Match style Radarr : exact après normalisation, ou l'un contient l'autre.

    Exemples qui match :
      "Malcolm In The Middle Lifes Still Unfair" ↔ "Malcolm in the Middle: Life's Still Unfair"
      "Avatar" ↔ "Avatar (2009)"
    """
    na, nb = normalize_title(title_a), normalize_title(title_b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # "contains" : l'un doit être le préfixe ou contenu dans l'autre, avec un
    # minimum de caractères pour éviter les faux positifs sur des titres très courts
    if len(na) >= 3 and na in nb:
        return True
    if len(nb) >= 3 and nb in na:
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
      1. IMDB inline dans le nom (tt\\d{7,8}) → match direct par IMDB ID
      2. extract_title_year() → titles_match() contre toutes les séries (si
         épisode détecté) puis films, sinon films puis séries, avec filtre
         année ±1 quand les deux années sont connues.

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

    # Séries en premier si épisode détecté, films sinon
    if episode:
        primary_label, primary = "sonarr", series
        secondary_label, secondary = "radarr", movies
    else:
        primary_label, primary = "radarr", movies
        secondary_label, secondary = "sonarr", series

    def _search(label: str, candidates: list) -> Optional[tuple[str, str, int, Optional[str]]]:
        """Retourne (media_id, matched_title, matched_year, imdb) ou None."""
        for c in candidates:
            cyear: int = getattr(c, "year", 0) or 0
            # Filtre année ±1 seulement si les deux années sont connues
            if year and cyear and abs(cyear - year) > 1:
                continue
            if titles_match(title, c.title):
                return f"{label}_{c.id}", c.title, cyear, getattr(c, "imdb_id", None)
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

    # Inclure l'année dans le terme de recherche pour plus de précision
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
                # Même logique de match (exact / contains après normalisation)
                if titles_match(title, ctitle):
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
