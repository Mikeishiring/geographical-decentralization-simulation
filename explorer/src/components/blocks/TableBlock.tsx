import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'
import type { TableBlock as TableBlockType } from '../../types/blocks'
import { CiteBadge } from './CiteBadge'

interface TableBlockProps {
  block: TableBlockType
}

export function TableBlock({ block }: TableBlockProps) {
  const highlightSet = new Set(block.highlight ?? [])
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)

  if (block.rows.length === 0 || block.headers.length === 0) {
    return (
      <div className="bg-white border border-rule rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary mb-4">{block.title}</h3>
        <div className="text-center text-xs text-muted py-4">No data available</div>
      </div>
    )
  }

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
      {block.cite && (
        <div className="mt-3 pt-2 border-t border-rule/50">
          <CiteBadge cite={block.cite} />
        </div>
      )}
    </motion.div>
  )
}
