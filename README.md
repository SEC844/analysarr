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
- **Path mapper UI** — interactive file browser in Settings to configure path translations, no env vars required
- **Media detail page** — click any poster to see all associated files (in `/media` and `/data`), active torrents with paths, cross-seed status, and a direct link to Radarr/Sonarr
- **Cross Seed detection** via qBittorrent tags — no Cross Seed API version dependency
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
      # Optional
      - REFRESH_INTERVAL=60
      - CROSSSEED_URL=http://cross-seed:2468
      - CROSSSEED_API_KEY=your_crossseed_api_key
    volumes:
      - /mnt/user/data:/data:ro              # qBittorrent download root
      - /mnt/user/media:/media:ro            # Radarr / Sonarr media root
      - /mnt/user/appdata/analysarr:/config  # persist path mappings set in the UI
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
| `CROSSSEED_URL` | No | — | Base URL of your Cross Seed instance |
| `CROSSSEED_API_KEY` | No | — | Cross Seed API key (`cross-seed api-key`) |
| `NEXT_PUBLIC_RADARR_URL` | No | — | Browser-accessible Radarr URL for external links on detail pages |
| `NEXT_PUBLIC_SONARR_URL` | No | — | Browser-accessible Sonarr URL for external links on detail pages |
| `CONFIG_PATH` | No | `/config/mappings.json` | Override path for the UI-configured mappings file |

> **No `.env` file is required.** All values are injected via `docker-compose` environment blocks.

---

## FAQ

### How does hardlink detection work?

Analysarr compares the **inode** of each file reported by Radarr/Sonarr against the inode of the corresponding qBittorrent torrent file. Two files with identical inodes are hardlinks of the same data — this is the most reliable detection method regardless of path layout.

For this to work, the same directories used by qBittorrent and Radarr/Sonarr must be mounted **read-only** into the Analysarr container. See the volume mounts in the docker-compose example above.

### What volumes should I mount?

Mount your download and media roots read-only so Analysarr can call `fs.stat()` on the files:

```yaml
volumes:
  - /mnt/user/data:/data:ro      # qBittorrent download root
  - /mnt/user/media:/media:ro    # Radarr / Sonarr media root
  - /mnt/user/appdata/analysarr:/config  # persist UI-configured path mappings
```

### What if my paths inside and outside the container differ?

If Radarr/Sonarr report paths that start with a different prefix than what is mounted in the Analysarr container, you need to configure a **path mapping**.

Instead of setting environment variables, open **Settings → Path mappings** and use the interactive file browser to select:

- **Source** — the prefix that Radarr/Sonarr uses (e.g. `/data/media/tv`)
- **Target** — the corresponding path inside the Analysarr container (e.g. `/media/tv`)

Mappings are saved to `/config/mappings.json` and take effect immediately on the next dashboard refresh. Mount a `/config` volume so they survive container restarts.

**Example on Unraid:** Sonarr reports paths as `/data/media/tv/Show` but Analysarr mounts `/mnt/user/Data/media` as `/media`. Set:
- Source: `/data/media`
- Target: `/media`

### How does Cross Seed detection work?

Cross Seed detection reads the `tags` and `category` fields of each qBittorrent torrent and flags any torrent containing `cross-seed` as a cross-seed. This matches the default tag that Cross Seed sets when injecting a torrent into qBittorrent and works with any Cross Seed version.

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
