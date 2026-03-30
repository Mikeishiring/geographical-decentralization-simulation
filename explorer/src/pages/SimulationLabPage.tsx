import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { ExactLabIntro } from '../components/simulation/ExactLabIntro'
import { ExactSimulationAnalyticsPanel } from '../components/simulation/ExactSimulationAnalyticsPanel'
import { SimConfigPanel } from '../components/simulation/SimConfigPanel'
import { SimCopilotPanel } from '../components/simulation/SimCopilotPanel'
import { SimJobStatus } from '../components/simulation/SimJobStatus'
import { ResearchDemoSurface } from '../components/simulation/ResearchDemoSurface'
import { SimResultsPanel } from '../components/simulation/SimResultsPanel'
import { useExactSimulationAnalytics } from '../components/simulation/useExactSimulationAnalytics'
import {
  COPY_RESET_DELAY_MS,
  DEFAULT_CONFIG,
  OVERVIEW_BUNDLES,
  describePaperComparability,
  paperScenarioLabels,
  readOrCreateClientId,
  readSessionArtifactBlocks,
  writeSessionArtifactBlocks,
} from '../components/simulation/simulation-constants'
import {
  defaultAnalyticsQueryMetricForView,
  type AnalyticsCompareMode,
  type AnalyticsDeckView,
  type AnalyticsQueryMetric,
} from '../components/simulation/simulation-analytics'
import { createExploration, getApiHealth, publishExploration } from '../lib/api'
import { downloadBlobFile, downloadSimulationExportArchive } from '../lib/simulation-export'
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
  type SimulationCopilotResponse,
  type SimulationConfig,
  type SimulationJob,
} from '../lib/simulation-api'
import type { Block } from '../types/blocks'
import type { SimulationArtifactBundle } from '../types/simulation-view'
import type {
  RunnerStatus,
  SurfaceMode,
  WorkerFailure,
  WorkerSuccess,
} from '../components/simulation/simulation-lab-types'
import { readInitialSimulationLabState, resolveAppBaseUrl } from '../components/simulation/simulation-lab-helpers'
import {
  PendingRunSurface,
} from '../components/simulation/PendingRunSurface'
import {
  defaultSimulationContributionBlocks,
  defaultSimulationSummary,
  isManifestOverviewBundle,
  selectDefaultArtifact,
} from '../components/simulation/pending-run-helpers'
import {
  buildSimulationLabUrl,
} from '../components/simulation/simulation-lab-comparison'

