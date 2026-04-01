import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../simulation-constants'
import {
  PublishedDatasetViewer,
  type PublishedDatasetDataState,
  type PublishedDatasetPayload,
} from '../PublishedDatasetViewer'
import {
  fetchPublishedAnalyticsPayload,
  formatPublishedDatasetLabel,
} from '../simulation-lab-comparison'
import {
  alignSlotByProgress,
  analyticsMetricSeriesForPayload,
  totalSlotsFromPayload,
} from '../simulation-analytics'
import type { ResearchDatasetEntry } from '../simulation-lab-types'

interface PublishedSideBySideIncubatorProps {
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly catalogDatasets: readonly ResearchDatasetEntry[]
  readonly viewerBaseUrl: string
}

type ComparisonMetric = 'gini' | 'hhi' | 'liveness'

interface PeakGapSummary {
  readonly metric: ComparisonMetric
  readonly delta: number
  readonly progressPercent: number
}

const DEFAULT_VIEWER_SETTINGS = {
  theme: 'auto' as const,
  step: 10 as const,
  autoplay: false,
}

const COMPARISON_METRICS: readonly ComparisonMetric[] = ['gini', 'hhi', 'liveness'] as const

const METRIC_LABELS: Readonly<Record<ComparisonMetric, string>> = {
  gini: 'Gini',
  hhi: 'HHI',
  liveness: 'Liveness',
}

function uniqueOrdered(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function metadataSortValue(dataset: ResearchDatasetEntry): readonly [number, number] {
  const metadata = dataset.metadata
  const candidates = [metadata?.cost, metadata?.gamma, metadata?.delta, metadata?.cutoff]

  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return [index, value]
    }
  }

  return [Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY]
}

function sortFamilyDatasets(
  selectedDataset: ResearchDatasetEntry | null,
  catalogDatasets: readonly ResearchDatasetEntry[],
): ResearchDatasetEntry[] {
  if (!selectedDataset) return []

  return [...catalogDatasets]
    .filter(entry => entry.evaluation === selectedDataset.evaluation)
    .sort((left, right) => {
      if (left.path === selectedDataset.path) return -1
      if (right.path === selectedDataset.path) return 1
      if (left.paradigm !== right.paradigm) return left.paradigm.localeCompare(right.paradigm)

      const [leftRank, leftValue] = metadataSortValue(left)
      const [rightRank, rightValue] = metadataSortValue(right)
      if (leftRank !== rightRank) return leftRank - rightRank
      if (leftValue !== rightValue) return leftValue - rightValue

      return left.result.localeCompare(right.result)
    })
}

function normalizeSelection(primaryPath: string, paths: readonly string[]): string[] {
  return uniqueOrdered([primaryPath, ...paths.filter(path => path !== primaryPath)]).slice(0, 4)
}

function buildDefaultPaths(
  selectedDataset: ResearchDatasetEntry | null,
  catalogDatasets: readonly ResearchDatasetEntry[],
): string[] {
  if (!selectedDataset) return []
  return sortFamilyDatasets(selectedDataset, catalogDatasets)
    .map(entry => entry.path)
    .slice(0, 4)
}

function readSeriesValue(series: readonly number[] | undefined, slotIndex: number): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMetricValue(metric: ComparisonMetric, value: number | null): string {
  if (value == null) return '—'
  return metric === 'liveness'
    ? formatNumber(value, 2)
    : formatNumber(value, 4)
}

function formatMetricDelta(metric: ComparisonMetric, delta: number | null): string {
  if (delta == null) return '—'
  const prefix = delta > 0 ? '+' : ''
  return metric === 'liveness'
    ? `${prefix}${formatNumber(delta, 2)} pts`
    : `${prefix}${formatNumber(delta, 4)}`
}

function strongestCurrentGap(
  deltas: Readonly<Record<ComparisonMetric, number | null>>,
): { metric: ComparisonMetric; delta: number } | null {
  let strongest: { metric: ComparisonMetric; delta: number } | null = null

  for (const metric of COMPARISON_METRICS) {
    const delta = deltas[metric]
    if (delta == null) continue
    if (!strongest || Math.abs(delta) > Math.abs(strongest.delta)) {
      strongest = { metric, delta }
    }
  }

  return strongest
}

