/**
 * Renders a single step in the agent loop with phase-aware UI.
 * Each step shows its question, current phase, config review (if applicable),
 * and interpretation (if completed).
 *
 * BenjiStripe: monospace step index, semantic status dots, 1px border trick,
 * press feedback on action buttons.
 */

import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { AgentStep, AgentStepPhase } from '../../lib/agent-api'
import { AgentConfigReview } from './AgentConfigReview'
import { AgentInterpretationView } from './AgentInterpretationView'
import type { SimulationConfig } from '../../lib/simulation-api'
import { paradigmLabel } from '../simulation/simulation-constants'

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

const SPINNING_PHASES: readonly AgentStepPhase[] = ['analyzing', 'simulation_running', 'interpreting']
const WAITING_PHASES: readonly AgentStepPhase[] = ['awaiting_approval', 'simulation_queued', 'config_proposed']

function phaseIndicator(phase: AgentStepPhase): 'spinning' | 'waiting' | 'done' | 'error' {
  if (SPINNING_PHASES.includes(phase)) return 'spinning'
  if (WAITING_PHASES.includes(phase)) return 'waiting'
  if (phase === 'failed') return 'error'
  return 'done'
}

/** Semantic dot color — exact hex, never Tailwind color classes */
function dotClass(indicator: ReturnType<typeof phaseIndicator>): string {
  switch (indicator) {
    case 'done': return 'bg-[#22c55e]'
    case 'error': return 'bg-[#ef4444]'
    case 'waiting': return 'bg-[#f59e0b]'
    default: return 'bg-accent'
  }
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
        'rounded-2xl border bg-white px-5 py-5 transition-shadow',
        isLatest
          ? 'border-accent/40 shadow-[0_8px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)]'
          : 'border-rule shadow-[0_1px_3px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)]',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Step index — monospace, tabular, circle badge */}
        <div
          aria-label={`Step ${step.index + 1}`}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule bg-surface-active font-mono text-[11px] font-semibold tabular-nums text-text-primary"
        >
          {step.index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug text-text-primary">{step.question}</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            {indicator === 'spinning' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <span className={cn('h-[7px] w-[7px] rounded-full', dotClass(indicator))} />
            )}
            <span>{phaseLabel(step.phase)}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {step.error ? (
        <div className="mt-4 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5 px-4 py-3 text-sm text-[#ef4444]">
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

      {/* Approved config summary (after approval) — monospace param chips */}
      {step.approvedConfig && step.phase !== 'awaiting_approval' ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[
            paradigmLabel(step.approvedConfig.paradigm),
            `${step.approvedConfig.validators} validators`,
            `${step.approvedConfig.slots} slots`,
            `\u03B3\u2009=\u2009${step.approvedConfig.attestationThreshold}`,
            step.approvedConfig.distribution,
          ].map(chip => (
            <span
              key={chip}
              className="rounded-md border border-rule bg-surface-active px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted"
            >
              {chip}
            </span>
          ))}
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
