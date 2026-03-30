import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { SimConfigPanel } from '../components/simulation/SimConfigPanel'
import { SimCopilotPanel } from '../components/simulation/SimCopilotPanel'
import { SimJobStatus } from '../components/simulation/SimJobStatus'
import { ResearchDemoSurface } from '../components/simulation/ResearchDemoSurface'
import { SimulationAnalyticsDesk } from '../components/simulation/SimulationAnalyticsDesk'
import { SimResultsPanel } from '../components/simulation/SimResultsPanel'
import {
  COPY_RESET_DELAY_MS,
  DEFAULT_CONFIG,
  OVERVIEW_BUNDLES,
  PRESETS,
  describePaperComparability,
  formatNumber,
  paperScenarioLabels,
  readOrCreateClientId,
  readSessionArtifactBlocks,
  writeSessionArtifactBlocks,
} from '../components/simulation/simulation-constants'
import {
  ANALYTICS_VIEW_OPTIONS,
  buildAnalyticsBlocks,
  buildAnalyticsExportBundle,
  buildAnalyticsExportCsv,
  buildAnalyticsMetricCards,
  clampSlotIndex,
  parseAnalyticsDeckView,
  totalSlotsFromPayload,
  type AnalyticsDeckView,
  type PublishedAnalyticsPayload,
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
  type SimulationArtifact,
  type SimulationCopilotResponse,
  type SimulationConfig,
  type SimulationJob,
  type SimulationManifest,
  type SimulationOverviewBundle,
} from '../lib/simulation-api'
import type { Block, SourceBlock } from '../types/blocks'
import type { SimulationArtifactBundle } from '../types/simulation-view'
import type {
  PublishedDatasetRecommendation,
  ResearchCatalog,
  ResearchDatasetEntry,
  RunnerStatus,
  SurfaceMode,
  WorkerFailure,
  WorkerSuccess,
} from '../components/simulation/simulation-lab-types'
import { readInitialSimulationLabState, resolveAppBaseUrl } from '../components/simulation/simulation-lab-helpers'
import {
  defaultSimulationContributionBlocks,
  defaultSimulationSummary,
  EXACT_ANALYTICS_ARTIFACT_NAME,
  isManifestOverviewBundle,
  PendingRunSurface,
  selectDefaultArtifact,
} from '../components/simulation/PendingRunSurface'
import {
  alignComparisonSlot,
  buildSimulationLabUrl,
  fetchPublishedAnalyticsPayload,
  fetchResearchCatalog,
  formatPublishedDatasetLabel,
  recommendPublishedComparisonDataset,
  sortComparisonCandidates,
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
  const [exactAnalyticsRequestedSlot, setExactAnalyticsRequestedSlot] = useState<number | null>(initialLabState.analyticsSlot ?? null)
  const [exactComparisonPath, setExactComparisonPath] = useState<string | null>(initialLabState.comparisonPath ?? null)
  const [hasManualExactComparisonSelection, setHasManualExactComparisonSelection] = useState(Boolean(initialLabState.comparisonPath))
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
      analyticsSlot: exactAnalyticsRequestedSlot,
      comparisonPath: exactComparisonPath,
    })
    if (!nextUrl) return
    window.history.replaceState({}, '', nextUrl)
  }, [currentJobId, exactAnalyticsRequestedSlot, exactAnalyticsView, exactComparisonPath, surfaceMode])

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
      setHasManualExactComparisonSelection(false)
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

  const researchCatalogQuery = useQuery({
    queryKey: ['research-catalog', researchCatalogScriptUrl],
    queryFn: () => fetchResearchCatalog(researchCatalogScriptUrl),
    enabled: surfaceMode === 'lab',
    staleTime: Infinity,
  })

  const manifestQuery = useQuery({
    queryKey: ['simulation-manifest', currentJobId],
    queryFn: () => getSimulationManifest(currentJobId!),
    enabled: jobQuery.data?.status === 'completed' && !jobQuery.data?.manifest,
  })

  const manifest = jobQuery.data?.manifest ?? manifestQuery.data ?? null
  const exactAnalyticsArtifact = manifest?.artifacts.find(artifact => artifact.name === EXACT_ANALYTICS_ARTIFACT_NAME) ?? null
  const exactAnalyticsPayloadQuery = useQuery({
    queryKey: ['simulation-analytics-payload', currentJobId, exactAnalyticsArtifact?.sha256 ?? ''],
    queryFn: async () => JSON.parse(
      await getSimulationArtifact(currentJobId!, EXACT_ANALYTICS_ARTIFACT_NAME),
    ) as PublishedAnalyticsPayload,
    enabled: Boolean(currentJobId && exactAnalyticsArtifact),
    staleTime: Infinity,
  })
  const exactAnalyticsPayload = exactAnalyticsPayloadQuery.data ?? null
  const comparisonReferenceConfig = manifest?.config ?? config
  const publishedResearchDatasets = useMemo(
    () => (researchCatalogQuery.data?.datasets ?? []).filter(dataset => dataset.evaluation !== 'Test'),
    [researchCatalogQuery.data],
  )
  const recommendedComparison = useMemo(
    () => recommendPublishedComparisonDataset(comparisonReferenceConfig, publishedResearchDatasets),
    [comparisonReferenceConfig, publishedResearchDatasets],
  )
  const exactComparisonCandidates = useMemo(
    () => sortComparisonCandidates(
      publishedResearchDatasets,
      recommendedComparison?.dataset ?? null,
      comparisonReferenceConfig.paradigm,
    ),
    [comparisonReferenceConfig.paradigm, publishedResearchDatasets, recommendedComparison],
  )
  const selectedComparisonDataset = useMemo(
    () => exactComparisonCandidates.find(dataset => dataset.path === exactComparisonPath)
      ?? recommendedComparison?.dataset
      ?? exactComparisonCandidates[0]
      ?? null,
    [exactComparisonCandidates, exactComparisonPath, recommendedComparison],
  )
  const comparisonDatasetUrl = selectedComparisonDataset
    ? `${researchViewerBaseUrl}/${selectedComparisonDataset.path}`
    : null
  const comparisonAnalyticsQuery = useQuery({
    queryKey: ['published-analytics-payload', researchViewerBaseUrl, selectedComparisonDataset?.path ?? ''],
    queryFn: () => fetchPublishedAnalyticsPayload(researchViewerBaseUrl, selectedComparisonDataset!.path),
    enabled: surfaceMode === 'lab' && Boolean(selectedComparisonDataset?.path),
    staleTime: Infinity,
  })
  const comparisonAnalyticsPayload = comparisonAnalyticsQuery.data ?? null
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

  useEffect(() => {
    if (exactComparisonCandidates.length === 0) return

    const currentSelectionIsValid = exactComparisonPath != null
      && exactComparisonCandidates.some(dataset => dataset.path === exactComparisonPath)
    if (currentSelectionIsValid && hasManualExactComparisonSelection) return

    const recommendedPath = recommendedComparison?.dataset.path ?? exactComparisonCandidates[0]!.path
    if (!currentSelectionIsValid || (!hasManualExactComparisonSelection && exactComparisonPath !== recommendedPath)) {
      setExactComparisonPath(recommendedPath)
    }
  }, [
    exactComparisonCandidates,
    exactComparisonPath,
    hasManualExactComparisonSelection,
    recommendedComparison,
  ])

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

  const exactAnalyticsTotalSlots = totalSlotsFromPayload(exactAnalyticsPayload)
  const exactAnalyticsSlot = exactAnalyticsRequestedSlot == null
    ? Math.max(0, exactAnalyticsTotalSlots - 1)
    : clampSlotIndex(exactAnalyticsRequestedSlot, exactAnalyticsTotalSlots)
  const exactAnalyticsShareUrl = useMemo(
    () => buildSimulationLabUrl({
      surfaceMode,
      currentJobId,
      analyticsView: exactAnalyticsView,
      analyticsSlot: exactAnalyticsRequestedSlot == null ? null : exactAnalyticsSlot,
      comparisonPath: selectedComparisonDataset?.path ?? exactComparisonPath,
    }),
    [
      currentJobId,
      exactAnalyticsRequestedSlot,
      exactAnalyticsSlot,
      exactAnalyticsView,
      exactComparisonPath,
      selectedComparisonDataset,
      surfaceMode,
    ],
  )
  const comparisonAnalyticsTotalSlots = totalSlotsFromPayload(comparisonAnalyticsPayload)
  const comparisonAnalyticsSlot = alignComparisonSlot(
    exactAnalyticsSlot,
    exactAnalyticsTotalSlots,
    comparisonAnalyticsTotalSlots,
  )
  const comparisonProgressPercent = exactAnalyticsTotalSlots <= 1
    ? 100
    : (exactAnalyticsSlot / Math.max(1, exactAnalyticsTotalSlots - 1)) * 100
  const exactAnalyticsSourceRefs = useMemo<readonly SourceBlock['refs'][number][]>(() => {
    if (!manifest || !currentJobId) return []

    const artifactUrl = `${appBaseUrl}/api/simulations/${currentJobId}/artifacts/${encodeURIComponent(EXACT_ANALYTICS_ARTIFACT_NAME)}`
    const manifestUrl = `${appBaseUrl}/api/simulations/${currentJobId}/manifest`

    return [
      {
        label: 'Exact analytics view',
        section: `job ${currentJobId.slice(0, 8)}`,
        url: exactAnalyticsShareUrl || undefined,
      },
      {
        label: 'Published-style analytics payload',
        section: EXACT_ANALYTICS_ARTIFACT_NAME,
        url: artifactUrl,
      },
      {
        label: 'Exact manifest',
        section: manifest.configHash,
        url: manifestUrl,
      },
      ...(selectedComparisonDataset && comparisonDatasetUrl ? [{
        label: 'Published foil dataset',
        section: selectedComparisonDataset.path,
        url: comparisonDatasetUrl,
      }] : []),
    ]
  }, [
    appBaseUrl,
    comparisonDatasetUrl,
    currentJobId,
    exactAnalyticsShareUrl,
    manifest,
    selectedComparisonDataset,
  ])
  const exactAnalyticsMetricCards = useMemo(
    () => buildAnalyticsMetricCards({
      analyticsView: exactAnalyticsView,
      payload: exactAnalyticsPayload,
      slot: exactAnalyticsSlot,
    }),
    [exactAnalyticsPayload, exactAnalyticsSlot, exactAnalyticsView],
  )
  const exactAnalyticsBlocks = useMemo<readonly Block[]>(
    () => exactAnalyticsPayload
      ? buildAnalyticsBlocks({
          analyticsView: exactAnalyticsView,
          primaryPayload: exactAnalyticsPayload,
          primarySlot: exactAnalyticsSlot,
          sourceRefs: exactAnalyticsSourceRefs,
          primaryLabel: 'Exact run',
          comparisonPayload: comparisonAnalyticsPayload,
          comparisonSlot: comparisonAnalyticsSlot,
          comparisonLabel: selectedComparisonDataset
            ? `${selectedComparisonDataset.evaluation} / ${selectedComparisonDataset.paradigm}`
            : 'Published foil',
        })
      : [],
    [
      comparisonAnalyticsPayload,
      comparisonAnalyticsSlot,
      exactAnalyticsPayload,
      exactAnalyticsSlot,
      exactAnalyticsSourceRefs,
      exactAnalyticsView,
      selectedComparisonDataset,
    ],
  )
  const exactAnalyticsExportBundle = useMemo(
    () => exactAnalyticsPayload
      ? buildAnalyticsExportBundle({
          analyticsView: exactAnalyticsView,
          queryMetric: exactAnalyticsMetric,
          compareMode: exactAnalyticsCompareMode,
          primaryPayload: exactAnalyticsPayload,
          primarySlot: exactAnalyticsSlot,
          sourceRefs: exactAnalyticsSourceRefs,
          primaryLabel: 'Exact run',
          comparisonPayload: comparisonAnalyticsPayload,
          comparisonSlot: comparisonAnalyticsSlot,
          comparisonLabel: selectedComparisonDataset
            ? `${selectedComparisonDataset.evaluation} / ${selectedComparisonDataset.paradigm}`
            : 'Published foil',
          shareUrl: exactAnalyticsShareUrl ?? undefined,
        })
      : null,
    [
      comparisonAnalyticsPayload,
      comparisonAnalyticsSlot,
      exactAnalyticsCompareMode,
      exactAnalyticsMetric,
      exactAnalyticsPayload,
      exactAnalyticsShareUrl,
      exactAnalyticsSlot,
      exactAnalyticsSourceRefs,
      exactAnalyticsView,
      selectedComparisonDataset,
    ],
  )
  const exactAnalyticsExportJson = useMemo(
    () => exactAnalyticsExportBundle ? JSON.stringify(exactAnalyticsExportBundle, null, 2) : null,
    [exactAnalyticsExportBundle],
  )
  const exactAnalyticsExportCsv = useMemo(
    () => exactAnalyticsExportBundle ? buildAnalyticsExportCsv(exactAnalyticsExportBundle) : null,
    [exactAnalyticsExportBundle],
  )
  const exactAnalyticsStatusMessage = !manifest
    ? null
    : exactAnalyticsPayloadQuery.isLoading
      ? 'Loading the published-style analytics payload for this exact run...'
      : exactAnalyticsPayloadQuery.isError
        ? (exactAnalyticsPayloadQuery.error as Error).message
        : !exactAnalyticsPayload
          ? 'This exact run did not emit the published-style analytics payload yet.'
          : null
  const exactComparisonStatusMessage = researchCatalogQuery.isLoading
    ? 'Loading the frozen paper catalog for comparison...'
    : researchCatalogQuery.isError
      ? (researchCatalogQuery.error as Error).message
      : !selectedComparisonDataset
        ? 'Select a published scenario to compare against this exact run.'
        : comparisonAnalyticsQuery.isLoading
          ? `Loading ${formatPublishedDatasetLabel(selectedComparisonDataset)}...`
          : comparisonAnalyticsQuery.isError
            ? (comparisonAnalyticsQuery.error as Error).message
            : comparisonAnalyticsPayload
              ? `Aligned to slot ${comparisonAnalyticsSlot + 1} of ${comparisonAnalyticsTotalSlots.toLocaleString()} (${formatNumber(comparisonProgressPercent, 1)}% through the frozen run).`
              : 'Choose a published foil to add a frozen-paper comparison table.'
  const exactComparisonRecommendationDetail = selectedComparisonDataset?.path === recommendedComparison?.dataset.path
    ? recommendedComparison?.reason ?? 'This selection is the closest frozen paper foil for the active exact run.'
    : recommendedComparison
      ? `Recommended default: ${formatPublishedDatasetLabel(recommendedComparison.dataset)}.`
      : 'Select any checked-in paper scenario as the foil for this exact run.'

  useEffect(() => {
    if (exactAnalyticsRequestedSlot == null) return
    const clamped = clampSlotIndex(exactAnalyticsRequestedSlot, exactAnalyticsTotalSlots)
    if (clamped !== exactAnalyticsRequestedSlot) {
      setExactAnalyticsRequestedSlot(clamped)
    }
  }, [exactAnalyticsRequestedSlot, exactAnalyticsTotalSlots])

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

  const handleCopyExactAnalyticsUrl = async () => {
    if (!exactAnalyticsShareUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(exactAnalyticsShareUrl)
  }

  const handleCopyExactAnalyticsJson = async () => {
    if (!exactAnalyticsExportJson || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(exactAnalyticsExportJson)
  }

  const handleDownloadExactAnalyticsExport = (format: 'json' | 'csv') => {
    const content = format === 'json' ? exactAnalyticsExportJson : exactAnalyticsExportCsv
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
  const showSurfaceOptions = surfaceMode === 'lab' || Boolean(currentJobId)
  const pageTitle = surfaceMode === 'research' ? 'Published Paper Replay' : 'Simulation'
  const pageSubtitle = surfaceMode === 'research'
    ? 'The precomputed paper replay is already live. Read, compare, and adjust the published evidence directly in-page.'
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
      <div className="mb-6 space-y-4">
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
        ) : (
          <div className="rounded-2xl border border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92))] px-4 py-4">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Published-first workspace</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              The checked-in replay is already on screen, so this page opens on evidence instead of setup.
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              <span className="lab-chip">Live replay</span>
              <span className="lab-chip">Paper-linked</span>
              <span className="lab-chip">No run required</span>
            </div>
          </div>
        )}
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
      <div className="lab-stage-hero p-6 mb-6">
        <div className="flex flex-col gap-5">
          <div>
            <div className="lab-section-title">Run your own simulation</div>
            <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-text-primary sm:text-[2rem]">
              Run fresh exact simulations with the same engine used in the paper.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Configure a bounded exact run, watch the queue and execution state, then inspect the manifest and artifacts without leaving the page.
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

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {config.paradigm} · {config.validators.toLocaleString()} validators · {config.slots.toLocaleString()} slots
            </span>
            <span className="text-border-subtle">|</span>
            <span>{paperComparability.title}</span>
          </div>
        </div>
      </div>

      <div className="lab-stage-soft p-5 mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="lab-section-title">How to use this surface</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              Configure, inspect, then publish only if the evidence deserves a public note.
            </div>
          </div>
          <div className="max-w-2xl text-xs leading-5 text-muted">
            The exact runner is strongest when it stays bounded. Start from a reference setup, read the manifest and artifacts, then decide whether there is a note worth sharing.
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              title: '1. Load or tune a bounded run',
              detail: 'Use a preset or adjust the exact config until the scenario matches the comparison you actually want to make.',
            },
            {
              title: '2. Read the run before asking the guide',
              detail: 'Start with the manifest, overview bundles, and renderable artifacts. The guide is optional and should stay secondary to the exact result.',
            },
            {
              title: '3. Share only after you have a takeaway',
              detail: 'A community note should summarize what this exact run shows and why it matters, not just restate the default assistant phrasing.',
            },
          ].map(item => (
            <div key={item.title} className="lab-option-card px-4 py-4">
              <div className="text-sm font-medium text-text-primary">{item.title}</div>
              <div className="mt-2 text-xs leading-5 text-muted">{item.detail}</div>
            </div>
          ))}
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
              className="lab-option-card text-left px-4 py-4 transition-all hover:border-border-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                  <div className="mt-2 text-xs leading-5 text-muted">{preset.description}</div>
                </div>
                <span className="rounded-full border border-rule bg-white/80 px-2 py-1 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
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

          <SimulationAnalyticsDesk
            description="This exact run now emits the same published-style analytics payload as the frozen research datasets, so you can inspect it through the same query desk without leaving the lab."
            copyLabel="Copy exact analytics view"
            onCopyShareUrl={() => void handleCopyExactAnalyticsUrl()}
            onCopyQueryJson={() => void handleCopyExactAnalyticsJson()}
            onDownloadQueryJson={() => handleDownloadExactAnalyticsExport('json')}
            onDownloadQueryCsv={() => handleDownloadExactAnalyticsExport('csv')}
            analyticsView={exactAnalyticsView}
            onAnalyticsViewChange={setExactAnalyticsView}
            analyticsViewOptions={ANALYTICS_VIEW_OPTIONS}
            statusMessage={exactAnalyticsStatusMessage}
            metricCards={exactAnalyticsMetricCards}
            blocks={exactAnalyticsBlocks}
            queryHint="These are the exact-run metrics exported into the shared analytics contract. Start with the measurement itself, then decide whether the run deserves interpretation or publication."
          >
            {exactAnalyticsPayload ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-xl border border-rule bg-white px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Slot posture</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        Slot {exactAnalyticsSlot + 1} of {exactAnalyticsTotalSlots.toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted">
                        Scrub the exact run directly from the analytics desk. The cards, sources, and comparison table stay bound to this slot.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'First', slot: 0 },
                        { label: 'Mid', slot: Math.max(0, Math.floor((exactAnalyticsTotalSlots - 1) / 2)) },
                        { label: 'Final', slot: Math.max(0, exactAnalyticsTotalSlots - 1) },
                      ].map(option => (
                        <button
                          key={option.label}
                          onClick={() => setExactAnalyticsRequestedSlot(option.slot)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            exactAnalyticsSlot === option.slot
                              ? 'border-accent bg-surface-active text-accent'
                              : 'border-rule bg-white text-text-primary hover:border-border-hover',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, exactAnalyticsTotalSlots - 1)}
                    step={1}
                    value={exactAnalyticsSlot}
                    onChange={event => setExactAnalyticsRequestedSlot(Number.parseInt(event.target.value, 10))}
                    className="mt-4 w-full accent-[var(--accent,#2563EB)]"
                  />
                  <div className="mt-3 text-xs leading-5 text-muted">
                    {comparisonAnalyticsPayload
                      ? `The published foil is aligned to the same progress point: slot ${comparisonAnalyticsSlot + 1} of ${comparisonAnalyticsTotalSlots.toLocaleString()}.`
                      : 'Add a published foil to see the exact run against a frozen paper result at the same progress point.'}
                  </div>
                </div>

                <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
                  <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Published foil</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">
                    {selectedComparisonDataset ? formatPublishedDatasetLabel(selectedComparisonDataset) : 'No published scenario selected'}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-muted">
                    {selectedComparisonDataset?.metadata?.description ?? 'Choose a checked-in paper dataset so the exact run can be compared against frozen evidence in the same desk.'}
                  </div>

                  <label className="mt-4 block text-xs text-muted">
                    Compare against
                  </label>
                  <select
                    value={selectedComparisonDataset?.path ?? ''}
                    onChange={event => {
                      setHasManualExactComparisonSelection(true)
                      setExactComparisonPath(event.target.value || null)
                    }}
                    disabled={exactComparisonCandidates.length === 0}
                    className="mt-1.5 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exactComparisonCandidates.length > 0 ? (
                      exactComparisonCandidates.map(dataset => (
                        <option key={dataset.path} value={dataset.path}>
                          {formatPublishedDatasetLabel(dataset)}
                        </option>
                      ))
                    ) : (
                      <option value="">Published catalog unavailable</option>
                    )}
                  </select>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-rule bg-white px-3 py-3">
                      <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Recommendation</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        {recommendedComparison ? formatPublishedDatasetLabel(recommendedComparison.dataset) : 'Awaiting catalog'}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted">{exactComparisonRecommendationDetail}</div>
                    </div>
                    <div className="rounded-xl border border-rule bg-white px-3 py-3">
                      <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Alignment</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        {comparisonAnalyticsPayload
                          ? `Slot ${comparisonAnalyticsSlot + 1} / ${comparisonAnalyticsTotalSlots.toLocaleString()}`
                          : 'Waiting for foil'}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted">{exactComparisonStatusMessage}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={comparisonDatasetUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'inline-flex items-center justify-center rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover',
                        !comparisonDatasetUrl && 'pointer-events-none opacity-60',
                      )}
                    >
                      Open dataset JSON
                    </a>
                    <button
                      onClick={() => {
                        setHasManualExactComparisonSelection(false)
                        setExactComparisonPath(recommendedComparison?.dataset.path ?? null)
                      }}
                      disabled={!recommendedComparison}
                      className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Restore recommendation
                    </button>
                  </div>

                  <div className="mt-4 text-xs leading-5 text-muted">
                    Shared exact-analytics links preserve the active foil dataset, analytics view, and slot posture.
                  </div>
                </div>
              </div>
            ) : null}
          </SimulationAnalyticsDesk>

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
