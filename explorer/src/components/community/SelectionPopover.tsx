/**
 * Inline annotation popup — minimal, pristine design.
 * Quote → Textarea → Publish. Nothing else.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Check, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_POPUP, SPRING_CRISP } from '../../lib/theme'
import type { TextAnchor } from '../../types/anchors'

/* ── Positioning (margin-first: right side like Word comments, centered fallback) */

const POPUP_WIDTH = 300
const POPUP_HEIGHT_ESTIMATE = 220
const EDGE_PADDING = 12
const MARGIN_GAP = 16

function computePosition(rect: DOMRect, containerRef?: React.RefObject<HTMLElement | null>) {
  const container = containerRef?.current
  if (container) {
    const proseCol = document.elementFromPoint(rect.left + 1, rect.top + 1)
      ?.closest('.xl\\:col-span-7, [class*="col-span-7"]')
    const proseRight = proseCol
      ? proseCol.getBoundingClientRect().right
      : rect.right + 40
    const marginAvailable = window.innerWidth - proseRight
    if (marginAvailable > POPUP_WIDTH + MARGIN_GAP * 2) {
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
  readonly containerRef?: React.RefObject<HTMLElement | null>
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function SelectionPopover({
  anchor,
  rect,
  onAddNote,
  onDismiss,
  containerRef,
}: SelectionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; placeBelow: boolean; marginMode: boolean } | null>(null)
  const [comment, setComment] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [phase, setPhase] = useState<SubmitPhase>('idle')

  // Reset state when selection changes
  useEffect(() => {
    setComment('')
    setLinkCopied(false)
    setPhase('idle')
  }, [anchor?.excerpt])

  // Compute position from selection rect
  useEffect(() => {
    if (!rect) { setPosition(null); return }
    setPosition(computePosition(rect, containerRef))
  }, [rect, containerRef])

  // Auto-focus textarea
  useEffect(() => {
    if (!anchor || !position || phase !== 'idle') return
    const timer = window.setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
    }, 220)
    return () => window.clearTimeout(timer)
  }, [anchor, position, phase])

  // Outside click: shake if has text, dismiss if empty
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
    const ok = await onAddNote(anchor, comment.trim())
    if (ok) {
      setPhase('success')
      window.setTimeout(() => {
        setComment('')
        onDismiss()
      }, CONFIRM_DWELL_MS)
    } else {
      setPhase('error')
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

  const handleCopyLink = useCallback(async () => {
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
            'fixed z-[60] pointer-events-auto',
            'rounded-2xl bg-white/[0.97] backdrop-blur-md',
            'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)]',
            'overflow-hidden',
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
              className="absolute top-5 right-full h-px w-4 bg-accent/25"
              aria-hidden="true"
            >
              <span className="absolute right-full top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent/40" />
            </span>
          )}

          <AnimatePresence mode="wait">
            {phase === 'success' ? (
              /* ── Success confirmation ────────────────────────────────── */
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={SPRING_CRISP}
                className="flex flex-col items-center justify-center py-8"
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
                  className="mt-3 text-[13px] font-medium text-stone-800"
                >
                  Note published
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: 0.18 }}
                  className="mt-0.5 text-[11px] text-stone-400"
                >
                  Visible to all readers
                </motion.p>
              </motion.div>
            ) : (
              /* ── Compose form ────────────────────────────────────────── */
              <motion.div
                key="compose"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Quoted excerpt with link-copy icon */}
                <div className="flex items-start gap-2 border-b border-black/[0.06] px-4 py-3">
                  <p className="min-w-0 flex-1 text-[12px] italic leading-[1.5] text-black/50">
                    &ldquo;{excerpt.length > 100 ? `${excerpt.slice(0, 100)}\u2026` : excerpt}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    disabled={isLocked}
                    title={linkCopied ? 'Copied' : 'Copy link to passage'}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
                      linkCopied
                        ? 'bg-emerald-50 text-emerald-500 scale-110'
                        : 'bg-black/[0.04] text-black/35 hover:bg-accent/10 hover:text-accent',
                      'disabled:opacity-30',
                    )}
                  >
                    {linkCopied
                      ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      : <Link2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>

                {/* Textarea */}
                <div className="px-4 pt-3 pb-2">
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add your note..."
                    rows={3}
                    disabled={isLocked}
                    className={cn(
                      'w-full resize-none outline-none',
                      'text-[13px] leading-relaxed text-stone-800',
                      'bg-transparent border-0 p-0',
                      'placeholder:text-black/25',
                      'disabled:opacity-50',
                    )}
                  />
                </div>

                {/* Actions bar */}
                <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2.5">
                  <span className="text-[10px] text-black/30">
                    Enter to publish
                  </span>

                  <div className="flex items-center gap-1.5">
                    <motion.button
                      type="button"
                      onClick={handleCancel}
                      whileTap={{ scale: 0.95 }}
                      disabled={isLocked}
                      className="rounded-full px-3 py-1 text-[11px] font-medium text-black/45 transition-colors hover:bg-black/[0.05] hover:text-black/70 disabled:opacity-30 disabled:pointer-events-none"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!comment.trim() || isLocked}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        'rounded-full px-3.5 py-1 text-[11px] font-medium text-white',
                        'bg-accent transition-all hover:brightness-95',
                        'disabled:cursor-not-allowed disabled:opacity-35',
                      )}
                    >
                      {phase === 'submitting' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Publishing
                        </span>
                      ) : (
                        'Publish'
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
