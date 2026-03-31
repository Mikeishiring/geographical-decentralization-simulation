import { cn } from '../../lib/cn'
import type { SimulationConfig, SimulationJob } from '../../lib/simulation-api'
import type { RunnerStatus } from './simulation-lab-types'
import { formatEthValue } from './pending-run-helpers'

function estimateRunProgress(status: RunnerStatus, queuePosition: number | null): number {
  if (status === 'idle') return 0
  if (status === 'submitting') return 12
  if (status === 'queued') {
    if (queuePosition == null) return 26
    return Math.max(24, Math.min(46, 44 - Math.min(queuePosition, 6) * 3))
  }
  if (status === 'running') return 74
  return 100
}

function describeRunStage(status: RunnerStatus, queuePosition: number | null): {
  readonly eyebrow: string
  readonly headline: string
} {
  if (status === 'submitting') {
    return { eyebrow: 'Submitting', headline: 'Packaging configuration...' }
  }
  if (status === 'queued') {
    const posLabel = queuePosition != null && queuePosition > 0
      ? ` (position ${queuePosition})`
      : ''
    return { eyebrow: `Queued${posLabel}`, headline: 'Waiting for an execution slot.' }
  }
  if (status === 'running') {
    return { eyebrow: 'Running', headline: 'Computing manifest and artifacts.' }
  }
  if (status === 'completed') {
    return { eyebrow: 'Finalizing', headline: 'Loading results.' }
  }
  if (status === 'failed') {
    return { eyebrow: 'Failed', headline: 'The run did not complete.' }
  }
  if (status === 'cancelled') {
    return { eyebrow: 'Cancelled', headline: 'Run stopped before completion.' }
  }
  return { eyebrow: 'Ready', headline: 'Configure and launch a simulation.' }
}

function formatJobTimestamp(value: string | undefined): string | null {
  if (!value) return null
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

export function PendingRunSurface({
  status,
  jobData,
  config,
}: {
  readonly status: RunnerStatus
  readonly jobData: SimulationJob | null
  readonly config: SimulationConfig
}) {
  const stage = describeRunStage(status, jobData?.queuePosition ?? null)
  const progress = estimateRunProgress(status, jobData?.queuePosition ?? null)
  const stepIndex = status === 'submitting'
    ? 0
    : status === 'queued'
      ? 1
      : status === 'running' || status === 'completed'
        ? 2
        : -1
  const updatedLabel = formatJobTimestamp(jobData?.updatedAt)
  const createdLabel = formatJobTimestamp(jobData?.createdAt)

  return (
    <div className="lab-stage-soft p-5 mb-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[0.6875rem] uppercase tracking-[0.1em] text-text-faint">
            {stage.eyebrow}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {stage.headline}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3 py-1 text-[0.6875rem] font-medium text-text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              {config.paradigm}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3 py-1 text-[0.6875rem] font-medium text-text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {config.validators.toLocaleString()} validators
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3 py-1 text-[0.6875rem] font-medium text-text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {config.slots.toLocaleString()} slots
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[380px]">
          <div className="rounded-2xl border border-rule bg-white/88 px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Queue</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">
              {jobData?.queuePosition != null ? jobData.queuePosition.toLocaleString() : 'Live'}
            </div>
          </div>
          <div className="rounded-2xl border border-rule bg-white/88 px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Cache</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">
              {jobData?.cacheHit == null ? 'Pending' : jobData.cacheHit ? 'Reused' : 'Fresh'}
            </div>
          </div>
          <div className="rounded-2xl border border-rule bg-white/88 px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Updated</div>
            <div className="mt-1 text-base font-semibold text-text-primary">
              {updatedLabel ?? createdLabel ?? 'Waiting'}
            </div>
            {jobData?.id && (
              <div className="mt-0.5 text-xs text-muted">{jobData.id.slice(0, 8)}</div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-4 text-xs text-muted">
          <div className="flex gap-4">
            {['Ticket', 'Engine', 'Render'].map((step, index) => (
              <span
                key={step}
                className={cn(
                  'text-[0.6875rem]',
                  stepIndex > index && 'text-emerald-600',
                  stepIndex === index && 'text-accent font-medium',
                )}
              >
                {step}
              </span>
            ))}
          </div>
          <span>{progress}%</span>
        </div>
        <div className="lab-progress-track bg-surface-active">
          <div
            className="lab-progress-fill"
            data-state="active"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Run snapshot */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-rule bg-white px-3 py-2.5">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Source</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{config.sourcePlacement}</div>
        </div>
        <div className="rounded-xl border border-rule bg-white px-3 py-2.5">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Distribution</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{config.distribution}</div>
        </div>
        <div className="rounded-xl border border-rule bg-white px-3 py-2.5">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Timing</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{config.slotTime}s · γ {config.attestationThreshold.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-rule bg-white px-3 py-2.5">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Migration cost</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{formatEthValue(config.migrationCost)}</div>
        </div>
      </div>
    </div>
  )
}
