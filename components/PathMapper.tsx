'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder, ChevronRight, ChevronUp, Plus, Trash2, ArrowRight, Check,
} from 'lucide-react';

interface PathMapping {
  from: string;
  to: string;
}

interface AppConfig {
  pathMappings: PathMapping[];
}

interface BrowseResult {
  path: string;
  dirs: string[];
  parent: string | null;
  error?: string;
}

// ── Single directory browser ──────────────────────────────────────────────────

function FileBrowser({
  root,
  selected,
  onSelect,
}: {
  root: string;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const [currentPath, setCurrentPath] = useState(root);

  const { data, isLoading, isError } = useQuery<BrowseResult>({
    queryKey: ['fs-browse', currentPath],
    queryFn: () =>
      fetch(`/api/fs/browse?path=${encodeURIComponent(currentPath)}`).then(r => r.json()),
    retry: false,
  });

  const baseName = (p: string) => p.split('/').filter(Boolean).pop() ?? p;

  return (
    <div className="flex flex-col gap-2">
      {/* Current path */}
      <div className="rounded-t-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-300 truncate">
        {currentPath}
      </div>

      {/* Directory listing */}
      <div className="min-h-[180px] max-h-[220px] overflow-y-auto rounded-b-lg border border-t-0 border-zinc-700 bg-zinc-950">
        {isLoading && (
          <p className="p-3 text-xs text-zinc-500">Loading…</p>
        )}
        {(isError || data?.error) && (
          <p className="p-3 text-xs text-red-400">
            {data?.error ?? 'Cannot read directory'}
          </p>
        )}
        {!isLoading && !isError && !data?.error && (
          <>
            {data?.parent && (
              <button
                onClick={() => setCurrentPath(data.parent!)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                ..
              </button>
            )}
            {data?.dirs.length === 0 && (
              <p className="p-3 text-xs text-zinc-600">No subdirectories</p>
            )}
            {data?.dirs.map(dir => (
              <button
                key={dir}
                onClick={() => setCurrentPath(dir)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  selected === dir
                    ? 'bg-blue-950/60 text-blue-300'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{baseName(dir)}</span>
                <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-zinc-600" />
              </button>
            ))}
          </>
        )}
      </div>

      {/* Select current directory button */}
      <button
        onClick={() => onSelect(currentPath)}
        className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
          selected === currentPath
            ? 'bg-blue-600 text-white'
            : 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
        }`}
      >
        {selected === currentPath && <Check className="h-3 w-3" />}
        {selected === currentPath ? 'Selected' : 'Select this folder'}
      </button>
    </div>
  );
}

// ── Path Mapper section ───────────────────────────────────────────────────────

export function PathMapper() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');

  const { data: config, isLoading } = useQuery<AppConfig>({
    queryKey: ['config-mappings'],
    queryFn: () => fetch('/api/config/mappings').then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (mappings: PathMapping[]) =>
      fetch('/api/config/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathMappings: mappings }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config-mappings'] }),
  });

  const mappings = config?.pathMappings ?? [];

  const addMapping = () => {
    if (!fromPath || !toPath) return;
    saveMutation.mutate([...mappings, { from: fromPath, to: toPath }]);
    setAdding(false);
    setFromPath('');
    setToPath('');
  };

  const removeMapping = (index: number) => {
    saveMutation.mutate(mappings.filter((_, i) => i !== index));
  };

  const cancelAdding = () => {
    setAdding(false);
    setFromPath('');
    setToPath('');
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Path mappings</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Translate paths reported by Radarr/Sonarr to paths mounted in this container.
            Required when the paths inside and outside the container differ.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      {/* Existing mappings */}
      {isLoading ? (
        <div className="h-12 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
      ) : mappings.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {mappings.map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-zinc-800/60 px-4 py-3 last:border-0"
            >
              <code className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300">
                {m.from}
              </code>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <code className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300">
                {m.to}
              </code>
              <button
                onClick={() => removeMapping(i)}
                className="ml-auto text-zinc-600 transition-colors hover:text-red-400"
                title="Remove mapping"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !adding && (
          <p className="text-xs text-zinc-600">
            No path mappings configured. Add one if hardlink detection shows&nbsp;
            <span className="text-zinc-400">unknown</span> for all media.
          </p>
        )
      )}

      {/* Add mapping form */}
      {adding && (
        <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-400">
            Browse to select the <strong className="text-zinc-200">source path</strong> (as
            Radarr/Sonarr report it, e.g.{' '}
            <code className="rounded bg-zinc-800 px-1 font-mono">/data/media/tv</code>) on
            the left, and the <strong className="text-zinc-200">target path</strong> as mounted
            in this container (e.g.{' '}
            <code className="rounded bg-zinc-800 px-1 font-mono">/media/tv</code>) on the right.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">
                Source <span className="text-zinc-600">(Radarr/Sonarr path)</span>
              </p>
              <FileBrowser root="/data" selected={fromPath} onSelect={setFromPath} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">
                Target <span className="text-zinc-600">(container path)</span>
              </p>
              <FileBrowser root="/media" selected={toPath} onSelect={setToPath} />
            </div>
          </div>

          {fromPath && toPath && (
            <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs">
              <code className="text-zinc-300">{fromPath}</code>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
              <code className="text-zinc-300">{toPath}</code>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={addMapping}
              disabled={!fromPath || !toPath || saveMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add mapping
            </button>
            <button
              onClick={cancelAdding}
              className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        Mappings are saved to{' '}
        <code className="rounded bg-zinc-800 px-1 font-mono">/config/mappings.json</code>{' '}
        inside the container and persist across restarts when you mount a{' '}
        <code className="rounded bg-zinc-800 px-1 font-mono">/config</code> volume.
      </p>
    </section>
  );
}
