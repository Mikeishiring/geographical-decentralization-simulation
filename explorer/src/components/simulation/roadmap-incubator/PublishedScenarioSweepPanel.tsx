import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BlockCanvas } from '../../explore/BlockCanvas'
import { cn } from '../../../lib/cn'
import type { Block } from '../../../types/blocks'
import { formatNumber, paradigmLabel } from '../simulation-constants'
import { alignComparisonSlot, fetchPublishedAnalyticsPayload } from '../simulation-lab-comparison'
import {
  analyticsMetricSeriesForPayload,
  type AnalyticsQueryMetric,
  type PublishedAnalyticsPayload,
  totalSlotsFromPayload,
} from '../simulation-analytics'

type SweepDimension = 'cost' | 'gamma'
type SweepReadoutMode = 'aligned' | 'final'
type SweepMetricId = Extract<AnalyticsQueryMetric, 'gini' | 'hhi' | 'liveness'>
type SweepPayload = Pick<PublishedAnalyticsPayload, 'description' | 'n_slots' | 'metrics'>

interface ResearchMetadata {
  readonly cost?: number
  readonly gamma?: number
  readonly description?: string
}

interface ResearchDatasetEntry {
  readonly evaluation: string
  readonly paradigm: string
  readonly result: string
  readonly path: string
  readonly metadata?: ResearchMetadata
}

interface SweepFamily {
  readonly dimension: SweepDimension
  readonly label: string
  readonly axisLabel: string
  readonly summaryLabel: string
  readonly datasets: readonly ResearchDatasetEntry[]
  readonly uniqueValues: readonly number[]
  readonly paradigms: readonly string[]
}

interface PublishedScenarioSweepPanelProps {
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly catalogDatasets: readonly ResearchDatasetEntry[]
  readonly viewerBaseUrl: string
  readonly primaryPayload: PublishedAnalyticsPayload | null
  readonly primarySlotIndex: number
}

const SWEEP_DIMENSIONS: ReadonlyArray<{
  readonly id: SweepDimension
  readonly label: string
  readonly axisLabel: string
  readonly summaryLabel: string
}> = [
  {
    id: 'cost',
    label: 'Migration cost',
    axisLabel: 'Migration cost (ETH)',
    summaryLabel: 'Cost sweep',
  },
  {
    id: 'gamma',
    label: 'Attestation threshold',
    axisLabel: 'Gamma',
    summaryLabel: 'Gamma sweep',
  },
] as const

const SWEEP_METRICS: ReadonlyArray<{
  readonly id: SweepMetricId
  readonly label: string
  readonly yLabel: string
}> = [
  { id: 'gini', label: 'Gini', yLabel: 'Index' },
  { id: 'hhi', label: 'HHI', yLabel: 'Index' },
  { id: 'liveness', label: 'Liveness', yLabel: 'Percent' },
] as const

const PARADIGM_COLORS: Readonly<Record<string, string>> = {
  External: '#2563EB',
  Local: '#C2553A',
}

function approximatelyEqual(left: number, right: number, epsilon = 0.0002): boolean {
  return Math.abs(left - right) <= epsilon
}