export function SimulationLabPage({
  onOpenCommunityExploration,
  onTabChange,
}: {
  onOpenCommunityExploration?: (explorationId: string) => void
  onTabChange?: (tab: TabId) => void
} = {}) {
  const initialLabState = useMemo(() => readInitialSimulationLabState(), [])
  const appBaseUrl = resolveAppBaseUrl()
  const researchCatalogScriptUrl = `${appBaseUrl}/research-demo/assets/research-catalog.js`
  const researchViewerBaseUrl = `${appBaseUrl}/research-demo`
  const queryClient = useQueryClient()
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(initialLabState.surfaceMode)
  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG })
  const [clientId] = useState(readOrCreateClientId)
  const [currentJobId, setCurrentJobId] = useState<string | null>(initialLabState.jobId ?? null)
  const [exactAnalyticsView, setExactAnalyticsView] = useState<AnalyticsDeckView>(initialLabState.analyticsView ?? 'concentration')
  const [exactAnalyticsMetric, setExactAnalyticsMetric] = useState<AnalyticsQueryMetric>(
    initialLabState.analyticsMetric ?? defaultAnalyticsQueryMetricForView(initialLabState.analyticsView ?? 'concentration'),
  )
  const [exactAnalyticsCompareMode, setExactAnalyticsCompareMode] = useState<AnalyticsCompareMode>(
    initialLabState.analyticsCompareMode ?? 'absolute',
  )
  const [exactAnalyticsRequestedSlot, setExactAnalyticsRequestedSlot] = useState<number | null>(initialLabState.analyticsSlot ?? null)
  const [exactComparisonPath, setExactComparisonPath] = useState<string | null>(initialLabState.comparisonPath ?? null)
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
    const nextUrl = buildSimulationLabUrl({
      surfaceMode,
      currentJobId,
      analyticsView: exactAnalyticsView,
      analyticsMetric: exactAnalyticsMetric,
      analyticsCompareMode: exactAnalyticsCompareMode,
      analyticsSlot: exactAnalyticsRequestedSlot,
      comparisonPath: exactComparisonPath,
    })
    if (!nextUrl) return
    window.history.replaceState({}, '', nextUrl)
  }, [
    currentJobId,
    exactAnalyticsCompareMode,
    exactAnalyticsMetric,
    exactAnalyticsRequestedSlot,
    exactAnalyticsView,
    exactComparisonPath,
    surfaceMode,
  ])

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
      setSurfaceMode('lab')
      setCurrentJobId(job.id)
      setExactAnalyticsRequestedSlot(null)
      setExactComparisonPath(null)
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

  const exactAnalytics = useExactSimulationAnalytics({
    surfaceMode,
    currentJobId,
    manifest,
    config,
    appBaseUrl,
    researchCatalogScriptUrl,
    researchViewerBaseUrl,
    analyticsView: exactAnalyticsView,
    analyticsMetric: exactAnalyticsMetric,
    analyticsCompareMode: exactAnalyticsCompareMode,
    requestedSlot: exactAnalyticsRequestedSlot,
    comparisonPath: exactComparisonPath,
    onRequestedSlotChange: setExactAnalyticsRequestedSlot,
    onAnalyticsMetricChange: setExactAnalyticsMetric,
    onAnalyticsCompareModeChange: setExactAnalyticsCompareMode,
  })

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

  const handleCopyExactAnalyticsUrl = async (targetUrl = exactAnalytics.shareUrl) => {
    if (!targetUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(targetUrl)
  }

  const handleCopyExactAnalyticsJson = async () => {
    if (!exactAnalytics.exportJson || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(exactAnalytics.exportJson)
  }

  const handleDownloadExactAnalyticsExport = (format: 'json' | 'csv') => {
    const content = format === 'json' ? exactAnalytics.exportJson : exactAnalytics.exportCsv
    if (!content) return

    const filename = `${currentJobId ? `exact-${currentJobId.slice(0, 8)}` : 'exact-run'}-${exactAnalyticsView}-${exactAnalyticsMetric}-${exactAnalyticsCompareMode}.${format}`
    downloadBlobFile(
      filename,
      new Blob([content], {
        type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
      }),
    )
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
  const showSurfaceOptions = true
  const pageTitle = surfaceMode === 'research' ? 'Published Paper Replay' : 'Simulation'
  const pageSubtitle = surfaceMode === 'research'
    ? 'The precomputed paper replay is already live. Read, compare, and annotate the published evidence directly on the page.'
    : 'Configure and inspect a bounded exact run.'
  const surfaceOptions = [
    {
      id: 'research' as const,
      title: 'Published scenarios',
      eyebrow: 'Recommended first',
      detail: 'Read the checked-in replay, inspect the analytics desk, and use the guide against frozen evidence already tied to the paper.',
      chips: ['Immediate', 'Paper-backed', 'Shareable view'],
    },
    {
      id: 'lab' as const,
      title: 'Run exact experiment',
      eyebrow: 'When you need fresh evidence',
      detail: 'Launch a new bounded run with the exact engine, then inspect the manifest, artifacts, and optional guide before publishing anything.',
      chips: ['Slower', 'Exact engine', 'Fresh manifest'],
    },
  ] as const

  return (
    <div>
      <div className={cn('mb-6', surfaceMode === 'research' ? 'space-y-2' : 'space-y-4')}>
        <div className="flex min-w-0 items-start gap-2.5 lg:items-center">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent lg:mt-0" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
            <p className="mt-1 text-xs leading-5 text-muted">
              {pageSubtitle}
            </p>
          </div>
        </div>

        {showSurfaceOptions ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {surfaceOptions.map(option => {
                const isActive = surfaceMode === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => setSurfaceMode(option.id)}
                    className={cn(
                      'rounded-2xl border px-4 py-4 text-left transition-all',
                      isActive
                        ? 'border-accent bg-white shadow-[0_18px_34px_rgba(15,23,42,0.06)]'
                        : 'border-rule bg-surface-active hover:border-border-hover hover:bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">{option.eyebrow}</div>
                        <div className="mt-2 text-sm font-medium text-text-primary">{option.title}</div>
                      </div>
                      {isActive ? (
                        <span className="rounded-full bg-accent px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-white">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted">{option.detail}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {option.chips.map(chip => (
                        <span key={chip} className="lab-chip">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="text-xs leading-5 text-muted">
              Published scenarios keep the paper, analytics, and replay guide on one fixed evidence surface. The exact lab is for reproducing or extending the research with a fresh bounded run.
            </div>
          </>
        ) : null}
      </div>

      {surfaceMode === 'research' ? (
        <ResearchDemoSurface
          catalogScriptUrl={researchCatalogScriptUrl}
          viewerBaseUrl={researchViewerBaseUrl}
          onOpenCommunityExploration={onOpenCommunityExploration}
          onTabChange={onTabChange}
        />
      ) : (
        <>
          <ExactLabIntro
            config={config}
            comparabilityTitle={paperComparability.title}
            onApplyPreset={applyPreset}
          />

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
          />

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

              <ExactSimulationAnalyticsPanel
                surfaceMode={surfaceMode}
                currentJobId={currentJobId}
                analyticsView={exactAnalyticsView}
                analyticsMetric={exactAnalyticsMetric}
                analyticsCompareMode={exactAnalyticsCompareMode}
                analyticsRequestedSlot={exactAnalyticsRequestedSlot}
                comparisonPath={exactComparisonPath}
                analytics={exactAnalytics}
                onAnalyticsViewChange={setExactAnalyticsView}
                onAnalyticsMetricChange={setExactAnalyticsMetric}
                onAnalyticsCompareModeChange={setExactAnalyticsCompareMode}
                onAnalyticsRequestedSlotChange={setExactAnalyticsRequestedSlot}
                onComparisonPathChange={setExactComparisonPath}
                onCopyShareUrl={targetUrl => void handleCopyExactAnalyticsUrl(targetUrl)}
                onCopyQueryJson={() => void handleCopyExactAnalyticsJson()}
                onDownloadExport={handleDownloadExactAnalyticsExport}
              />

              {simulationPublishContextKey && (
                <ContributionComposer
                  key={simulationPublishContextKey}
                  sourceLabel="Share your findings from this run"
                  defaultTitle={simulationPublishTitle}
                  defaultTakeaway={simulationPublishTakeaway}
                  helperText="Only intentionally published exact-run notes appear on the community surface. Add your own title and takeaway so the public note reflects what you saw in the artifacts, not just the default guide phrasing."
                  publishLabel="Publish human-authored note"
                  successLabel="Published human-authored note"
                  viewPublishedLabel="Open Community"
                  published={publishedSimulationKey === simulationPublishContextKey}
                  isPublishing={publishMutation.isPending}
                  error={(publishMutation.error as Error | null)?.message ?? null}
                  onViewPublished={publishedSimulationExplorationId && onOpenCommunityExploration
                    ? () => onOpenCommunityExploration(publishedSimulationExplorationId)
                    : onTabChange
                      ? () => onTabChange('community')
                      : undefined}
                  onPublish={payload => publishMutation.mutate({
                    contextKey: simulationPublishContextKey,
                    ...payload,
                  })}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
