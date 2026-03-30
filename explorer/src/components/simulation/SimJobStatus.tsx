import { motion } from 'framer-motion'
import { AlertTriangle, Ban, CheckCircle2, Clock3, LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'
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
      className="lab-stage-dark p-5 mb-6"
    >
      <div className="lab-loading-orb" />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">
            Job status
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full border text-white',
                meta.tone === 'success' && 'border-emerald-300/24 bg-emerald-400/12',
                meta.tone === 'danger' && 'border-red-300/24 bg-red-400/12',
                meta.tone === 'muted' && 'border-slate-300/16 bg-slate-400/10',
                meta.tone === 'idle' && 'border-slate-300/16 bg-white/6',
                meta.tone === 'active' && 'border-sky-300/24 bg-sky-400/12',
              )}
            >
              {statusIcon}
            </span>
            <div>
              <div className="text-sm font-medium text-white">{meta.title}</div>
              <div className="mt-1 text-xs text-slate-300">{meta.label}</div>
            </div>
          </div>
          <div className="mt-3 text-sm leading-6 text-slate-300">
            {meta.detail}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[320px]">
          <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
            <span className="block text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Queue</span>
            <div className="mt-2 text-base font-semibold text-white">
              {jobData?.queuePosition ?? 'Live'}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {jobData?.queuePosition != null && jobData.queuePosition > 0
                ? 'Jobs ahead before execution starts'
                : 'No backlog signal from the runtime'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
            <span className="block text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Cache path</span>
            <div className="mt-2 text-base font-semibold text-white">
              {jobData?.cacheHit == null ? 'Pending' : jobData.cacheHit ? 'Hit' : 'Fresh'}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {jobData?.cacheHit == null ? 'Resolved during execution' : jobData.cacheHit ? 'Exact cache reuse' : 'New exact run'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
            <span className="block text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Created</span>
            <div className="mt-2 text-base font-semibold text-white">{createdLabel ?? 'Waiting'}</div>
            <div className="mt-1 text-xs text-slate-300">
              {jobData?.id ? `Job ${jobData.id.slice(0, 8)}` : 'Ticket pending'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
            <span className="block text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Updated</span>
            <div className="mt-2 text-base font-semibold text-white">{updatedLabel ?? 'Waiting'}</div>
            <div className="mt-1 text-xs text-slate-300">
              {status === 'completed' ? 'Ready to inspect' : 'Stream stays live'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-300">
          <span>Runner pipeline</span>
          <span>{progress}%</span>
        </div>
        <div className="lab-progress-track bg-white/10">
          <div
            className="lab-progress-fill"
            data-state={status === 'submitting' || status === 'queued' || status === 'running' ? 'active' : undefined}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-2xl border border-red-300/24 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </div>
      )}
    </motion.div>
  )
}
