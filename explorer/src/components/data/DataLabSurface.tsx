import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { useDuckDB } from '../../hooks/useDuckDB'
import { SqlEditor } from './SqlEditor'
import { SqlResultsTable, type QueryResult } from './SqlResultsTable'
import { SqlExampleQueries } from './SqlExampleQueries'
import { SqlSchemaBrowser } from './SqlSchemaBrowser'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../../lib/theme'

/**
 * The Data Lab content surface — used inside SimulationLabPage
 * when the user toggles to "Data" mode. No header; the parent
 * provides the mode toggle and title.
 */
export function DataLabSurface() {
  const { conn, status, error: dbError, tables } = useDuckDB()
  const editorRef = useRef<EditorView | null>(null)

  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryHistory, setQueryHistory] = useState<readonly string[]>([])
  const [schemaOpen, setSchemaOpen] = useState(true)

  const MAX_ROWS = 10_000

  const executeQuery = useCallback(async (sqlText: string) => {
    if (!conn) return

    setIsExecuting(true)
    setQueryError(null)
    setResult(null)

    // Auto-add LIMIT if the query doesn't have one, to prevent browser hangs
    const normalizedSql = sqlText.trim()
    const hasLimit = /\bLIMIT\s+\d/i.test(normalizedSql)
    const safeSql = hasLimit ? normalizedSql : `${normalizedSql}\nLIMIT ${MAX_ROWS}`

    const start = performance.now()

    try {
      const arrowResult = await conn.query(safeSql)
      const durationMs = performance.now() - start

      const columns = arrowResult.schema.fields.map(f => f.name)
      const rawRows = arrowResult.toArray()

      const rows = rawRows.map(row => {
        const obj: Record<string, unknown> = {}
        for (const col of columns) {
          obj[col] = row[col]
        }
        return obj
      })

      setResult({ columns, rows, durationMs })

      // Track history (deduplicated, most recent first)
      setQueryHistory(prev => {
        const normalized = sqlText.trim()
        const without = prev.filter(q => q !== normalized)
        return [normalized, ...without].slice(0, 20)
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setQueryError(message)
    } finally {
      setIsExecuting(false)
    }
  }, [conn])

  const handleExampleSelect = useCallback((query: string) => {
    const view = editorRef.current
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: query },
      })
    }
    void executeQuery(query)
  }, [executeQuery])

  const handleColumnClick = useCallback((tableName: string, columnName: string) => {
    const view = editorRef.current
    if (!view) return

    const cursor = view.state.selection.main.head
    const insertion = `${tableName}.${columnName}`
    view.dispatch({
      changes: { from: cursor, to: cursor, insert: insertion },
      selection: { anchor: cursor + insertion.length },
    })
    view.focus()
  }, [])

  const isReady = status === 'ready'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="space-y-4"
    >
      {/* DB initialization error */}
      {status === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4">
          <div className="text-[10px] font-medium uppercase tracking-wide text-red-400">
            Database initialization failed
          </div>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-red-700">
            {dbError}
          </pre>
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div className="rounded-2xl border border-rule bg-white/92 px-6 py-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div>
              <div className="text-13 font-medium text-text-primary">Loading DuckDB</div>
              <div className="text-11 text-muted/50">
                Fetching WASM engine and importing research datasets (~4MB)...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schema browser — collapsible */}
      {(isReady || status === 'loading') && (
        <section
          className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
        >
          <button
            onClick={() => setSchemaOpen(prev => !prev)}
            className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-surface-active/30 transition-colors"
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted/50">
              Tables
              {isReady && (
                <span className="ml-1.5 font-mono tabular-nums text-muted/30">
                  {tables.reduce((acc, t) => acc + t.rowCount, 0).toLocaleString()} rows across {tables.length} tables
                </span>
              )}
            </span>
            <motion.div
              animate={{ rotate: schemaOpen ? 0 : -90 }}
              transition={SPRING_SNAPPY}
            >
              <ChevronDown className="h-3 w-3 text-muted/40" />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {schemaOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING_SNAPPY}
                className="overflow-hidden"
              >
                <div className="border-t border-rule/40 px-4 py-3">
                  <SqlSchemaBrowser
                    tables={tables}
                    onColumnClick={isReady ? handleColumnClick : undefined}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Example queries */}
      <section>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted/40">
          Examples
        </div>
        <SqlExampleQueries onSelect={handleExampleSelect} disabled={!isReady} />
      </section>

      {/* SQL editor */}
      <section>
        <SqlEditor
          tables={tables}
          onExecute={executeQuery}
          editorRef={editorRef}
          disabled={!isReady}
          isExecuting={isExecuting}
        />
      </section>

      {/* Results */}
      <section>
        <SqlResultsTable
          result={result}
          error={queryError}
          isExecuting={isExecuting}
        />
      </section>

      {/* Query history */}
      {queryHistory.length > 1 && (
        <section>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted/40">
            Recent queries
          </div>
          <div className="flex flex-wrap gap-1.5">
            {queryHistory.slice(1, 6).map((q, i) => (
              <button
                key={i}
                onClick={() => handleExampleSelect(q)}
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 max-w-[300px]',
                  'text-[10px] font-mono text-muted/50 truncate',
                  'border border-rule/40 bg-white/60',
                  'hover:border-accent/30 hover:text-accent hover:bg-accent/[0.04]',
                  'active:scale-[0.95] transition-all',
                )}
              >
                {q.length > 60 ? q.slice(0, 60) + '...' : q}
              </button>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  )
}
