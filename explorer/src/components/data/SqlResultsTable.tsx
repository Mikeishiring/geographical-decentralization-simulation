import { useState, useCallback, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
} from 'lucide-react'

import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'

export interface QueryResult {
  readonly columns: readonly string[]
  readonly rows: readonly Record<string, unknown>[]
  readonly durationMs: number
  readonly truncated: boolean
  readonly appliedRowLimit: number
}

interface SqlResultsTableProps {
  readonly result: QueryResult | null
  readonly error: string | null
  readonly isExecuting: boolean
  readonly chrome?: 'standalone' | 'embedded'
}

type SortDir = 'asc' | 'desc'

interface SortState {
  readonly column: string
  readonly dir: SortDir
}

const PAGE_SIZE = 200

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
  const body = rows.map(row => columns.map(column => {
    const value = row[column]
    if (value === null || value === undefined) return ''
    return String(value)
  }).join('\t'))
  return [header, ...body].join('\n')
}

function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const escape = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
  const header = columns.map(escape).join(',')
  const body = rows.map(row => columns.map(column => {
    const value = row[column]
    if (value === null || value === undefined) return ''
    return escape(String(value))
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

function computeSummary(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  numericColumns: ReadonlySet<string>,
) {
  const stats: Record<string, { sum: number; min: number; max: number; avg: number }> = {}
  for (const column of columns) {
    if (!numericColumns.has(column)) continue
    let sum = 0
    let min = Infinity
    let max = -Infinity
    let count = 0
    for (const row of rows) {
      const value = row[column]
      if (typeof value === 'number') {
        sum += value
        min = Math.min(min, value)
        max = Math.max(max, value)
        count += 1
      } else if (typeof value === 'bigint') {
        const numericValue = Number(value)
        sum += numericValue
        min = Math.min(min, numericValue)
        max = Math.max(max, numericValue)
        count += 1
      }
    }
    if (count > 0) {
      stats[column] = { sum, min, max, avg: sum / count }
    }
  }
  return stats
}

function formatStat(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString()
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const ERROR_HINTS: Record<string, string> = {
  'Catalog Error: Table': 'Check the schema browser for exposed warehouse tables such as runs, run_metric_snapshots, and run_slot_metrics.',
  'Binder Error: Column': 'Click a column in the schema browser to insert the fully-qualified name.',
  'Parser Error': 'DuckDB accepts PostgreSQL-style SQL. Look for a missing comma, quote, or closing parenthesis.',
  'Binder Error: Referenced column': 'Column names are case-sensitive in DuckDB.',
  'Only read-only SELECT': 'The shared warehouse only allows SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN.',
  'Only a single read-only': 'Run one statement at a time. Multi-statement SQL is blocked in the shared warehouse.',
}

function getErrorHint(message: string): string | null {
  for (const [pattern, hint] of Object.entries(ERROR_HINTS)) {
    if (message.includes(pattern)) return hint
  }
  return null
}

export function SqlResultsTable({
  result,
  error,
  isExecuting,
  chrome = 'standalone',
}: SqlResultsTableProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [sort, setSort] = useState<SortState | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [page, setPage] = useState(1)

  const copyToClipboard = useCallback(() => {
    if (!result) return
    const text = toTsv(result.columns, result.rows)
    void navigator.clipboard.writeText(text).then(() => {
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    })
  }, [result])

  const downloadCsv = useCallback(() => {
    if (!result) return
    const csv = toCsv(result.columns, result.rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `query-results-${Date.now()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [result])

  const toggleSort = useCallback((column: string) => {
    setSort(previous => {
      if (previous?.column === column) {
        return previous.dir === 'asc' ? { column, dir: 'desc' } : null
      }
      return { column, dir: 'asc' }
    })
  }, [])

  const numericColumns = useMemo(() => {
    const set = new Set<string>()
    if (!result || result.rows.length === 0) return set
    for (const column of result.columns) {
      const sample = result.rows.find(row => row[column] !== null && row[column] !== undefined)
      if (sample && isNumeric(sample[column])) {
        set.add(column)
      }
    }
    return set
  }, [result])

  const sortedRows = useMemo(() => {
    if (!result || !sort) return result?.rows ?? []
    const { column, dir } = sort
    return [...result.rows].sort((left, right) => {
      const comparison = compareValues(left[column], right[column])
      return dir === 'asc' ? comparison : -comparison
    })
  }, [result, sort])

  const summary = useMemo(() => {
    if (!result || result.rows.length < 2) return null
    return computeSummary(result.columns, result.rows, numericColumns)
  }, [result, numericColumns])

  useEffect(() => {
    setPage(1)
  }, [result, sort])

  if (isExecuting) {
    return (
      <div className="rounded-[18px] border border-black/[0.08] bg-white/[0.95] px-6 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <div>
            <div className="text-[12px] font-semibold text-text-primary">Querying the shared warehouse</div>
            <div className="text-[11px] text-muted/55">
              The result preview will render as soon as DuckDB returns the current statement.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    const hint = getErrorHint(error)
    return (
      <div className="rounded-[18px] border border-red-200 bg-red-50/85 px-5 py-4 shadow-[0_4px_18px_rgba(239,68,68,0.08),0_0_0_1px_rgba(239,68,68,0.08)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-500">
          Query failed
        </div>
        <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-700">
          {error}
        </pre>
        {hint && (
          <div className="mt-3 rounded-[12px] border border-red-200/80 bg-white/60 px-3 py-2 text-[11px] text-red-700/85">
            {hint}
          </div>
        )}
      </div>
    )
  }

  if (!result) {
    return (
      <div className="rounded-[18px] border border-dashed border-black/[0.08] bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.01))] px-6 py-10 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/40">
          Result stage
        </div>
        <p className="mt-2 text-[12px] text-muted/60">
          Run a query to inspect warehouse rows, sort the preview, and export the result set.
        </p>
      </div>
    )
  }

  const { columns, rows, durationMs, truncated, appliedRowLimit } = result
  const hasNumericColumns = numericColumns.size > 0
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const startIndex = (page - 1) * PAGE_SIZE
  const endIndex = Math.min(rows.length, startIndex + PAGE_SIZE)
  const visibleRows = sortedRows.slice(startIndex, endIndex)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
      className={cn(
        'overflow-hidden',
        chrome === 'standalone'
          ? 'rounded-[18px] border border-black/[0.08] bg-white/[0.96] shadow-[0_8px_28px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)]'
          : 'rounded-[14px] border border-black/[0.06] bg-white/[0.8]',
      )}
    >
      <div className="flex flex-col gap-4 border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(37,99,235,0.04),rgba(37,99,235,0.01))] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/55">
              Result preview
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted/60">
              Interactive preview with client-side sort, pagination, clipboard export, and CSV download.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-black/[0.08] bg-white/[0.82] px-2.5 py-1 font-mono text-[10px] text-text-primary/68">
              {rows.length.toLocaleString()} rows
            </span>
            <span className="rounded-full border border-black/[0.08] bg-white/[0.82] px-2.5 py-1 font-mono text-[10px] text-text-primary/68">
              {columns.length.toLocaleString()} cols
            </span>
            <span className="rounded-full border border-black/[0.08] bg-white/[0.82] px-2.5 py-1 font-mono text-[10px] text-text-primary/68">
              {formatDuration(durationMs)}
            </span>
            {truncated && (
              <span className="rounded-full border border-accent/20 bg-accent/[0.08] px-2.5 py-1 font-mono text-[10px] text-accent">
                capped at {appliedRowLimit.toLocaleString()} rows
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasNumericColumns && rows.length >= 2 && (
            <button
              onClick={() => setShowSummary(previous => !previous)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-medium',
                'transition-[transform,background-color,border-color,color] duration-150',
                'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]',
                showSummary
                  ? 'border-accent/20 bg-accent/[0.08] text-accent'
                  : 'border-black/[0.08] bg-white/[0.84] text-muted/60 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent',
              )}
            >
              {showSummary ? 'Hide stats' : 'Show stats'}
            </button>
          )}

          <button
            onClick={copyToClipboard}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium',
              'border-black/[0.08] bg-white/[0.84] transition-[transform,background-color,border-color,color] duration-150',
              'hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent',
              'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]',
              copyState === 'copied' ? 'text-emerald-600' : 'text-muted/60',
            )}
            title="Copy as TSV"
          >
            {copyState === 'copied' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copyState === 'copied' ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/[0.84] px-3 py-1.5 text-[11px] font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96]"
            title="Download as CSV"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {showSummary && summary && Object.keys(summary).length > 0 && (
        <div className="border-b border-black/[0.06] bg-black/[0.02] px-4 py-3">
          <div className="flex gap-4 overflow-x-auto pb-1">
            {columns.filter(column => summary[column]).map(column => {
              const stats = summary[column]
              return (
                <div
                  key={column}
                  className="min-w-[220px] rounded-[12px] border border-black/[0.08] bg-white/[0.84] px-3 py-2"
                >
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted/45">
                    {column}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted/60">
                    <span>sum <span className="font-mono text-text-primary/72">{formatStat(stats.sum)}</span></span>
                    <span>avg <span className="font-mono text-text-primary/72">{formatStat(stats.avg)}</span></span>
                    <span>min <span className="font-mono text-text-primary/72">{formatStat(stats.min)}</span></span>
                    <span>max <span className="font-mono text-text-primary/72">{formatStat(stats.max)}</span></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/40">
            Empty result
          </div>
          <p className="mt-2 text-[12px] text-muted/60">
            DuckDB executed the statement successfully, but no rows matched the filter.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-black/[0.06] bg-[rgba(248,249,251,0.94)] backdrop-blur-sm">
                  {columns.map(column => {
                    const isSorted = sort?.column === column
                    const isNumericColumn = numericColumns.has(column)
                    return (
                      <th
                        key={column}
                        onClick={() => toggleSort(column)}
                        className={cn(
                          'cursor-pointer whitespace-nowrap px-3 py-2.5 select-none',
                          'font-mono text-[10px] font-semibold uppercase tracking-[0.16em]',
                          'transition-colors hover:text-accent',
                          isSorted ? 'text-accent' : 'text-muted/60',
                          isNumericColumn && 'text-right',
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {column}
                          {isSorted && (
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
                {visibleRows.map((row, rowIndex) => (
                  <tr
                    key={`${startIndex + rowIndex}`}
                    className={cn(
                      'border-b border-black/[0.05] transition-colors hover:bg-accent/[0.03]',
                      rowIndex % 2 === 1 && 'bg-black/[0.015]',
                    )}
                  >
                    {columns.map(column => {
                      const value = row[column]
                      const isNull = value === null || value === undefined
                      const isNumericColumn = numericColumns.has(column)
                      const formattedValue = formatCell(value)
                      const isLongText = !isNumericColumn && formattedValue.length > 48
                      return (
                        <td
                          key={column}
                          title={formattedValue}
                          className={cn(
                            'px-3 py-2 font-mono text-[11px] tabular-nums',
                            isNull ? 'italic text-muted/32' : 'text-text-primary/88',
                            isNumericColumn ? 'whitespace-nowrap text-right' : 'max-w-[360px]',
                          )}
                        >
                          <span className={cn(!isNumericColumn && isLongText && 'block truncate')}>
                            {formattedValue}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/[0.06] bg-black/[0.02] px-4 py-3 text-[10px] sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="font-mono text-muted/50">
                Showing rows {startIndex + 1}-{endIndex} of {rows.length.toLocaleString()}
              </div>
              <div className="text-muted/50">
                {truncated
                  ? `The warehouse capped the result preview at ${appliedRowLimit.toLocaleString()} rows. Narrow the query or add LIMIT for a tighter slice.`
                  : 'Client-side pagination keeps large previews responsive while exports still include the full fetched result.'}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => setPage(current => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/[0.84] px-3 py-1.5 font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronLeft className="h-3 w-3" />
                Prev
              </button>

              <span className="min-w-[84px] text-center font-mono text-muted/55">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/[0.84] px-3 py-1.5 font-medium text-muted/60 transition-[transform,background-color,border-color,color] duration-150 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
