import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { runInNewContext } from 'node:vm'

import {
  ConsoleLogger,
  createDuckDB,
  DuckDBAccessMode,
  NODE_RUNTIME,
} from '@duckdb/duckdb-wasm/blocking'

import type { SimulationManifest } from './simulation-runtime.ts'
import {
  buildAttestationRows,
  buildExactRunId,
  buildExactRunRow,
  buildMetricSnapshotRows,
  buildProposalTimeRows,
  buildPublishedRunId,
  buildPublishedRunRow,
  buildRegionCountRows,
  buildSlotMetricRows,
  buildSourceDistanceRows,
  buildSourceRows,
  normalizeMigrationEventRows,
  normalizeRegionProfitRows,
  RESULTS_WAREHOUSE_TABLE_NAMES,
  RESULTS_WAREHOUSE_TABLE_SCHEMAS,
  warehouseSourceRole,
  type PublishedAnalyticsPayload,
  type PublishedDatasetDescriptor,
  type PublishedResultsWarehouseIndex,
  type ResultsWarehouseMetadata,
  type ResultsWarehouseQueryResult,
  type ResultsWarehouseTableName,
  type WarehouseMetricSnapshotRow,
  type WarehouseTableMeta,
} from '../src/lib/results-warehouse.ts'

interface ResearchCatalog {
  readonly defaultSelection?: {
    readonly path?: string | null
  } | null
  readonly datasets?: readonly PublishedDatasetDescriptor[]
}

interface WarehouseMetaFile {
  readonly fingerprint: string
  readonly generated_at: string
  readonly default_published_dataset_path: string | null
  readonly runs: readonly ReturnType<typeof buildPublishedRunRow>[]
  readonly run_metric_snapshots: readonly WarehouseMetricSnapshotRow[]
  readonly tables: readonly WarehouseTableMeta[]
}

interface PublishedResultsWarehouseRuntime {
  readonly bindings: Awaited<ReturnType<typeof createDuckDB>>
  readonly dbPath: string
  readonly meta: WarehouseMetaFile
}

type WarehouseConnection = ReturnType<Awaited<ReturnType<typeof createBindings>>['connect']>

type WarehouseRowBatch = readonly Record<string, unknown>[]

type ExactRowBatchMap = Record<ResultsWarehouseTableName, WarehouseRowBatch>

interface ExactWarehouseAttachment {
  readonly runId: string
  readonly runLabel: string
  readonly rowBatches: ExactRowBatchMap
}

const require = createRequire(import.meta.url)
const DUCKDB_DIST_DIR = path.dirname(require.resolve('@duckdb/duckdb-wasm'))
const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: path.join(DUCKDB_DIST_DIR, 'duckdb-mvp.wasm'),
    mainWorker: '',
  },
  eh: {
    mainModule: path.join(DUCKDB_DIST_DIR, 'duckdb-eh.wasm'),
    mainWorker: '',
  },
} as const

const RESULTS_WAREHOUSE_SCHEMA_VERSION = 2
const MAX_QUERY_ROWS = 20_000
const JSON_INSERT_CHUNK_SIZE = 25_000
const EXACT_ANALYTICS_ARTIFACT = 'published_analytics_payload.json'
const STATIC_TABLE_ORDER = ['validators', 'gcp_latency', 'gcp_regions'] as const
const warehouseRuntimeCache = new Map<string, Promise<PublishedResultsWarehouseRuntime | null>>()
const exactAttachmentCache = new Map<string, Promise<ExactWarehouseAttachment | null>>()

