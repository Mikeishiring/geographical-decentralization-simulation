export const CONTINENT_ORDER = [
  'North America',
  'Europe',
  'Asia',
  'Middle East',
  'Oceania',
  'South America',
  'Africa',
] as const

export type KnownContinent = typeof CONTINENT_ORDER[number]
export type Continent = KnownContinent | 'Other'

export type ActionReasonGroup =
  | 'utility_improved'
  | 'utility_not_improved'
  | 'migration_cost_high'
  | 'migrating_or_on_cooldown'
  | 'home_staker'
  | 'never_migrate_strategy'
  | 'no_applicable_strategy'
  | 'other'

export interface ActionReasonEntry {
  readonly slot: number
  readonly actionReason: string
  readonly actionGroup: ActionReasonGroup
  readonly previousRegion: string | null
  readonly newRegion: string | null
  readonly previousContinent: Continent
  readonly newContinent: Continent
  readonly migrated: boolean
}

export interface RegionProfitEntry {
  readonly slot: number
  readonly region: string
  readonly continent: Continent
  readonly mevOffer: number
  readonly latencyThreshold: number | null
}

export interface PaperGeographyMetrics {
  readonly gini: readonly number[]
  readonly hhi: readonly number[]
  readonly liveness: readonly number[]
  readonly profitVariance: readonly number[]
}

export type ValidatorMetricMatrix = ReadonlyArray<readonly number[]>
export type RegionCounterBySlot = Readonly<Record<number, ReadonlyArray<readonly [string, number]>>>

export interface IncubatorPublishedAnalyticsPayload {
  readonly v?: number
  readonly description?: string
  readonly n_slots?: number
  readonly metrics?: {
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
    readonly info_avg_distance?: ReadonlyArray<readonly number[]> | readonly number[]
  }
  readonly sources?: ReadonlyArray<readonly [string, string]>
  readonly slots?: Record<string, ReadonlyArray<readonly [string, number]>>
}

const CONTINENT_PREFIXES: ReadonlyArray<readonly [prefix: string, continent: KnownContinent]> = [
  ['northamerica-', 'North America'],
  ['us-', 'North America'],
  ['europe-', 'Europe'],
  ['asia-', 'Asia'],
  ['me-', 'Middle East'],
  ['australia-', 'Oceania'],
  ['southamerica-', 'South America'],
  ['africa-', 'Africa'],
] as const

export const ACTION_REASON_GROUP_ORDER: readonly ActionReasonGroup[] = [
  'utility_improved',
  'utility_not_improved',
  'migration_cost_high',
  'migrating_or_on_cooldown',
  'home_staker',
  'never_migrate_strategy',
  'no_applicable_strategy',
  'other',
] as const

const ACTION_REASON_LABELS: Readonly<Record<ActionReasonGroup, string>> = {
  utility_improved: 'Utility improved',
  utility_not_improved: 'Utility not improved',
  migration_cost_high: 'Migration cost high',
  migrating_or_on_cooldown: 'Migrating or cooldown',
  home_staker: 'Home staker',
  never_migrate_strategy: 'Never migrate strategy',
  no_applicable_strategy: 'No applicable strategy',
  other: 'Other',
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeCell(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      cells.push(normalizeCell(current))
      current = ''
      continue
    }
    current += char
  }

  cells.push(normalizeCell(current))
  return cells
}

function parseCsvMatrix(rawText: string): {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
} {
  const normalized = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return { headers: [], rows: [] }
  }

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = splitCsvLine(lines[0]!)
  const rows = lines
    .slice(1)
    .map(line => splitCsvLine(line))
    .filter(row => row.some(cell => cell.length > 0))

  return { headers, rows }
}

function findColumnIndex(headers: readonly string[], candidates: readonly string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader)
  for (const candidate of candidates) {
    const index = normalizedHeaders.indexOf(normalizeHeader(candidate))
    if (index >= 0) return index
  }
  return -1
}

function readCell(row: readonly string[], index: number): string | null {
  if (index < 0 || index >= row.length) return null
  const value = row[index]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function readNumberCell(row: readonly string[], index: number): number | null {
  const rawValue = readCell(row, index)
  if (rawValue == null) return null
  const value = Number.parseFloat(rawValue)
  return Number.isFinite(value) ? value : null
}

function parseNumericSeries(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item !== 'number' || !Number.isFinite(item)) return []
    return [item]
  })
}

function parseValidatorMetricMatrix(value: unknown): ValidatorMetricMatrix {
  if (!Array.isArray(value)) return []
  return value.map(slotValues => (
    Array.isArray(slotValues)
      ? slotValues.flatMap(item => (
          typeof item === 'number' && Number.isFinite(item) ? [item] : []
        ))
      : []
  ))
}

export function toContinent(regionName: string | null | undefined): Continent {
  const normalized = String(regionName ?? '').trim().toLowerCase()
  for (const [prefix, continent] of CONTINENT_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return continent
    }
  }
  return 'Other'
}

