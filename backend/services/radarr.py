"""Client HTTP async pour Radarr."""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from ..models.schemas import RadarrMovie, ConnectionTestResult

logger = logging.getLogger(__name__)

TIMEOUT = 10.0


class RadarrClient:
    def __init__(self, url: str, api_key: str) -> None:
        self.base = url.rstrip("/")
        self.headers = {"X-Api-Key": api_key, "Accept": "application/json"}

    async def get_movies(self) -> list[RadarrMovie]:
        """Récupère tous les films avec hasFile=true."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base}/api/v3/movie",
                headers=self.headers,
            )
            resp.raise_for_status()
            raw: list[dict] = resp.json()

        movies: list[RadarrMovie] = []
        for m in raw:
            if not m.get("hasFile"):
                continue
            mf = m.get("movieFile") or {}
            movies.append(RadarrMovie(
                id=m["id"],
                title=m.get("title", ""),
                year=m.get("year", 0),
                imdb_id=m.get("imdbId") or None,
                tmdb_id=m.get("tmdbId") or None,
                has_file=True,
                file_path=mf.get("path") or None,
                file_size=mf.get("size", 0),
                title_slug=m.get("titleSlug", ""),
                images=m.get("images", []),
            ))
        return movies

    async def lookup_movie(self, term: str) -> list[dict]:
        """Lookup TMDB/IMDB via Radarr (utilisé par identifier.py)."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base}/api/v3/movie/lookup",
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
                    service="radarr",
                    success=True,
                    message="Connected",
                    version=data.get("version"),
                )
        except Exception as e:
            return ConnectionTestResult(service="radarr", success=False, message=str(e))
