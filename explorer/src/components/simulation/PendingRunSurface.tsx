import { cn } from '../../lib/cn'
import type { SimulationConfig, SimulationJob, SimulationManifest } from '../../lib/simulation-api'
import type { Block } from '../../types/blocks'
import type { SimulationArtifact } from '../../lib/simulation-api'
import type { SimulationOverviewBundle } from '../../lib/simulation-api'
import { OVERVIEW_BUNDLES } from './simulation-constants'
import type { RunnerStatus } from './simulation-lab-types'

export const EXACT_ANALYTICS_ARTIFACT_NAME = 'published_analytics_payload.json'

export function selectDefaultArtifact(artifacts: readonly SimulationArtifact[]): string | null {
  const preferred = artifacts.find(artifact => artifact.renderable && !artifact.lazy)
  if (preferred) return preferred.name
  return artifacts.find(artifact => artifact.renderable)?.name ?? null
}

export function isManifestOverviewBundle(
  bundle: (typeof OVERVIEW_BUNDLES)[number] | SimulationOverviewBundle | null,
): bundle is SimulationOverviewBundle {
  return Boolean(bundle && 'bytes' in bundle)
}

export function formatEthValue(value: number): string {
  return `${value.toFixed(4)} ETH`
}

export function defaultSimulationSummary(manifest: SimulationManifest): string {
  return `Exact ${manifest.config.paradigm} run over ${manifest.summary.slotsRecorded.toLocaleString()} recorded slots with ${formatEthValue(manifest.summary.finalAverageMev)} average MEV and ${manifest.summary.finalSupermajoritySuccess.toFixed(0)}% supermajority success.`
}

