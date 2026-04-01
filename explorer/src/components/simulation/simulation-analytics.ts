import type { Block, SourceBlock } from '../../types/blocks'
import { formatNumber } from './simulation-constants'

export type AnalyticsDeckView = 'concentration' | 'latency' | 'economics' | 'geography'
export type AnalyticsQueryMetric =
  | 'gini'
  | 'hhi'
  | 'active_regions'
  | 'leader_share'
  | 'liveness'
  | 'proposal_times'
  | 'failed_block_proposals'
  | 'mev'
  | 'attestations'
  | 'clusters'
export type AnalyticsCompareMode = 'absolute' | 'overlay' | 'delta'

type AnalyticsMetricUnit = 'index' | 'percent' | 'milliseconds' | 'eth' | 'count'

export interface AnalyticsViewOption {
  readonly id: AnalyticsDeckView
  readonly label: string
  readonly description: string
}

export interface AnalyticsQueryOption {
  readonly id: AnalyticsQueryMetric
  readonly view: AnalyticsDeckView
  readonly label: string
  readonly description: string
  readonly unit: AnalyticsMetricUnit
  readonly color: string
  readonly comparisonColor?: string
}

export interface AnalyticsCompareModeOption {
  readonly id: AnalyticsCompareMode
  readonly label: string
  readonly description: string
}

export interface AnalyticsDashboardPreset {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly analyticsView: AnalyticsDeckView
  readonly analyticsMetric: AnalyticsQueryMetric
  readonly analyticsCompareMode: AnalyticsCompareMode
}

export interface PublishedAnalyticsMetrics {
  readonly clusters?: readonly number[]
  readonly total_distance?: readonly number[]
  readonly mev?: readonly number[]
  readonly attestations?: readonly number[]
  readonly proposal_times?: readonly number[]
  readonly gini?: readonly number[]
  readonly hhi?: readonly number[]
  readonly liveness?: readonly number[]
  readonly failed_block_proposals?: readonly number[]
  readonly profit_variance?: readonly number[]
  readonly avg_nnd?: readonly number[]
  readonly nni?: readonly number[]
  readonly info_avg_distance?: readonly number[]
}

export interface PublishedAnalyticsPayload {
  readonly v?: number
  readonly description?: string
  readonly n_slots?: number
  readonly metrics?: PublishedAnalyticsMetrics
  readonly sources?: ReadonlyArray<readonly [string, string]>
  readonly slots?: Record<string, ReadonlyArray<readonly [string, number]>>
}

export interface AnalyticsMetricCard {
  readonly label: string
  readonly value: string
  readonly detail: string
}

export interface BuildAnalyticsBlocksOptions {
  readonly analyticsView: AnalyticsDeckView
  readonly queryMetric: AnalyticsQueryMetric
  readonly compareMode: AnalyticsCompareMode
  readonly primaryPayload: PublishedAnalyticsPayload
  readonly primarySlot: number
  readonly sourceRefs?: readonly SourceBlock['refs'][number][]
  readonly primaryLabel?: string
  readonly comparisonPayload?: PublishedAnalyticsPayload | null
  readonly comparisonSlot?: number
  readonly comparisonLabel?: string
}

export interface AnalyticsExportRow {
  readonly slot: number
  readonly slotIndex: number
  readonly progressPercent: number
  readonly primaryValue: number | null
  readonly comparisonSlot: number | null
  readonly comparisonSlotIndex: number | null
  readonly comparisonProgressPercent: number | null
  readonly comparisonValue: number | null
  readonly deltaValue: number | null
}

export interface BuildAnalyticsExportOptions extends BuildAnalyticsBlocksOptions {
  readonly shareUrl?: string
  readonly exportedAt?: string
}

export interface AnalyticsExportBundle {
  readonly format: 'simulation-analytics-query/v1'
  readonly exportedAt: string
  readonly shareUrl: string | null
  readonly query: {
    readonly analyticsView: AnalyticsDeckView
    readonly analyticsViewLabel: string
    readonly analyticsMetric: AnalyticsQueryMetric
    readonly analyticsMetricLabel: string
    readonly compareMode: AnalyticsCompareMode
    readonly primaryLabel: string
    readonly primaryDescription: string | null
    readonly primarySlot: number
    readonly primarySlotIndex: number
    readonly primaryTotalSlots: number
    readonly comparisonLabel: string | null
    readonly comparisonDescription: string | null
    readonly comparisonSlot: number | null
    readonly comparisonSlotIndex: number | null
    readonly comparisonTotalSlots: number | null
  }
  readonly currentReadout: {
    readonly primaryValue: number | null
    readonly primaryValueFormatted: string
    readonly comparisonValue: number | null
    readonly comparisonValueFormatted: string | null
    readonly deltaValue: number | null
    readonly deltaValueFormatted: string | null
  }
  readonly sourceRefs: readonly SourceBlock['refs'][number][]
  readonly rows: readonly AnalyticsExportRow[]
}

