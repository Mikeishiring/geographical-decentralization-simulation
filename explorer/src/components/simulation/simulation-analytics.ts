import type { Block, SourceBlock } from '../../types/blocks'
import { formatNumber } from './simulation-constants'

export type AnalyticsDeckView = 'concentration' | 'latency' | 'economics' | 'geography'

export interface AnalyticsViewOption {
  readonly id: AnalyticsDeckView
  readonly label: string
  readonly description: string
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
  readonly primaryPayload: PublishedAnalyticsPayload
  readonly primarySlot: number
  readonly sourceRefs?: readonly SourceBlock['refs'][number][]
  readonly primaryLabel?: string
  readonly comparisonPayload?: PublishedAnalyticsPayload | null
  readonly comparisonSlot?: number
  readonly comparisonLabel?: string
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

export function parseAnalyticsDeckView(value: string | null): AnalyticsDeckView | undefined {
  return value === 'concentration' || value === 'latency' || value === 'economics' || value === 'geography'
    ? value
    : undefined
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

function sampleActiveRegionsSeries(
  payload: PublishedAnalyticsPayload | null,
  maxPoints = 240,
): Array<{ x: number; y: number }> {
  if (!payload?.slots) return []

  const totalSlots = totalSlotsFromPayload(payload)
  const step = Math.max(1, Math.ceil(totalSlots / maxPoints))
  const points: Array<{ x: number; y: number }> = []

  for (let slotIndex = 0; slotIndex < totalSlots; slotIndex += step) {
    const slotRegions = payload.slots[String(slotIndex)] ?? []
    points.push({
      x: slotIndex + 1,
      y: slotRegions.filter(([, count]) => Number(count) > 0).length,
    })
  }

  const finalSlotIndex = Math.max(0, totalSlots - 1)
  if (points[points.length - 1]?.x !== finalSlotIndex + 1) {
    const finalRegions = payload.slots[String(finalSlotIndex)] ?? []
    points.push({
      x: finalSlotIndex + 1,
      y: finalRegions.filter(([, count]) => Number(count) > 0).length,
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

export function buildAnalyticsMetricCards({
  analyticsView,
  payload,
  slot,
}: {
  readonly analyticsView: AnalyticsDeckView
  readonly payload: PublishedAnalyticsPayload | null
  readonly slot: number
}): AnalyticsMetricCard[] {
  if (!payload) return []

  const metrics = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const currentTopRegion = topRegionsForSlot(payload, slot, 1)[0] ?? null
  const finalTopRegion = topRegionsForSlot(payload, finalSlot, 1)[0] ?? null

  switch (analyticsView) {
    case 'latency':
      return [
        {
          label: 'Current liveness',
          value: formatPercentValue(readMetricValue(metrics.liveness, slot)),
          detail: `Exact value at slot ${slot + 1}.`,
        },
        {
          label: 'Current proposal time',
          value: formatOptionalMilliseconds(readMetricValue(metrics.proposal_times, slot)),
          detail: `Proposal timing at slot ${slot + 1}.`,
        },
        {
          label: 'Final failed proposals',
          value: readMetricValue(metrics.failed_block_proposals, finalSlot)?.toLocaleString() ?? 'N/A',
          detail: 'Frozen final-slot failure count.',
        },
        {
          label: 'Final liveness',
          value: formatPercentValue(readMetricValue(metrics.liveness, finalSlot)),
          detail: 'Replay endpoint for network liveness.',
        },
      ]
    case 'economics':
      return [
        {
          label: 'Current MEV',
          value: formatOptionalEth(readMetricValue(metrics.mev, slot)),
          detail: `Exact MEV value at slot ${slot + 1}.`,
        },
        {
          label: 'Final MEV',
          value: formatOptionalEth(readMetricValue(metrics.mev, finalSlot)),
          detail: 'Replay endpoint for value capture.',
        },
        {
          label: 'Current attestation',
          value: readMetricValue(metrics.attestations, slot)?.toLocaleString() ?? 'N/A',
          detail: `Attestation count at slot ${slot + 1}.`,
        },
        {
          label: 'Final clusters',
          value: readMetricValue(metrics.clusters, finalSlot)?.toLocaleString() ?? 'N/A',
          detail: 'Final geographic cluster count.',
        },
      ]
    case 'geography':
      return [
        {
          label: 'Current active regions',
          value: activeRegionCountAtSlot(payload, slot).toLocaleString(),
          detail: `Regions with non-zero validators at slot ${slot + 1}.`,
        },
        {
          label: 'Final active regions',
          value: activeRegionCountAtSlot(payload, finalSlot).toLocaleString(),
          detail: 'Replay endpoint for geographic spread.',
        },
        {
          label: 'Current leader',
          value: currentTopRegion?.label ?? 'N/A',
          detail: currentTopRegion ? `${formatNumber(currentTopRegion.share, 1)}% share.` : 'No dominant region.',
        },
        {
          label: 'Final leader',
          value: finalTopRegion?.label ?? 'N/A',
          detail: finalTopRegion ? `${formatNumber(finalTopRegion.share, 1)}% share.` : 'No dominant region.',
        },
      ]
    case 'concentration':
    default:
      return [
        {
          label: 'Current Gini',
          value: formatIndexValue(readMetricValue(metrics.gini, slot)),
          detail: `Concentration at slot ${slot + 1}.`,
        },
        {
          label: 'Final Gini',
          value: formatIndexValue(readMetricValue(metrics.gini, finalSlot)),
          detail: 'Replay endpoint for concentration.',
        },
        {
          label: 'Current HHI',
          value: formatIndexValue(readMetricValue(metrics.hhi, slot)),
          detail: `HHI at slot ${slot + 1}.`,
        },
        {
          label: 'Active regions now',
          value: activeRegionCountAtSlot(payload, slot).toLocaleString(),
          detail: 'How many regions still retain validators.',
        },
      ]
  }
}

export function buildAnalyticsBlocks({
  analyticsView,
  primaryPayload,
  primarySlot,
  sourceRefs = [],
  primaryLabel = 'Active replay',
  comparisonPayload = null,
  comparisonSlot = 0,
  comparisonLabel = 'Comparison replay',
}: BuildAnalyticsBlocksOptions): readonly Block[] {
  const metrics = primaryPayload.metrics ?? {}
  const finalSlot = Math.max(0, totalSlotsFromPayload(primaryPayload) - 1)
  const currentTopRegions = topRegionsForSlot(primaryPayload, primarySlot, 5)
  const finalTopRegions = topRegionsForSlot(primaryPayload, finalSlot, 5)
  const blocks: Block[] = []

  if (sourceRefs.length > 0) {
    blocks.push({
      type: 'source',
      refs: [...sourceRefs],
    })
  }

  if (analyticsView === 'concentration') {
    blocks.push(
      {
        type: 'timeseries',
        title: 'Concentration query',
        series: [
          { label: 'Gini', data: sampleSeries(metrics.gini), color: '#C2553A' },
          { label: 'HHI', data: sampleSeries(metrics.hhi), color: '#2563EB' },
        ],
        xLabel: 'Slot',
        yLabel: 'Index',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
      {
        type: 'timeseries',
        title: 'Active-region spread',
        series: [
          { label: 'Active regions', data: sampleActiveRegionsSeries(primaryPayload), color: '#0F766E' },
        ],
        xLabel: 'Slot',
        yLabel: 'Regions',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
    )
  }

  if (analyticsView === 'latency') {
    blocks.push(
      {
        type: 'timeseries',
        title: 'Liveness query',
        series: [
          { label: 'Liveness', data: sampleSeries(metrics.liveness), color: '#16A34A' },
        ],
        xLabel: 'Slot',
        yLabel: 'Percent',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
      {
        type: 'timeseries',
        title: 'Proposal-time query',
        series: [
          { label: 'Proposal time', data: sampleSeries(metrics.proposal_times), color: '#D97706' },
        ],
        xLabel: 'Slot',
        yLabel: 'Milliseconds',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
    )
  }

  if (analyticsView === 'economics') {
    blocks.push(
      {
        type: 'timeseries',
        title: 'MEV query',
        series: [
          { label: 'MEV', data: sampleSeries(metrics.mev), color: '#2563EB' },
        ],
        xLabel: 'Slot',
        yLabel: 'ETH',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
      {
        type: 'timeseries',
        title: 'Attestation output',
        series: [
          { label: 'Attestations', data: sampleSeries(metrics.attestations), color: '#0F766E' },
        ],
        xLabel: 'Slot',
        yLabel: 'Count',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
    )
  }

  if (analyticsView === 'geography') {
    blocks.push(
      {
        type: 'timeseries',
        title: 'Geographic spread query',
        series: [
          { label: 'Active regions', data: sampleActiveRegionsSeries(primaryPayload), color: '#7C3AED' },
        ],
        xLabel: 'Slot',
        yLabel: 'Regions',
        annotations: [{ x: primarySlot + 1, label: 'Current slot' }],
      },
      {
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
      },
    )
  }

  if (comparisonPayload) {
    const compareMetrics = comparisonPayload.metrics ?? {}
    const compareTopRegion = topRegionsForSlot(comparisonPayload, comparisonSlot, 1)[0] ?? null

    blocks.push({
      type: 'table',
      title: 'Current query comparison',
      headers: ['Metric', primaryLabel, comparisonLabel],
      rows: analyticsView === 'latency'
        ? [
            ['Liveness', formatPercentValue(readMetricValue(metrics.liveness, primarySlot)), formatPercentValue(readMetricValue(compareMetrics.liveness, comparisonSlot))],
            ['Proposal time', formatOptionalMilliseconds(readMetricValue(metrics.proposal_times, primarySlot)), formatOptionalMilliseconds(readMetricValue(compareMetrics.proposal_times, comparisonSlot))],
            ['Failed proposals', readMetricValue(metrics.failed_block_proposals, primarySlot)?.toLocaleString() ?? 'N/A', readMetricValue(compareMetrics.failed_block_proposals, comparisonSlot)?.toLocaleString() ?? 'N/A'],
          ]
        : analyticsView === 'economics'
          ? [
              ['MEV', formatOptionalEth(readMetricValue(metrics.mev, primarySlot)), formatOptionalEth(readMetricValue(compareMetrics.mev, comparisonSlot))],
              ['Attestations', readMetricValue(metrics.attestations, primarySlot)?.toLocaleString() ?? 'N/A', readMetricValue(compareMetrics.attestations, comparisonSlot)?.toLocaleString() ?? 'N/A'],
              ['Clusters', readMetricValue(metrics.clusters, primarySlot)?.toLocaleString() ?? 'N/A', readMetricValue(compareMetrics.clusters, comparisonSlot)?.toLocaleString() ?? 'N/A'],
            ]
          : analyticsView === 'geography'
            ? [
                ['Active regions', activeRegionCountAtSlot(primaryPayload, primarySlot).toLocaleString(), activeRegionCountAtSlot(comparisonPayload, comparisonSlot).toLocaleString()],
                ['Leading region', currentTopRegions[0]?.label ?? 'N/A', compareTopRegion?.label ?? 'N/A'],
                ['Leading share', currentTopRegions[0] ? `${formatNumber(currentTopRegions[0]!.share, 1)}%` : 'N/A', compareTopRegion ? `${formatNumber(compareTopRegion.share, 1)}%` : 'N/A'],
              ]
            : [
                ['Gini', formatIndexValue(readMetricValue(metrics.gini, primarySlot)), formatIndexValue(readMetricValue(compareMetrics.gini, comparisonSlot))],
                ['HHI', formatIndexValue(readMetricValue(metrics.hhi, primarySlot)), formatIndexValue(readMetricValue(compareMetrics.hhi, comparisonSlot))],
                ['Active regions', activeRegionCountAtSlot(primaryPayload, primarySlot).toLocaleString(), activeRegionCountAtSlot(comparisonPayload, comparisonSlot).toLocaleString()],
              ],
    })
  }

  return blocks
}
