import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, Link2, MessageSquare, Sparkles, Play } from 'lucide-react'
import type { Exploration } from '../../lib/api'
import { MOCK_NOTE_EXTRAS } from '../../data/mock-community-notes'
import { BlockCanvas } from '../explore/BlockCanvas'
import { VoteControls, FollowUpList } from './VoteControls'
import { ReplyThread } from './ReplyThread'
import { cn } from '../../lib/cn'
import { SPRING_CRISP, SPRING_ACCORDION } from '../../lib/theme'
import { surfaceLabel, cardTitle, cardSummary, cardTimestamp, formatTimeAgo } from '../../lib/community-helpers'

export function ExplorationCard({
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
  const mockReplies = MOCK_NOTE_EXTRAS[exploration.id]?.replies ?? []
  const realReplies = exploration.replies ?? []
  const realReplyIds = new Set(realReplies.map(r => r.id))
  const replyCount = realReplies.length + mockReplies.filter(m => !realReplyIds.has(m.id)).length

  return (
    <motion.div
      id={`community-note-${exploration.id}`}
      layout
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: SPRING_CRISP },
      }}
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-shadow duration-150',
        isDeepLinked
          ? 'border-accent/20 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_6%,transparent)]'
          : 'border-rule shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
      )}
    >
      {/* ── Card header — clickable, no left gutter ──────────── */}
      <button onClick={onToggleExpand} className="flex w-full gap-3 p-4 text-left" aria-expanded={isExpanded}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {cardTitle(exploration)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
            {cardSummary(exploration)}
          </p>

          {/* Metadata row — votes live here now, inline with other metadata */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs">
            {/* Inline vote count (no up/down arrows in collapsed state) */}
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              exploration.votes > 0 && 'text-accent',
              exploration.votes < 0 && 'text-danger',
              exploration.votes === 0 && 'text-text-faint',
            )}>
              {exploration.votes > 0 ? `+${exploration.votes}` : exploration.votes}
            </span>

            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                exploration.surface === 'simulation' ? 'bg-accent-warm' : 'bg-accent',
              )} />
              {surfaceLabel(exploration)}
            </span>

            {replyCount > 0 && (
              <span className="inline-flex items-center gap-1 text-muted">
                <MessageSquare className="h-3 w-3" />
                {replyCount}
              </span>
            )}

            {exploration.publication.author && (
              <span className="text-text-faint">
                by {exploration.publication.author}
              </span>
            )}

            {isDeepLinked && (
              <span className="inline-flex items-center gap-1.5 text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Direct link
              </span>
            )}

            <span className="ml-auto text-text-faint tabular-nums">
              {timeAgo}
            </span>
          </div>

          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allTags.map(tag => (
                <span key={tag} className="lab-chip">
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    tag === 'External' && 'bg-accent',
                    tag === 'Local' && 'bg-accent-warm',
                    tag.startsWith('SE') && 'bg-success',
                  )} />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Anchored text excerpt — subtle indent instead of colored border */}
          {exploration.anchor?.excerpt && (
            <div className="mt-2 rounded-md bg-canvas px-3 py-2">
              <p className="text-xs italic text-muted line-clamp-2">
                &ldquo;{exploration.anchor.excerpt}&rdquo;
              </p>
              {exploration.anchor.sectionId && (
                <span className="mt-1 block text-2xs text-text-faint">
                  from {exploration.anchor.sectionId.replace(/-/g, ' ')}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="self-start p-1 text-muted transition-colors hover:text-text-primary">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* ── Expanded content ──────────────────────────────────── */}
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
            <div className="border-t border-rule px-4 pb-4 pt-3">
              {/* Truth boundary — lightweight inline label, not a banner */}
              <p className="mb-3 text-2xs text-text-faint">
                <span className="font-medium text-muted">Truth boundary</span>
                {' — '}
                {exploration.publication.published
                  ? 'Human-authored community note on top of the paper or an exact-run artifact.'
                  : 'Saved secondary context — not a canonical paper or published-results artifact.'}
              </p>

              {exploration.publication.editorNote && (
                <p className="mb-3 text-xs text-muted">
                  <span className="font-medium text-text-primary">Context:</span>{' '}
                  {exploration.publication.editorNote}
                </p>
              )}

              <BlockCanvas blocks={exploration.blocks} />

              {/* ── Unified action footer bar ─────────────────── */}
              <div className="mt-4 flex items-center gap-2 border-t border-rule pt-3">
                {onVote && (
                  <VoteControls votes={exploration.votes} onVote={onVote} layout="horizontal" />
                )}

                <div className="h-4 w-px bg-rule" />

                {exploration.surface === 'reading' && onOpenQuery && (
                  <button
                    onClick={() => onOpenQuery(exploration.query)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
                    title="Ask the AI copilot about this topic"
                  >
                    <Sparkles className="h-3 w-3" />
                    Explore with AI
                  </button>
                )}

                {exploration.surface === 'simulation' && onOpenSimulation && (
                  <button
                    onClick={onOpenSimulation}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
                  >
                    <Play className="h-3 w-3" />
                    Open Simulation
                  </button>
                )}

                {exploration.publication.published && onShare && (
                  <button
                    onClick={() => void onShare(exploration.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
                  >
                    <Link2 className="h-3 w-3" />
                    {shareCopied ? 'Link copied' : 'Copy link'}
                  </button>
                )}
              </div>

              {/* Reply thread now inside the unified footer area */}
              <ReplyThread
                explorationId={exploration.id}
                realReplies={realReplies}
                mockReplies={mockReplies}
              />

              {exploration.followUps.length > 0 && (
                <FollowUpList followUps={exploration.followUps} onSelect={exploration.surface === 'reading' ? onOpenQuery : undefined} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
