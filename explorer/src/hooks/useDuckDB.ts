import { useEffect, useMemo, useState } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'

import {
  buildExactRunId,
  buildExactRunRow,
  buildMetricSnapshotRows,
  buildProposalTimeRows,
  buildAttestationRows,
  buildPublishedRunId,
  buildRegionCountRows,
  buildSlotMetricRows,
  buildSourceDistanceRows,
  buildSourceRows,
  normalizeMigrationEventRows,
  normalizeRegionProfitRows,
  warehouseSourceRole,
  type PublishedAnalyticsPayload,
  type PublishedResultsWarehouseIndex,
  type WarehouseAttestationRow,
  type WarehouseMetricSnapshotRow,
  type WarehouseMigrationEventRow,
  type WarehouseProposalTimeRow,
  type WarehouseRegionCountRow,
  type WarehouseRegionProfitRow,
  type WarehouseRunRow,
  type WarehouseSlotMetricRow,
  type WarehouseSourceDistanceRow,
  type WarehouseSourceRow,
} from '../lib/results-warehouse'
import {
  fetchPublishedAnalyticsPayload,
} from '../components/simulation/simulation-lab-comparison'
import {
  getSimulationArtifact,
  getSimulationManifest,
  type SimulationManifest,
} from '../lib/simulation-api'

export interface TableMeta {
  readonly name: string
  readonly columns: readonly ColumnMeta[]
  readonly rowCount: number
}

export interface ColumnMeta {
  readonly name: string
  readonly type: string
}

export interface DuckDBState {
  readonly db: duckdb.AsyncDuckDB | null
  readonly conn: duckdb.AsyncDuckDBConnection | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
  readonly tables: readonly TableMeta[]
  readonly loadedRunLabels: readonly string[]
}

export interface UseDuckDBOptions {
  readonly currentJobId?: string | null
  readonly publishedDetailPath?: string | null
  readonly researchViewerBaseUrl?: string | null
}

type JsonRow =
  | WarehouseRunRow
  | WarehouseMetricSnapshotRow
  | WarehouseSlotMetricRow
  | WarehouseRegionCountRow
  | WarehouseSourceRow
  | WarehouseSourceDistanceRow
  | WarehouseProposalTimeRow
  | WarehouseAttestationRow
  | WarehouseRegionProfitRow
  | WarehouseMigrationEventRow

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

const DEFAULT_RESEARCH_VIEWER_BASE_URL = '/research-demo'
const EXACT_ANALYTICS_ARTIFACT = 'published_analytics_payload.json'

const TABLE_SCHEMAS = {
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

let singletonPromises = new Map<string, Promise<{
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  tables: readonly TableMeta[]
  loadedRunLabels: readonly string[]
}>>()

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function buildSchemaSql(tableName: keyof typeof TABLE_SCHEMAS): string {
  return TABLE_SCHEMAS[tableName]
    .map(([name, type]) => `${quoteIdentifier(name)} ${type}`)
    .join(', ')
}

async function createEmptyTable(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: keyof typeof TABLE_SCHEMAS,
): Promise<void> {
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`)
  await conn.query(`CREATE TABLE ${quoteIdentifier(tableName)} (${buildSchemaSql(tableName)})`)
}

async function createJsonTable(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  tableName: keyof typeof TABLE_SCHEMAS,
  rows: readonly JsonRow[],
): Promise<void> {
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`)
  if (rows.length === 0) {
    await createEmptyTable(conn, tableName)
    return
  }

  const fileName = `warehouse-${tableName}.json`
  await db.registerFileText(fileName, JSON.stringify(rows))
  const projectedColumns = TABLE_SCHEMAS[tableName]
    .map(([name, type]) => `CAST(${quoteIdentifier(name)} AS ${type}) AS ${quoteIdentifier(name)}`)
    .join(', ')
  await conn.query(`
    CREATE TABLE ${quoteIdentifier(tableName)} AS
    SELECT ${projectedColumns}
    FROM read_json_auto('${fileName}')
  `)
}

function parseSimpleCsv(text: string): readonly Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const headers = lines[0]!.split(',').map(header => header.trim())
  return lines.slice(1).map(line => {
    const values = line.split(',').map(value => value.trim())
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`)
  }
  return await response.json() as T
}

async function registerStaticCsvTable(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  {
    fileName,
    url,
    tableName,
    renameSql = [],
  }: {
    readonly fileName: string
    readonly url: string
    readonly tableName: string
    readonly renameSql?: readonly string[]
  },
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`)
  }
  const text = await response.text()
  await db.registerFileText(fileName, text)
  await conn.query(`CREATE TABLE ${quoteIdentifier(tableName)} AS SELECT * FROM read_csv_auto('${fileName}')`)
  for (const statement of renameSql) {
    await conn.query(statement)
  }
}

