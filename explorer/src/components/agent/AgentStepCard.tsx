/**
 * Renders a single step in the agent loop with phase-aware UI.
 * Each step shows its question, current phase, config review (if applicable),
 * and interpretation (if completed).
 */

import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { AgentStep, AgentStepPhase } from '../../lib/agent-api'
import { AgentConfigReview } from './AgentConfigReview'
import { AgentInterpretationView } from './AgentInterpretationView'
import type { SimulationConfig } from '../../lib/simulation-api'

interface AgentStepCardProps {
  readonly step: AgentStep
  readonly isLatest: boolean
  readonly onApprove: (stepId: string, config?: SimulationConfig) => void
  readonly onReject: (stepId: string, feedback?: string) => void
  readonly isApproving: boolean
  readonly isRejecting: boolean
}

function phaseLabel(phase: AgentStepPhase): string {
  const labels: Record<AgentStepPhase, string> = {
    analyzing: 'Analyzing question...',
    config_proposed: 'Config proposed',
    awaiting_approval: 'Awaiting your approval',
    simulation_queued: 'Simulation queued',
    simulation_running: 'Simulation running...',
    simulation_completed: 'Simulation completed',
    interpreting: 'Interpreting results...',
    interpreted: 'Interpretation complete',
    failed: 'Failed',
  }
  return labels[phase]
}

function phaseIndicator(phase: AgentStepPhase): 'spinning' | 'waiting' | 'done' | 'error' {
  if (['analyzing', 'simulation_running', 'interpreting'].includes(phase)) return 'spinning'
  if (['awaiting_approval', 'simulation_queued', 'config_proposed'].includes(phase)) return 'waiting'
  if (phase === 'failed') return 'error'
  return 'done'
}

export function AgentStepCard({
  step,
  isLatest,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: AgentStepCardProps) {
  const indicator = phaseIndicator(step.phase)

  return (
    <div
      className={cn(
        'rounded-xl border bg-white px-5 py-5',
        isLatest ? 'border-accent/40 shadow-[0_16px_34px_rgba(15,23,42,0.06)]' : 'border-rule',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule bg-surface-active text-xs font-medium text-text-primary">
          {step.index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary">{step.question}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            {indicator === 'spinning' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : indicator === 'error' ? (
              <span className="h-2 w-2 rounded-full bg-red-400" />
            ) : indicator === 'waiting' ? (
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-green-500" />
            )}
            <span>{phaseLabel(step.phase)}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {step.error ? (
        <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {step.error}
        </div>
      ) : null}

      {/* Config review gate */}
      {step.phase === 'awaiting_approval' && step.proposedConfig ? (
        <div className="mt-4">
          <AgentConfigReview
            config={step.proposedConfig}
            rationale={step.rationale}
            onApprove={(config) => onApprove(step.id, config)}
            onReject={(feedback) => onReject(step.id, feedback)}
            isApproving={isApproving}
            isRejecting={isRejecting}
          />
        </div>
      ) : null}

      {/* Approved config summary (after approval) */}
      {step.approvedConfig && step.phase !== 'awaiting_approval' ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="lab-chip">{step.approvedConfig.paradigm}</span>
          <span className="lab-chip">{step.approvedConfig.validators} validators</span>
          <span className="lab-chip">{step.approvedConfig.slots} slots</span>
          <span className="lab-chip">γ = {step.approvedConfig.attestationThreshold}</span>
          <span className="lab-chip">{step.approvedConfig.distribution}</span>
        </div>
      ) : null}

      {/* Interpretation */}
      {step.phase === 'interpreted' && step.interpretation ? (
        <div className="mt-4">
          <AgentInterpretationView interpretation={step.interpretation} />
        </div>
      ) : null}
    </div>
  )
}
