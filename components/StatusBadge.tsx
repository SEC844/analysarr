'use client';

import { cn } from '@/lib/utils';
import type { SeedingStatus, HardlinkStatus, MediaType, SeedStatus } from '@/lib/types';

/* ── SeedStatus (new inode-based badge) ──────────────────────────────────── */
interface SeedStatusBadgeProps { status: SeedStatus; className?: string; compact?: boolean }

export function SeedStatusBadge({ status, className, compact }: SeedStatusBadgeProps) {
  const base = compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-xs';

  const styles: Record<SeedStatus, { bg: string; dot: string; label: string }> = {
    seed_ok:           { bg: 'bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-400',   dot: 'bg-green-500 dark:bg-green-400',   label: 'Seed + CS' },
    seed_no_cs:        { bg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/60 dark:text-yellow-400', dot: 'bg-yellow-500 dark:bg-yellow-400', label: 'Seed' },
    seed_not_hardlink: { bg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-400', dot: 'bg-orange-500 dark:bg-orange-400', label: 'Non hardlink' },
    seed_duplicate:    { bg: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-400',           dot: 'bg-red-500 dark:bg-red-400',       label: 'Doublon' },
    not_seeding:       { bg: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',          dot: 'bg-gray-400 dark:bg-zinc-500',     label: 'Non seedé' },
  };

  const { bg, dot, label } = styles[status] ?? styles.not_seeding;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      base, bg, className
    )}>
      <span className={cn('rounded-full', compact ? 'h-1 w-1' : 'h-1.5 w-1.5', dot)} />
      {label}
    </span>
  );
}

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
