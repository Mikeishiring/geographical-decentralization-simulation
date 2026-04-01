import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  analyticsCompareModeOptions,
  analyticsMetricOptionsForView,
  buildAnalyticsBlocks,
  buildAnalyticsDashboardPresets,
  buildAnalyticsExportBundle,
  buildAnalyticsExportCsv,
  buildAnalyticsMetricCards,
  clampSlotIndex,
  defaultAnalyticsQueryMetricForView,
  totalSlotsFromPayload,
  type AnalyticsCompareMode,
  type AnalyticsDeckView,
  type AnalyticsQueryMetric,
} from './simulation-analytics'
import {
  alignComparisonSlot,
  buildSimulationLabUrl,
  fetchPublishedAnalyticsPayload,
  fetchResearchCatalog,
  formatPublishedDatasetLabel,
  recommendPublishedComparisonDataset,
  sortComparisonCandidates,
} from './simulation-lab-comparison'
import { EXACT_ANALYTICS_ARTIFACT_NAME } from './pending-run-helpers'
import { paradigmLabel } from './simulation-constants'
import type { SurfaceMode } from './simulation-lab-types'
import { getSimulationArtifact, type SimulationConfig, type SimulationManifest } from '../../lib/simulation-api'
import type { SourceBlock } from '../../types/blocks'

interface UseExactSimulationAnalyticsOptions {
  readonly surfaceMode: SurfaceMode
  readonly currentJobId: string | null
  readonly manifest: SimulationManifest | null
  readonly config: SimulationConfig
  readonly appBaseUrl: string
  readonly researchCatalogScriptUrl: string
  readonly researchViewerBaseUrl: string
  readonly analyticsView: AnalyticsDeckView
  readonly analyticsMetric: AnalyticsQueryMetric
  readonly analyticsCompareMode: AnalyticsCompareMode
  readonly requestedSlot: number | null
  readonly comparisonPath: string | null
  readonly onRequestedSlotChange: (slot: number | null) => void
  readonly onAnalyticsMetricChange: (metric: AnalyticsQueryMetric) => void
  readonly onAnalyticsCompareModeChange: (mode: AnalyticsCompareMode) => void
}

