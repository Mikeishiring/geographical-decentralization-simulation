import type { Block } from '../../../types/blocks'
import type { PublishedDatasetPayload } from '../PublishedDatasetViewer'
import type { ResearchDatasetEntry } from '../simulation-lab-types'
import type { SimulationConfig } from '../../../lib/simulation-api'
import {
  alignSlotByProgress,
  analyticsMetricSeriesForPayload,
  totalSlotsFromPayload,
} from '../simulation-analytics'
import {
  CONTINENT_ORDER,
  toContinent,
  type ActionReasonEntry,
  type Continent,
  type PaperGeographyMetrics,
  type RegionCounterBySlot,
  type ValidatorMetricMatrix,
} from './csvArtifacts'

export interface GroundingMetricPeak {
  readonly label: string
  readonly peakValue: number
  readonly peakSlot: number
  readonly finalValue: number
}

export interface ContinentShiftSummary {
  readonly continent: Continent
  readonly startValidators: number
  readonly endValidators: number
  readonly delta: number
}

export interface ExactCopilotGroundingPacket {
  readonly scope: 'exact'
  readonly metricPeaks: readonly GroundingMetricPeak[]
  readonly continentShifts: readonly ContinentShiftSummary[]
  readonly migrationSummary: {
    readonly totalMigrations: number
    readonly earlyWindowMigrations: number
    readonly lateWindowMigrations: number
    readonly blockedByCost: number
  }
  readonly validatorSummary: {
    readonly observedProposerSlots: number
    readonly proposalP90: number | null
    readonly proposalMax: number | null
    readonly weakestAttestationRate: number | null
  }
  readonly promptSuggestions: readonly string[]
}

export interface PublishedCopilotGroundingPacket {
  readonly scope: 'published'
  readonly datasetLabel: string
  readonly comparisonLabel: string | null
  readonly metricPeaks: readonly GroundingMetricPeak[]
  readonly comparisonGaps: ReadonlyArray<{
    readonly label: string
    readonly peakDelta: number
    readonly peakProgressPercent: number
  }>
  readonly continentShifts: readonly ContinentShiftSummary[]
  readonly promptSuggestions: readonly string[]
}

export type ExactGeneratedIntent =
  | 'metric-peaks'
  | 'region-shifts'
  | 'migration-windows'
  | 'validator-distribution'

export type PublishedGeneratedIntent =
  | 'metric-peaks'
  | 'comparison-gaps'
  | 'region-shifts'

const DEFAULT_EXACT_CONFIG: SimulationConfig = {
  paradigm: 'SSP',
  validators: 1000,
  slots: 10000,
  distribution: 'homogeneous',
  sourcePlacement: 'homogeneous',
  migrationCost: 0.002,
  attestationThreshold: 2 / 3,
  slotTime: 12,
  seed: 42,
}

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function positiveValues(values: readonly number[]): number[] {
  return values.flatMap(value => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? [value] : []
  ))
}

function quantile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round(ratio * (sorted.length - 1))))
  return sorted[index] ?? null
}

function buildMetricPeak(
  label: string,
  series: readonly number[] | undefined,
): GroundingMetricPeak | null {
  if (!series?.length) return null

  let peakIndex = 0
  let peakValue = Number.NEGATIVE_INFINITY
  for (let index = 0; index < series.length; index += 1) {
    const value = series[index]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (value > peakValue) {
      peakValue = value
      peakIndex = index
    }
  }

  if (!Number.isFinite(peakValue)) return null

  const finalValue = series[series.length - 1] ?? peakValue
  return {
    label,
    peakValue,
    peakSlot: peakIndex,
    finalValue,
  }
}

function continentCounts(entries: ReadonlyArray<readonly [string, number]>): Map<Continent, number> {
  const counts = new Map<Continent, number>()
  for (const [region, rawCount] of entries) {
    const continent = toContinent(region)
    const count = Number(rawCount) || 0
    counts.set(continent, (counts.get(continent) ?? 0) + count)
  }
  return counts
}

