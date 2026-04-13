export type WarehouseRunKind = 'published' | 'exact'
export type WarehouseParadigm = 'SSP' | 'MSP'
export type WarehouseSourceRole = 'supplier' | 'signal'
export type WarehouseSnapshot = 'initial' | 'final'

export interface PublishedAnalyticsMetrics {
  readonly clusters?: readonly number[]
  readonly total_distance?: readonly number[]
  readonly avg_nnd?: readonly number[]
  readonly nni?: readonly number[]
  readonly mev?: readonly number[]
  readonly attestations?: readonly number[]
  readonly proposal_times?: readonly number[]
  readonly gini?: readonly number[]
  readonly hhi?: readonly number[]
  readonly liveness?: readonly number[]
  readonly failed_block_proposals?: readonly number[]
  readonly profit_variance?: readonly number[]
  readonly info_avg_distance?: ReadonlyArray<readonly number[]>
}

export interface PublishedAnalyticsPayload {
  readonly v?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly cost?: number
  readonly gamma?: number
  readonly description?: string
  readonly n_slots?: number
  readonly metrics?: PublishedAnalyticsMetrics
  readonly sources?: ReadonlyArray<readonly [string, string]>
  readonly slots?: Record<string, ReadonlyArray<readonly [string, number]>>
}