export const ANALYTICS_VIEW_OPTIONS: readonly AnalyticsViewOption[] = [
  {
    id: 'concentration',
    label: 'Concentration',
    description: 'Gini, HHI, and region compression over time.',
  },
  {
    id: 'latency',
    label: 'Latency',
    description: 'Liveness, proposal timing, and failure posture.',
  },
  {
    id: 'economics',
    label: 'Economics',
    description: 'MEV, attestation output, and cluster behavior.',
  },
  {
    id: 'geography',
    label: 'Geography',
    description: 'Active-region spread and top-region rank tables.',
  },
] as const

export const ANALYTICS_QUERY_OPTIONS: readonly AnalyticsQueryOption[] = [
  {
    id: 'gini',
    view: 'concentration',
    label: 'Gini',
    description: 'Inequality of validator distribution across regions.',
    unit: 'index',
    color: '#C2553A',
    comparisonColor: '#7C2D12',
  },
  {
    id: 'hhi',
    view: 'concentration',
    label: 'HHI',
    description: 'Concentration index for regional validator dominance.',
    unit: 'index',
    color: '#2563EB',
    comparisonColor: '#1D4ED8',
  },
  {
    id: 'active_regions',
    view: 'concentration',
    label: 'Active regions',
    description: 'How many regions still retain non-zero validator presence.',
    unit: 'count',
    color: '#0F766E',
    comparisonColor: '#0D9488',
  },
  {
    id: 'liveness',
    view: 'latency',
    label: 'Liveness',
    description: 'Percentage of slots meeting the liveness target.',
    unit: 'percent',
    color: '#16A34A',
    comparisonColor: '#15803D',
  },
  {
    id: 'proposal_times',
    view: 'latency',
    label: 'Proposal time',
    description: 'Average proposal timing in milliseconds.',
    unit: 'milliseconds',
    color: '#D97706',
    comparisonColor: '#B45309',
  },
  {
    id: 'failed_block_proposals',
    view: 'latency',
    label: 'Failed proposals',
    description: 'Failed block proposals accumulated over the run.',
    unit: 'count',
    color: '#BE123C',
    comparisonColor: '#9F1239',
  },
  {
    id: 'mev',
    view: 'economics',
    label: 'MEV',
    description: 'Average MEV captured through the run.',
    unit: 'eth',
    color: '#2563EB',
    comparisonColor: '#1D4ED8',
  },
  {
    id: 'attestations',
    view: 'economics',
    label: 'Attestations',
    description: 'Aggregate attestation output over time.',
    unit: 'count',
    color: '#0F766E',
    comparisonColor: '#0D9488',
  },
  {
    id: 'clusters',
    view: 'economics',
    label: 'Clusters',
    description: 'How many geographic clusters remain in the run.',
    unit: 'count',
    color: '#7C3AED',
    comparisonColor: '#6D28D9',
  },
  {
    id: 'active_regions',
    view: 'geography',
    label: 'Active regions',
    description: 'How many regions remain geographically active over time.',
    unit: 'count',
    color: '#7C3AED',
    comparisonColor: '#6D28D9',
  },
  {
    id: 'leader_share',
    view: 'geography',
    label: 'Leader share',
    description: 'Share held by the dominant region over time.',
    unit: 'percent',
    color: '#C2553A',
    comparisonColor: '#9A3412',
  },
] as const

export const ANALYTICS_COMPARE_MODE_OPTIONS: readonly AnalyticsCompareModeOption[] = [
  {
    id: 'absolute',
    label: 'Absolute',
    description: 'Read the primary run directly and keep comparison values in summary tables.',
  },
  {
    id: 'overlay',
    label: 'Overlay',
    description: 'Plot the primary and comparison runs together on the same chart.',
  },
  {
    id: 'delta',
    label: 'Delta',
    description: 'Plot primary minus comparison to isolate the gap between runs.',
  },
] as const

export function parseAnalyticsDeckView(value: string | null): AnalyticsDeckView | undefined {
  return value === 'concentration' || value === 'latency' || value === 'economics' || value === 'geography'
    ? value
    : undefined
}

