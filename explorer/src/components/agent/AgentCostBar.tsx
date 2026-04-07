/**
 * Session cost and progress indicator for the agent loop.
 * Monospace data values, semantic status dots, BenjiStripe density.
 */

import { cn } from '../../lib/cn'
import type { AgentSession } from '../../lib/agent-api'

interface AgentCostBarProps {
  readonly session: AgentSession
}

const STATUS_CONFIG = {
  active:    { color: 'bg-[#22c55e]', label: 'Running' },
  completed: { color: 'bg-accent',    label: 'Completed' },
  paused:    { color: 'bg-[#f59e0b]', label: 'Paused' },
  abandoned: { color: 'bg-[#ef4444]', label: 'Abandoned' },
} as const

export function AgentCostBar({ session }: AgentCostBarProps) {
  const config = STATUS_CONFIG[session.status]

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-rule bg-surface-active px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)]">
      {/* Status indicator — dot + label, semantic color */}
      <div className="flex items-center gap-2">
        <span className={cn('h-[7px] w-[7px] rounded-full', config.color)} />
        <span className="text-xs font-medium text-text-primary">{config.label}</span>
      </div>

      {/* Data metrics — monospace, tabular numbers */}
      <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums tracking-tight text-muted">
        <span>
          Steps{' '}
          <span className="font-semibold text-text-primary">
            {session.steps.length}
          </span>
          <span className="text-text-faint">/{session.maxSteps}</span>
        </span>
        <span>
          LLM{' '}
          <span className="font-semibold text-text-primary">
            {session.totalClaudeCalls}
          </span>
        </span>
        <span>
          Sim{' '}
          <span className="font-semibold text-text-primary">
            {session.totalSimulations}
          </span>
        </span>
      </div>
    </div>
  )
}
