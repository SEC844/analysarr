# Analysarr

> Real-time dashboard for your \*arr media stack — Radarr · Sonarr · qBittorrent

![Screenshot placeholder](docs/screenshot.png)

Analysarr is a self-hosted, dark-mode-first web dashboard that gives you an instant overview of your entire media library: what is seeding, what is hardlinked, and what needs attention.

---

## Features

- **Dashboard** — stat cards (movies, series, episodes, seeding count, hardlinks, total seeding size) + full media grid with poster images
- **Torrent list** — all active qBittorrent torrents cross-referenced with Radarr/Sonarr, color-coded by state
- **Issues panel** — auto-detected problems: missing torrents, orphan torrents, duplicates, copies instead of hardlinks
- **Settings** — live connection status per service with one-click test, masked API key display
- Auto-refresh every 60 seconds (configurable)
- Poster images proxied server-side (no CORS, no key exposure)
- Fully responsive — mobile, tablet, desktop

---

## Quick start

```yaml
# docker-compose.yml
version: "3.8"
services:
  analysarr:
    image: ghcr.io/your-username/analysarr:latest
    container_name: analysarr
    ports:
      - "3000:3000"
    environment:
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=your_radarr_api_key
      - SONARR_URL=http://sonarr:8989
      - SONARR_API_KEY=your_sonarr_api_key
      - QBIT_URL=http://qbittorrent:8080
      - QBIT_USERNAME=admin
      - QBIT_PASSWORD=your_password
      - REFRESH_INTERVAL=60
      - PATH_MAP_FROM=/data
      - PATH_MAP_TO=/media
    restart: unless-stopped
    networks:
      - media

networks:
  media:
    external: true
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Build from source

```bash
git clone https://github.com/your-username/analysarr
cd analysarr
docker build -t analysarr .
```

Or for local development:

```bash
npm install
npm run dev
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `RADARR_URL` | Yes | — | Base URL of your Radarr instance (e.g. `http://radarr:7878`) |
| `RADARR_API_KEY` | Yes | — | Radarr API key (Settings → General) |
| `SONARR_URL` | Yes | — | Base URL of your Sonarr instance |
| `SONARR_API_KEY` | Yes | — | Sonarr API key |
| `QBIT_URL` | Yes | — | Base URL of your qBittorrent WebUI |
| `QBIT_USERNAME` | No | `admin` | qBittorrent WebUI username |
| `QBIT_PASSWORD` | Yes | — | qBittorrent WebUI password |
| `REFRESH_INTERVAL` | No | `60` | Dashboard auto-refresh interval in seconds |
| `PATH_MAP_FROM` | No | — | Path prefix inside the qBittorrent container (e.g. `/data`) |
| `PATH_MAP_TO` | No | — | Corresponding path inside the Radarr/Sonarr container (e.g. `/media`) |

> **No `.env` file is required.** All values are injected via `docker-compose` environment blocks.

---

## FAQ

### How does hardlink detection work?

Analysarr compares the `content_path` (or `save_path`) of each qBittorrent torrent with the file path reported by Radarr/Sonarr. If the paths overlap, the file is considered hardlinked.

### What is `PATH_MAP_FROM` / `PATH_MAP_TO`?

In a typical Docker setup, qBittorrent mounts your downloads at `/data/torrents` while Radarr/Sonarr see the same files at `/media/torrents`. These environment variables tell Analysarr how to translate between the two path spaces so it can match files correctly.

**Example:**
```
PATH_MAP_FROM=/data
PATH_MAP_TO=/media
```
A qBit path of `/data/torrents/Movie.mkv` will be mapped to `/media/torrents/Movie.mkv` before comparing with Radarr paths.

### Why are API keys not visible in Settings?

API keys are server-side only and are never sent to the browser. The settings page shows masked placeholders and the actual URL values fetched from live service status checks.

---

## Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE)
