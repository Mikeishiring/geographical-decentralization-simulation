import { cn } from '../../lib/cn'
import { SQL_EXAMPLES } from './sql-examples'

interface SqlExampleQueriesProps {
  readonly onSelect: (query: string) => void
  readonly disabled?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  validators: 'Validators',
  latency: 'Latency',
  advanced: 'Advanced',
}

const CATEGORY_ORDER = ['validators', 'latency', 'advanced'] as const

export function SqlExampleQueries({ onSelect, disabled }: SqlExampleQueriesProps) {
  return (
    <div className="space-y-2">
      {CATEGORY_ORDER.map(category => {
        const examples = SQL_EXAMPLES.filter(e => e.category === category)
        if (examples.length === 0) return null
        return (
          <div key={category} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[9px] font-semibold uppercase tracking-widest text-muted/30 w-[60px] shrink-0">
              {CATEGORY_LABELS[category]}
            </span>
            {examples.map(example => (
              <button
                key={example.label}
                onClick={() => onSelect(example.query)}
                disabled={disabled}
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5',
                  'text-[10px] font-medium text-muted/60',
                  'border border-rule/50 bg-white/80',
                  'hover:border-accent/30 hover:text-accent hover:bg-accent/[0.04]',
                  'active:scale-[0.95] transition-all',
                  'disabled:opacity-40 disabled:pointer-events-none',
                )}
              >
                {example.label}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
