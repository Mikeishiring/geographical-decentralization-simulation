import type { Block } from '../../../types/blocks'
import { GCP_REGIONS, type MacroRegion } from '../../../data/gcp-regions'
import {
  ACTION_REASON_GROUP_ORDER,
  CONTINENT_ORDER,
  actionReasonGroupLabel,
  type ActionReasonEntry,
  type ActionReasonGroup,
  type Continent,
  type IncubatorPublishedAnalyticsPayload,
  type PaperGeographyMetrics,
  type RegionProfitEntry,
  type ValidatorMetricMatrix,
} from './csvArtifacts'

const ACTION_REASON_COLORS: Readonly<Record<ActionReasonGroup, string>> = {
  utility_improved: '#2563EB',
  utility_not_improved: '#64748B',
  migration_cost_high: '#C2553A',
  migrating_or_on_cooldown: '#D97706',
  home_staker: '#0F766E',
  never_migrate_strategy: '#7C3AED',
  no_applicable_strategy: '#475569',
  other: '#94A3B8',
}

const CONTINENT_COLORS: Readonly<Record<string, string>> = {
  'North America': '#2563EB',
  Europe: '#0F766E',
  Asia: '#D97706',
  'Asia Pacific': '#D97706',
  'Middle East': '#C2553A',
  Oceania: '#7C3AED',
  'South America': '#0891B2',
  Africa: '#BE185D',
  Other: '#64748B',
}

const TOPOLOGY_COLORS = {
  totalDistance: '#C2553A',
  avgNnd: '#0891B2',
  nni: '#0D9488',
  relayDist: '#EA580C',
} as const

const MACRO_REGION_ORDER: readonly MacroRegion[] = [
  'North America',
  'Europe',
  'Asia Pacific',
  'Middle East',
  'South America',
  'Africa',
  'Oceania',
] as const