async function introspectTables(conn: duckdb.AsyncDuckDBConnection): Promise<readonly TableMeta[]> {
  const result = await conn.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'main'
    ORDER BY table_name, ordinal_position
  `)

  const tableMap = new Map<string, ColumnMeta[]>()
  for (const row of result.toArray()) {
    const tableName = String(row.table_name)
    const columnName = String(row.column_name)
    const dataType = String(row.data_type)
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, [])
    }
    tableMap.get(tableName)!.push({ name: columnName, type: dataType })
  }

  const tables: TableMeta[] = []
  for (const [name, columns] of tableMap) {
    const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM ${quoteIdentifier(name)}`)
    const rowCount = Number(countResult.toArray()[0]?.cnt ?? 0)
    tables.push({ name, columns, rowCount })
  }
  return tables
}

function uniqueRows<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  rows.forEach(row => {
    const rowKey = key(row)
    if (seen.has(rowKey)) return
    seen.add(rowKey)
    unique.push(row)
  })
  return unique
}

function viewerBaseUrl(options: UseDuckDBOptions): string {
  return (options.researchViewerBaseUrl ?? DEFAULT_RESEARCH_VIEWER_BASE_URL).replace(/\/$/, '')
}

async function loadPublishedResultsWarehouseIndex(): Promise<PublishedResultsWarehouseIndex> {
  return fetchJson<PublishedResultsWarehouseIndex>(`${API_BASE}/results-warehouse/index`)
}

async function loadExactDetailBundle(currentJobId: string): Promise<{
  manifest: SimulationManifest
  payload: PublishedAnalyticsPayload
  proposalTimes: readonly WarehouseProposalTimeRow[]
  attestations: readonly WarehouseAttestationRow[]
  regionProfits: readonly WarehouseRegionProfitRow[]
  migrationEvents: readonly WarehouseMigrationEventRow[]
}> {
  const [manifest, payloadText, proposalTimeText, attestText, regionProfitsCsv, migrationCsv] = await Promise.all([
    getSimulationManifest(currentJobId),
    getSimulationArtifact(currentJobId, EXACT_ANALYTICS_ARTIFACT),
    getSimulationArtifact(currentJobId, 'proposal_time_by_slot.json'),
    getSimulationArtifact(currentJobId, 'attest_by_slot.json'),
    getSimulationArtifact(currentJobId, 'region_profits.csv'),
    getSimulationArtifact(currentJobId, 'action_reasons.csv'),
  ])

  const runId = buildExactRunId(currentJobId)
  const proposalTimeBySlot = JSON.parse(proposalTimeText) as readonly (readonly number[])[]
  const attestBySlot = JSON.parse(attestText) as readonly (readonly number[])[]
  const regionProfitRows = parseSimpleCsv(regionProfitsCsv)
  const migrationRows = parseSimpleCsv(migrationCsv)

  return {
    manifest,
    payload: JSON.parse(payloadText) as PublishedAnalyticsPayload,
    proposalTimes: buildProposalTimeRows(runId, proposalTimeBySlot),
    attestations: buildAttestationRows(runId, attestBySlot),
    regionProfits: normalizeRegionProfitRows(runId, regionProfitRows),
    migrationEvents: normalizeMigrationEventRows(runId, migrationRows),
  }
}

