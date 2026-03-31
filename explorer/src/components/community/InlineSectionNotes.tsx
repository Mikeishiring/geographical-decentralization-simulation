import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { SPRING_SNAPPY, SPRING_CRISP } from '../../lib/theme'
import type { Exploration } from '../../lib/api'

interface InlineSectionNotesProps {
  readonly notes: readonly Exploration[]
  readonly onOpenNote?: (explorationId: string) => void
}

export function InlineSectionNotes({ notes, onOpenNote }: InlineSectionNotesProps) {
  const [expanded, setExpanded] = useState(false)
  const published = notes.filter(n => n.publication.published)

  if (published.length === 0) return null

  const preview = published.slice(0, 2)
  const hasMore = published.length > 2
  const remaining = published.length - 2

  return (
    <div className="mt-4 lab-panel px-4 py-3">
      {/* Thread header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="lab-section-title">
          {published.length} community note{published.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-text-faint">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />
          }
        </span>
      </button>

      {/* Preview cards */}
      <div className="mt-3 space-y-2 stagger-reveal">
        {preview.map(note => (
          <NoteCard key={note.id} note={note} onOpen={onOpenNote} />
        ))}
      </div>

      {/* Expanded: remaining notes */}
      <AnimatePresence>
        {expanded && hasMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_CRISP}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {published.slice(2).map(note => (
                <NoteCard key={note.id} note={note} onOpen={onOpenNote} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="arrow-link mt-2.5 !text-xs"
        >
          Show {remaining} more
        </button>
      )}
    </div>
  )
}

/* ── Note card ──────────────────────────────────────────────────────────── */

function NoteCard({
  note,
  onOpen,
}: {
  readonly note: Exploration
  readonly onOpen?: (id: string) => void
}) {
  const [replyOpen, setReplyOpen] = useState(false)

  const handleClick = useCallback(() => {
    onOpen?.(note.id)
  }, [note.id, onOpen])

  const excerpt = note.anchor?.excerpt
  const hasExcerpt = excerpt && excerpt.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SNAPPY}
      className="rounded-lg border border-rule bg-white px-3 py-2.5 card-hover"
    >
      {/* Anchored excerpt */}
      {hasExcerpt && (
        <div className="mb-1.5 border-l-2 border-l-accent/25 pl-2 text-11 font-serif italic text-muted line-clamp-1">
          &ldquo;{excerpt}&rdquo;
        </div>
      )}

      {/* Title + takeaway */}
      <div className="text-13 font-medium leading-snug text-text-primary">
        {note.publication.title}
      </div>
      <div className="mt-0.5 text-xs leading-relaxed text-muted line-clamp-2">
        {note.publication.takeaway}
      </div>

      {/* Meta + actions */}
      <div className="mt-2 flex items-center gap-3">
        <span className="text-2xs text-text-faint">
          {note.publication.author || 'Anonymous'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {note.votes !== 0 && (
            <span className="mono-xs flex items-center gap-0.5 text-text-faint">
              {note.votes > 0
                ? <ThumbsUp className="h-2.5 w-2.5" />
                : <ThumbsDown className="h-2.5 w-2.5" />
              }
              {Math.abs(note.votes)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setReplyOpen(prev => !prev)}
            className="flex items-center gap-1 text-2xs text-text-faint transition-colors hover:text-accent"
          >
            <MessageSquare className="h-2.5 w-2.5" />
            Reply
          </button>
          <button
            type="button"
            onClick={handleClick}
            className="text-2xs text-text-faint transition-colors hover:text-accent"
          >
            Open →
          </button>
        </div>
      </div>

      {/* Inline reply */}
      <AnimatePresence>
        {replyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="overflow-hidden"
          >
            <div className="mt-2.5 border-t border-rule pt-2.5">
              <div className="lab-input-shell overflow-hidden">
                <textarea
                  placeholder="Reply to this note..."
                  rows={2}
                  className="w-full resize-none bg-transparent px-2.5 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-faint"
                />
              </div>
              <div className="mt-1.5 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  className="rounded-full px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-full bg-text-primary px-2.5 py-1 text-2xs font-medium text-white transition-colors hover:bg-text-primary/90"
                >
                  Reply
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