export function parseAnalyticsQueryMetric(value: string | null): AnalyticsQueryMetric | undefined {
  return ANALYTICS_QUERY_OPTIONS.find(option => option.id === value)?.id
}

export function parseAnalyticsCompareMode(value: string | null): AnalyticsCompareMode | undefined {
  return value === 'absolute' || value === 'overlay' || value === 'delta'
    ? value
    : undefined
}

export function defaultAnalyticsQueryMetricForView(view: AnalyticsDeckView): AnalyticsQueryMetric {
  if (view === 'latency') return 'liveness'
  if (view === 'economics') return 'mev'
  if (view === 'geography') return 'active_regions'
  return 'gini'
}

export function analyticsMetricOptionsForView(view: AnalyticsDeckView): readonly AnalyticsQueryOption[] {
  return ANALYTICS_QUERY_OPTIONS.filter(option => option.view === view)
}

export function analyticsCompareModeOptions(
  hasComparison: boolean,
): readonly AnalyticsCompareModeOption[] {
  return hasComparison
    ? ANALYTICS_COMPARE_MODE_OPTIONS
    : ANALYTICS_COMPARE_MODE_OPTIONS.filter(option => option.id === 'absolute')
}

export function buildAnalyticsDashboardPresets(
  hasComparison: boolean,
): readonly AnalyticsDashboardPreset[] {
  const presets: AnalyticsDashboardPreset[] = [
    {
      id: 'concentration-read',
      label: 'Concentration read',
      note: 'Start with the inequality signal before interpretation.',
      analyticsView: 'concentration',
      analyticsMetric: 'gini',
      analyticsCompareMode: 'absolute',
    },
    {
      id: 'latency-check',
      label: 'Latency check',
      note: 'Read liveness and timing posture as an operational surface.',
      analyticsView: 'latency',
      analyticsMetric: 'liveness',
      analyticsCompareMode: 'absolute',
    },
    {
      id: 'mev-read',
      label: 'MEV read',
      note: 'Follow value capture directly from the exported series.',
      analyticsView: 'economics',
      analyticsMetric: 'mev',
      analyticsCompareMode: 'absolute',
    },
    {
      id: 'geography-leader',
      label: 'Leader share',
      note: 'Check whether one geography is taking over the run.',
      analyticsView: 'geography',
      analyticsMetric: 'leader_share',
      analyticsCompareMode: 'absolute',
    },
  ]

  if (!hasComparison) return presets

  return [
    ...presets,
    {
      id: 'concentration-delta',
      label: 'Concentration delta',
      note: 'Primary minus comparison on Gini to isolate the distribution gap.',
      analyticsView: 'concentration',
      analyticsMetric: 'gini',
      analyticsCompareMode: 'delta',
    },
    {
      id: 'mev-overlay',
      label: 'MEV overlay',
      note: 'Plot value capture against the foil on one shared chart.',
      analyticsView: 'economics',
      analyticsMetric: 'mev',
      analyticsCompareMode: 'overlay',
    },
    {
      id: 'latency-delta',
      label: 'Timing delta',
      note: 'See whether the current run is materially slower than the foil.',
      analyticsView: 'latency',
      analyticsMetric: 'proposal_times',
      analyticsCompareMode: 'delta',
    },
  ]
}

export function totalSlotsFromPayload(payload: PublishedAnalyticsPayload | null): number {
  return Math.max(
    1,
    payload?.n_slots ?? 0,
    payload?.metrics?.gini?.length ?? 0,
    payload?.metrics?.mev?.length ?? 0,
    Object.keys(payload?.slots ?? {}).length,
  )
}

export function clampSlotIndex(slot: number | null | undefined, totalSlots: number): number {
  if (typeof slot !== 'number' || !Number.isFinite(slot)) return 0
  return Math.max(0, Math.min(Math.floor(slot), Math.max(0, totalSlots - 1)))
}

function alignSlotByProgress(
  primarySlot: number,
  primaryTotalSlots: number,
  comparisonTotalSlots: number,
): number {
  if (comparisonTotalSlots <= 1) return 0
  if (primaryTotalSlots <= 1) return Math.max(0, comparisonTotalSlots - 1)
  const progress = primarySlot / Math.max(1, primaryTotalSlots - 1)
  return clampSlotIndex(Math.round(progress * Math.max(0, comparisonTotalSlots - 1)), comparisonTotalSlots)
}

