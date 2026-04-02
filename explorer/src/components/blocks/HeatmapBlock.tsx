import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CHART, SPRING_CRISP, SPRING_SOFT } from '../../lib/theme'
import { centerOutReveal } from '../../lib/chart-animations'
import type { HeatmapBlock as HeatmapBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'

interface HeatmapBlockProps {
  block: HeatmapBlockType
}

function sequentialColor(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : (value - min) / (max - min)
  // Interpolate from light blue (37,150,235) → deep blue (37,99,235)
  const r = 37
  const g = Math.round(150 - t * 51)
  const b = 235
  const opacity = 0.08 + t * 0.82
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function divergingColor(value: number, min: number, max: number): string {
  const mid = (min + max) / 2
  if (value <= mid) {
    const t = mid === min ? 0 : (mid - value) / (mid - min)
    return `rgba(220, 38, 38, ${0.05 + t * 0.75})`
  }
  const t = max === mid ? 0 : (value - mid) / (max - mid)
  return `rgba(37, 99, 235, ${0.05 + t * 0.75})`
}

export function HeatmapBlock({ block }: HeatmapBlockProps) {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)

  if (block.rows.length === 0 || block.columns.length === 0) {
    return <BlockEmptyState title={block.title} message="No row or column matrix was attached to this heatmap." />
  }

  const allValues = block.values.flat()
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const colorFn = block.colorScale === 'diverging' ? divergingColor : sequentialColor
  const totalCells = block.rows.length * block.columns.length

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{block.rows.length} × {block.columns.length}</span>
            {block.unit && <span className="font-mono text-2xs">{block.unit}</span>}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-1" />
              {block.columns.map(col => (
                <th key={col} className="p-1 text-2xs font-medium text-muted text-center whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIdx) => (
              <tr key={row}>
                <td className="p-1 text-2xs font-medium text-muted whitespace-nowrap text-right pr-2">
                  {row}
                </td>
                {block.columns.map((_, colIdx) => {
                  const value = block.values[rowIdx]?.[colIdx] ?? 0
                  const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx
                  const isInRow = hoveredCell?.row === rowIdx
                  const isInCol = hoveredCell?.col === colIdx
                  /* Center-out entrance for heatmap cells */
                  const flatIdx = rowIdx * block.columns.length + colIdx
                  const revealFactor = centerOutReveal(flatIdx, totalCells, 1)
                  const delay = (1 - revealFactor) * 0.2

                  return (
                    <td key={colIdx} className="p-0.5">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...SPRING_SOFT, delay }}
                        className="heatmap-cell-bloom relative flex items-center justify-center rounded-sm"
                        style={{
                          backgroundColor: colorFn(value, minVal, maxVal),
                          minWidth: 32,
                          minHeight: 28,
                          /* Highlight row/column intersection */
                          outline: isHovered
                            ? '2px solid rgba(37,99,235,0.5)'
                            : (isInRow || isInCol)
                              ? '1px solid rgba(37,99,235,0.15)'
                              : 'none',
                          outlineOffset: isHovered ? 0 : -1,
                        }}
                        onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <span className="text-[0.5625rem] tabular-nums font-medium text-text-primary/80">
                          {value.toFixed(value % 1 === 0 ? 0 : 2)}
                        </span>
                      </motion.div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Hover readout — spring entrance */}
        <AnimatePresence>
          {hoveredCell && (
            <motion.div
              className="mt-2 text-xs text-muted"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 2 }}
              transition={CHART.tooltipSpring}
            >
              <span className="text-text-primary font-medium">
                {block.rows[hoveredCell.row]} × {block.columns[hoveredCell.col]}
              </span>
              {' = '}
              <span className="text-text-primary font-medium tabular-nums">
                {block.values[hoveredCell.row]?.[hoveredCell.col]?.toFixed(3) ?? '—'}
              </span>
              {block.unit && ` ${block.unit}`}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-2xs text-muted">Low</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden flex">
            {Array.from({ length: 20 }, (_, i) => {
              const t = i / 19
              const val = minVal + t * (maxVal - minVal)
              return (
                <motion.div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: colorFn(val, minVal, maxVal) }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ ...SPRING_CRISP, delay: i * 0.02 }}
                />
              )
            })}
          </div>
          <span className="text-2xs text-muted">High</span>
        </div>
      </div>
    </div>
  )
}
