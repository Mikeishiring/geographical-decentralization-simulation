import { cn } from '../../lib/cn'
import type { InsightBlock as InsightBlockType } from '../../types/blocks'

interface InsightBlockProps {
  block: InsightBlockType
}

const emphasisStyles = {
  normal: 'border-l-accent',
  'key-finding': 'border-l-accent-warm',
  surprising: 'border-l-danger',
} as const

const dotColors = {
  normal: 'bg-accent',
  'key-finding': 'bg-accent-warm',
  surprising: 'bg-danger',
} as const

export function InsightBlock({ block }: InsightBlockProps) {
  const emphasis = block.emphasis ?? 'normal'

  return (
    <div
      className={cn(
        'bg-white border border-rule rounded-xl p-5 border-l-2 topo-bg card-hover',
        emphasisStyles[emphasis],
      )}
    >
      {block.title && (
        <h3 className="flex items-center gap-2 text-[0.9375rem] font-medium text-text-primary mb-2.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[emphasis])} />
          {block.title}
        </h3>
      )}
      <p className="text-sm leading-[1.65] text-text-body font-serif">
        <InlineMarkdown text={block.text} />
      </p>
    </div>
  )
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-text-primary font-semibold">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i} className="text-text-primary">{part.slice(1, -1)}</em>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
