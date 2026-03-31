import type { SourceBlock as SourceBlockType } from '../../types/blocks'

interface SourceBlockProps {
  block: SourceBlockType
}

export function SourceBlock({ block }: SourceBlockProps) {
  if (block.refs.length === 0) return null

  return (
    <div className="rounded-xl border border-rule bg-white px-4 py-3">
      <span className="mb-2 block text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
        Sources
      </span>
      <div className="divide-y divide-rule">
        {block.refs.map((ref, i) => {
          const isExternal = Boolean(ref.url)

          return isExternal ? (
            <a
              key={i}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline justify-between gap-2 py-2 text-13 text-accent hover:text-accent/80 transition-colors"
            >
              <span>
                {ref.label}
                {ref.section && (
                  <span className="text-muted ml-1">· {ref.section}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-text-faint">→</span>
            </a>
          ) : (
            <div key={i} className="flex items-baseline gap-2 py-2 text-13 text-muted">
              <span>
                {ref.label}
                {ref.section && (
                  <span className="text-text-faint ml-1">· {ref.section}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