async function initDuckDB(options: UseDuckDBOptions) {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker = await duckdb.createWorker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  const conn = await db.connect()

  await Promise.all([
    registerStaticCsvTable(db, conn, {
      fileName: 'validators.csv',
      url: '/data/validators.csv',
      tableName: 'validators',
    }),
    registerStaticCsvTable(db, conn, {
      fileName: 'gcp_latency.csv',
      url: '/data/gcp_latency.csv',
      tableName: 'gcp_latency',
    }),
    registerStaticCsvTable(db, conn, {
      fileName: 'gcp_regions.csv',
      url: '/data/gcp_regions.csv',
      tableName: 'gcp_regions',
      renameSql: [
        `ALTER TABLE gcp_regions RENAME COLUMN "Region" TO region`,
        `ALTER TABLE gcp_regions RENAME COLUMN "Region Name" TO region_name`,
        `ALTER TABLE gcp_regions RENAME COLUMN "Nearest City Latitude" TO lat`,
        `ALTER TABLE gcp_regions RENAME COLUMN "Nearest City Longitude" TO lon`,
      ],
    }),
  ])

  const warehouseIndex = await loadPublishedResultsWarehouseIndex()
  const selectedPublishedDetailPath = options.publishedDetailPath ?? warehouseIndex.default_published_dataset_path ?? null
  const selectedPublishedPayload = selectedPublishedDetailPath
    ? await fetchPublishedAnalyticsPayload(viewerBaseUrl(options), selectedPublishedDetailPath)
    : null
  const exactDetail = options.currentJobId
    ? await loadExactDetailBundle(options.currentJobId)
    : null

  const runs: WarehouseRunRow[] = [...warehouseIndex.runs]
  const runMetricSnapshots: WarehouseMetricSnapshotRow[] = [...warehouseIndex.run_metric_snapshots]
  const runSlotMetrics: WarehouseSlotMetricRow[] = []
  const runRegionCounts: WarehouseRegionCountRow[] = []
  const runSources: WarehouseSourceRow[] = []
  const runSourceDistances: WarehouseSourceDistanceRow[] = []
  const runProposalTimes: WarehouseProposalTimeRow[] = exactDetail?.proposalTimes.slice() ?? []
  const runAttestations: WarehouseAttestationRow[] = exactDetail?.attestations.slice() ?? []
  const runRegionProfits: WarehouseRegionProfitRow[] = exactDetail?.regionProfits.slice() ?? []
  const runMigrationEvents: WarehouseMigrationEventRow[] = exactDetail?.migrationEvents.slice() ?? []
  const loadedRunLabels: string[] = []

  if (selectedPublishedPayload && selectedPublishedDetailPath) {
    const runId = buildPublishedRunId(selectedPublishedDetailPath)
    const selectedRun = runs.find(run => run.run_id === runId)
    if (selectedRun) {
      loadedRunLabels.push(selectedRun.label)
      runSlotMetrics.push(...buildSlotMetricRows(runId, selectedPublishedPayload))
      runRegionCounts.push(...buildRegionCountRows(runId, selectedPublishedPayload))
      runSources.push(...buildSourceRows(runId, selectedPublishedPayload, selectedRun.source_role))
      runSourceDistances.push(...buildSourceDistanceRows(runId, selectedPublishedPayload, selectedRun.source_role))
    }
  }

  if (exactDetail && options.currentJobId) {
    const runId = buildExactRunId(options.currentJobId)
    const exactRun = buildExactRunRow(options.currentJobId, exactDetail.payload, exactDetail.manifest.config)
    runs.push(exactRun)
    runMetricSnapshots.push(...buildMetricSnapshotRows(runId, exactDetail.payload))
    runSlotMetrics.push(...buildSlotMetricRows(runId, exactDetail.payload))
    runRegionCounts.push(...buildRegionCountRows(runId, exactDetail.payload))
    runSources.push(...buildSourceRows(runId, exactDetail.payload, warehouseSourceRole(exactRun.paradigm)))
    runSourceDistances.push(...buildSourceDistanceRows(runId, exactDetail.payload, warehouseSourceRole(exactRun.paradigm)))
    loadedRunLabels.push(exactRun.label)
  }

  await Promise.all([
    createJsonTable(db, conn, 'runs', uniqueRows(runs, row => row.run_id)),
    createJsonTable(db, conn, 'run_metric_snapshots', uniqueRows(runMetricSnapshots, row => `${row.run_id}::${row.snapshot}`)),
    createJsonTable(db, conn, 'run_slot_metrics', runSlotMetrics),
    createJsonTable(db, conn, 'run_region_counts', runRegionCounts),
    createJsonTable(db, conn, 'run_sources', uniqueRows(runSources, row => `${row.run_id}::${row.source_index}`)),
    createJsonTable(db, conn, 'run_source_distances', runSourceDistances),
    createJsonTable(db, conn, 'run_proposal_times', runProposalTimes),
    createJsonTable(db, conn, 'run_attestations', runAttestations),
    createJsonTable(db, conn, 'run_region_profits', runRegionProfits),
    createJsonTable(db, conn, 'run_migration_events', runMigrationEvents),
  ])

  const tables = await introspectTables(conn)
  return { db, conn, tables, loadedRunLabels }
}

function getOrInitSingleton(options: UseDuckDBOptions) {
  const key = JSON.stringify({
    currentJobId: options.currentJobId ?? null,
    publishedDetailPath: options.publishedDetailPath ?? null,
    researchViewerBaseUrl: viewerBaseUrl(options),
  })

  if (!singletonPromises.has(key)) {
    singletonPromises.set(key, initDuckDB(options).catch(error => {
      singletonPromises.delete(key)
      throw error
    }))
  }

  return singletonPromises.get(key)!
}

export function useDuckDB(options: UseDuckDBOptions = {}): DuckDBState {
  const normalizedOptions = useMemo(() => ({
    currentJobId: options.currentJobId ?? null,
    publishedDetailPath: options.publishedDetailPath ?? null,
    researchViewerBaseUrl: options.researchViewerBaseUrl ?? DEFAULT_RESEARCH_VIEWER_BASE_URL,
  }), [options.currentJobId, options.publishedDetailPath, options.researchViewerBaseUrl])

  const [state, setState] = useState<DuckDBState>({
    db: null,
    conn: null,
    status: 'idle',
    error: null,
    tables: [],
    loadedRunLabels: [],
  })

  useEffect(() => {
    let cancelled = false

    setState(previous => ({ ...previous, status: 'loading', error: null }))

    getOrInitSingleton(normalizedOptions)
      .then(({ db, conn, tables, loadedRunLabels }) => {
        if (!cancelled) {
          setState({
            db,
            conn,
            status: 'ready',
            error: null,
            tables,
            loadedRunLabels,
          })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setState(previous => ({
            ...previous,
            status: 'error',
            error: message,
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [normalizedOptions])

  return state
}
