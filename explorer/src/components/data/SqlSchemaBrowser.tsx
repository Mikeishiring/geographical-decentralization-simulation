import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Table2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_SNAPPY } from '../../lib/theme'
import type { TableMeta } from '../../hooks/useDuckDB'

interface SqlSchemaBrowserProps {
  readonly tables: readonly TableMeta[]
  readonly onColumnClick?: (tableName: string, columnName: string) => void
}

function typeColor(type: string): string {
  const t = type.toUpperCase()
  if (t.includes('INT') || t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL') || t.includes('BIGINT')) {
    return 'text-blue-500'
  }
  if (t.includes('VARCHAR') || t.includes('TEXT')) {
    return 'text-amber-600'
  }
  if (t.includes('TIMESTAMP') || t.includes('DATE')) {
    return 'text-emerald-600'
  }
  if (t.includes('BOOLEAN')) {
    return 'text-purple-500'
  }
  return 'text-muted/50'
}

function shortType(type: string): string {
  return type
    .replace('VARCHAR', 'text')
    .replace('BIGINT', 'int8')
    .replace('INTEGER', 'int4')
    .replace('DOUBLE', 'float8')
    .replace('FLOAT', 'float4')
    .replace('TIMESTAMP', 'time')
    .toLowerCase()
}

export function SqlSchemaBrowser({ tables, onColumnClick }: SqlSchemaBrowserProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tables.map(t => [t.name, true])),
  )

  if (tables.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-rule/40 px-4 py-6 text-center">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted/40">
          Loading schema...
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
      {tables.map(table => {
        const isExpanded = expanded[table.name] ?? true
        return (
          <div
            key={table.name}
            className={cn(
              'flex-shrink-0 rounded-xl border border-rule/60 bg-white/92',
              'shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
              'min-w-[180px] max-w-[260px]',
            )}
          >
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [table.name]: !prev[table.name] }))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-active/40 rounded-t-xl transition-colors"
            >
              <Table2 className="h-3 w-3 text-accent/60 shrink-0" />
              <span className="font-mono text-[11px] font-semibold text-text-primary truncate">
                {table.name}
              </span>
              <span className="ml-auto font-mono text-[9px] tabular-nums text-muted/40">
                {table.rowCount.toLocaleString()}
              </span>
              <motion.div
                animate={{ rotate: isExpanded ? 0 : -90 }}
                transition={SPRING_SNAPPY}
              >
                <ChevronDown className="h-3 w-3 text-muted/40" />
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
                  <div className="border-t border-rule/40 px-1 py-1">
                    {table.columns.map(col => (
                      <button
                        key={col.name}
                        onClick={() => onColumnClick?.(table.name, col.name)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1',
                          'text-left hover:bg-surface-active/50 transition-colors',
                          onColumnClick ? 'cursor-pointer' : 'cursor-default',
                        )}
                        title={`${table.name}.${col.name} (${col.type})`}
                      >
                        <span className="font-mono text-[10px] text-text-primary/80 truncate">
                          {col.name}
                        </span>
                        <span className={cn('font-mono text-[9px] shrink-0', typeColor(col.type))}>
                          {shortType(col.type)}
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
  )
}
