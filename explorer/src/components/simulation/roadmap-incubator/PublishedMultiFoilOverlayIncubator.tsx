import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { BlockCanvas } from '../../explore/BlockCanvas'
import { cn } from '../../../lib/cn'
import {
  fetchPublishedAnalyticsPayload,
  formatPublishedDatasetLabel,
} from '../simulation-lab-comparison'
import {
  alignSlotByProgress,
  analyticsMetricSeriesForPayload,
  totalSlotsFromPayload,
} from '../simulation-analytics'
import type { PublishedDatasetPayload } from '../PublishedDatasetViewer'
import type { Block } from '../../../types/blocks'
import type { ResearchDatasetEntry } from '../simulation-lab-types'

interface PublishedMultiFoilOverlayIncubatorProps {
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly catalogDatasets: readonly ResearchDatasetEntry[]
  readonly viewerBaseUrl: string
}

type OverlayMetric =
  | 'gini'
  | 'hhi'
  | 'liveness'
  | 'mev'
  | 'proposal_times'
  | 'failed_block_proposals'
  | 'clusters'

const METRIC_OPTIONS: readonly {
  readonly id: OverlayMetric
  readonly label: string
  readonly digits: number
  readonly suffix?: string
}[] = [
  { id: 'gini', label: 'Gini', digits: 4 },
  { id: 'hhi', label: 'HHI', digits: 4 },
  { id: 'liveness', label: 'Liveness', digits: 2, suffix: '%' },
  { id: 'mev', label: 'MEV', digits: 4, suffix: ' ETH' },
  { id: 'proposal_times', label: 'Proposal time', digits: 1, suffix: ' ms' },
  { id: 'failed_block_proposals', label: 'Failed proposals', digits: 0 },
  { id: 'clusters', label: 'Clusters', digits: 0 },
] as const

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

function sortDatasets(entries: readonly ResearchDatasetEntry[]): ResearchDatasetEntry[] {
  return [...entries].sort((left, right) => {
    if (left.evaluation !== right.evaluation) return left.evaluation.localeCompare(right.evaluation)
    if (left.paradigm !== right.paradigm) return left.paradigm.localeCompare(right.paradigm)

    const [leftRank, leftValue] = metadataSortValue(left)
    const [rightRank, rightValue] = metadataSortValue(right)
    if (leftRank !== rightRank) return leftRank - rightRank
    if (leftValue !== rightValue) return leftValue - rightValue

    return left.result.localeCompare(right.result)
  })
}

function normalizeSelection(primaryPath: string, paths: readonly string[]): string[] {
  return [...new Set([primaryPath, ...paths.filter(path => path !== primaryPath)])].slice(0, 6)
}

function readSeriesValue(series: readonly number[] | undefined, slotIndex: number): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatMetricValue(metric: OverlayMetric, value: number | null): string {
  if (value == null) return 'N/A'
  const option = METRIC_OPTIONS.find(candidate => candidate.id === metric)
  if (!option) return 'N/A'
  const digits = option.digits
  const formatted = digits === 0
    ? Math.round(value).toLocaleString()
    : value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      })
  return `${formatted}${option.suffix ?? ''}`
}

function peakDivergence(
  primaryPayload: PublishedDatasetPayload | null,
  foilPayload: PublishedDatasetPayload | null,
  metric: OverlayMetric,
): { delta: number; progressPercent: number } | null {
  if (!primaryPayload || !foilPayload) return null

  const primarySeries = analyticsMetricSeriesForPayload(primaryPayload, metric)
  const foilSeries = analyticsMetricSeriesForPayload(foilPayload, metric)
  if (!primarySeries?.length || !foilSeries?.length) return null

  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const foilTotalSlots = totalSlotsFromPayload(foilPayload)
  let strongest: { delta: number; progressPercent: number } | null = null

  for (let primarySlotIndex = 0; primarySlotIndex < primaryTotalSlots; primarySlotIndex += 1) {
    const foilSlotIndex = alignSlotByProgress(primarySlotIndex, primaryTotalSlots, foilTotalSlots)
    const primaryValue = readSeriesValue(primarySeries, primarySlotIndex)
    const foilValue = readSeriesValue(foilSeries, foilSlotIndex)
    if (primaryValue == null || foilValue == null) continue

    const delta = foilValue - primaryValue
    if (!strongest || Math.abs(delta) > Math.abs(strongest.delta)) {
      strongest = {
        delta,
        progressPercent: primaryTotalSlots <= 1
          ? 100
          : (primarySlotIndex / Math.max(1, primaryTotalSlots - 1)) * 100,
      }
    }
  }

  return strongest
}

