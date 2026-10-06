import { useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useDuckDB } from '../../hooks/useDuckDB'
import { SqlEditor } from './SqlEditor'
import { SqlResultsTable, type QueryResult } from './SqlResultsTable'
import { SqlSchemaBrowser } from './SqlSchemaBrowser'
import { SqlExampleQueries } from './SqlExampleQueries'

export default function DemoDataLab({ onBack }: { readonly onBack: () => void }) {
  const { conn, status, error: loadError, tables, loadedRunLabels } = useDuckDB()
  const editorRef = useRef<EditorView | null>(null)
  const [sql, setSql] = useState('SELECT label, paradigm_label, validators, total_slots FROM runs ORDER BY label;')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function execute(query: string) {
    if (!conn || busy) return
    setBusy(true)
    setError(null)
    const start = performance.now()
    try {
      const statement = query.trim().replace(/;$/, '')
      if (!/^(SELECT|WITH)\b/i.test(statement) || statement.includes(';')) throw new Error('Use one SELECT query to explore the saved data.')
      const output = await conn.query(`SELECT * FROM (${statement}) AS demo_query LIMIT 10001`)
      const rows = output.toArray()
      setResult({ columns: output.schema.fields.map(field => field.name), rows: rows.slice(0, 10000).map(row => row.toJSON()), durationMs: performance.now() - start, truncated: rows.length > 10000, appliedRowLimit: 10000 })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The query could not run.')
    } finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <button className="rounded px-2 py-2 text-sm text-accent hover:bg-accent/5 focus-visible:ring-2" onClick={onBack}>← Simulation results</button>
    <div>
      <h2 className="text-xl font-semibold text-text-primary">Data Lab</h2>
      <p className="mt-2 text-sm leading-6 text-muted">SQL runs in your browser. Compare all published runs and their recorded metric snapshots. Slot-level tables show the default recorded run: {loadedRunLabels.join(', ') || 'loading…'}.</p>
    </div>
    {status === 'loading' && <p role="status" className="text-sm text-muted">Loading the browser database and saved research data…</p>}
    {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}
    <div className="space-y-5">
      <details className="rounded-lg border border-rule p-4">
      <summary className="cursor-pointer text-sm font-medium text-text-primary">Browse tables and columns</summary>
      <SqlSchemaBrowser hideExact tables={tables.filter(table => table.rowCount > 0)} onColumnClick={(table, column) => {
        const editor = editorRef.current
        if (!editor) return
        editor.dispatch(editor.state.replaceSelection(`${table}.${column}`))
        editor.focus()
      }} />
      </details>
      <div className="min-w-0 space-y-5">
        <SqlEditor editorRef={editorRef} browserLocal value={sql} onChange={setSql} tables={tables} onExecute={execute} disabled={status !== 'ready'} isExecuting={busy} />
        <SqlResultsTable result={result} error={error} isExecuting={busy} />
        <SqlExampleQueries hideExact onSelect={setSql} disabled={status !== 'ready'} />
      </div>
    </div>
  </div>
}