function strongestPeakGap(
  primaryPayload: PublishedDatasetPayload | null,
  comparisonPayload: PublishedDatasetPayload | null,
): PeakGapSummary | null {
  if (!primaryPayload || !comparisonPayload) return null

  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const comparisonTotalSlots = totalSlotsFromPayload(comparisonPayload)
  let strongest: PeakGapSummary | null = null

  for (const metric of COMPARISON_METRICS) {
    const primarySeries = analyticsMetricSeriesForPayload(primaryPayload, metric)
    const comparisonSeries = analyticsMetricSeriesForPayload(comparisonPayload, metric)
    if (!primarySeries?.length || !comparisonSeries?.length) continue

    for (let primarySlotIndex = 0; primarySlotIndex < primaryTotalSlots; primarySlotIndex += 1) {
      const comparisonSlotIndex = alignSlotByProgress(primarySlotIndex, primaryTotalSlots, comparisonTotalSlots)
      const primaryValue = readSeriesValue(primarySeries, primarySlotIndex)
      const comparisonValue = readSeriesValue(comparisonSeries, comparisonSlotIndex)
      if (primaryValue == null || comparisonValue == null) continue

      const delta = comparisonValue - primaryValue
      if (!strongest || Math.abs(delta) > Math.abs(strongest.delta)) {
        strongest = {
          metric,
          delta,
          progressPercent: primaryTotalSlots <= 1
            ? 100
            : (primarySlotIndex / Math.max(1, primaryTotalSlots - 1)) * 100,
        }
      }
    }
  }

  return strongest
}

