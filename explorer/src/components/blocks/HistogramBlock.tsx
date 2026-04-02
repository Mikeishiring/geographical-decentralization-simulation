import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BLOCK_COLORS, CHART, SPRING_SNAPPY } from '../../lib/theme'
import { centerOutReveal } from '../../lib/chart-animations'
import type { HistogramBlock as HistogramBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'

interface HistogramBlockProps {
  block: HistogramBlockType
}

export function HistogramBlock({ block }: HistogramBlockProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (block.bins.length === 0) {
    return <BlockEmptyState title={block.title} message="No histogram bins were attached to this block." />
  }

  const maxCount = Math.max(1, ...block.bins.map(b => b.count))

  const categoryColors = new Map<string, string>()
  let colorIndex = 0
  for (const bin of block.bins) {
    if (!bin.category || categoryColors.has(bin.category)) continue
    categoryColors.set(bin.category, BLOCK_COLORS[colorIndex % BLOCK_COLORS.length])
    colorIndex += 1
  }

  const hoveredBin = hoveredIndex !== null ? block.bins[hoveredIndex] : null

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{block.bins.length} bins</span>
            {block.unit && <span className="font-mono text-2xs">{block.unit}</span>}
            {[...categoryColors.entries()].map(([cat, color]) => (
              <span key={cat} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative px-5 py-4">
        <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
          {block.bins.map((bin, i) => {
            const barColor = bin.category
              ? (categoryColors.get(bin.category) ?? BLOCK_COLORS[0])
              : BLOCK_COLORS[0]
            const heightPct = (bin.count / maxCount) * 100
            const isHovered = hoveredIndex === i
            /* Center-out entrance — center bars appear first */
            const revealFactor = centerOutReveal(i, block.bins.length, 1)
            const delay = (1 - revealFactor) * 0.3

            return (
              <div
                key={i}
                className="relative flex-1 flex flex-col justify-end"
                style={{ height: '100%' }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: `${heightPct}%`, opacity: isHovered ? 1 : 0.8 }}
                  transition={{ ...SPRING_SNAPPY, delay }}
                  className="rounded-t"
                  style={{
                    backgroundColor: barColor,
                    boxShadow: isHovered
                      ? `${CHART.hoverGlow} ${barColor}${CHART.hoverGlowOpacity}`
                      : 'none',
                    transition: 'box-shadow 0.15s ease',
                  }}
                />
              </div>
            )
          })}
        </div>

        <div className="mt-2 flex gap-[2px]">
          {block.bins.map((bin, i) => (
            <div key={i} className="flex-1 text-center">
              <span className="text-[0.5625rem] text-muted leading-tight block truncate">
                {bin.range}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-3 text-xs text-muted">
          <span>Total: <span className="text-text-primary font-medium tabular-nums">
            {block.bins.reduce((sum, b) => sum + b.count, 0)}
          </span></span>
          <span>Max bin: <span className="text-text-primary font-medium tabular-nums">
            {maxCount}
          </span></span>
        </div>

        {/* Floating tooltip — spring entrance with overshoot */}
        <AnimatePresence>
          {hoveredBin && hoveredIndex !== null && (
            <motion.div
              className="pointer-events-none absolute z-20"
              style={{
                left: `${((hoveredIndex + 0.5) / block.bins.length) * 100}%`,
                top: 0,
              }}
              initial={{ opacity: 0, scale: 0.92, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: -4 }}
              exit={{ opacity: 0, scale: 0.95, y: 0 }}
              transition={CHART.tooltipSpring}
            >
              <div
                className="rounded-lg border border-rule bg-white px-3 py-2 -translate-x-1/2"
                style={{ boxShadow: `${CHART.tooltipShadow}, 0 0 0 1px rgba(37,99,235,0.06)` }}
              >
                <div className="text-11 font-medium text-text-primary">{hoveredBin.range}</div>
                <div className="mt-0.5 text-13 font-semibold tabular-nums text-text-primary">
                  {hoveredBin.count}{block.unit ? ` ${block.unit}` : ''}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
