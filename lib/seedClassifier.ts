import type { FileInfo } from './fileScanner';

/**
 * qBittorrent states considered "actively seeding".
 * forcedUP = forced seeding (manual override)
 * uploading = actively uploading to peers
 * stalledUP = seeding but no peers available
 * checkingUP = verifying piece hashes before seeding
 * queuedUP = queued to seed (waiting for slot)
 */
export const QBIT_SEEDING_STATES = new Set([
  'uploading',
  'stalledUP',
  'forcedUP',
  'checkingUP',
  'queuedUP',
]);

/**
 * The 5 exclusive seed classification states.
 *
 * seed_ok          → qBit active + inode /media == inode /data + nlink >= 3 (hardlink + cross-seed)
 * seed_no_cs       → qBit active + inode /media == inode /data + nlink == 2 (hardlink, no cross-seed)
 * seed_not_hardlink→ qBit active + inode /media != inode /data (physical copy instead of hardlink)
 * seed_duplicate   → qBit active + multiple /data files same size, different inodes (duplicate torrent)
 * not_seeding      → not in qBit active state, or file only in /media
 */
export type SeedStatus =
  | 'seed_ok'
  | 'seed_no_cs'
  | 'seed_not_hardlink'
  | 'seed_duplicate'
  | 'not_seeding';

export interface ClassifyParams {
  /** The file as it exists in /media (after path mapping) */
  mediaFile: FileInfo;
  /** All candidate files found in /data for this media entry */
  dataFiles: FileInfo[];
  /** True if the torrent is present in qBit with an active seeding state */
  isInQbit: boolean;
  /** The qBittorrent state string of the matched torrent (e.g. 'stalledUP') */
  qbitState?: string;
}

/**
 * Pure classification function — no I/O, no side effects.
 * Classification rules (in priority order):
 *
 * 1. Not in qBit with active state → not_seeding
 * 2. inode /media == inode /data:
 *    - nlink >= 3 → seed_ok
 *    - nlink == 2 → seed_no_cs
 * 3. Multiple /data files with same size (±0 bytes) + different inode → seed_duplicate
 * 4. Otherwise → seed_not_hardlink
 */
export function classifySeedStatus(params: ClassifyParams): SeedStatus {
  const { mediaFile, dataFiles, isInQbit, qbitState } = params;

  // Rule 1: must be in qBit with an active seeding state
  if (!isInQbit || !qbitState || !QBIT_SEEDING_STATES.has(qbitState)) {
    return 'not_seeding';
  }

  // Rule 2: check for inode match between /media and any /data file
  const inodeMatch = dataFiles.find(df => df.inode === mediaFile.inode);
  if (inodeMatch) {
    // nlink counts all hardlinks to the inode across the filesystem
    // >= 3 means: at least /media link + /data link + 1 cross-seed link
    return inodeMatch.nlink >= 3 ? 'seed_ok' : 'seed_no_cs';
  }

  // Rule 3: duplicate detection — same size (exact), different inode
  // A cross-seed with inode match is already handled above.
  // Here we look for a /data file that is a DIFFERENT physical file but same size.
  const exactSizeDuplicates = dataFiles.filter(
    df => df.inode !== mediaFile.inode && df.size === mediaFile.size,
  );
  if (exactSizeDuplicates.length > 0) {
    return 'seed_duplicate';
  }

  // Rule 4: torrent is active, file exists in /media, but no hardlink to /data
  return 'seed_not_hardlink';
}

/**
 * Aggregate multiple per-file seed statuses into one status for a media entry.
 * Priority (worst first): seed_duplicate > seed_not_hardlink > seed_no_cs > seed_ok > not_seeding
 *
 * Used for series where multiple episode files each have their own status.
 */
export function aggregateSeedStatus(statuses: SeedStatus[]): SeedStatus {
  if (statuses.length === 0) return 'not_seeding';

  const priority: Record<SeedStatus, number> = {
    seed_duplicate:     5,
    seed_not_hardlink:  4,
    seed_no_cs:         3,
    seed_ok:            2,
    not_seeding:        1,
  };

  return statuses.reduce((worst, curr) =>
    priority[curr] > priority[worst] ? curr : worst,
  statuses[0]);
}
