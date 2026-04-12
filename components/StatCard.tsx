'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'zinc';
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

const colorMap = {
  green:  'text-green-600  dark:text-green-400  bg-green-50   dark:bg-green-900/30',
  amber:  'text-amber-600  dark:text-amber-400  bg-amber-50   dark:bg-amber-900/30',
  red:    'text-red-600    dark:text-red-400    bg-red-50     dark:bg-red-900/30',
  blue:   'text-blue-600   dark:text-blue-400   bg-blue-50    dark:bg-blue-900/30',
  purple: 'text-purple-600 dark:text-purple-400 bg-purple-50  dark:bg-purple-900/30',
  zinc:   'text-gray-500   dark:text-zinc-400   bg-gray-100   dark:bg-zinc-800/60',
};

export function StatCard({ label, value, icon: Icon, color = 'zinc', className, onClick, active }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 bg-surface transition-all duration-150',
        active
          ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500/40 dark:ring-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20'
          : 'border-default',
        onClick && 'cursor-pointer hover:border-gray-300 dark:hover:border-zinc-600 hover:shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 truncate">{label}</p>
        <div className={cn('rounded-lg p-1.5 shrink-0', colorMap[color])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
    </motion.div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border p-3 bg-surface border-default animate-pulse">
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-20 rounded bg-gray-200 dark:bg-zinc-700" />
        <div className="h-6 w-6 rounded-lg bg-gray-200 dark:bg-zinc-700" />
      </div>
      <div className="mt-1.5 h-6 w-12 rounded bg-gray-200 dark:bg-zinc-700" />
    </div>
  );
}
