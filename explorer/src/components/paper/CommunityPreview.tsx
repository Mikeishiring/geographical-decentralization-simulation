import { useQuery } from '@tanstack/react-query'
import { listExplorations, type Exploration } from '../../lib/api'
import type { TabId } from '../layout/TabNav'

interface CommunityPreviewProps {
  readonly isActive: boolean
  readonly onOpenNote: (explorationId: string) => void
  readonly onTabChange?: (tab: TabId) => void
}

function communityPreviewLabel(exploration: Exploration): string {
  if (exploration.publication.featured) return 'Editor featured'
  if (exploration.verified) return 'Researcher verified'
  return exploration.surface === 'simulation' ? 'Exact-run note' : 'Paper reading'
}

export function CommunityPreview({
  isActive,
  onOpenNote,
  onTabChange,
}: CommunityPreviewProps) {
  const communityPreviewQuery = useQuery({
    queryKey: ['explorations', 'community-preview'],
    queryFn: () => listExplorations({
      sort: 'top',
      limit: 4,
      publishedOnly: true,
    }),
    enabled: isActive,
    staleTime: 60_000,
    refetchInterval: isActive ? 60_000 : false,
  })

  const notes = (communityPreviewQuery.data ?? [])
    .filter(exploration => exploration.publication.published)
    .slice(0, 3)

  if (notes.length === 0) return null

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-text-primary">Community notes</div>
        {onTabChange && (
          <button
            onClick={() => onTabChange('community')}
            className="text-xs text-accent transition-colors hover:text-accent/80"
          >
            Open Community
          </button>
        )}
      </div>

      <div className="stagger-reveal grid gap-3 md:grid-cols-3">
        {notes.map(exploration => (
          <button
            key={exploration.id}
            onClick={() => onOpenNote(exploration.id)}
            className="rounded-xl border border-rule bg-white px-4 py-4 text-left transition-colors hover:border-border-hover"
          >
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              {communityPreviewLabel(exploration)}
            </div>
            <div className="mt-2 text-[0.8125rem] font-medium text-text-primary">
              {exploration.publication.title}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted line-clamp-4">
              {exploration.publication.takeaway}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[0.6875rem] text-text-faint">
              <span>{exploration.surface === 'simulation' ? 'Exact-run backed' : 'Paper-reading backed'}</span>
              <span>{exploration.publication.author || 'Anonymous'}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