function cacheKey(catalogPath: string, baseDir: string): string {
  return `${path.resolve(catalogPath)}::${path.resolve(baseDir)}`
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function baseTableName(tableName: ResultsWarehouseTableName): string {
  return `_warehouse_${tableName}`
}

function buildSchemaSql(tableName: ResultsWarehouseTableName): string {
  return RESULTS_WAREHOUSE_TABLE_SCHEMAS[tableName]
    .map(([name, type]) => `${quoteIdentifier(name)} ${type}`)
    .join(', ')
}

function buildProjectedColumnsSql(tableName: ResultsWarehouseTableName): string {
  return RESULTS_WAREHOUSE_TABLE_SCHEMAS[tableName]
    .map(([name, type]) => `CAST(${quoteIdentifier(name)} AS ${type}) AS ${quoteIdentifier(name)}`)
    .join(', ')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isWithinDirectory(parentDir: string, targetPath: string): boolean {
  const relative = path.relative(parentDir, targetPath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function resolveDatasetPath(
  baseDir: string,
  datasetPath: string | null | undefined,
): string | null {
  const trimmed = datasetPath?.trim()
  if (!trimmed) return null
  const resolved = path.resolve(baseDir, trimmed)
  if (!isWithinDirectory(path.resolve(baseDir), resolved)) return null
  return existsSync(resolved) ? resolved : null
}

async function loadResearchCatalog(catalogPath: string): Promise<ResearchCatalog | null> {
  if (!existsSync(catalogPath)) return null
  const raw = await fs.readFile(catalogPath, 'utf8')
  const sandbox = { window: {} as { RESEARCH_CATALOG?: ResearchCatalog } }
  runInNewContext(raw, sandbox, { filename: catalogPath })
  return sandbox.window.RESEARCH_CATALOG ?? null
}

async function fileFingerprintPart(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath)
  return `${path.resolve(filePath)}:${stats.size}:${stats.mtimeMs}`
}

async function computeWarehouseFingerprint(
  catalogPath: string,
  baseDir: string,
  catalog: ResearchCatalog,
): Promise<string> {
  const repoRoot = path.resolve(baseDir, '..')
  const trackedPaths = [
    path.resolve(catalogPath),
    path.resolve(repoRoot, 'data', 'validators.csv'),
    path.resolve(repoRoot, 'data', 'gcp_latency.csv'),
    path.resolve(repoRoot, 'data', 'gcp_regions.csv'),
    ...(
      await Promise.all((catalog.datasets ?? []).map(async dataset => (
        resolveDatasetPath(baseDir, dataset.path)
      )))
    ).filter((filePath): filePath is string => filePath !== null),
  ]
  const parts = await Promise.all(trackedPaths.map(fileFingerprintPart))
  return createHash('sha256')
    .update(stableStringify({
      schemaVersion: RESULTS_WAREHOUSE_SCHEMA_VERSION,
      catalogPath: path.resolve(catalogPath),
      baseDir: path.resolve(baseDir),
      defaultSelection: catalog.defaultSelection?.path ?? null,
      files: parts,
    }))
    .digest('hex')
}

function warehousePaths(catalogPath: string, baseDir: string): {
  readonly cacheDir: string
  readonly dbPath: string
  readonly metaPath: string
} {
  const fingerprintSeed = createHash('sha256')
    .update(cacheKey(catalogPath, baseDir))
    .digest('hex')
    .slice(0, 16)
  const cacheDir = path.resolve(baseDir, '..', '.simulation_cache', 'results-warehouse')
  return {
    cacheDir,
    dbPath: path.join(cacheDir, `${fingerprintSeed}.duckdb`),
    metaPath: path.join(cacheDir, `${fingerprintSeed}.meta.json`),
  }
}

async function createBindings(dbPath: string) {
  const bindings = await createDuckDB(DUCKDB_BUNDLES, new ConsoleLogger(), NODE_RUNTIME)
  await bindings.instantiate()
  bindings.open({
    path: dbPath,
    accessMode: DuckDBAccessMode.READ_WRITE,
  })
  return bindings
}

async function createEmptyPhysicalTable(
  conn: WarehouseConnection,
  tableName: ResultsWarehouseTableName,
): Promise<void> {
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(baseTableName(tableName))}`)
  await conn.query(`
    CREATE TABLE ${quoteIdentifier(baseTableName(tableName))} (
      ${buildSchemaSql(tableName)}
    )
  `)
}

async function appendJsonRows(
  bindings: Awaited<ReturnType<typeof createDuckDB>>,
  conn: WarehouseConnection,
  physicalTableName: string,
  schemaTableName: ResultsWarehouseTableName,
  rows: WarehouseRowBatch,
): Promise<void> {
  if (rows.length === 0) return

  for (let offset = 0; offset < rows.length; offset += JSON_INSERT_CHUNK_SIZE) {
    const batch = rows.slice(offset, offset + JSON_INSERT_CHUNK_SIZE)
    const fileName = `warehouse-${physicalTableName}-${offset}-${randomUUID()}.json`
    await bindings.registerFileText(fileName, JSON.stringify(batch))
    try {
      await conn.query(`
        INSERT INTO ${quoteIdentifier(physicalTableName)}
        SELECT ${buildProjectedColumnsSql(schemaTableName)}
        FROM read_json_auto('${fileName}')
      `)
    } finally {
      bindings.dropFile(fileName)
    }
  }
}

async function createTemporaryJsonTable(
  bindings: Awaited<ReturnType<typeof createDuckDB>>,
  conn: WarehouseConnection,
  tempTableName: string,
  schemaTableName: ResultsWarehouseTableName,
  rows: WarehouseRowBatch,
): Promise<void> {
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tempTableName)}`)
  if (rows.length === 0) {
    await conn.query(`
      CREATE TEMP TABLE ${quoteIdentifier(tempTableName)} (
        ${buildSchemaSql(schemaTableName)}
      )
    `)
    return
  }

  const fileName = `warehouse-${tempTableName}-${randomUUID()}.json`
  await bindings.registerFileText(fileName, JSON.stringify(rows))
  try {
    await conn.query(`
      CREATE TEMP TABLE ${quoteIdentifier(tempTableName)} AS
      SELECT ${buildProjectedColumnsSql(schemaTableName)}
      FROM read_json_auto('${fileName}')
    `)
  } finally {
    bindings.dropFile(fileName)
  }
}

async function registerStaticTables(
  conn: WarehouseConnection,
  repoRoot: string,
): Promise<void> {
  const validatorsPath = path.resolve(repoRoot, 'data', 'validators.csv').replaceAll('\\', '/')
  const gcpLatencyPath = path.resolve(repoRoot, 'data', 'gcp_latency.csv').replaceAll('\\', '/')
  const gcpRegionsPath = path.resolve(repoRoot, 'data', 'gcp_regions.csv').replaceAll('\\', '/')

  await conn.query('DROP TABLE IF EXISTS validators')
  await conn.query('DROP TABLE IF EXISTS gcp_latency')
  await conn.query('DROP TABLE IF EXISTS gcp_regions')

  await conn.query(`
    CREATE TABLE validators AS
    SELECT * FROM read_csv_auto('${validatorsPath}')
  `)
  await conn.query(`
    CREATE TABLE gcp_latency AS
    SELECT * FROM read_csv_auto('${gcpLatencyPath}')
  `)
  await conn.query(`
    CREATE TABLE gcp_regions AS
    SELECT * FROM read_csv_auto('${gcpRegionsPath}')
  `)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Region" TO region`)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Region Name" TO region_name`)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Nearest City Latitude" TO lat`)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Nearest City Longitude" TO lon`)
}

