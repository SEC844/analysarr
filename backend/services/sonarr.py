"""Client HTTP async pour Sonarr."""
from __future__ import annotations

import logging

import httpx

from ..models.schemas import SonarrSeries, SonarrEpisodeFile, ConnectionTestResult

logger = logging.getLogger(__name__)

TIMEOUT = 10.0


class SonarrClient:
    def __init__(self, url: str, api_key: str) -> None:
        self.base = url.rstrip("/")
        self.headers = {"X-Api-Key": api_key, "Accept": "application/json"}

    async def get_series(self) -> list[SonarrSeries]:
        """Récupère toutes les séries avec au moins un fichier épisode."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base}/api/v3/series",
                headers=self.headers,
            )
            resp.raise_for_status()
            raw: list[dict] = resp.json()

        series: list[SonarrSeries] = []
        for s in raw:
            stats = s.get("statistics") or {}
            ep_count = stats.get("episodeFileCount", 0)
            if ep_count == 0:
                continue
            series.append(SonarrSeries(
                id=s["id"],
                title=s.get("title", ""),
                year=s.get("year", 0),
                imdb_id=s.get("imdbId") or None,
                tvdb_id=s.get("tvdbId") or None,
                path=s.get("path", ""),
                episode_file_count=ep_count,
                size_on_disk=stats.get("sizeOnDisk", 0),
                title_slug=s.get("titleSlug", ""),
                images=s.get("images", []),
            ))
        return series

    async def get_episode_files(self, series_id: int) -> list[SonarrEpisodeFile]:
        """Récupère les fichiers épisodes d'une série."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base}/api/v3/episodefile",
                params={"seriesId": series_id},
                headers=self.headers,
            )
            resp.raise_for_status()
            raw: list[dict] = resp.json()

        files: list[SonarrEpisodeFile] = []
        for f in raw:
            files.append(SonarrEpisodeFile(
                id=f["id"],
                series_id=series_id,
                path=f.get("path", ""),
                size=f.get("size", 0),
                season=f.get("seasonNumber", 0),
                episode=f.get("episodeNumber", 0),
            ))
        return files

    async def lookup_series(self, term: str) -> list[dict]:
        """Lookup TMDB/IMDB via Sonarr (utilisé par identifier.py)."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base}/api/v3/series/lookup",
                params={"term": term},
                headers=self.headers,
            )
            if resp.status_code != 200:
                return []
            return resp.json()

    async def test_connection(self) -> ConnectionTestResult:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self.base}/api/v3/system/status",
                    headers=self.headers,
                )
                resp.raise_for_status()
                data = resp.json()
                return ConnectionTestResult(
                    service="sonarr",
                    success=True,
                    message="Connected",
                    version=data.get("version"),
                )
        except Exception as e:
            return ConnectionTestResult(service="sonarr", success=False, message=str(e))