function readMetricValue(series: readonly number[] | undefined, slot: number): number | null {
  if (!series?.length) return null
  const index = Math.max(0, Math.min(slot, series.length - 1))
  const value = series[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sampleSeries(
  series: readonly number[] | undefined,
  maxPoints = 240,
): Array<{ x: number; y: number }> {
  if (!series?.length) return []

  const step = Math.max(1, Math.ceil(series.length / maxPoints))
  const points: Array<{ x: number; y: number }> = []

  for (let index = 0; index < series.length; index += step) {
    const value = series[index]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    points.push({ x: index + 1, y: value })
  }

  const lastIndex = series.length - 1
  const lastValue = series[lastIndex]
  if (
    typeof lastValue === 'number'
    && Number.isFinite(lastValue)
    && points[points.length - 1]?.x !== lastIndex + 1
  ) {
    points.push({ x: lastIndex + 1, y: lastValue })
  }

  return points
}

function derivedActiveRegionsSeries(payload: PublishedAnalyticsPayload | null): number[] {
  if (!payload?.slots) return []

  const totalSlots = totalSlotsFromPayload(payload)
  return Array.from({ length: totalSlots }, (_, slotIndex) => activeRegionCountAtSlot(payload, slotIndex))
}

function derivedLeaderShareSeries(payload: PublishedAnalyticsPayload | null): number[] {
  const totalSlots = totalSlotsFromPayload(payload)
  return Array.from({ length: totalSlots }, (_, slotIndex) => topRegionsForSlot(payload, slotIndex, 1)[0]?.share ?? 0)
}

export function analyticsMetricSeriesForPayload(
  payload: PublishedAnalyticsPayload | null,
  queryMetric: AnalyticsQueryMetric,
): readonly number[] | undefined {
  if (!payload) return undefined

  const metrics = payload.metrics ?? {}
  switch (queryMetric) {
    case 'gini':
      return metrics.gini
    case 'hhi':
      return metrics.hhi
    case 'liveness':
      return metrics.liveness
    case 'proposal_times':
      return metrics.proposal_times
    case 'failed_block_proposals':
      return metrics.failed_block_proposals
    case 'mev':
      return metrics.mev
    case 'attestations':
      return metrics.attestations
    case 'clusters':
      return metrics.clusters
    case 'leader_share':
      return derivedLeaderShareSeries(payload)
    case 'active_regions':
    default:
      return derivedActiveRegionsSeries(payload)
  }
}

function metricValueForPayload(
  payload: PublishedAnalyticsPayload | null,
  queryMetric: AnalyticsQueryMetric,
  slot: number,
): number | null {
  return readMetricValue(analyticsMetricSeriesForPayload(payload, queryMetric), slot)
}

function sampleMetricSeries(
  payload: PublishedAnalyticsPayload | null,
  queryMetric: AnalyticsQueryMetric,
  maxPoints = 240,
): Array<{ x: number; y: number }> {
  return sampleSeries(analyticsMetricSeriesForPayload(payload, queryMetric), maxPoints)
}

function sampleMetricDeltaSeries(
  primaryPayload: PublishedAnalyticsPayload | null,
  comparisonPayload: PublishedAnalyticsPayload | null,
  queryMetric: AnalyticsQueryMetric,
  maxPoints = 240,
): Array<{ x: number; y: number }> {
  if (!primaryPayload || !comparisonPayload) return []

  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const comparisonTotalSlots = totalSlotsFromPayload(comparisonPayload)
  const step = Math.max(1, Math.ceil(primaryTotalSlots / maxPoints))
  const points: Array<{ x: number; y: number }> = []

  for (let primarySlot = 0; primarySlot < primaryTotalSlots; primarySlot += step) {
    const comparisonSlot = alignSlotByProgress(primarySlot, primaryTotalSlots, comparisonTotalSlots)
    const primaryValue = metricValueForPayload(primaryPayload, queryMetric, primarySlot)
    const comparisonValue = metricValueForPayload(comparisonPayload, queryMetric, comparisonSlot)
    if (primaryValue == null || comparisonValue == null) continue
    points.push({ x: primarySlot + 1, y: primaryValue - comparisonValue })
  }

  const finalPrimarySlot = Math.max(0, primaryTotalSlots - 1)
  const finalComparisonSlot = alignSlotByProgress(finalPrimarySlot, primaryTotalSlots, comparisonTotalSlots)
  const finalPrimaryValue = metricValueForPayload(primaryPayload, queryMetric, finalPrimarySlot)
  const finalComparisonValue = metricValueForPayload(comparisonPayload, queryMetric, finalComparisonSlot)
  if (
    finalPrimaryValue != null
    && finalComparisonValue != null
    && points[points.length - 1]?.x !== finalPrimarySlot + 1
  ) {
    points.push({
      x: finalPrimarySlot + 1,
      y: finalPrimaryValue - finalComparisonValue,
    })
  }

  return points
}

export function topRegionsForSlot(
  payload: PublishedAnalyticsPayload | null,
  slotIndex: number,
  limit = 5,
): Array<{ label: string; count: number; share: number }> {
  if (!payload?.slots) return []

  const rawRegions = payload.slots[String(slotIndex)] ?? []
  const totalValidators = payload.v ?? rawRegions.reduce((sum, [, count]) => sum + Number(count || 0), 0)

  return rawRegions
    .map(([regionId, count]) => ({
      label: regionId,
      count: Number(count) || 0,
      share: totalValidators > 0 ? ((Number(count) || 0) / totalValidators) * 100 : 0,
    }))
    .filter(region => region.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
}

export function activeRegionCountAtSlot(
  payload: PublishedAnalyticsPayload | null,
  slotIndex: number,
): number {
  if (!payload?.slots) return 0
  const rawRegions = payload.slots[String(slotIndex)] ?? []
  return rawRegions.filter(([, count]) => Number(count) > 0).length
}

function formatPercentValue(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)}%`
}

function formatOptionalMilliseconds(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)} ms`
}

function formatOptionalEth(value: number | null | undefined, digits = 4): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)} ETH`
}

function formatIndexValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return formatNumber(value, 3)
}

function formatCountValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return Math.round(value).toLocaleString()
}

function formatMetricValue(
  queryMetric: AnalyticsQueryMetric,
  value: number | null | undefined,
): string {
  const option = ANALYTICS_QUERY_OPTIONS.find(candidate => candidate.id === queryMetric)
  switch (option?.unit) {
    case 'percent':
      return formatPercentValue(value)
    case 'milliseconds':
      return formatOptionalMilliseconds(value)
    case 'eth':
      return formatOptionalEth(value)
    case 'count':
      return formatCountValue(value)
    case 'index':
    default:
      return formatIndexValue(value)
  }
}

function formatMetricDelta(
  queryMetric: AnalyticsQueryMetric,
  value: number | null | undefined,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  const prefix = value > 0 ? '+' : ''
  const option = ANALYTICS_QUERY_OPTIONS.find(candidate => candidate.id === queryMetric)
  switch (option?.unit) {
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

function metricYAxisLabel(queryMetric: AnalyticsQueryMetric): string {
  const option = ANALYTICS_QUERY_OPTIONS.find(candidate => candidate.id === queryMetric)
  switch (option?.unit) {
    case 'percent':
      return 'Percent'
    case 'milliseconds':
      return 'Milliseconds'
    case 'eth':
      return 'ETH'
    case 'count':
      return 'Count'
    case 'index':
    default:
      return 'Index'
  }
}

function metricOptionOrDefault(
  analyticsView: AnalyticsDeckView,
  queryMetric: AnalyticsQueryMetric,
): AnalyticsQueryOption {
  return analyticsMetricOptionsForView(analyticsView).find(option => option.id === queryMetric)
    ?? analyticsMetricOptionsForView(analyticsView)[0]
    ?? ANALYTICS_QUERY_OPTIONS[0]!
}

function roundExportNumber(
  value: number | null | undefined,
  digits = 6,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number(value.toFixed(digits))
}

function slotProgressPercent(slotIndex: number, totalSlots: number): number {
  if (totalSlots <= 1) return totalSlots === 0 ? 0 : 100
  return roundExportNumber((slotIndex / Math.max(1, totalSlots - 1)) * 100, 4) ?? 0
}

function csvEscape(value: string | number | null): string {
  if (value == null) return ''
  const text = String(value)
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildComparisonSummaryBlock(options: {
  readonly queryMetric: AnalyticsQueryMetric
  readonly primaryPayload: PublishedAnalyticsPayload
  readonly primarySlot: number
  readonly primaryLabel: string
  readonly comparisonPayload: PublishedAnalyticsPayload | null
  readonly comparisonSlot: number
  readonly comparisonLabel: string
}): Block {
  const primaryTotalSlots = totalSlotsFromPayload(options.primaryPayload)
  const primaryFinalSlot = Math.max(0, primaryTotalSlots - 1)
  const primaryCurrentValue = metricValueForPayload(options.primaryPayload, options.queryMetric, options.primarySlot)
  const primaryFinalValue = metricValueForPayload(options.primaryPayload, options.queryMetric, primaryFinalSlot)

  if (!options.comparisonPayload) {
    return {
      type: 'table',
      title: 'Selected query readout',
      headers: ['Readout', options.primaryLabel],
      rows: [
        ['Selected slot', formatMetricValue(options.queryMetric, primaryCurrentValue)],
        ['Final slot', formatMetricValue(options.queryMetric, primaryFinalValue)],
      ],
    }
  }

  const comparisonTotalSlots = totalSlotsFromPayload(options.comparisonPayload)
  const comparisonFinalSlot = Math.max(0, comparisonTotalSlots - 1)
  const comparisonCurrentValue = metricValueForPayload(options.comparisonPayload, options.queryMetric, options.comparisonSlot)
  const comparisonFinalValue = metricValueForPayload(options.comparisonPayload, options.queryMetric, comparisonFinalSlot)

  return {
    type: 'table',
    title: 'Selected query comparison',
    headers: ['Readout', options.primaryLabel, options.comparisonLabel, 'Delta'],
    rows: [
      [
        `Slot ${options.primarySlot + 1}`,
        formatMetricValue(options.queryMetric, primaryCurrentValue),
        formatMetricValue(options.queryMetric, comparisonCurrentValue),
        formatMetricDelta(
          options.queryMetric,
          primaryCurrentValue != null && comparisonCurrentValue != null
            ? primaryCurrentValue - comparisonCurrentValue
            : null,
        ),
      ],
      [
        'Final slot',
        formatMetricValue(options.queryMetric, primaryFinalValue),
        formatMetricValue(options.queryMetric, comparisonFinalValue),
        formatMetricDelta(
          options.queryMetric,
          primaryFinalValue != null && comparisonFinalValue != null
            ? primaryFinalValue - comparisonFinalValue
            : null,
        ),
      ],
    ],
  }
}

export function buildAnalyticsMetricCards({
  analyticsView,
  queryMetric,
  compareMode,
  payload,
  slot,
  comparisonPayload = null,
  comparisonSlot = 0,
  comparisonLabel = 'Comparison replay',
}: {
  readonly analyticsView: AnalyticsDeckView
  readonly queryMetric: AnalyticsQueryMetric
  readonly compareMode: AnalyticsCompareMode
  readonly payload: PublishedAnalyticsPayload | null
  readonly slot: number
  readonly comparisonPayload?: PublishedAnalyticsPayload | null
  readonly comparisonSlot?: number
  readonly comparisonLabel?: string
}): AnalyticsMetricCard[] {
  if (!payload) return []

  const metricOption = metricOptionOrDefault(analyticsView, queryMetric)
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const currentValue = metricValueForPayload(payload, metricOption.id, slot)
  const finalValue = metricValueForPayload(payload, metricOption.id, finalSlot)

  const cards: AnalyticsMetricCard[] = [
    {
      label: `Current ${metricOption.label}`,
      value: formatMetricValue(metricOption.id, currentValue),
      detail: `Exact value at slot ${slot + 1}.`,
    },
    {
      label: `Final ${metricOption.label}`,
      value: formatMetricValue(metricOption.id, finalValue),
      detail: `Run endpoint at slot ${finalSlot + 1}.`,
    },
  ]

  if (comparisonPayload) {
    const comparisonValue = metricValueForPayload(comparisonPayload, metricOption.id, comparisonSlot)
    const delta = currentValue != null && comparisonValue != null ? currentValue - comparisonValue : null

    cards.push(
      {
        label: `${comparisonLabel} aligned`,
        value: formatMetricValue(metricOption.id, comparisonValue),
        detail: `${comparisonLabel} at aligned slot ${comparisonSlot + 1}.`,
      },
      {
        label: 'Current delta',
        value: formatMetricDelta(metricOption.id, delta),
        detail: `${compareMode === 'delta' ? 'Delta chart active.' : 'Table delta available.'} Primary minus aligned comparison.`,
      },
    )
    return cards
  }

  cards.push(
    {
      label: 'Current slot',
      value: `Slot ${slot + 1}`,
      detail: `${totalSlots.toLocaleString()} total slots in this payload.`,
    },
    {
      label: 'Query mode',
      value: compareMode === 'absolute' ? 'Absolute' : compareMode === 'overlay' ? 'Overlay' : 'Delta',
      detail: 'Comparison modes activate automatically when a second dataset is present.',
    },
  )
  return cards
}

export function buildAnalyticsBlocks({
  analyticsView,
  queryMetric,
  compareMode,
  primaryPayload,
  primarySlot,
  sourceRefs = [],
  primaryLabel = 'Active replay',
  comparisonPayload = null,
  comparisonSlot = 0,
  comparisonLabel = 'Comparison replay',
}: BuildAnalyticsBlocksOptions): readonly Block[] {
  const metricOption = metricOptionOrDefault(analyticsView, queryMetric)
  const blocks: Block[] = []

  if (sourceRefs.length > 0) {
    blocks.push({
      type: 'source',
      refs: [...sourceRefs],
    })
  }

  const primarySeries = {
    label: primaryLabel,
    data: sampleMetricSeries(primaryPayload, metricOption.id),
    color: metricOption.color,
  }
  const comparisonSeries = comparisonPayload
    ? {
        label: comparisonLabel,
        data: sampleMetricSeries(comparisonPayload, metricOption.id),
        color: metricOption.comparisonColor ?? '#64748B',
      }
    : null
  const deltaSeries = comparisonPayload
    ? {
        label: `${primaryLabel} - ${comparisonLabel}`,
        data: sampleMetricDeltaSeries(primaryPayload, comparisonPayload, metricOption.id),
        color: '#0F172A',
      }
    : null

  blocks.push({
    type: 'timeseries',
    title: compareMode === 'delta' && comparisonPayload
      ? `${metricOption.label} delta query`
      : `${metricOption.label} query`,
    series: compareMode === 'delta' && deltaSeries
      ? [deltaSeries]
      : comparisonPayload && compareMode === 'overlay' && comparisonSeries
        ? [primarySeries, comparisonSeries]
        : [primarySeries],
    xLabel: 'Slot',
    yLabel: compareMode === 'delta' && comparisonPayload
      ? `${metricYAxisLabel(metricOption.id)} delta`
      : metricYAxisLabel(metricOption.id),
    annotations: [
      { x: primarySlot + 1, label: `${primaryLabel} slot` },
      ...(comparisonPayload && compareMode === 'overlay'
        ? [{ x: comparisonSlot + 1, label: `${comparisonLabel} slot` }]
        : []),
    ],
  })

  blocks.push(buildComparisonSummaryBlock({
    queryMetric: metricOption.id,
    primaryPayload,
    primarySlot,
    primaryLabel,
    comparisonPayload,
    comparisonSlot,
    comparisonLabel,
  }))

  if (analyticsView === 'geography') {
    const primaryFinalSlot = Math.max(0, totalSlotsFromPayload(primaryPayload) - 1)
    const currentTopRegions = topRegionsForSlot(primaryPayload, primarySlot, 5)
    const finalTopRegions = topRegionsForSlot(primaryPayload, primaryFinalSlot, 5)

    blocks.push({
      type: 'table',
      title: 'Current vs final top regions',
      headers: ['Rank', `Slot ${primarySlot + 1}`, 'Final slot'],
      rows: Array.from({ length: Math.max(currentTopRegions.length, finalTopRegions.length, 3) }, (_, index) => [
        `#${index + 1}`,
        currentTopRegions[index]
          ? `${currentTopRegions[index]!.label} (${formatNumber(currentTopRegions[index]!.share, 1)}%)`
          : 'N/A',
        finalTopRegions[index]
          ? `${finalTopRegions[index]!.label} (${formatNumber(finalTopRegions[index]!.share, 1)}%)`
          : 'N/A',
      ]),
    })
  }

  return blocks
}

