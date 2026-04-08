import { useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Copy, Download, Check, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'

export interface QueryResult {
  readonly columns: readonly string[]
  readonly rows: readonly Record<string, unknown>[]
  readonly durationMs: number
}

interface SqlResultsTableProps {
  readonly result: QueryResult | null
  readonly error: string | null
  readonly isExecuting: boolean
}

type SortDir = 'asc' | 'desc'
interface SortState {
  readonly column: string
  readonly dir: SortDir
}

function isNumeric(value: unknown): boolean {
  return typeof value === 'number' || typeof value === 'bigint'
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'bigint') return value.toLocaleString()
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString()
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  return String(value)
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function toTsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const header = columns.join('\t')
  const body = rows.map(row => columns.map(col => {
    const v = row[col]
    if (v === null || v === undefined) return ''
    return String(v)
  }).join('\t'))
  return [header, ...body].join('\n')
}

function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const escape = (s: string) => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const header = columns.map(escape).join(',')
  const body = rows.map(row => columns.map(col => {
    const v = row[col]
    if (v === null || v === undefined) return ''
    return escape(String(v))
  }).join(','))
  return [header, ...body].join('\n')
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
  return String(a).localeCompare(String(b))
}

/** Compute summary stats for numeric columns */
function computeSummary(columns: readonly string[], rows: readonly Record<string, unknown>[], numericCols: ReadonlySet<string>) {
  const stats: Record<string, { sum: number; min: number; max: number; avg: number }> = {}
  for (const col of columns) {
    if (!numericCols.has(col)) continue
    let sum = 0
    let min = Infinity
    let max = -Infinity
    let count = 0
    for (const row of rows) {
      const v = row[col]
      if (typeof v === 'number') {
        sum += v
        min = Math.min(min, v)
        max = Math.max(max, v)
        count++
      } else if (typeof v === 'bigint') {
        const n = Number(v)
        sum += n
        min = Math.min(min, n)
        max = Math.max(max, n)
        count++
      }
    }
    if (count > 0) {
      stats[col] = { sum, min, max, avg: sum / count }
    }
  }
  return stats
}