function warehouseCacheLooksUsable(runtime: PublishedResultsWarehouseRuntime): boolean {
  const conn = runtime.bindings.connect()
  try {
    conn.query(`SELECT COUNT(*) AS cnt FROM main.${quoteIdentifier(baseTableName('runs'))}`)
    return true
  } catch {
    return false
  } finally {
    conn.close()
  }
}

async function describeConcreteTable(
  conn: WarehouseConnection,
  tableName: string,
): Promise<WarehouseTableMeta> {
  const info = conn.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = '${tableName}'
    ORDER BY ordinal_position
  `)
  const columns = info.toArray().map(row => ({
    name: String(row.column_name),
    type: String(row.data_type),
  }))
  const countResult = conn.query(`SELECT COUNT(*) AS cnt FROM ${quoteIdentifier(tableName)}`)
  const rowCount = Number(countResult.toArray()[0]?.cnt ?? 0)
  return {
    name: tableName,
    columns,
    rowCount,
  }
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
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

async function loadExactWarehouseAttachment(
  manifest: SimulationManifest | null | undefined,
): Promise<ExactWarehouseAttachment | null> {
  if (!manifest) return null
  const cached = exactAttachmentCache.get(manifest.jobId)
  if (cached) return cached

  const promise = (async () => {
    const outputDir = path.resolve(manifest.outputDir)
    const payloadText = await readOptionalText(path.join(outputDir, EXACT_ANALYTICS_ARTIFACT))
    if (!payloadText) return null

    const payload = JSON.parse(payloadText) as PublishedAnalyticsPayload
    const runId = buildExactRunId(manifest.jobId)
    const runRow = buildExactRunRow(manifest.jobId, payload, manifest.config)
    const sourceRole = warehouseSourceRole(runRow.paradigm)

    const [proposalTimeText, attestationText, regionProfitsText, migrationText] = await Promise.all([
      readOptionalText(path.join(outputDir, 'proposal_time_by_slot.json')),
      readOptionalText(path.join(outputDir, 'attest_by_slot.json')),
      readOptionalText(path.join(outputDir, 'region_profits.csv')),
      readOptionalText(path.join(outputDir, 'action_reasons.csv')),
    ])

    const proposalTimeBySlot = proposalTimeText
      ? JSON.parse(proposalTimeText) as readonly (readonly number[])[]
      : []
    const attestBySlot = attestationText
      ? JSON.parse(attestationText) as readonly (readonly number[])[]
      : []
    const regionProfits = regionProfitsText
      ? parseSimpleCsv(regionProfitsText)
      : []
    const migrationRows = migrationText
      ? parseSimpleCsv(migrationText)
      : []

    const rowBatches: ExactRowBatchMap = {
      runs: [runRow],
      run_metric_snapshots: buildMetricSnapshotRows(runId, payload),
      run_slot_metrics: buildSlotMetricRows(runId, payload),
      run_region_counts: buildRegionCountRows(runId, payload),
      run_sources: buildSourceRows(runId, payload, sourceRole),
      run_source_distances: buildSourceDistanceRows(runId, payload, sourceRole),
      run_proposal_times: buildProposalTimeRows(runId, proposalTimeBySlot),
      run_attestations: buildAttestationRows(runId, attestBySlot),
      run_region_profits: normalizeRegionProfitRows(runId, regionProfits),
      run_migration_events: normalizeMigrationEventRows(runId, migrationRows),
    }

    return {
      runId,
      runLabel: runRow.label,
      rowBatches,
    } satisfies ExactWarehouseAttachment
  })().catch(error => {
    exactAttachmentCache.delete(manifest.jobId)
    throw error
  })

  exactAttachmentCache.set(manifest.jobId, promise)
  return promise
}

async function buildWarehouseMetaAndDatabase(
  catalogPath: string,
  baseDir: string,
): Promise<PublishedResultsWarehouseRuntime | null> {
  const resolvedCatalogPath = path.resolve(catalogPath)
  const resolvedBaseDir = path.resolve(baseDir)
  const catalog = await loadResearchCatalog(resolvedCatalogPath)
  if (!catalog?.datasets?.length) return null

  const fingerprint = await computeWarehouseFingerprint(resolvedCatalogPath, resolvedBaseDir, catalog)
  const paths = warehousePaths(resolvedCatalogPath, resolvedBaseDir)
  await fs.mkdir(paths.cacheDir, { recursive: true })

  if (existsSync(paths.dbPath) && existsSync(paths.metaPath)) {
    const cachedMeta = JSON.parse(await fs.readFile(paths.metaPath, 'utf8')) as WarehouseMetaFile
    if (cachedMeta.fingerprint === fingerprint) {
      const cachedRuntime = {
        bindings: await createBindings(paths.dbPath),
        dbPath: paths.dbPath,
        meta: cachedMeta,
      } satisfies PublishedResultsWarehouseRuntime
      if (warehouseCacheLooksUsable(cachedRuntime)) {
        return cachedRuntime
      }
      cachedRuntime.bindings.reset()
    }
  }

  await fs.rm(paths.dbPath, { force: true }).catch(() => undefined)
  await fs.rm(paths.metaPath, { force: true }).catch(() => undefined)

  const bindings = await createBindings(paths.dbPath)
  const conn = bindings.connect()
  try {
    const repoRoot = path.resolve(resolvedBaseDir, '..')
    await registerStaticTables(conn, repoRoot)

    for (const tableName of RESULTS_WAREHOUSE_TABLE_NAMES) {
      await createEmptyPhysicalTable(conn, tableName)
    }

    const rowCounts = Object.fromEntries(
      RESULTS_WAREHOUSE_TABLE_NAMES.map(tableName => [tableName, 0]),
    ) as Record<ResultsWarehouseTableName, number>
    const runs: ReturnType<typeof buildPublishedRunRow>[] = []
    const runMetricSnapshots: WarehouseMetricSnapshotRow[] = []

    for (const descriptor of catalog.datasets) {
      const datasetPath = resolveDatasetPath(resolvedBaseDir, descriptor.path)
      if (!datasetPath) continue

      const raw = await fs.readFile(datasetPath, 'utf8')
      const payload = JSON.parse(raw) as PublishedAnalyticsPayload
      const runId = buildPublishedRunId(descriptor.path)
      const runRow = buildPublishedRunRow(descriptor, payload)
      const sourceRole = runRow.source_role
      const rowBatches: ExactRowBatchMap = {
        runs: [runRow],
        run_metric_snapshots: buildMetricSnapshotRows(runId, payload),
        run_slot_metrics: buildSlotMetricRows(runId, payload),
        run_region_counts: buildRegionCountRows(runId, payload),
        run_sources: buildSourceRows(runId, payload, sourceRole),
        run_source_distances: buildSourceDistanceRows(runId, payload, sourceRole),
        run_proposal_times: [],
        run_attestations: [],
        run_region_profits: [],
        run_migration_events: [],
      }

      for (const tableName of RESULTS_WAREHOUSE_TABLE_NAMES) {
        const batch = rowBatches[tableName]
        await appendJsonRows(bindings, conn, baseTableName(tableName), tableName, batch)
        rowCounts[tableName] += batch.length
      }

      runs.push(runRow)
      runMetricSnapshots.push(...rowBatches.run_metric_snapshots as readonly WarehouseMetricSnapshotRow[])
    }

    const staticTables = await Promise.all(
      STATIC_TABLE_ORDER.map(tableName => describeConcreteTable(conn, tableName)),
    )
    const resultTables: WarehouseTableMeta[] = RESULTS_WAREHOUSE_TABLE_NAMES.map(tableName => ({
      name: tableName,
      columns: RESULTS_WAREHOUSE_TABLE_SCHEMAS[tableName].map(([name, type]) => ({ name, type })),
      rowCount: rowCounts[tableName],
    }))

    const meta: WarehouseMetaFile = {
      fingerprint,
      generated_at: new Date().toISOString(),
      default_published_dataset_path: catalog.defaultSelection?.path ?? null,
      runs,
      run_metric_snapshots: runMetricSnapshots,
      tables: [...resultTables, ...staticTables],
    }

    await conn.query('CHECKPOINT')
    bindings.flushFiles()
    await fs.writeFile(paths.metaPath, JSON.stringify(meta, null, 2))
    return {
      bindings,
      dbPath: paths.dbPath,
      meta,
    }
  } catch (error) {
    await fs.rm(paths.dbPath, { force: true }).catch(() => undefined)
    await fs.rm(paths.metaPath, { force: true }).catch(() => undefined)
    throw error
  } finally {
    conn.close()
  }
}

async function ensurePublishedResultsWarehouseRuntime(
  catalogPath: string | null | undefined,
  baseDir: string | null | undefined,
): Promise<PublishedResultsWarehouseRuntime | null> {
  if (!catalogPath || !baseDir) return null
  const resolvedCatalogPath = path.resolve(catalogPath)
  const resolvedBaseDir = path.resolve(baseDir)
  const key = cacheKey(resolvedCatalogPath, resolvedBaseDir)

  const cached = warehouseRuntimeCache.get(key)
  if (cached) return cached

  const promise = buildWarehouseMetaAndDatabase(resolvedCatalogPath, resolvedBaseDir).catch(error => {
    warehouseRuntimeCache.delete(key)
    throw error
  })
  warehouseRuntimeCache.set(key, promise)
  return promise
}

async function prepareConnectionViews(
  runtime: PublishedResultsWarehouseRuntime,
  conn: WarehouseConnection,
  exactAttachment: ExactWarehouseAttachment | null,
): Promise<void> {
  for (const tableName of RESULTS_WAREHOUSE_TABLE_NAMES) {
    const tempTableName = `__exact_${tableName}`
    await createTemporaryJsonTable(
      runtime.bindings,
      conn,
      tempTableName,
      tableName,
      exactAttachment?.rowBatches[tableName] ?? [],
    )
    await conn.query(`
      CREATE OR REPLACE TEMP VIEW ${quoteIdentifier(tableName)} AS
      SELECT * FROM main.${quoteIdentifier(baseTableName(tableName))}
      UNION ALL
      SELECT * FROM ${quoteIdentifier(tempTableName)}
    `)
  }
}

function overlayTableCounts(
  baseTables: readonly WarehouseTableMeta[],
  exactAttachment: ExactWarehouseAttachment | null,
): readonly WarehouseTableMeta[] {
  if (!exactAttachment) return baseTables

  const exactCounts = Object.fromEntries(
    RESULTS_WAREHOUSE_TABLE_NAMES.map(tableName => [
      tableName,
      exactAttachment.rowBatches[tableName].length,
    ]),
  ) as Record<ResultsWarehouseTableName, number>

  return baseTables.map(table => {
    if (!RESULTS_WAREHOUSE_TABLE_NAMES.includes(table.name as ResultsWarehouseTableName)) {
      return table
    }
    return {
      ...table,
      rowCount: table.rowCount + exactCounts[table.name as ResultsWarehouseTableName],
    }
  })
}

function stripLeadingSqlComments(sql: string): string {
  let remaining = sql.trimStart()
  while (remaining.startsWith('--') || remaining.startsWith('/*')) {
    if (remaining.startsWith('--')) {
      const newlineIndex = remaining.indexOf('\n')
      remaining = newlineIndex >= 0 ? remaining.slice(newlineIndex + 1).trimStart() : ''
      continue
    }
    const endIndex = remaining.indexOf('*/')
    if (endIndex < 0) return ''
    remaining = remaining.slice(endIndex + 2).trimStart()
  }
  return remaining
}

function normalizeWarehouseSql(rawSql: string, requestedMaxRows: number): {
  readonly executableSql: string
  readonly appliedRowLimit: number
  readonly truncated: boolean
} {
  const trimmed = rawSql.trim()
  if (!trimmed) {
    throw new Error('Write a SQL query before running it.')
  }

  const withoutTrailingSemicolons = trimmed.replace(/;+\s*$/, '')
  if (withoutTrailingSemicolons.includes(';')) {
    throw new Error('Only a single read-only SQL statement is allowed in the Data Lab.')
  }

  const sanitized = stripLeadingSqlComments(withoutTrailingSemicolons)
  const firstTokenMatch = sanitized.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
  const firstToken = firstTokenMatch?.[1]?.toLowerCase() ?? ''
  if (!['select', 'with', 'show', 'describe', 'explain'].includes(firstToken)) {
    throw new Error('Only read-only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN statements are allowed.')
  }

  const appliedRowLimit = Math.max(1, Math.min(requestedMaxRows, MAX_QUERY_ROWS))
  const isSelectLike = firstToken === 'select' || firstToken === 'with'
  const hasLimit = /\bLIMIT\s+\d/i.test(withoutTrailingSemicolons)
  if (isSelectLike && !hasLimit) {
    return {
      executableSql: `SELECT * FROM (${withoutTrailingSemicolons}) AS warehouse_query LIMIT ${appliedRowLimit}`,
      appliedRowLimit,
      truncated: true,
    }
  }

  return {
    executableSql: withoutTrailingSemicolons,
    appliedRowLimit,
    truncated: false,
  }
}

function normalizeResultValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const asNumber = Number(value)
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString()
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeResultValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nested]) => [key, normalizeResultValue(nested)]),
    )
  }
  return value
}

function tableToRows(result: {
  readonly schema: { readonly fields: readonly { readonly name: string }[] }
  toArray(): readonly Record<string, unknown>[]
}): {
  readonly columns: readonly string[]
  readonly rows: readonly Record<string, unknown>[]
} {
  const columns = result.schema.fields.map(field => field.name)
  const rows = result.toArray().map(rawRow => {
    const row: Record<string, unknown> = {}
    for (const column of columns) {
      row[column] = normalizeResultValue(rawRow[column])
    }
    return row
  })
  return { columns, rows }
}

export async function loadPublishedResultsWarehouseIndex(
  catalogPath: string | null | undefined,
  baseDir: string | null | undefined,
): Promise<PublishedResultsWarehouseIndex | null> {
  const runtime = await ensurePublishedResultsWarehouseRuntime(catalogPath, baseDir)
  if (!runtime) return null
  return {
    generated_at: runtime.meta.generated_at,
    default_published_dataset_path: runtime.meta.default_published_dataset_path,
    runs: runtime.meta.runs,
    run_metric_snapshots: runtime.meta.run_metric_snapshots,
  }
}

export async function describeResultsWarehouse(input: {
  readonly catalogPath: string | null | undefined
  readonly baseDir: string | null | undefined
  readonly manifest?: SimulationManifest | null
}): Promise<ResultsWarehouseMetadata | null> {
  const runtime = await ensurePublishedResultsWarehouseRuntime(input.catalogPath, input.baseDir)
  if (!runtime) return null
  const exactAttachment = await loadExactWarehouseAttachment(input.manifest)

  return {
    generated_at: runtime.meta.generated_at,
    tables: overlayTableCounts(runtime.meta.tables, exactAttachment),
    loaded_run_labels: exactAttachment ? [exactAttachment.runLabel] : [],
    published_run_count: runtime.meta.runs.length,
    exact_run_id: exactAttachment?.runId ?? null,
  }
}

export async function executeResultsWarehouseQuery(input: {
  readonly catalogPath: string | null | undefined
  readonly baseDir: string | null | undefined
  readonly sql: string
  readonly manifest?: SimulationManifest | null
  readonly maxRows?: number | null
}): Promise<ResultsWarehouseQueryResult | null> {
  const runtime = await ensurePublishedResultsWarehouseRuntime(input.catalogPath, input.baseDir)
  if (!runtime) return null
  const exactAttachment = await loadExactWarehouseAttachment(input.manifest)
  const conn = runtime.bindings.connect()

  try {
    await prepareConnectionViews(runtime, conn, exactAttachment)
    const preparedSql = normalizeWarehouseSql(
      input.sql,
      Number.isFinite(input.maxRows) ? Math.trunc(input.maxRows ?? MAX_QUERY_ROWS) : MAX_QUERY_ROWS,
    )
    const startedAt = performance.now()
    const result = conn.query(preparedSql.executableSql)
    const durationMs = performance.now() - startedAt
    const { columns, rows } = tableToRows(result)

    return {
      columns,
      rows,
      duration_ms: durationMs,
      truncated: preparedSql.truncated && rows.length >= preparedSql.appliedRowLimit,
      applied_row_limit: preparedSql.appliedRowLimit,
    }
  } finally {
    conn.close()
  }
}
