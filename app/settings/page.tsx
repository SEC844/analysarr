'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Check, X, ChevronDown, ChevronUp, Clock, Save, Eye, EyeOff } from 'lucide-react';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { PathMapper } from '@/components/PathMapper';
import type { ServiceStatus } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────

interface StatusData {
  radarr:    ServiceStatus;
  sonarr:    ServiceStatus;
  qbit:      ServiceStatus;
  crossseed: ServiceStatus;
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

// ─────────────────────────────────────────────────────────────────────────────
// Service editor
// ─────────────────────────────────────────────────────────────────────────────

function ServiceField({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: 'text' | 'password'; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="relative">
        <input
          type={type === 'password' && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 pr-8 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function ServiceEditor({ name, label, fields, onSave, saving }: {
  name: string;
  label: string;
  configured: boolean;
  fields: Array<{ key: string; label: string; placeholder?: string; type?: 'text' | 'password' }>;
  onSave: (values: Record<string, string>) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, '']))
  );

  const handleSave = () => {
    // Only send fields that have a value — don't overwrite with empty strings
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) payload[k] = v.trim();
    }
    onSave(payload);
    setOpen(false);
    setValues(Object.fromEntries(fields.map(f => [f.key, ''])));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            name === 'crossseed'
              ? 'bg-zinc-800 text-zinc-500'
              : 'bg-green-950 text-green-400'
          }`}>
            {name === 'crossseed' ? 'optional' : 'required'}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-3">
          <p className="text-xs text-zinc-500">
            Leave a field empty to keep the existing value. New values replace what was previously saved.
          </p>
          {fields.map(f => (
            <ServiceField
              key={f.key}
              label={f.label}
              value={values[f.key]}
              onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))}
              type={f.type}
              placeholder={f.placeholder}
            />
          ))}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();

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
    refetchInterval: 10_000, // update age every 10 s
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

  const saveRefreshInterval = (interval: number) => {
    saveMutation.mutate({ refreshInterval: interval });
  };

  const cfg = config;
  const [intervalInput, setIntervalInput] = useState('');

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">Service configuration, path mappings and cache</p>
      </div>

      {/* ── Service configuration ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">Service configuration</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Credentials are stored in <code className="rounded bg-zinc-800 px-1 font-mono">/config/mappings.json</code> and
            never exposed to the browser. Env vars (docker-compose) are still used as fallback if no UI value is set.
          </p>
        </div>

        <div className="space-y-2">
          <ServiceEditor
            name="radarr" label="Radarr"
            configured={cfg?.services.radarr.configured ?? false}
            saving={saveMutation.isPending}
            fields={[
              { key: 'url',    label: 'URL',     placeholder: 'http://radarr:7878' },
              { key: 'apiKey', label: 'API Key', placeholder: 'Settings → General → API Key', type: 'password' },
            ]}
            onSave={v => saveMutation.mutate({ services: { radarr: v } })}
          />
          <ServiceEditor
            name="sonarr" label="Sonarr"
            configured={cfg?.services.sonarr.configured ?? false}
            saving={saveMutation.isPending}
            fields={[
              { key: 'url',    label: 'URL',     placeholder: 'http://sonarr:8989' },
              { key: 'apiKey', label: 'API Key', placeholder: 'Settings → General → API Key', type: 'password' },
            ]}
            onSave={v => saveMutation.mutate({ services: { sonarr: v } })}
          />
          <ServiceEditor
            name="qbit" label="qBittorrent"
            configured={cfg?.services.qbit.configured ?? false}
            saving={saveMutation.isPending}
            fields={[
              { key: 'url',      label: 'URL',      placeholder: 'http://qbittorrent:8080' },
              { key: 'username', label: 'Username', placeholder: 'admin' },
              { key: 'password', label: 'Password', type: 'password' },
            ]}
            onSave={v => saveMutation.mutate({ services: { qbit: v } })}
          />
          <ServiceEditor
            name="crossseed" label="Cross Seed"
            configured={cfg?.services.crossseed.configured ?? false}
            saving={saveMutation.isPending}
            fields={[
              { key: 'url',    label: 'URL',     placeholder: 'http://cross-seed:2468' },
              { key: 'apiKey', label: 'API Key', placeholder: 'Output of: cross-seed api-key', type: 'password' },
            ]}
            onSave={v => saveMutation.mutate({ services: { crossseed: v } })}
          />
        </div>
      </section>

      {/* ── Connection status ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Connection status</h2>
          <button
            onClick={() => refetchStatus()}
            disabled={statusFetching}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${statusFetching ? 'animate-spin' : ''}`} />
            Test connections
          </button>
        </div>
        <div className="space-y-3">
          {status?.radarr    && <ConnectionStatus status={status.radarr}    loading={statusFetching} />}
          {status?.sonarr    && <ConnectionStatus status={status.sonarr}    loading={statusFetching} />}
          {status?.qbit      && <ConnectionStatus status={status.qbit}      loading={statusFetching} />}
          {status?.crossseed && <ConnectionStatus status={status.crossseed} loading={statusFetching} />}
        </div>
      </section>

      {/* ── Path mappings ─────────────────────────────────────────────────── */}
      <PathMapper />

      {/* ── Cache ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">Data cache</h2>
        <p className="text-xs text-zinc-500">
          Dashboard data is cached server-side and pre-refreshed in the background so page loads are instant.
          The cache refreshes automatically every <strong className="text-zinc-400">{cfg?.refreshInterval ?? 60}s</strong>.
        </p>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-300">Last refresh</span>
            </div>
            <span className="text-sm text-zinc-400">
              {cacheStatus?.ageSeconds != null
                ? `${cacheStatus.ageSeconds}s ago`
                : 'Not yet fetched'}
            </span>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {refreshNowMutation.isPending || cacheStatus?.refreshing ? (
                <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
              ) : cacheStatus?.ageSeconds != null ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <X className="h-4 w-4 text-zinc-600" />
              )}
              <span className="text-sm text-zinc-300">
                {refreshNowMutation.isPending || cacheStatus?.refreshing
                  ? 'Refreshing…'
                  : 'Cache status'}
              </span>
            </div>
            <button
              onClick={() => refreshNowMutation.mutate()}
              disabled={refreshNowMutation.isPending || cacheStatus?.refreshing}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              Refresh now
            </button>
          </div>
        </div>

        {/* Refresh interval editor */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400 shrink-0">Auto-refresh every</label>
          <input
            type="number"
            min={10}
            max={3600}
            value={intervalInput || (cfg?.refreshInterval ?? 60)}
            onChange={e => setIntervalInput(e.target.value)}
            className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-center text-sm text-zinc-200 outline-none focus:border-zinc-500"
          />
          <span className="text-xs text-zinc-400">seconds</span>
          <button
            onClick={() => {
              const v = parseInt(intervalInput, 10);
              if (v >= 10) { saveRefreshInterval(v); setIntervalInput(''); }
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
