import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Quote, ThumbsUp, MessageSquare, Users } from 'lucide-react'
import { listExplorations, type Exploration } from '../../lib/api'
import { MOCK_COMMUNITY_NOTES, MOCK_NOTE_EXTRAS } from '../../data/mock-community-notes'
import { SPRING_CRISP, SPRING_POPUP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
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

  const notes = useMemo(() => {
    const real = (communityPreviewQuery.data ?? [])
      .filter(exploration => exploration.publication.published && exploration.anchor?.sectionId)
    // Merge real notes with mock data, dedupe by ID, take top 3 by votes
    const mockIds = new Set(MOCK_COMMUNITY_NOTES.map(n => n.id))
    const merged = [
      ...real.filter(n => !mockIds.has(n.id)),
      ...MOCK_COMMUNITY_NOTES,
    ].sort((a, b) => b.votes - a.votes)
    return merged.slice(0, 3)
  }, [communityPreviewQuery.data])

  if (communityPreviewQuery.isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar">
        <div className="lab-section-title">Public responses</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[140px] animate-pulse rounded-xl bg-surface-active" />
          ))}
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
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-accent" />
            <span className="lab-section-title">Public responses</span>
          </div>
          <div className="mt-1.5 text-13 font-medium text-text-primary">How other readers annotated the evidence</div>
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
        animate="visible"
      >
        {notes.map(exploration => {
          const extras = MOCK_NOTE_EXTRAS[exploration.id]
          const replyCount = extras?.replies?.length ?? 0
          const excerpt = exploration.anchor?.excerpt

          return (
            <motion.button
              key={exploration.id}
              variants={STAGGER_ITEM}
              whileTap={{ scale: 0.98 }}
              transition={SPRING_POPUP}
              onClick={() => onOpenNote(exploration.id)}
              className="group/card rounded-xl border border-black/[0.06] bg-white px-4 py-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-shadow focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
            >
              {/* Label */}
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-black/40">
                {communityPreviewLabel(exploration)}
              </div>

              {/* Quoted excerpt */}
              {excerpt && (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-accent/10 bg-white/60 px-2 py-1.5">
                  <Quote className="mt-0.5 h-2.5 w-2.5 shrink-0 text-accent/40" />
                  <span className="text-[11px] font-serif italic text-black/45 line-clamp-2">
                    {excerpt}
                  </span>
                </div>
              )}

              {/* Title */}
              <div className="mt-2 text-13 font-medium leading-snug text-[#111] group-hover/card:text-accent transition-colors">
                {exploration.publication.title}
              </div>

              {/* Takeaway */}
              <div className="mt-1 text-xs leading-5 text-black/50 line-clamp-3">
                {exploration.publication.takeaway}
              </div>

              {/* Footer */}
              <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-medium text-black/35">
                <span>{exploration.publication.author || 'Anonymous'}</span>
                <div className="flex items-center gap-2">
                  {exploration.votes > 0 && (
                    <span className="flex items-center gap-0.5 tabular-nums">
                      <ThumbsUp className="h-2.5 w-2.5" />
                      {exploration.votes}
                    </span>
                  )}
                  {replyCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-2.5 w-2.5" />
                      {replyCount}
                    </span>
                  )}
                  <span className="transition-all group-hover/card:text-accent group-hover/card:translate-x-0.5">&rarr;</span>
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>
    </motion.div>
  )
}