function buildOverlayBlocks(
  datasets: readonly ResearchDatasetEntry[],
  payloadByPath: ReadonlyMap<string, PublishedDatasetPayload | null>,
  metric: OverlayMetric,
  selectedPaths: readonly string[],
  sharedProgress: number,
): readonly Block[] {
  const activeDatasets = datasets.filter(dataset => selectedPaths.includes(dataset.path))
  if (activeDatasets.length === 0) return []

  const series = activeDatasets.flatMap(dataset => {
    const payload = payloadByPath.get(dataset.path) ?? null
    const values = analyticsMetricSeriesForPayload(payload, metric)
    if (!values?.length) return []

    return [{
      label: formatPublishedDatasetLabel(dataset),
      data: values.map((value, index) => ({ x: index + 1, y: value })),
    }]
  })

  if (series.length === 0) return []

  const primaryDataset = activeDatasets[0] ?? null
  const primaryPayload = primaryDataset ? payloadByPath.get(primaryDataset.path) ?? null : null
  const primarySeries = primaryPayload ? analyticsMetricSeriesForPayload(primaryPayload, metric) : undefined
  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const primarySlotIndex = primaryTotalSlots <= 1
    ? 0
    : Math.max(0, Math.min(primaryTotalSlots - 1, Math.round(sharedProgress * (primaryTotalSlots - 1))))

  const readoutRows = activeDatasets.map(dataset => {
    const payload = payloadByPath.get(dataset.path) ?? null
    const totalSlots = totalSlotsFromPayload(payload)
    const slotIndex = totalSlots <= 1
      ? 0
      : Math.max(0, Math.min(totalSlots - 1, Math.round(sharedProgress * (totalSlots - 1))))
    const currentValue = readSeriesValue(analyticsMetricSeriesForPayload(payload, metric), slotIndex)
    const finalValue = readSeriesValue(analyticsMetricSeriesForPayload(payload, metric), totalSlots - 1)
    const peak = dataset.path === primaryDataset?.path
      ? null
      : peakDivergence(primaryPayload, payload, metric)

    return [
      formatPublishedDatasetLabel(dataset),
      formatMetricValue(metric, currentValue),
      formatMetricValue(metric, finalValue),
      peak ? `${formatMetricValue(metric, peak.delta)} @ ${peak.progressPercent.toFixed(1)}%` : 'Reference',
    ]
  })

  const selectedValue = readSeriesValue(primarySeries, primarySlotIndex)
  const metricLabel = METRIC_OPTIONS.find(option => option.id === metric)?.label ?? metric

  return [
    {
      type: 'insight',
      title: 'Multi-foil overlay',
      text: `${series.length.toLocaleString()} frozen runs are overlaid on a shared ${metricLabel.toLowerCase()} chart. The primary replay stays pinned while every foil is aligned by relative progress at ${Math.round(sharedProgress * 100)}% of the run.`,
      emphasis: 'key-finding',
    },
    {
      type: 'timeseries',
      title: `${metricLabel} overlay across frozen foils`,
      xLabel: 'Slot',
      yLabel: metricLabel,
      series,
      annotations: [
        {
          x: primarySlotIndex + 1,
          label: selectedValue != null
            ? `Primary aligned readout: ${formatMetricValue(metric, selectedValue)}`
            : 'Primary aligned readout',
        },
      ],
    },
    {
      type: 'table',
      title: 'Aligned foil readout',
      headers: ['Replay', 'Current aligned value', 'Final value', 'Peak delta vs primary'],
      rows: readoutRows,
    },
    {
      type: 'caveat',
      text: 'This hidden overlay view keeps the existing live analytics desk untouched. It stages the N-foil overlay logic with progress-based alignment so different slot counts remain comparable when activated later.',
    },
  ]
}

