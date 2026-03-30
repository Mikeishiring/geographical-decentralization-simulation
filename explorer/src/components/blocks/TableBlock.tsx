import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { TableBlock as TableBlockType } from '../../types/blocks'

interface TableBlockProps {
  block: TableBlockType
}

export function TableBlock({ block }: TableBlockProps) {
  const highlightSet = new Set(block.highlight ?? [])
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)

  if (block.rows.length === 0 || block.headers.length === 0) {
    return (
      <div className="bg-white border border-border-subtle rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary mb-4">{block.title}</h3>
        <div className="text-center text-xs text-muted py-4">No data available</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-border-subtle rounded-xl p-5 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <h3 className="text-sm font-medium text-text-primary mb-4">
        {block.title}
      </h3>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F9F9F7]">
              {block.headers.map((header, i) => (
                <th
                  key={i}
                  className="text-left text-muted font-medium px-3 py-2 first:rounded-tl-md last:rounded-tr-md"
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
                  'border-t border-border-subtle transition-all',
                  highlightSet.has(rowIdx) && 'border-l-2 border-l-accent-warm',
                  hoveredRow === rowIdx && 'bg-accent/[0.03]',
                  hoveredRow !== null && hoveredRow !== rowIdx && 'opacity-50',
                )}
              >
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-3 py-2 text-text-body tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
