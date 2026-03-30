/**
 * Session cost and progress indicator for the agent loop.
 * Shows Claude calls, simulations run, and step progress.
 */

import { cn } from '../../lib/cn'
import type { AgentSession } from '../../lib/agent-api'

interface AgentCostBarProps {
  readonly session: AgentSession
}

export function AgentCostBar({ session }: AgentCostBarProps) {
  const stepProgress = `${session.steps.length}/${session.maxSteps}`
  const statusLabel =
    session.status === 'active'
      ? 'Running'
      : session.status === 'completed'
        ? 'Completed'
        : session.status === 'paused'
          ? 'Paused'
          : 'Abandoned'

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-rule bg-surface-active px-4 py-3">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'h-2 w-2 rounded-full',
            session.status === 'active' && 'bg-green-500',
            session.status === 'completed' && 'bg-accent',
            session.status === 'paused' && 'bg-yellow-500',
            session.status === 'abandoned' && 'bg-red-400',
          )}
        />
        <span className="text-xs font-medium text-text-primary">{statusLabel}</span>
      </div>
      <span className="text-xs text-muted">Steps {stepProgress}</span>
      <span className="text-xs text-muted">
        {session.totalClaudeCalls} Claude call{session.totalClaudeCalls === 1 ? '' : 's'}
      </span>
      <span className="text-xs text-muted">
        {session.totalSimulations} simulation{session.totalSimulations === 1 ? '' : 's'}
      </span>
    </div>
  )
}
