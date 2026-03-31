import { cn } from '../../lib/cn'
import type { StatBlock as StatBlockType } from '../../types/blocks'

interface StatBlockProps {
  block: StatBlockType
}

export function StatBlock({ block }: StatBlockProps) {
  return (
    <div
      className="bg-white border border-rule rounded-xl p-5 topo-bg relative overflow-hidden group geo-accent-bar card-hover"
    >
      {/* Faint coordinate corner — reveals on hover */}
      <span aria-hidden="true" className="coord-label absolute top-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        §
      </span>

      <div className="text-[1.75rem] font-semibold tabular-nums tracking-[-0.02em] text-text-primary leading-none">
        {block.value}
      </div>
      {block.sentiment && <span className="sr-only">({block.sentiment})</span>}
      <div className="text-[0.8125rem] font-medium text-text-primary mt-2.5">
        {block.label}
      </div>
      {block.sublabel && (
        <div className="text-xs text-muted mt-1">
          {block.sublabel}
        </div>
      )}
      {block.delta && (
        <div className={cn(
          'inline-flex items-center gap-1.5 mt-3 text-xs font-medium',
          block.sentiment === 'positive' && 'text-success',
          block.sentiment === 'negative' && 'text-danger',
          (!block.sentiment || block.sentiment === 'neutral') && 'text-muted',
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            block.sentiment === 'positive' && 'bg-success',
            block.sentiment === 'negative' && 'bg-danger',
            (!block.sentiment || block.sentiment === 'neutral') && 'bg-muted',
          )} />
          {block.delta}
        </div>
      )}
    </div>
  )
}