function formatStat(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString()
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString()
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const ERROR_HINTS: Record<string, string> = {
  'Catalog Error: Table': 'Available tables: validators, gcp_latency, gcp_regions',
  'Binder Error: Column': 'Click a column name in the schema browser to insert it',
  'Parser Error': 'Check SQL syntax — DuckDB uses PostgreSQL-style SQL',
  'Binder Error: Referenced column': 'Column names are case-sensitive in DuckDB',
}

function getErrorHint(message: string): string | null {
  for (const [pattern, hint] of Object.entries(ERROR_HINTS)) {
    if (message.includes(pattern)) return hint
  }
  return null
}

export function SqlResultsTable({ result, error, isExecuting }: SqlResultsTableProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [sort, setSort] = useState<SortState | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  const copyToClipboard = useCallback(() => {
    if (!result) return
    const text = toTsv(result.columns, result.rows)
    void navigator.clipboard.writeText(text).then(() => {
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    })
  }, [result])

  const downloadCsv = useCallback(() => {
    if (!result) return
    const csv = toCsv(result.columns, result.rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [result])

  const toggleSort = useCallback((col: string) => {
    setSort(prev => {
      if (prev?.column === col) {
        return prev.dir === 'asc' ? { column: col, dir: 'desc' } : null
      }
      return { column: col, dir: 'asc' }
    })
  }, [])

  // Detect numeric columns
  const numericColumns = useMemo(() => {
    const set = new Set<string>()
    if (!result || result.rows.length === 0) return set
    for (const col of result.columns) {
      const sample = result.rows.find(r => r[col] !== null && r[col] !== undefined)
      if (sample && isNumeric(sample[col])) {
        set.add(col)
      }
    }
    return set
  }, [result])

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!result || !sort) return result?.rows ?? []
    const { column, dir } = sort
    return [...result.rows].sort((a, b) => {
      const cmp = compareValues(a[column], b[column])
      return dir === 'asc' ? cmp : -cmp
    })
  }, [result, sort])

  // Summary stats
  const summary = useMemo(() => {
    if (!result || result.rows.length < 2) return null
    return computeSummary(result.columns, result.rows, numericColumns)
  }, [result, numericColumns])

  if (isExecuting) {
    return (
      <div className="rounded-2xl border border-rule bg-white/92 px-6 py-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-13 text-muted">Executing query...</span>
        </div>
      </div>
    )
  }

  if (error) {
    const hint = getErrorHint(error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-wide text-red-400">Error</div>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-700">
          {error}
        </pre>
        {hint && (
          <div className="mt-3 rounded-lg bg-red-100/50 px-3 py-2 text-[11px] text-red-600/80">
            {hint}
          </div>
        )}
      </div>
    )
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-rule/60 bg-surface-active/30 px-6 py-10 text-center">
        <div className="text-13 text-muted/60">
          Run a query to see results
        </div>
      </div>
    )
  }

  const { columns, rows, durationMs } = result
  const hasNumericCols = numericColumns.size > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
      className="rounded-2xl border border-rule bg-white/92 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      {/* Results header with actions */}
      <div className="flex items-center justify-between border-b border-rule/60 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted/50">
            Results
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted/40">
            {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''} · {columns.length} col{columns.length !== 1 ? 's' : ''} · {formatDuration(durationMs)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {hasNumericCols && rows.length >= 2 && (
            <button
              onClick={() => setShowSummary(prev => !prev)}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1',
                'text-[10px] font-medium transition-colors',
                showSummary ? 'text-accent bg-accent/[0.06]' : 'text-muted/50 hover:bg-surface-active',
              )}
              title="Toggle summary statistics"
            >
              Stats
            </button>
          )}
          <button
            onClick={copyToClipboard}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2 py-1',
              'text-[10px] font-medium',
              'hover:bg-surface-active transition-colors',
              copyState === 'copied' ? 'text-emerald-600' : 'text-muted/50',
            )}
            title="Copy as TSV (paste into spreadsheets)"
          >
            {copyState === 'copied' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copyState === 'copied' ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={downloadCsv}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2 py-1',
              'text-[10px] font-medium text-muted/50',
              'hover:bg-surface-active transition-colors',
            )}
            title="Download as CSV"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Summary stats bar */}
      {showSummary && summary && Object.keys(summary).length > 0 && (
        <div className="border-b border-rule/40 bg-accent/[0.02] px-4 py-2 overflow-x-auto">
          <div className="flex gap-6">
            {columns.filter(col => summary[col]).map(col => {
              const s = summary[col]
              return (
                <div key={col} className="shrink-0">
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted/50">{col}</div>
                  <div className="mt-0.5 flex gap-3">
                    <span className="text-[10px] text-muted/60">
                      sum <span className="font-mono tabular-nums text-text-primary/70">{formatStat(s.sum)}</span>
                    </span>
                    <span className="text-[10px] text-muted/60">
                      avg <span className="font-mono tabular-nums text-text-primary/70">{formatStat(s.avg)}</span>
                    </span>
                    <span className="text-[10px] text-muted/60">
                      min <span className="font-mono tabular-nums text-text-primary/70">{formatStat(s.min)}</span>
                    </span>
                    <span className="text-[10px] text-muted/60">
                      max <span className="font-mono tabular-nums text-text-primary/70">{formatStat(s.max)}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Scrollable table area */}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-rule/60 bg-surface-active/60 backdrop-blur-sm">
              {columns.map(col => {
                const isSorted = sort?.column === col
                const isNum = numericColumns.has(col)
                return (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 cursor-pointer select-none',
                      'font-mono text-[10px] font-semibold uppercase tracking-wide',
                      'hover:text-accent/80 transition-colors',
                      isSorted ? 'text-accent' : 'text-muted/70',
                      isNum && 'text-right',
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {isNum && isSorted && (
                        sort.dir === 'asc'
                          ? <ArrowUp className="h-2.5 w-2.5" />
                          : <ArrowDown className="h-2.5 w-2.5" />
                      )}
                      {col}
                      {!isNum && isSorted && (
                        sort.dir === 'asc'
                          ? <ArrowUp className="h-2.5 w-2.5" />
                          : <ArrowDown className="h-2.5 w-2.5" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'border-b border-rule/20 hover:bg-accent/[0.03] transition-colors',
                  i % 2 === 1 && 'bg-surface-active/20',
                )}
              >
                {columns.map(col => {
                  const value = row[col]
                  const isNull = value === null || value === undefined
                  const isNum = numericColumns.has(col)
                  return (
                    <td
                      key={col}
                      className={cn(
                        'whitespace-nowrap px-3 py-1.5',
                        'font-mono text-[11px] tabular-nums',
                        isNull ? 'italic text-muted/30' : 'text-text-primary',
                        isNum && 'text-right',
                      )}
                    >
                      {formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 100 && (
        <div className="border-t border-rule/40 px-4 py-2 text-center">
          <span className="text-[10px] text-muted/40">
            Showing all {rows.length.toLocaleString()} rows — add LIMIT to reduce
          </span>
        </div>
      )}
    </motion.div>
  )
}
