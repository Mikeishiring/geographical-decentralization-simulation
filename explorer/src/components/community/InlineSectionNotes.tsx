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
    <div className="mt-4 rounded-xl border border-rule bg-surface-active/40 px-3.5 py-3">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={expanded}
        aria-label={`${published.length} community notes`}
        data-notes-toggle
      >
        <Users className="h-3 w-3 text-accent" />
        <span className="text-11 font-semibold tracking-wide uppercase text-muted">
          {published.length} note{published.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-text-faint">
          {expanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="overflow-hidden"
          >
            <div className="mt-2.5 space-y-1.5">
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

      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-11 font-medium text-text-faint transition-colors hover:text-accent"
        >
          Show {remaining} more &darr;
        </button>
      )}

      {showAnnotationHint && (
        <div className="mt-2 flex items-center gap-1.5 pt-2 border-t border-rule/50 text-2xs text-text-faint">
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
      className={`group/card rounded-[10px] border bg-white transition-shadow duration-150 ${
        isExpanded
          ? 'border-accent/15 shadow-[0_4px_20px_rgba(59,130,246,0.06)]'
          : 'border-rule shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full p-2.5 text-left"
        aria-expanded={isExpanded}
        aria-label={`Note: ${note.publication.title}`}
      >
        {hasExcerpt && (
          <div className="mb-1.5 line-clamp-1 border-l-2 border-accent/25 pl-2 font-serif text-11 italic text-muted">
            &ldquo;{excerpt.length > 60 ? `${excerpt.slice(0, 60)}\u2026` : excerpt}&rdquo;
          </div>
        )}

        <div className="text-13 font-medium leading-snug text-text-primary">
          {note.publication.title}
        </div>
        <div className={`mt-0.5 text-xs leading-relaxed text-muted ${isExpanded ? '' : 'line-clamp-2'}`}>
          {note.publication.takeaway}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <span className="text-2xs font-medium text-text-faint">
            {note.publication.author || 'Anonymous'}
          </span>
          {note.publication.featured && (
            <span className="rounded-full border border-amber-200/60 bg-amber-50/80 px-1.5 py-0.5 text-2xs text-amber-600/70">
              Featured
            </span>
          )}
          {note.verified && (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-50/60 px-1.5 py-0.5 text-2xs text-emerald-600">
              Verified
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
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
            <span className="text-text-faint">
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
            <div className="border-t border-rule px-3 pb-3">
              {quotedPassage && (
                <div className="mt-3 rounded-lg border border-accent/[0.08] bg-accent/[0.02] px-3 py-2.5">
                  {sectionTitle && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-mono text-2xs font-medium text-accent">{sectionNumber}</span>
                      <span className="text-2xs font-medium text-text-primary">{sectionTitle}</span>
                      <span className="text-2xs text-text-faint">&mdash; Original passage</span>
                    </div>
                  )}
                  <div className="border-l-2 border-accent/25 pl-2.5">
                    <p className="font-serif text-xs leading-relaxed text-muted">
                      {quotedPassage}
                    </p>
                  </div>
                </div>
              )}

              {!quotedPassage && note.publication.takeaway.length > 120 && (
                <div className="mt-3 text-xs leading-relaxed text-muted">
                  {note.publication.takeaway}
                </div>
              )}

              <ReplyThread
                explorationId={note.id}
                realReplies={realReplies}
                mockReplies={mockReplies}
              />

              <div className="mt-3 flex items-center gap-2 border-t border-rule pt-2.5">
                <motion.button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleClick() }}
                  whileTap={{ scale: 0.92 }}
                  className="flex items-center gap-1 text-2xs font-medium text-text-faint transition-colors hover:text-accent"
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
