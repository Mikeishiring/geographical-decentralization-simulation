import { useCallback, useEffect, useRef, useState } from 'react'
import type { TextAnchor } from '../types/anchors'

const MIN_SELECTION_LENGTH = 3
const MAX_SELECTION_LENGTH = 500
/** Delay before surfacing the annotation popover so Ctrl+C can fire first */
const POPOVER_DELAY_MS = 400

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
  const selectionSyncFrameRef = useRef<number | null>(null)
  const pointerSelectingRef = useRef(false)

  const resetSelectionState = useCallback(() => {
    setAnchor(null)
    setRect(null)
    rangeRef.current = null
  }, [])

  const clearSelection = useCallback(() => {
    resetSelectionState()
    window.getSelection()?.removeAllRanges()
  }, [resetSelectionState])

  const syncSelectionFromWindow = useCallback(() => {
    const container = containerRef.current
    const sel = window.getSelection()
    if (!container || !sel || sel.isCollapsed || !sel.rangeCount) return false

    const range = sel.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) return false

    const text = sel.toString().replace(/\s+/g, ' ').trim()
    if (text.length < MIN_SELECTION_LENGTH || text.length > MAX_SELECTION_LENGTH) return false

    const sectionId = findAncestorAttribute(range.commonAncestorContainer, 'data-section-id')
    const blockId = findAncestorAttribute(range.commonAncestorContainer, 'data-block-id')

    rangeRef.current = range.cloneRange()

    setAnchor({
      sectionId: sectionId ?? undefined,
      blockId: blockId ?? undefined,
      excerpt: text,
      viewMode,
    })
    setRect(range.getBoundingClientRect())
    return true
  }, [viewMode])

  const scheduleSelectionSync = useCallback((immediate = false) => {
    if (selectionSyncFrameRef.current !== null) {
      window.clearTimeout(selectionSyncFrameRef.current)
    }
    const delay = immediate ? 0 : POPOVER_DELAY_MS
    selectionSyncFrameRef.current = window.setTimeout(() => {
      selectionSyncFrameRef.current = null
      if (!syncSelectionFromWindow()) {
        resetSelectionState()
      }
    }, delay)
  }, [resetSelectionState, syncSelectionFromWindow])

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
  }, [anchor, clearSelection])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-annotation-popover]')) return
      pointerSelectingRef.current = true
      resetSelectionState()
    }

    const handlePointerUp = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-annotation-popover]')) {
        pointerSelectingRef.current = false
        return
      }
      pointerSelectingRef.current = false
      scheduleSelectionSync()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      // Skip popover trigger on copy shortcut
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') return
      scheduleSelectionSync()
    }

    const handleSelectionChange = () => {
      if (pointerSelectingRef.current) return
      if ((document.activeElement as HTMLElement | null)?.closest?.('[data-annotation-popover]')) return

      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        resetSelectionState()
        return
      }

      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        resetSelectionState()
        return
      }

      scheduleSelectionSync()
    }

    // Suppress popover when the user copies — let them copy in peace
    const handleCopy = () => {
      if (selectionSyncFrameRef.current !== null) {
        window.clearTimeout(selectionSyncFrameRef.current)
        selectionSyncFrameRef.current = null
      }
    }

    container.addEventListener('pointerdown', handlePointerDown)
    container.addEventListener('pointerup', handlePointerUp)
    container.addEventListener('keyup', handleKeyUp)
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('copy', handleCopy)

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown)
      container.removeEventListener('pointerup', handlePointerUp)
      container.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('copy', handleCopy)
      if (selectionSyncFrameRef.current !== null) {
        window.clearTimeout(selectionSyncFrameRef.current)
        selectionSyncFrameRef.current = null
      }
    }
  }, [resetSelectionState, scheduleSelectionSync])

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
