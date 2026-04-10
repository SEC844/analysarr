import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/** Path to the persisted config file. Override with CONFIG_PATH env var. */
const CONFIG_FILE = process.env.CONFIG_PATH ?? '/config/mappings.json';

export interface PathMapping {
  from: string;
  to: string;
}

export interface AppConfig {
  pathMappings: PathMapping[];
}

export function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    return { pathMappings: [] };
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  } catch { /* directory may already exist */ }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
