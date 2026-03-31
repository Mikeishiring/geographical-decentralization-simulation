/**
 * Inline annotation popup — inspired by agentation (PolyForm Shield 1.0.0,
 * Copyright 2026 Benji Taylor, github.com/benjitaylor/agentation).
 *
 * Adapted to Tailwind + Framer Motion to match our project conventions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smile, Link2, Check, Users } from 'lucide-react'
import { SPRING_SNAPPY } from '../../lib/theme'
import type { TextAnchor } from '../../types/anchors'

/* ── Emoji picker ───────────────────────────────────────────────────────── */

const EMOJI_REACTIONS = ['👍', '👎', '🔥', '💡', '🤔', '❤️', '👀', '🎯'] as const

function EmojiPicker({ onSelect }: { readonly onSelect: (emoji: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      transition={SPRING_SNAPPY}
      className="absolute bottom-full left-0 mb-1.5 flex gap-0.5 rounded-xl border border-rule bg-white px-2 py-1.5 shadow-[0_4px_16px_rgba(15,23,42,0.08)]"
    >
      {EMOJI_REACTIONS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="rounded-md px-1 py-0.5 text-sm transition-transform hover:scale-125 hover:bg-surface-active"
        >
          {emoji}
        </button>
      ))}
    </motion.div>
  )
}

/* ── Positioning ────────────────────────────────────────────────────────── */

const POPUP_WIDTH = 300
const POPUP_HEIGHT_ESTIMATE = 260
const EDGE_PADDING = 12

function computePosition(rect: DOMRect) {
  const left = Math.max(
    POPUP_WIDTH / 2 + EDGE_PADDING,
    Math.min(rect.left + rect.width / 2, window.innerWidth - POPUP_WIDTH / 2 - EDGE_PADDING),
  )
  const placeBelow = rect.top < POPUP_HEIGHT_ESTIMATE + EDGE_PADDING
  const top = placeBelow ? rect.bottom + 12 : rect.top - 12
  return { top, left, placeBelow }
}

/* ── Props ──────────────────────────────────────────────────────────────── */

interface SelectionPopoverProps {
  readonly anchor: TextAnchor | null
  readonly rect: DOMRect | null
  readonly onAddNote: (anchor: TextAnchor, comment: string) => void
  readonly onDismiss: () => void
  readonly sectionNoteCount?: number
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function SelectionPopover({
  anchor,
  rect,
  onAddNote,
  onDismiss,
  sectionNoteCount = 0,
}: SelectionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; placeBelow: boolean } | null>(null)
  const [comment, setComment] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    setComment('')
    setShowEmoji(false)
    setLinkCopied(false)
  }, [anchor?.excerpt])

  useEffect(() => {
    if (!rect) { setPosition(null); return }
    setPosition(computePosition(rect))
  }, [rect])

  useEffect(() => {
    if (!anchor || !position) return
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [anchor, position])

  useEffect(() => {
    if (!anchor) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      if (comment.trim()) {
        setIsShaking(true)
        window.setTimeout(() => setIsShaking(false), 300)
      } else {
        onDismiss()
      }
    }
    const timeoutId = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 120)
    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [anchor, comment, onDismiss])

  const handleSubmit = useCallback(() => {
    if (!anchor || !comment.trim()) return
    onAddNote(anchor, comment.trim())
    setComment('')
    setShowEmoji(false)
  }, [anchor, comment, onAddNote])

  const handleCancel = useCallback(() => {
    setComment('')
    setShowEmoji(false)
    onDismiss()
  }, [onDismiss])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation()
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
      if (e.key === 'Escape') handleCancel()
    },
    [handleSubmit, handleCancel],
  )

  const handleEmojiSelect = useCallback((emoji: string) => {
    setComment(prev => prev + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }, [])

  const handleShareLocation = useCallback(async () => {
    if (!anchor) return
    const url = new URL(window.location.href)
    if (anchor.sectionId) url.hash = anchor.sectionId
    const textFragment = encodeURIComponent(anchor.excerpt.slice(0, 100))
    url.hash = `${url.hash}:~:text=${textFragment}`
    try {
      await navigator.clipboard.writeText(url.toString())
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch { /* ignore */ }
  }, [anchor])

  const isVisible = anchor !== null && position !== null
  const excerpt = anchor?.excerpt ?? ''

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: position.placeBelow ? -6 : 6, scale: 0.95 }}
          animate={{
            opacity: 1, y: 0, scale: 1,
            x: isShaking ? [0, -3, 3, -2, 2, 0] : 0,
          }}
          exit={{ opacity: 0, y: position.placeBelow ? -4 : 4, scale: 0.97 }}
          transition={SPRING_SNAPPY}
          className={`fixed z-50 -translate-x-1/2 rounded-xl border border-rule bg-white/[0.97] backdrop-blur-sm px-4 pb-3.5 pt-3 shadow-[0_8px_30px_rgba(15,23,42,0.10),0_1px_4px_rgba(15,23,42,0.06)] pointer-events-auto geo-accent-bar ${position.placeBelow ? '' : '-translate-y-full'}`}
          style={{ top: position.top, left: position.left, width: POPUP_WIDTH }}
          onClick={e => e.stopPropagation()}
        >
          {/* Community note identity */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="badge-subtle">
              <Users className="h-2.5 w-2.5 text-accent" />
              Community Note
            </span>
            {sectionNoteCount > 0 && (
              <span className="text-2xs text-text-faint">
                {sectionNoteCount} note{sectionNoteCount !== 1 ? 's' : ''} here
              </span>
            )}
          </div>

          {/* Quoted selection + share pill */}
          <div className="mb-2.5 rounded-lg border border-rule bg-surface-active px-2.5 py-2">
            <div className="text-xs font-serif italic leading-relaxed text-muted">
              &ldquo;{excerpt.length > 100 ? `${excerpt.slice(0, 100)}...` : excerpt}&rdquo;
            </div>
            <button
              type="button"
              onClick={handleShareLocation}
              className="lab-chip mt-1.5 gap-1 !px-2 !py-0.5 !text-2xs"
            >
              {linkCopied ? (
                <><Check className="h-2.5 w-2.5 text-success" /><span>Copied</span></>
              ) : (
                <><Link2 className="h-2.5 w-2.5" /><span>Share passage</span></>
              )}
            </button>
          </div>

          {/* Textarea */}
          <div className="lab-input-shell overflow-hidden">
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add context readers should know..."
              rows={2}
              className="w-full resize-none bg-transparent px-3 py-2 text-13 text-text-primary outline-none placeholder:text-text-faint"
            />
          </div>

          {/* Helper text */}
          <p className="mt-1.5 text-2xs leading-snug text-text-faint">
            Notes are public. Lead with what you observed, not what you assumed.
          </p>

          {/* Actions */}
          <div className="relative mt-2 flex items-center">
            <div className="relative">
              <AnimatePresence>
                {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => setShowEmoji(prev => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-surface-active hover:text-muted"
              >
                <Smile className="h-4 w-4" />
              </button>
            </div>

            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-active hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!comment.trim()}
                className="rounded-full bg-text-primary px-3.5 py-1.5 text-xs font-medium text-white transition-[background-color,opacity] hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Publish note
              </button>
            </div>
          </div>

          {/* Arrow */}
          <div className={`absolute left-1/2 -translate-x-1/2 ${position.placeBelow ? 'bottom-full rotate-180' : 'top-full'}`}>
            <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
