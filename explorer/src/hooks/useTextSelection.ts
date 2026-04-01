import { useCallback, useEffect, useRef, useState } from 'react'
import type { TextAnchor } from '../types/anchors'

/**
 * Watches for text selections within a container element and returns
 * a TextAnchor with the selected excerpt and nearest section context.
 *
 * Stores the Range object (not a snapshot DOMRect) so the popover can
 * recompute its viewport position on scroll without going stale.
 */
export function useTextSelection(viewMode?: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<TextAnchor | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const rangeRef = useRef<Range | null>(null)

  const clearSelection = useCallback(() => {
    setAnchor(null)
    setRect(null)
    rangeRef.current = null
  }, [])

  // Recompute rect from the stored Range on every scroll/resize.
  // Debounced to prevent flicker during fast scrolling — the popover
  // uses a spring transition so 16ms lag is imperceptible.
  useEffect(() => {
    if (!rangeRef.current) return

    let rafId: number | null = null

    const recompute = () => {
      // Coalesce rapid scroll events into a single rAF
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const range = rangeRef.current
        if (!range) return
        // Verify the range is still valid (its container is in the DOM)
        const container = containerRef.current
        if (container && !container.contains(range.commonAncestorContainer)) {
          clearSelection()
          return
        }
        setRect(range.getBoundingClientRect())
      })
    }

    window.addEventListener('scroll', recompute, { passive: true })
    window.addEventListener('resize', recompute, { passive: true })
    return () => {
      window.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [anchor]) // Re-attach when anchor changes (i.e. new selection); clearSelection is stable (useCallback with [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseUp = () => {
      // Small delay to let browser finalize the selection
      window.requestAnimationFrame(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.rangeCount) return

        const text = sel.toString().trim()
        if (text.length < 3 || text.length > 500) return

        const range = sel.getRangeAt(0)

        // Check that selection is within our container
        if (!container.contains(range.commonAncestorContainer)) return

        // Walk up from the selection to find the nearest data-section-id
        const sectionId = findAncestorAttribute(range.commonAncestorContainer, 'data-section-id')
        const blockId = findAncestorAttribute(range.commonAncestorContainer, 'data-block-id')

        // Store the live Range so we can recompute rect on scroll
        rangeRef.current = range.cloneRange()

        setAnchor({
          sectionId: sectionId ?? undefined,
          blockId: blockId ?? undefined,
          excerpt: text,
          viewMode,
        })
        setRect(range.getBoundingClientRect())
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Don't clear if the click is inside the annotation popover.
      // The popover marks itself with [data-annotation-popover].
      const target = e.target as HTMLElement
      if (target.closest?.('[data-annotation-popover]')) return

      // Clear on new mouse down to reset stale selections
      clearSelection()
    }

    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mousedown', handleMouseDown)

    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mousedown', handleMouseDown)
    }
  }, [viewMode, clearSelection])

  return {
    containerRef,
    selection: anchor,
    selectionRect: rect,
    clearSelection,
  }
}

function findAncestorAttribute(node: Node, attribute: string): string | null {
  let current: Node | null = node
  while (current && current !== document.body) {
    if (current instanceof HTMLElement) {
      const value = current.getAttribute(attribute)
      if (value) return value
    }
    current = current.parentNode
  }
  return null
}
