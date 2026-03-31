import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { listExplorations, type Exploration } from '../../lib/api'
import { SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
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

  if (communityPreviewQuery.isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar">
        <div className="lab-section-title">Public responses</div>
        <div className="mt-4 space-y-3">
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface-active" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-active" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-active" />
        </div>
      </div>
    )
  }

  if (notes.length === 0) return null

  return (
    <motion.div
      className="mb-6 rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="lab-section-title">Public responses</div>
          <div className="mt-1.5 text-13 font-medium text-text-primary">How other readers turned evidence into public notes</div>
        </div>
        {onTabChange && (
          <button
            onClick={() => onTabChange('community')}
            className="arrow-link shrink-0"
          >
            Open Community
          </button>
        )}
      </div>

      <motion.div
        className="grid gap-3 md:grid-cols-3"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="show"
      >
        {notes.map(exploration => (
          <motion.button
            key={exploration.id}
            variants={STAGGER_ITEM}
            onClick={() => onOpenNote(exploration.id)}
            className="rounded-lg border border-rule bg-surface-active px-4 py-4 text-left card-hover"
          >
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
              {communityPreviewLabel(exploration)}
            </div>
            <div className="mt-2 text-13 font-medium text-text-primary">
              {exploration.publication.title}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted line-clamp-4">
              {exploration.publication.takeaway}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-11 text-text-faint">
              <span>{exploration.surface === 'simulation' ? 'Exact-run backed' : 'Paper-reading backed'}</span>
              <span>{exploration.publication.author || 'Anonymous'}</span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  )
}