export function defaultSimulationContributionBlocks(
  manifest: SimulationManifest,
  guidanceBlocks: readonly Block[],
): readonly Block[] {
  if (guidanceBlocks.length > 0) return guidanceBlocks

  return [
    {
      type: 'stat',
      value: formatEthValue(manifest.summary.finalAverageMev),
      label: 'Final average MEV',
      sublabel: `${manifest.config.paradigm} exact run`,
    },
    {
      type: 'stat',
      value: `${manifest.summary.finalSupermajoritySuccess.toFixed(0)}%`,
      label: 'Supermajority success',
      sublabel: `${manifest.summary.slotsRecorded.toLocaleString()} slots recorded`,
    },
    {
      type: 'table',
      title: 'Exact run setup',
      headers: ['Parameter', 'Value'],
      rows: [
        ['Paradigm', manifest.config.paradigm],
        ['Validators', manifest.config.validators.toLocaleString()],
        ['Slots', manifest.config.slots.toLocaleString()],
        ['Distribution', manifest.config.distribution],
        ['Source placement', manifest.config.sourcePlacement],
        ['Attestation threshold', manifest.config.attestationThreshold.toFixed(2)],
        ['Slot time', `${manifest.config.slotTime}s`],
      ],
    },
    {
      type: 'caveat',
      text: 'This community note is tied to one bounded exact run. Treat it as evidence about this configuration, not as a universal recommendation.',
    },
  ]
}

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
  readonly detail: string
} {
  if (status === 'submitting') {
    return {
      eyebrow: 'Submitting exact run',
      headline: 'Packaging the configuration and opening a worker slot.',
      detail: 'The runner is validating the bounded config and creating the exact job ticket.',
    }
  }

  if (status === 'queued') {
    return {
      eyebrow: queuePosition != null && queuePosition > 0 ? `Queued at position ${queuePosition}` : 'Queued for execution',
      headline: 'The exact engine is waiting for a clean execution slot.',
      detail: queuePosition != null && queuePosition > 0
        ? `There ${queuePosition === 1 ? 'is' : 'are'} ${queuePosition.toLocaleString()} ${queuePosition === 1 ? 'job' : 'jobs'} ahead of this run in the queue.`
        : 'The job is staged and should begin as soon as the next exact worker is free.',
    }
  }

  if (status === 'running') {
    return {
      eyebrow: 'Running exact simulation',
      headline: 'Computing the manifest, sidecars, and renderable outputs.',
      detail: 'The canonical engine is executing now. This surface will upgrade itself into the results view as soon as the manifest arrives.',
    }
  }

  if (status === 'completed') {
    return {
      eyebrow: 'Finalizing results',
      headline: 'The run finished and the explorer is wiring in the result surface.',
      detail: 'The engine is done. The client is loading the manifest, overview bundles, and default renderable artifact.',
    }
  }

  if (status === 'failed') {
    return {
      eyebrow: 'Run failed',
      headline: 'The exact job did not complete successfully.',
      detail: 'Inspect the status panel for the emitted error before retrying the configuration.',
    }
  }

  if (status === 'cancelled') {
    return {
      eyebrow: 'Run cancelled',
      headline: 'The exact job stopped before artifacts were finalized.',
      detail: 'You can adjust the config and submit again without leaving the runner surface.',
    }
  }

  return {
    eyebrow: 'Runner ready',
    headline: 'Configure an exact simulation and launch it from here.',
    detail: 'The lab keeps the simulator, manifest summary, artifacts, and publishing flow inside the explorer shell.',
  }
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
    <div className="lab-stage-dark p-6 mb-6">
      <div className="lab-loading-orb" />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="text-[0.6875rem] uppercase tracking-[0.1em] text-slate-300">
            {stage.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[1.9rem]">
            {stage.headline}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {stage.detail}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[0.6875rem] font-medium text-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              {config.paradigm} exact run
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[0.6875rem] font-medium text-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              {config.validators.toLocaleString()} validators
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[0.6875rem] font-medium text-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {config.slots.toLocaleString()} slots
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
          <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Queue</div>
            <div className="mt-2 text-xl font-semibold text-white">
              {jobData?.queuePosition != null ? jobData.queuePosition.toLocaleString() : 'Live'}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {jobData?.queuePosition != null && jobData.queuePosition > 0
                ? 'Jobs ahead before execution begins'
                : 'No explicit backlog reported'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Cache path</div>
            <div className="mt-2 text-xl font-semibold text-white">
              {jobData?.cacheHit == null ? 'Pending' : jobData.cacheHit ? 'Reused' : 'Fresh'}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {jobData?.cacheHit == null
                ? 'Resolved after execution begins'
                : jobData.cacheHit
                  ? 'Shared exact result already existed'
                  : 'Engine is producing a new artifact set'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Updated</div>
            <div className="mt-2 text-base font-semibold text-white">
              {updatedLabel ?? createdLabel ?? 'Waiting'}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              {jobData?.id ? `Job ${jobData.id.slice(0, 8)}` : 'Ticket pending'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-4 text-xs text-slate-300">
          <span>Preparing the manifest, overview bundles, and default artifact render.</span>
          <span>{progress}%</span>
        </div>
        <div className="lab-progress-track bg-white/10">
          <div
            className="lab-progress-fill"
            data-state="active"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {[
          {
            label: '1. Ticket',
            title: 'Config locked',
            detail: 'Submit the exact config and open the job stream.',
          },
          {
            label: '2. Engine',
            title: 'Canonical execution',
            detail: 'Run the simulation engine or resolve the exact cache hit.',
          },
          {
            label: '3. Surface',
            title: 'Explorer render',
            detail: 'Load the manifest, charts, artifact cards, and parsed blocks.',
          },
        ].map((step, index) => {
          const state = stepIndex > index
            ? 'done'
            : stepIndex === index
              ? 'active'
              : 'idle'

          return (
            <div
              key={step.label}
              className={cn(
                'rounded-2xl border px-4 py-4 transition-colors',
                state === 'done' && 'border-emerald-300/22 bg-emerald-400/10',
                state === 'active' && 'border-sky-300/26 bg-sky-400/10',
                state === 'idle' && 'border-white/10 bg-white/5',
              )}
            >
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">{step.label}</div>
              <div className="mt-2 text-sm font-medium text-white">{step.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-300">{step.detail}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Incoming visuals</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="lab-skeleton lab-skeleton-block h-[240px]" />
            <div className="space-y-3">
              <div className="lab-skeleton lab-skeleton-line w-2/5" />
              <div className="lab-skeleton lab-skeleton-line w-full" />
              <div className="lab-skeleton lab-skeleton-line w-4/5" />
              <div className="lab-skeleton lab-skeleton-block h-[84px]" />
              <div className="lab-skeleton lab-skeleton-block h-[84px]" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Run snapshot</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Source placement</div>
              <div className="mt-2 text-sm font-medium text-white">{config.sourcePlacement}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Distribution</div>
              <div className="mt-2 text-sm font-medium text-white">{config.distribution}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Timing</div>
              <div className="mt-2 text-sm font-medium text-white">
                {config.slotTime}s slots
              </div>
              <div className="mt-1 text-xs text-slate-300">gamma {config.attestationThreshold.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-slate-400">Migration cost</div>
              <div className="mt-2 text-sm font-medium text-white">{formatEthValue(config.migrationCost)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-xs leading-5 text-slate-300">
            The runner stays on this surface while data arrives. No redirect, no tab handoff, and no empty result frame.
          </div>
        </div>
      </div>
    </div>
  )
}
