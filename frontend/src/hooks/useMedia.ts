import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MediaItem, GlobalStats, ScanStatus, AppConfig, AppConfigPublic, PathsConfig, ConnectionTestResult, UnmatchedTorrent, QbitTorrent } from '../types'
import type { MediaListItem } from '../types'

const API = '/api'

// ── Media ─────────────────────────────────────────────────────────────────────

export interface MediaFilters {
  status?:     string
  source?:     string
  media_type?: string
  search?:     string
}

export function useMedia(filters?: MediaFilters) {
  const params = new URLSearchParams()
  if (filters?.status)     params.set('status',     filters.status)
  if (filters?.source)     params.set('source',     filters.source)
  if (filters?.media_type) params.set('media_type', filters.media_type)
  if (filters?.search)     params.set('search',     filters.search)

  const qs = params.toString()
  return useQuery<MediaItem[]>({
    queryKey: ['media', filters],
    queryFn: () => fetch(`${API}/media${qs ? '?' + qs : ''}`).then(r => r.json()),
    refetchInterval: 60_000,
  })
}

export function useMediaDetail(id: string) {
  return useQuery<MediaItem>({
    queryKey: ['media', id],
    queryFn: () => fetch(`${API}/media/${id}`).then(r => r.json()),
    staleTime: 30_000,
    enabled: !!id,
  })
}

export function useStats() {
  return useQuery<GlobalStats>({
    queryKey: ['stats'],
    queryFn: () => fetch(`${API}/media/stats`).then(r => r.json()),
    refetchInterval: 30_000,
  })
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export function useScanStatus() {
  return useQuery<ScanStatus>({
    queryKey: ['scan-status'],
    queryFn: () => fetch(`${API}/scan/status`).then(r => r.json()),
    refetchInterval: 5_000,
  })
}

export function useTriggerScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetch(`${API}/scan/trigger`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Charge la config publique : URLs + has_credentials (bool).
 * Les credentials (api_key, password…) ne sont JAMAIS renvoyés par l'API.
 */
export function useConfig() {
  return useQuery<AppConfigPublic>({
    queryKey: ['config'],
    queryFn: () => fetch(`${API}/config`).then(r => r.json()),
    staleTime: Infinity,
  })
}

export function useSaveConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cfg: AppConfig) =>
      fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

/** Détecte automatiquement les chemins media/torrents/cross-seed dans le conteneur. */
export function useDetectPaths() {
  return useMutation<PathsConfig, Error>({
    mutationFn: () => fetch(`${API}/config/detect-paths`).then(r => r.json()),
  })
}

export function useTestConnection() {
  return useMutation<ConnectionTestResult, Error, { service: string; config: AppConfig }>({
    mutationFn: ({ service, config }) =>
      fetch(`${API}/config/test/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }).then(r => r.json()),
  })
}

// ── Torrents ──────────────────────────────────────────────────────────────────

export function useTorrents() {
  return useQuery<QbitTorrent[]>({
    queryKey: ['torrents'],
    queryFn: () => fetch(`${API}/torrents`).then(r => r.json()),
    refetchInterval: 30_000,
  })
}

export function useUnmatchedTorrents() {
  return useQuery<UnmatchedTorrent[]>({
    queryKey: ['torrents-unmatched'],
    queryFn: () => fetch(`${API}/torrents/unmatched`).then(r => r.json()),
    staleTime: 60_000,
  })
}

export function useMediaList() {
  return useQuery<MediaListItem[]>({
    queryKey: ['media-list'],
    queryFn: () => fetch(`${API}/torrents/media-list`).then(r => r.json()),
    staleTime: 5 * 60_000,
  })
}

export function useMapTorrent() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { hash: string; media_id: string }>({
    mutationFn: ({ hash, media_id }) =>
      fetch(`${API}/torrents/${hash}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['torrents-unmatched'] }),
  })
}

export function useUnmapTorrent() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: (hash: string) =>
      fetch(`${API}/torrents/${hash}/map`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['torrents-unmatched'] }),
  })
}

// ── Browse filesystem ────────────────────────────────────────────────────────

export function useBrowse(path: string) {
  return useQuery<{ path: string; dirs: Array<{ name: string; path: string }> }>({
    queryKey: ['browse', path],
    queryFn: () => fetch(`${API}/config/browse?path=${encodeURIComponent(path)}`).then(r => r.json()),
    staleTime: 30_000,
  })
}