export function PublishedMultiFoilOverlayIncubator({
  selectedDataset,
  catalogDatasets,
  viewerBaseUrl,
}: PublishedMultiFoilOverlayIncubatorProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [metric, setMetric] = useState<OverlayMetric>('gini')
  const [sharedProgress, setSharedProgress] = useState(0)
  const previousFamilySignatureRef = useRef('')

  const familyDatasets = useMemo(
    () => selectedDataset
      ? sortDatasets(catalogDatasets.filter(entry => entry.evaluation === selectedDataset.evaluation))
      : [],
    [catalogDatasets, selectedDataset],
  )
  const familySignature = useMemo(
    () => familyDatasets.map(entry => entry.path).join('|'),
    [familyDatasets],
  )

  useEffect(() => {
    if (!selectedDataset) {
      setSelectedPaths([])
      setSharedProgress(0)
      previousFamilySignatureRef.current = ''
      return
    }

    const primaryPath = selectedDataset.path
    const allowed = new Set(familyDatasets.map(entry => entry.path))
    setSelectedPaths(current => {
      const preserved = current.filter(path => allowed.has(path))
      if (preserved.length > 0) {
        return normalizeSelection(primaryPath, preserved)
      }

      const fallbacks = familyDatasets
        .map(entry => entry.path)
        .filter(path => path !== primaryPath)
        .slice(0, 3)
      return normalizeSelection(primaryPath, fallbacks)
    })

    if (previousFamilySignatureRef.current !== familySignature) {
      setSharedProgress(0)
      previousFamilySignatureRef.current = familySignature
    }
  }, [familyDatasets, familySignature, selectedDataset])

  const activeDatasets = useMemo(
    () => selectedPaths
      .map(path => catalogDatasets.find(entry => entry.path === path) ?? null)
      .filter((entry): entry is ResearchDatasetEntry => Boolean(entry)),
    [catalogDatasets, selectedPaths],
  )

  const datasetQueries = useQueries({
    queries: activeDatasets.map(dataset => ({
      queryKey: ['roadmap-incubator-multi-foil', viewerBaseUrl, dataset.path],
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

  const overlayBlocks = useMemo(
    () => buildOverlayBlocks(activeDatasets, payloadByPath, metric, selectedPaths, sharedProgress),
    [activeDatasets, metric, payloadByPath, selectedPaths, sharedProgress],
  )

  const errorMessages = datasetQueries.flatMap(query => (
    query.error instanceof Error ? [query.error.message] : []
  ))
  const loading = datasetQueries.some(query => query.isLoading)

  const togglePath = (path: string) => {
    if (!selectedDataset) return
    const primaryPath = selectedDataset.path

    setSelectedPaths(current => {
      if (path === primaryPath) return normalizeSelection(primaryPath, current)
      if (current.includes(path)) {
        return normalizeSelection(primaryPath, current.filter(entry => entry !== path))
      }
      if (current.length >= 6) {
        return normalizeSelection(primaryPath, [...current.slice(1), path])
      }
      return normalizeSelection(primaryPath, [...current, path])
    })
  }

  if (!selectedDataset) return null

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="text-xs text-muted">Roadmap incubator</div>
        <div className="mt-1 text-sm text-text-primary">1d. Multi-foil analytics overlay</div>
        <div className="mt-2 text-xs leading-5 text-muted">
          Dormant N-foil overlay logic for the analytics desk. The selected replay stays pinned as primary and every additional foil is aligned by relative progress, but nothing here is wired into the live desk yet.
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {familyDatasets.map(dataset => {
            const active = selectedPaths.includes(dataset.path)
            const primary = dataset.path === selectedDataset.path
            return (
              <button
                key={dataset.path}
                onClick={() => togglePath(dataset.path)}
                disabled={primary}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  primary
                    ? 'cursor-default border-text-primary bg-text-primary text-white'
                    : active
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
              >
                {dataset.paradigm} · {dataset.result}{primary ? ' · primary' : ''}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {METRIC_OPTIONS.map(option => (
            <button
              key={option.id}
              onClick={() => setMetric(option.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                metric === option.id
                  ? 'border-accent bg-white text-accent'
                  : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Aligned progress</div>
              <div className="mt-1 text-sm text-text-primary">{Math.round(sharedProgress * 100)}%</div>
            </div>
            <div className="text-xs leading-5 text-muted">
              Hidden overlay staging for up to six published foils in the same evaluation family.
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
        </div>

        {loading && overlayBlocks.length === 0 ? (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            Loading dormant foil overlays...
          </div>
        ) : null}

        {errorMessages.map(message => (
          <div key={message} className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-danger">
            {message}
          </div>
        ))}

        {overlayBlocks.length > 0 ? (
          <BlockCanvas blocks={overlayBlocks} showExport={false} />
        ) : (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            Select at least one foil to stage the hidden multi-overlay desk.
          </div>
        )}
      </div>
    </div>
  )
}
