"""
Analysarr — FastAPI backend.

- Sert l'API sous /api/
- Sert le frontend React (dist/) sur toutes les autres routes
- Démarre un scan au lancement + refresh automatique toutes les 5 min
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import config, crossseed, media, scan, torrents
from .services.engine import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "../frontend/dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Démarrage : scan initial + background refresh."""
    logger.info("Analysarr starting — triggering initial scan")
    engine.start_background_scan()
    await engine.trigger_scan()
    yield
    logger.info("Analysarr shutting down")


app = FastAPI(
    title="Analysarr",
    description="Dashboard de surveillance pour stack *arr",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS (utile pour dev local avec Vite proxy)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers API ───────────────────────────────────────────────────────────────
app.include_router(config.router,    prefix="/api")
app.include_router(media.router,     prefix="/api")
app.include_router(scan.router,      prefix="/api")
app.include_router(torrents.router,  prefix="/api")
app.include_router(crossseed.router, prefix="/api")

# ── Poster proxy ──────────────────────────────────────────────────────────────
# (déjà dans torrents.router mais on l'expose proprement)
@app.get("/api/poster/{source}/{media_id}")
async def poster_proxy(source: str, media_id: int):
    return await torrents.get_poster(source, media_id)


# ── Frontend statique — DOIT être EN DERNIER ─────────────────────────────────
if os.path.isdir(FRONTEND_DIST):
    # Assets statiques (JS, CSS, images)
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """SPA fallback — toutes les routes non-API servent index.html."""
        index = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        return {"error": "Frontend not built yet. Run: npm run build in frontend/"}
else:
    @app.get("/", include_in_schema=False)
    async def dev_root():
        return {
            "message": "Analysarr API is running",
            "docs": "/api/docs",
            "note": "Frontend not found. Build with: cd frontend && npm run build",
        }
