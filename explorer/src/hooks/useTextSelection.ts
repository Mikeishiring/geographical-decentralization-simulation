import { useCallback, useEffect, useRef, useState } from 'react'
import type { TextAnchor } from '../types/anchors'

interface SelectionState {
  readonly anchor: TextAnchor
  readonly rect: DOMRect
}

/**
 * Watches for text selections within a container element and returns
 * a TextAnchor with the selected excerpt and nearest section context.
 */
export function useTextSelection(viewMode?: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<SelectionState | null>(null)

  const clearSelection = useCallback(() => {
    setSelection(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseUp = () => {
      // Small delay to let browser finalize the selection
      window.requestAnimationFrame(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          setSelection(null)
          return
        }

        const text = sel.toString().trim()
        if (text.length < 3 || text.length > 500) {
          setSelection(null)
          return
        }

        const range = sel.getRangeAt(0)

        // Check that selection is within our container
        if (!container.contains(range.commonAncestorContainer)) {
          setSelection(null)
          return
        }

        // Walk up from the selection to find the nearest data-section-id
        const sectionId = findAncestorAttribute(range.commonAncestorContainer, 'data-section-id')
        const blockId = findAncestorAttribute(range.commonAncestorContainer, 'data-block-id')

        const rect = range.getBoundingClientRect()

        setSelection({
          anchor: {
            sectionId: sectionId ?? undefined,
            blockId: blockId ?? undefined,
            excerpt: text,
            viewMode,
          },
          rect,
        })
      })
    }

    const handleMouseDown = () => {
      // Clear on new mouse down to reset stale selections
      setSelection(null)
    }

    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mousedown', handleMouseDown)

    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mousedown', handleMouseDown)
    }
  }, [viewMode])

  return {
    containerRef,
    selection: selection?.anchor ?? null,
    selectionRect: selection?.rect ?? null,
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