export function buildAnalyticsExportRows({
  queryMetric,
  primaryPayload,
  comparisonPayload = null,
}: {
  readonly queryMetric: AnalyticsQueryMetric
  readonly primaryPayload: PublishedAnalyticsPayload
  readonly comparisonPayload?: PublishedAnalyticsPayload | null
}): readonly AnalyticsExportRow[] {
  const primarySeries = analyticsMetricSeriesForPayload(primaryPayload, queryMetric)
  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const comparisonSeries = comparisonPayload
    ? analyticsMetricSeriesForPayload(comparisonPayload, queryMetric)
    : undefined
  const comparisonTotalSlots = comparisonPayload
    ? totalSlotsFromPayload(comparisonPayload)
    : 0

  return Array.from({ length: primaryTotalSlots }, (_, primarySlotIndex) => {
    const primaryValue = readMetricValue(primarySeries, primarySlotIndex)
    const comparisonSlotIndex = comparisonPayload
      ? alignSlotByProgress(primarySlotIndex, primaryTotalSlots, comparisonTotalSlots)
      : null
    const comparisonValue = comparisonSlotIndex != null
      ? readMetricValue(comparisonSeries, comparisonSlotIndex)
      : null

    return {
      slot: primarySlotIndex + 1,
      slotIndex: primarySlotIndex,
      progressPercent: slotProgressPercent(primarySlotIndex, primaryTotalSlots),
      primaryValue: roundExportNumber(primaryValue),
      comparisonSlot: comparisonSlotIndex != null ? comparisonSlotIndex + 1 : null,
      comparisonSlotIndex,
      comparisonProgressPercent: comparisonSlotIndex != null
        ? slotProgressPercent(comparisonSlotIndex, comparisonTotalSlots)
        : null,
      comparisonValue: roundExportNumber(comparisonValue),
      deltaValue: roundExportNumber(
        primaryValue != null && comparisonValue != null
          ? primaryValue - comparisonValue
          : null,
      ),
    }
  })
}

