import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds < 0 || seconds >= 8640000) return '∞';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function maskApiKey(key: string | undefined): string {
  if (!key) return '(not set)';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export const REFRESH_INTERVAL_MS =
  parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

/**
 * Normalize a raw URL entered by the user into a clean base URL.
 *
 * Handles:
 *   - Bare host:port           "10.0.0.100:8080"  → "http://10.0.0.100:8080"
 *   - Trailing slash           "http://host:port/" → "http://host:port"
 *   - Trailing path            "http://host:port/ui" → "http://host:port/ui"
 *   - Port override            portOverride replaces whatever port is in the URL
 */
export function normalizeUrl(raw: string): string {
  if (!raw) return '';
  let url = raw.trim();

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }

  // Remove trailing slash
  url = url.replace(/\/+$/, '');

  return url;
}

/**
 * Builds the final base URL for a service.
 * If a PORT override env var is set it replaces the port in the URL.
 */
export function buildServiceUrl(url: string, portOverride: string | undefined): string {
  const base = normalizeUrl(url);
  if (!base) return '';
  if (!portOverride) return base;

  const port = parseInt(portOverride, 10);
  if (isNaN(port)) return base;

  try {
    const parsed = new URL(base);
    parsed.port = String(port);
    // Return origin only (strips path/trailing slash)
    return parsed.origin;
  } catch {
    return base;
  }
}
