'use client';

import { cn } from '@/lib/utils';
import type { SeedingStatus, HardlinkStatus, MediaType } from '@/lib/types';

/* ── Seed ─────────────────────────────────────────────────────────────────── */
interface SeedBadgeProps { status: SeedingStatus; className?: string; compact?: boolean }

export function SeedBadge({ status, className, compact }: SeedBadgeProps) {
  const base = compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      base,
      status === 'seeding'
        ? 'bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-400'
        : status === 'not_seeding'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400'
        : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
      className
    )}>
      <span className={cn(
        'rounded-full',
        compact ? 'h-1 w-1' : 'h-1.5 w-1.5',
        status === 'seeding' ? 'bg-green-500 dark:bg-green-400'
        : status === 'not_seeding' ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-gray-400 dark:bg-zinc-500'
      )} />
      {status === 'seeding' ? 'Seeding' : status === 'not_seeding' ? 'No seed' : 'Unknown'}
    </span>
  );
}

/* ── Hardlink ─────────────────────────────────────────────────────────────── */
interface HardlinkBadgeProps { status: HardlinkStatus; className?: string; compact?: boolean }

export function HardlinkBadge({ status, className, compact }: HardlinkBadgeProps) {
  if (status === 'unknown') return null;
  const base = compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      base,
      status === 'hardlinked'
        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
        : 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-400',
      className
    )}>
      {status === 'hardlinked' ? '⛓ Hardlinked' : '✗ No hardlink'}
    </span>
  );
}

/* ── Type ─────────────────────────────────────────────────────────────────── */
interface TypeBadgeProps { type: MediaType; className?: string }

export function TypeBadge({ type, className }: TypeBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      type === 'movie'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300',
      className
    )}>
      {type === 'movie' ? 'Movie' : 'Series'}
    </span>
  );
}

/* ── Cross Seed ───────────────────────────────────────────────────────────── */
interface CrossSeedBadgeProps { count: number; className?: string; compact?: boolean }

export function CrossSeedBadge({ count, className, compact }: CrossSeedBadgeProps) {
  if (count === 0) return null;
  const base = compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      base,
      'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300',
      className
    )}
      title={`${count} cross-seed${count !== 1 ? 's' : ''} active`}
    >
      ×{count} CS
    </span>
  );
}
