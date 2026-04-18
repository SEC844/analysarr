"""Client HTTP async pour Cross Seed (optionnel).

L'API cross-seed est une API d'actions (pas de lecture) :
  - GET  /api/ping      → test connexion, pas d'auth requise
  - POST /api/webhook   → déclencher une recherche pour un torrent (infoHash/path)
  - POST /api/job       → forcer un job (search, rss, cleanup)

Il n'existe pas d'endpoint pour lister les cross-seeds actifs ; la détection
cross-seed se fait uniquement par inode (cf. scanner.py).
"""
from __future__ import annotations

import logging

import httpx

from ..models.schemas import ConnectionTestResult

logger = logging.getLogger(__name__)

TIMEOUT = 10.0


class CrossSeedClient:
    def __init__(self, url: str, api_key: str) -> None:
        self.base = url.rstrip("/")
        self.headers = {"X-Api-Key": api_key} if api_key else {}

    async def test_connection(self) -> ConnectionTestResult:
        """
        Test connexion via GET /api/ping.
        /api/ping ne nécessite pas d'auth et renvoie 200 si le daemon répond.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base}/api/ping")
                if resp.status_code == 200:
                    return ConnectionTestResult(
                        service="crossseed",
                        success=True,
                        message="Connected",
                    )
                return ConnectionTestResult(
                    service="crossseed",
                    success=False,
                    message=f"HTTP {resp.status_code}",
                )
        except Exception as e:
            return ConnectionTestResult(service="crossseed", success=False, message=str(e))

    async def trigger_search(self, info_hash: str) -> dict:
        """
        Déclenche une recherche cross-seed pour un torrent donné.
        POST /api/webhook avec { "infoHash": "<hash>" }.
        Retourne { success: bool, status: int, message?: str }.
        """
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    f"{self.base}/api/webhook",
                    headers=self.headers,
                    data={"infoHash": info_hash},
                )
                ok = resp.status_code in (200, 204)
                msg: str = "Recherche déclenchée" if ok else f"HTTP {resp.status_code}"
                # cross-seed renvoie parfois du texte en cas d'erreur — on remonte si possible
                if not ok:
                    try:
                        body = resp.text.strip()
                        if body:
                            msg = f"{msg} — {body[:200]}"
                    except Exception:
                        pass
                return {"success": ok, "status": resp.status_code, "message": msg}
        except Exception as e:
            logger.debug("cross-seed trigger failed for %s: %s", info_hash, e)
            return {"success": False, "status": 0, "message": str(e)}
