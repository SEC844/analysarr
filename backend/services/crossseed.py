"""Client HTTP async pour Cross Seed (optionnel)."""
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
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self.base}/api/status",
                    headers=self.headers,
                )
                resp.raise_for_status()
                return ConnectionTestResult(
                    service="crossseed",
                    success=True,
                    message="Connected",
                )
        except Exception as e:
            return ConnectionTestResult(service="crossseed", success=False, message=str(e))
