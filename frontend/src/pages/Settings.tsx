import { useState, useEffect } from 'react'
import { Check, X, Loader2, ChevronRight, FolderOpen } from 'lucide-react'
import { useConfig, useSaveConfig, useTestConnection, useBrowse } from '../hooks/useMedia'
import { cn, type AppConfig, type ServiceConfig } from '../types'

export default function Settings() {
  const { data: config, isLoading } = useConfig()
  const saveConfig = useSaveConfig()
  const testConn   = useTestConnection()

  const [form, setForm] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [browsePath, setBrowsePath] = useState<string | null>(null)
  const [browseField, setBrowseField] = useState<string | null>(null)

  useEffect(() => {
    if (config && !form) setForm(config)
  }, [config])

  if (isLoading || !form) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  )

  const update = (path: string[], value: string | boolean) => {
    setForm(prev => {
      if (!prev) return prev
      const next = structuredClone(prev)
      let cur: Record<string, unknown> = next as unknown as Record<string, unknown>
      for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]] as Record<string, unknown>
      }
      cur[path[path.length - 1]] = value
      return next
    })
  }

  const handleTest = async (service: string) => {
    const result = await testConn.mutateAsync(service)
    setTestResults(prev => ({ ...prev, [service]: result }))
  }

  const handleSave = async () => {
    await saveConfig.mutateAsync(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleBrowse = (field: string, currentPath: string) => {
    setBrowseField(field)
    setBrowsePath(currentPath || '/')
  }

  const handlePickDir = (path: string) => {
    if (browseField) {
      const parts = browseField.split('.')
      update(parts, path)
    }
    setBrowsePath(null)
    setBrowseField(null)
  }

  const services: Array<{
    key: keyof AppConfig
    label: string
    fields: Array<{ key: keyof ServiceConfig; label: string; type: 'text' | 'password' }>
  }> = [
    {
      key: 'radarr',
      label: 'Radarr',
      fields: [
        { key: 'url',     label: 'URL',     type: 'text' },
        { key: 'api_key', label: 'API Key', type: 'password' },
      ],
    },
    {
      key: 'sonarr',
      label: 'Sonarr',
      fields: [
        { key: 'url',     label: 'URL',     type: 'text' },
        { key: 'api_key', label: 'API Key', type: 'password' },
      ],
    },
    {
      key: 'qbittorrent',
      label: 'qBittorrent',
      fields: [
        { key: 'url',      label: 'URL',           type: 'text' },
        { key: 'username', label: 'Utilisateur',   type: 'text' },
        { key: 'password', label: 'Mot de passe',  type: 'password' },
      ],
    },
    {
      key: 'crossseed',
      label: 'Cross Seed (optionnel)',
      fields: [
        { key: 'url',     label: 'URL',     type: 'text' },
        { key: 'api_key', label: 'API Key', type: 'password' },
      ],
    },
  ]

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-xl font-bold text-white">Paramètres</h1>

      {/* Services */}
      {services.map(({ key, label, fields }) => {
        const svc = form[key] as ServiceConfig
        const tr  = testResults[String(key)]
        return (
          <section key={String(key)} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{label}</h2>
              {key === 'crossseed' && (
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={svc.enabled}
                    onChange={e => update([String(key), 'enabled'], e.target.checked)}
                    className="rounded"
                  />
                  Activé
                </label>
              )}
            </div>

            <div className="space-y-3">
              {fields.map(f => (
                <div key={String(f.key)}>
                  <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={String((svc as unknown as Record<string, unknown>)[String(f.key)] ?? '')}
                    onChange={e => update([String(key), String(f.key)], e.target.value)}
                    placeholder={f.key === 'url' ? 'http://192.168.1.x:7878' : ''}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Test connection */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleTest(String(key))}
                disabled={testConn.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
              >
                {testConn.isPending && testConn.variables === String(key)
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : null
                }
                Tester la connexion
              </button>
              {tr && (
                <span className={cn('flex items-center gap-1 text-xs', tr.success ? 'text-green-400' : 'text-red-400')}>
                  {tr.success ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {tr.message}
                </span>
              )}
            </div>
          </section>
        )
      })}

      {/* Chemins */}
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-semibold text-white">Chemins volumes</h2>
        <p className="text-xs text-zinc-500">
          Ces chemins correspondent aux points de montage dans le conteneur Docker.
        </p>

        {([
          { key: 'media',     label: '/media (bibliothèque Radarr/Sonarr)' },
          { key: 'torrents',  label: '/data/torrents (fichiers qBittorrent)' },
          { key: 'crossseed', label: '/data/cross-seed (optionnel)' },
        ] as const).map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs text-zinc-500 mb-1">{label}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.paths[key]}
                onChange={e => update(['paths', key], e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => handleBrowse(`paths.${key}`, form.paths[key])}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-700"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saveConfig.isPending}
        className={cn(
          'w-full rounded-xl py-3 text-sm font-semibold transition-colors',
          saved
            ? 'bg-green-600 text-white'
            : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
        )}
      >
        {saveConfig.isPending
          ? 'Sauvegarde…'
          : saved
          ? '✓ Sauvegardé !'
          : 'Sauvegarder la configuration'
        }
      </button>

      {/* Browser modal */}
      {browsePath !== null && (
        <DirBrowser
          path={browsePath}
          onNavigate={setBrowsePath}
          onSelect={handlePickDir}
          onClose={() => { setBrowsePath(null); setBrowseField(null) }}
        />
      )}
    </div>
  )
}

// ── Directory browser ─────────────────────────────────────────────────────────

function DirBrowser({
  path,
  onNavigate,
  onSelect,
  onClose,
}: {
  path: string
  onNavigate: (p: string) => void
  onSelect: (p: string) => void
  onClose: () => void
}) {
  const { data, isLoading } = useBrowse(path)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <code className="text-sm text-zinc-300 truncate">{path}</code>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {isLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-600" />
            </div>
          ) : (
            <>
              {path !== '/' && (
                <button
                  onClick={() => onNavigate(path.split('/').slice(0, -1).join('/') || '/')}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
                >
                  ← ..
                </button>
              )}
              {data?.dirs.map(d => (
                <button
                  key={d.path}
                  onClick={() => onNavigate(d.path)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
                    {d.name}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                </button>
              ))}
            </>
          )}
        </div>

        <div className="border-t border-zinc-800 p-3">
          <button
            onClick={() => onSelect(path)}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sélectionner ce dossier
          </button>
        </div>
      </div>
    </div>
  )
}
