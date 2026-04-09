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
}

const colorMap = {
  green: 'text-green-400 bg-green-900/30',
  amber: 'text-amber-400 bg-amber-900/30',
  red: 'text-red-400 bg-red-900/30',
  blue: 'text-blue-400 bg-blue-900/30',
  purple: 'text-purple-400 bg-purple-900/30',
  zinc: 'text-zinc-400 bg-zinc-800/60',
};

export function StatCard({ label, value, icon: Icon, color = 'zinc', className }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 backdrop-blur',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <div className={cn('rounded-lg p-2', colorMap[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-white tabular-nums">{value}</p>
    </motion.div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-zinc-800" />
        <div className="h-8 w-8 rounded-lg bg-zinc-800" />
      </div>
      <div className="mt-2 h-8 w-16 rounded bg-zinc-800" />
    </div>
  );
}
