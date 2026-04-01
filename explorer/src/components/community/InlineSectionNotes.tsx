import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Users,
  ExternalLink,
  MousePointerClick,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_SNAPPY, SPRING_POPUP } from '../../lib/theme'
import { MOCK_NOTE_EXTRAS } from '../../data/mock-community-notes'
import type { Exploration } from '../../lib/api'
import { ReplyThread } from './ReplyThread'

interface InlineSectionNotesProps {
  readonly notes: readonly Exploration[]
  readonly onOpenNote?: (explorationId: string) => void
  /** Show "Select text to annotate" hint inside the card */
  readonly showAnnotationHint?: boolean
}

export function InlineSectionNotes({ notes, onOpenNote, showAnnotationHint = false }: InlineSectionNotesProps) {
  const [expanded, setExpanded] = useState(false)
  const published = notes.filter(n => n.publication.published)

  if (published.length === 0) return null

  const hasMore = published.length > 2
  const remaining = published.length - 2

  return (
    <div className="rounded-2xl border border-rule/70 bg-gradient-to-b from-surface-active/30 to-surface-active/50 px-4 py-3.5">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center gap-2.5 text-left group/notes-toggle"
        aria-expanded={expanded}
        aria-label={`${published.length} community notes`}
        data-notes-toggle
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/[0.08]">
          <Users className="h-2.5 w-2.5 text-accent" />
        </span>
        <span className="text-11 font-semibold tracking-wide uppercase text-muted">
          {published.length} note{published.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-text-faint transition-colors group-hover/notes-toggle:text-accent">
          <span className="text-[10px]">{expanded ? 'Collapse' : 'Expand'}</span>
          {expanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </span>
      </button>

      {/* Preview row when collapsed — show first 2 note titles */}
      {!expanded && published.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {published.slice(0, 2).map(note => (
            <button
              key={note.id}
              type="button"
              onClick={() => setExpanded(true)}
              className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/60"
            >
              {note.anchor?.excerpt && (
                <span className="shrink-0 w-1 h-4 rounded-full bg-accent/20" />
              )}
              <span className="text-xs font-medium text-text-primary truncate">
                {note.publication.title}
              </span>
              <span className="ml-auto shrink-0 text-2xs text-text-faint">
                {note.publication.author || 'Anon'}
              </span>
            </button>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ml-2 mt-0.5 text-[11px] font-medium text-accent/70 transition-colors hover:text-accent"
            >
              +{remaining} more
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {published.map((note, i) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onOpen={onOpenNote}
                  delay={i * 0.04}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAnnotationHint && (
        <div className={cn(
          'flex items-center gap-1.5 text-2xs text-text-faint',
          expanded ? 'mt-3 pt-3 border-t border-rule/40' : 'mt-2.5 pt-2.5 border-t border-rule/30',
        )}>
          <MousePointerClick className="h-2.5 w-2.5 shrink-0" />
          <span>Select text to add your annotation</span>
        </div>
      )}
    </div>
  )
}

function NoteCard({
  note,
  onOpen,
  delay = 0,
}: {
  readonly note: Exploration
  readonly onOpen?: (id: string) => void
  readonly delay?: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const extras = MOCK_NOTE_EXTRAS[note.id]
  const mockReplies = extras?.replies ?? []
  const quotedPassage = extras?.quotedPassage
  const sectionTitle = extras?.sectionTitle
  const sectionNumber = extras?.sectionNumber

  const realReplies = note.replies ?? []
  const realReplyIds = new Set(realReplies.map(r => r.id))
  const replyCount = realReplies.length + mockReplies.filter(m => !realReplyIds.has(m.id)).length

  const handleClick = useCallback(() => {
    onOpen?.(note.id)
  }, [note.id, onOpen])

  const excerpt = note.anchor?.excerpt
  const hasExcerpt = excerpt && excerpt.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_POPUP, delay }}
      className={cn(
        'group/card rounded-xl border bg-white transition-all duration-200',
        isExpanded
          ? 'border-accent/15 shadow-[0_4px_24px_rgba(59,130,246,0.07)]'
          : 'border-rule/70 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.06)] hover:border-rule',
      )}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full px-3.5 py-3 text-left"
        aria-expanded={isExpanded}
        aria-label={`Note: ${note.publication.title}`}
      >
        {hasExcerpt && (
          <div className="mb-2 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 w-0.5 h-3.5 rounded-full bg-accent/25" />
            <span className="line-clamp-1 font-serif text-[11px] italic text-muted/70">
              &ldquo;{excerpt.length > 70 ? `${excerpt.slice(0, 70)}\u2026` : excerpt}&rdquo;
            </span>
          </div>
        )}

        <div className="text-[13px] font-medium leading-snug text-text-primary">
          {note.publication.title}
        </div>
        <div className={cn(
          'mt-1 text-xs leading-relaxed text-muted',
          isExpanded ? '' : 'line-clamp-2',
        )}>
          {note.publication.takeaway}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          {/* Author + badges */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-active text-[9px] font-semibold text-muted shrink-0">
              {(note.publication.author || 'A').charAt(0).toUpperCase()}
            </span>
            <span className="text-2xs font-medium text-text-faint truncate">
              {note.publication.author || 'Anonymous'}
            </span>
          </div>
          {note.publication.featured && (
            <span className="shrink-0 rounded-full border border-amber-200/60 bg-amber-50/80 px-1.5 py-px text-[9px] font-medium text-amber-600/70">
              Featured
            </span>
          )}
          {note.verified && (
            <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-50/60 px-1.5 py-px text-[9px] font-medium text-emerald-600">
              Verified
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {note.votes !== 0 && (
              <span className="flex items-center gap-0.5 text-2xs tabular-nums text-text-faint">
                {note.votes > 0
                  ? <ThumbsUp className="h-2.5 w-2.5" />
                  : <ThumbsDown className="h-2.5 w-2.5" />
                }
                {Math.abs(note.votes)}
              </span>
            )}
            {replyCount > 0 && (
              <span className="flex items-center gap-0.5 text-2xs text-text-faint">
                <MessageSquare className="h-2.5 w-2.5" />
                {replyCount}
              </span>
            )}
            <span className="text-text-faint transition-transform duration-150">
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="overflow-hidden"
          >
            <div className="border-t border-rule/60 px-3.5 pb-3.5">
              {quotedPassage && (
                <div className="mt-3 rounded-lg border border-accent/[0.06] bg-accent/[0.015] px-3.5 py-3">
                  {sectionTitle && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-mono text-2xs font-medium text-accent">{sectionNumber}</span>
                      <span className="text-2xs font-medium text-text-primary">{sectionTitle}</span>
                      <span className="text-2xs text-text-faint">&mdash; Original passage</span>
                    </div>
                  )}
                  <div className="border-l-2 border-accent/20 pl-3">
                    <p className="font-serif text-xs leading-[1.7] text-muted">
                      {quotedPassage}
                    </p>
                  </div>
                </div>
              )}

              {!quotedPassage && note.publication.takeaway.length > 120 && (
                <div className="mt-3 text-xs leading-[1.7] text-muted">
                  {note.publication.takeaway}
                </div>
              )}

              <ReplyThread
                explorationId={note.id}
                realReplies={realReplies}
                mockReplies={mockReplies}
              />

              <div className="mt-3 flex items-center gap-2 border-t border-rule/50 pt-3">
                <motion.button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleClick() }}
                  whileTap={{ scale: 0.92 }}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium text-text-faint transition-colors hover:text-accent hover:bg-accent/[0.04]"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  Open in Community
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
