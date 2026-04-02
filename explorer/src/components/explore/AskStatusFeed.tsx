import { motion } from 'framer-motion'
import { CheckCircle2, CircleDashed, AlertCircle, Sparkles } from 'lucide-react'
import type { AskStatusData } from '../../lib/ask-artifact'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'

interface AskStatusFeedProps {
  readonly statuses: readonly AskStatusData[]
  readonly compact?: boolean
}

function phaseLabel(phase: AskStatusData['phase']): string {
  switch (phase) {
    case 'plan':
      return 'Plan'
    case 'evidence':
      return 'Evidence'
    case 'compose':
      return 'Compose'
    case 'render':
      return 'Render'
    default:
      return phase
  }
}

function StateIcon({ state }: { readonly state: AskStatusData['state'] }) {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (state === 'error') return <AlertCircle className="h-4 w-4 text-danger" />
  return <CircleDashed className="h-4 w-4 text-accent" />
}

export function AskStatusFeed({ statuses, compact = false }: AskStatusFeedProps) {
  if (statuses.length === 0) return null

  const visibleStatuses = compact ? statuses.slice(-3) : statuses.slice(-6)

  return (
    <div className="rounded-2xl border border-rule bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
          <Sparkles className="h-4 w-4 text-accent" />
          Live workflow
        </div>
        <div className="text-11 uppercase tracking-[0.08em] text-text-faint">
          {visibleStatuses.length} streamed steps
        </div>
      </div>

      <div className={cn('mt-3 grid gap-2', compact ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3')}>
        {visibleStatuses.map((status, index) => (
          <motion.div
            key={status.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: index * 0.03 }}
            className={cn(
              'rounded-xl border px-3 py-3 shadow-sm',
              status.state === 'done' && 'border-emerald-200 bg-emerald-50/60',
              status.state === 'error' && 'border-danger/20 bg-danger/5',
              status.state === 'active' && 'border-accent/20 bg-accent/[0.04]',
            )}
          >
            <div className="flex items-start gap-2">
              <StateIcon state={status.state} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">
                    {status.label}
                  </span>
                  <span className="rounded-full border border-rule bg-white/80 px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-text-faint">
                    {phaseLabel(status.phase)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {status.detail}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
