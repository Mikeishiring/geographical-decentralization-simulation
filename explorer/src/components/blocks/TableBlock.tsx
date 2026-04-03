import { useState } from 'react'
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

  if (block.rows.length === 0 || block.headers.length === 0) {
    return <BlockEmptyState title={block.title} message="No headers or rows were attached to this table." />
  }

  const inspectedRow = hoveredRow !== null ? block.rows[hoveredRow] ?? null : null
  const inspectedPairs = inspectedRow
    ? block.headers.map((header, index) => ({
        label: header,
        value: inspectedRow[index] ?? '—',
      }))
    : []

  return (
    <motion.div
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
                onMouseEnter={() => setHoveredRow(rowIdx)}
                onMouseLeave={() => setHoveredRow(null)}
                className={cn(
                  'item-separator transition-all',
                  highlightSet.has(rowIdx) && 'border-l-2 border-l-accent-warm',
                  hoveredRow === rowIdx && 'bg-accent/[0.02]',
                  hoveredRow !== null && hoveredRow !== rowIdx && 'opacity-40',
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
          <InteractiveInspector
            eyebrow="Row inspection"
            title={inspectedRow[0] ?? `Row ${hoveredRow! + 1}`}
            subtitle={
              inspectedPairs.length > 4
                ? `Inspecting ${inspectedPairs.length} columns. Showing the first four here.`
                : 'Hover across the table to inspect a full row without losing the ranking context.'
            }
            hint={highlightSet.has(hoveredRow!) ? 'Highlighted row' : 'Table row'}
            metrics={inspectedPairs.slice(0, 4).map(pair => ({
              label: pair.label,
              value: pair.value,
              tone: pair.label === block.headers[0] ? 'accent' : 'default',
            }))}
            className="mt-4"
          />
        ) : (
          <motion.div
            key="table-hint"
            className="mt-4 text-xs text-muted"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={SPRING_CRISP}
          >
            Hover a row to inspect its values without leaving the table.
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