function continentShifts(regionCounterBySlot: RegionCounterBySlot): readonly ContinentShiftSummary[] {
  const slotKeys = Object.keys(regionCounterBySlot)
    .map(key => Number.parseInt(key, 10))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (slotKeys.length === 0) return []

  const firstCounts = continentCounts(regionCounterBySlot[slotKeys[0]!] ?? [])
  const lastCounts = continentCounts(regionCounterBySlot[slotKeys[slotKeys.length - 1]!] ?? [])

  return [...CONTINENT_ORDER, 'Other' as const]
    .map(continent => {
      const startValidators = firstCounts.get(continent) ?? 0
      const endValidators = lastCounts.get(continent) ?? 0
      return {
        continent,
        startValidators,
        endValidators,
        delta: endValidators - startValidators,
      }
    })
    .filter(entry => entry.startValidators > 0 || entry.endValidators > 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
}

function migrationSummary(entries: readonly ActionReasonEntry[]) {
  if (entries.length === 0) {
    return {
      totalMigrations: 0,
      earlyWindowMigrations: 0,
      lateWindowMigrations: 0,
      blockedByCost: 0,
    }
  }

  const totalSlots = (entries[entries.length - 1]?.slot ?? -1) + 1
  const boundary = Math.max(1, Math.floor(totalSlots / 4))
  return {
    totalMigrations: entries.filter(entry => entry.migrated).length,
    earlyWindowMigrations: entries.filter(entry => entry.migrated && entry.slot < boundary).length,
    lateWindowMigrations: entries.filter(entry => entry.migrated && entry.slot >= (totalSlots - boundary)).length,
    blockedByCost: entries.filter(entry => entry.actionGroup === 'migration_cost_high').length,
  }
}

function validatorSummary(
  proposalTimeBySlot: ValidatorMetricMatrix,
  attestBySlot: ValidatorMetricMatrix,
) {
  const proposalValues = proposalTimeBySlot.flatMap(slotValues => positiveValues(slotValues))
  const attestationValues = attestBySlot.flatMap(slotValues => positiveValues(slotValues))

  return {
    observedProposerSlots: proposalValues.length,
    proposalP90: quantile(proposalValues, 0.9),
    proposalMax: proposalValues.length > 0 ? Math.max(...proposalValues) : null,
    weakestAttestationRate: attestationValues.length > 0 ? Math.min(...attestationValues) : null,
  }
}

export function buildExactCopilotGroundingPacket(options: {
  readonly actionReasons: readonly ActionReasonEntry[]
  readonly regionCounterBySlot: RegionCounterBySlot
  readonly paperMetrics: PaperGeographyMetrics | null
  readonly proposalTimeBySlot: ValidatorMetricMatrix
  readonly attestBySlot: ValidatorMetricMatrix
}): ExactCopilotGroundingPacket {
  const metricPeaks = [
    buildMetricPeak('Geographic Gini', options.paperMetrics?.gini),
    buildMetricPeak('Geographic HHI', options.paperMetrics?.hhi),
    buildMetricPeak('Geographic liveness', options.paperMetrics?.liveness),
    buildMetricPeak('Profit variance CV', options.paperMetrics?.profitVariance),
  ].filter((entry): entry is GroundingMetricPeak => Boolean(entry))

  return {
    scope: 'exact',
    metricPeaks,
    continentShifts: continentShifts(options.regionCounterBySlot),
    migrationSummary: migrationSummary(options.actionReasons),
    validatorSummary: validatorSummary(options.proposalTimeBySlot, options.attestBySlot),
    promptSuggestions: [
      'Which continent gained the most validators between the first and final slot?',
      'When did geographic Gini peak in this exact run?',
      'How much migration happened in the first quarter versus the last quarter?',
      'What do the proposer timing tails look like in this exact run?',
    ],
  }
}

function comparisonGap(
  label: string,
  primaryPayload: PublishedDatasetPayload | null,
  comparisonPayload: PublishedDatasetPayload | null,
  metric: 'gini' | 'hhi' | 'liveness',
): { label: string; peakDelta: number; peakProgressPercent: number } | null {
  if (!primaryPayload || !comparisonPayload) return null

  const primarySeries = analyticsMetricSeriesForPayload(primaryPayload, metric)
  const comparisonSeries = analyticsMetricSeriesForPayload(comparisonPayload, metric)
  if (!primarySeries?.length || !comparisonSeries?.length) return null

  const primaryTotalSlots = totalSlotsFromPayload(primaryPayload)
  const comparisonTotalSlots = totalSlotsFromPayload(comparisonPayload)
  let strongest: { label: string; peakDelta: number; peakProgressPercent: number } | null = null

  for (let primarySlot = 0; primarySlot < primaryTotalSlots; primarySlot += 1) {
    const comparisonSlot = alignSlotByProgress(primarySlot, primaryTotalSlots, comparisonTotalSlots)
    const primaryValue = primarySeries[Math.max(0, Math.min(primarySlot, primarySeries.length - 1))]
    const comparisonValue = comparisonSeries[Math.max(0, Math.min(comparisonSlot, comparisonSeries.length - 1))]
    if (!Number.isFinite(primaryValue) || !Number.isFinite(comparisonValue)) continue

    const delta = comparisonValue - primaryValue
    if (!strongest || Math.abs(delta) > Math.abs(strongest.peakDelta)) {
      strongest = {
        label,
        peakDelta: delta,
        peakProgressPercent: primaryTotalSlots <= 1
          ? 100
          : (primarySlot / Math.max(1, primaryTotalSlots - 1)) * 100,
      }
    }
  }

  return strongest
}

export function buildPublishedCopilotGroundingPacket(options: {
  readonly dataset: ResearchDatasetEntry
  readonly payload: PublishedDatasetPayload | null
  readonly comparisonDataset?: ResearchDatasetEntry | null
  readonly comparisonPayload?: PublishedDatasetPayload | null
}): PublishedCopilotGroundingPacket {
  const payload = options.payload
  const comparisonPayload = options.comparisonPayload ?? null
  const metricPeaks = [
    buildMetricPeak('Gini', payload?.metrics?.gini),
    buildMetricPeak('HHI', payload?.metrics?.hhi),
    buildMetricPeak('Liveness', payload?.metrics?.liveness),
    buildMetricPeak('Total distance', payload?.metrics?.total_distance),
    buildMetricPeak('Average nearest-neighbor distance', payload?.metrics?.avg_nnd),
    buildMetricPeak('NNI', payload?.metrics?.nni),
  ].filter((entry): entry is GroundingMetricPeak => Boolean(entry))

  const comparisonGaps = [
    comparisonGap('Gini delta', payload, comparisonPayload, 'gini'),
    comparisonGap('HHI delta', payload, comparisonPayload, 'hhi'),
    comparisonGap('Liveness delta', payload, comparisonPayload, 'liveness'),
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const slotEntries = payload?.slots
    ? Object.fromEntries(Object.entries(payload.slots).map(([slot, entries]) => [Number(slot), entries]))
    : {}

  return {
    scope: 'published',
    datasetLabel: `${options.dataset.evaluation} / ${options.dataset.paradigm} / ${options.dataset.result}`,
    comparisonLabel: options.comparisonDataset
      ? `${options.comparisonDataset.evaluation} / ${options.comparisonDataset.paradigm} / ${options.comparisonDataset.result}`
      : null,
    metricPeaks,
    comparisonGaps,
    continentShifts: continentShifts(slotEntries),
    promptSuggestions: [
      'When does this published replay diverge most from its foil?',
      'Which macro-region gains the most validators by the final slot?',
      'Where do topology metrics peak in this replay?',
      'What is the strongest current-slot difference between this replay and its foil?',
    ],
  }
}

export function buildExactCopilotGeneratedBlocks(
  packet: ExactCopilotGroundingPacket,
  intent: ExactGeneratedIntent,
): readonly Block[] {
  if (intent === 'migration-windows') {
    return [
      {
        type: 'chart',
        title: 'Migration volume by window',
        chartType: 'bar',
        unit: 'migrations',
        data: [
          { label: 'First quarter', value: packet.migrationSummary.earlyWindowMigrations },
          { label: 'Last quarter', value: packet.migrationSummary.lateWindowMigrations },
          { label: 'Cost-blocked checks', value: packet.migrationSummary.blockedByCost },
        ],
      },
      {
        type: 'insight',
        title: 'Generated chart reading',
        text: `The hidden copilot packet can answer migration-window questions directly from action_reasons.csv: ${packet.migrationSummary.totalMigrations.toLocaleString()} migrations overall, with ${packet.migrationSummary.earlyWindowMigrations.toLocaleString()} in the first quarter and ${packet.migrationSummary.lateWindowMigrations.toLocaleString()} in the last quarter.`,
      },
    ]
  }

  if (intent === 'region-shifts') {
    return [
      {
        type: 'chart',
        title: 'Validator shift by continent',
        chartType: 'bar',
        unit: 'validators',
        data: packet.continentShifts.map(entry => ({
          label: entry.continent,
          value: entry.delta,
        })),
      },
      {
        type: 'table',
        title: 'Start vs final continent counts',
        headers: ['Continent', 'Start', 'Final', 'Delta'],
        rows: packet.continentShifts.map(entry => [
          entry.continent,
          entry.startValidators.toLocaleString(),
          entry.endValidators.toLocaleString(),
          entry.delta > 0 ? `+${entry.delta.toLocaleString()}` : entry.delta.toLocaleString(),
        ]),
      },
    ]
  }

  if (intent === 'validator-distribution') {
    return [
      {
        type: 'stat',
        label: 'Observed proposer slots',
        value: packet.validatorSummary.observedProposerSlots.toLocaleString(),
        sublabel: 'Positive proposal timings in the raw trace',
      },
      {
        type: 'stat',
        label: 'Proposal p90',
        value: packet.validatorSummary.proposalP90 != null
          ? `${formatNumber(packet.validatorSummary.proposalP90, 0)} ms`
          : 'N/A',
        sublabel: 'Across observed proposer slots',
      },
      {
        type: 'stat',
        label: 'Weakest attestation rate',
        value: packet.validatorSummary.weakestAttestationRate != null
          ? `${formatNumber(packet.validatorSummary.weakestAttestationRate, 1)}%`
          : 'N/A',
        sublabel: 'Lowest proposer attestation success in trace',
      },
    ]
  }

  return [
    {
      type: 'table',
      title: 'Metric peaks from grounded artifacts',
      headers: ['Metric', 'Peak value', 'Peak slot', 'Final value'],
      rows: packet.metricPeaks.map(entry => [
        entry.label,
        formatNumber(entry.peakValue, 4),
        `S${entry.peakSlot + 1}`,
        formatNumber(entry.finalValue, 4),
      ]),
    },
    {
      type: 'insight',
      title: 'Generated chart reading',
      text: 'This hidden packet turns full exact-run artifacts into structured quantitative answers, so a future copilot activation can answer peak-slot and cross-window questions without relying on only the visible manifest summary.',
    },
  ]
}

export function buildPublishedCopilotGeneratedBlocks(
  packet: PublishedCopilotGroundingPacket,
  intent: PublishedGeneratedIntent,
): readonly Block[] {
  if (intent === 'comparison-gaps') {
    return [
      {
        type: 'table',
        title: 'Peak replay divergence',
        headers: ['Metric', 'Peak delta', 'Progress'],
        rows: packet.comparisonGaps.map(entry => [
          entry.label,
          formatNumber(entry.peakDelta, 4),
          `${formatNumber(entry.peakProgressPercent, 1)}%`,
        ]),
      },
      {
        type: 'insight',
        title: 'Generated chart reading',
        text: packet.comparisonLabel
          ? `This hidden replay packet already knows where ${packet.datasetLabel} diverges most from ${packet.comparisonLabel}.`
          : 'A comparison replay is required before divergence charts can be generated.',
      },
    ]
  }

  if (intent === 'region-shifts') {
    return [
      {
        type: 'chart',
        title: 'Published replay validator shift by continent',
        chartType: 'bar',
        unit: 'validators',
        data: packet.continentShifts.map(entry => ({
          label: entry.continent,
          value: entry.delta,
        })),
      },
      {
        type: 'table',
        title: 'Published replay start vs final continent counts',
        headers: ['Continent', 'Start', 'Final', 'Delta'],
        rows: packet.continentShifts.map(entry => [
          entry.continent,
          entry.startValidators.toLocaleString(),
          entry.endValidators.toLocaleString(),
          entry.delta > 0 ? `+${entry.delta.toLocaleString()}` : entry.delta.toLocaleString(),
        ]),
      },
    ]
  }

  return [
    {
      type: 'table',
      title: 'Published replay metric peaks',
      headers: ['Metric', 'Peak value', 'Peak slot', 'Final value'],
      rows: packet.metricPeaks.map(entry => [
        entry.label,
        formatNumber(entry.peakValue, 4),
        `S${entry.peakSlot + 1}`,
        formatNumber(entry.finalValue, 4),
      ]),
    },
    {
      type: 'insight',
      title: 'Generated chart reading',
      text: 'This hidden replay packet expands the published companion from slot snapshots into full metric-series grounding, so later activation can answer exact peak-slot questions and render chart blocks directly.',
    },
  ]
}

export function buildExpandedProposedConfigs(
  currentConfig: SimulationConfig | null,
): ReadonlyArray<{
  readonly label: string
  readonly reason: string
  readonly config: SimulationConfig
}> {
  const active = currentConfig ?? DEFAULT_EXACT_CONFIG
  const flippedParadigm: SimulationConfig = {
    ...active,
    paradigm: active.paradigm === 'SSP' ? 'MSP' : 'SSP',
  }
  const shiftedSources: SimulationConfig = {
    ...active,
    sourcePlacement: active.sourcePlacement === 'homogeneous'
      ? 'latency-aligned'
      : active.sourcePlacement === 'latency-aligned'
        ? 'latency-misaligned'
        : 'homogeneous',
  }
  const parameterStress: SimulationConfig = {
    ...active,
    migrationCost: active.migrationCost === 0.002 ? 0.003 : 0.002,
    attestationThreshold: active.attestationThreshold >= 0.67 ? 0.5 : 0.8,
    slotTime: active.slotTime === 12 ? 6 : 12,
  }

  return [
    {
      label: 'Paradigm mirror',
      reason: 'Hold every field fixed and flip only the block-building paradigm.',
      config: flippedParadigm,
    },
    {
      label: 'Source-placement sweep',
      reason: 'Keep the current run intact but rotate the information-source placement to the next paper-backed source condition.',
      config: shiftedSources,
    },
    {
      label: 'Stress test',
      reason: 'Bundle the next high-signal parameter stress into one proposal with migration cost, gamma, and slot time all explicit.',
      config: parameterStress,
    },
  ]
}
