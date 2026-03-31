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
  Send,
} from 'lucide-react'
import { SPRING_SNAPPY, SPRING_POPUP } from '../../lib/theme'
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

      {/* Notes — show preview when collapsed, all when expanded */}
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
          className="mt-2 text-[11px] font-medium text-black/40 transition-colors hover:text-accent"
        >
          Show {remaining} more &darr;
        </button>
      )}
    </div>
  )
}

/* ── Reply card ────────────────────────────────────────────────────────── */

function ReplyCard({ reply }: { readonly reply: MockReply }) {
  return (
    <div className="flex gap-2.5 py-2 first:pt-0">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[10px] font-medium text-black/40">
        {reply.author.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[#111]">{reply.author}</span>
          <span className="text-[10px] text-black/35">
            {new Date(reply.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {reply.votes > 0 && (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-black/35">
              <ThumbsUp className="h-2 w-2" />
              {reply.votes}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-black/60">
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
  delay = 0,
}: {
  readonly note: Exploration
  readonly onOpen?: (id: string) => void
  readonly delay?: number
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
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_POPUP, delay }}
      className="group/card transition-shadow duration-150"
      style={{
        borderRadius: 10,
        border: isExpanded ? '1px solid rgba(37,99,235,0.15)' : '1px solid rgba(0,0,0,0.06)',
        background: '#fff',
        boxShadow: isExpanded
          ? '0 4px 20px rgba(59,130,246,0.06)'
          : '0 1px 3px rgba(0,0,0,0.03)',
      }}
      onMouseEnter={e => {
        if (!isExpanded) (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={e => {
        if (!isExpanded) (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'
      }}
    >
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full text-left"
        style={{ padding: '10px 12px' }}
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
        <div className={`mt-0.5 text-xs leading-relaxed text-black/50 ${isExpanded ? '' : 'line-clamp-2'}`}>
          {note.publication.takeaway}
        </div>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] font-medium text-black/35">
            {note.publication.author || 'Anonymous'}
          </span>
          {note.publication.featured && (
            <span className="rounded-full border border-amber-200/60 bg-amber-50/80 px-1.5 py-0.5 text-[10px] text-amber-600/70">
              Featured
            </span>
          )}
          {note.verified && (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-50/60 px-1.5 py-0.5 text-[10px] text-emerald-600">
              Verified
            </span>
          )}
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
            {replies.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-black/35">
                <MessageSquare className="h-2.5 w-2.5" />
                {replies.length}
              </span>
            )}
            <span className="text-black/30">
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
            transition={SPRING_SNAPPY}
            className="overflow-hidden"
          >
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '0 12px 12px' }}>
              {/* Quoted section context */}
              {quotedPassage && (
                <div
                  className="mt-3"
                  style={{
                    borderRadius: 8,
                    border: '1px solid rgba(37,99,235,0.08)',
                    background: 'rgba(37,99,235,0.02)',
                    padding: '10px 12px',
                  }}
                >
                  {sectionTitle && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-mono font-medium text-accent">{sectionNumber}</span>
                      <span className="text-[10px] font-medium text-[#111]">{sectionTitle}</span>
                      <span className="text-[10px] text-black/35">&mdash; Original passage</span>
                    </div>
                  )}
                  <div style={{ borderLeft: '2px solid rgba(37,99,235,0.25)', paddingLeft: 10 }}>
                    <p className="text-xs leading-relaxed text-black/60" style={{ fontFamily: 'var(--font-serif)' }}>
                      {quotedPassage}
                    </p>
                  </div>
                </div>
              )}

              {/* Full takeaway (if was truncated above) */}
              {!quotedPassage && note.publication.takeaway.length > 120 && (
                <div className="mt-3 text-xs leading-relaxed text-black/60">
                  {note.publication.takeaway}
                </div>
              )}

              {/* Reply thread */}
              {replies.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    {replies.length} repl{replies.length !== 1 ? 'ies' : 'y'}
                  </div>
                  <div className="divide-y divide-black/[0.06]">
                    {replies.map(reply => (
                      <ReplyCard key={reply.id} reply={reply} />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
                <motion.button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReplyOpen(prev => !prev) }}
                  whileTap={{ scale: 0.92 }}
                  className="flex items-center gap-1 text-[10px] font-medium text-black/35 transition-colors hover:text-accent"
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  Reply
                </motion.button>
                <motion.button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleClick() }}
                  whileTap={{ scale: 0.92 }}
                  className="flex items-center gap-1 text-[10px] font-medium text-black/35 transition-colors hover:text-accent"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  Open in Community
                </motion.button>
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
                    <div className="mt-2 flex gap-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Reply to this note..."
                        rows={2}
                        className="w-full flex-1 resize-none rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-xs text-[#1a1a1a] outline-none placeholder:text-black/35"
                        style={{
                          border: '1px solid rgba(0,0,0,0.10)',
                          borderRadius: 8,
                          transition: 'border-color 0.15s ease',
                        }}
                        onClick={e => e.stopPropagation()}
                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent, #3c82f7)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)' }}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Escape') setReplyOpen(false)
                        }}
                      />
                      <div className="flex flex-col gap-1">
                        <motion.button
                          type="button"
                          onClick={e => { e.stopPropagation(); setReplyOpen(false); setReplyText('') }}
                          whileTap={{ scale: 0.96 }}
                          className="rounded-2xl px-2.5 py-1 text-[10px] font-medium text-black/45 transition-colors hover:bg-black/[0.04] hover:text-black/70"
                        >
                          Cancel
                        </motion.button>
                        <motion.button
                          type="button"
                          disabled={!replyText.trim()}
                          onClick={e => { e.stopPropagation(); setReplyText(''); setReplyOpen(false) }}
                          whileTap={{ scale: 0.96 }}
                          className="flex items-center justify-center gap-1 rounded-2xl px-2.5 py-1 text-[10px] font-medium text-white transition-[filter,opacity] hover:brightness-90 disabled:opacity-40"
                          style={{ backgroundColor: 'var(--color-accent, #3c82f7)' }}
                        >
                          <Send className="h-2.5 w-2.5" />
                        </motion.button>
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
