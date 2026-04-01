import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { GlobeNetwork } from '../decorative/GlobeNetwork'
import { SPRING, SPRING_CRISP } from '../../lib/theme'
import type { SimulationConfig, SimulationJob } from '../../lib/simulation-api'
import type { RunnerStatus } from './simulation-lab-types'
import { formatEthValue } from './pending-run-helpers'
import { estimateRuntimeSeconds, paradigmLabel } from './simulation-constants'
import { useElapsedSeconds, formatElapsed, estimateRunProgress } from './useRunProgress'

function describeRunStage(status: RunnerStatus, queuePosition: number | null, elapsedLabel: string): {
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
    return { eyebrow: `Running · ${elapsedLabel}`, headline: 'Computing manifest and artifacts.' }
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
  const isRunning = status === 'running'
  const estimatedSeconds = estimateRuntimeSeconds(config.validators, config.slots, config.slotTime)
  const elapsed = useElapsedSeconds(jobData?.createdAt, isRunning)
  const elapsedLabel = formatElapsed(elapsed)
  const stage = describeRunStage(status, jobData?.queuePosition ?? null, elapsedLabel)
  const progress = estimateRunProgress(status, jobData?.queuePosition ?? null, elapsed, estimatedSeconds)
  const stepIndex = status === 'submitting'
    ? 0
    : status === 'queued'
      ? 1
      : status === 'running' || status === 'completed'
        ? 2
        : -1
  const updatedLabel = formatJobTimestamp(jobData?.updatedAt)
  const createdLabel = formatJobTimestamp(jobData?.createdAt)

  const isActive = status === 'submitting' || status === 'queued' || status === 'running'

  const CARD_TITLES: Record<string, string> = {
    Queue: 'Position in execution queue. "Live" means no jobs ahead.',
    Cache: '"Reused" = instant cache hit. "Fresh" = new computation required.',
    Updated: 'Last status update timestamp. ID prefix shown below.',
  }

  const STEP_TITLES: Record<string, string> = {
    Ticket: 'Job accepted and queued for execution',
    Engine: 'Mesa simulation engine running validators',
    Render: 'Processing results into visualization artifacts',
  }

  const SNAPSHOT_TITLES: Record<string, string> = {
    Source: 'Where block-building information originates relative to validators',
    Distribution: 'How validators are distributed across geographic regions',
    Timing: 'Slot duration and attestation threshold (γ) for this run',
    'Migration cost': 'ETH cost validators pay when relocating between regions',
  }

  return (
    <motion.div
      className="stripe-top-accent lab-stage-soft p-5 mb-5 relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div
        className="absolute -right-6 -top-6 w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] opacity-[0.12] pointer-events-none select-none"
        aria-hidden="true"
      >
        <GlobeNetwork className="w-full h-full text-meridian" />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between relative">
        <div>
          <motion.div
            className="text-11 uppercase tracking-[0.1em] text-accent font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...SPRING_CRISP, delay: 0.06 }}
          >
            {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent dot-pulse mr-2 align-middle" />}
            {stage.eyebrow}
          </motion.div>
          <motion.h2
            className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_CRISP, delay: 0.1 }}
          >
            {stage.headline}
          </motion.h2>
          <motion.div
            className="mt-3 flex flex-wrap gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...SPRING_CRISP, delay: 0.14 }}
          >
            <span className="lab-chip bg-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {paradigmLabel(config.paradigm)}
            </span>
            <span className="lab-chip bg-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              {config.validators.toLocaleString()} validators
            </span>
            <span className="lab-chip bg-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {config.slots.toLocaleString()} slots
            </span>
          </motion.div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[380px]">
          {[
            {
              label: 'Queue',
              value: jobData?.queuePosition != null ? jobData.queuePosition.toLocaleString() : 'Live',
            },
            {
              label: 'Cache',
              value: jobData?.cacheHit == null ? 'Pending' : jobData.cacheHit ? 'Reused' : 'Fresh',
            },
            {
              label: 'Updated',
              value: updatedLabel ?? createdLabel ?? 'Waiting',
              sub: jobData?.id ? jobData.id.slice(0, 8) : undefined,
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              className="lab-metric-card card-hover"
              title={CARD_TITLES[card.label]}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING_CRISP, delay: 0.12 + i * 0.04 }}
            >
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
              <div className={cn('mt-1 font-semibold text-text-primary', card.label === 'Updated' ? 'text-base' : 'text-lg tabular-nums')}>
                {card.value}
              </div>
              {card.sub && (
                <div className="mt-0.5 mono-xs">{card.sub}</div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Animated progress bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-4 text-xs text-muted">
          <div className="flex gap-4">
            {['Ticket', 'Engine', 'Render'].map((step, index) => (
              <span
                key={step}
                title={STEP_TITLES[step]}
                className={cn(
                  'text-11',
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
          <motion.div
            className="lab-progress-fill"
            data-state={isActive ? 'active' : undefined}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={SPRING_CRISP}
          />
        </div>
      </div>

      {/* Run snapshot — staggered cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Source', value: config.sourcePlacement },
          { label: 'Distribution', value: config.distribution },
          { label: 'Timing', value: `${config.slotTime}s · γ ${config.attestationThreshold.toFixed(2)}`, mono: true },
          { label: 'Migration cost', value: formatEthValue(config.migrationCost), mono: true },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            className="lab-option-card px-3 py-2.5"
            title={SNAPSHOT_TITLES[card.label]}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_CRISP, delay: 0.2 + i * 0.04 }}
          >
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
            <div className={cn('mt-1 text-text-primary', card.mono ? 'mono-sm' : 'text-sm font-medium')}>{card.value}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
