import { cn, type SeedStatus, STATUS_CONFIG } from '../types'

interface StatCardProps {
  status: SeedStatus
  count:  number
  total:  number
  active: boolean
  onClick: () => void
}

export function StatCard({ status, count, total, active, onClick }: StatCardProps) {
  const { label, dotColor } = STATUS_CONFIG[status]
  const pct = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
        active
          ? 'border-blue-500 bg-zinc-800'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', dotColor)} />
        <span className="text-xs font-medium text-zinc-400">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-white tabular-nums">{count}</span>
        <span className="text-xs text-zinc-500">{pct}%</span>
      </div>
      {/* Mini bar */}
      <div className="h-1 w-full rounded-full bg-zinc-800">
        <div
          className={cn('h-full rounded-full transition-all', dotColor)}
          style={{ width: `${pct}%`, opacity: 0.7 }}
        />
      </div>
    </button>
  )
}

interface TotalCardProps {
  count: number
}

export function TotalCard({ count }: TotalCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <span className="text-xs font-medium text-zinc-400">Total médias</span>
      <span className="text-2xl font-bold text-white tabular-nums">{count}</span>
    </div>
  )
}
