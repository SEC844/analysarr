# Analysarr

> Real-time dashboard for your \*arr media stack — Radarr · Sonarr · qBittorrent

Analysarr is a self-hosted web dashboard that gives you an instant overview of your entire media library: what is seeding, what is hardlinked, and what needs attention. Supports dark and light themes.

---

## Features

- **Dashboard** — stat cards + full media grid with poster art. Only downloaded media is shown — wanted/missing items are excluded.
- **Dark / Light theme** — toggle in the navbar, preference saved across sessions.
- **Torrent matching via Radarr/Sonarr history API** — uses the download hash directly, giving near-perfect accuracy. Falls back to path overlap then fuzzy name matching.
- **Duplicate detection** — flags non-cross-seed torrents that differ from the \*arr file by more than 2% in size. Cross-seed re-seeds are explicitly excluded.
- **Hardlink detection** — compares filesystem inodes (`fs.statSync({ bigint: true })`), immune to BigInt precision loss. Only canonical-version torrents are checked.
- **Cross Seed detection** — reads qBittorrent `tags`/`category` fields, no Cross Seed API version dependency.
- **Issues panel** — auto-detected problems: missing torrents, orphan torrents, version duplicates, copies instead of hardlinks.
- **Manual torrent linking** — from the Torrents page, link any unmatched torrent to a specific movie or series.
- **Media detail pages** — click any poster to see all associated files, active torrents with paths, cross-seed status, and a direct link to Radarr/Sonarr.
- **Settings UI** — configure all service connections (URL + credentials) directly in the browser. Test connection before saving. No env vars required.
- **Path mapper** — interactive file browser to configure path translations between container and host.
- Auto-refresh every 60 s (configurable).
- Poster images proxied server-side — no CORS issues, credentials never exposed to the browser.
- Fully responsive — mobile, tablet, desktop.

---

## Quick start

```yaml
# docker-compose.yml
services:
  analysarr:
    image: ghcr.io/SEC844/analysarr:latest
    ports:
      - "3000:3000"
    volumes:
      - /mnt/user/data:/data:ro              # qBittorrent download root
      - /mnt/user/media:/media:ro            # Radarr / Sonarr media root
      - /mnt/user/appdata/analysarr:/config  # persists UI-configured credentials & mappings
    restart: unless-stopped
```

Then open [http://localhost:3000](http://localhost:3000) and configure your services in **Settings**.

> No environment variables or API keys in the compose file — everything is configured through the web UI and stored in `/config/mappings.json`.

---

## Configuration

All service credentials are configured through **Settings → Services** in the web UI:

1. Click a service card to expand it.
2. Enter the URL and API key / credentials.
3. Click **Test connection** — saving is only enabled once the connection succeeds.
4. Click **Save**.

Credentials are stored server-side in `/config/mappings.json` and are never exposed to the browser.

### Optional environment variables

These are only needed if you want to override the UI config via environment (e.g. for automated deployments):

| Variable | Description |
|---|---|
| `RADARR_URL` | Base URL of your Radarr instance (e.g. `http://radarr:7878`) |
| `RADARR_API_KEY` | Radarr API key (Settings → General) |
| `SONARR_URL` | Base URL of your Sonarr instance |
| `SONARR_API_KEY` | Sonarr API key |
| `QBIT_URL` | Base URL of your qBittorrent WebUI |
| `QBIT_USERNAME` | qBittorrent username (default: `admin`) |
| `QBIT_PASSWORD` | qBittorrent password |
| `CROSSSEED_URL` | Base URL of your Cross Seed instance (optional) |
| `CROSSSEED_API_KEY` | Cross Seed API key — `cross-seed api-key` (optional) |
| `REFRESH_INTERVAL` | Dashboard auto-refresh in seconds (default: `60`) |
| `NEXT_PUBLIC_RADARR_URL` | Browser-accessible Radarr URL for detail page external links |
| `NEXT_PUBLIC_SONARR_URL` | Browser-accessible Sonarr URL for detail page external links |
| `CONFIG_PATH` | Override path for the config file (default: `/config/mappings.json`) |

---

## Path mappings

If Radarr/Sonarr report paths that differ from the mount points visible inside the Analysarr container, configure a path mapping in **Settings → Path mappings**:

- **Source** — the prefix that Radarr/Sonarr uses (e.g. `/data/media/tv`)
- **Target** — the corresponding path inside the Analysarr container (e.g. `/media/tv`)

Mappings take effect immediately and survive restarts (stored in `/config`).

**Example — Unraid:** Sonarr reports `/data/media/tv/Show` but Analysarr mounts the share as `/media`. Set source `/data/media` → target `/media`.

---

## Hardlink detection

Analysarr compares the **inode** of each file reported by Radarr/Sonarr against the inode of the qBittorrent torrent file using `fs.statSync({ bigint: true })`. Two files with identical inodes are hardlinks of the same data — reliable regardless of path layout and safe against JavaScript's 64-bit integer precision limit.

Required volume mounts for inode comparison to work:

```yaml
volumes:
  - /mnt/user/data:/data:ro    # qBittorrent download root
  - /mnt/user/media:/media:ro  # Radarr / Sonarr media root
```

---

## Duplicate detection

A torrent is flagged as a **duplicate** when:
- It is matched to a media entry in Radarr/Sonarr, **and**
- Its size differs from the \*arr file size by more than 2%, **and**
- It is **not** a cross-seed (cross-seeds are always treated as canonical regardless of size).

Duplicates appear as amber badges on media cards and are listed in the Issues panel.

---

## Torrent matching

Matching uses a four-level priority chain for each torrent:

1. **Manual link** — user-configured override from the Torrents page (highest priority).
2. **History hash** — Radarr/Sonarr `/history` API returns the exact qBittorrent hash for every past download. Most reliable method.
3. **Path overlap** — the torrent's `content_path` shares a prefix with the media file path (after path mapping).
4. **Name match** — year-gated token matching: torrent must contain the release year and all title words.

---

## Build from source

```bash
git clone https://github.com/SEC844/analysarr
cd analysarr
docker build -t analysarr .
```

Local development:

```bash
npm install
npm run dev
```

---

## License

MIT — see [LICENSE](LICENSE)