export function useExactSimulationAnalytics({
  surfaceMode,
  currentJobId,
  manifest,
  config,
  appBaseUrl,
  researchCatalogScriptUrl,
  researchViewerBaseUrl,
  analyticsView,
  analyticsMetric,
  analyticsCompareMode,
  requestedSlot,
  comparisonPath,
  onRequestedSlotChange,
  onAnalyticsMetricChange,
  onAnalyticsCompareModeChange,
}: UseExactSimulationAnalyticsOptions) {
  const exactAnalyticsArtifact = manifest?.artifacts.find(artifact => artifact.name === EXACT_ANALYTICS_ARTIFACT_NAME) ?? null

  const researchCatalogQuery = useQuery({
    queryKey: ['research-catalog', researchCatalogScriptUrl],
    queryFn: () => fetchResearchCatalog(researchCatalogScriptUrl),
    enabled: surfaceMode === 'lab',
    staleTime: Infinity,
  })

  const exactAnalyticsPayloadQuery = useQuery({
    queryKey: ['simulation-analytics-payload', currentJobId, exactAnalyticsArtifact?.sha256 ?? ''],
    queryFn: async () => JSON.parse(
      await getSimulationArtifact(currentJobId!, EXACT_ANALYTICS_ARTIFACT_NAME),
    ),
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
  const comparisonCandidates = useMemo(
    () => sortComparisonCandidates(
      publishedResearchDatasets,
      recommendedComparison?.dataset ?? null,
      comparisonReferenceConfig.paradigm,
    ),
    [comparisonReferenceConfig.paradigm, publishedResearchDatasets, recommendedComparison],
  )
  const selectedComparisonDataset = useMemo(
    () => comparisonCandidates.find(dataset => dataset.path === comparisonPath)
      ?? recommendedComparison?.dataset
      ?? comparisonCandidates[0]
      ?? null,
    [comparisonCandidates, comparisonPath, recommendedComparison],
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
  const metricOptions = useMemo(
    () => analyticsMetricOptionsForView(analyticsView),
    [analyticsView],
  )
  const compareModeOptions = useMemo(
    () => analyticsCompareModeOptions(Boolean(selectedComparisonDataset)),
    [selectedComparisonDataset],
  )
  const dashboardPresets = useMemo(
    () => buildAnalyticsDashboardPresets(Boolean(selectedComparisonDataset)),
    [selectedComparisonDataset],
  )
  const totalSlots = totalSlotsFromPayload(exactAnalyticsPayload)
  const slot = requestedSlot == null
    ? Math.max(0, totalSlots - 1)
    : clampSlotIndex(requestedSlot, totalSlots)
  const shareUrl = useMemo(
    () => buildSimulationLabUrl({
      surfaceMode,
      currentJobId,
      analyticsView,
      analyticsMetric,
      analyticsCompareMode,
      analyticsSlot: requestedSlot == null ? null : slot,
      comparisonPath: selectedComparisonDataset?.path ?? comparisonPath,
    }),
    [
      analyticsCompareMode,
      analyticsMetric,
      analyticsView,
      comparisonPath,
      currentJobId,
      requestedSlot,
      selectedComparisonDataset,
      slot,
      surfaceMode,
    ],
  )
  const comparisonTotalSlots = totalSlotsFromPayload(comparisonAnalyticsPayload)
  const comparisonSlot = alignComparisonSlot(slot, totalSlots, comparisonTotalSlots)
  const comparisonProgressPercent = totalSlots <= 1
    ? 100
    : (slot / Math.max(1, totalSlots - 1)) * 100
  const comparisonLabel = selectedComparisonDataset
    ? `${selectedComparisonDataset.evaluation} / ${paradigmLabel(selectedComparisonDataset.paradigm)}`
    : 'Published foil'

  const sourceRefs = useMemo<readonly SourceBlock['refs'][number][]>(() => {
    if (!manifest || !currentJobId) return []

    const artifactUrl = `${appBaseUrl}/api/simulations/${currentJobId}/artifacts/${encodeURIComponent(EXACT_ANALYTICS_ARTIFACT_NAME)}`
    const manifestUrl = `${appBaseUrl}/api/simulations/${currentJobId}/manifest`

    return [
      {
        label: 'Exact analytics view',
        section: `job ${currentJobId.slice(0, 8)}`,
        url: shareUrl || undefined,
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
    manifest,
    selectedComparisonDataset,
    shareUrl,
  ])

  const metricCards = useMemo(
    () => buildAnalyticsMetricCards({
      analyticsView,
      queryMetric: analyticsMetric,
      compareMode: analyticsCompareMode,
      payload: exactAnalyticsPayload,
      slot,
      comparisonPayload: comparisonAnalyticsPayload,
      comparisonSlot,
      comparisonLabel,
    }),
    [
      analyticsCompareMode,
      analyticsMetric,
      analyticsView,
      comparisonAnalyticsPayload,
      comparisonLabel,
      comparisonSlot,
      exactAnalyticsPayload,
      slot,
    ],
  )
  const blocks = useMemo(
    () => exactAnalyticsPayload
      ? buildAnalyticsBlocks({
          analyticsView,
          queryMetric: analyticsMetric,
          compareMode: analyticsCompareMode,
          primaryPayload: exactAnalyticsPayload,
          primarySlot: slot,
          sourceRefs,
          primaryLabel: 'Exact run',
          comparisonPayload: comparisonAnalyticsPayload,
          comparisonSlot,
          comparisonLabel,
        })
      : [],
    [
      analyticsCompareMode,
      analyticsMetric,
      analyticsView,
      comparisonAnalyticsPayload,
      comparisonLabel,
      comparisonSlot,
      exactAnalyticsPayload,
      slot,
      sourceRefs,
    ],
  )
  const exportBundle = useMemo(
    () => exactAnalyticsPayload
      ? buildAnalyticsExportBundle({
          analyticsView,
          queryMetric: analyticsMetric,
          compareMode: analyticsCompareMode,
          primaryPayload: exactAnalyticsPayload,
          primarySlot: slot,
          sourceRefs,
          primaryLabel: 'Exact run',
          comparisonPayload: comparisonAnalyticsPayload,
          comparisonSlot,
          comparisonLabel,
          shareUrl: shareUrl ?? undefined,
        })
      : null,
    [
      analyticsCompareMode,
      analyticsMetric,
      analyticsView,
      comparisonAnalyticsPayload,
      comparisonLabel,
      comparisonSlot,
      exactAnalyticsPayload,
      shareUrl,
      slot,
      sourceRefs,
    ],
  )
  const exportJson = useMemo(
    () => exportBundle ? JSON.stringify(exportBundle, null, 2) : null,
    [exportBundle],
  )
  const exportCsv = useMemo(
    () => exportBundle ? buildAnalyticsExportCsv(exportBundle) : null,
    [exportBundle],
  )

  const analyticsStatusMessage = !manifest
    ? null
    : exactAnalyticsPayloadQuery.isLoading
      ? 'Loading the published-style analytics payload for this exact run...'
      : exactAnalyticsPayloadQuery.isError
        ? (exactAnalyticsPayloadQuery.error as Error).message
        : !exactAnalyticsPayload
          ? 'This exact run did not emit the published-style analytics payload yet.'
          : null
  const comparisonStatusMessage = researchCatalogQuery.isLoading
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
              ? `Aligned to slot ${comparisonSlot + 1} of ${comparisonTotalSlots.toLocaleString()} (${comparisonProgressPercent.toFixed(1)}% through the frozen run).`
              : 'Choose a published foil to add a frozen-paper comparison table.'
  const comparisonRecommendationDetail = selectedComparisonDataset?.path === recommendedComparison?.dataset.path
    ? recommendedComparison?.reason ?? 'This selection is the closest frozen paper foil for the active exact run.'
    : recommendedComparison
      ? `Recommended default: ${formatPublishedDatasetLabel(recommendedComparison.dataset)}.`
      : 'Select any checked-in paper scenario as the foil for this exact run.'

  useEffect(() => {
    if (requestedSlot == null) return
    const clamped = clampSlotIndex(requestedSlot, totalSlots)
    if (clamped !== requestedSlot) {
      onRequestedSlotChange(clamped)
    }
  }, [onRequestedSlotChange, requestedSlot, totalSlots])

  useEffect(() => {
    if (metricOptions.some(option => option.id === analyticsMetric)) return
    onAnalyticsMetricChange(defaultAnalyticsQueryMetricForView(analyticsView))
  }, [analyticsMetric, analyticsView, metricOptions, onAnalyticsMetricChange])

  useEffect(() => {
    if (compareModeOptions.some(option => option.id === analyticsCompareMode)) return
    onAnalyticsCompareModeChange(compareModeOptions[0]?.id ?? 'absolute')
  }, [analyticsCompareMode, compareModeOptions, onAnalyticsCompareModeChange])

  return {
    researchCatalogQuery,
    exactAnalyticsPayloadQuery,
    comparisonAnalyticsQuery,
    exactAnalyticsPayload,
    publishedResearchDatasets,
    recommendedComparison,
    comparisonCandidates,
    selectedComparisonDataset,
    comparisonDatasetUrl,
    comparisonAnalyticsPayload,
    metricOptions,
    compareModeOptions,
    dashboardPresets,
    totalSlots,
    slot,
    shareUrl,
    comparisonTotalSlots,
    comparisonSlot,
    comparisonProgressPercent,
    comparisonLabel,
    metricCards,
    blocks,
    exportBundle,
    exportJson,
    exportCsv,
    analyticsStatusMessage,
    comparisonStatusMessage,
    comparisonRecommendationDetail,
  }
}
