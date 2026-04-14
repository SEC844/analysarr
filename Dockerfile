# ── Stage 1 : Build du frontend ───────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build


# ── Stage 2 : Image finale Python + backend + frontend statique ───────────────
FROM python:3.12-slim AS final

# Dépendances système minimales
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend Python
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

# Frontend buildé
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Config par défaut (sera écrasée par le volume)
RUN mkdir -p /config

# Port unique
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/scan/status')" || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
