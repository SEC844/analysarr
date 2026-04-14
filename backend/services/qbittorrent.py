"""Client HTTP async pour qBittorrent."""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from ..models.schemas import QbitTorrent, ConnectionTestResult

logger = logging.getLogger(__name__)

TIMEOUT = 10.0


class QBittorrentClient:
    def __init__(self, url: str, username: str, password: str) -> None:
        self.base = url.rstrip("/")
        self.username = username
        self.password = password
        self._cookie: Optional[str] = None

    async def _login(self, client: httpx.AsyncClient) -> None:
        resp = await client.post(
            f"{self.base}/api/v2/auth/login",
            data={"username": self.username, "password": self.password},
            timeout=TIMEOUT,
        )
        text = resp.text.strip()
        if text != "Ok.":
            raise RuntimeError(f"qBittorrent login failed: {text}")
        cookie = resp.headers.get("set-cookie", "")
        self._cookie = cookie.split(";")[0] if cookie else ""

    async def _request(self, path: str) -> httpx.Response:
        headers = {}
        if self._cookie:
            headers["Cookie"] = self._cookie

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base}/api/v2{path}",
                headers=headers,
            )
            if resp.status_code == 403:
                # Session expirée — re-login
                await self._login(client)
                resp = await client.get(
                    f"{self.base}/api/v2{path}",
                    headers={"Cookie": self._cookie or ""},
                )
            resp.raise_for_status()
            return resp

    async def get_torrents(self) -> list[QbitTorrent]:
        """Récupère tous les torrents."""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            if not self._cookie:
                await self._login(client)
            resp = await client.get(
                f"{self.base}/api/v2/torrents/info",
                headers={"Cookie": self._cookie or ""},
            )
            if resp.status_code == 403:
                await self._login(client)
                resp = await client.get(
                    f"{self.base}/api/v2/torrents/info",
                    headers={"Cookie": self._cookie or ""},
                )
            resp.raise_for_status()
            raw: list[dict] = resp.json()

        torrents: list[QbitTorrent] = []
        for t in raw:
            torrents.append(QbitTorrent(
                hash=t.get("hash", ""),
                name=t.get("name", ""),
                save_path=t.get("save_path", ""),
                content_path=t.get("content_path", ""),
                size=t.get("size", 0),
                state=t.get("state", ""),
                tags=t.get("tags", ""),
                category=t.get("category", ""),
                ratio=t.get("ratio", 0.0),
                uploaded=t.get("uploaded", 0),
                downloaded=t.get("downloaded", 0),
                upspeed=t.get("upspeed", 0),
                dlspeed=t.get("dlspeed", 0),
                eta=t.get("eta", 0),
                num_seeds=t.get("num_seeds", 0),
                num_leechs=t.get("num_leechs", 0),
                tracker=t.get("tracker", ""),
                added_on=t.get("added_on", 0),
            ))
        return torrents

    async def test_connection(self) -> ConnectionTestResult:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await self._login(client)
                resp = await client.get(
                    f"{self.base}/api/v2/app/version",
                    headers={"Cookie": self._cookie or ""},
                )
                resp.raise_for_status()
                return ConnectionTestResult(
                    service="qbittorrent",
                    success=True,
                    message="Connected",
                    version=resp.text.strip(),
                )
        except Exception as e:
            self._cookie = None
            return ConnectionTestResult(service="qbittorrent", success=False, message=str(e))
