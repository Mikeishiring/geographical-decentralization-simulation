import { CheckCircle2, CircleDashed, AlertCircle } from 'lucide-react'
import type { AskStatusData } from '../../lib/ask-artifact'
import { cn } from '../../lib/cn'

interface AskStageRailProps {
  readonly statuses: readonly AskStatusData[]
}

const PHASES = ['plan', 'evidence', 'compose', 'render'] as const satisfies readonly AskStatusData['phase'][]

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

function latestStatusForPhase(
  statuses: readonly AskStatusData[],
  phase: AskStatusData['phase'],
): AskStatusData | null {
  const matching = statuses.filter(status => status.phase === phase)
  return matching.length > 0 ? matching[matching.length - 1] ?? null : null
}

function phaseState(
  statuses: readonly AskStatusData[],
  phase: AskStatusData['phase'],
): 'pending' | AskStatusData['state'] {
  const latest = latestStatusForPhase(statuses, phase)
  return latest?.state ?? 'pending'
}

function PhaseIcon({ state }: { readonly state: 'pending' | AskStatusData['state'] }) {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (state === 'error') return <AlertCircle className="h-4 w-4 text-danger" />
  if (state === 'active') return <CircleDashed className="h-4 w-4 text-accent" />
  return <CircleDashed className="h-4 w-4 text-text-faint" />
}

export function AskStageRail({ statuses }: AskStageRailProps) {
  if (statuses.length === 0) return null

  const activeStatus = [...statuses].reverse().find(status => status.state === 'active')
    ?? statuses[statuses.length - 1]
    ?? null

  return (
    <div className="rounded-2xl border border-rule bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-text-primary">
          Execution rail
        </div>
        <div className="text-11 uppercase tracking-[0.08em] text-text-faint">
          Live phases
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {PHASES.map((phase, index) => {
          const state = phaseState(statuses, phase)
          return (
            <div key={phase} className="relative">
              {index < PHASES.length - 1 && (
                <div className="absolute left-[calc(50%+1rem)] top-4 hidden h-px w-[calc(100%-2rem)] bg-rule md:block" />
              )}
              <div className={cn(
                'relative rounded-xl border px-3 py-3',
                state === 'done' && 'border-emerald-200 bg-emerald-50/60',
                state === 'active' && 'border-accent/20 bg-accent/[0.04]',
                state === 'error' && 'border-danger/20 bg-danger/5',
                state === 'pending' && 'border-rule bg-surface-active/60',
              )}>
                <div className="flex items-center gap-2">
                  <PhaseIcon state={state} />
                  <span className="text-xs font-medium text-text-primary">
                    {phaseLabel(phase)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {activeStatus && (
        <div className="mt-3 rounded-xl border border-rule bg-surface-active/60 px-3 py-3">
          <div className="text-xs font-medium text-text-primary">
            {activeStatus.label}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted">
            {activeStatus.detail}
          </div>
        </div>
      )}
    </div>
  )
}
