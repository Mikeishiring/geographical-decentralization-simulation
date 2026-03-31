/**
 * Displays a proposed simulation config with approve/modify/reject actions.
 * The human-in-the-loop gate: no simulation runs without explicit approval.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { SimulationConfig } from '../../lib/simulation-api'

interface AgentConfigReviewProps {
  readonly config: SimulationConfig
  readonly rationale: string | null
  readonly onApprove: (config?: SimulationConfig) => void
  readonly onReject: (feedback?: string) => void
  readonly isApproving: boolean
  readonly isRejecting: boolean
}

const CONFIG_FIELDS: ReadonlyArray<{
  readonly key: keyof SimulationConfig
  readonly label: string
  readonly format?: (value: unknown) => string
}> = [
  { key: 'paradigm', label: 'Paradigm' },
  { key: 'validators', label: 'Validators' },
  { key: 'slots', label: 'Slots' },
  { key: 'distribution', label: 'Distribution' },
  { key: 'sourcePlacement', label: 'Source placement' },
  { key: 'migrationCost', label: 'Migration cost', format: (v) => `${v} ETH` },
  { key: 'attestationThreshold', label: 'Gamma (γ)', format: (v) => String(v) },
  { key: 'slotTime', label: 'Slot time', format: (v) => `${v}s` },
  { key: 'seed', label: 'Seed' },
]

export function AgentConfigReview({
  config,
  rationale,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: AgentConfigReviewProps) {
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const busy = isApproving || isRejecting

  return (
    <div className="space-y-4">
      {rationale ? (
        <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Rationale
          </div>
          <div className="mt-2 text-sm leading-6 text-text-primary">{rationale}</div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CONFIG_FIELDS.map((field) => {
          const rawValue = config[field.key]
          const display = field.format ? field.format(rawValue) : String(rawValue)
          return (
            <div
              key={field.key}
              className="rounded-xl border border-rule bg-white px-3 py-2.5"
            >
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
                {field.label}
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">{display}</div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onApprove()}
          disabled={busy}
          className={cn(
            'rounded-xl px-5 py-2.5 text-sm font-medium transition-all',
            busy
              ? 'cursor-not-allowed border border-rule bg-surface-active text-muted'
              : 'bg-slate-900 text-white hover:bg-slate-800',
          )}
          aria-label="Approve proposed configuration and run simulation"
        >
          {isApproving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting
            </span>
          ) : (
            'Approve & run'
          )}
        </button>

        <button
          onClick={() => setShowRejectInput((prev) => !prev)}
          disabled={busy}
          className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Reject proposed configuration"
        >
          Reject
        </button>
      </div>

      {showRejectInput ? (
        <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
          <textarea
            value={rejectFeedback}
            onChange={(e) => setRejectFeedback(e.target.value)}
            placeholder="Optional: explain what you'd change..."
            className="min-h-[72px] w-full resize-none bg-transparent text-sm leading-6 text-text-primary outline-none"
            maxLength={300}
          />
          <button
            onClick={() => {
              onReject(rejectFeedback.trim() || undefined)
              setRejectFeedback('')
              setShowRejectInput(false)
            }}
            disabled={busy}
            className="mt-2 rounded-xl border border-rule bg-white px-4 py-2 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRejecting ? 'Re-analyzing...' : 'Send feedback & re-analyze'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
