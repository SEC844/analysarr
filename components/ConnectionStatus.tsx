'use client';

import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceStatus } from '@/lib/types';

interface ConnectionStatusProps {
  status: ServiceStatus;
  loading?: boolean;
  className?: string;
}

export function ConnectionStatus({ status, loading, className }: ConnectionStatusProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        ) : status.connected ? (
          <CheckCircle className="h-5 w-5 text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" />
        )}
        <div>
          <p className="text-sm font-medium text-white">{status.name}</p>
          <p className="text-xs text-zinc-500 break-all">{status.url || 'Not configured'}</p>
        </div>
      </div>
      <div className="text-right">
        {loading ? (
          <span className="text-xs text-zinc-500">Checking…</span>
        ) : status.connected ? (
          <span className="text-xs text-green-400">
            Connected{status.version ? ` · v${status.version}` : ''}
          </span>
        ) : (
          <span className="text-xs text-red-400">{status.error ?? 'Error'}</span>
        )}
      </div>
    </div>
  );
}
