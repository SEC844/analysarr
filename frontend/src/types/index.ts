// Types alignés sur les schemas Pydantic backend

export type SeedStatus =
  | 'seed_ok'
  | 'seed_no_cs'
  | 'seed_not_hardlink'
  | 'seed_duplicate'
  | 'not_seeding'

export type MediaSource = 'radarr' | 'sonarr'
export type MediaType   = 'movie'  | 'series'

export interface FileMetadata {
  path:   string
  size:   number
  inode:  number
  nlink:  number
  exists: boolean
}

export interface QbitTorrent {
  hash:         string
  name:         string
  save_path:    string
  content_path: string
  size:         number
  state:        string
  tags:         string
  category:     string
  ratio:        number
  uploaded:     number
  downloaded:   number
  upspeed:      number
  dlspeed:      number
  eta:          number
  num_seeds:    number
  num_leechs:   number
  tracker:      string
  added_on:     number
}

export interface MediaItem {
  id:           string
  source:       MediaSource
  media_type:   MediaType
  title:        string
  year:         number
  imdb_id:      string | null
  tmdb_id:      number | null
  tvdb_id:      number | null
  poster_url:   string | null

  media_file:   FileMetadata | null

  seed_status:      SeedStatus
  is_hardlinked:    boolean
  is_cross_seeded:  boolean
  is_duplicate:     boolean

  torrents_files:   FileMetadata[]
  crossseed_files:  FileMetadata[]
  matched_torrents: QbitTorrent[]

  episode_file_count: number
}

export interface GlobalStats {
  total:             number
  seed_ok:           number
  seed_no_cs:        number
  seed_not_hardlink: number
  seed_duplicate:    number
  not_seeding:       number
}

export interface ScanStatus {
  running:     boolean
  last_scan:   number | null
  progress:    number
  total_items: number
  scanned:     number
  error:       string | null
}

export interface ServiceConfig {
  url:      string
  api_key:  string
  username: string
  password: string
  enabled:  boolean
}

export interface PathsConfig {
  media:     string
  torrents:  string
  crossseed: string
}

export interface AppConfig {
  radarr:      ServiceConfig
  sonarr:      ServiceConfig
  qbittorrent: ServiceConfig
  crossseed:   ServiceConfig
  paths:       PathsConfig
}

export interface ServiceConfigPublic {
  url:             string
  enabled:         boolean
  has_credentials: boolean  // true si api_key/password configuré côté serveur
}

export interface AppConfigPublic {
  radarr:      ServiceConfigPublic
  sonarr:      ServiceConfigPublic
  qbittorrent: ServiceConfigPublic
  crossseed:   ServiceConfigPublic
  paths:       PathsConfig
}

export interface ConnectionTestResult {
  service: string
  success: boolean
  message: string
  version: string | null
}

export interface UnmatchedTorrent {
  torrent:       QbitTorrent
  guessed_title: string | null
  guessed_year:  number | null
  imdb_id:       string | null
}

// ── Constantes UI ──────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<SeedStatus, { label: string; color: string; dotColor: string }> = {
  seed_ok:           { label: 'Seed + CS',    color: 'bg-green-900/60 text-green-400 border-green-800',   dotColor: 'bg-green-400'  },
  seed_no_cs:        { label: 'Seed',         color: 'bg-blue-900/60 text-blue-400 border-blue-800',      dotColor: 'bg-blue-400'   },
  seed_not_hardlink: { label: 'Non hardlink', color: 'bg-orange-900/60 text-orange-400 border-orange-800', dotColor: 'bg-orange-400' },
  seed_duplicate:    { label: 'Doublon',      color: 'bg-red-900/60 text-red-400 border-red-800',         dotColor: 'bg-red-400'    },
  not_seeding:       { label: 'Non seedé',    color: 'bg-zinc-800 text-zinc-400 border-zinc-700',         dotColor: 'bg-zinc-500'   },
}

export const QBIT_STATE_LABELS: Record<string, string> = {
  uploading:    'Seeding',
  stalledUP:    'Seeding (idle)',
  forcedUP:     'Seeding (forcé)',
  checkingUP:   'Vérification',
  queuedUP:     'En file',
  downloading:  'Téléchargement',
  stalledDL:    'Bloqué (DL)',
  pausedUP:     'Pausé',
  pausedDL:     'Pausé (DL)',
  error:        'Erreur',
  missingFiles: 'Fichiers manquants',
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

export function formatEta(secs: number): string {
  if (secs < 0 || secs >= 8640000) return '∞'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
