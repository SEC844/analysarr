'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Check, X, Clock, LayoutGrid } from 'lucide-react';
import { ServiceCard } from '@/components/ServiceCard';
import { PathMapper } from '@/components/PathMapper';
import { usePosterSize } from '@/lib/hooks';

interface StatusData {
  radarr:    { name: string; url: string; connected: boolean; error?: string; version?: string };
  sonarr:    { name: string; url: string; connected: boolean; error?: string; version?: string };
  qbit:      { name: string; url: string; connected: boolean; error?: string; version?: string };
  crossseed: { name: string; url: string; connected: boolean; error?: string; version?: string };
}

interface ConfigData {
  refreshInterval: number;
  services: {
    radarr:    { url: string; configured: boolean };
    sonarr:    { url: string; configured: boolean };
    qbit:      { url: string; username: string; configured: boolean };
    crossseed: { url: string; configured: boolean };
  };
}

interface CacheStatus {
  fetchedAt: number | null;
  ageSeconds: number | null;
  refreshing: boolean;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [intervalInput, setIntervalInput] = useState('');
  const [posterSize, setPosterSize] = usePosterSize();

  const { data: status, isFetching: statusFetching, refetch: refetchStatus } = useQuery<StatusData>({
    queryKey: ['status'],
    queryFn: () => fetch('/api/status').then(r => r.json()),
  });

  const { data: config } = useQuery<ConfigData>({
    queryKey: ['config'],
    queryFn: () => fetch('/api/config').then(r => r.json()),
  });

