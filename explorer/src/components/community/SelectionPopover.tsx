import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquarePlus } from 'lucide-react'
import { SPRING_SNAPPY } from '../../lib/theme'
import type { TextAnchor } from '../../types/anchors'

interface SelectionPopoverProps {
  readonly anchor: TextAnchor | null
  readonly rect: DOMRect | null
  readonly onAddNote: (anchor: TextAnchor) => void
  readonly onDismiss: () => void
}

export function SelectionPopover({ anchor, rect, onAddNote, onDismiss }: SelectionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!rect) {
      setPosition(null)
      return
    }

    // Position above the selection in viewport coordinates (fixed positioning)
    const top = rect.top - 8
    const left = rect.left + rect.width / 2

    setPosition({ top, left })
  }, [rect])

  // Dismiss on outside click
  useEffect(() => {
    if (!anchor) return

    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }

    // Delay attaching to avoid immediately catching the mouseup
    const timeoutId = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 100)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [anchor, onDismiss])

  const isVisible = anchor !== null && position !== null

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={SPRING_SNAPPY}
          className="fixed z-50 -translate-x-1/2 -translate-y-full pointer-events-auto"
          style={{ top: position.top, left: position.left }}
        >
          <button
            onClick={() => onAddNote(anchor)}
            className="flex items-center gap-2 rounded-lg border border-rule bg-white px-3 py-2 shadow-lg transition-colors hover:border-accent hover:bg-accent/5"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-text-primary">Add community note</span>
          </button>
          {/* Arrow pointing down */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full">
            <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
