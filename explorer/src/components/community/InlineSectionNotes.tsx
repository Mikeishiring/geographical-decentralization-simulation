import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Quote,
  ExternalLink,
  Send,
} from 'lucide-react'
import { SPRING_SNAPPY, SPRING_CRISP } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { MOCK_NOTE_EXTRAS, type MockReply } from '../../data/mock-community-notes'
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
      <div className="mt-3 space-y-2.5 stagger-reveal">
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
            <div className="mt-2.5 space-y-2.5">
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

/* ── Reply card ────────────────────────────────────────────────────────── */

function ReplyCard({ reply }: { readonly reply: MockReply }) {
  return (
    <div className="flex gap-2.5 py-2 first:pt-0">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-active text-2xs font-medium text-text-faint">
        {reply.author.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium text-text-primary">{reply.author}</span>
          <span className="text-2xs text-text-faint">
            {new Date(reply.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {reply.votes > 0 && (
            <span className="ml-auto flex items-center gap-0.5 text-2xs text-text-faint">
              <ThumbsUp className="h-2 w-2" />
              {reply.votes}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-text-body">
          {reply.body}
        </p>
      </div>
    </div>
  )
}

/* ── Note card ─────────────────────────────────────────────────────────── */

function NoteCard({
  note,
  onOpen,
}: {
  readonly note: Exploration
  readonly onOpen?: (id: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')

  const extras = MOCK_NOTE_EXTRAS[note.id]
  const replies = extras?.replies ?? []
  const quotedPassage = extras?.quotedPassage
  const sectionTitle = extras?.sectionTitle
  const sectionNumber = extras?.sectionNumber

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
      className={cn(
        'rounded-lg border bg-white transition-shadow',
        isExpanded
          ? 'border-accent/20 shadow-[0_4px_20px_rgba(59,130,246,0.06)]'
          : 'border-rule card-hover',
      )}
    >
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full px-3.5 py-3 text-left"
      >
        {/* Anchored excerpt */}
        {hasExcerpt && (
          <div className="mb-1.5 flex items-start gap-1.5">
            <Quote className="mt-0.5 h-2.5 w-2.5 shrink-0 text-accent/40" />
            <span className="text-11 font-serif italic text-muted line-clamp-1">
              {excerpt}
            </span>
          </div>
        )}

        {/* Title + takeaway */}
        <div className="text-13 font-medium leading-snug text-text-primary">
          {note.publication.title}
        </div>
        <div className={cn(
          'mt-0.5 text-xs leading-relaxed text-muted',
          isExpanded ? '' : 'line-clamp-2',
        )}>
          {note.publication.takeaway}
        </div>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-3">
          <span className="text-2xs text-text-faint">
            {note.publication.author || 'Anonymous'}
          </span>
          {note.publication.featured && (
            <span className="rounded-full border border-amber-200/60 bg-amber-50/80 px-1.5 py-0.5 text-2xs text-amber-600/70">
              Featured
            </span>
          )}
          {note.verified && (
            <span className="rounded-full border border-success/30 bg-success/8 px-1.5 py-0.5 text-2xs text-success">
              Verified
            </span>
          )}
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
            {replies.length > 0 && (
              <span className="flex items-center gap-0.5 text-2xs text-text-faint">
                <MessageSquare className="h-2.5 w-2.5" />
                {replies.length}
              </span>
            )}
            <span className="text-2xs text-text-faint">
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_CRISP}
            className="overflow-hidden"
          >
            <div className="border-t border-rule px-3.5 pb-3.5">
              {/* Quoted section context */}
              {quotedPassage && (
                <div className="mt-3 rounded-lg border border-accent/10 bg-accent/[0.03] px-3.5 py-3">
                  {sectionTitle && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="mono-xs text-accent">{sectionNumber}</span>
                      <span className="text-2xs font-medium text-text-primary">{sectionTitle}</span>
                      <span className="text-2xs text-text-faint">— Original passage</span>
                    </div>
                  )}
                  <div className="border-l-2 border-l-accent/25 pl-3">
                    <p className="text-xs leading-relaxed text-text-body font-serif">
                      {quotedPassage}
                    </p>
                  </div>
                </div>
              )}

              {/* Full takeaway (if was truncated above) */}
              {!quotedPassage && note.publication.takeaway.length > 120 && (
                <div className="mt-3 text-xs leading-relaxed text-text-body">
                  {note.publication.takeaway}
                </div>
              )}

              {/* Reply thread */}
              {replies.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
                    {replies.length} repl{replies.length !== 1 ? 'ies' : 'y'}
                  </div>
                  <div className="divide-y divide-rule">
                    {replies.map(reply => (
                      <ReplyCard key={reply.id} reply={reply} />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center gap-2 border-t border-rule pt-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReplyOpen(prev => !prev) }}
                  className="flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-2xs font-medium text-muted transition-colors hover:border-border-hover hover:text-text-primary"
                >
                  <MessageSquare className="h-3 w-3" />
                  Reply
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleClick() }}
                  className="flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-2xs font-medium text-muted transition-colors hover:border-border-hover hover:text-text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in Community
                </button>
              </div>

              {/* Inline reply composer */}
              <AnimatePresence>
                {replyOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={SPRING_SNAPPY}
                    className="overflow-hidden"
                  >
                    <div className="mt-2.5 flex gap-2">
                      <div className="lab-input-shell flex-1 overflow-hidden">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Reply to this note..."
                          rows={2}
                          className="w-full resize-none bg-transparent px-2.5 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-faint"
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Escape') setReplyOpen(false)
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setReplyOpen(false); setReplyText('') }}
                          className="rounded-md px-2 py-1 text-2xs text-muted transition-colors hover:text-text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!replyText.trim()}
                          className="flex items-center justify-center gap-1 rounded-md bg-text-primary px-2 py-1 text-2xs font-medium text-white transition-colors hover:bg-text-primary/90 disabled:opacity-40"
                        >
                          <Send className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
