import { Database, Radar, Workflow } from 'lucide-react'

import { cn } from '../../lib/cn'
import { SQL_EXAMPLES } from './sql-examples'

interface SqlExampleQueriesProps {
  readonly onSelect: (query: string) => void
  readonly disabled?: boolean
  readonly hasExactRun?: boolean
}

const CATEGORY_META = {
  results: {
    label: 'Catalog',
    description: 'Frozen published runs and their final snapshot comparisons.',
    icon: Database,
  },
  traces: {
    label: 'Traces',
    description: 'Slot-level detail, source distance, and exact-run overlays.',
    icon: Radar,
  },
  infrastructure: {
    label: 'Infra',
    description: 'Validator registry, region topology, and latency substrate.',
    icon: Workflow,
  },
} as const

const CATEGORY_ORDER = ['results', 'traces', 'infrastructure'] as const

export function SqlExampleQueries({
  onSelect,
  disabled,
  hasExactRun = false,
}: SqlExampleQueriesProps) {
  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map(category => {
        const meta = CATEGORY_META[category]
        const examples = SQL_EXAMPLES.filter(example => example.category === category)
        if (examples.length === 0) return null
        const Icon = meta.icon

        return (
          <section key={category} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-black/[0.08] bg-black/[0.03] text-accent">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-text-primary/75 uppercase">
                      {meta.label}
                    </div>
                    <p className="text-[11px] leading-5 text-muted/60">
                      {meta.description}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-full border border-black/[0.08] bg-black/[0.03] px-2.5 py-1 font-mono text-[10px] text-muted/50">
                {examples.length} queries
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {examples.map(example => {
                const exactUnavailable = example.requiresExact && !hasExactRun
                const isDisabled = disabled || exactUnavailable
                return (
                  <button
                    key={example.label}
                    onClick={() => onSelect(example.query)}
                    disabled={isDisabled}
                    className={cn(
                      'group rounded-[14px] border border-black/[0.08] bg-white/[0.94] px-4 py-3 text-left',
                      'shadow-[0_2px_10px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)]',
                      'transition-[transform,box-shadow,border-color,background-color] duration-200',
                      'hover:-translate-y-[1px] hover:border-accent/25 hover:bg-accent/[0.03] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(37,99,235,0.08)]',
                      'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.14)]',
                      'active:scale-[0.98]',
                      isDisabled && 'cursor-not-allowed opacity-45 hover:translate-y-0 hover:border-black/[0.08] hover:bg-white/[0.94]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-text-primary">
                          {example.label}
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-muted/60">
                          {example.description}
                        </p>
                      </div>
                      {example.requiresExact && (
                        <span className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]',
                          exactUnavailable
                            ? 'border-black/[0.08] bg-black/[0.03] text-muted/45'
                            : 'border-accent/20 bg-accent/[0.06] text-accent',
                        )}>
                          Exact
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-[10px]">
                      <span className="font-mono text-muted/45">
                        {category}
                      </span>
                      <span className={cn(
                        'font-medium',
                        exactUnavailable ? 'text-danger/70' : 'text-muted/50',
                      )}>
                        {exactUnavailable ? 'Attach an exact run to use this' : 'Load into the editor and run'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
