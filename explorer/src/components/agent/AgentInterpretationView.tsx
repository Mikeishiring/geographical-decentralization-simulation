/**
 * Renders the interpretation from a completed agent step.
 * Shows summary, hypothesis, confidence, truth boundary, and suggested next question.
 */

import { cn } from '../../lib/cn'
import type { AgentInterpretation } from '../../lib/agent-api'

interface AgentInterpretationViewProps {
  readonly interpretation: AgentInterpretation
}

function confidenceColor(confidence: AgentInterpretation['confidence']): string {
  if (confidence === 'high') return 'border-teal-200 bg-emerald-50 text-teal-700'
  if (confidence === 'medium') return 'border-amber-200 bg-orange-50 text-orange-800'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

export function AgentInterpretationView({
  interpretation,
}: AgentInterpretationViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-rule bg-white px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
              Interpretation
            </div>
            <div className="mt-2 text-sm leading-6 text-text-primary">
              {interpretation.summary}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-0.5 text-2xs font-medium',
              confidenceColor(interpretation.confidence),
            )}
          >
            {interpretation.confidence} confidence
          </span>
        </div>
      </div>

      {interpretation.hypothesis ? (
        <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Hypothesis
          </div>
          <div className="mt-2 text-sm leading-6 text-text-primary">
            {interpretation.hypothesis}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
          {interpretation.truthBoundary.label}
        </div>
        <div className="mt-2 text-xs leading-5 text-muted">
          {interpretation.truthBoundary.detail}
        </div>
      </div>

      {interpretation.suggestedNextQuestion ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-accent">
            Suggested next question
          </div>
          <div className="mt-2 text-sm leading-6 text-text-primary">
            {interpretation.suggestedNextQuestion}
          </div>
        </div>
      ) : null}
    </div>
  )
}
