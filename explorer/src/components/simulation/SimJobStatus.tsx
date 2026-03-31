import { motion } from 'framer-motion'
import { AlertTriangle, Ban, CheckCircle2, Clock3, LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP } from '../../lib/theme'
import type { SimulationJob } from '../../lib/simulation-api'

type JobStatus = 'idle' | 'submitting' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

interface SimJobStatusProps {
  readonly status: JobStatus
  readonly jobData: SimulationJob | null
  readonly submitError: Error | null
  readonly cancelError: Error | null
}

function formatTimestamp(value: string | undefined): string | null {
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

function statusProgress(status: JobStatus, queuePosition: number | null): number {
  if (status === 'idle') return 0
  if (status === 'submitting') return 12
  if (status === 'queued') {
    if (queuePosition == null) return 30
    return Math.max(26, Math.min(48, 46 - Math.min(queuePosition, 6) * 3))
  }
  if (status === 'running') return 76
  return 100
}

export function SimJobStatus({
  status,
  jobData,
  submitError,
  cancelError,
}: SimJobStatusProps) {
  const progress = statusProgress(status, jobData?.queuePosition ?? null)
  const errorMessage = submitError?.message ?? cancelError?.message ?? jobData?.error ?? null
  const createdLabel = formatTimestamp(jobData?.createdAt)
  const updatedLabel = formatTimestamp(jobData?.updatedAt)
  const meta = status === 'idle'
    ? {
        label: 'Runner ready',
        title: 'Ready for the next exact run',
        detail: 'Adjust the bounded config and launch when the scenario looks right.',
        tone: 'idle' as const,
      }
    : status === 'submitting'
      ? {
          label: 'Submitting',
          title: 'Opening exact run ticket',
          detail: 'The runner is validating the config and creating the job stream.',
          tone: 'active' as const,
        }
      : status === 'queued'
        ? {
            label: jobData?.queuePosition != null && jobData.queuePosition > 0 ? `Queued · ${jobData.queuePosition} ahead` : 'Queued',
            title: 'Waiting for an execution slot',
            detail: 'The exact engine has not started yet, but the run is staged and subscribed.',
            tone: 'active' as const,
          }
        : status === 'running'
          ? {
              label: 'Running',
              title: 'Computing manifest and artifact sidecars',
              detail: 'This surface will switch into the results panels as soon as the manifest lands.',
              tone: 'active' as const,
            }
          : status === 'completed'
            ? {
                label: 'Completed',
                title: 'Exact run ready',
                detail: 'Manifest and renderable outputs are available for inspection.',
                tone: 'success' as const,
              }
            : status === 'cancelled'
              ? {
                  label: 'Cancelled',
                  title: 'Exact run stopped',
                  detail: 'The job was cancelled before the final artifact surface was assembled.',
                  tone: 'muted' as const,
                }
              : {
                  label: 'Failed',
                  title: 'Exact run failed',
                  detail: 'The engine reported an error before results could be finalized.',
                  tone: 'danger' as const,
                }

  const isActive = meta.tone === 'active'
  const statusIcon = meta.tone === 'success'
    ? <CheckCircle2 className="h-4 w-4" />
    : meta.tone === 'danger'
      ? <AlertTriangle className="h-4 w-4" />
      : meta.tone === 'muted'
      ? <Ban className="h-4 w-4" />
        : meta.tone === 'idle'
          ? <Clock3 className="h-4 w-4" />
          : <LoaderCircle className="h-4 w-4 animate-spin" />

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="stripe-top-accent lab-stage-soft p-5 mb-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Job status
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={cn(
                'relative inline-flex h-9 w-9 items-center justify-center rounded-full border',
                meta.tone === 'success' && 'border-emerald-300/30 bg-emerald-50 text-emerald-700',
                meta.tone === 'danger' && 'border-danger/30 bg-danger/5 text-danger',
                meta.tone === 'muted' && 'border-rule bg-surface-active text-text-primary',
                meta.tone === 'idle' && 'border-rule bg-white text-text-primary',
                meta.tone === 'active' && 'border-sky-300/28 bg-sky-50 text-sky-700',
              )}
            >
              {/* Liveline-style breathing pulse ring for active states */}
              {isActive && (
                <span className="absolute inset-0 rounded-full border-2 border-sky-400/30 dot-pulse" />
              )}
              {statusIcon}
            </span>
            <div>
              <div className="text-sm font-medium text-text-primary">{meta.title}</div>
              <div className="mt-1 text-xs text-muted">{meta.label}</div>
            </div>
          </div>
          <div className="mt-3 text-sm leading-6 text-muted">
            {meta.detail}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[320px]">
          {[
            {
              label: 'Queue',
              value: jobData?.queuePosition ?? 'Live',
              detail: jobData?.queuePosition != null && jobData.queuePosition > 0
                ? 'Jobs ahead before execution starts'
                : 'No backlog signal from the runtime',
            },
            {
              label: 'Cache path',
              value: jobData?.cacheHit == null ? 'Pending' : jobData.cacheHit ? 'Hit' : 'Fresh',
              detail: jobData?.cacheHit == null ? 'Resolved during execution' : jobData.cacheHit ? 'Exact cache reuse' : 'New exact run',
            },
            {
              label: 'Created',
              value: createdLabel ?? 'Waiting',
              detail: jobData?.id ? `Job ${jobData.id.slice(0, 8)}` : 'Ticket pending',
            },
            {
              label: 'Updated',
              value: updatedLabel ?? 'Waiting',
              detail: status === 'completed' ? 'Ready to inspect' : 'Stream stays live',
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              className="rounded-xl border border-rule bg-white/88 px-4 py-3 card-hover"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_CRISP, delay: 0.1 + i * 0.04 }}
            >
              <span className="block text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</span>
              <div className="mt-2 text-base font-semibold text-text-primary">{card.value}</div>
              <div className="mt-1 text-xs text-muted">{card.detail}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span>Runner pipeline</span>
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

      {errorMessage && (
        <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      )}
    </motion.div>
  )
}