export function buildAnalyticsExportBundle({
  analyticsView,
  queryMetric,
  compareMode,
  primaryPayload,
  primarySlot,
  sourceRefs = [],
  primaryLabel = 'Active replay',
  comparisonPayload = null,
  comparisonSlot = 0,
  comparisonLabel = 'Comparison replay',
  shareUrl,
  exportedAt = new Date().toISOString(),
}: BuildAnalyticsExportOptions): AnalyticsExportBundle {
  const metricOption = metricOptionOrDefault(analyticsView, queryMetric)
  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const comparisonTotalSlots = comparisonPayload
    ? totalSlotsFromPayload(comparisonPayload)
    : null
  const primaryValue = metricValueForPayload(primaryPayload, metricOption.id, primarySlot)
  const comparisonValue = comparisonPayload
    ? metricValueForPayload(comparisonPayload, metricOption.id, comparisonSlot)
    : null
  const deltaValue = primaryValue != null && comparisonValue != null
    ? primaryValue - comparisonValue
    : null

  return {
    format: 'simulation-analytics-query/v1',
    exportedAt,
    shareUrl: shareUrl ?? null,
    query: {
      analyticsView,
      analyticsViewLabel: ANALYTICS_VIEW_OPTIONS.find(option => option.id === analyticsView)?.label ?? analyticsView,
      analyticsMetric: metricOption.id,
      analyticsMetricLabel: metricOption.label,
      compareMode,
      primaryLabel,
      primaryDescription: primaryPayload.description ?? null,
      primarySlot: primarySlot + 1,
      primarySlotIndex: primarySlot,
      primaryTotalSlots,
      comparisonLabel: comparisonPayload ? comparisonLabel : null,
      comparisonDescription: comparisonPayload?.description ?? null,
      comparisonSlot: comparisonPayload ? comparisonSlot + 1 : null,
      comparisonSlotIndex: comparisonPayload ? comparisonSlot : null,
      comparisonTotalSlots,
    },
    currentReadout: {
      primaryValue: roundExportNumber(primaryValue),
      primaryValueFormatted: formatMetricValue(metricOption.id, primaryValue),
      comparisonValue: roundExportNumber(comparisonValue),
      comparisonValueFormatted: comparisonPayload
        ? formatMetricValue(metricOption.id, comparisonValue)
        : null,
      deltaValue: roundExportNumber(deltaValue),
      deltaValueFormatted: comparisonPayload
        ? formatMetricDelta(metricOption.id, deltaValue)
        : null,
    },
    sourceRefs: [...sourceRefs],
    rows: buildAnalyticsExportRows({
      queryMetric: metricOption.id,
      primaryPayload,
      comparisonPayload,
    }),
  }
}

export function buildAnalyticsExportCsv(bundle: AnalyticsExportBundle): string {
  const headers = [
    'slot',
    'slot_index',
    'progress_pct',
    'primary_value',
    'comparison_slot',
    'comparison_slot_index',
    'comparison_progress_pct',
    'comparison_value',
    'delta_value',
  ]

  const rows = bundle.rows.map(row => [
    row.slot,
    row.slotIndex,
    row.progressPercent,
    row.primaryValue,
    row.comparisonSlot,
    row.comparisonSlotIndex,
    row.comparisonProgressPercent,
    row.comparisonValue,
    row.deltaValue,
  ].map(csvEscape).join(','))

  return [headers.join(','), ...rows].join('\n')
}