const REGION_LOOKUP = new Map(GCP_REGIONS.map(region => [region.id, region] as const))

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, '')}%`
}

function formatNumber(value: number, maximumFractionDigits = 4): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })
}

function formatSlotWindow(startSlot: number, endSlot: number): string {
  return startSlot === endSlot
    ? `S${startSlot + 1}`
    : `S${startSlot + 1}-${endSlot + 1}`
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance) / mean
}

function giniCoefficient(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const total = sorted.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (total <= 0) return 0
  const weightedSum = sorted.reduce((sum, value, index) => sum + ((index + 1) * Math.max(0, value)), 0)
  return (2 * weightedSum) / (sorted.length * total) - (sorted.length + 1) / sorted.length
}

function presentContinents(entries: readonly { continent: Continent }[]): string[] {
  const present = new Set(entries.map(entry => entry.continent))
  const ordered = CONTINENT_ORDER.filter(continent => present.has(continent))
  return present.has('Other') ? [...ordered, 'Other'] : ordered
}

function actionGroupsInUse(entries: readonly ActionReasonEntry[]): ActionReasonGroup[] {
  const present = new Set(entries.map(entry => entry.actionGroup))
  return ACTION_REASON_GROUP_ORDER.filter(group => present.has(group))
}

function buildWindowBuckets(totalSlots: number, preferredBucketCount = 12): readonly {
  readonly startSlot: number
  readonly endSlot: number
}[] {
  if (totalSlots <= 0) return []
  const bucketCount = Math.max(1, Math.min(preferredBucketCount, totalSlots))
  const bucketSize = Math.max(1, Math.ceil(totalSlots / bucketCount))
  const buckets: { startSlot: number; endSlot: number }[] = []

  for (let startSlot = 0; startSlot < totalSlots; startSlot += bucketSize) {
    const endSlot = Math.min(totalSlots - 1, startSlot + bucketSize - 1)
    buckets.push({ startSlot, endSlot })
  }

  return buckets
}

function profitContinents(entries: readonly RegionProfitEntry[]): string[] {
  const present = new Set(entries.map(entry => entry.continent))
  const ordered = CONTINENT_ORDER.filter(continent => present.has(continent))
  return present.has('Other') ? [...ordered, 'Other'] : ordered
}

function orderedSlotNumbers(entries: readonly RegionProfitEntry[]): number[] {
  return [...new Set(entries.map(entry => entry.slot))].sort((left, right) => left - right)
}

function slotProfitByContinent(entries: readonly RegionProfitEntry[]): Map<number, Map<string, number>> {
  const slots = new Map<number, Map<string, number>>()

  for (const entry of entries) {
    const continentMap = slots.get(entry.slot) ?? new Map<string, number>()
    const currentValue = continentMap.get(entry.continent) ?? Number.NEGATIVE_INFINITY
    continentMap.set(entry.continent, Math.max(currentValue, entry.mevOffer))
    slots.set(entry.slot, continentMap)
  }

  return slots
}

function readMetricAtSlot(series: readonly number[], slot: number): number | null {
  if (series.length === 0) return null
  const value = series[Math.max(0, Math.min(slot, series.length - 1))]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function haversineDistanceKm(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
): number {
  const earthRadiusKm = 6371
  const lat1 = (start.lat * Math.PI) / 180
  const lat2 = (end.lat * Math.PI) / 180
  const deltaLat = ((end.lat - start.lat) * Math.PI) / 180
  const deltaLon = ((end.lon - start.lon) * Math.PI) / 180
  const sinLat = Math.sin(deltaLat / 2)
  const sinLon = Math.sin(deltaLon / 2)
  const a = (sinLat ** 2) + (Math.cos(lat1) * Math.cos(lat2) * (sinLon ** 2))
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function slotKeysFromPayload(payload: IncubatorPublishedAnalyticsPayload): number[] {
  return Object.keys(payload.slots ?? {})
    .map(key => Number.parseInt(key, 10))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
}

function numericSeries(value: unknown): readonly number[] {
  return Array.isArray(value)
    ? value.flatMap(item => (typeof item === 'number' && Number.isFinite(item) ? [item] : []))
    : []
}

function nestedNumericSeries(value: unknown): ReadonlyArray<readonly number[]> {
  if (!Array.isArray(value)) return []
  return value.map(entry => numericSeries(entry)).filter(entry => entry.length > 0)
}

function positiveProposalTimes(values: readonly number[]): number[] {
  return values.flatMap(value => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? [value] : []
  ))
}

function observedAttestationRates(values: readonly number[]): number[] {
  return values.flatMap(value => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? [value] : []
  ))
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function quantile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round(ratio * (sorted.length - 1))))
  return sorted[index] ?? 0
}

function proposalDistributionBins(maxValue: number): ReadonlyArray<{
  readonly label: string
  readonly matches: (value: number) => boolean
}> {
  const upperBound = Math.max(4000, Math.ceil(maxValue / 500) * 500)
  const step = Math.max(500, Math.ceil((upperBound / 5) / 250) * 250)
  const bins = Array.from({ length: 5 }, (_, index) => {
    const lower = index * step
    const upper = lower + step
    return {
      label: `${lower}-${upper} ms`,
      matches: (value: number) => value >= lower && value < upper,
    }
  })

  return [
    ...bins,
    {
      label: `${5 * step}+ ms`,
      matches: (value: number) => value >= 5 * step,
    },
  ]
}

function validatorBandLabels(totalValidators: number, maxBands = 12): ReadonlyArray<{
  readonly label: string
  readonly start: number
  readonly end: number
}> {
  if (totalValidators <= 0) return []
  const bandCount = Math.max(1, Math.min(maxBands, totalValidators))
  const bandSize = Math.max(1, Math.ceil(totalValidators / bandCount))
  const labels: Array<{ label: string; start: number; end: number }> = []

  for (let start = 0; start < totalValidators; start += bandSize) {
    const end = Math.min(totalValidators - 1, start + bandSize - 1)
    labels.push({
      label: `V${start + 1}-${end + 1}`,
      start,
      end,
    })
  }

  return labels
}

export function buildMigrationAuditTrailBlocks(entries: readonly ActionReasonEntry[]): readonly Block[] {
  if (entries.length === 0) return []

  const totalSlots = (entries[entries.length - 1]?.slot ?? -1) + 1
  const groups = actionGroupsInUse(entries)
  const buckets = buildWindowBuckets(totalSlots)
  const migrationEntries = entries.filter(entry => entry.migrated)
  const categories = buckets.map(bucket => formatSlotWindow(bucket.startSlot, bucket.endSlot))
  const stackedSeries = groups.map(group => ({
    label: actionReasonGroupLabel(group),
    color: ACTION_REASON_COLORS[group],
    values: buckets.map(bucket => {
      const bucketEntries = entries.filter(entry => entry.slot >= bucket.startSlot && entry.slot <= bucket.endSlot)
      if (bucketEntries.length === 0) return 0
      const matches = bucketEntries.filter(entry => entry.actionGroup === group).length
      return Number(((matches / bucketEntries.length) * 100).toFixed(1))
    }),
  }))

  const dominantBlockedOutcome = [...groups]
    .filter(group => group !== 'utility_improved')
    .map(group => ({
      group,
      count: entries.filter(entry => entry.actionGroup === group).length,
    }))
    .sort((left, right) => right.count - left.count)[0]
  const migrationRate = entries.length === 0 ? 0 : (migrationEntries.length / entries.length) * 100

  const blocks: Block[] = [
    {
      type: 'insight',
      title: 'Migration audit trail',
      text: migrationEntries.length === 0
        ? 'No proposer decision windows ended in an actual migration in this exact run.'
        : `${formatPercent(migrationRate)} of proposer decision windows ended in an actual migration. The most common non-migration outcome was ${dominantBlockedOutcome ? actionReasonGroupLabel(dominantBlockedOutcome.group).toLowerCase() : 'not recorded'}.`,
      emphasis: 'key-finding',
    },
    {
      type: 'stacked_bar',
      title: 'Migration decision mix by slot window',
      categories,
      series: stackedSeries,
      unit: '%',
    },
  ]

  if (migrationEntries.length > 0) {
    const continents = presentContinents([
      ...migrationEntries.map(entry => ({ continent: entry.previousContinent })),
      ...migrationEntries.map(entry => ({ continent: entry.newContinent })),
    ])
    const values = continents.map(source =>
      continents.map(target =>
        migrationEntries.filter(entry => entry.previousContinent === source && entry.newContinent === target).length,
      ),
    )

    const netFlows = continents
      .map(continent => {
        const outbound = migrationEntries.filter(entry => entry.previousContinent === continent).length
        const inbound = migrationEntries.filter(entry => entry.newContinent === continent).length
        return {
          continent,
          inbound,
          outbound,
          net: inbound - outbound,
        }
      })
      .sort((left, right) => Math.abs(right.net) - Math.abs(left.net))

    blocks.push({
      type: 'heatmap',
      title: 'Migration flow matrix by continent',
      rows: continents,
      columns: continents,
      values,
      colorScale: 'sequential',
      unit: 'moves',
    })
    blocks.push({
      type: 'table',
      title: 'Net migration by continent',
      headers: ['Continent', 'Inbound', 'Outbound', 'Net'],
      rows: netFlows.map(flow => [
        flow.continent,
        flow.inbound.toLocaleString(),
        flow.outbound.toLocaleString(),
        flow.net > 0 ? `+${flow.net.toLocaleString()}` : flow.net.toLocaleString(),
      ]),
      highlight: netFlows.length > 0 ? [0] : undefined,
    })
  }

  blocks.push({
    type: 'caveat',
    text: 'The raw action-reason export does not carry an explicit slot column. These windows use row order, which matches proposer decision order because the simulator appends one decision at each slot setup.',
  })

  return blocks
}

export function buildRegionProfitTrajectoryBlocks(
  entries: readonly RegionProfitEntry[],
  paperMetrics: PaperGeographyMetrics | null,
): readonly Block[] {
  if (entries.length === 0) return []

  const continents = profitContinents(entries)
  const slotNumbers = orderedSlotNumbers(entries)
  const profitBySlot = slotProfitByContinent(entries)
  const cumulativeByContinent = new Map<string, number>()
  const cumulativeSeries = continents.map(continent => ({
    label: continent,
    color: CONTINENT_COLORS[continent] ?? undefined,
    data: [] as { x: number; y: number }[],
  }))
  const cvSeries: { x: number; y: number }[] = []
  const giniSeries: { x: number; y: number }[] = []

  for (const continent of continents) {
    cumulativeByContinent.set(continent, 0)
  }

  for (const slot of slotNumbers) {
    const continentValues = continents.map(continent => profitBySlot.get(slot)?.get(continent) ?? 0)

    continents.forEach((continent, index) => {
      const nextValue = (cumulativeByContinent.get(continent) ?? 0) + continentValues[index]!
      cumulativeByContinent.set(continent, nextValue)
      cumulativeSeries[index]!.data.push({ x: slot + 1, y: Number(nextValue.toFixed(6)) })
    })

    const cvValue = readMetricAtSlot(paperMetrics?.profitVariance ?? [], slot) ?? coefficientOfVariation(continentValues)
    cvSeries.push({ x: slot + 1, y: Number(cvValue.toFixed(6)) })
    giniSeries.push({ x: slot + 1, y: Number(giniCoefficient(continentValues).toFixed(6)) })
  }

  const finalRows = continents
    .map(continent => ({
      continent,
      cumulativeProfit: cumulativeByContinent.get(continent) ?? 0,
      finalSlotProfit: profitBySlot.get(slotNumbers[slotNumbers.length - 1] ?? 0)?.get(continent) ?? 0,
    }))
    .sort((left, right) => right.cumulativeProfit - left.cumulativeProfit)

  const leader = finalRows[0]
  const runnerUp = finalRows[1]
  const summary = leader
    ? `${leader.continent} finishes with the highest cumulative regional MEV estimate at ${formatNumber(leader.cumulativeProfit)} ETH${runnerUp ? `, ahead of ${runnerUp.continent} by ${formatNumber(leader.cumulativeProfit - runnerUp.cumulativeProfit)} ETH` : ''}.`
    : 'No per-continent profit totals were available for this exact run.'

  return [
    {
      type: 'insight',
      title: 'Per-region profit trajectories',
      text: summary,
      emphasis: 'key-finding',
    },
    {
      type: 'timeseries',
      title: 'Cumulative best MEV estimate by continent',
      xLabel: 'Slot',
      yLabel: 'ETH',
      series: cumulativeSeries,
    },
    {
      type: 'timeseries',
      title: 'Geographic profit variance (CV_g)',
      xLabel: 'Slot',
      yLabel: 'Coefficient of variation',
      series: [
        {
          label: 'CV_g',
          color: '#C2553A',
          data: cvSeries,
        },
      ],
    },
    {
      type: 'timeseries',
      title: 'Geographic profit Gini by continent',
      xLabel: 'Slot',
      yLabel: 'Gini',
      series: [
        {
          label: 'Profit Gini',
          color: '#2563EB',
          data: giniSeries,
        },
      ],
    },
    {
      type: 'table',
      title: 'Final cumulative profit leaderboard',
      headers: ['Continent', 'Cumulative ETH', 'Final-slot ETH'],
      rows: finalRows.map(row => [
        row.continent,
        formatNumber(row.cumulativeProfit),
        formatNumber(row.finalSlotProfit),
      ]),
      highlight: finalRows.length > 0 ? [0] : undefined,
    },
    {
      type: 'caveat',
      text: 'Per-slot continent values use the maximum `mev_offer` observed within each continent, matching the repo\'s existing preprocessing and paper-metric scripts rather than summing every candidate row.',
    },
  ]
}

export function buildSpatialTopologyBlocks(
  payload: IncubatorPublishedAnalyticsPayload | null,
): readonly Block[] {
  const metrics = payload?.metrics
  if (!metrics) return []

  const totalDistance = numericSeries(metrics.total_distance)
  const avgNnd = numericSeries(metrics.avg_nnd)
  const nni = numericSeries(metrics.nni)
  if (totalDistance.length === 0 && avgNnd.length === 0 && nni.length === 0) {
    return []
  }

  const finalNni = nni.length > 0 ? nni[nni.length - 1] ?? null : null
  const nniRead = finalNni == null
    ? 'No NNI output was present in this payload.'
    : finalNni < 1
      ? `NNI finishes at ${formatNumber(finalNni, 3)}, which still reads as clustered rather than evenly dispersed.`
      : `NNI finishes at ${formatNumber(finalNni, 3)}, which reads as a more dispersed final topology.`

  const blocks: Block[] = [
    {
      type: 'insight',
      title: 'Spatial topology metrics',
      text: nniRead,
      emphasis: 'key-finding',
    },
  ]

  const statRows = [
    {
      key: 'distance',
      label: 'Total distance',
      value: totalDistance.length > 0 ? formatNumber(totalDistance[totalDistance.length - 1] ?? 0, 0) : 'N/A',
      sublabel: 'Final slot spread',
    },
    {
      key: 'avg-nnd',
      label: 'Avg nearest-neighbor distance',
      value: avgNnd.length > 0 ? formatNumber(avgNnd[avgNnd.length - 1] ?? 0, 3) : 'N/A',
      sublabel: 'Final local spacing',
    },
    {
      key: 'nni',
      label: 'NNI',
      value: finalNni != null ? formatNumber(finalNni, 3) : 'N/A',
      sublabel: '< 1 clustered, > 1 dispersed',
    },
  ]

  blocks.push(...statRows.map(item => ({
    type: 'stat' as const,
    value: item.value,
    label: item.label,
    sublabel: item.sublabel,
  })))

  if (totalDistance.length > 0) {
    blocks.push({
      type: 'timeseries',
      title: 'Total validator distance',
      xLabel: 'Slot',
      yLabel: 'Distance',
      series: [
        {
          label: 'Total distance',
          color: TOPOLOGY_COLORS.totalDistance,
          data: totalDistance.map((value, index) => ({ x: index + 1, y: value })),
        },
      ],
    })
  }

  if (avgNnd.length > 0) {
    blocks.push({
      type: 'timeseries',
      title: 'Average nearest-neighbor distance',
      xLabel: 'Slot',
      yLabel: 'Distance',
      series: [
        {
          label: 'Avg NND',
          color: TOPOLOGY_COLORS.avgNnd,
          data: avgNnd.map((value, index) => ({ x: index + 1, y: value })),
        },
      ],
    })
  }

  if (nni.length > 0) {
    blocks.push({
      type: 'timeseries',
      title: 'Nearest-neighbor index (NNI)',
      xLabel: 'Slot',
      yLabel: 'NNI',
      series: [
        {
          label: 'NNI',
          color: TOPOLOGY_COLORS.nni,
          data: nni.map((value, index) => ({ x: index + 1, y: value })),
        },
      ],
    })
  }

  blocks.push({
    type: 'caveat',
    text: 'These metrics already exist in the published-style payload but are not exposed by the current live analytics metric picker. This incubator keeps the wiring isolated until activation.',
  })

  return blocks
}

export function buildSourceProximityBlocks(
  payload: IncubatorPublishedAnalyticsPayload | null,
): readonly Block[] {
  if (!payload?.sources?.length || !payload.slots) return []

  const sourceRegions = payload.sources
    .map(source => REGION_LOOKUP.get(source[1]))
    .filter((region): region is NonNullable<typeof region> => Boolean(region))
  if (sourceRegions.length === 0) return []

  const nearestSourceDistanceByRegion = new Map<string, number>()
  for (const region of GCP_REGIONS) {
    const nearest = Math.min(...sourceRegions.map(source => haversineDistanceKm(region, source)))
    nearestSourceDistanceByRegion.set(region.id, nearest)
  }

  const slotKeys = slotKeysFromPayload(payload)
  const regionSeries = new Map<string, Array<{ x: number; y: number }>>(
    MACRO_REGION_ORDER.map(region => [region, []]),
  )

  for (const slot of slotKeys) {
    const slotEntries = payload.slots[String(slot)] ?? []
    const totals = new Map<string, { weightedDistance: number; validators: number }>()

    for (const [regionId, countValue] of slotEntries) {
      const count = Number(countValue) || 0
      if (count <= 0) continue
      const region = REGION_LOOKUP.get(regionId)
      if (!region) continue
      const nearestDistance = nearestSourceDistanceByRegion.get(regionId)
      if (nearestDistance == null) continue

      const current = totals.get(region.macroRegion) ?? { weightedDistance: 0, validators: 0 }
      current.weightedDistance += nearestDistance * count
      current.validators += count
      totals.set(region.macroRegion, current)
    }

    for (const macroRegion of MACRO_REGION_ORDER) {
      const aggregate = totals.get(macroRegion)
      if (!aggregate || aggregate.validators <= 0) continue
      regionSeries.get(macroRegion)?.push({
        x: slot + 1,
        y: aggregate.weightedDistance / aggregate.validators,
      })
    }
  }

  const multiLineSeries = MACRO_REGION_ORDER.flatMap(macroRegion => {
    const data = regionSeries.get(macroRegion) ?? []
    return data.length > 0
      ? [{
          label: macroRegion,
          color: CONTINENT_COLORS[macroRegion] ?? undefined,
          data,
        }]
      : []
  })

  if (multiLineSeries.length === 0) return []

  const sourceCounts = new Map<string, number>()
  for (const region of sourceRegions) {
    sourceCounts.set(region.macroRegion, (sourceCounts.get(region.macroRegion) ?? 0) + 1)
  }

  const rawInfoVectors = nestedNumericSeries(payload.metrics?.info_avg_distance)
  const averageSourceDistanceSeries = rawInfoVectors.map((values, index) => ({
    x: index + 1,
    y: values.length > 0 ? (values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
  }))

  const finalLeaders = multiLineSeries
    .flatMap(series => {
      const finalValue = series.data[series.data.length - 1]?.y
      return finalValue == null
        ? []
        : [{ label: series.label, finalValue }]
    })
    .sort((left, right) => left.finalValue - right.finalValue)

  const nearest = finalLeaders[0]
  const farthest = finalLeaders[finalLeaders.length - 1]
  const summary = nearest && farthest
    ? `${nearest.label} ends closest to the nearest information source at ${formatNumber(nearest.finalValue, 0)} km, while ${farthest.label} ends farthest at ${formatNumber(farthest.finalValue, 0)} km.`
    : 'Derived nearest-source distance lines were available, but no final regional comparison could be formed.'

  const blocks: Block[] = [
    {
      type: 'insight',
      title: 'Information source distance',
      text: summary,
      emphasis: 'key-finding',
    },
    {
      type: 'timeseries',
      title: 'Nearest information-source distance by macro region',
      xLabel: 'Slot',
      yLabel: 'Kilometers',
      series: multiLineSeries,
    },
    {
      type: 'chart',
      title: 'Source footprint by macro region',
      chartType: 'bar',
      data: MACRO_REGION_ORDER
        .map(region => ({ label: region, value: sourceCounts.get(region) ?? 0 }))
        .filter(entry => entry.value > 0),
    },
  ]

  if (averageSourceDistanceSeries.length > 0) {
    blocks.push({
      type: 'timeseries',
      title: 'Average validator distance to each source',
      xLabel: 'Slot',
      yLabel: 'Distance',
      series: [
        {
          label: 'Mean source distance',
          color: TOPOLOGY_COLORS.relayDist,
          data: averageSourceDistanceSeries,
        },
      ],
    })
  }

  blocks.push({
    type: 'caveat',
    text: 'The macro-region chart is derived from slot-level region counts and source coordinates using nearest-source great-circle distance. The raw `info_avg_distance` vector is preserved separately as an all-validators-to-each-source readout.',
  })

  return blocks
}

export function buildPerValidatorDistributionBlocks(
  proposalTimeBySlot: ValidatorMetricMatrix,
  attestBySlot: ValidatorMetricMatrix,
): readonly Block[] {
  const totalSlots = Math.max(proposalTimeBySlot.length, attestBySlot.length)
  if (totalSlots === 0) return []

  const buckets = buildWindowBuckets(totalSlots, 16)
  const allProposalTimes = proposalTimeBySlot.flatMap(slotValues => positiveProposalTimes(slotValues))
  const allAttestationRates = attestBySlot.flatMap(slotValues => observedAttestationRates(slotValues))
  const totalValidators = Math.max(
    0,
    ...proposalTimeBySlot.map(slotValues => slotValues.length),
    ...attestBySlot.map(slotValues => slotValues.length),
  )

  const blocks: Block[] = []
  const weakestAttestation = allAttestationRates.length > 0 ? Math.min(...allAttestationRates) : null
  const proposalP90 = allProposalTimes.length > 0 ? quantile(allProposalTimes, 0.9) : null

  blocks.push({
    type: 'insight',
    title: 'Per-validator distributions',
    text: allProposalTimes.length === 0
      ? 'The raw validator traces are present, but no positive proposal timings were recorded in this payload.'
      : `These traces are sparse by design: only the active proposer records a positive timing each slot. Across ${allProposalTimes.length.toLocaleString()} observed proposer slots, proposal-time p90 reaches ${formatNumber(proposalP90 ?? 0, 0)} ms${weakestAttestation != null ? ` and the weakest observed proposer attestation rate is ${formatNumber(weakestAttestation, 1)}%.` : '.'}`,
    emphasis: 'key-finding',
  })

  if (allProposalTimes.length > 0) {
    const bins = proposalDistributionBins(Math.max(...allProposalTimes))
    blocks.push({
      type: 'heatmap',
      title: 'Proposal-time distribution by slot window',
      rows: bins.map(bin => bin.label),
      columns: buckets.map(bucket => formatSlotWindow(bucket.startSlot, bucket.endSlot)),
      values: bins.map(bin => buckets.map(bucket => {
        const windowValues = proposalTimeBySlot
          .slice(bucket.startSlot, bucket.endSlot + 1)
          .flatMap(slotValues => positiveProposalTimes(slotValues))
        if (windowValues.length === 0) return 0
        const matches = windowValues.filter(bin.matches).length
        return Number(((matches / windowValues.length) * 100).toFixed(1))
      })),
      colorScale: 'sequential',
      unit: '% of proposer slots',
    })

    blocks.push({
      type: 'table',
      title: 'Proposal timing quantiles by slot window',
      headers: ['Window', 'Observed proposer slots', 'Median', 'P90', 'P99', 'Max'],
      rows: buckets.map(bucket => {
        const windowValues = proposalTimeBySlot
          .slice(bucket.startSlot, bucket.endSlot + 1)
          .flatMap(slotValues => positiveProposalTimes(slotValues))

        return [
          formatSlotWindow(bucket.startSlot, bucket.endSlot),
          windowValues.length.toLocaleString(),
          windowValues.length > 0 ? `${formatNumber(quantile(windowValues, 0.5), 0)} ms` : 'N/A',
          windowValues.length > 0 ? `${formatNumber(quantile(windowValues, 0.9), 0)} ms` : 'N/A',
          windowValues.length > 0 ? `${formatNumber(quantile(windowValues, 0.99), 0)} ms` : 'N/A',
          windowValues.length > 0 ? `${formatNumber(Math.max(...windowValues), 0)} ms` : 'N/A',
        ]
      }),
    })
  }

  if (allAttestationRates.length > 0 && totalValidators > 0) {
    const bands = validatorBandLabels(totalValidators)
    blocks.push({
      type: 'heatmap',
      title: 'Proposer attestation shortfall by validator band and slot window',
      rows: bands.map(band => band.label),
      columns: buckets.map(bucket => formatSlotWindow(bucket.startSlot, bucket.endSlot)),
      values: bands.map(band => buckets.map(bucket => {
        const failures: number[] = []

        for (let slot = bucket.startSlot; slot <= bucket.endSlot; slot += 1) {
          const slotValues = attestBySlot[slot] ?? []
          for (let validatorIndex = band.start; validatorIndex <= band.end; validatorIndex += 1) {
            const value = slotValues[validatorIndex]
            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
            failures.push(Math.max(0, 100 - value))
          }
        }

        return Number(average(failures).toFixed(1))
      })),
      colorScale: 'sequential',
      unit: 'Avg failure points',
    })
  }

  blocks.push({
    type: 'caveat',
    text: 'The proposal and attestation matrices are downsampled into slot windows to stay renderable. Zero or negative values are treated as inactive non-proposer entries, so these views emphasize proposer rotation and tail behavior rather than a dense all-validator latency field.',
  })

  return blocks
}
