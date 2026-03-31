import type { Cite } from '../../types/blocks'

interface CiteBadgeProps {
  readonly cite: Cite
}

export function CiteBadge({ cite }: CiteBadgeProps) {
  if (!cite) return null

  const parts: string[] = []
  if (cite.paperSection) parts.push(cite.paperSection)
  if (cite.figure) parts.push(cite.figure)
  if (cite.experiment) parts.push(cite.experiment)
  if (cite.table) parts.push(cite.table)

  if (parts.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1 text-2xs font-medium text-text-faint">
      <span className="opacity-60">📎</span>
      {parts.join(' · ')}
    </span>
  )
}
