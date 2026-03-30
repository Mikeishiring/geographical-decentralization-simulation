import { useState } from 'react'
import { motion } from 'framer-motion'
import { BLOCK_COLORS, CHART, SPRING_CRISP } from '../../lib/theme'
import type { StackedBarBlock as StackedBarBlockType } from '../../types/blocks'

interface StackedBarBlockProps {
  block: StackedBarBlockType
}

export function StackedBarBlock({ block }: StackedBarBlockProps) {
  const [hoveredBar, setHoveredBar] = useState<{ catIdx: number; seriesIdx: number } | null>(null)

  if (block.categories.length === 0 || block.series.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-5 py-3">
          <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        </div>
        <div className="px-5 py-8 text-center text-xs text-muted">No data available</div>
      </div>
    )
  }

  const totals = block.categories.map((_, catIdx) =>
    block.series.reduce((sum, s) => sum + (s.values[catIdx] ?? 0), 0),
  )
  const maxTotal = Math.max(1, ...totals)

  const seriesColors = block.series.map((s, i) =>
    s.color ?? BLOCK_COLORS[i % BLOCK_COLORS.length],
  )

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {block.unit && <span className="font-mono text-[0.625rem]">{block.unit}</span>}
            {block.series.map((s, i) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seriesColors[i] }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {block.categories.map((category, catIdx) => {
          const total = totals[catIdx]

          return (
            <div key={category}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-xs text-text-primary truncate">{category}</span>
                <span className="text-xs text-text-primary tabular-nums font-medium shrink-0">
                  {total}{block.unit ? ` ${block.unit}` : ''}
                </span>
              </div>
              <div className="relative h-5 overflow-hidden rounded-full bg-surface-active flex">
                {block.series.map((series, seriesIdx) => {
                  const value = series.values[catIdx] ?? 0
                  const widthPct = (value / maxTotal) * 100
                  const isHovered = hoveredBar?.catIdx === catIdx && hoveredBar?.seriesIdx === seriesIdx

                  return (
                    <motion.div
                      key={series.label}
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ ...SPRING_CRISP, delay: catIdx * CHART.stagger + seriesIdx * 0.02 }}
                      className="h-full transition-opacity relative"
                      style={{
                        backgroundColor: seriesColors[seriesIdx],
                        opacity: hoveredBar !== null && !isHovered ? 0.4 : (isHovered ? 1 : 0.85),
                      }}
                      onMouseEnter={() => setHoveredBar({ catIdx, seriesIdx })}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {isHovered && (
                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
                          <div className="rounded-lg border border-rule bg-white px-2.5 py-1.5 text-[0.6875rem]" style={{ boxShadow: CHART.tooltipShadow }}>
                            <span className="text-muted">{series.label}</span>{' '}
                            <span className="font-semibold tabular-nums text-text-primary">{value}{block.unit ? ` ${block.unit}` : ''}</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
