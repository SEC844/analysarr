import { statSync, readdirSync } from 'fs';
import { join, basename } from 'path';

export interface FileInfo {
  path: string;
  inode: bigint;
  nlink: number;
  size: bigint;
}

/**
 * Stat a single file and return its FileInfo.
 * Uses bigint: true to avoid precision loss on large inode numbers.
 * Returns null if the path doesn't exist or is not accessible.
 */
export function scanFile(absolutePath: string): FileInfo | null {
  if (!absolutePath) return null;
  try {
    const s = statSync(absolutePath, { bigint: true });
    if (!s.isFile()) return null;
    return {
      path: absolutePath,
      inode: s.ino,
      nlink: Number(s.nlink),
      size: s.size,
    };
  } catch {
    return null;
  }
}

/**
 * Recursively scan a directory for all files matching the given filename.
 * Limited to 3 levels of depth to avoid runaway scans.
 * Uses bigint: true for inode precision.
 */
export function scanDirectory(dirPath: string, filename: string): FileInfo[] {
  const results: FileInfo[] = [];

  function walk(d: string, depth: number) {
    if (depth > 3) return;
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const fullPath = join(d, entry.name).replace(/\\/g, '/');
        if (entry.isFile()) {
          if (entry.name === filename) {
            try {
              const s = statSync(fullPath, { bigint: true });
              results.push({
                path: fullPath,
                inode: s.ino,
                nlink: Number(s.nlink),
                size: s.size,
              });
            } catch { /* skip inaccessible file */ }
          }
        } else if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      }
    } catch { /* skip inaccessible directory */ }
  }

  walk(dirPath, 0);
  return results;
}

/**
 * Collect all file inodes in a directory (recursively, max depth 2).
 * Used for directory-level inode matching.
 */
export function collectDirectoryInodes(dirPath: string, maxFiles = 50): Map<bigint, FileInfo> {
  const result = new Map<bigint, FileInfo>();

  function walk(d: string, depth: number) {
    if (depth > 2 || result.size >= maxFiles) return;
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (result.size >= maxFiles) break;
        const fullPath = join(d, entry.name).replace(/\\/g, '/');
        if (entry.isFile()) {
          try {
            const s = statSync(fullPath, { bigint: true });
            result.set(s.ino, {
              path: fullPath,
              inode: s.ino,
              nlink: Number(s.nlink),
              size: s.size,
            });
          } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      }
    } catch { /* skip */ }
  }

  walk(dirPath, 0);
  return result;
}

/**
 * Get FileInfo for a path that may be either a file or directory.
 * For directories, returns a synthetic FileInfo using the directory's inode.
 */
export function scanPath(absolutePath: string): FileInfo | null {
  if (!absolutePath) return null;
  try {
    const s = statSync(absolutePath, { bigint: true });
    return {
      path: absolutePath,
      inode: s.ino,
      nlink: Number(s.nlink),
      size: s.size,
    };
  } catch {
    return null;
  }
}

export { basename };
