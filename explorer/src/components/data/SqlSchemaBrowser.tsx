import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, Table2 } from 'lucide-react'

import { cn } from '../../lib/cn'
import type { TableMeta } from '../../lib/results-warehouse-api'
import { SPRING_SNAPPY } from '../../lib/theme'

interface SqlSchemaBrowserProps {
  readonly tables: readonly TableMeta[]
  readonly onColumnClick?: (tableName: string, columnName: string) => void
}

const EXACT_OVERLAY_TABLES = new Set([
  'run_proposal_times',
  'run_attestations',
  'run_region_profits',
  'run_migration_events',
])

const INFRA_TABLES = new Set([
  'validators',
  'gcp_latency',
  'gcp_regions',
])

function shortType(type: string): string {
  return type
    .replace('VARCHAR', 'text')
    .replace('BIGINT', 'int8')
    .replace('INTEGER', 'int4')
    .replace('DOUBLE', 'float8')
    .replace('FLOAT', 'float4')
    .replace('TIMESTAMP', 'time')
    .replace('BOOLEAN', 'bool')
    .toLowerCase()
}

function tableMode(tableName: string): {
  readonly label: string
  readonly className: string
} {
  if (EXACT_OVERLAY_TABLES.has(tableName)) {
    return {
      label: 'Exact overlay',
      className: 'border-accent/20 bg-accent/[0.06] text-accent',
    }
  }
  if (INFRA_TABLES.has(tableName)) {
    return {
      label: 'Infra',
      className: 'border-black/[0.08] bg-black/[0.03] text-muted/55',
    }
  }
  return {
    label: 'Catalog',
    className: 'border-black/[0.08] bg-black/[0.03] text-text-primary/65',
  }
}

export function SqlSchemaBrowser({ tables, onColumnClick }: SqlSchemaBrowserProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  useEffect(() => {
    setExpanded(previous => {
      const next = { ...previous }
      for (const table of tables) {
        if (!(table.name in next)) {
          next[table.name] = table.name === 'runs' || table.name === 'run_metric_snapshots'
        }
      }
      return next
    })
  }, [tables])

  const filteredTables = useMemo(() => {
    if (!deferredSearch) return tables
    return tables.filter(table => (
      table.name.toLowerCase().includes(deferredSearch)
      || table.columns.some(column => column.name.toLowerCase().includes(deferredSearch))
    ))
  }, [deferredSearch, tables])

  if (tables.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-black/[0.08] bg-black/[0.02] px-4 py-6 text-center">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted/40">
          Loading schema
        </div>
        <p className="mt-2 text-[11px] text-muted/55">
          Waiting for table metadata from the server-side warehouse.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/55">
            Schema browser
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted/60">
            Search tables or columns, then click a column to insert a fully-qualified reference into the editor.
          </p>
        </div>

        <label className="relative block min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted/35" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search tables or columns"
            className={cn(
              'h-10 w-full rounded-[12px] border border-black/[0.08] bg-white/[0.92] pl-9 pr-3',
              'text-[11px] text-text-primary placeholder:text-muted/35',
              'shadow-[0_1px_3px_rgba(0,0,0,0.03)]',
              'focus:border-accent/30 focus:outline-none focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
            )}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className="font-mono text-muted/45">
          {filteredTables.length.toLocaleString()} / {tables.length.toLocaleString()} tables
        </span>
        <span className="text-muted/45">
          {EXACT_OVERLAY_TABLES.size} exact-detail tables attach when an exact run is active.
        </span>
      </div>

      {filteredTables.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-black/[0.08] bg-black/[0.02] px-4 py-6 text-center">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted/40">
            No matches
          </div>
          <p className="mt-2 text-[11px] text-muted/55">
            Try a table prefix like <span className="font-mono">run_</span> or a column such as <span className="font-mono">slot_number</span>.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredTables.map(table => {
            const mode = tableMode(table.name)
            const isExpanded = deferredSearch ? true : (expanded[table.name] ?? false)

            return (
              <div
                key={table.name}
                className="overflow-hidden rounded-[16px] border border-black/[0.08] bg-white/[0.95] shadow-[0_2px_10px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)]"
              >
                <button
                  onClick={() => setExpanded(previous => ({ ...previous, [table.name]: !previous[table.name] }))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] active:scale-[0.995]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-black/[0.03] text-accent">
                    <Table2 className="h-3.5 w-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[11px] font-semibold text-text-primary">
                        {table.name}
                      </span>
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]',
                        mode.className,
                      )}>
                        {mode.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-muted/45">
                      <span className="font-mono">{table.columns.length.toLocaleString()} cols</span>
                      <span className="font-mono">{table.rowCount.toLocaleString()} rows</span>
                    </div>
                  </div>

                  <motion.div
                    animate={{ rotate: isExpanded ? 0 : -90 }}
                    transition={SPRING_SNAPPY}
                    className="shrink-0 text-muted/40"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={SPRING_SNAPPY}
                      className="overflow-hidden"
                    >
                      <div className="grid gap-px border-t border-black/[0.06] bg-black/[0.05] p-px sm:grid-cols-2">
                        {table.columns.map(column => (
                          <button
                            key={column.name}
                            onClick={() => onColumnClick?.(table.name, column.name)}
                            className={cn(
                              'flex items-center justify-between gap-3 bg-white px-3 py-2 text-left transition-colors',
                              'hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(37,99,235,0.14)]',
                              'active:scale-[0.995]',
                              !onColumnClick && 'cursor-default hover:bg-white active:scale-100',
                            )}
                            title={`${table.name}.${column.name} (${column.type})`}
                          >
                            <span className="min-w-0 truncate font-mono text-[10px] text-text-primary/82">
                              {column.name}
                            </span>
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted/45">
                              {shortType(column.type)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
