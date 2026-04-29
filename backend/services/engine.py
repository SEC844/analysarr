"""
Moteur de scan principal.

- Agrège Radarr + Sonarr + qBittorrent
- Applique la classification inode via scanner.py
- Maintient un cache en mémoire avec timestamp
- Scan automatique toutes les 5 min en background (asyncio)
- Scan incrémental : ignore les fichiers dont path+size n'ont pas changé
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Optional

from ..config import load_config
from ..models.schemas import (
    MediaItem, MediaSource, MediaType, SeedStatus,
    FileMetadata, QbitTorrent, ScanStatus, GlobalStats,
    RadarrMovie, SonarrSeries, UnmatchedTorrent, TorrentWithMedia,
)
from .radarr import RadarrClient
from .sonarr import SonarrClient
from .qbittorrent import QBittorrentClient
from .scanner import classify_media_file, get_file_metadata, build_index, TorrentIndex
from .identifier import match_against_known_media, resolve_imdb_from_torrent

logger = logging.getLogger(__name__)

AUTO_SCAN_INTERVAL    = 300  # secondes (5 min)
TORRENT_REFRESH_SECS  = 30   # refresh léger qBit uniquement
QBIT_SEEDING_STATES   = frozenset(["seeding","stalledUP","forcedUP","queuedUP","uploading","checkingUP"])

# Extensions vidéo reconnues pour identifier les fichiers épisodes dans une série
VIDEO_EXTENSIONS = frozenset([
    '.mkv', '.mp4', '.avi', '.mov', '.m4v', '.ts', '.wmv',
    '.mpg', '.mpeg', '.divx', '.m2ts', '.vob', '.flv', '.webm',
])

# Candidats pour l'auto-détection du répertoire torrents
_TORRENTS_CANDIDATES = [
    "/data/torrents",
    "/data/complete",
    "/data/downloads/complete",
    "/data/downloads",
]
_CROSSSEED_CANDIDATES = ["/data/cross-seed", "/data/crossseed"]


def _resolve_path(configured: str, candidates: list[str]) -> str:
    """Retourne le chemin configuré s'il existe, sinon le premier candidat valide."""
    if Path(configured).is_dir():
        return configured
    for c in candidates:
        if Path(c).is_dir():
            logger.warning("Chemin '%s' introuvable — fallback sur '%s'", configured, c)
            return c
    return configured  # laisse la valeur pour que l'UI l'affiche


