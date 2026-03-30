import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { SimConfigPanel } from '../components/simulation/SimConfigPanel'
import { SimCopilotPanel } from '../components/simulation/SimCopilotPanel'
import { SimJobStatus } from '../components/simulation/SimJobStatus'
import { ResearchDemoSurface } from '../components/simulation/ResearchDemoSurface'
import { SimResultsPanel } from '../components/simulation/SimResultsPanel'
import {
  COPY_RESET_DELAY_MS,
  DEFAULT_CONFIG,
  OVERVIEW_BUNDLES,
  PRESETS,
  describePaperComparability,
  paperScenarioLabels,
  readOrCreateClientId,
  readSessionArtifactBlocks,
  writeSessionArtifactBlocks,
} from '../components/simulation/simulation-constants'
import { createExploration, getApiHealth, publishExploration } from '../lib/api'
import { downloadSimulationExportArchive } from '../lib/simulation-export'
import { ModeBanner } from '../components/layout/ModeBanner'
import { Wayfinder } from '../components/layout/Wayfinder'
import type { TabId } from '../components/layout/TabNav'
import { cn } from '../lib/cn'
import {
  cancelSimulationJob,
  getSimulationArtifact,
  getSimulationManifest,
  getSimulationJob,
  getSimulationOverviewBundle,
  submitSimulationCopilot,
  submitSimulationForClient,
  type SimulationArtifact,
  type SimulationCopilotResponse,
  type SimulationConfig,
  type SimulationJob,
  type SimulationManifest,
  type SimulationOverviewBundle,
} from '../lib/simulation-api'
import type { Block } from '../types/blocks'
import type { SimulationArtifactBundle } from '../types/simulation-view'

interface WorkerSuccess {
  readonly id: number
  readonly ok: true
  readonly blocks: readonly Block[]
}

interface WorkerFailure {
  readonly id: number
  readonly ok: false
  readonly error: string
}

type RunnerStatus = 'idle' | 'submitting' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

function selectDefaultArtifact(artifacts: readonly SimulationArtifact[]): string | null {
  const preferred = artifacts.find(artifact => artifact.renderable && !artifact.lazy)
  if (preferred) return preferred.name
  return artifacts.find(artifact => artifact.renderable)?.name ?? null
}

function isManifestOverviewBundle(
  bundle: (typeof OVERVIEW_BUNDLES)[number] | SimulationOverviewBundle | null,
): bundle is SimulationOverviewBundle {
  return Boolean(bundle && 'bytes' in bundle)
}

const APP_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

function formatEthValue(value: number): string {
  return `${value.toFixed(4)} ETH`
}

function defaultSimulationSummary(manifest: SimulationManifest): string {
  return `Exact ${manifest.config.paradigm} run over ${manifest.summary.slotsRecorded.toLocaleString()} recorded slots with ${formatEthValue(manifest.summary.finalAverageMev)} average MEV and ${manifest.summary.finalSupermajoritySuccess.toFixed(0)}% supermajority success.`
}

