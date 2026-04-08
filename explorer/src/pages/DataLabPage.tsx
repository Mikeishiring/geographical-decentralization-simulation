import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Database } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { useDuckDB } from '../hooks/useDuckDB'
import { SqlEditor } from '../components/data/SqlEditor'
import { SqlResultsTable, type QueryResult } from '../components/data/SqlResultsTable'
import { SqlExampleQueries } from '../components/data/SqlExampleQueries'
import { SqlSchemaBrowser } from '../components/data/SqlSchemaBrowser'
import { cn } from '../lib/cn'
import { SPRING, CONTENT_MAX_WIDTH } from '../lib/theme'

export function DataLabPage() {
  const { conn, status, error: dbError, tables } = useDuckDB()
  const editorRef = useRef<EditorView | null>(null)

  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  const executeQuery = useCallback(async (sqlText: string) => {
    if (!conn) return

    setIsExecuting(true)
    setQueryError(null)
    setResult(null)

    const start = performance.now()

    try {
      const arrowResult = await conn.query(sqlText)
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
    <div className={cn(CONTENT_MAX_WIDTH, 'mx-auto')}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="space-y-5"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/[0.08]">
            <Database className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary leading-tight">Data Lab</h1>
            <p className="text-11 text-muted/60">
              Query the raw research datasets with SQL — powered by DuckDB in your browser
            </p>
          </div>
        </div>

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

        {/* Schema browser */}
        {(isReady || status === 'loading') && (
          <section>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted/40">
              Tables
            </div>
            <SqlSchemaBrowser
              tables={tables}
              onColumnClick={isReady ? handleColumnClick : undefined}
            />
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
      </motion.div>
    </div>
  )
}
