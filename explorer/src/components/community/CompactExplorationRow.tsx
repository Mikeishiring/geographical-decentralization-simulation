import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Link2, MessageSquare } from 'lucide-react'
import type { Exploration } from '../../lib/api'
import { MOCK_NOTE_EXTRAS } from '../../data/mock-community-notes'
import { VoteControls } from './VoteControls'
import { ReplyThread } from './ReplyThread'
import { cn } from '../../lib/cn'
import { SPRING_CRISP, SPRING_ACCORDION } from '../../lib/theme'
import { cardTitle, cardSummary, cardTimestamp, replyCount, formatTimeAgo } from '../../lib/community-helpers'

export function CompactExplorationRow({
  exploration,
  isExpanded,
  onToggleExpand,
  onVote,
  onOpenQuery,
  onOpenSimulation,
  onShare,
  shareCopied,
  isDeepLinked,
}: {
  readonly exploration: Exploration
  readonly isExpanded: boolean
  readonly onToggleExpand: () => void
  readonly onVote?: (delta: 1 | -1) => void
  readonly onOpenQuery?: (query: string) => void
  readonly onOpenSimulation?: () => void
  readonly onShare?: (explorationId: string) => void
  readonly shareCopied?: boolean
  readonly isDeepLinked?: boolean
}) {
  const timeAgo = formatTimeAgo(cardTimestamp(exploration))
  const allTags = [...exploration.paradigmTags, ...exploration.experimentTags]
  const replies = replyCount(exploration)
  const realReplies = exploration.replies ?? []
  const mockReplies = MOCK_NOTE_EXTRAS[exploration.id]?.replies ?? []

  return (
    <motion.div
      id={`community-note-${exploration.id}`}
      layout
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: SPRING_CRISP },
      }}
      className={cn(
        'transition-colors',
        isDeepLinked && 'bg-accent/3',
      )}
    >
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-active/50"
        aria-expanded={isExpanded}
      >
        {/* Vote count */}
        <span className={cn(
          'w-8 shrink-0 text-center text-xs font-semibold tabular-nums',
          exploration.votes > 0 ? 'text-accent' : exploration.votes < 0 ? 'text-danger' : 'text-muted',
        )}>
          {exploration.votes}
        </span>

        {/* Surface dot */}
        <span className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          exploration.surface === 'simulation' ? 'bg-accent-warm' : 'bg-accent',
        )} />

        {/* Title */}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary" title={cardTitle(exploration)}>
          {cardTitle(exploration)}
        </span>

        {/* Tags (first 2 only in compact) */}
        <span className="hidden items-center gap-1 sm:flex">
          {allTags.slice(0, 2).map(tag => (
            <span key={tag} className="lab-chip !py-0 !text-2xs">
              <span className={cn(
                'h-1 w-1 rounded-full',
                tag === 'External' && 'bg-accent',
                tag === 'Local' && 'bg-accent-warm',
                tag.startsWith('SE') && 'bg-success',
              )} />
              {tag}
            </span>
          ))}
        </span>

        {/* Reply count */}
        {replies > 0 && (
          <span className="flex items-center gap-0.5 text-2xs text-muted tabular-nums">
            <MessageSquare className="h-2.5 w-2.5" />
            {replies}
          </span>
        )}

        {/* Author */}
        {exploration.publication.author && (
          <span className="hidden max-w-[80px] truncate text-2xs text-text-faint sm:block" title={exploration.publication.author}>
            {exploration.publication.author}
          </span>
        )}

        {/* Timestamp */}
        <span className="shrink-0 text-2xs text-text-faint tabular-nums">{timeAgo}</span>

        <ChevronDown className={cn(
          'h-3 w-3 shrink-0 text-muted transition-transform',
          isExpanded && 'rotate-180',
        )} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: SPRING_ACCORDION,
              opacity: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-rule px-3 py-3 space-y-3">
              {/* Takeaway */}
              <p className="text-xs text-muted leading-relaxed">{cardSummary(exploration)}</p>

              {/* Anchored excerpt */}
              {exploration.anchor?.excerpt && (
                <div className="rounded-md border-l-2 border-l-accent/40 bg-canvas px-3 py-1.5">
                  <p className="text-2xs italic text-muted line-clamp-2">
                    &ldquo;{exploration.anchor.excerpt}&rdquo;
                  </p>
                </div>
              )}

              {/* Vote + actions row */}
              <div className="flex items-center gap-3">
                {onVote && <VoteControls votes={exploration.votes} onVote={onVote} />}

                <div className="flex flex-wrap gap-1.5">
                  {exploration.surface === 'reading' && onOpenQuery && (
                    <button
                      onClick={() => onOpenQuery(exploration.query)}
                      className="rounded-md border border-rule bg-white px-2 py-1 text-2xs text-text-primary transition-colors hover:border-border-hover"
                    >
                      Explore with AI
                    </button>
                  )}
                  {exploration.surface === 'simulation' && onOpenSimulation && (
                    <button
                      onClick={onOpenSimulation}
                      className="rounded-md border border-rule bg-white px-2 py-1 text-2xs text-text-primary transition-colors hover:border-border-hover"
                    >
                      Open Simulation
                    </button>
                  )}
                  {onShare && (
                    <button
                      onClick={() => void onShare(exploration.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-rule bg-white px-2 py-1 text-2xs text-text-primary transition-colors hover:border-border-hover"
                    >
                      <Link2 className="h-2.5 w-2.5" />
                      {shareCopied ? 'Copied' : 'Share'}
                    </button>
                  )}
                </div>
              </div>

              <ReplyThread
                explorationId={exploration.id}
                realReplies={realReplies}
                mockReplies={mockReplies}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
