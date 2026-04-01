import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { BlockCanvas } from '../../explore/BlockCanvas'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../simulation-constants'
import type { PublishedDatasetPayload } from '../PublishedDatasetViewer'
import {
  fetchPublishedAnalyticsPayload,
  formatPublishedDatasetLabel,
} from '../simulation-lab-comparison'
import {
  ANALYTICS_QUERY_OPTIONS,
  alignSlotByProgress,
  analyticsMetricSeriesForPayload,
  buildAnalyticsBlocks,
  totalSlotsFromPayload,
  type AnalyticsDeckView,
  type AnalyticsQueryMetric,
  type AnalyticsQueryOption,
} from '../simulation-analytics'
import type { ResearchDatasetEntry } from '../simulation-lab-types'

interface PublishedDeltaIncubatorProps {
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly catalogDatasets: readonly ResearchDatasetEntry[]
  readonly viewerBaseUrl: string
}

interface DeltaSummary {
  readonly currentDelta: number | null
  readonly currentBaselineValue: number | null
  readonly currentVariantValue: number | null
  readonly finalDelta: number | null
  readonly peakDelta: number | null
  readonly peakProgressPercent: number | null
}

const DEFAULT_FOCUS_METRICS: readonly AnalyticsQueryMetric[] = ['gini', 'hhi', 'liveness'] as const
const MAX_FOCUS_METRICS = 4

const DELTA_METRIC_OPTIONS: readonly AnalyticsQueryOption[] = [...new Map(
  ANALYTICS_QUERY_OPTIONS.map(option => [option.id, option] as const),
).values()]

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

function readSeriesValue(series: readonly number[] | undefined, slotIndex: number): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metricView(metric: AnalyticsQueryMetric): AnalyticsDeckView {
  return DELTA_METRIC_OPTIONS.find(option => option.id === metric)?.view ?? 'concentration'
}

function formatMetricValue(metric: AnalyticsQueryMetric, value: number | null): string {
  if (value == null) return 'N/A'
  const unit = DELTA_METRIC_OPTIONS.find(option => option.id === metric)?.unit
  switch (unit) {
    case 'percent':
      return `${formatNumber(value, 1)}%`
    case 'milliseconds':
      return `${formatNumber(value, 1)} ms`
    case 'eth':
      return `${formatNumber(value, 4)} ETH`
    case 'count':
      return Math.round(value).toLocaleString()
    case 'index':
    default:
      return formatNumber(value, 3)
  }
}

function formatMetricDelta(metric: AnalyticsQueryMetric, value: number | null): string {
  if (value == null) return 'N/A'
  const prefix = value > 0 ? '+' : ''
  const unit = DELTA_METRIC_OPTIONS.find(option => option.id === metric)?.unit
  switch (unit) {
    case 'percent':
      return `${prefix}${formatNumber(value, 1)} pts`
    case 'milliseconds':
      return `${prefix}${formatNumber(value, 1)} ms`
    case 'eth':
      return `${prefix}${formatNumber(value, 4)} ETH`
    case 'count':
      return `${prefix}${Math.round(value).toLocaleString()}`
    case 'index':
    default:
      return `${prefix}${formatNumber(value, 3)}`
  }
}

