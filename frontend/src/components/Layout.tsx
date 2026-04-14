import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, HardDrive, Settings, Loader2 } from 'lucide-react'
import { useScanStatus, useTriggerScan } from '../hooks/useMedia'
import { cn } from '../types'

const navItems = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { to: '/torrents', label: 'Torrents',  icon: HardDrive },
  { to: '/settings', label: 'Settings',  icon: Settings },
]

export default function Layout() {
  const { data: scanStatus } = useScanStatus()
  const triggerScan = useTriggerScan()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold tracking-tight text-white">
              Analy<span className="text-blue-400">sarr</span>
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Scan button */}
          <button
            onClick={() => triggerScan.mutate()}
            disabled={scanStatus?.running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            <Loader2 className={cn('h-3 w-3', scanStatus?.running && 'animate-spin')} />
            {scanStatus?.running ? `${Math.round((scanStatus.progress ?? 0) * 100)}%` : 'Scan'}
          </button>
        </div>
      </header>

      {/* Scan progress bar */}
      {scanStatus?.running && (
        <div className="h-0.5 bg-zinc-900">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(scanStatus.progress ?? 0) * 100}%` }}
          />
        </div>
      )}

      {/* Page content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 animate-fade-in">
        <Outlet />
      </main>
    </div>
  )
}