class ScanEngine:
    def __init__(self) -> None:
        self._cache: list[MediaItem] = []
        self._scan_status = ScanStatus()
        self._lock: Optional[asyncio.Lock] = None
        self._bg_task: Optional[asyncio.Task] = None
        self._torrent_task: Optional[asyncio.Task] = None
        self._prev_file_sizes: dict[str, int] = {}

        # Cache léger torrents (mis à jour toutes les 30 s indépendamment du scan)
        self._qbit_torrents: list[QbitTorrent] = []
        self._qbit_cache_ts: float = 0.0
        self._unmatched: list[UnmatchedTorrent] = []

        # Données médias en mémoire (pour le matching sans appel API)
        self._movies: list[RadarrMovie] = []
        self._series: list[SonarrSeries] = []

        # Mappings manuels : hash qBit → media_id ("radarr_123")
        self._manual_mappings: dict[str, str] = {}

        # Reverse lookup : hash → infos média (pour enrichir la liste des torrents)
        self._hash_to_media: dict[str, dict] = {}

    def _get_lock(self) -> asyncio.Lock:
        """Crée le lock lazily dans l'event loop courant."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    # ── Accès cache torrents ──────────────────────────────────────────────────

    def get_torrents(self) -> list[QbitTorrent]:
        return self._qbit_torrents

    def get_unmatched(self) -> list[UnmatchedTorrent]:
        # Appliquer les mappings manuels en temps réel
        result = []
        for u in self._unmatched:
            manual = self._manual_mappings.get(u.torrent.hash.lower())
            result.append(u.model_copy(update={"manual_media_id": manual}))
        return result

    def set_manual_mapping(self, torrent_hash: str, media_id: str) -> None:
        self._manual_mappings[torrent_hash.lower()] = media_id

    def remove_manual_mapping(self, torrent_hash: str) -> None:
        self._manual_mappings.pop(torrent_hash.lower(), None)

    def get_media_list(self) -> list[dict]:
        """Retourne la liste simplifiée de tous les médias (pour le mapping manuel)."""
        result = []
        for m in self._movies:
            result.append({
                "id": f"radarr_{m.id}",
                "title": m.title,
                "year": m.year,
                "type": "movie",
                "imdb_id": m.imdb_id,
            })
        for s in self._series:
            result.append({
                "id": f"sonarr_{s.id}",
                "title": s.title,
                "year": s.year,
                "type": "series",
                "imdb_id": s.imdb_id,
            })
        return sorted(result, key=lambda x: x["title"].lower())

    def get_enriched_torrents(self) -> list[TorrentWithMedia]:
        """
        Retourne tous les torrents qBit enrichis avec les infos du média associé.
        Fusionne le cache _hash_to_media (scan) + mappings manuels + suggestions unmatched.
        """
        unmatched_by_hash: dict[str, UnmatchedTorrent] = {
            u.torrent.hash.lower(): u for u in self._unmatched
        }

        result: list[TorrentWithMedia] = []
        for t in self._qbit_torrents:
            h = t.hash.lower()
            manual = self._manual_mappings.get(h)
            info = self._hash_to_media.get(h)

            if info:
                # Torrent associé via scan (hardlink ou doublon)
                result.append(TorrentWithMedia(
                    torrent=t,
                    media_id=manual or info["media_id"],
                    media_title=info["media_title"],
                    media_year=info["media_year"],
                    media_imdb=info["media_imdb"],
                    media_poster=info["media_poster"],
                    is_duplicate=info["is_duplicate"],
                    manual_media_id=manual,
                ))
            elif h in unmatched_by_hash:
                # Torrent non associé via scan — données de la phase de résolution
                u = unmatched_by_hash[h]
                result.append(TorrentWithMedia(
                    torrent=t,
                    media_id=manual,
                    suggested_media_id=u.suggested_media_id,
                    guessed_title=u.guessed_title,
                    guessed_year=u.guessed_year,
                    media_imdb=u.imdb_id,
                    manual_media_id=manual,
                ))
            else:
                result.append(TorrentWithMedia(torrent=t, manual_media_id=manual))

        return result

    # ── Accès cache ───────────────────────────────────────────────────────────

    def get_cache(self) -> list[MediaItem]:
        return self._cache

    def get_status(self) -> ScanStatus:
        return self._scan_status

    def get_stats(self) -> GlobalStats:
        stats = GlobalStats(total=len(self._cache))
        for item in self._cache:
            match item.seed_status:
                case SeedStatus.SEED_OK:           stats.seed_ok += 1
                case SeedStatus.SEED_NO_CS:        stats.seed_no_cs += 1
                case SeedStatus.SEED_NOT_HARDLINK: stats.seed_not_hardlink += 1
                case SeedStatus.SEED_DUPLICATE:    stats.seed_duplicate += 1
                case SeedStatus.NOT_SEEDING:       stats.not_seeding += 1
        return stats

    # ── Scan ──────────────────────────────────────────────────────────────────

    async def trigger_scan(self) -> None:
        """Déclenche un scan manuel (non-bloquant)."""
        if self._scan_status.running:
            return
        asyncio.create_task(self._run_scan())

    async def scan_and_wait(self) -> list[MediaItem]:
        """Déclenche un scan et attend sa fin. Retourne les résultats."""
        async with self._get_lock():
            await self._run_scan()
        return self._cache

    async def _run_scan(self) -> None:
        if self._scan_status.running:
            return

        self._scan_status = ScanStatus(running=True, progress=0.0)
        start = time.time()
        logger.info("Scan started")

        try:
            cfg = load_config()

            # ── Résolution des chemins avec fallback auto-détection ───────────
            torrents_dir  = _resolve_path(cfg.paths.torrents, _TORRENTS_CANDIDATES)
            crossseed_cfg = _resolve_path(cfg.paths.crossseed, _CROSSSEED_CANDIDATES)
            crossseed_dir = crossseed_cfg if cfg.crossseed.enabled and Path(crossseed_cfg).is_dir() else None

            # ── Fetch en parallèle ────────────────────────────────────────────
            radarr_client = RadarrClient(cfg.radarr.url, cfg.radarr.api_key) if cfg.radarr.url else None
            sonarr_client = SonarrClient(cfg.sonarr.url, cfg.sonarr.api_key) if cfg.sonarr.url else None
            qbit_client   = QBittorrentClient(
                cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password
            ) if cfg.qbittorrent.url else None

            async def _empty() -> list:
                return []

            movies_task   = radarr_client.get_movies()   if radarr_client else _empty()
            series_task   = sonarr_client.get_series()   if sonarr_client else _empty()
            torrents_task = qbit_client.get_torrents()   if qbit_client   else _empty()

            results = await asyncio.gather(
                movies_task, series_task, torrents_task,
                return_exceptions=True,
            )

            movies: list[RadarrMovie]   = results[0] if not isinstance(results[0], Exception) else []
            series: list[SonarrSeries]  = results[1] if not isinstance(results[1], Exception) else []
            qbit_torrents: list[QbitTorrent] = results[2] if not isinstance(results[2], Exception) else []

            if isinstance(results[0], Exception):
                logger.error("Radarr fetch failed: %s", results[0])
            if isinstance(results[1], Exception):
                logger.error("Sonarr fetch failed: %s", results[1])
            if isinstance(results[2], Exception):
                logger.error("qBittorrent fetch failed: %s", results[2])

            # Mettre à jour les caches immédiats
            if qbit_torrents:
                self._qbit_torrents = qbit_torrents
                self._qbit_cache_ts = time.time()
            if movies:
                self._movies = movies
            if series:
                self._series = series

            # ── Pré-scan des répertoires (UNE SEULE FOIS) ─────────────────────
            loop = asyncio.get_event_loop()
            torrent_index, crossseed_index = await asyncio.gather(
                loop.run_in_executor(None, build_index, torrents_dir),
                loop.run_in_executor(None, build_index, crossseed_dir or ""),
            )
            logger.info(
                "Index construit — torrents: %d inodes / crossseed: %d inodes",
                len(torrent_index.by_inode), len(crossseed_index.by_inode),
            )

            total = len(movies) + len(series)
            self._scan_status.total_items = total
            scanned = 0

            new_items: list[MediaItem] = []
            matched_hashes: set[str] = set()

            # ── Films ─────────────────────────────────────────────────────────
            for movie in movies:
                item = await self._process_movie(
                    movie, qbit_torrents, torrent_index, crossseed_index,
                    radarr_client, matched_hashes,
                )
                new_items.append(item)
                scanned += 1
                self._scan_status.scanned = scanned
                self._scan_status.progress = scanned / total if total else 1.0

            # ── Séries ────────────────────────────────────────────────────────
            for show in series:
                item = await self._process_series(
                    show, qbit_torrents, torrent_index, crossseed_index,
                    sonarr_client, matched_hashes,
                )
                new_items.append(item)
                scanned += 1
                self._scan_status.scanned = scanned
                self._scan_status.progress = scanned / total if total else 1.0

            # ── Reverse lookup hash → média ───────────────────────────────────
            new_hash_to_media: dict[str, dict] = {}
            for item in new_items:
                _info_base = {
                    "media_id":    item.id,
                    "media_title": item.title,
                    "media_year":  item.year,
                    "media_imdb":  item.imdb_id,
                    "media_poster": item.poster_url,
                }
                for t in item.matched_torrents:
                    new_hash_to_media[t.hash.lower()] = {**_info_base, "is_duplicate": False}
                for t in item.duplicate_torrents:
                    new_hash_to_media[t.hash.lower()] = {**_info_base, "is_duplicate": True}
            self._hash_to_media = new_hash_to_media

            # ── Torrents non matchés ──────────────────────────────────────────
            matched_hashes_set = {
                t.hash.lower()
                for item in new_items
                for t in item.matched_torrents + item.duplicate_torrents
            }
            unmatched_raw = [t for t in qbit_torrents if t.hash.lower() not in matched_hashes_set]

            # Résolution IMDB en background (best-effort, non bloquant)
            asyncio.create_task(self._resolve_unmatched(unmatched_raw, radarr_client, sonarr_client))

            self._cache = new_items
            elapsed = time.time() - start
            logger.info("Scan finished in %.1fs — %d items, %d unmatched", elapsed, len(new_items), len(unmatched_raw))

        except Exception as e:
            logger.exception("Scan failed: %s", e)
            self._scan_status.error = str(e)
        finally:
            self._scan_status.running = False
            self._scan_status.last_scan = int(time.time() * 1000)
            self._scan_status.progress = 1.0

    async def _process_movie(
        self,
        movie: RadarrMovie,
        qbit_torrents: list[QbitTorrent],
        torrent_index: TorrentIndex,
        crossseed_index: TorrentIndex,
        radarr_client,
        matched_hashes: set[str],
    ) -> MediaItem:
        item = MediaItem(
            id=f"radarr_{movie.id}",
            source=MediaSource.RADARR,
            media_type=MediaType.MOVIE,
            title=movie.title,
            year=movie.year,
            imdb_id=movie.imdb_id,
            tmdb_id=movie.tmdb_id,
            poster_url=self._extract_poster(movie.images, "radarr", movie.id),
        )

        if not movie.file_path:
            return item

        media_file = await asyncio.get_event_loop().run_in_executor(
            None, get_file_metadata, movie.file_path
        )
        item.media_file = media_file

        if not media_file.exists:
            return item

        # Classification O(1) via index
        result = classify_media_file(media_file, torrent_index, crossseed_index, qbit_torrents)

        item.seed_status        = result["seed_status"]
        item.is_hardlinked      = result["is_hardlinked"]
        item.is_cross_seeded    = result["is_cross_seeded"]
        item.is_duplicate       = result["is_duplicate"]
        item.torrents_files     = result["torrents_files"]
        item.duplicate_files    = result["duplicate_files"]
        item.crossseed_files    = result["crossseed_files"]
        item.matched_torrents   = result["matched_torrents"]
        item.duplicate_torrents = result["duplicate_torrents"]

        for t in result["matched_torrents"] + result["duplicate_torrents"]:
            matched_hashes.add(t.hash)

        return item

    async def _process_series(
        self,
        show: SonarrSeries,
        qbit_torrents: list[QbitTorrent],
        torrent_index: TorrentIndex,
        crossseed_index: TorrentIndex,
        sonarr_client,
        matched_hashes: set[str],
    ) -> MediaItem:
        item = MediaItem(
            id=f"sonarr_{show.id}",
            source=MediaSource.SONARR,
            media_type=MediaType.SERIES,
            title=show.title,
            year=show.year,
            imdb_id=show.imdb_id,
            tvdb_id=show.tvdb_id,
            episode_file_count=show.episode_file_count,
            poster_url=self._extract_poster(show.images, "sonarr", show.id),
        )

        if not show.path:
            return item

        # Collect ALL video files in the series directory (one per episode).
        # Unlike movies (1 file = 1 reference), a series can have hundreds of
        # episode files each belonging to a different torrent. Checking only the
        # largest file would miss every other episode's torrent association.
        video_files = await asyncio.get_event_loop().run_in_executor(
            None, self._find_video_files, show.path
        )

        if not video_files:
            dir_stat = await asyncio.get_event_loop().run_in_executor(
                None, get_file_metadata, show.path
            )
            item.media_file = dir_stat
            return item

        # Representative file shown in the UI = the largest episode file
        item.media_file = max(video_files, key=lambda f: f.size)

        # Classify every episode file and aggregate the results.
        # Use dicts keyed by torrent hash to deduplicate across episodes.
        agg_matched:    dict[str, QbitTorrent] = {}
        agg_duplicates: dict[str, QbitTorrent] = {}
        agg_torrent_files:   list[FileMetadata] = []
        agg_duplicate_files: list[FileMetadata] = []
        agg_crossseed_files: list[FileMetadata] = []
        any_hardlinked   = False
        any_cross_seeded = False
        any_duplicate    = False

        for vf in video_files:
            r = classify_media_file(vf, torrent_index, crossseed_index, qbit_torrents)
            for t in r["matched_torrents"]:
                agg_matched[t.hash] = t
            for t in r["duplicate_torrents"]:
                agg_duplicates[t.hash] = t
            agg_torrent_files.extend(r["torrents_files"])
            agg_duplicate_files.extend(r["duplicate_files"])
            agg_crossseed_files.extend(r["crossseed_files"])
            if r["is_hardlinked"]:
                any_hardlinked = True
            if r["is_cross_seeded"]:
                any_cross_seeded = True
            if r["is_duplicate"]:
                any_duplicate = True

        matched_torrents   = list(agg_matched.values())
        duplicate_torrents = list(agg_duplicates.values())

        # Derive overall seed_status from the aggregated picture
        if not matched_torrents:
            seed_status = SeedStatus.NOT_SEEDING
        elif any_hardlinked and any_cross_seeded:
            seed_status = SeedStatus.SEED_OK
        elif any_hardlinked:
            seed_status = SeedStatus.SEED_NO_CS
        elif any_duplicate:
            seed_status = SeedStatus.SEED_DUPLICATE
        else:
            seed_status = SeedStatus.SEED_NOT_HARDLINK

        item.seed_status        = seed_status
        item.is_hardlinked      = any_hardlinked
        item.is_cross_seeded    = any_cross_seeded
        item.is_duplicate       = any_duplicate
        item.torrents_files     = agg_torrent_files
        item.duplicate_files    = agg_duplicate_files
        item.crossseed_files    = agg_crossseed_files
        item.matched_torrents   = matched_torrents
        item.duplicate_torrents = duplicate_torrents

        for t in matched_torrents + duplicate_torrents:
            matched_hashes.add(t.hash)

        return item

    def _find_video_files(self, directory: str) -> list[FileMetadata]:
        """
        Retourne tous les fichiers vidéo dans un répertoire (récursif, max 5 niveaux).

        Filtre par extension pour ne conserver que les fichiers épisodes réels
        et ignorer les sous-titres, NFO, artwork, etc.
        """
        files: list[FileMetadata] = []
        base_depth = directory.rstrip(os.sep).count(os.sep)

        for root, dirs, fnames in os.walk(directory):
            depth = root.count(os.sep) - base_depth
            if depth >= 5:
                dirs.clear()
                continue
            for fname in fnames:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in VIDEO_EXTENSIONS:
                    continue
                fpath = os.path.join(root, fname)
                try:
                    st = os.stat(fpath)
                    files.append(FileMetadata(
                        path=fpath,
                        size=st.st_size,
                        inode=st.st_ino,
                        nlink=st.st_nlink,
                        exists=True,
                    ))
                except OSError:
                    continue

        return files

    def _extract_poster(self, images: list[dict], source: str, media_id: int) -> Optional[str]:
        """Retourne l'URL du poster proxié via notre API."""
        for img in images:
            if img.get("coverType") == "poster":
                return f"/api/poster/{source}/{media_id}"
        return None

    async def _resolve_unmatched(
        self,
        torrents: list[QbitTorrent],
        radarr_client,
        sonarr_client,
    ) -> None:
        """
        Associe les torrents non matchés à des médias connus.

        Stratégie à deux niveaux :
        1. Matching en mémoire (titre, IMDB inline) — instantané, sans API
        2. Si pas de match : API Radarr/Sonarr (proxy TMDB/TVDB) pour obtenir l'IMDB ID,
           puis re-match contre la bibliothèque par IMDB ID (beaucoup plus fiable que titre)

        Limité à 5 appels API concurrents pour ne pas surcharger Radarr/Sonarr.
        """
        results: list[UnmatchedTorrent] = []
        semaphore = asyncio.Semaphore(5)

        async def _resolve_one(t: QbitTorrent) -> UnmatchedTorrent:
            try:
                # ── Étape 1 : matching en mémoire ─────────────────────────────
                media_id, title, year, imdb_id = match_against_known_media(
                    t.name, self._movies, self._series
                )

                # ── Étape 2 : API fallback si pas de match biblio ─────────────
                if not media_id and (radarr_client or sonarr_client):
                    async with semaphore:
                        api_imdb, api_title, api_year = await resolve_imdb_from_torrent(
                            t.name, radarr_client, sonarr_client
                        )

                    if api_imdb:
                        imdb_id = api_imdb
                        # Re-match par IMDB ID — beaucoup plus fiable que le titre
                        for m in self._movies:
                            if m.imdb_id and m.imdb_id.lower() == api_imdb.lower():
                                media_id = f"radarr_{m.id}"
                                break
                        if not media_id:
                            for s in self._series:
                                if s.imdb_id and s.imdb_id.lower() == api_imdb.lower():
                                    media_id = f"sonarr_{s.id}"
                                    break

                    if api_title and not title:
                        title = api_title
                    if api_year and not year:
                        year = api_year

                return UnmatchedTorrent(
                    torrent=t,
                    guessed_title=title,
                    guessed_year=year,
                    imdb_id=imdb_id,
                    suggested_media_id=media_id,
                )
            except Exception as e:
                logger.debug("Unmatched resolution error for '%s': %s", t.name, e)
                return UnmatchedTorrent(torrent=t)

        results = list(await asyncio.gather(*[_resolve_one(t) for t in torrents]))

        self._unmatched = results
        matched_count = sum(1 for r in results if r.suggested_media_id)
        api_used = sum(1 for r in results if r.imdb_id and r.suggested_media_id)
        logger.info(
            "Unmatched: %d torrents, %d auto-associés (%d via API)",
            len(results), matched_count, api_used,
        )

    # ── Background refresh ────────────────────────────────────────────────────

    def start_background_scan(self) -> None:
        if self._bg_task and not self._bg_task.done():
            return
        self._bg_task = asyncio.create_task(self._bg_loop())
        self._torrent_task = asyncio.create_task(self._torrent_refresh_loop())

    async def _bg_loop(self) -> None:
        while True:
            try:
                cfg = load_config()
                interval = max(1, cfg.scan_interval_min) * 60
                await asyncio.sleep(interval)
                logger.info("Background scan triggered (interval=%ds)", interval)
                await self._run_scan()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Background scan error: %s", e)

    async def _torrent_refresh_loop(self) -> None:
        """Refresh léger : récupère uniquement la liste qBit selon l'intervalle configuré."""
        while True:
            try:
                interval = max(5, load_config().torrent_refresh_sec)
                await asyncio.sleep(interval)
                if self._scan_status.running:
                    continue  # le scan full s'en charge
                cfg = load_config()
                if not cfg.qbittorrent.url:
                    continue
                client = QBittorrentClient(
                    cfg.qbittorrent.url,
                    cfg.qbittorrent.username,
                    cfg.qbittorrent.password,
                )
                torrents = await client.get_torrents()
                self._qbit_torrents = torrents
                self._qbit_cache_ts = time.time()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug("Torrent refresh error (non-fatal): %s", e)


# ── Singleton global ──────────────────────────────────────────────────────────
engine = ScanEngine()
