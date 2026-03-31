import { FileText, FlaskConical } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ARXIV_PDF_URL, sectionToPage } from '../paper/paper-helpers'
import type { Cite } from '../../types/blocks'

interface CiteBadgeProps {
  readonly cite: Cite
  /** When true, pills start visible instead of requiring group-hover */
  readonly alwaysVisible?: boolean
}

export function CiteBadge({ cite, alwaysVisible = false }: CiteBadgeProps) {
  if (!cite) return null

  const page = sectionToPage(cite.paperSection)

  // Build the section+figure+table label for the primary pill
  const primaryParts: string[] = []
  if (cite.paperSection) primaryParts.push(cite.paperSection)
  if (cite.figure) primaryParts.push(cite.figure)
  if (cite.table) primaryParts.push(cite.table)

  const hasPrimary = primaryParts.length > 0
  const hasExperiment = !!cite.experiment

  if (!hasPrimary && !hasExperiment) return null

  const visibilityClass = alwaysVisible
    ? 'opacity-100'
    : 'opacity-40 group-hover:opacity-100'

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {hasPrimary && (
        page != null ? (
          <a
            href={`${ARXIV_PDF_URL}#page=${page}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/5 px-2 py-0.5 text-2xs text-accent/60',
              'transition-all duration-200 hover:bg-accent/12 hover:text-accent hover:border-accent/30 select-none',
              visibilityClass,
            )}
            title={`${primaryParts.join(' · ')} — opens PDF page ${page}`}
          >
            <FileText className="h-2.5 w-2.5" />
            {primaryParts.join(' · ')}
            <span className="text-accent/40">p.{page}</span>
          </a>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/5 px-2 py-0.5 text-2xs text-accent/60 select-none',
              'transition-opacity duration-200',
              visibilityClass,
            )}
          >
            <FileText className="h-2.5 w-2.5" />
            {primaryParts.join(' · ')}
          </span>
        )
      )}

      {hasExperiment && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50/80 px-2 py-0.5 text-2xs text-amber-600/70 select-none',
            'transition-opacity duration-200',
            visibilityClass,
          )}
          title={`Experiment: ${cite.experiment}`}
        >
          <FlaskConical className="h-2.5 w-2.5" />
          {cite.experiment}
        </span>
      )}
    </span>
  )
}
