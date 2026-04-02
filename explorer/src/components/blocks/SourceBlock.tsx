import { ExternalLink, FileText } from 'lucide-react'
import type { SourceBlock as SourceBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'

interface SourceBlockProps {
  block: SourceBlockType
}

export function SourceBlock({ block }: SourceBlockProps) {
  if (block.refs.length === 0) {
    return <BlockEmptyState title="Sources" message="No source entries were attached to this section." />
  }

  const externalRefs = block.refs.filter((ref) => Boolean(ref.url)).length

  return (
    <div className="rounded-xl border border-rule bg-white px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="block text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
          Sources
        </span>
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-text-faint">
          <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
            {block.refs.length} refs
          </span>
          {externalRefs > 0 && (
            <span className="rounded-full border border-accent/10 bg-accent/5 px-2 py-0.5 text-accent/80">
              {externalRefs} links
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-rule">
        {block.refs.map((ref, i) => {
          const isExternal = Boolean(ref.url)
          const Icon = isExternal ? ExternalLink : FileText

          return isExternal ? (
            <a
              key={i}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group -mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 text-13 text-accent transition-colors hover:bg-surface-active/70 hover:text-accent/85"
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/70 transition-transform group-hover:-translate-y-[1px]" />
                <span className="min-w-0">
                  <span className="block text-text-primary">{ref.label}</span>
                  {ref.section && (
                    <span className="mt-0.5 block text-2xs text-muted">Paper ref: {ref.section}</span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-xs text-text-faint transition-colors group-hover:text-accent">↗</span>
            </a>
          ) : (
            <div key={i} className="flex items-start gap-2.5 py-2.5 text-13 text-muted">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-faint" />
              <span className="min-w-0">
                <span className="block text-text-body">{ref.label}</span>
                {ref.section && (
                  <span className="mt-0.5 block text-2xs text-text-faint">Paper ref: {ref.section}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
