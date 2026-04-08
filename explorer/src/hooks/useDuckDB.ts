import { useState, useEffect } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'

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
}

// ── Singleton: shared across all hook consumers ──

let singletonPromise: Promise<{
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  tables: readonly TableMeta[]
}> | null = null

async function initDuckDB() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker = await duckdb.createWorker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  const conn = await db.connect()

  // Fetch and register CSVs
  const csvFiles = [
    { name: 'validators.csv', url: '/data/validators.csv' },
    { name: 'gcp_latency.csv', url: '/data/gcp_latency.csv' },
    { name: 'gcp_regions.csv', url: '/data/gcp_regions.csv' },
  ] as const

  await Promise.all(
    csvFiles.map(async ({ name, url }) => {
      const response = await fetch(url)
      const text = await response.text()
      await db.registerFileText(name, text)
    }),
  )

  // Create tables with friendly column names
  await conn.query(`
    CREATE TABLE validators AS
    SELECT * FROM read_csv_auto('validators.csv')
  `)

  await conn.query(`
    CREATE TABLE gcp_latency AS
    SELECT * FROM read_csv_auto('gcp_latency.csv')
  `)

  // Two-step: create from CSV then rename awkward columns
  await conn.query(`
    CREATE TABLE gcp_regions AS
    SELECT * FROM read_csv_auto('gcp_regions.csv')
  `)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Region" TO region`)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Region Name" TO region_name`)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Nearest City Latitude" TO lat`)
  await conn.query(`ALTER TABLE gcp_regions RENAME COLUMN "Nearest City Longitude" TO lon`)

  // Introspect table metadata
  const tables = await introspectTables(conn)

  return { db, conn, tables }
}

async function introspectTables(conn: duckdb.AsyncDuckDBConnection): Promise<readonly TableMeta[]> {
  const result = await conn.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'main'
    ORDER BY table_name, ordinal_position
  `)

  const tableMap = new Map<string, ColumnMeta[]>()
  const rows = result.toArray()

  for (const row of rows) {
    const tableName = String(row.table_name)
    const colName = String(row.column_name)
    const colType = String(row.data_type)
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, [])
    }
    tableMap.get(tableName)!.push({ name: colName, type: colType })
  }

  const tables: TableMeta[] = []
  for (const [name, columns] of tableMap) {
    const countResult = await conn.query(`SELECT COUNT(*) as cnt FROM "${name}"`)
    const countRows = countResult.toArray()
    const rowCount = Number(countRows[0]?.cnt ?? 0)
    tables.push({ name, columns, rowCount })
  }

  return tables
}

function getOrInitSingleton() {
  if (!singletonPromise) {
    singletonPromise = initDuckDB().catch(err => {
      // Reset singleton so next attempt can retry
      singletonPromise = null
      throw err
    })
  }
  return singletonPromise
}

export function useDuckDB(): DuckDBState {
  const [state, setState] = useState<DuckDBState>({
    db: null,
    conn: null,
    status: 'idle',
    error: null,
    tables: [],
  })

  useEffect(() => {
    let cancelled = false

    setState(prev => ({ ...prev, status: 'loading' }))

    getOrInitSingleton()
      .then(({ db, conn, tables }) => {
        if (!cancelled) {
          setState({ db, conn, status: 'ready', error: null, tables })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setState(prev => ({ ...prev, status: 'error', error: message }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
