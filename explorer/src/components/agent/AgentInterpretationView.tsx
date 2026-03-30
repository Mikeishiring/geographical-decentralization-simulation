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
  if (confidence === 'high') return 'border-[#D7F1E6] bg-[#F7FDF9] text-[#0F766E]'
  if (confidence === 'medium') return 'border-[#F4E0C2] bg-[#FFF9F2] text-[#9A3412]'
  return 'border-[#F7D8E0] bg-[#FFF8FA] text-[#9F1239]'
}

export function AgentInterpretationView({
  interpretation,
}: AgentInterpretationViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-rule bg-white px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Interpretation
            </div>
            <div className="mt-2 text-sm leading-6 text-text-primary">
              {interpretation.summary}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium',
              confidenceColor(interpretation.confidence),
            )}
          >
            {interpretation.confidence} confidence
          </span>
        </div>
      </div>

      {interpretation.hypothesis ? (
        <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
            Hypothesis
          </div>
          <div className="mt-2 text-sm leading-6 text-text-primary">
            {interpretation.hypothesis}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
          {interpretation.truthBoundary.label}
        </div>
        <div className="mt-2 text-xs leading-5 text-muted">
          {interpretation.truthBoundary.detail}
        </div>
      </div>

      {interpretation.suggestedNextQuestion ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-accent">
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
