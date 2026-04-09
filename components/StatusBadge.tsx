'use client';

import { cn } from '@/lib/utils';
import type { SeedingStatus, HardlinkStatus, MediaType } from '@/lib/types';

interface SeedBadgeProps {
  status: SeedingStatus;
  className?: string;
}

export function SeedBadge({ status, className }: SeedBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'seeding'
          ? 'bg-green-900/60 text-green-400 ring-1 ring-green-700'
          : status === 'not_seeding'
          ? 'bg-amber-900/60 text-amber-400 ring-1 ring-amber-700'
          : 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700',
        className
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'seeding'
            ? 'bg-green-400'
            : status === 'not_seeding'
            ? 'bg-amber-400'
            : 'bg-zinc-500'
        )}
      />
      {status === 'seeding' ? 'Seeding' : status === 'not_seeding' ? 'Not seeding' : 'Unknown'}
    </span>
  );
}

interface HardlinkBadgeProps {
  status: HardlinkStatus;
  className?: string;
}

export function HardlinkBadge({ status, className }: HardlinkBadgeProps) {
  if (status === 'unknown') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'hardlinked'
          ? 'bg-green-900/40 text-green-400 ring-1 ring-green-800'
          : 'bg-red-900/60 text-red-400 ring-1 ring-red-700',
        className
      )}
    >
      {status === 'hardlinked' ? '⛓ Hardlinked' : '✗ Not hardlinked'}
    </span>
  );
}

interface TypeBadgeProps {
  type: MediaType;
  className?: string;
}

export function TypeBadge({ type, className }: TypeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        type === 'movie'
          ? 'bg-blue-900/60 text-blue-300 ring-1 ring-blue-700'
          : 'bg-purple-900/60 text-purple-300 ring-1 ring-purple-700',
        className
      )}
    >
      {type === 'movie' ? 'Movie' : 'Series'}
    </span>
  );
}

interface CrossSeedBadgeProps {
  count: number;
  className?: string;
}

export function CrossSeedBadge({ count, className }: CrossSeedBadgeProps) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-cyan-900/60 text-cyan-300 ring-1 ring-cyan-700',
        className
      )}
      title={`${count} cross-seed${count !== 1 ? 's' : ''} active`}
    >
      ✕ {count} cross-seed{count !== 1 ? 's' : ''}
    </span>
  );
}
