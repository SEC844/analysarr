'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp,
  Eye, EyeOff, Wifi, Save, WifiOff,
} from 'lucide-react';
import type { ServiceStatus } from '@/lib/types';

type ServiceKey = 'radarr' | 'sonarr' | 'qbit' | 'crossseed';

interface Field {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password';
}

interface Props {
  serviceKey: ServiceKey;
  label: string;
  optional?: boolean;
  currentUrl?: string;
  currentUsername?: string;
  fields: Field[];
  status?: ServiceStatus;
  loading?: boolean;
  onSave: (values: Record<string, string>) => Promise<void>;
}

function PasswordField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '(keep existing)'}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 pr-8 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function ServiceCard({
  serviceKey, label, optional, currentUrl, currentUsername, fields, status, loading, onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, '']))
  );
  const [testResult, setTestResult] = useState<ServiceStatus | null>(null);

  const testMutation = useMutation<ServiceStatus>({
    mutationFn: () => {
      const payload: Record<string, string> = { service: serviceKey };
      // Prefer entered values; fall back to current known URL
      const url = values['url']?.trim() || currentUrl || '';
      if (url) payload['url'] = url;
      for (const f of fields) {
        if (f.key !== 'url' && values[f.key]?.trim()) payload[f.key] = values[f.key].trim();
      }
      return fetch('/api/status/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()) as Promise<ServiceStatus>;
    },
    onSuccess: (data) => setTestResult(data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) payload[k] = v.trim();
      }
      await onSave(payload);
    },
    onSuccess: () => {
      setOpen(false);
      setValues(Object.fromEntries(fields.map(f => [f.key, ''])));
      setTestResult(null);
    },
  });

  const canSave = testResult?.connected === true;

  const icon = loading
    ? <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
    : status?.connected
      ? <CheckCircle className="h-5 w-5 text-green-400" />
      : <XCircle className="h-5 w-5 text-red-400" />;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {/* Header row */}
      <button
        onClick={() => { setOpen(v => !v); setTestResult(null); }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200">{label}</span>
            {optional && (
              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 uppercase tracking-wide">
                optional
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate">
            {loading ? 'Checking…' : status?.connected
              ? `Connected${status.version ? ` · v${status.version}` : ''}${currentUrl ? ` · ${currentUrl}` : ''}`
              : status?.error
                ? status.error
                : currentUrl || 'Not configured'}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
      </button>

      {/* Edit form */}
      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Leave a field empty to keep the existing value. Changes take effect immediately after saving.
          </p>

          <div className="space-y-3">
            {fields.map(f => (
              f.type === 'password' ? (
                <PasswordField
                  key={f.key}
                  label={f.label}
                  value={values[f.key]}
                  onChange={v => { setValues(prev => ({ ...prev, [f.key]: v })); setTestResult(null); }}
                  placeholder={f.placeholder}
                />
              ) : (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs text-zinc-400">{f.label}</label>
                  <input
                    type="text"
                    value={values[f.key]}
                    onChange={e => { setValues(prev => ({ ...prev, [f.key]: e.target.value })); setTestResult(null); }}
                    placeholder={f.key === 'url' && currentUrl ? currentUrl : (f.placeholder ?? '(keep existing)')}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                  />
                  {f.key === 'url' && currentUsername && (
                    <p className="text-[10px] text-zinc-600">Current username: {currentUsername}</p>
                  )}
                </div>
              )
            ))}
          </div>

          {/* Test result feedback */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              testResult.connected
                ? 'bg-green-950/40 border border-green-900/60 text-green-400'
                : 'bg-red-950/30 border border-red-900/40 text-red-400'
            }`}>
              {testResult.connected
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
              {testResult.connected
                ? `Connected${testResult.version ? ` · v${testResult.version}` : ''}`
                : testResult.error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              <Wifi className={`h-3.5 w-3.5 ${testMutation.isPending ? 'animate-pulse' : ''}`} />
              {testMutation.isPending ? 'Testing…' : 'Test connection'}
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              title={!canSave ? 'Test the connection first' : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setOpen(false); setTestResult(null); setValues(Object.fromEntries(fields.map(f => [f.key, '']))); }}
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