function defaultSimulationContributionBlocks(
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

function PendingRunSurface({
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
          <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-300">
            {stage.eyebrow}
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[1.9rem]">
            {stage.headline}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {stage.detail}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium text-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              {config.paradigm} exact run
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium text-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              {config.validators.toLocaleString()} validators
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium text-slate-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {config.slots.toLocaleString()} slots
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
          <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Queue</div>
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
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Cache path</div>
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
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Updated</div>
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
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{step.label}</div>
              <div className="mt-2 text-sm font-medium text-white">{step.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-300">{step.detail}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Incoming visuals</div>
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

        <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Run snapshot</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Source placement</div>
              <div className="mt-2 text-sm font-medium text-white">{config.sourcePlacement}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Distribution</div>
              <div className="mt-2 text-sm font-medium text-white">{config.distribution}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Timing</div>
              <div className="mt-2 text-sm font-medium text-white">
                {config.slotTime}s slots
              </div>
              <div className="mt-1 text-xs text-slate-300">gamma {config.attestationThreshold.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Migration cost</div>
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

function SimulationWorkflowRail({
  status,
  hasManifest,
  published,
}: {
  readonly status: RunnerStatus
  readonly hasManifest: boolean
  readonly published: boolean
}) {
  const activeStep = published
    ? 3
    : hasManifest
      ? 2
      : status === 'submitting' || status === 'queued' || status === 'running' || status === 'completed'
        ? 1
        : 0

  const headline = published
    ? 'The run has been framed and sent to Community.'
    : hasManifest
      ? 'The exact run is ready to inspect and can now be exported or published.'
      : status === 'submitting' || status === 'queued' || status === 'running' || status === 'completed'
      ? 'The runner is moving through queue and execution toward the manifest surface.'
      : 'Choose a bounded scenario, launch the run, then inspect and publish only after reading the artifacts.'
  const liveLabel = published
    ? 'Published'
    : hasManifest
      ? 'Manifest ready'
      : status === 'submitting'
        ? 'Launching now'
        : status === 'queued'
          ? 'Queued'
          : status === 'running'
            ? 'Running'
            : 'Idle'

  const steps = [
    {
      key: 'configure',
      label: '1. Configure',
      title: 'Bound the scenario',
      detail: 'Pick the paradigm, scale, source placement, and timing assumptions you actually want to test.',
    },
    {
      key: 'run',
      label: '2. Run',
      title: 'Queue and execute',
      detail: 'Let the exact engine resolve the job, emit the manifest, and prepare the sidecar surfaces.',
    },
    {
      key: 'inspect',
      label: '3. Inspect',
      title: 'Read artifacts, not guesses',
      detail: 'Use the overview bundles, raw artifacts, and export package before treating the result as evidence.',
    },
    {
      key: 'publish',
      label: '4. Publish',
      title: 'Add human framing',
      detail: 'Only intentional notes with a title and takeaway belong on the Community surface.',
    },
  ] as const

  return (
    <div className="lab-stage-soft p-5 mb-6" aria-live="polite">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="lab-section-title">Runner Workflow</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{headline}</div>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white px-3 py-1.5 text-[11px] font-medium text-text-primary">
            <span className={cn('h-2 w-2 rounded-full', activeStep === 0 ? 'bg-slate-400' : activeStep === 3 ? 'bg-success' : 'bg-accent animate-pulse')} />
            {liveLabel}
          </div>
          <div className="max-w-2xl text-xs leading-5 text-muted lg:text-right">
            The exact tab is designed as one loop: configure, execute, inspect, then publish only if the artifacts support the takeaway you want to put in public.
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {steps.map((step, index) => {
          const state = index < activeStep
            ? 'done'
            : index === activeStep
              ? 'active'
              : 'idle'

          return (
            <div
              key={step.key}
              className={cn(
                'rounded-[1.1rem] border px-4 py-4 transition-colors',
                state === 'done' && 'border-success/30 bg-success/8',
                state === 'active' && 'border-accent/30 bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(255,255,255,0.98))]',
                state === 'idle' && 'border-border-subtle bg-white/85',
              )}
            >
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{step.label}</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{step.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted">{step.detail}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SimulationLabPage({
  onOpenCommunityExploration,
  onTabChange,
}: {
  onOpenCommunityExploration?: (explorationId: string) => void
  onTabChange?: (tab: TabId) => void
} = {}) {
  const queryClient = useQueryClient()
  const [surfaceMode, setSurfaceMode] = useState<'research' | 'lab'>('research')
  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG })
  const [clientId] = useState(readOrCreateClientId)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [selectedArtifactName, setSelectedArtifactName] = useState<string | null>(null)
  const [selectedBundle, setSelectedBundle] = useState<SimulationArtifactBundle>('core-outcomes')
  const [parsedBlocks, setParsedBlocks] = useState<readonly Block[]>([])
  const [parsedArtifactCache, setParsedArtifactCache] = useState<Record<string, readonly Block[]>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [copyState, setCopyState] = useState<'config' | 'run' | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'done'>('idle')
  const [exportError, setExportError] = useState<string | null>(null)
  const [copilotQuestion, setCopilotQuestion] = useState('')
  const [copilotResponse, setCopilotResponse] = useState<SimulationCopilotResponse | null>(null)
  const [publishedSimulationKey, setPublishedSimulationKey] = useState<string | null>(null)
  const [publishedSimulationExplorationId, setPublishedSimulationExplorationId] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const workerRequestIdRef = useRef(0)
  const exportResetTimeoutRef = useRef<number | null>(null)
  const runnerFocusRef = useRef<HTMLDivElement | null>(null)
  const lastAutoScrollJobRef = useRef<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/simulationArtifactWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return () => {
      if (exportResetTimeoutRef.current != null) {
        window.clearTimeout(exportResetTimeoutRef.current)
      }
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!currentJobId) return

    const stream = new EventSource(`/api/simulations/${currentJobId}/events`)
    const handleSnapshot = (event: MessageEvent<string>) => {
      const snapshot = JSON.parse(event.data) as SimulationJob
      queryClient.setQueryData(['simulation-job', currentJobId], snapshot)
      if (snapshot.manifest) {
        queryClient.setQueryData(['simulation-manifest', currentJobId], snapshot.manifest)
      }
    }

    stream.addEventListener('snapshot', handleSnapshot as EventListener)

    return () => {
      stream.removeEventListener('snapshot', handleSnapshot as EventListener)
      stream.close()
    }
  }, [currentJobId, queryClient])

  useEffect(() => {
    setCopilotResponse(null)
  }, [currentJobId])

  useEffect(() => {
    if (surfaceMode !== 'lab') return
    if (!currentJobId) return
    if (lastAutoScrollJobRef.current === currentJobId) return

    lastAutoScrollJobRef.current = currentJobId
    window.requestAnimationFrame(() => {
      runnerFocusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [currentJobId, surfaceMode])

  const jumpToRunner = () => {
    runnerFocusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const updateConfig = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => {
    setConfig(previous => ({ ...previous, [key]: value }))
  }

  const applyPreset = (preset: Partial<SimulationConfig>) => {
    setConfig(previous => ({ ...previous, ...preset }))
  }

  const resetConfig = () => {
    setConfig({ ...DEFAULT_CONFIG })
  }

  const submitMutation = useMutation({
    mutationFn: (nextConfig: SimulationConfig) => submitSimulationForClient(nextConfig, clientId),
    onSuccess: job => {
      queryClient.setQueryData(['simulation-job', job.id], job)
      if (job.manifest) {
        queryClient.setQueryData(['simulation-manifest', job.id], job.manifest)
      }
      if (exportResetTimeoutRef.current != null) {
        window.clearTimeout(exportResetTimeoutRef.current)
        exportResetTimeoutRef.current = null
      }
      setCurrentJobId(job.id)
      setSelectedBundle('core-outcomes')
      setSelectedArtifactName(null)
      setParsedBlocks([])
      setParsedArtifactCache({})
      setParseError(null)
      setExportState('idle')
      setExportError(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: cancelSimulationJob,
    onSuccess: job => {
      queryClient.setQueryData(['simulation-job', job.id], job)
    },
  })

  const copilotMutation = useMutation({
    mutationFn: (question: string) => submitSimulationCopilot({
      question,
      currentJobId,
      currentConfig: manifest?.config ?? config,
    }),
    onSuccess: response => {
      setCopilotResponse(response)
    },
  })

  const publishMutation = useMutation({
    mutationFn: async (input: {
      contextKey: string
      title: string
      takeaway: string
      author: string
    }) => {
      if (!manifest) {
        throw new Error('Run an exact simulation before publishing a community note.')
      }

      const created = await createExploration({
        query: copilotQuestion.trim() || `What stands out in this exact ${manifest.config.paradigm} run?`,
        summary: copilotResponse?.summary ?? defaultSimulationSummary(manifest),
        blocks: defaultSimulationContributionBlocks(
          manifest,
          copilotResponse?.blocks?.length
            ? copilotResponse.blocks
            : overviewBlocks.length > 0
              ? overviewBlocks
              : parsedBlocks,
        ),
        followUps: copilotResponse?.suggestedPrompts ?? [],
        model: copilotResponse?.model ?? 'exact-simulation',
        cached: copilotResponse?.cached ?? manifest.cacheHit,
        surface: 'simulation',
      })

      return await publishExploration(created.id, {
        title: input.title,
        takeaway: input.takeaway,
        author: input.author || undefined,
      })
    },
    onSuccess: (published, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
      setPublishedSimulationKey(variables.contextKey)
      setPublishedSimulationExplorationId(published.id)
    },
  })

  const jobQuery = useQuery({
    queryKey: ['simulation-job', currentJobId],
    queryFn: () => getSimulationJob(currentJobId!),
    enabled: Boolean(currentJobId),
  })

  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    staleTime: 30_000,
  })

  const manifestQuery = useQuery({
    queryKey: ['simulation-manifest', currentJobId],
    queryFn: () => getSimulationManifest(currentJobId!),
    enabled: jobQuery.data?.status === 'completed' && !jobQuery.data?.manifest,
  })

  const manifest = jobQuery.data?.manifest ?? manifestQuery.data ?? null
  const availableOverviewBundles = manifest?.overviewBundles ?? []
  const overviewBundleOptions = availableOverviewBundles.length > 0 ? availableOverviewBundles : OVERVIEW_BUNDLES

  const overviewBundleQueries = useQueries({
    queries: availableOverviewBundles.map(bundle => ({
      queryKey: ['simulation-overview-bundle', currentJobId, bundle.bundle, bundle.sha256],
      queryFn: () => getSimulationOverviewBundle(currentJobId!, bundle.bundle),
      enabled: Boolean(currentJobId),
      staleTime: Infinity,
    })),
  })

  const selectedOverviewBundleIndex = availableOverviewBundles.findIndex(bundle => bundle.bundle === selectedBundle)
  const selectedOverviewBundleInfo = overviewBundleOptions.find(bundle => bundle.bundle === selectedBundle) ?? null
  const selectedOverviewBundleMetrics = isManifestOverviewBundle(selectedOverviewBundleInfo)
    ? selectedOverviewBundleInfo
    : null
  const overviewBlocks = selectedOverviewBundleIndex >= 0
    ? overviewBundleQueries[selectedOverviewBundleIndex]?.data ?? []
    : []
  const isOverviewLoading = selectedOverviewBundleIndex >= 0
    ? (overviewBundleQueries[selectedOverviewBundleIndex]?.isFetching ?? false)
    : false

  useEffect(() => {
    if (!manifest) return
    if (selectedArtifactName) return
    const nextArtifact = selectDefaultArtifact(manifest.artifacts)
    if (nextArtifact) {
      setSelectedArtifactName(nextArtifact)
    }
  }, [manifest, selectedArtifactName])

  useEffect(() => {
    if (!manifest?.overviewBundles?.length) return
    if (manifest.overviewBundles.some(bundle => bundle.bundle === selectedBundle)) return
    startTransition(() => {
      setSelectedBundle(manifest.overviewBundles[0]!.bundle)
    })
  }, [manifest, selectedBundle])

  const selectedArtifact = useMemo(
    () => manifest?.artifacts.find(artifact => artifact.name === selectedArtifactName) ?? null,
    [manifest, selectedArtifactName],
  )

  const artifactQuery = useQuery({
    queryKey: ['simulation-artifact', currentJobId, selectedArtifactName],
    queryFn: () => getSimulationArtifact(currentJobId!, selectedArtifactName!),
    enabled: Boolean(currentJobId && selectedArtifactName && selectedArtifact?.renderable),
    staleTime: Infinity,
  })
  const selectedArtifactRawText = artifactQuery.data ?? null

  useEffect(() => {
    if (!selectedArtifact || !selectedArtifactRawText || !workerRef.current) {
      return
    }

    const cacheKey = selectedArtifact.sha256
    const cachedBlocks = parsedArtifactCache[cacheKey] ?? readSessionArtifactBlocks(cacheKey)
    if (cachedBlocks) {
      if (!parsedArtifactCache[cacheKey]) {
        setParsedArtifactCache(previous => ({
          ...previous,
          [cacheKey]: cachedBlocks,
        }))
      }
      setParsedBlocks(cachedBlocks)
      setParseError(null)
      setIsParsing(false)
      return
    }

    const worker = workerRef.current
    const requestId = ++workerRequestIdRef.current
    setIsParsing(true)
    setParseError(null)

    const handleMessage = (event: MessageEvent<WorkerSuccess | WorkerFailure>) => {
      if (event.data.id !== requestId) return
      worker.removeEventListener('message', handleMessage as EventListener)
      if (event.data.ok) {
        const nextBlocks = event.data.blocks
        setParsedBlocks(nextBlocks)
        setParsedArtifactCache(previous => ({
          ...previous,
          [cacheKey]: nextBlocks,
        }))
        writeSessionArtifactBlocks(cacheKey, nextBlocks)
        setParseError(null)
      } else {
        setParsedBlocks([])
        setParseError(event.data.error)
      }
      setIsParsing(false)
    }

    worker.addEventListener('message', handleMessage as EventListener)
    worker.postMessage({
      id: requestId,
      artifact: {
        name: selectedArtifact.name,
        label: selectedArtifact.label,
        kind: selectedArtifact.kind,
      },
      rawText: selectedArtifactRawText,
    })

    return () => {
      worker.removeEventListener('message', handleMessage as EventListener)
    }
  }, [parsedArtifactCache, selectedArtifact, selectedArtifactRawText])

  const status: RunnerStatus = submitMutation.isPending
    ? 'submitting'
    : jobQuery.data?.status ?? 'idle'

  const onSubmit = () => {
    publishMutation.reset()
    setPublishedSimulationKey(null)
    setPublishedSimulationExplorationId(null)
    submitMutation.mutate(config)
  }

  const onCancel = () => {
    if (!currentJobId) return
    cancelMutation.mutate(currentJobId)
  }

  const onSelectArtifact = (artifactName: string) => {
    startTransition(() => {
      setSelectedArtifactName(artifactName)
      setParsedBlocks([])
      setParseError(null)
    })
  }

  const copyToClipboard = async (text: string, kind: 'config' | 'run') => {
    await navigator.clipboard.writeText(text)
    setCopyState(kind)
    window.setTimeout(() => {
      setCopyState(previous => (previous === kind ? null : previous))
    }, COPY_RESET_DELAY_MS)
  }

  const onExportData = async () => {
    if (!manifest) return

    if (exportResetTimeoutRef.current != null) {
      window.clearTimeout(exportResetTimeoutRef.current)
      exportResetTimeoutRef.current = null
    }

    setExportState('exporting')
    setExportError(null)

    try {
      const loadedArtifacts = await Promise.all(
        manifest.artifacts.map(async artifact => ({
          artifact,
          content: await getSimulationArtifact(manifest.jobId, artifact.name),
        })),
      )

      const filename = [
        'simulation',
        manifest.config.paradigm.toLowerCase(),
        `${manifest.config.validators}v`,
        `${manifest.config.slots}s`,
        manifest.jobId,
      ].join('-') + '.zip'

      await downloadSimulationExportArchive(filename, manifest, loadedArtifacts)
      setExportState('done')
      exportResetTimeoutRef.current = window.setTimeout(() => {
        setExportState('idle')
        exportResetTimeoutRef.current = null
      }, COPY_RESET_DELAY_MS)
    } catch (error) {
      setExportState('idle')
      setExportError(
        error instanceof Error
          ? error.message
          : 'Unable to prepare the export package for this exact run.',
      )
    }
  }

  const canCancel = jobQuery.data?.status === 'queued' || jobQuery.data?.status === 'running'
  const copilotAvailable = apiHealthQuery.data?.anthropicEnabled ?? false
  const copilotPromptSuggestions = copilotResponse?.suggestedPrompts?.length
    ? copilotResponse.suggestedPrompts
    : manifest
      ? [
          'Show the core outcomes bundle from this exact run.',
          'Explain why these regions dominate in this exact result.',
          'What is the nearest paper-backed follow-up to run next?',
        ]
      : [
          'Set up the paper baseline SSP run (10,000 slots, 0.002 ETH).',
          'Mirror that paper baseline for MSP so I can compare the paradigms.',
          'Hold the paradigm fixed and switch from latency-aligned to latency-misaligned sources.',
          'Load the real Ethereum validator start and explain what should change.',
        ]

  const paperComparability = describePaperComparability(config)
  const simulationPublishContextKey = manifest ? `simulation:${currentJobId ?? manifest.jobId}` : null
  const simulationPublishTitle = manifest
    ? `${manifest.config.paradigm} exact run: ${paperScenarioLabels(manifest.config)[0] ?? 'custom scenario'}`
    : ''
  const simulationPublishTakeaway = manifest
    ? copilotResponse?.summary ?? defaultSimulationSummary(manifest)
    : ''
  const showPendingRunSurface = Boolean(currentJobId)
    && !manifest
    && (status === 'submitting' || status === 'queued' || status === 'running' || status === 'completed')
  const simulationPublished = simulationPublishContextKey !== null && publishedSimulationKey === simulationPublishContextKey

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-base font-semibold text-text-primary">Simulation</h1>

        <div className="grid w-full grid-cols-2 rounded-[1rem] border border-border-subtle bg-white p-1 lg:inline-flex lg:w-auto lg:rounded-full lg:p-0.5">
          <button
            onClick={() => setSurfaceMode('research')}
            className={`rounded-full px-3 py-2 text-center text-xs font-medium transition-colors lg:py-1.5 ${surfaceMode === 'research' ? 'bg-accent text-white' : 'text-text-primary hover:bg-surface-active'}`}
          >
            Published scenarios
          </button>
          <button
            onClick={() => setSurfaceMode('lab')}
            className={`rounded-full px-3 py-2 text-center text-xs font-medium transition-colors lg:py-1.5 ${surfaceMode === 'lab' ? 'bg-accent text-white' : 'text-text-primary hover:bg-surface-active'}`}
          >
            Run exact experiment
          </button>
        </div>
      </div>

      <div className="mb-5">
        <ModeBanner
          eyebrow="Mode"
          title={surfaceMode === 'research' ? 'Published research scenarios' : 'Experimental exact run'}
          detail={surfaceMode === 'research'
            ? 'This side stays on the frozen researcher datasets and viewer contract. It is for reproducing the published scenarios, not inventing new ones.'
            : 'This side runs fresh exact simulations with the same engine. Use it for bounded comparisons, then publish a community note only after you have read the manifest and artifacts.'}
          tone={surfaceMode === 'research' ? 'canonical' : 'experimental'}
        />
      </div>

      {surfaceMode === 'research' ? (
        <ResearchDemoSurface
          catalogScriptUrl={`${APP_BASE_URL}/research-demo/assets/research-catalog.js`}
          viewerBaseUrl={`${APP_BASE_URL}/research-demo`}
        />
      ) : (
        <>
      <SimulationWorkflowRail
        status={status}
        hasManifest={Boolean(manifest)}
        published={simulationPublished}
      />
      <div className="lab-stage-hero p-6 mb-6">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
          <div>
            <div className="lab-section-title">Experimental Runner</div>
            <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-text-primary sm:text-[2rem]">
              Run a bounded exact experiment, then read the result without leaving the page.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Configure a scenario, watch queue and execution state, then inspect the manifest and artifacts in the same surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {paperScenarioLabels(config).map(label => (
                <span key={label} className="lab-chip bg-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Default posture</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Fast iteration first</div>
              <div className="mt-2 text-xs leading-5 text-muted">
                Starts smaller than the paper catalog so the exact loop stays responsive while you tune the scenario.
              </div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Paper-scale ceiling</div>
              <div className="mt-2 text-sm font-medium text-text-primary">1,000 validators · 10,000 slots</div>
              <div className="mt-2 text-xs leading-5 text-muted">
                Matches the upper scale of the published frozen runs when you want closer comparability.
              </div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Current config</div>
              <div className="mt-2 text-sm font-medium text-text-primary">
                {config.paradigm} · {config.validators.toLocaleString()} validators
              </div>
              <div className="mt-2 text-xs leading-5 text-muted">
                {config.slots.toLocaleString()} slots, {formatEthValue(config.migrationCost)} migration cost, {config.slotTime}s slot time.
              </div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Comparability</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{paperComparability.title}</div>
              <div className="mt-2 text-xs leading-5 text-muted">
                {paperComparability.detail}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lab-stage-soft p-5 mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="lab-section-title">Quick Presets</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              Load a reference scenario, then tune from there.
            </div>
          </div>
          <div className="max-w-2xl text-xs leading-5 text-muted">
            Presets jump to the paper-style scenario family. The default surface still opens smaller than the frozen 10,000-slot baseline so iteration remains fast.
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset.config)}
              className="lab-option-card text-left px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-border-hover hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                  <div className="mt-2 text-xs leading-5 text-muted">{preset.description}</div>
                </div>
                <span className="rounded-full border border-border-subtle bg-white/80 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-text-faint">
                  Load
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <SimConfigPanel
        config={config}
        onConfigChange={updateConfig}
        onSubmit={onSubmit}
        onReset={resetConfig}
        isSubmitting={submitMutation.isPending}
        canCancel={canCancel}
        onCancel={onCancel}
        paperScenarioLabels={paperScenarioLabels(config)}
        paperComparability={paperComparability}
        runnerStatus={status}
        onJumpToRunner={currentJobId ? jumpToRunner : undefined}
      />

      <div ref={runnerFocusRef} className="scroll-mt-24">
        {(currentJobId || submitMutation.isError) && (
          <SimJobStatus
            status={status}
            jobData={jobQuery.data ?? null}
            submitError={(submitMutation.error as Error | null) ?? null}
            cancelError={(cancelMutation.error as Error | null) ?? null}
          />
        )}

        {showPendingRunSurface && (
          <PendingRunSurface
            status={status}
            jobData={jobQuery.data ?? null}
            config={config}
          />
        )}
      </div>

      <SimCopilotPanel
        copilotQuestion={copilotQuestion}
        onQuestionChange={setCopilotQuestion}
        onAsk={question => copilotMutation.mutate(question)}
        onApplyConfig={setConfig}
        copilotResponse={copilotResponse}
        copilotAvailable={copilotAvailable}
        isHealthLoading={apiHealthQuery.isLoading}
        isMutating={copilotMutation.isPending}
        mutationError={(copilotMutation.error as Error | null) ?? null}
        hasManifest={Boolean(manifest)}
        promptSuggestions={copilotPromptSuggestions}
      />

      {manifest && (
        <>
          <SimResultsPanel
            manifest={manifest}
            overviewBundleOptions={overviewBundleOptions}
            selectedBundle={selectedBundle}
            onSelectBundle={setSelectedBundle}
            selectedOverviewBundleMetrics={selectedOverviewBundleMetrics}
            overviewBlocks={overviewBlocks}
            isOverviewLoading={isOverviewLoading}
            selectedArtifact={selectedArtifact}
            selectedArtifactName={selectedArtifactName}
            onSelectArtifact={onSelectArtifact}
            isArtifactFetching={artifactQuery.isFetching}
            isParsing={isParsing}
            parseError={parseError}
            parsedBlocks={parsedBlocks}
            copyState={copyState}
            exportState={exportState}
            exportError={exportError}
            onCopy={copyToClipboard}
            onExportData={onExportData}
          />

          {simulationPublishContextKey && (
            <ContributionComposer
              key={simulationPublishContextKey}
              sourceLabel="Publish this exact run as a community note"
              defaultTitle={simulationPublishTitle}
              defaultTakeaway={simulationPublishTakeaway}
              helperText="Only intentionally published exact-run notes appear on the community surface. Add your own title and takeaway so the public note reflects what you saw in the artifacts, not just the default system summary."
              publishLabel="Publish human-authored note"
              successLabel="Published human-authored note"
              viewPublishedLabel="Open Community"
              published={simulationPublished}
              isPublishing={publishMutation.isPending}
              error={(publishMutation.error as Error | null)?.message ?? null}
              onViewPublished={publishedSimulationExplorationId && onOpenCommunityExploration
                ? () => onOpenCommunityExploration(publishedSimulationExplorationId)
                : onTabChange
                  ? () => onTabChange('history')
                  : undefined}
              onPublish={payload => publishMutation.mutate({
                contextKey: simulationPublishContextKey,
                ...payload,
              })}
            />
          )}
        </>
      )}
      {onTabChange && (
        <Wayfinder links={[
          { label: 'Explore findings', hint: 'Curated lenses, guided questions, and paper-backed interpretation', onClick: () => onTabChange('explore') },
          { label: 'Browse community notes', hint: 'See human-framed notes from paper readings and exact runs', onClick: () => onTabChange('history') },
          { label: 'Read the paper', hint: 'Full editorial reading guide', onClick: () => onTabChange('paper') },
        ]} />
      )}
        </>
      )}
    </div>
  )
}