function buildDeltaSummary(
  metric: AnalyticsQueryMetric,
  baselinePayload: PublishedDatasetPayload | null,
  variantPayload: PublishedDatasetPayload | null,
  baselineSlotIndex: number,
  variantSlotIndex: number,
): DeltaSummary | null {
  if (!baselinePayload || !variantPayload) return null

  const baselineSeries = analyticsMetricSeriesForPayload(baselinePayload, metric)
  const variantSeries = analyticsMetricSeriesForPayload(variantPayload, metric)
  if (!baselineSeries?.length || !variantSeries?.length) return null

  const baselineTotalSlots = totalSlotsFromPayload(baselinePayload)
  const variantTotalSlots = totalSlotsFromPayload(variantPayload)
  const currentBaselineValue = readSeriesValue(baselineSeries, baselineSlotIndex)
  const currentVariantValue = readSeriesValue(variantSeries, variantSlotIndex)
  const finalBaselineValue = readSeriesValue(baselineSeries, baselineTotalSlots - 1)
  const finalVariantValue = readSeriesValue(variantSeries, variantTotalSlots - 1)

  let peakDelta: number | null = null
  let peakProgressPercent: number | null = null

  for (let baselineAlignedSlot = 0; baselineAlignedSlot < baselineTotalSlots; baselineAlignedSlot += 1) {
    const variantAlignedSlot = alignSlotByProgress(baselineAlignedSlot, baselineTotalSlots, variantTotalSlots)
    const baselineValue = readSeriesValue(baselineSeries, baselineAlignedSlot)
    const variantValue = readSeriesValue(variantSeries, variantAlignedSlot)
    if (baselineValue == null || variantValue == null) continue

    const delta = variantValue - baselineValue
    if (peakDelta == null || Math.abs(delta) > Math.abs(peakDelta)) {
      peakDelta = delta
      peakProgressPercent = baselineTotalSlots <= 1
        ? 100
        : (baselineAlignedSlot / Math.max(1, baselineTotalSlots - 1)) * 100
    }
  }

  return {
    currentDelta: currentVariantValue != null && currentBaselineValue != null
      ? currentVariantValue - currentBaselineValue
      : null,
    currentBaselineValue,
    currentVariantValue,
    finalDelta: finalVariantValue != null && finalBaselineValue != null
      ? finalVariantValue - finalBaselineValue
      : null,
    peakDelta,
    peakProgressPercent,
  }
}

