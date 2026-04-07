/**
 * Inline annotation popup — inspired by agentation (PolyForm Shield 1.0.0,
 * Copyright 2026 Benji Taylor, github.com/benjitaylor/agentation).
 *
 * Adapted to Tailwind + Framer Motion to match our warm cartographic palette
 * while preserving agentation's visual hierarchy and interaction model.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smile, Link2, Check, Users, Loader2, ThumbsUp, ThumbsDown, Flame, Lightbulb, HelpCircle, Heart, Eye, Target } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_POPUP, SPRING_SNAPPY, SPRING_CRISP } from '../../lib/theme'
import type { TextAnchor } from '../../types/anchors'

/* ── Emoji picker ───────────────────────────────────────────────────────── */

const EMOJI_REACTIONS = [
  { key: 'thumbs-up', icon: ThumbsUp },
  { key: 'thumbs-down', icon: ThumbsDown },
  { key: 'flame', icon: Flame },
  { key: 'lightbulb', icon: Lightbulb },
  { key: 'help', icon: HelpCircle },
  { key: 'heart', icon: Heart },
  { key: 'eye', icon: Eye },
  { key: 'target', icon: Target },
] as const

function EmojiPicker({ onSelect }: { readonly onSelect: (emoji: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      transition={SPRING_SNAPPY}
      className="absolute bottom-full left-0 mb-1.5 flex gap-0.5 rounded-xl border border-black/[0.06] bg-white px-2 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.06)]"
    >
      {EMOJI_REACTIONS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className="rounded-md px-1 py-0.5 text-sm transition-transform active:scale-[0.92] hover:scale-[1.18] hover:bg-black/[0.04]"
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </motion.div>
  )
}

/* ── Positioning (margin-first: right side like Word comments, centered fallback) */

const POPUP_WIDTH = 264
const POPUP_HEIGHT_ESTIMATE = 260
const EDGE_PADDING = 12
const MARGIN_GAP = 16

function computePosition(rect: DOMRect, containerRef?: React.RefObject<HTMLElement | null>) {
  // Try right-margin placement (Word-style comments)
  // Find the prose column (xl:col-span-7) by walking up from the selection's position
  const container = containerRef?.current
  if (container) {
    // Look for the closest section card's content grid to find prose column width
    const proseCol = document.elementFromPoint(rect.left + 1, rect.top + 1)
      ?.closest('.xl\\:col-span-7, [class*="col-span-7"]')
    const proseRight = proseCol
      ? proseCol.getBoundingClientRect().right
      : rect.right + 40 // fallback: use selection right edge + small offset
    const marginAvailable = window.innerWidth - proseRight
    if (marginAvailable > POPUP_WIDTH + MARGIN_GAP * 2) {
      // Clamp vertical position so the popover stays within the viewport
      const maxTop = window.innerHeight - POPUP_HEIGHT_ESTIMATE - MARGIN_GAP
      const clampedTop = Math.max(MARGIN_GAP, Math.min(rect.top, maxTop))
      return {
        top: clampedTop,
        left: proseRight + MARGIN_GAP,
        placeBelow: false,
        marginMode: true as const,
      }
    }
  }

  // Fallback: centered on selection (original behavior)
  const left = Math.max(
    POPUP_WIDTH / 2 + EDGE_PADDING,
    Math.min(rect.left + rect.width / 2, window.innerWidth - POPUP_WIDTH / 2 - EDGE_PADDING),
  )
  const placeBelow = rect.top < POPUP_HEIGHT_ESTIMATE + EDGE_PADDING
  const top = placeBelow ? rect.bottom + 10 : rect.top - 10
  return { top, left, placeBelow, marginMode: false as const }
}

/* ── Submission states ─────────────────────────────────────────────────── */

type SubmitPhase = 'idle' | 'submitting' | 'success' | 'error'

const CONFIRM_DWELL_MS = 900

/* ── Props ──────────────────────────────────────────────────────────────── */

interface SelectionPopoverProps {
  readonly anchor: TextAnchor | null
  readonly rect: DOMRect | null
  readonly onAddNote: (anchor: TextAnchor, comment: string) => Promise<boolean>
  readonly onDismiss: () => void
  readonly sectionNoteCount?: number
  /** Container ref for margin-mode positioning (right side of prose column) */
  readonly containerRef?: React.RefObject<HTMLElement | null>
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function SelectionPopover({
  anchor,
  rect,
  onAddNote,
  onDismiss,
  sectionNoteCount = 0,
  containerRef,
}: SelectionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; placeBelow: boolean; marginMode: boolean } | null>(null)
  const [comment, setComment] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [phase, setPhase] = useState<SubmitPhase>('idle')

  // Reset state when selection changes
  useEffect(() => {
    setComment('')
    setShowEmoji(false)
    setLinkCopied(false)
    setPhase('idle')
  }, [anchor?.excerpt])

  // Compute position from selection rect
  useEffect(() => {
    if (!rect) { setPosition(null); return }
    setPosition(computePosition(rect, containerRef))
  }, [rect, containerRef])

  // Auto-focus textarea on the next frame so the note can be typed immediately.
  useEffect(() => {
    if (!anchor || !position || phase !== 'idle') return
    const frame = window.requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [anchor, position, phase])

  // Outside click: shake if has text, dismiss if empty (agentation pattern)
  // Disable outside-click dismiss during submitting/success phases
  useEffect(() => {
    if (!anchor || phase === 'submitting' || phase === 'success') return
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
  }, [anchor, comment, onDismiss, phase])

  const handleSubmit = useCallback(async () => {
    if (!anchor || !comment.trim() || phase !== 'idle') return

    setPhase('submitting')
    setShowEmoji(false)

    const ok = await onAddNote(anchor, comment.trim())

    if (ok) {
      setPhase('success')
      // Dwell on confirmation, then let parent dismiss
      window.setTimeout(() => {
        setComment('')
        onDismiss()
      }, CONFIRM_DWELL_MS)
    } else {
      setPhase('error')
      // Shake on error and return to idle
      setIsShaking(true)
      window.setTimeout(() => {
        setIsShaking(false)
        setPhase('idle')
      }, 300)
    }
  }, [anchor, comment, onAddNote, onDismiss, phase])

  const handleCancel = useCallback(() => {
    if (phase === 'submitting' || phase === 'success') return
    setComment('')
    setShowEmoji(false)
    onDismiss()
  }, [onDismiss, phase])

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
    const textFragment = encodeURIComponent(anchor.excerpt.slice(0, 80))
    const fragmentPrefix = anchor.sectionId ? `${anchor.sectionId}:~:` : ':~:'
    url.hash = `${fragmentPrefix}text=${textFragment}`
    try {
      await navigator.clipboard.writeText(url.toString())
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch { /* ignore */ }
  }, [anchor])

  const isVisible = anchor !== null && position !== null
  const excerpt = anchor?.excerpt ?? ''
  const isLocked = phase === 'submitting' || phase === 'success'

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={popoverRef}
          initial={position.marginMode
            ? { opacity: 0, x: 12, scale: 0.97 }
            : { opacity: 0, y: position.placeBelow ? -6 : 6, scale: 0.95 }
          }
          animate={{
            opacity: 1,
            y: 0,
            x: isShaking ? [0, -3, 3, -2, 2, 0] : 0,
            scale: 1,
          }}
          exit={position.marginMode
            ? { opacity: 0, x: 8, scale: 0.97 }
            : { opacity: 0, y: position.placeBelow ? -4 : 4, scale: 0.97 }
          }
          transition={SPRING_POPUP}
          data-annotation-popover
          className={cn(
            'fixed z-[60] pointer-events-auto rounded-2xl bg-white/[0.97] backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] px-4 py-3 pb-3.5',
            position.marginMode
              ? ''
              : `-translate-x-1/2 ${position.placeBelow ? '' : '-translate-y-full'}`,
          )}
          style={{
            top: position.top,
            left: position.left,
            width: POPUP_WIDTH,
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {/* Connecting line for margin mode */}
          {position.marginMode && (
            <span
              className="absolute top-4 right-full h-px w-4 bg-accent/25"
              aria-hidden="true"
            >
              <span className="absolute right-full top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent/40" />
            </span>
          )}
          <AnimatePresence mode="wait">
            {phase === 'success' ? (
              /* ── Success confirmation overlay ─────────────────────────── */
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={SPRING_CRISP}
                className="flex flex-col items-center justify-center py-5"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...SPRING_POPUP, delay: 0.05 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50"
                >
                  <Check className="h-5 w-5 text-emerald-500" strokeWidth={2.5} />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_CRISP, delay: 0.1 }}
                  className="mt-2.5 text-[13px] font-medium text-stone-800"
                >
                  Note published
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: 0.18 }}
                  className="mt-1 text-[11px] text-stone-400"
                >
                  Visible to all readers
                </motion.p>
              </motion.div>
            ) : (
              /* ── Compose form ─────────────────────────────────────────── */
              <motion.div
                key="compose"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Header: community note identity + section context */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-black/60">
                    <Users className="h-3 w-3 text-accent" />
                    Community Note
                  </span>
                  {sectionNoteCount > 0 && (
                    <span className="text-[10px] font-medium tabular-nums text-black/40">
                      {sectionNoteCount} note{sectionNoteCount !== 1 ? 's' : ''} in this section
                    </span>
                  )}
                </div>

                <p className="mb-2 text-[10px] leading-relaxed text-black/45">
                  Publish a public reader note tied to this passage. It will appear below this section and on Community, where other readers can reply and vote.
                </p>

                {/* Quoted selection (agentation: 80 char, italic, subtle bg) */}
                <div className="mb-2 text-xs italic leading-[1.45] text-black/55 bg-black/[0.04] rounded px-2 py-1.5">
                  &ldquo;{excerpt.length > 80 ? `${excerpt.slice(0, 80)}\u2026` : excerpt}&rdquo;
                  <button
                    type="button"
                    onClick={handleShareLocation}
                    disabled={isLocked}
                    className="mt-1 flex items-center gap-1 text-[10px] font-medium text-black/40 transition-colors hover:text-accent disabled:opacity-40"
                  >
                    {linkCopied ? (
                      <><Check className="h-2.5 w-2.5 text-emerald-500" /><span>Copied</span></>
                    ) : (
                      <><Link2 className="h-2.5 w-2.5" /><span>Share passage</span></>
                    )}
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add context readers should know..."
                  rows={2}
                  disabled={isLocked}
                  className="annotation-textarea w-full resize-none outline-none text-[13px] font-[inherit] leading-normal text-[#1a1a1a] bg-black/[0.03] border border-black/[0.12] rounded-lg px-2.5 py-2 transition-colors focus:border-accent disabled:opacity-50"
                />

                {/* Helper text */}
                <p className="mt-1.5 text-[10px] leading-snug text-black/40">
                  Notes are public. Lead with what you observed, then label the inference. Press Enter to publish and Shift+Enter for a new line.
                </p>

                {/* Actions bar */}
                <div className="relative mt-2 flex items-center">
                  <div className="relative">
                    <AnimatePresence>
                      {showEmoji && !isLocked && <EmojiPicker onSelect={handleEmojiSelect} />}
                    </AnimatePresence>
                    <motion.button
                      type="button"
                      onClick={() => !isLocked && setShowEmoji(prev => !prev)}
                      whileTap={{ scale: 0.92 }}
                      disabled={isLocked}
                      aria-label="Add emoji reaction"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.06] hover:text-black/60 focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-40"
                    >
                      <Smile className="h-4 w-4" />
                    </motion.button>
                  </div>

                  <div className="ml-auto flex gap-1.5">
                    {/* Cancel */}
                    <motion.button
                      type="button"
                      onClick={handleCancel}
                      whileTap={{ scale: 0.95 }}
                      disabled={isLocked}
                      className="rounded-2xl px-3.5 py-1.5 text-xs font-medium text-black/50 transition-[background-color,color] duration-150 hover:bg-black/[0.06] hover:text-black/80 disabled:opacity-30 disabled:pointer-events-none"
                    >
                      Cancel
                    </motion.button>
                    {/* Submit */}
                    <motion.button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!comment.trim() || isLocked}
                      whileTap={{ scale: 0.95 }}
                      className="rounded-2xl bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition-[filter,opacity] duration-150 hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {phase === 'submitting' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Publishing...
                        </span>
                      ) : (
                        'Publish note'
                      )}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
