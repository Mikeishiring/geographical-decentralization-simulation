import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BadgeCheck,
  BookmarkPlus,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  History,
  Layers3,
  Link2,
  RefreshCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { EditorView } from '@codemirror/view'

import { useResultsWarehouse } from '../../hooks/useResultsWarehouse'
import { executeResultsWarehouseQuery } from '../../lib/results-warehouse-api'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../../lib/theme'
import { SqlEditor } from './SqlEditor'
import { SqlResultsTable, type QueryResult } from './SqlResultsTable'
import { SqlExampleQueries } from './SqlExampleQueries'
import { SqlSchemaBrowser } from './SqlSchemaBrowser'
import { SQL_EXAMPLES } from './sql-examples'

const QUERY_HISTORY_STORAGE_KEY = 'results-warehouse-query-history-v2'
const SAVED_QUERIES_STORAGE_KEY = 'results-warehouse-saved-queries-v1'
const QUERY_DRAFT_STORAGE_KEY = 'results-warehouse-query-draft-v1'
const QUERY_URL_PARAM = 'sql'
const MAX_ROWS = 10_000

interface StoredQuery {
  readonly id: string
  readonly name: string
  readonly sql: string
  readonly updatedAt: string
}

function createQueryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function deriveQueryName(sql: string): string {
  const firstLine = sql
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)

  if (!firstLine) return 'Untitled query'
  return firstLine.replace(/\s+/g, ' ').slice(0, 44)
}

function normalizeStoredQueries(value: unknown): StoredQuery[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const sql = entry.trim()
      if (!sql) return []
      const timestamp = new Date(Date.now() - index * 1000).toISOString()
      return [{
        id: createQueryId(),
        name: deriveQueryName(sql),
        sql,
        updatedAt: timestamp,
      } satisfies StoredQuery]
    }

    if (entry && typeof entry === 'object') {
      const candidate = entry as Record<string, unknown>
      const sql = typeof candidate.sql === 'string' ? candidate.sql.trim() : ''
      if (!sql) return []
      const name = typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : deriveQueryName(sql)
      const id = typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : createQueryId()
      const updatedAt = typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : new Date().toISOString()

      return [{
        id,
        name,
        sql,
        updatedAt,
      } satisfies StoredQuery]
    }

    return []
  })
}

function formatRelativeTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Not built yet'
  const value = Date.parse(timestamp)
  if (Number.isNaN(value)) return 'Unknown'
  const deltaMs = Date.now() - value
  const deltaMinutes = Math.round(deltaMs / 60_000)
  if (Math.abs(deltaMinutes) < 1) return 'Just now'
  if (Math.abs(deltaMinutes) < 60) return `${deltaMinutes}m ago`
  const deltaHours = Math.round(deltaMinutes / 60)
  if (Math.abs(deltaHours) < 24) return `${deltaHours}h ago`
  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays}d ago`
}

function formatAbsoluteTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Not built yet'
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function readQueryFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const sql = params.get(QUERY_URL_PARAM)?.trim()
  return sql || null
}

function writeQueryToUrl(sql: string | null): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const normalized = sql?.trim() ?? ''
  if (normalized) {
    params.set(QUERY_URL_PARAM, normalized)
  } else {
    params.delete(QUERY_URL_PARAM)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const nextUrl = `${window.location.pathname}${suffix}${window.location.hash}`
  window.history.replaceState(null, '', nextUrl)
}

export function DataLabSurface({
  currentJobId = null,
  publishedDetailPath = null,
  researchViewerBaseUrl = null,
}: {
  readonly currentJobId?: string | null
  readonly publishedDetailPath?: string | null
  readonly researchViewerBaseUrl?: string | null
} = {}) {
  void publishedDetailPath
  void researchViewerBaseUrl

  const {
    status,
    error: warehouseError,
    tables,
    loadedRunLabels,
    publishedRunCount,
    exactRunId,
    generatedAt,
    refresh,
  } = useResultsWarehouse({ currentJobId })

  const editorRef = useRef<EditorView | null>(null)
  const pendingAutoRunQueryRef = useRef<string | null>(null)

  const [queryText, setQueryText] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryHistory, setQueryHistory] = useState<StoredQuery[]>([])
  const [savedQueries, setSavedQueries] = useState<StoredQuery[]>([])
  const [schemaOpen, setSchemaOpen] = useState(true)
  const [saveName, setSaveName] = useState('')
  const [linkState, setLinkState] = useState<'idle' | 'copied'>('idle')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')

  const hasMetadata = tables.length > 0
  const isReady = status === 'ready' || hasMetadata
  const totalWarehouseRows = useMemo(
    () => tables.reduce((count, table) => count + table.rowCount, 0),
    [tables],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const urlQuery = readQueryFromUrl()
    const initialDraft = window.localStorage.getItem(QUERY_DRAFT_STORAGE_KEY)?.trim() || null
    const initialQuery = urlQuery ?? initialDraft ?? SQL_EXAMPLES[0]?.query ?? ''

    if (urlQuery) {
      pendingAutoRunQueryRef.current = urlQuery
    }

    setQueryText(initialQuery)

    try {
      setQueryHistory(normalizeStoredQueries(JSON.parse(
        window.localStorage.getItem(QUERY_HISTORY_STORAGE_KEY) ?? '[]',
      )).slice(0, 12))
    } catch {
      setQueryHistory([])
    }

    try {
      setSavedQueries(normalizeStoredQueries(JSON.parse(
        window.localStorage.getItem(SAVED_QUERIES_STORAGE_KEY) ?? '[]',
      )).slice(0, 16))
    } catch {
      setSavedQueries([])
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(QUERY_DRAFT_STORAGE_KEY, queryText)
    } catch {
      // Ignore draft persistence failures.
    }
  }, [queryText])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(QUERY_HISTORY_STORAGE_KEY, JSON.stringify(queryHistory))
    } catch {
      // Ignore history persistence failures.
    }
  }, [queryHistory])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SAVED_QUERIES_STORAGE_KEY, JSON.stringify(savedQueries))
    } catch {
      // Ignore save persistence failures.
    }
  }, [savedQueries])

  const executeQuery = useCallback(async (sqlText: string) => {
    const normalized = sqlText.trim()
    if (!normalized) return

    setIsExecuting(true)
    setQueryError(null)
    setResult(null)
    writeQueryToUrl(normalized)

    try {
      const queryResult = await executeResultsWarehouseQuery({
        sql: normalized,
        currentJobId,
        maxRows: MAX_ROWS,
      })

      setResult({
        columns: queryResult.columns,
        rows: queryResult.rows,
        durationMs: queryResult.duration_ms,
        truncated: queryResult.truncated,
        appliedRowLimit: queryResult.applied_row_limit,
      })

      setQueryHistory(previous => {
        const timestamp = new Date().toISOString()
        const nextEntry: StoredQuery = {
          id: createQueryId(),
          name: deriveQueryName(normalized),
          sql: normalized,
          updatedAt: timestamp,
        }

        const deduped = previous.filter(entry => entry.sql !== normalized)
        return [nextEntry, ...deduped].slice(0, 12)
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setQueryError(message)
    } finally {
      setIsExecuting(false)
    }
  }, [currentJobId])

  useEffect(() => {
    if (!isReady) return
    if (!pendingAutoRunQueryRef.current) return
    const sql = pendingAutoRunQueryRef.current
    pendingAutoRunQueryRef.current = null
    void executeQuery(sql)
  }, [executeQuery, isReady])

  const handleExampleSelect = useCallback((query: string) => {
    setQueryText(query)
    void executeQuery(query)
  }, [executeQuery])

  const handleColumnClick = useCallback((tableName: string, columnName: string) => {
    const view = editorRef.current
    const insertion = `${tableName}.${columnName}`

    if (view) {
      const cursor = view.state.selection.main.head
      view.dispatch({
        changes: { from: cursor, to: cursor, insert: insertion },
        selection: { anchor: cursor + insertion.length },
      })
      view.focus()
      return
    }

    setQueryText(previous => `${previous}${previous ? ' ' : ''}${insertion}`)
  }, [])

  const handleSaveCurrentQuery = useCallback(() => {
    const normalized = queryText.trim()
    if (!normalized) return

    const normalizedName = saveName.trim() || deriveQueryName(normalized)
    const timestamp = new Date().toISOString()

    setSavedQueries(previous => {
      const existing = previous.find(entry => entry.name.toLowerCase() === normalizedName.toLowerCase())
      const nextEntry: StoredQuery = {
        id: existing?.id ?? createQueryId(),
        name: normalizedName,
        sql: normalized,
        updatedAt: timestamp,
      }

      const remainder = previous.filter(entry => entry.id !== existing?.id)
      return [nextEntry, ...remainder].slice(0, 16)
    })

    setSaveName('')
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1600)
  }, [queryText, saveName])

  const handleDeleteSaved = useCallback((id: string) => {
    setSavedQueries(previous => previous.filter(entry => entry.id !== id))
  }, [])

  const handleCopyShareLink = useCallback(() => {
    const normalized = queryText.trim()
    if (!normalized || typeof window === 'undefined') return
    writeQueryToUrl(normalized)
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkState('copied')
      setTimeout(() => setLinkState('idle'), 1600)
    })
  }, [queryText])

  const topRecentQueries = queryHistory.slice(0, 4)
  const exactLabels = exactRunId ? loadedRunLabels.filter(label => label.toLowerCase().includes('exact')) : []

  const warehouseState = status === 'loading' && !hasMetadata
    ? { label: 'Warming cache', className: 'border-accent/20 bg-accent/[0.08] text-accent' }
    : status === 'loading'
      ? { label: 'Refreshing metadata', className: 'border-accent/20 bg-accent/[0.08] text-accent' }
      : status === 'error'
        ? { label: 'Degraded', className: 'border-red-200 bg-red-50 text-red-600' }
        : { label: 'Live', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="space-y-5"
    >
      <section className="relative overflow-hidden rounded-[24px] border border-black/[0.08] bg-white/[0.97] shadow-[0_18px_50px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.02)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,248,250,0.98))]" />
        <div className="relative grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                'rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]',
                warehouseState.className,
              )}>
                {warehouseState.label}
              </span>
              <span className="rounded-full border border-black/[0.08] bg-black/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-primary/65">
                Server-side DuckDB
              </span>
              <span className="rounded-full border border-black/[0.08] bg-black/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-primary/65">
                Read-only SQL
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/45">
                  Data Lab
                </div>
                <h2 className="mt-2 max-w-3xl text-[clamp(1.6rem,1.2rem+1vw,2.3rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-text-primary">
                  Query the full published catalog, then splice in exact-run traces without leaving the product surface.
                </h2>
              </div>

              <p className="max-w-2xl text-[13px] leading-6 text-muted/65">
                The warehouse is built once on the server, cached for reuse, and guarded to a single read-only statement per run.
                Exact overlays attach when a local simulation is active, so researchers can compare frozen runs and live traces in the same schema.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-black/[0.08] bg-white/[0.8] px-3 py-1.5 text-[11px] text-muted/60">
                First cold start is slower; later refreshes use the cached warehouse file.
              </span>
              <span className="rounded-full border border-black/[0.08] bg-white/[0.8] px-3 py-1.5 text-[11px] text-muted/60">
                Result previews are capped at {MAX_ROWS.toLocaleString()} rows to keep the UI responsive.
              </span>
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-[18px] border border-black/[0.08] bg-black/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.05)] sm:grid-cols-2">
            {[
              {
                label: 'Published runs',
                value: hasMetadata ? publishedRunCount.toLocaleString() : '--',
                detail: 'Frozen catalog rows available now',
                icon: Database,
              },
              {
                label: 'Warehouse tables',
                value: hasMetadata ? tables.length.toLocaleString() : '--',
                detail: hasMetadata ? `${totalWarehouseRows.toLocaleString()} indexed rows` : 'Waiting for metadata',
                icon: Layers3,
              },
              {
                label: 'Exact overlay',
                value: exactRunId ? 'Attached' : 'Inactive',
                detail: exactRunId ? (exactLabels[0] ?? currentJobId ?? 'Active exact run') : 'Published catalog only',
                icon: BadgeCheck,
              },
              {
                label: 'Indexed',
                value: formatRelativeTimestamp(generatedAt),
                detail: formatAbsoluteTimestamp(generatedAt),
                icon: Clock3,
              },
            ].map(stat => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="bg-white/[0.94] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/45">
                      {stat.label}
                    </span>
                    <Icon className="h-4 w-4 text-accent/80" />
                  </div>
                  <div className="mt-4 text-[clamp(1.2rem,1rem+0.4vw,1.7rem)] font-semibold tracking-[-0.04em] text-text-primary">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-muted/58">
                    {stat.detail}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {status === 'error' && !hasMetadata && (
        <div className="rounded-[18px] border border-red-200 bg-red-50/85 px-5 py-4 shadow-[0_4px_18px_rgba(239,68,68,0.08),0_0_0_1px_rgba(239,68,68,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-500">
                Warehouse initialization failed
              </div>
              <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-700">
                {warehouseError}
              </pre>
            </div>
            <button
              onClick={refresh}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-red-600 transition-[transform,background-color] duration-150 hover:bg-white focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.12)] active:scale-[0.96]"
            >
              <RefreshCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {status === 'error' && hasMetadata && (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50/75 px-4 py-3 text-[11px] text-amber-800 shadow-[0_2px_10px_rgba(217,119,6,0.06)]">
          Metadata refresh failed, but the last successful warehouse snapshot is still available for querying.
        </div>
      )}

      {status === 'loading' && !hasMetadata && (
        <div className="rounded-[18px] border border-black/[0.08] bg-white/[0.95] px-6 py-5 shadow-[0_4px_18px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div>
              <div className="text-[12px] font-semibold text-text-primary">Connecting to the shared warehouse</div>
              <div className="text-[11px] text-muted/55">
                The server may be materializing the cached DuckDB file for the first time.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.86fr)_minmax(0,1.14fr)]">
        <aside className="overflow-hidden rounded-[20px] border border-black/[0.08] bg-white/[0.95] shadow-[0_12px_34px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)]">
          <div className="border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.01))] px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/45">
              Navigator
            </div>
            <p className="mt-2 max-w-md text-[12px] leading-6 text-muted/62">
              Browse schema, start from opinionated examples, and keep reusable cuts close to the query canvas.
            </p>
          </div>

          <section className="px-5 py-4">
            <button
              onClick={() => setSchemaOpen(previous => !previous)}
              className="flex w-full items-center justify-between gap-3 text-left transition-colors hover:text-text-primary active:scale-[0.995]"
            >
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/48">
                  Warehouse schema
                </div>
                <div className="mt-1 text-[11px] text-muted/58">
                  {hasMetadata
                    ? `${tables.length.toLocaleString()} tables and ${totalWarehouseRows.toLocaleString()} indexed rows`
                    : 'Schema metadata will appear as soon as the warehouse is ready.'}
                </div>
              </div>
              <motion.div
                animate={{ rotate: schemaOpen ? 0 : -90 }}
                transition={SPRING_SNAPPY}
                className="shrink-0 text-muted/40"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.div>
            </button>

            <AnimatePresence initial={false}>
              {schemaOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  className="overflow-hidden pt-4"
                >
                  <SqlSchemaBrowser
                    tables={tables}
                    onColumnClick={isReady ? handleColumnClick : undefined}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section className="border-t border-black/[0.06] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/48">
                  Example queries
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted/58">
                  Catalog comparisons, exact traces, and infrastructure checks with one click.
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-black/[0.03] text-accent">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="mt-4">
              <SqlExampleQueries
                onSelect={handleExampleSelect}
                disabled={!isReady}
                hasExactRun={Boolean(exactRunId)}
              />
            </div>
          </section>

          <section className="border-t border-black/[0.06] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/48">
                  Saved queries
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted/58">
                  Reusable research cuts that stay local to this client.
                </p>
              </div>
              <BookmarkPlus className="h-4 w-4 text-accent/75" />
            </div>

            {savedQueries.length === 0 ? (
              <div className="mt-4 rounded-[14px] border border-dashed border-black/[0.08] bg-black/[0.02] px-4 py-5 text-[11px] text-muted/58">
                Save the current draft with a short label to build a reusable research shelf.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {savedQueries.map(entry => (
                  <div
                    key={entry.id}
                    className="rounded-[14px] border border-black/[0.08] bg-white/[0.92] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-text-primary">
                          {entry.name}
                        </div>
                        <div className="mt-1 text-[10px] text-muted/48">
                          Saved {formatRelativeTimestamp(entry.updatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSaved(entry.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/[0.08] bg-black/[0.02] text-muted/45 transition-[transform,background-color,color] duration-150 hover:bg-black/[0.05] hover:text-danger focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.10)] active:scale-[0.94]"
                        title="Delete saved query"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setQueryText(entry.sql)}
                        className="rounded-full border border-black/[0.08] bg-white/[0.82] px-3 py-1.5 text-[11px] font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => {
                          setQueryText(entry.sql)
                          void executeQuery(entry.sql)
                        }}
                        className="rounded-full border border-accent/20 bg-accent/[0.08] px-3 py-1.5 text-[11px] font-medium text-accent transition-[transform,filter] duration-150 hover:brightness-105 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]"
                      >
                        Run
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border-t border-black/[0.06] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/48">
                  Recent executions
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted/58">
                  Re-open recent statements without leaving the analysis stage.
                </p>
              </div>
              <History className="h-4 w-4 text-accent/75" />
            </div>

            {topRecentQueries.length === 0 ? (
              <div className="mt-4 rounded-[14px] border border-dashed border-black/[0.08] bg-black/[0.02] px-4 py-5 text-[11px] text-muted/58">
                Recent runs will show up here after the first successful query.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {topRecentQueries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setQueryText(entry.sql)
                      void executeQuery(entry.sql)
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-[14px] border border-black/[0.08] bg-white/[0.92] px-3 py-3 text-left transition-[transform,background-color,border-color] duration-150 hover:-translate-y-[1px] hover:border-accent/20 hover:bg-accent/[0.03] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-text-primary">
                        {entry.name}
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-muted/45">
                        {entry.sql}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted/45">
                      {formatRelativeTimestamp(entry.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="overflow-hidden rounded-[20px] border border-black/[0.08] bg-white/[0.95] shadow-[0_12px_34px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)]">
          <div className="border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(37,99,235,0.05),rgba(37,99,235,0.015))] px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/48">
                    Analysis stage
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted/58">
                    Draft the statement, save a named cut, copy a deep link, and keep the execution flow on one surface.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-black/[0.08] bg-white/[0.76] px-2.5 py-1 font-mono text-[10px] text-muted/50">
                    {exactRunId ? 'exact overlay attached' : 'published catalog only'}
                  </span>
                  <span className="rounded-full border border-black/[0.08] bg-white/[0.76] px-2.5 py-1 font-mono text-[10px] text-muted/50">
                    {formatAbsoluteTimestamp(generatedAt)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={saveName}
                  onChange={event => setSaveName(event.target.value)}
                  placeholder={deriveQueryName(queryText || SQL_EXAMPLES[0]?.query || '')}
                  className="h-10 rounded-[12px] border border-black/[0.08] bg-white/[0.9] px-3 text-[11px] text-text-primary placeholder:text-muted/35 shadow-[0_1px_3px_rgba(0,0,0,0.03)] focus:border-accent/30 focus:outline-none focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveCurrentQuery}
                    disabled={!queryText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/[0.86] px-3 py-1.5 text-[11px] font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {saveState === 'saved' ? <Check className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
                    {saveState === 'saved' ? 'Saved' : 'Save query'}
                  </button>

                  <button
                    onClick={handleCopyShareLink}
                    disabled={!queryText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/[0.86] px-3 py-1.5 text-[11px] font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {linkState === 'copied' ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                    {linkState === 'copied' ? 'Link copied' : 'Copy link'}
                  </button>

                  <button
                    onClick={refresh}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/[0.86] px-3 py-1.5 text-[11px] font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]"
                  >
                    <RefreshCcw className={cn('h-3 w-3', status === 'loading' && 'animate-spin')} />
                    Refresh
                  </button>

                  <button
                    onClick={() => {
                      setQueryText('')
                      setResult(null)
                      setQueryError(null)
                      writeQueryToUrl(null)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/[0.86] px-3 py-1.5 text-[11px] font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]"
                  >
                    <Copy className="h-3 w-3" />
                    Reset stage
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-5">
            <SqlEditor
              value={queryText}
              onChange={setQueryText}
              tables={tables}
              onExecute={executeQuery}
              editorRef={editorRef}
              disabled={!isReady}
              isExecuting={isExecuting}
              chrome="embedded"
            />
          </div>

          <div className="border-t border-black/[0.06] px-5 py-5">
            <SqlResultsTable
              result={result}
              error={queryError}
              isExecuting={isExecuting}
              chrome="embedded"
            />
          </div>
        </section>
      </div>
    </motion.div>
  )
}