export const RESULTS_WAREHOUSE_TABLE_SCHEMAS = {
  runs: [
    ['run_id', 'VARCHAR'],
    ['run_kind', 'VARCHAR'],
    ['label', 'VARCHAR'],
    ['evaluation', 'VARCHAR'],
    ['paradigm', 'VARCHAR'],
    ['paradigm_label', 'VARCHAR'],
    ['result_key', 'VARCHAR'],
    ['dataset_path', 'VARCHAR'],
    ['exact_job_id', 'VARCHAR'],
    ['source_role', 'VARCHAR'],
    ['validators', 'DOUBLE'],
    ['total_slots', 'BIGINT'],
    ['slot_time_ms', 'DOUBLE'],
    ['attestation_cutoff_ms', 'DOUBLE'],
    ['migration_cost', 'DOUBLE'],
    ['gamma', 'DOUBLE'],
    ['description', 'VARCHAR'],
    ['distribution', 'VARCHAR'],
    ['source_placement', 'VARCHAR'],
    ['seed', 'DOUBLE'],
  ],
  run_metric_snapshots: [
    ['run_id', 'VARCHAR'],
    ['snapshot', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['progress_pct', 'DOUBLE'],
    ['active_regions', 'BIGINT'],
    ['leader_share', 'DOUBLE'],
    ['dominant_region_id', 'VARCHAR'],
    ['dominant_region_share', 'DOUBLE'],
    ['gini', 'DOUBLE'],
    ['hhi', 'DOUBLE'],
    ['liveness', 'DOUBLE'],
    ['proposal_times', 'DOUBLE'],
    ['mev', 'DOUBLE'],
    ['attestations', 'DOUBLE'],
    ['clusters', 'DOUBLE'],
    ['failed_block_proposals', 'DOUBLE'],
    ['total_distance', 'DOUBLE'],
    ['avg_nnd', 'DOUBLE'],
    ['nni', 'DOUBLE'],
    ['profit_variance', 'DOUBLE'],
    ['info_avg_distance', 'DOUBLE'],
  ],
  run_slot_metrics: [
    ['run_id', 'VARCHAR'],
    ['snapshot', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['progress_pct', 'DOUBLE'],
    ['active_regions', 'BIGINT'],
    ['leader_share', 'DOUBLE'],
    ['dominant_region_id', 'VARCHAR'],
    ['dominant_region_share', 'DOUBLE'],
    ['gini', 'DOUBLE'],
    ['hhi', 'DOUBLE'],
    ['liveness', 'DOUBLE'],
    ['proposal_times', 'DOUBLE'],
    ['mev', 'DOUBLE'],
    ['attestations', 'DOUBLE'],
    ['clusters', 'DOUBLE'],
    ['failed_block_proposals', 'DOUBLE'],
    ['total_distance', 'DOUBLE'],
    ['avg_nnd', 'DOUBLE'],
    ['nni', 'DOUBLE'],
    ['profit_variance', 'DOUBLE'],
    ['info_avg_distance', 'DOUBLE'],
  ],
  run_region_counts: [
    ['run_id', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['region_id', 'VARCHAR'],
    ['validator_count', 'BIGINT'],
    ['validator_share', 'DOUBLE'],
    ['region_rank', 'BIGINT'],
  ],
  run_sources: [
    ['run_id', 'VARCHAR'],
    ['source_index', 'BIGINT'],
    ['source_name', 'VARCHAR'],
    ['source_region', 'VARCHAR'],
    ['source_role', 'VARCHAR'],
  ],
  run_source_distances: [
    ['run_id', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['source_index', 'BIGINT'],
    ['source_name', 'VARCHAR'],
    ['source_region', 'VARCHAR'],
    ['avg_distance', 'DOUBLE'],
  ],
  run_proposal_times: [
    ['run_id', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['validator_index', 'BIGINT'],
    ['proposal_time_ms', 'DOUBLE'],
  ],
  run_attestations: [
    ['run_id', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['validator_index', 'BIGINT'],
    ['attestation_value', 'DOUBLE'],
  ],
  run_region_profits: [
    ['run_id', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['region_id', 'VARCHAR'],
    ['mev_offer', 'DOUBLE'],
    ['latency_threshold', 'DOUBLE'],
    ['relay_id', 'VARCHAR'],
  ],
  run_migration_events: [
    ['run_id', 'VARCHAR'],
    ['slot_index', 'BIGINT'],
    ['slot_number', 'BIGINT'],
    ['validator_index', 'BIGINT'],
    ['validator_unique_id', 'VARCHAR'],
    ['action_reason', 'VARCHAR'],
    ['previous_region', 'VARCHAR'],
    ['new_region', 'VARCHAR'],
    ['migrated', 'BOOLEAN'],
  ],
} as const

export type ResultsWarehouseTableName = keyof typeof RESULTS_WAREHOUSE_TABLE_SCHEMAS

export const RESULTS_WAREHOUSE_TABLE_NAMES = Object.keys(
  RESULTS_WAREHOUSE_TABLE_SCHEMAS,
) as ResultsWarehouseTableName[]

export interface WarehouseColumnMeta {
  readonly name: string
  readonly type: string
}

export interface WarehouseTableMeta {
  readonly name: string
  readonly columns: readonly WarehouseColumnMeta[]
  readonly rowCount: number
}

export interface ResultsWarehouseMetadata {
  readonly generated_at: string
  readonly tables: readonly WarehouseTableMeta[]
  readonly loaded_run_labels: readonly string[]
  readonly published_run_count: number
  readonly exact_run_id: string | null
}

export interface ResultsWarehouseQueryResult {
  readonly columns: readonly string[]
  readonly rows: readonly Record<string, unknown>[]
  readonly duration_ms: number
  readonly truncated: boolean
  readonly applied_row_limit: number
}

export interface WarehouseRunRow {
  readonly run_id: string
  readonly run_kind: WarehouseRunKind
  readonly label: string
  readonly evaluation: string | null
  readonly paradigm: WarehouseParadigm
  readonly paradigm_label: 'External' | 'Local'
  readonly result_key: string | null
  readonly dataset_path: string | null
  readonly exact_job_id: string | null
  readonly source_role: WarehouseSourceRole
  readonly validators: number | null
  readonly total_slots: number
  readonly slot_time_ms: number | null
  readonly attestation_cutoff_ms: number | null
  readonly migration_cost: number | null
  readonly gamma: number | null
  readonly description: string | null
  readonly distribution: string | null
  readonly source_placement: string | null
  readonly seed: number | null
}

export interface WarehouseMetricSnapshotRow {
  readonly run_id: string
  readonly snapshot: WarehouseSnapshot
  readonly slot_index: number
  readonly slot_number: number
  readonly progress_pct: number
  readonly active_regions: number
  readonly leader_share: number | null
  readonly dominant_region_id: string | null
  readonly dominant_region_share: number | null
  readonly gini: number | null
  readonly hhi: number | null
  readonly liveness: number | null
  readonly proposal_times: number | null
  readonly mev: number | null
  readonly attestations: number | null
  readonly clusters: number | null
  readonly failed_block_proposals: number | null
  readonly total_distance: number | null
  readonly avg_nnd: number | null
  readonly nni: number | null
  readonly profit_variance: number | null
  readonly info_avg_distance: number | null
}

export interface WarehouseSlotMetricRow extends Omit<WarehouseMetricSnapshotRow, 'snapshot'> {
  readonly snapshot: 'detail'
}

export interface WarehouseRegionCountRow {
  readonly run_id: string
  readonly slot_index: number
  readonly slot_number: number
  readonly region_id: string
  readonly validator_count: number
  readonly validator_share: number | null
  readonly region_rank: number
}

export interface WarehouseSourceRow {
  readonly run_id: string
  readonly source_index: number
  readonly source_name: string
  readonly source_region: string
  readonly source_role: WarehouseSourceRole
}

export interface WarehouseSourceDistanceRow {
  readonly run_id: string
  readonly slot_index: number
  readonly slot_number: number
  readonly source_index: number
  readonly source_name: string
  readonly source_region: string
  readonly avg_distance: number | null
}

export interface WarehouseProposalTimeRow {
  readonly run_id: string
  readonly slot_index: number
  readonly slot_number: number
  readonly validator_index: number
  readonly proposal_time_ms: number | null
}

export interface WarehouseAttestationRow {
  readonly run_id: string
  readonly slot_index: number
  readonly slot_number: number
  readonly validator_index: number
  readonly attestation_value: number | null
}

export interface WarehouseRegionProfitRow {
  readonly run_id: string
  readonly slot_index: number | null
  readonly region_id: string | null
  readonly mev_offer: number | null
  readonly latency_threshold: number | null
  readonly relay_id: string | null
}

export interface WarehouseMigrationEventRow {
  readonly run_id: string
  readonly slot_index: number | null
  readonly slot_number: number | null
  readonly validator_index: number | null
  readonly validator_unique_id: string | null
  readonly action_reason: string | null
  readonly previous_region: string | null
  readonly new_region: string | null
  readonly migrated: boolean | null
}

export interface PublishedResultsWarehouseIndex {
  readonly generated_at: string
  readonly default_published_dataset_path: string | null
  readonly runs: readonly WarehouseRunRow[]
  readonly run_metric_snapshots: readonly WarehouseMetricSnapshotRow[]
}

export interface ExactRunConfigLike {
  readonly paradigm: WarehouseParadigm
  readonly distribution?: string | null
  readonly sourcePlacement?: string | null
  readonly migrationCost?: number | null
  readonly attestationThreshold?: number | null
  readonly slotTime?: number | null
  readonly seed?: number | null
}

export interface PublishedDatasetDescriptor {
  readonly evaluation: string
  readonly paradigm: 'External' | 'Local'
  readonly result: string
  readonly path: string
  readonly sourceRole?: string | null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toWarehouseParadigm(
  paradigm: 'External' | 'Local' | 'SSP' | 'MSP',
): WarehouseParadigm {
  return paradigm === 'External' || paradigm === 'SSP' ? 'SSP' : 'MSP'
}

export function warehouseParadigmLabel(
  paradigm: WarehouseParadigm,
): 'External' | 'Local' {
  return paradigm === 'SSP' ? 'External' : 'Local'
}

export function warehouseSourceRole(
  paradigm: WarehouseParadigm,
): WarehouseSourceRole {
  return paradigm === 'SSP' ? 'supplier' : 'signal'
}

export function buildPublishedRunId(datasetPath: string): string {
  return `published::${datasetPath}`
}

export function buildExactRunId(jobId: string): string {
  return `exact::${jobId}`
}

export function totalSlotsFromPayload(payload: PublishedAnalyticsPayload | null | undefined): number {
  if (!payload) return 0
  return Math.max(
    0,
    payload.n_slots ?? 0,
    payload.metrics?.gini?.length ?? 0,
    payload.metrics?.hhi?.length ?? 0,
    payload.metrics?.liveness?.length ?? 0,
    payload.metrics?.mev?.length ?? 0,
    payload.metrics?.proposal_times?.length ?? 0,
    payload.metrics?.failed_block_proposals?.length ?? 0,
    payload.metrics?.total_distance?.length ?? 0,
    payload.metrics?.avg_nnd?.length ?? 0,
    payload.metrics?.nni?.length ?? 0,
    payload.metrics?.profit_variance?.length ?? 0,
    payload.metrics?.info_avg_distance?.length ?? 0,
    Object.keys(payload.slots ?? {}).length,
  )
}

function metricAt(
  series: readonly number[] | undefined,
  slotIndex: number,
): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  return finiteNumber(series[clampedIndex])
}

function infoDistanceAt(
  series: ReadonlyArray<readonly number[]> | undefined,
  slotIndex: number,
): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  const values = series[clampedIndex]
  if (!values?.length) return null
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numericValues.length === 0) return null
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
}

function slotProgress(slotIndex: number, totalSlots: number): number {
  if (totalSlots <= 1) return totalSlots === 0 ? 0 : 100
  return (slotIndex / Math.max(1, totalSlots - 1)) * 100
}

export function regionRowsForSlot(
  payload: PublishedAnalyticsPayload,
  slotIndex: number,
): readonly WarehouseRegionCountRow[] {
  const rawRegions = payload.slots?.[String(slotIndex)] ?? []
  const totalValidators = rawRegions.reduce((sum, [, count]) => sum + (Number(count) || 0), 0)
  return rawRegions
    .map(([regionId, count], index) => {
      const validatorCount = Number(count) || 0
      return {
        run_id: '',
        slot_index: slotIndex,
        slot_number: slotIndex + 1,
        region_id: regionId,
        validator_count: validatorCount,
        validator_share: totalValidators > 0 ? (validatorCount / totalValidators) * 100 : null,
        region_rank: index + 1,
      } satisfies WarehouseRegionCountRow
    })
    .filter(row => row.validator_count > 0)
}

function activeRegionCountAtSlot(
  payload: PublishedAnalyticsPayload,
  slotIndex: number,
): number {
  return regionRowsForSlot(payload, slotIndex).length
}

function dominantRegionAtSlot(
  payload: PublishedAnalyticsPayload,
  slotIndex: number,
): { region_id: string; share: number | null } | null {
  const regions = regionRowsForSlot(payload, slotIndex)
  const first = regions[0]
  if (!first) return null
  return {
    region_id: first.region_id,
    share: first.validator_share,
  }
}

function slotMetricRow(
  runId: string,
  payload: PublishedAnalyticsPayload,
  slotIndex: number,
  snapshot: WarehouseSnapshot | 'detail',
): WarehouseMetricSnapshotRow | WarehouseSlotMetricRow {
  const totalSlots = totalSlotsFromPayload(payload)
  const dominantRegion = dominantRegionAtSlot(payload, slotIndex)
  return {
    run_id: runId,
    snapshot,
    slot_index: slotIndex,
    slot_number: slotIndex + 1,
    progress_pct: slotProgress(slotIndex, totalSlots),
    active_regions: activeRegionCountAtSlot(payload, slotIndex),
    leader_share: dominantRegion?.share ?? null,
    dominant_region_id: dominantRegion?.region_id ?? null,
    dominant_region_share: dominantRegion?.share ?? null,
    gini: metricAt(payload.metrics?.gini, slotIndex),
    hhi: metricAt(payload.metrics?.hhi, slotIndex),
    liveness: metricAt(payload.metrics?.liveness, slotIndex),
    proposal_times: metricAt(payload.metrics?.proposal_times, slotIndex),
    mev: metricAt(payload.metrics?.mev, slotIndex),
    attestations: metricAt(payload.metrics?.attestations, slotIndex),
    clusters: metricAt(payload.metrics?.clusters, slotIndex),
    failed_block_proposals: metricAt(payload.metrics?.failed_block_proposals, slotIndex),
    total_distance: metricAt(payload.metrics?.total_distance, slotIndex),
    avg_nnd: metricAt(payload.metrics?.avg_nnd, slotIndex),
    nni: metricAt(payload.metrics?.nni, slotIndex),
    profit_variance: metricAt(payload.metrics?.profit_variance, slotIndex),
    info_avg_distance: infoDistanceAt(payload.metrics?.info_avg_distance, slotIndex),
  }
}

export function buildPublishedRunRow(
  dataset: PublishedDatasetDescriptor,
  payload: PublishedAnalyticsPayload,
): WarehouseRunRow {
  const paradigm = toWarehouseParadigm(dataset.paradigm)
  const sourceRole = dataset.sourceRole === 'signal' || dataset.sourceRole === 'supplier'
    ? dataset.sourceRole
    : warehouseSourceRole(paradigm)
  return {
    run_id: buildPublishedRunId(dataset.path),
    run_kind: 'published',
    label: `${dataset.evaluation} / ${warehouseParadigmLabel(paradigm)} / ${dataset.result}`,
    evaluation: dataset.evaluation,
    paradigm,
    paradigm_label: warehouseParadigmLabel(paradigm),
    result_key: dataset.result,
    dataset_path: dataset.path,
    exact_job_id: null,
    source_role: sourceRole,
    validators: finiteNumber(payload.v),
    total_slots: totalSlotsFromPayload(payload),
    slot_time_ms: finiteNumber(payload.delta),
    attestation_cutoff_ms: finiteNumber(payload.cutoff),
    migration_cost: finiteNumber(payload.cost),
    gamma: finiteNumber(payload.gamma),
    description: payload.description ?? null,
    distribution: null,
    source_placement: null,
    seed: null,
  }
}

export function buildExactRunRow(
  jobId: string,
  payload: PublishedAnalyticsPayload,
  config: ExactRunConfigLike,
): WarehouseRunRow {
  const paradigm = toWarehouseParadigm(config.paradigm)
  const distribution = config.distribution ?? null
  const sourcePlacement = config.sourcePlacement ?? null
  const slotTimeMs = finiteNumber(payload.delta) ?? (
    typeof config.slotTime === 'number' && Number.isFinite(config.slotTime)
      ? config.slotTime * 1000
      : null
  )
  return {
    run_id: buildExactRunId(jobId),
    run_kind: 'exact',
    label: `Exact / ${warehouseParadigmLabel(paradigm)} / ${distribution ?? 'unknown'} / ${sourcePlacement ?? 'unknown'} / ${jobId.slice(0, 8)}`,
    evaluation: 'Exact',
    paradigm,
    paradigm_label: warehouseParadigmLabel(paradigm),
    result_key: null,
    dataset_path: null,
    exact_job_id: jobId,
    source_role: warehouseSourceRole(paradigm),
    validators: finiteNumber(payload.v),
    total_slots: totalSlotsFromPayload(payload),
    slot_time_ms: slotTimeMs,
    attestation_cutoff_ms: finiteNumber(payload.cutoff),
    migration_cost: finiteNumber(payload.cost ?? config.migrationCost ?? null),
    gamma: finiteNumber(payload.gamma ?? config.attestationThreshold ?? null),
    description: payload.description ?? null,
    distribution,
    source_placement: sourcePlacement,
    seed: finiteNumber(config.seed ?? null),
  }
}

export function buildMetricSnapshotRows(
  runId: string,
  payload: PublishedAnalyticsPayload,
): readonly WarehouseMetricSnapshotRow[] {
  const totalSlots = totalSlotsFromPayload(payload)
  if (totalSlots <= 0) return []
  return [
    slotMetricRow(runId, payload, 0, 'initial') as WarehouseMetricSnapshotRow,
    slotMetricRow(runId, payload, Math.max(0, totalSlots - 1), 'final') as WarehouseMetricSnapshotRow,
  ]
}

export function buildSlotMetricRows(
  runId: string,
  payload: PublishedAnalyticsPayload,
): readonly WarehouseSlotMetricRow[] {
  const totalSlots = totalSlotsFromPayload(payload)
  return Array.from({ length: totalSlots }, (_, slotIndex) => (
    slotMetricRow(runId, payload, slotIndex, 'detail') as WarehouseSlotMetricRow
  ))
}

export function buildRegionCountRows(
  runId: string,
  payload: PublishedAnalyticsPayload,
): readonly WarehouseRegionCountRow[] {
  const totalSlots = totalSlotsFromPayload(payload)
  const rows: WarehouseRegionCountRow[] = []
  for (let slotIndex = 0; slotIndex < totalSlots; slotIndex += 1) {
    const slotRows = regionRowsForSlot(payload, slotIndex)
    rows.push(...slotRows.map(row => ({ ...row, run_id: runId })))
  }
  return rows
}

export function buildSourceRows(
  runId: string,
  payload: PublishedAnalyticsPayload,
  sourceRole: WarehouseSourceRole,
): readonly WarehouseSourceRow[] {
  return (payload.sources ?? []).map(([sourceName, sourceRegion], sourceIndex) => ({
    run_id: runId,
    source_index: sourceIndex,
    source_name: sourceName,
    source_region: sourceRegion,
    source_role: sourceRole,
  }))
}

export function buildSourceDistanceRows(
  runId: string,
  payload: PublishedAnalyticsPayload,
  sourceRole: WarehouseSourceRole,
): readonly WarehouseSourceDistanceRow[] {
  const sourceRows = buildSourceRows(runId, payload, sourceRole)
  const slotDistances = payload.metrics?.info_avg_distance ?? []
  const rows: WarehouseSourceDistanceRow[] = []
  for (let slotIndex = 0; slotIndex < slotDistances.length; slotIndex += 1) {
    const slot = slotDistances[slotIndex] ?? []
    sourceRows.forEach(sourceRow => {
      rows.push({
        run_id: runId,
        slot_index: slotIndex,
        slot_number: slotIndex + 1,
        source_index: sourceRow.source_index,
        source_name: sourceRow.source_name,
        source_region: sourceRow.source_region,
        avg_distance: finiteNumber(slot[sourceRow.source_index]),
      })
    })
  }
  return rows
}

export function buildProposalTimeRows(
  runId: string,
  proposalTimeBySlot: readonly (readonly number[])[],
): readonly WarehouseProposalTimeRow[] {
  const rows: WarehouseProposalTimeRow[] = []
  proposalTimeBySlot.forEach((slot, slotIndex) => {
    slot.forEach((value, validatorIndex) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return
      rows.push({
        run_id: runId,
        slot_index: slotIndex,
        slot_number: slotIndex + 1,
        validator_index: validatorIndex,
        proposal_time_ms: value,
      })
    })
  })
  return rows
}

export function buildAttestationRows(
  runId: string,
  attestBySlot: readonly (readonly number[])[],
): readonly WarehouseAttestationRow[] {
  const rows: WarehouseAttestationRow[] = []
  attestBySlot.forEach((slot, slotIndex) => {
    slot.forEach((value, validatorIndex) => {
      rows.push({
        run_id: runId,
        slot_index: slotIndex,
        slot_number: slotIndex + 1,
        validator_index: validatorIndex,
        attestation_value: finiteNumber(value),
      })
    })
  })
  return rows
}

export function normalizeRegionProfitRows(
  runId: string,
  rawRows: readonly Record<string, unknown>[],
): readonly WarehouseRegionProfitRow[] {
  return rawRows.map(row => ({
    run_id: runId,
    slot_index: finiteNumber(row.slot),
    region_id: typeof row.gcp_region === 'string' ? row.gcp_region : null,
    mev_offer: finiteNumber(row.mev_offer),
    latency_threshold: finiteNumber(row.latency_threshold),
    relay_id: typeof row.relay === 'string' ? row.relay : null,
  }))
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return null
}

export function normalizeMigrationEventRows(
  runId: string,
  rawRows: readonly Record<string, unknown>[],
): readonly WarehouseMigrationEventRow[] {
  return rawRows.map(row => {
    const slotIndex = finiteNumber(row.slot)
    return {
      run_id: runId,
      slot_index: slotIndex,
      slot_number: slotIndex != null ? slotIndex + 1 : null,
      validator_index: finiteNumber(row.validator_index),
      validator_unique_id: typeof row.validator_unique_id === 'string' ? row.validator_unique_id : null,
      action_reason: typeof row.action_reason === 'string'
        ? row.action_reason
        : typeof row.Action_Reason === 'string'
          ? row.Action_Reason
          : null,
      previous_region: typeof row.previous_region === 'string'
        ? row.previous_region
        : typeof row.Previous_Region === 'string'
          ? row.Previous_Region
          : null,
      new_region: typeof row.new_region === 'string'
        ? row.new_region
        : typeof row.New_Region === 'string'
          ? row.New_Region
          : null,
      migrated: coerceBoolean(row.migrated),
    }
  })
}

export function buildPublishedResultsWarehouseIndex(
  datasets: readonly {
    descriptor: PublishedDatasetDescriptor
    payload: PublishedAnalyticsPayload
  }[],
  defaultPublishedDatasetPath: string | null,
): PublishedResultsWarehouseIndex {
  const runs = datasets.map(({ descriptor, payload }) => buildPublishedRunRow(descriptor, payload))
  const runMetricSnapshots = datasets.flatMap(({ descriptor, payload }) => (
    buildMetricSnapshotRows(buildPublishedRunId(descriptor.path), payload)
  ))
  return {
    generated_at: new Date().toISOString(),
    default_published_dataset_path: defaultPublishedDatasetPath,
    runs,
    run_metric_snapshots: runMetricSnapshots,
  }
}
