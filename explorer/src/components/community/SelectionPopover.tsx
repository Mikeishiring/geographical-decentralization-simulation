/**
 * Inline annotation popup — inspired by agentation (PolyForm Shield 1.0.0,
 * Copyright 2026 Benji Taylor, github.com/benjitaylor/agentation).
 *
 * Adapted to Tailwind + Framer Motion to match our warm cartographic palette
 * while preserving agentation's visual hierarchy and interaction model.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smile, Link2, Check, Users } from 'lucide-react'
import { SPRING_POPUP, SPRING_SNAPPY } from '../../lib/theme'
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
      className="absolute bottom-full left-0 mb-1.5 flex gap-0.5 rounded-xl border border-black/[0.06] bg-white px-2 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.10)]"
    >
      {EMOJI_REACTIONS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="rounded-md px-1 py-0.5 text-sm transition-transform active:scale-90 hover:scale-[1.18] hover:bg-black/[0.04]"
        >
          {emoji}
        </button>
      ))}
    </motion.div>
  )
}

/* ── Positioning (agentation pattern: fixed, centered on selection) ────── */

const POPUP_WIDTH = 280
const POPUP_HEIGHT_ESTIMATE = 260
const EDGE_PADDING = 12

function computePosition(rect: DOMRect) {
  const left = Math.max(
    POPUP_WIDTH / 2 + EDGE_PADDING,
    Math.min(rect.left + rect.width / 2, window.innerWidth - POPUP_WIDTH / 2 - EDGE_PADDING),
  )
  const placeBelow = rect.top < POPUP_HEIGHT_ESTIMATE + EDGE_PADDING
  const top = placeBelow ? rect.bottom + 10 : rect.top - 10
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

  // Reset state when selection changes
  useEffect(() => {
    setComment('')
    setShowEmoji(false)
    setLinkCopied(false)
  }, [anchor?.excerpt])

  // Compute position from selection rect
  useEffect(() => {
    if (!rect) { setPosition(null); return }
    setPosition(computePosition(rect))
  }, [rect])

  // Auto-focus textarea after popup mounts (agentation: 50ms delay)
  useEffect(() => {
    if (!anchor || !position) return
    const timer = window.setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      // Place cursor at end (agentation pattern)
      el.setSelectionRange(el.value.length, el.value.length)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [anchor, position])

  // Outside click: shake if has text, dismiss if empty (agentation pattern)
  useEffect(() => {
    if (!anchor) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      if (comment.trim()) {
        setIsShaking(true)
        window.setTimeout(() => setIsShaking(false), 250)
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
    const textFragment = encodeURIComponent(anchor.excerpt.slice(0, 80))
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
            // Agentation shake: 0.25s horizontal oscillation
            x: isShaking ? [0, -3, 3, -2, 2, 0] : 0,
          }}
          exit={{ opacity: 0, y: position.placeBelow ? -4 : 4, scale: 0.97 }}
          transition={SPRING_POPUP}
          data-annotation-popover
          className={`fixed z-[100001] -translate-x-1/2 pointer-events-auto ${position.placeBelow ? '' : '-translate-y-full'}`}
          style={{
            top: position.top,
            left: position.left,
            width: POPUP_WIDTH,
            borderRadius: 16,
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
            padding: '12px 16px 14px',
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {/* Header: community note identity + section context */}
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-black/60">
              <Users className="h-3 w-3 text-accent" />
              Community Note
            </span>
            {sectionNoteCount > 0 && (
              <span className="text-[10px] font-medium tabular-nums text-black/40">
                {sectionNoteCount} note{sectionNoteCount !== 1 ? 's' : ''} here
              </span>
            )}
          </div>

          {/* Quoted selection (agentation: 80 char, italic, subtle bg) */}
          <div
            className="mb-2"
            style={{
              fontSize: 12,
              fontStyle: 'italic',
              lineHeight: 1.45,
              color: 'rgba(0,0,0,0.55)',
              background: 'rgba(0,0,0,0.04)',
              borderRadius: 4,
              padding: '6px 8px',
            }}
          >
            &ldquo;{excerpt.length > 80 ? `${excerpt.slice(0, 80)}\u2026` : excerpt}&rdquo;
            {/* Share passage pill */}
            <button
              type="button"
              onClick={handleShareLocation}
              className="mt-1 flex items-center gap-1 text-[10px] font-medium text-black/40 transition-colors hover:text-accent"
            >
              {linkCopied ? (
                <><Check className="h-2.5 w-2.5 text-emerald-500" /><span>Copied</span></>
              ) : (
                <><Link2 className="h-2.5 w-2.5" /><span>Share passage</span></>
              )}
            </button>
          </div>

          {/* Textarea (agentation: 8px radius, 13px, border → accent on focus) */}
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add context readers should know..."
            rows={2}
            className="annotation-textarea w-full resize-none outline-none"
            style={{
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              color: '#1a1a1a',
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: 8,
              padding: '8px 10px',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent, #3c82f7)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)' }}
          />

          {/* Helper text */}
          <p className="mt-1.5 text-[10px] leading-snug text-black/40">
            Notes are public. Lead with what you observed, not what you assumed.
          </p>

          {/* Actions bar (agentation: flex-end, 6px gap, mt-8px) */}
          <div className="relative mt-2 flex items-center">
            <div className="relative">
              <AnimatePresence>
                {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
              </AnimatePresence>
              <motion.button
                type="button"
                onClick={() => setShowEmoji(prev => !prev)}
                whileTap={{ scale: 0.92 }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.06] hover:text-black/60"
              >
                <Smile className="h-4 w-4" />
              </motion.button>
            </div>

            <div className="ml-auto flex gap-1.5">
              {/* Cancel — agentation: pill, transparent, 12px, 500 weight */}
              <motion.button
                type="button"
                onClick={handleCancel}
                whileTap={{ scale: 0.96 }}
                className="rounded-2xl px-3.5 py-1.5 text-xs font-medium text-black/50 transition-[background-color,color] duration-150 hover:bg-black/[0.06] hover:text-black/80"
              >
                Cancel
              </motion.button>
              {/* Submit — agentation: pill, accent bg, white text, disabled 0.4 opacity */}
              <motion.button
                type="button"
                onClick={handleSubmit}
                disabled={!comment.trim()}
                whileTap={{ scale: 0.96 }}
                className="rounded-2xl px-3.5 py-1.5 text-xs font-medium text-white transition-[filter,opacity] duration-150 hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-accent, #3c82f7)' }}
              >
                Publish note
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