  const { data: cacheStatus, refetch: refetchCache } = useQuery<CacheStatus>({
    queryKey: ['cache-status'],
    queryFn: () => fetch('/api/cache/refresh').then(r => r.json()),
    refetchInterval: 10_000,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      refetchStatus();
    },
  });

  const refreshNowMutation = useMutation({
    mutationFn: () => fetch('/api/cache/refresh', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cache-status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      refetchCache();
    },
  });

  const cfg = config;

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Service configuration, path mappings and cache</p>
      </div>

      {/* Appearance */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Appearance</h2>
        <div className="overflow-hidden rounded-xl border border-default bg-surface">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <LayoutGrid className="h-4 w-4 text-gray-400 dark:text-zinc-500" />
              <span className="text-gray-700 dark:text-zinc-300">Poster size</span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-default bg-elevated p-0.5">
              {([
                { key: 'sm', label: 'Small' },
                { key: 'md', label: 'Medium' },
                { key: 'lg', label: 'Large'  },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPosterSize(key)}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    posterSize === key
                      ? 'bg-gray-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-zinc-500">
          Controls how many posters are shown per row on the dashboard. Medium is the default.
        </p>
      </section>

      {/* Services */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Services</h2>
          <button
            onClick={() => refetchStatus()}
            disabled={statusFetching}
            className="flex items-center gap-1.5 rounded-lg border border-default bg-surface px-3 py-1.5 text-sm text-gray-600 dark:text-zinc-300 hover:bg-elevated transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${statusFetching ? 'animate-spin' : ''}`} />
            Refresh status
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-zinc-500">
          Click a service to expand its configuration. Use <strong className="text-gray-600 dark:text-zinc-400">Test connection</strong> before saving —
          saving is disabled until the connection succeeds. Credentials are stored in{' '}
          <code className="rounded bg-gray-100 dark:bg-zinc-800 px-1 font-mono">/config/mappings.json</code> and never exposed to the browser.
        </p>

        <div className="space-y-2">
          <ServiceCard
            serviceKey="radarr" label="Radarr"
            currentUrl={cfg?.services.radarr.url || status?.radarr.url}
            status={status?.radarr} loading={statusFetching}
            fields={[
              { key: 'url',    label: 'URL',     placeholder: 'http://radarr:7878' },
              { key: 'apiKey', label: 'API Key', placeholder: 'Settings → General → API Key', type: 'password' },
            ]}
            onSave={v => saveMutation.mutateAsync({ services: { radarr: v } })}
          />
          <ServiceCard
            serviceKey="sonarr" label="Sonarr"
            currentUrl={cfg?.services.sonarr.url || status?.sonarr.url}
            status={status?.sonarr} loading={statusFetching}
            fields={[
              { key: 'url',    label: 'URL',     placeholder: 'http://sonarr:8989' },
              { key: 'apiKey', label: 'API Key', placeholder: 'Settings → General → API Key', type: 'password' },
            ]}
            onSave={v => saveMutation.mutateAsync({ services: { sonarr: v } })}
          />
          <ServiceCard
            serviceKey="qbit" label="qBittorrent"
            currentUrl={cfg?.services.qbit.url || status?.qbit.url}
            currentUsername={cfg?.services.qbit.username}
            status={status?.qbit} loading={statusFetching}
            fields={[
              { key: 'url',      label: 'URL',      placeholder: 'http://qbittorrent:8080' },
              { key: 'username', label: 'Username', placeholder: 'admin' },
              { key: 'password', label: 'Password', type: 'password' },
            ]}
            onSave={v => saveMutation.mutateAsync({ services: { qbit: v } })}
          />
          <ServiceCard
            serviceKey="crossseed" label="Cross Seed" optional
            currentUrl={cfg?.services.crossseed.url || status?.crossseed.url}
            status={status?.crossseed} loading={statusFetching}
            fields={[
              { key: 'url',    label: 'URL',     placeholder: 'http://cross-seed:2468' },
              { key: 'apiKey', label: 'API Key', placeholder: 'Output of: cross-seed api-key', type: 'password' },
            ]}
            onSave={v => saveMutation.mutateAsync({ services: { crossseed: v } })}
          />
        </div>
      </section>

      {/* Path mappings */}
      <PathMapper />

      {/* Cache */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Data cache</h2>
        <p className="text-xs text-gray-400 dark:text-zinc-500">
          Dashboard data is cached server-side. Auto-refresh every{' '}
          <strong className="text-gray-600 dark:text-zinc-400">{cfg?.refreshInterval ?? 60}s</strong>.
        </p>

        <div className="overflow-hidden rounded-xl border border-default bg-surface">
          <div className="flex items-center justify-between border-b border-default px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400 dark:text-zinc-500" />
              <span className="text-gray-700 dark:text-zinc-300">Last refresh</span>
            </div>
            <span className="text-sm text-gray-500 dark:text-zinc-400">
              {cacheStatus?.ageSeconds != null ? `${cacheStatus.ageSeconds}s ago` : 'Not yet fetched'}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {refreshNowMutation.isPending || cacheStatus?.refreshing
                ? <RefreshCw className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-400" />
                : cacheStatus?.ageSeconds != null
                  ? <Check className="h-4 w-4 text-green-500" />
                  : <X className="h-4 w-4 text-gray-300 dark:text-zinc-600" />}
              <span className="text-sm text-gray-700 dark:text-zinc-300">
                {refreshNowMutation.isPending || cacheStatus?.refreshing ? 'Refreshing…' : 'Cache status'}
              </span>
            </div>
            <button
              onClick={() => refreshNowMutation.mutate()}
              disabled={refreshNowMutation.isPending || cacheStatus?.refreshing}
              className="rounded-lg border border-default bg-elevated px-3 py-1 text-xs text-gray-600 dark:text-zinc-300 hover:bg-overlay transition-colors disabled:opacity-50"
            >
              Refresh now
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 dark:text-zinc-400 shrink-0">Auto-refresh every</label>
          <input
            type="number" min={10} max={3600}
            value={intervalInput || (cfg?.refreshInterval ?? 60)}
            onChange={e => setIntervalInput(e.target.value)}
            className="w-20 rounded-lg border border-default bg-surface px-2 py-1.5 text-center text-sm text-gray-900 dark:text-zinc-200 outline-none focus:border-gray-400 dark:focus:border-zinc-500"
          />
          <span className="text-xs text-gray-400 dark:text-zinc-400">seconds</span>
          <button
            onClick={() => {
              const v = parseInt(intervalInput, 10);
              if (v >= 10) { saveMutation.mutate({ refreshInterval: v }); setIntervalInput(''); }
            }}
            disabled={!intervalInput || saveMutation.isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
