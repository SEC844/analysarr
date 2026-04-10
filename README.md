# Analysarr

> Real-time dashboard for your \*arr media stack — Radarr · Sonarr · qBittorrent

![Screenshot placeholder](docs/screenshot.png)

Analysarr is a self-hosted, dark-mode-first web dashboard that gives you an instant overview of your entire media library: what is seeding, what is hardlinked, and what needs attention.

---

## Features

- **Dashboard** — stat cards (movies, series, episodes, seeding count, hardlinks, total seeding size) + full media grid with poster images. Only downloaded media is shown — wanted/missing items are excluded.
- **Torrent list** — all active qBittorrent torrents cross-referenced with Radarr/Sonarr, color-coded by state. ETA shows `∞` for seeding torrents.
- **Issues panel** — auto-detected problems: missing torrents, orphan torrents, duplicates, copies instead of hardlinks
- **Settings** — live connection status per service with one-click test, masked API key display
- **Inode-based hardlink detection** — compares filesystem inodes instead of paths, giving a reliable hardlink status regardless of path layout
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
    image: ghcr.io/SEC844/analysarr:latest
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
    volumes:
      - /mnt/user/data:/data:ro      # qBittorrent download root
      - /mnt/user/media:/media:ro    # Radarr / Sonarr media root
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
git clone https://github.com/SEC844/analysarr
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
| `PATH_MAP_FROM` | No | — | Fallback path prefix used by qBittorrent (e.g. `/data`) |
| `PATH_MAP_TO` | No | — | Corresponding prefix used by Radarr/Sonarr (e.g. `/media`) |
| `CROSSSEED_URL` | No | — | Base URL of your Cross Seed instance |
| `CROSSSEED_PORT` | No | `2468` | Cross Seed port override |
| `CROSSSEED_API_KEY` | No | — | Cross Seed API key (`cross-seed api-key`) |

> **No `.env` file is required.** All values are injected via `docker-compose` environment blocks.

---

## FAQ

### How does hardlink detection work?

Analysarr compares the **inode** of each file reported by Radarr/Sonarr against the inode of the corresponding qBittorrent torrent file. Two files with identical inodes are hardlinks of the same data — this is the most reliable detection method regardless of path layout.

For this to work, the same directories used by qBittorrent and Radarr/Sonarr must be mounted **read-only** into the Analysarr container. See the volume mounts in the docker-compose example above.

When the filesystem is not mounted (no volumes configured), Analysarr falls back to a path-overlap comparison using `PATH_MAP_FROM` / `PATH_MAP_TO`.

### What volumes should I mount on Unraid?

Mount the Unraid user share(s) that contain your downloads and media library:

```yaml
volumes:
  - /mnt/user/data:/data:ro      # if torrents and media are both under /mnt/user/data
  # OR if they are on separate shares:
  - /mnt/user/downloads:/data:ro
  - /mnt/user/media:/media:ro
```

The paths inside the container (`/data`, `/media`) must match what qBittorrent and Radarr/Sonarr report as their file paths.

### What is `PATH_MAP_FROM` / `PATH_MAP_TO`?

These variables are a fallback for when the filesystem is **not** mounted. They translate qBittorrent paths to \*arr paths for a path-overlap comparison.

**Example:**
```
PATH_MAP_FROM=/data
PATH_MAP_TO=/media
```
A qBit path of `/data/torrents/Movie.mkv` is translated to `/media/torrents/Movie.mkv` before comparing with Radarr paths.

If you mount the volumes (recommended), inode comparison is used automatically and these variables are not needed.

### Why does Cross Seed show "HTTP 404"?

Cross Seed v6+ is required for the `/api/torrents` endpoint. If you are running an older version, either update Cross Seed or the integration will be disabled (the rest of the dashboard still works normally).

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
