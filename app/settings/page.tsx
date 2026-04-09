'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { maskApiKey } from '@/lib/utils';
import type { ServiceStatus } from '@/lib/types';

interface StatusData {
  radarr: ServiceStatus;
  sonarr: ServiceStatus;
  qbit: ServiceStatus;
  crossseed: ServiceStatus;
}

const ENV = {
  radarrUrl: process.env.NEXT_PUBLIC_RADARR_URL,
  sonarrUrl: process.env.NEXT_PUBLIC_SONARR_URL,
  qbitUrl: process.env.NEXT_PUBLIC_QBIT_URL,
  radarrKey: process.env.NEXT_PUBLIC_RADARR_API_KEY,
  sonarrKey: process.env.NEXT_PUBLIC_SONARR_API_KEY,
  refreshInterval: process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60',
  pathMapFrom: process.env.NEXT_PUBLIC_PATH_MAP_FROM,
  pathMapTo: process.env.NEXT_PUBLIC_PATH_MAP_TO,
};

export default function SettingsPage() {
  const [showKeys, setShowKeys] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<StatusData>({
    queryKey: ['status'],
    queryFn: () => fetch('/api/status').then((r) => r.json()),
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Connection status and environment configuration
        </p>
      </div>

      {/* Connection status */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Service connections</h2>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Test connections
          </button>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse" />
            ))
          ) : (
            <>
              {data?.radarr && <ConnectionStatus status={data.radarr} loading={isFetching} />}
              {data?.sonarr && <ConnectionStatus status={data.sonarr} loading={isFetching} />}
              {data?.qbit && <ConnectionStatus status={data.qbit} loading={isFetching} />}
              {data?.crossseed && (
                <ConnectionStatus status={data.crossseed} loading={isFetching} />
              )}
            </>
          )}
        </div>
      </section>

      {/* Config table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Environment variables</h2>
          <button
            onClick={() => setShowKeys((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showKeys ? 'Hide' : 'Show'} keys
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          These values are read from environment variables at server startup. Sensitive values are masked by default.
        </p>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Variable</th>
                <th className="px-4 py-3 text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['RADARR_URL', data?.radarr?.url],
                ['RADARR_API_KEY', showKeys ? '(server-side only)' : maskApiKey('hidden')],
                ['SONARR_URL', data?.sonarr?.url],
                ['SONARR_API_KEY', showKeys ? '(server-side only)' : maskApiKey('hidden')],
                ['QBIT_URL', data?.qbit?.url],
                ['REFRESH_INTERVAL', `${ENV.refreshInterval}s`],
                ['PATH_MAP_FROM', ENV.pathMapFrom ?? '(not set)'],
                ['PATH_MAP_TO', ENV.pathMapTo ?? '(not set)'],
                ['CROSSSEED_URL', data?.crossseed?.url || '(not set)'],
                ['CROSSSEED_API_KEY', showKeys ? '(server-side only)' : maskApiKey('hidden')],
              ].map(([key, value]) => (
                <tr key={key} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{key}</td>
                  <td className="px-4 py-3 text-zinc-300 break-all">{value ?? '(not set)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-600">
          API keys are only accessible server-side and are never exposed to the browser.
        </p>
      </section>

      {/* Info box */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400 space-y-2">
        <p className="font-medium text-zinc-300">How to configure</p>
        <p>
          All settings are configured via environment variables in your{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs font-mono text-zinc-300">docker-compose.yml</code>{' '}
          file. No restart needed for connection tests — but a full restart is required when changing URLs or keys.
        </p>
      </section>
    </div>
  );
}
