import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'
import type { TableBlock as TableBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'
import { CiteBadge } from './CiteBadge'
import { InteractiveInspector } from '../ui/InteractiveInspector'

interface TableBlockProps {
  block: TableBlockType
}

export function TableBlock({ block }: TableBlockProps) {
  const highlightSet = new Set(block.highlight ?? [])
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [pinnedRow, setPinnedRow] = useState<number | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const cancelClear = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
  }, [])

  const scheduleClear = useCallback(() => {
    cancelClear()
    clearTimerRef.current = setTimeout(() => setHoveredRow(null), 200)
  }, [cancelClear])

  useEffect(() => () => cancelClear(), [cancelClear])

  /* Dismiss pinned row on outside click */
  useEffect(() => {
    if (pinnedRow === null) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinnedRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pinnedRow])

  const activeRow = pinnedRow ?? hoveredRow

  if (block.rows.length === 0 || block.headers.length === 0) {
    return <BlockEmptyState title={block.title} message="No headers or rows were attached to this table." />
  }

  const inspectedRow = activeRow !== null ? block.rows[activeRow] ?? null : null
  const inspectedPairs = inspectedRow
    ? block.headers.map((header, index) => ({
        label: header,
        value: inspectedRow[index] ?? '—',
      }))
    : []

  return (
    <motion.div
      ref={containerRef}
      className="bg-white border border-rule rounded-xl p-5 card-hover"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <h3 className="text-sm font-medium text-text-primary mb-4">
        {block.title}
      </h3>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {block.headers.map((header, i) => (
                <th
                  key={i}
                  className="text-left text-11 text-text-faint font-normal uppercase tracking-[0.06em] px-3 py-2 border-b border-rule"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                onMouseEnter={() => { cancelClear(); setHoveredRow(rowIdx) }}
                onMouseLeave={scheduleClear}
                onClick={() => setPinnedRow(prev => prev === rowIdx ? null : rowIdx)}
                className={cn(
                  'item-separator transition-all cursor-pointer',
                  highlightSet.has(rowIdx) && 'border-l-2 border-l-accent-warm',
                  activeRow === rowIdx && 'bg-accent/[0.02]',
                  activeRow !== null && activeRow !== rowIdx && 'opacity-40',
                  pinnedRow === rowIdx && 'ring-1 ring-accent/20 bg-accent/[0.04]',
                )}
              >
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-3 py-2.5 text-text-body tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence initial={false}>
        {inspectedRow ? (
          <div
            onMouseEnter={cancelClear}
            onMouseLeave={scheduleClear}
          >
            <InteractiveInspector
              eyebrow="Row inspection"
              title={inspectedRow[0] ?? `Row ${activeRow! + 1}`}
              subtitle={
                pinnedRow !== null
                  ? 'Click the row again or outside the table to dismiss.'
                  : inspectedPairs.length > 4
                    ? `Inspecting ${inspectedPairs.length} columns. Click the row to pin this view.`
                    : 'Hover across the table to inspect a full row. Click to pin.'
              }
              hint={
                pinnedRow !== null
                  ? 'Pinned'
                  : highlightSet.has(activeRow!)
                    ? 'Highlighted row'
                    : 'Table row'
              }
              metrics={inspectedPairs.slice(0, 4).map(pair => ({
                label: pair.label,
                value: pair.value,
                tone: pair.label === block.headers[0] ? 'accent' : 'default',
              }))}
              className="mt-4"
            />
          </div>
        ) : (
          <motion.div
            key="table-hint"
            className="mt-4 text-xs text-muted"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={SPRING_CRISP}
          >
            Hover a row to inspect its values. Click to pin.
          </motion.div>
        )}
      </AnimatePresence>

      {block.cite && (
        <div className="mt-3 pt-2 border-t border-rule/50">
          <CiteBadge cite={block.cite} />
        </div>
      )}
    </motion.div>
  )
}
