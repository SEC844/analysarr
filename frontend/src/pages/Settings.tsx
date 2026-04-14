import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, Loader2, ChevronRight, FolderOpen, Wand2, KeyRound } from 'lucide-react'
import {
  useConfig, useSaveConfig, useTestConnection, useBrowse, useDetectPaths,
} from '../hooks/useMedia'
import { cn, type AppConfig } from '../types'

// Formulaire local — les credentials sont write-only :
// - champ vide = "ne pas modifier" (le backend conserve la valeur stockée)
// - champ rempli = nouvelle valeur à sauvegarder
const EMPTY_FORM: AppConfig = {
  radarr:      { url: '', api_key: '', username: '', password: '', enabled: true },
  sonarr:      { url: '', api_key: '', username: '', password: '', enabled: true },
  qbittorrent: { url: '', username: '', password: '', api_key: '', enabled: true },
  crossseed:   { url: '', api_key: '', username: '', password: '', enabled: false },
  paths: { media: '/media', torrents: '/data/torrents', crossseed: '/data/cross-seed' },
}

export default function Settings() {
  const { data: config, isLoading } = useConfig()
  const saveConfig  = useSaveConfig()
  const testConn    = useTestConnection()
  const detectPaths = useDetectPaths()

  const [form, setForm]           = useState<AppConfig>(EMPTY_FORM)
  const [saved, setSaved]         = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [browsePath, setBrowsePath]   = useState<string | null>(null)
  const [browseField, setBrowseField] = useState<string | null>(null)

  // Pré-remplir URLs depuis la config publique (credentials jamais retournés)
  useEffect(() => {
    if (!config) return
    setForm(prev => ({
      ...prev,
      radarr:      { ...prev.radarr,      url: config.radarr.url,      enabled: config.radarr.enabled },
      sonarr:      { ...prev.sonarr,      url: config.sonarr.url,      enabled: config.sonarr.enabled },
      qbittorrent: { ...prev.qbittorrent, url: config.qbittorrent.url, enabled: config.qbittorrent.enabled },
      crossseed:   { ...prev.crossseed,   url: config.crossseed.url,   enabled: config.crossseed.enabled },
      paths: config.paths,
    }))
  }, [config])

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  )

  const update = (path: string[], value: string | boolean) => {
    setForm(prev => {
      const next = structuredClone(prev)
      let cur: Record<string, unknown> = next as unknown as Record<string, unknown>
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string, unknown>
      cur[path[path.length - 1]] = value
      return next
    })
  }

  const handleTest = async (service: string) => {
    const result = await testConn.mutateAsync({ service, config: form })
    setTestResults(prev => ({ ...prev, [service]: result }))
  }

  const handleSave = async () => {
    await saveConfig.mutateAsync(form)
    setSaved(true)
    // Réinitialiser les champs credentials (write-only)
    setForm(prev => ({
      ...prev,
      radarr:      { ...prev.radarr,      api_key: '' },
      sonarr:      { ...prev.sonarr,      api_key: '' },
      qbittorrent: { ...prev.qbittorrent, password: '' },
      crossseed:   { ...prev.crossseed,   api_key: '' },
    }))
    setTimeout(() => setSaved(false), 2500)
  }

  const handleDetectPaths = async () => {
    const paths = await detectPaths.mutateAsync()
    setForm(prev => ({ ...prev, paths }))
  }

  const handleBrowse = (field: string, currentPath: string) => {
    setBrowseField(field)
    setBrowsePath(currentPath && currentPath.startsWith('/') ? currentPath : '/')
  }

  const handlePickDir = (path: string) => {
    if (browseField) update(browseField.split('.'), path)
    setBrowsePath(null)
    setBrowseField(null)
  }

  // ── Services configurables ──────────────────────────────────────────────────
  type FieldDef = { key: 'url' | 'api_key' | 'username' | 'password'; label: string; type: 'text' | 'password'; credential: boolean }
  type ServiceDef = { key: keyof AppConfig & ('radarr' | 'sonarr' | 'qbittorrent' | 'crossseed'); label: string; optional?: boolean; fields: FieldDef[] }

  const services: ServiceDef[] = [
    {
      key: 'radarr',
      label: 'Radarr',
      fields: [
        { key: 'url',     label: 'URL',     type: 'text',     credential: false },
        { key: 'api_key', label: 'API Key', type: 'password', credential: true  },
      ],
    },
    {
      key: 'sonarr',
      label: 'Sonarr',
      fields: [
        { key: 'url',     label: 'URL',     type: 'text',     credential: false },
        { key: 'api_key', label: 'API Key', type: 'password', credential: true  },
      ],
    },
    {
      key: 'qbittorrent',
      label: 'qBittorrent',
      fields: [
        { key: 'url',      label: 'URL',          type: 'text',     credential: false },
        { key: 'username', label: 'Utilisateur',  type: 'text',     credential: true  },
        { key: 'password', label: 'Mot de passe', type: 'password', credential: true  },
      ],
    },
    {
      key: 'crossseed',
      label: 'Cross Seed',
      optional: true,
      fields: [
        { key: 'url',     label: 'URL',     type: 'text',     credential: false },
        { key: 'api_key', label: 'API Key', type: 'password', credential: true  },
      ],
    },
  ]

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-xl font-bold text-white">Paramètres</h1>

      {/* ── Services ──────────────────────────────────────────────────────── */}
      {services.map(({ key, label, fields, optional }) => {
        const svc     = form[key]
        const pub     = config?.[key]
        const tr      = testResults[key]
        const enabled = svc.enabled

        return (
          <section key={key} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{label}</h2>
              {optional && (
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => update([key, 'enabled'], e.target.checked)}
                    className="rounded accent-blue-500"
                  />
                  Activé
                </label>
              )}
            </div>

            <div className="space-y-3">
              {fields.map(f => {
                const isCredential = f.credential
                const isSet = isCredential && pub?.has_credentials
                return (
                  <div key={f.key}>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                      {f.label}
                      {isCredential && (
                        <span className={cn(
                          'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium',
                          isSet
                            ? 'bg-green-900/50 text-green-400'
                            : 'bg-zinc-800 text-zinc-500',
                        )}>
                          <KeyRound className="h-2.5 w-2.5" />
                          {isSet ? 'Configuré' : 'Non configuré'}
                        </span>
                      )}
                    </label>
                    <input
                      type={f.type}
                      value={String((svc as unknown as Record<string, unknown>)[f.key] ?? '')}
                      onChange={e => update([key, f.key], e.target.value)}
                      placeholder={
                        f.key === 'url'
                          ? 'http://192.168.1.x:7878'
                          : isCredential && isSet
                          ? '•••••••• (laisser vide pour conserver)'
                          : ''
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )
              })}
            </div>

            {/* Test connexion */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleTest(key)}
                disabled={testConn.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
              >
                {testConn.isPending && testConn.variables?.service === key
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : null}
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

      {/* ── Chemins ───────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Chemins volumes</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Points de montage dans le conteneur Docker.
            </p>
          </div>
          <button
            onClick={handleDetectPaths}
            disabled={detectPaths.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            {detectPaths.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Wand2 className="h-3.5 w-3.5" />}
            Auto-détecter
          </button>
        </div>

        {([
          { key: 'media'     as const, label: 'Bibliothèque (Radarr / Sonarr)' },
          { key: 'torrents'  as const, label: 'Dossier torrents (qBittorrent)'  },
          { key: 'crossseed' as const, label: 'Dossier cross-seed (optionnel)'  },
        ]).map(({ key, label }) => (
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
                title="Parcourir"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-700"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* ── Sauvegarder ───────────────────────────────────────────────────── */}
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
        {saveConfig.isPending ? 'Sauvegarde…' : saved ? '✓ Sauvegardé !' : 'Sauvegarder la configuration'}
      </button>

      {/* ── Browser modal (portal → rendu hors du DOM Settings) ─────────── */}
      {browsePath !== null && createPortal(
        <DirBrowser
          path={browsePath}
          onNavigate={setBrowsePath}
          onSelect={handlePickDir}
          onClose={() => { setBrowsePath(null); setBrowseField(null) }}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Directory browser ─────────────────────────────────────────────────────────

function DirBrowser({
  path, onNavigate, onSelect, onClose,
}: {
  path: string
  onNavigate: (p: string) => void
  onSelect: (p: string) => void
  onClose: () => void
}) {
  const { data, isLoading, isError } = useBrowse(path)

  const goUp = () => onNavigate(path.split('/').slice(0, -1).join('/') || '/')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          {path !== '/' && (
            <button onClick={goUp} className="shrink-0 text-xs text-zinc-400 hover:text-white">
              ← Retour
            </button>
          )}
          <code className="flex-1 truncate text-xs text-zinc-400">{path}</code>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenu */}
        <div className="max-h-72 overflow-y-auto py-1">
          {isLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-600" />
            </div>
          ) : isError ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs text-red-400">Dossier inaccessible</p>
              {path !== '/' && (
                <button onClick={goUp} className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                  Remonter d'un niveau
                </button>
              )}
            </div>
          ) : (data?.dirs.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">Dossier vide</p>
          ) : (
            data?.dirs.map(d => (
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
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-3 space-y-2">
          <p className="truncate text-center text-[10px] text-zinc-600">{path}</p>
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
