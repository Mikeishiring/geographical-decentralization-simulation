import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, MessageSquare, Users } from 'lucide-react'
import { SPRING_SNAPPY, SPRING_POPUP } from '../../lib/theme'
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
    <div
      className="mt-4"
      style={{
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.06)',
        background: 'rgba(0,0,0,0.015)',
        padding: '12px 14px',
      }}
    >
      {/* Thread header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Users className="h-3 w-3 text-accent" />
        <span className="text-[11px] font-semibold tracking-wide uppercase text-black/50">
          {published.length} note{published.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-black/35">
          {expanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </span>
      </button>

      {/* Preview cards */}
      <div className="mt-2.5 space-y-1.5">
        {preview.map((note, i) => (
          <NoteCard
            key={note.id}
            note={note}
            onOpen={onOpenNote}
            delay={i * 0.04}
          />
        ))}
      </div>

      {/* Expanded: remaining notes */}
      <AnimatePresence>
        {expanded && hasMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-1.5">
              {published.slice(2).map((note, i) => (
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
          className="mt-2 text-[11px] font-medium text-black/40 transition-colors hover:text-accent"
        >
          Show {remaining} more &darr;
        </button>
      )}
    </div>
  )
}

/* ── Note card ──────────────────────────────────────────────────────────── */

function NoteCard({
  note,
  onOpen,
  delay = 0,
}: {
  readonly note: Exploration
  readonly onOpen?: (id: string) => void
  readonly delay?: number
}) {
  const [replyOpen, setReplyOpen] = useState(false)

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
      className="group/card transition-shadow duration-150"
      style={{
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.06)',
        background: '#fff',
        padding: '10px 12px',
        // Agentation-style card shadow — subtle at rest, lifts on hover
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'
      }}
    >
      {/* Anchored excerpt */}
      {hasExcerpt && (
        <div
          className="mb-1.5 line-clamp-1"
          style={{
            fontSize: 11,
            fontStyle: 'italic',
            color: 'rgba(0,0,0,0.45)',
            borderLeft: '2px solid rgba(37,99,235,0.25)',
            paddingLeft: 8,
            fontFamily: 'var(--font-serif)',
          }}
        >
          &ldquo;{excerpt.length > 60 ? `${excerpt.slice(0, 60)}\u2026` : excerpt}&rdquo;
        </div>
      )}

      {/* Title + takeaway */}
      <div className="text-[13px] font-medium leading-snug text-[#111]">
        {note.publication.title}
      </div>
      <div className="mt-0.5 text-xs leading-relaxed text-black/50 line-clamp-2">
        {note.publication.takeaway}
      </div>

      {/* Meta + actions */}
      <div className="mt-2 flex items-center gap-3">
        <span className="text-[10px] font-medium text-black/35">
          {note.publication.author || 'Anonymous'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {note.votes !== 0 && (
            <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-black/35">
              {note.votes > 0
                ? <ThumbsUp className="h-2.5 w-2.5" />
                : <ThumbsDown className="h-2.5 w-2.5" />
              }
              {Math.abs(note.votes)}
            </span>
          )}
          <motion.button
            type="button"
            onClick={() => setReplyOpen(prev => !prev)}
            whileTap={{ scale: 0.92 }}
            className="flex items-center gap-1 text-[10px] font-medium text-black/35 transition-colors hover:text-accent"
          >
            <MessageSquare className="h-2.5 w-2.5" />
            Reply
          </motion.button>
          <motion.button
            type="button"
            onClick={handleClick}
            whileTap={{ scale: 0.92 }}
            className="text-[10px] font-medium text-black/35 transition-colors hover:text-accent"
          >
            Open &rarr;
          </motion.button>
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
            <div className="mt-2 border-t border-black/[0.06] pt-2">
              <textarea
                placeholder="Reply to this note..."
                rows={2}
                className="annotation-textarea w-full resize-none rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-xs text-[#1a1a1a] outline-none placeholder:text-black/35"
                style={{
                  border: '1px solid rgba(0,0,0,0.10)',
                  borderRadius: 8,
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent, #3c82f7)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)' }}
              />
              <div className="mt-1.5 flex justify-end gap-1">
                <motion.button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  whileTap={{ scale: 0.96 }}
                  className="rounded-2xl px-2.5 py-1 text-[10px] font-medium text-black/45 transition-colors hover:bg-black/[0.04] hover:text-black/70"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  className="rounded-2xl px-2.5 py-1 text-[10px] font-medium text-white transition-[filter,opacity] hover:brightness-90 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-accent, #3c82f7)' }}
                >
                  Reply
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