export function PublishedSideBySideIncubator({
  selectedDataset,
  catalogDatasets,
  viewerBaseUrl,
}: PublishedSideBySideIncubatorProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [sharedProgress, setSharedProgress] = useState(0)
  const previousFamilySignatureRef = useRef('')

  const familyDatasets = useMemo(
    () => sortFamilyDatasets(selectedDataset, catalogDatasets),
    [catalogDatasets, selectedDataset],
  )
  const familySignature = useMemo(
    () => familyDatasets.map(entry => entry.path).join('|'),
    [familyDatasets],
  )
  const defaultPaths = useMemo(
    () => buildDefaultPaths(selectedDataset, catalogDatasets),
    [catalogDatasets, selectedDataset],
  )

  useEffect(() => {
    if (!selectedDataset) {
      setSelectedPaths([])
      setSharedProgress(0)
      previousFamilySignatureRef.current = ''
      return
    }

    const primaryPath = selectedDataset.path
    const allowedPaths = new Set(familyDatasets.map(entry => entry.path))
    setSelectedPaths(current => {
      const preserved = current.filter(path => allowedPaths.has(path))
      if (preserved.length > 0) {
        return normalizeSelection(primaryPath, preserved)
      }
      return normalizeSelection(primaryPath, defaultPaths)
    })

    if (previousFamilySignatureRef.current !== familySignature) {
      setSharedProgress(0)
      previousFamilySignatureRef.current = familySignature
    }
  }, [defaultPaths, familyDatasets, familySignature, selectedDataset])

  const activeDatasets = useMemo(
    () => selectedPaths
      .map(path => catalogDatasets.find(entry => entry.path === path) ?? null)
      .filter((entry): entry is ResearchDatasetEntry => Boolean(entry)),
    [catalogDatasets, selectedPaths],
  )

  const datasetQueries = useQueries({
    queries: activeDatasets.map(dataset => ({
      queryKey: ['roadmap-incubator-side-by-side', viewerBaseUrl, dataset.path],
      queryFn: () => fetchPublishedAnalyticsPayload(viewerBaseUrl, dataset.path),
      staleTime: Infinity,
    })),
  })

  const payloadByPath = useMemo(() => new Map(
    activeDatasets.map((dataset, index) => [
      dataset.path,
      (datasetQueries[index]?.data as PublishedDatasetPayload | undefined) ?? null,
    ] as const),
  ), [activeDatasets, datasetQueries])

  const dataStateByPath = useMemo(() => new Map(
    activeDatasets.map((dataset, index) => {
      const query = datasetQueries[index]
      const payload = payloadByPath.get(dataset.path) ?? null
      let dataState: PublishedDatasetDataState

      if (query?.isError) {
        dataState = {
          status: 'error',
          data: null,
          error: (query.error as Error).message,
        }
      } else if (payload) {
        dataState = {
          status: 'ready',
          data: payload,
          error: null,
        }
      } else {
        dataState = {
          status: 'loading',
          data: null,
          error: null,
        }
      }

      return [dataset.path, dataState] as const
    }),
  ), [activeDatasets, datasetQueries, payloadByPath])

  const datasetSlotsByPath = useMemo(() => new Map(
    activeDatasets.map(dataset => [
      dataset.path,
      totalSlotsFromPayload(payloadByPath.get(dataset.path) ?? null),
    ] as const),
  ), [activeDatasets, payloadByPath])

  const controlledSlotByPath = useMemo(() => new Map(
    activeDatasets.map(dataset => {
      const totalSlots = datasetSlotsByPath.get(dataset.path) ?? 1
      const slotIndex = totalSlots <= 1
        ? 0
        : Math.max(0, Math.min(totalSlots - 1, Math.round(sharedProgress * (totalSlots - 1))))
      return [dataset.path, slotIndex] as const
    }),
  ), [activeDatasets, datasetSlotsByPath, sharedProgress])

  const comparisonReadouts = useMemo(() => {
    const baselinePath = activeDatasets[0]?.path ?? null
    const baselinePayload = baselinePath ? payloadByPath.get(baselinePath) ?? null : null
    const baselineSlotIndex = baselinePath ? (controlledSlotByPath.get(baselinePath) ?? 0) : 0
    const baselineValues = {
      gini: readSeriesValue(analyticsMetricSeriesForPayload(baselinePayload, 'gini'), baselineSlotIndex),
      hhi: readSeriesValue(analyticsMetricSeriesForPayload(baselinePayload, 'hhi'), baselineSlotIndex),
      liveness: readSeriesValue(analyticsMetricSeriesForPayload(baselinePayload, 'liveness'), baselineSlotIndex),
    } as const

    return activeDatasets.map(dataset => {
      const payload = payloadByPath.get(dataset.path) ?? null
      const totalSlots = datasetSlotsByPath.get(dataset.path) ?? 1
      const slotIndex = controlledSlotByPath.get(dataset.path) ?? 0
      const progressPercent = totalSlots <= 1
        ? 100
        : (slotIndex / Math.max(1, totalSlots - 1)) * 100
      const values = {
        gini: readSeriesValue(analyticsMetricSeriesForPayload(payload, 'gini'), slotIndex),
        hhi: readSeriesValue(analyticsMetricSeriesForPayload(payload, 'hhi'), slotIndex),
        liveness: readSeriesValue(analyticsMetricSeriesForPayload(payload, 'liveness'), slotIndex),
      } as const
      const deltas = dataset.path === baselinePath
        ? null
        : {
            gini: values.gini != null && baselineValues.gini != null ? values.gini - baselineValues.gini : null,
            hhi: values.hhi != null && baselineValues.hhi != null ? values.hhi - baselineValues.hhi : null,
            liveness: values.liveness != null && baselineValues.liveness != null ? values.liveness - baselineValues.liveness : null,
          } as const

      return {
        path: dataset.path,
        label: formatPublishedDatasetLabel(dataset),
        slotIndex,
        totalSlots,
        progressPercent,
        values,
        status: dataStateByPath.get(dataset.path)?.status ?? 'loading',
        baseline: dataset.path === baselinePath,
        strongestCurrentGap: deltas ? strongestCurrentGap(deltas) : null,
        strongestPeakGap: dataset.path === baselinePath
          ? null
          : strongestPeakGap(baselinePayload, payload),
      }
    })
  }, [activeDatasets, controlledSlotByPath, dataStateByPath, datasetSlotsByPath, payloadByPath])

  const gridClass = activeDatasets.length >= 4
    ? 'xl:grid-cols-2 2xl:grid-cols-4'
    : activeDatasets.length === 3
      ? 'xl:grid-cols-3'
      : activeDatasets.length === 2
        ? 'xl:grid-cols-2'
        : 'xl:grid-cols-1'

  const toggleDataset = (path: string) => {
    if (!selectedDataset) return

    const primaryPath = selectedDataset.path
    setSelectedPaths(current => {
      const normalized = normalizeSelection(primaryPath, current)
      if (path === primaryPath) {
        return normalized
      }

      const others = normalized.filter(entry => entry !== primaryPath)
      if (normalized.includes(path)) {
        return normalizeSelection(primaryPath, others.filter(entry => entry !== path))
      }

      const nextOthers = others.length >= 3
        ? [...others.slice(1), path]
        : [...others, path]
      return normalizeSelection(primaryPath, nextOthers)
    })
  }

  const handleDatasetSlotChange = (datasetPath: string, nextSlotIndex: number) => {
    const totalSlots = datasetSlotsByPath.get(datasetPath) ?? 1
    const nextProgress = totalSlots <= 1
      ? 1
      : nextSlotIndex / Math.max(1, totalSlots - 1)
    setSharedProgress(Math.max(0, Math.min(1, nextProgress)))
  }

  if (!selectedDataset) return null

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="text-xs text-muted">Roadmap incubator</div>
        <div className="mt-1 text-sm text-text-primary">1b. Side-by-side published comparison</div>
        <div className="mt-2 text-xs leading-5 text-muted">
          Dormant synchronized replay columns for 2-4 frozen paper scenarios. The selected scenario is pinned as the baseline column and the whole surface stays disconnected from the live UI until manual activation.
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {familyDatasets.map(dataset => {
            const active = selectedPaths.includes(dataset.path)
            const baseline = dataset.path === selectedDataset.path
            return (
              <button
                key={dataset.path}
                onClick={() => toggleDataset(dataset.path)}
                disabled={baseline}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  baseline
                    ? 'cursor-default border-text-primary bg-text-primary text-white'
                    : active
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
                title={baseline ? 'Pinned baseline scenario' : formatPublishedDatasetLabel(dataset)}
              >
                {dataset.paradigm} · {dataset.result}{baseline ? ' · baseline' : ''}
              </button>
            )
          })}
        </div>

        <div className="rounded-xl border border-rule bg-surface-active px-4 py-3 text-xs leading-5 text-muted">
          Shared progress: <span className="font-medium text-text-primary">{formatNumber(sharedProgress * 100, 1)}%</span>.
          Moving any replay updates every active column by relative progress, so families with different slot counts stay aligned while the pinned baseline remains in view.
        </div>

        {comparisonReadouts.length > 0 ? (
          <div className={cn('grid gap-3', gridClass)}>
            {comparisonReadouts.map(readout => (
              <div key={`readout-${readout.path}`} className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">
                  {readout.baseline
                    ? 'Baseline anchor'
                    : readout.status === 'ready'
                      ? 'Comparison lane'
                      : readout.status}
                </div>
                <div className="mt-2 text-sm font-medium text-text-primary">{readout.label}</div>
                <div className="mt-1 text-xs text-muted">
                  Slot {readout.slotIndex + 1} of {readout.totalSlots.toLocaleString()} · {formatNumber(readout.progressPercent, 1)}% progress
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {COMPARISON_METRICS.map(metric => (
                    <div key={`${readout.path}-${metric}`} className="rounded-lg border border-rule bg-white px-2.5 py-2">
                      <div className="text-text-faint">{METRIC_LABELS[metric]}</div>
                      <div className="mt-1 font-medium text-text-primary">{formatMetricValue(metric, readout.values[metric])}</div>
                      <div className="mt-1 text-[11px] text-muted">
                        {readout.baseline
                          ? 'Pinned reference'
                          : `vs baseline ${formatMetricDelta(metric, readout.strongestCurrentGap?.metric === metric ? readout.strongestCurrentGap.delta : (
                            readout.values[metric] != null
                              && comparisonReadouts[0]?.values[metric] != null
                              ? readout.values[metric]! - comparisonReadouts[0]!.values[metric]!
                              : null
                          ))}`}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs leading-5 text-muted">
                  {readout.baseline
                    ? 'This focal scenario stays pinned so every other column can be interpreted as a direct relative comparison.'
                    : [
                        readout.strongestCurrentGap
                          ? `Largest current gap: ${METRIC_LABELS[readout.strongestCurrentGap.metric]} ${formatMetricDelta(readout.strongestCurrentGap.metric, readout.strongestCurrentGap.delta)}.`
                          : null,
                        readout.strongestPeakGap
                          ? `Peak aligned gap: ${METRIC_LABELS[readout.strongestPeakGap.metric]} ${formatMetricDelta(readout.strongestPeakGap.metric, readout.strongestPeakGap.delta)} at ${formatNumber(readout.strongestPeakGap.progressPercent, 1)}% progress.`
                          : null,
                      ].filter(Boolean).join(' ')}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeDatasets.length > 0 ? (
          <div className={cn('grid gap-4', gridClass)}>
            {activeDatasets.map(dataset => (
              <div key={dataset.path} className="min-w-0 rounded-xl border border-rule bg-white p-3">
                <div className="mb-3 border-b border-rule pb-3">
                  <div className="text-sm font-medium text-text-primary">
                    {dataset.evaluation} · {dataset.paradigm}
                  </div>
                  <div className="mt-1 text-xs text-muted">{dataset.result}</div>
                </div>

                <PublishedDatasetViewer
                  viewerBaseUrl={viewerBaseUrl}
                  dataset={dataset}
                  initialSettings={DEFAULT_VIEWER_SETTINGS}
                  slotIndex={controlledSlotByPath.get(dataset.path) ?? 0}
                  onSlotIndexChange={nextSlotIndex => handleDatasetSlotChange(dataset.path, nextSlotIndex)}
                  dataState={dataStateByPath.get(dataset.path) ?? null}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            Select at least one dataset to stage the side-by-side comparison surface.
          </div>
        )}
      </div>
    </div>
  )
}