function uniqueOrdered(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function uniqueSortedNumbers(values: readonly number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted.reduce<number[]>((accumulator, value) => {
    if (accumulator.some(existing => approximatelyEqual(existing, value))) {
      return accumulator
    }
    accumulator.push(value)
    return accumulator
  }, [])
}

function formatCompactValue(value: number, digits = 4): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatSweepValue(dimension: SweepDimension, value: number): string {
  return dimension === 'cost'
    ? `${formatCompactValue(value, 4)} ETH`
    : formatCompactValue(value, 4)
}

function formatSweepRange(dimension: SweepDimension, values: readonly number[]): string {
  if (values.length === 0) return 'No values'
  if (values.length === 1) return formatSweepValue(dimension, values[0]!)
  return `${formatSweepValue(dimension, values[0]!)} to ${formatSweepValue(dimension, values[values.length - 1]!)}`
}

function parseSweepValue(input: string, dimension: SweepDimension): number | null {
  const pattern = dimension === 'cost'
    ? /cost_([0-9.]+)/i
    : /gamma_([0-9.]+)/i
  const match = input.match(pattern)
  if (!match) return null
  const value = Number.parseFloat(match[1] ?? '')
  return Number.isFinite(value) ? value : null
}

function resolveSweepValue(dataset: ResearchDatasetEntry, dimension: SweepDimension): number | null {
  const parsedFromResult = parseSweepValue(dataset.result, dimension)
  if (parsedFromResult != null) return parsedFromResult

  const parsedFromPath = parseSweepValue(dataset.path, dimension)
  if (parsedFromPath != null) return parsedFromPath

  const metadataValue = dataset.metadata?.[dimension]
  return typeof metadataValue === 'number' && Number.isFinite(metadataValue)
    ? metadataValue
    : null
}

function toSweepPayload(payload: PublishedAnalyticsPayload): SweepPayload {
  return {
    description: payload.description,
    n_slots: payload.n_slots,
    metrics: {
      gini: payload.metrics?.gini,
      hhi: payload.metrics?.hhi,
      liveness: payload.metrics?.liveness,
    },
  }
}

function metricValueAtSlot(
  payload: PublishedAnalyticsPayload | SweepPayload,
  metric: SweepMetricId,
  slotIndex: number,
): number | null {
  const series = analyticsMetricSeriesForPayload(payload as PublishedAnalyticsPayload, metric)
  if (!series?.length) return null

  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function detectSweepFamily(
  selectedDataset: ResearchDatasetEntry | null,
  catalogDatasets: readonly ResearchDatasetEntry[],
): SweepFamily | null {
  if (!selectedDataset) return null

  const familyDatasets = catalogDatasets.filter(entry => entry.evaluation === selectedDataset.evaluation)
  if (familyDatasets.length < 3) return null

  const rankedCandidates = SWEEP_DIMENSIONS
    .map(candidate => {
      const datasetsWithValues = familyDatasets.filter(entry => resolveSweepValue(entry, candidate.id) != null)
      const uniqueValues = uniqueSortedNumbers(
        datasetsWithValues
          .map(entry => resolveSweepValue(entry, candidate.id))
          .filter((value): value is number => value != null),
      )
      const paradigms = uniqueOrdered(datasetsWithValues.map(entry => entry.paradigm))
      const maxPointsInParadigm = paradigms.reduce((best, paradigm) => Math.max(
        best,
        uniqueSortedNumbers(
          datasetsWithValues
            .filter(entry => entry.paradigm === paradigm)
            .map(entry => resolveSweepValue(entry, candidate.id))
            .filter((value): value is number => value != null),
        ).length,
      ), 0)

      return {
        candidate,
        datasetsWithValues,
        uniqueValues,
        paradigms,
        maxPointsInParadigm,
      }
    })
    .filter(entry => entry.uniqueValues.length >= 2 && entry.datasetsWithValues.length >= 3 && entry.maxPointsInParadigm >= 2)
    .sort((left, right) => {
      if (right.uniqueValues.length !== left.uniqueValues.length) {
        return right.uniqueValues.length - left.uniqueValues.length
      }
      if (right.datasetsWithValues.length !== left.datasetsWithValues.length) {
        return right.datasetsWithValues.length - left.datasetsWithValues.length
      }
      return left.candidate.id.localeCompare(right.candidate.id)
    })

  const bestCandidate = rankedCandidates[0]
  if (!bestCandidate) return null

  return {
    dimension: bestCandidate.candidate.id,
    label: bestCandidate.candidate.label,
    axisLabel: bestCandidate.candidate.axisLabel,
    summaryLabel: bestCandidate.candidate.summaryLabel,
    datasets: bestCandidate.datasetsWithValues,
    uniqueValues: bestCandidate.uniqueValues,
    paradigms: bestCandidate.paradigms,
  }
}

function progressPercent(slotIndex: number, totalSlots: number): string {
  if (totalSlots <= 1) return '100.0%'
  return `${formatNumber((slotIndex / Math.max(1, totalSlots - 1)) * 100, 1)}%`
}

export function PublishedScenarioSweepPanel({
  selectedDataset,
  catalogDatasets,
  viewerBaseUrl,
  primaryPayload,
  primarySlotIndex,
}: PublishedScenarioSweepPanelProps) {
  const [readoutMode, setReadoutMode] = useState<SweepReadoutMode>('aligned')

  const sweepFamily = useMemo(
    () => detectSweepFamily(selectedDataset, catalogDatasets),
    [catalogDatasets, selectedDataset],
  )
  const primarySweepPayload = useMemo(
    () => (primaryPayload ? toSweepPayload(primaryPayload) : null),
    [primaryPayload],
  )
  const peerDatasets = useMemo(
    () => sweepFamily?.datasets.filter(entry => entry.path !== selectedDataset?.path) ?? [],
    [selectedDataset?.path, sweepFamily],
  )

  const familyPayloadsQuery = useQuery({
    enabled: Boolean(sweepFamily && selectedDataset && primarySweepPayload),
    queryKey: [
      'published-scenario-sweep',
      selectedDataset?.evaluation ?? '',
      sweepFamily?.dimension ?? '',
      peerDatasets.map(entry => entry.path),
    ],
    queryFn: async () => Promise.all(peerDatasets.map(async dataset => {
      const payload = await fetchPublishedAnalyticsPayload(viewerBaseUrl, dataset.path)
      return {
        dataset,
        payload: toSweepPayload(payload),
      }
    })),
    staleTime: Infinity,
  })

  const combinedFamilyEntries = useMemo(() => {
    if (!selectedDataset || !primarySweepPayload || !sweepFamily) return []

    const payloadEntries = [
      { dataset: selectedDataset, payload: primarySweepPayload },
      ...(familyPayloadsQuery.data ?? []),
    ]
    const payloadByPath = new Map(payloadEntries.map(entry => [entry.dataset.path, entry]))

    return sweepFamily.datasets
      .map(dataset => payloadByPath.get(dataset.path) ?? null)
      .filter((entry): entry is { dataset: ResearchDatasetEntry; payload: SweepPayload } => Boolean(entry))
  }, [familyPayloadsQuery.data, primarySweepPayload, selectedDataset, sweepFamily])

  const primaryTotalSlots = totalSlotsFromPayload(primarySweepPayload)
  const activeReadoutSlot = readoutMode === 'final'
    ? Math.max(0, primaryTotalSlots - 1)
    : primarySlotIndex
  const activeSweepValue = useMemo(
    () => (sweepFamily && selectedDataset ? resolveSweepValue(selectedDataset, sweepFamily.dimension) : null),
    [selectedDataset, sweepFamily],
  )

  const sweepBlocks = useMemo<readonly Block[]>(() => {
    if (!selectedDataset || !primarySweepPayload || !sweepFamily) return []

    const payloadByPath = new Map(combinedFamilyEntries.map(entry => [entry.dataset.path, entry.payload]))

    return SWEEP_METRICS.flatMap<Block>(metric => {
      const series = sweepFamily.paradigms
        .map(paradigm => {
          const points = sweepFamily.datasets
            .filter(dataset => dataset.paradigm === paradigm)
            .map(dataset => {
              const xValue = resolveSweepValue(dataset, sweepFamily.dimension)
              const payload = payloadByPath.get(dataset.path)
              if (xValue == null || !payload) return null

              const alignedSlot = alignComparisonSlot(
                activeReadoutSlot,
                primaryTotalSlots,
                totalSlotsFromPayload(payload),
              )
              const yValue = metricValueAtSlot(payload, metric.id, alignedSlot)
              if (yValue == null) return null

              return { x: xValue, y: yValue }
            })
            .filter((point): point is { x: number; y: number } => Boolean(point))
            .sort((left, right) => left.x - right.x)

          if (points.length === 0) return null

          const label = paradigmLabel(paradigm)
          return {
            label,
            data: points,
            color: PARADIGM_COLORS[label] ?? undefined,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

      if (series.length === 0) return []

      return [{
        type: 'timeseries',
        title: `${metric.label} ${sweepFamily.summaryLabel.toLowerCase()}`,
        series,
        xLabel: sweepFamily.axisLabel,
        yLabel: metric.yLabel,
        annotations: activeSweepValue != null ? [{ x: activeSweepValue, label: 'Active scenario' }] : undefined,
      }]
    })
  }, [
    activeReadoutSlot,
    activeSweepValue,
    combinedFamilyEntries,
    primarySweepPayload,
    primaryTotalSlots,
    selectedDataset,
    sweepFamily,
  ])

  if (!selectedDataset || !sweepFamily) {
    return null
  }

  const statusMessage = !primaryPayload
    ? 'Loading the active replay metrics before assembling the family sweep...'
    : familyPayloadsQuery.isLoading && combinedFamilyEntries.length < sweepFamily.datasets.length
      ? `Loading ${sweepFamily.summaryLabel.toLowerCase()} datasets for ${selectedDataset.evaluation}...`
      : familyPayloadsQuery.isError
        ? (familyPayloadsQuery.error as Error).message
        : null

  const activeScenarioLabel = `${selectedDataset.evaluation} · ${paradigmLabel(selectedDataset.paradigm)} · ${selectedDataset.result}`

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs text-muted">Multi-scenario comparison</div>
            <div className="mt-1 text-sm text-text-primary">
              {sweepFamily.summaryLabel} across {selectedDataset.evaluation}
            </div>
            <div className="mt-2 text-xs leading-5 text-muted">
              One line per paradigm, aligned to the active replay so the family can be read as a single sweep instead of isolated runs.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              { id: 'aligned' as const, label: 'Aligned slot', detail: `Read each run at ${progressPercent(primarySlotIndex, primaryTotalSlots)} progress.` },
              { id: 'final' as const, label: 'Final slot', detail: 'Compare each run at its endpoint.' },
            ]).map(option => (
              <button
                key={option.id}
                onClick={() => setReadoutMode(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  readoutMode === option.id
                    ? 'border-accent bg-white text-accent'
                    : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
                title={option.detail}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Sweep axis</div>
            <div className="mt-2 text-sm font-medium text-text-primary">{sweepFamily.label}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{formatSweepRange(sweepFamily.dimension, sweepFamily.uniqueValues)}</div>
          </div>

          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Coverage</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {sweepFamily.datasets.length} scenario{sweepFamily.datasets.length === 1 ? '' : 's'}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              {sweepFamily.paradigms.map(paradigm => paradigmLabel(paradigm)).join(' / ')}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Readout</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {readoutMode === 'final' ? 'Final slot' : `Slot ${activeReadoutSlot + 1}`}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              {readoutMode === 'final'
                ? 'Each family run is read at its endpoint.'
                : `${progressPercent(activeReadoutSlot, primaryTotalSlots)} through the active replay.`}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Active scenario</div>
            <div className="mt-2 text-sm font-medium text-text-primary">{paradigmLabel(selectedDataset.paradigm)}</div>
            <div className="mt-1 text-xs leading-5 text-muted">
              {activeSweepValue != null ? formatSweepValue(sweepFamily.dimension, activeSweepValue) : activeScenarioLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {statusMessage ? (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            {statusMessage}
          </div>
        ) : sweepBlocks.length > 0 ? (
          <BlockCanvas blocks={sweepBlocks} showExport={false} />
        ) : (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            The family metadata loaded, but there were not enough numeric sweep points to draw the charts.
          </div>
        )}
      </div>
    </div>
  )
}
