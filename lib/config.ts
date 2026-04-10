import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const CONFIG_FILE = process.env.CONFIG_PATH ?? '/config/mappings.json';

export interface PathMapping {
  from: string;
  to: string;
}

export interface ServiceConfig {
  url?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface AppConfig {
  pathMappings: PathMapping[];
  services: {
    radarr?: ServiceConfig;
    sonarr?: ServiceConfig;
    qbit?: ServiceConfig;
    crossseed?: ServiceConfig;
  };
  refreshInterval: number; // seconds
}

// In-process config cache (5 s TTL) to avoid file reads on every request
let _cached: AppConfig | null = null;
let _cachedAt = 0;
const CONFIG_TTL_MS = 5_000;

export const DEFAULT_CONFIG: AppConfig = {
  pathMappings: [],
  services: {},
  refreshInterval: 60,
};

export function loadConfig(): AppConfig {
  const now = Date.now();
  if (_cached && now - _cachedAt < CONFIG_TTL_MS) return _cached;
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    _cached = {
      ...DEFAULT_CONFIG,
      ...parsed,
      services: { ...DEFAULT_CONFIG.services, ...parsed.services },
    };
    _cachedAt = now;
    return _cached;
  } catch {
    _cached = { ...DEFAULT_CONFIG };
    _cachedAt = now;
    return _cached;
  }
}

export function saveConfig(config: AppConfig): void {
  _cached = config;
  _cachedAt = Date.now();
  try { mkdirSync(dirname(CONFIG_FILE), { recursive: true }); } catch { /* ok */ }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