export function PublishedDeltaIncubator({
  selectedDataset,
  catalogDatasets,
  viewerBaseUrl,
}: PublishedDeltaIncubatorProps) {
  const [baselinePath, setBaselinePath] = useState('')
  const [variantPath, setVariantPath] = useState('')
  const [sharedProgress, setSharedProgress] = useState(0)
  const [focusMetrics, setFocusMetrics] = useState<AnalyticsQueryMetric[]>([...DEFAULT_FOCUS_METRICS])
  const previousFamilySignatureRef = useRef('')

  const familyDatasets = useMemo(
    () => sortFamilyDatasets(selectedDataset, catalogDatasets),
    [catalogDatasets, selectedDataset],
  )
  const familySignature = useMemo(
    () => familyDatasets.map(entry => entry.path).join('|'),
    [familyDatasets],
  )

  useEffect(() => {
    if (!selectedDataset) {
      setBaselinePath('')
      setVariantPath('')
      setSharedProgress(0)
      previousFamilySignatureRef.current = ''
      return
    }

    const allowedPaths = new Set(familyDatasets.map(entry => entry.path))
    const fallbackBaseline = selectedDataset.path
    const fallbackVariant = familyDatasets.find(entry => entry.path !== fallbackBaseline)?.path ?? fallbackBaseline

    setBaselinePath(current => allowedPaths.has(current) ? current : fallbackBaseline)
    setVariantPath(current => (
      current
      && allowedPaths.has(current)
      && current !== fallbackBaseline
        ? current
        : fallbackVariant
    ))

    if (previousFamilySignatureRef.current !== familySignature) {
      setSharedProgress(0)
      previousFamilySignatureRef.current = familySignature
    }
  }, [familyDatasets, familySignature, selectedDataset])

  const resolvedBaselinePath = useMemo(() => {
    if (!selectedDataset) return ''
    const allowedPaths = new Set(familyDatasets.map(entry => entry.path))
    return allowedPaths.has(baselinePath) ? baselinePath : selectedDataset.path
  }, [baselinePath, familyDatasets, selectedDataset])

  const resolvedVariantPath = useMemo(() => {
    if (!selectedDataset) return ''
    const fallback = familyDatasets.find(entry => entry.path !== resolvedBaselinePath)?.path ?? resolvedBaselinePath
    const allowedPaths = new Set(familyDatasets.map(entry => entry.path))
    if (variantPath && allowedPaths.has(variantPath) && variantPath !== resolvedBaselinePath) {
      return variantPath
    }
    return fallback
  }, [familyDatasets, resolvedBaselinePath, selectedDataset, variantPath])

  const baselineDataset = useMemo(
    () => familyDatasets.find(entry => entry.path === resolvedBaselinePath) ?? null,
    [familyDatasets, resolvedBaselinePath],
  )
  const variantDataset = useMemo(
    () => familyDatasets.find(entry => entry.path === resolvedVariantPath) ?? null,
    [familyDatasets, resolvedVariantPath],
  )

  const datasetQueries = useQueries({
    queries: [baselineDataset, variantDataset]
      .filter((dataset): dataset is ResearchDatasetEntry => Boolean(dataset))
      .map(dataset => ({
        queryKey: ['roadmap-incubator-delta', viewerBaseUrl, dataset.path],
        queryFn: () => fetchPublishedAnalyticsPayload(viewerBaseUrl, dataset.path),
        staleTime: Infinity,
      })),
  })

  const payloadByPath = useMemo(() => {
    const datasets = [baselineDataset, variantDataset].filter((dataset): dataset is ResearchDatasetEntry => Boolean(dataset))
    return new Map(
      datasets.map((dataset, index) => [
        dataset.path,
        (datasetQueries[index]?.data as PublishedDatasetPayload | undefined) ?? null,
      ] as const),
    )
  }, [baselineDataset, datasetQueries, variantDataset])

  const baselinePayload = baselineDataset ? payloadByPath.get(baselineDataset.path) ?? null : null
  const variantPayload = variantDataset ? payloadByPath.get(variantDataset.path) ?? null : null
  const baselineTotalSlots = totalSlotsFromPayload(baselinePayload)
  const variantTotalSlots = totalSlotsFromPayload(variantPayload)
  const baselineSlotIndex = baselineTotalSlots <= 1
    ? 0
    : Math.max(0, Math.min(baselineTotalSlots - 1, Math.round(sharedProgress * (baselineTotalSlots - 1))))
  const variantSlotIndex = variantTotalSlots <= 1
    ? 0
    : Math.max(0, Math.min(variantTotalSlots - 1, Math.round(sharedProgress * (variantTotalSlots - 1))))

  const summaryByMetric = useMemo(() => new Map(
    focusMetrics.map(metric => [
      metric,
      buildDeltaSummary(metric, baselinePayload, variantPayload, baselineSlotIndex, variantSlotIndex),
    ] as const),
  ), [baselinePayload, baselineSlotIndex, focusMetrics, variantPayload, variantSlotIndex])

  const detailBlocks = useMemo(() => {
    if (!baselinePayload || !variantPayload || !baselineDataset || !variantDataset) return []

    return focusMetrics.flatMap(metric => buildAnalyticsBlocks({
      analyticsView: metricView(metric),
      queryMetric: metric,
      compareMode: 'delta',
      primaryPayload: variantPayload,
      primarySlot: variantSlotIndex,
      primaryLabel: `${variantDataset.result} (variant)`,
      comparisonPayload: baselinePayload,
      comparisonSlot: baselineSlotIndex,
      comparisonLabel: `${baselineDataset.result} (baseline)`,
    }))
  }, [baselineDataset, baselinePayload, baselineSlotIndex, focusMetrics, variantDataset, variantPayload, variantSlotIndex])

  const errorMessages = datasetQueries.flatMap(query => (
    query.error instanceof Error ? [query.error.message] : []
  ))
  const loading = datasetQueries.some(query => query.isLoading)

  const toggleMetric = (metric: AnalyticsQueryMetric) => {
    setFocusMetrics(current => {
      if (current.includes(metric)) {
        return current.length <= 1 ? current : current.filter(candidate => candidate !== metric)
      }
      if (current.length >= MAX_FOCUS_METRICS) {
        return [...current.slice(1), metric]
      }
      return [...current, metric]
    })
  }

  const swapBaselineAndVariant = () => {
    if (!resolvedBaselinePath || !resolvedVariantPath || resolvedBaselinePath === resolvedVariantPath) return
    setBaselinePath(resolvedVariantPath)
    setVariantPath(resolvedBaselinePath)
  }

  if (!selectedDataset) return null

  if (familyDatasets.length < 2) {
    return (
      <div className="lab-stage overflow-hidden p-0">
        <div className="border-b border-rule bg-white/96 px-5 py-4">
          <div className="text-xs text-muted">Roadmap incubator</div>
          <div className="mt-1 text-sm text-text-primary">1c. Published delta comparison</div>
          <div className="mt-2 text-xs leading-5 text-muted">
            This dormant delta surface needs at least two frozen scenarios in the same evaluation family before it can stage a baseline-versus-variant comparison.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="text-xs text-muted">Roadmap incubator</div>
        <div className="mt-1 text-sm text-text-primary">1c. Published delta comparison</div>
        <div className="mt-2 text-xs leading-5 text-muted">
          Dormant baseline-versus-variant delta workstation for frozen paper scenarios. It stays fully disconnected from the live results UI until manual activation.
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Baseline</div>
            <select
              value={resolvedBaselinePath}
              onChange={event => setBaselinePath(event.target.value)}
              className="mt-2 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary"
            >
              {familyDatasets.map(dataset => (
                <option key={`baseline-${dataset.path}`} value={dataset.path}>
                  {formatPublishedDatasetLabel(dataset)}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Variant</div>
            <select
              value={resolvedVariantPath}
              onChange={event => setVariantPath(event.target.value)}
              className="mt-2 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary"
            >
              {familyDatasets
                .filter(dataset => dataset.path !== resolvedBaselinePath)
                .map(dataset => (
                  <option key={`variant-${dataset.path}`} value={dataset.path}>
                    {formatPublishedDatasetLabel(dataset)}
                  </option>
                ))}
            </select>
          </label>

          <button
            onClick={swapBaselineAndVariant}
            className="rounded-xl border border-rule bg-white px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
          >
            Swap
          </button>
        </div>

        <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Aligned progress</div>
              <div className="mt-1 text-sm text-text-primary">{formatNumber(sharedProgress * 100, 1)}%</div>
            </div>
            <div className="text-xs leading-5 text-muted">
              Baseline slot {baselineSlotIndex + 1} of {baselineTotalSlots.toLocaleString()}.
              Variant slot {variantSlotIndex + 1} of {variantTotalSlots.toLocaleString()}.
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(sharedProgress * 1000)}
            onChange={event => setSharedProgress(Number(event.target.value) / 1000)}
            className="mt-4 w-full"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {[0, 25, 50, 75, 100].map(marker => (
              <button
                key={`marker-${marker}`}
                onClick={() => setSharedProgress(marker / 100)}
                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                {marker}%
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Focus metrics</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DELTA_METRIC_OPTIONS.map(option => {
              const active = focusMetrics.includes(option.id)
              return (
                <button
                  key={option.id}
                  onClick={() => toggleMetric(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        {loading && detailBlocks.length === 0 ? (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            Loading dormant delta datasets...
          </div>
        ) : null}

        {errorMessages.map(message => (
          <div key={message} className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-danger">
            {message}
          </div>
        ))}

        <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
          {focusMetrics.map(metric => {
            const option = DELTA_METRIC_OPTIONS.find(candidate => candidate.id === metric)
            const summary = summaryByMetric.get(metric) ?? null
            return (
              <div key={`summary-${metric}`} className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">
                  {option?.view ?? 'comparison'}
                </div>
                <div className="mt-2 text-sm font-medium text-text-primary">{option?.label ?? metric}</div>
                <div className="mt-3 text-2xl font-semibold text-text-primary">
                  {formatMetricDelta(metric, summary?.currentDelta ?? null)}
                </div>
                <div className="mt-1 text-xs text-muted">Current variant minus baseline</div>
                <div className="mt-3 grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-faint">Baseline now</span>
                    <span className="font-medium text-text-primary">{formatMetricValue(metric, summary?.currentBaselineValue ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-faint">Variant now</span>
                    <span className="font-medium text-text-primary">{formatMetricValue(metric, summary?.currentVariantValue ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-faint">Final delta</span>
                    <span className="font-medium text-text-primary">{formatMetricDelta(metric, summary?.finalDelta ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-faint">Peak divergence</span>
                    <span className="font-medium text-text-primary">
                      {summary?.peakDelta != null && summary.peakProgressPercent != null
                        ? `${formatMetricDelta(metric, summary.peakDelta)} @ ${formatNumber(summary.peakProgressPercent, 1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {detailBlocks.length > 0 ? (
          <BlockCanvas blocks={detailBlocks} showExport={false} />
        ) : (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            Select a baseline, variant, and at least one focus metric to stage this hidden delta surface.
          </div>
        )}
      </div>
    </div>
  )
}