export function actionReasonGroupLabel(group: ActionReasonGroup): string {
  return ACTION_REASON_LABELS[group]
}

export function canonicalizeActionReason(actionReason: string | null | undefined): ActionReasonGroup {
  const normalized = String(actionReason ?? '').trim().toLowerCase()
  if (normalized === 'utility_improved') return 'utility_improved'
  if (normalized === 'utility_not_improved') return 'utility_not_improved'
  if (normalized.startsWith('migration_cost_high')) return 'migration_cost_high'
  if (normalized === 'migrating_or_on_cooldown') return 'migrating_or_on_cooldown'
  if (normalized === 'home_staker') return 'home_staker'
  if (normalized === 'never_migrate_strategy') return 'never_migrate_strategy'
  if (normalized === 'no_applicable_strategy') return 'no_applicable_strategy'
  return 'other'
}

export function parseActionReasonsCsv(rawText: string): readonly ActionReasonEntry[] {
  const csv = parseCsvMatrix(rawText)
  if (csv.headers.length === 0) return []

  const actionReasonIndex = findColumnIndex(csv.headers, ['Action_Reason', 'actionReason', 'reason'])
  const previousRegionIndex = findColumnIndex(csv.headers, ['Previous_Region', 'previousRegion', 'from_region'])
  const newRegionIndex = findColumnIndex(csv.headers, ['New_Region', 'newRegion', 'to_region'])

  return csv.rows.flatMap((row, index) => {
    const actionReason = readCell(row, actionReasonIndex)
    if (!actionReason) return []

    const actionGroup = canonicalizeActionReason(actionReason)
    const previousRegion = readCell(row, previousRegionIndex)
    const newRegion = readCell(row, newRegionIndex)

    return [{
      slot: index,
      actionReason,
      actionGroup,
      previousRegion,
      newRegion,
      previousContinent: toContinent(previousRegion),
      newContinent: toContinent(newRegion),
      migrated: actionGroup === 'utility_improved' && Boolean(previousRegion) && Boolean(newRegion) && previousRegion !== newRegion,
    }]
  })
}

export function parseRegionProfitsCsv(rawText: string): readonly RegionProfitEntry[] {
  const csv = parseCsvMatrix(rawText)
  if (csv.headers.length === 0) return []

  const slotIndex = findColumnIndex(csv.headers, ['slot', 'time'])
  const regionIndex = findColumnIndex(csv.headers, ['gcp_region', 'region'])
  const mevOfferIndex = findColumnIndex(csv.headers, ['mev_offer', 'profit'])
  const latencyThresholdIndex = findColumnIndex(csv.headers, ['latency_threshold'])

  return csv.rows.flatMap(row => {
    const slot = readNumberCell(row, slotIndex)
    const region = readCell(row, regionIndex)
    const mevOffer = readNumberCell(row, mevOfferIndex)
    if (slot == null || region == null || mevOffer == null) return []

    return [{
      slot,
      region,
      continent: toContinent(region),
      mevOffer,
      latencyThreshold: readNumberCell(row, latencyThresholdIndex),
    }]
  })
}

export function parsePaperGeographyMetrics(rawText: string): PaperGeographyMetrics | null {
  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>
    return {
      gini: parseNumericSeries(payload.gini),
      hhi: parseNumericSeries(payload.hhi),
      liveness: parseNumericSeries(payload.liveness),
      profitVariance: parseNumericSeries(payload.profit_variance),
    }
  } catch {
    return null
  }
}

export function parseProposalTimeBySlotJson(rawText: string): ValidatorMetricMatrix {
  try {
    return parseValidatorMetricMatrix(JSON.parse(rawText) as unknown)
  } catch {
    return []
  }
}

export function parseAttestBySlotJson(rawText: string): ValidatorMetricMatrix {
  try {
    return parseValidatorMetricMatrix(JSON.parse(rawText) as unknown)
  } catch {
    return []
  }
}

export function parseRegionCounterBySlotJson(rawText: string): RegionCounterBySlot {
  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>
    const entries = Object.entries(payload)
      .flatMap(([slotKey, slotEntries]) => {
        const slot = Number.parseInt(slotKey, 10)
        if (!Number.isFinite(slot) || !Array.isArray(slotEntries)) return []

        const normalizedEntries = slotEntries.flatMap(entry => {
          if (!Array.isArray(entry) || entry.length < 2) return []
          const region = typeof entry[0] === 'string' ? entry[0] : null
          const count = Number(entry[1])
          if (!region || !Number.isFinite(count)) return []
          return [[region, count] as const]
        })

        return [[slot, normalizedEntries] as const]
      })

    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export function parsePublishedAnalyticsPayload(rawText: string): IncubatorPublishedAnalyticsPayload | null {
  try {
    const payload = JSON.parse(rawText) as IncubatorPublishedAnalyticsPayload
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}
