import { cn, STATUS_CONFIG, type SeedStatus } from '../types'

interface Props {
  status: SeedStatus
  compact?: boolean
  className?: string
}

export function StatusBadge({ status, compact, className }: Props) {
  const { label, color, dotColor } = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_seeding
  const base = compact
    ? 'px-1.5 py-0 text-[9px]'
    : 'px-2.5 py-0.5 text-xs'

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      base, color, className,
    )}>
      <span className={cn('rounded-full flex-shrink-0', compact ? 'h-1 w-1' : 'h-1.5 w-1.5', dotColor)} />
      {label}
    </span>
  )
}
