import { useState } from 'react'
import { motion } from 'framer-motion'
import { BLOCK_COLORS, CHART, SPRING_CRISP } from '../../lib/theme'
import type { HistogramBlock as HistogramBlockType } from '../../types/blocks'

interface HistogramBlockProps {
  block: HistogramBlockType
}

export function HistogramBlock({ block }: HistogramBlockProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (block.bins.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-5 py-3">
          <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        </div>
        <div className="px-5 py-8 text-center text-xs text-muted">No data available</div>
      </div>
    )
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
            {block.unit && <span className="font-mono text-[0.625rem]">{block.unit}</span>}
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

            return (
              <div
                key={i}
                className="relative flex-1 flex flex-col justify-end"
                style={{ height: '100%' }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPct}%` }}
                  transition={{ ...SPRING_CRISP, delay: i * CHART.stagger }}
                  className="rounded-t transition-shadow"
                  style={{
                    backgroundColor: barColor,
                    opacity: isHovered ? 1 : 0.8,
                    boxShadow: isHovered ? `0 0 10px ${barColor}40` : 'none',
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

        {/* Floating tooltip card */}
        {hoveredBin && hoveredIndex !== null && (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: `${((hoveredIndex + 0.5) / block.bins.length) * 100}%`,
              top: 0,
              transform: 'translate(-50%, -4px)',
            }}
          >
            <div
              className="rounded-lg border border-rule bg-white px-3 py-2"
              style={{ boxShadow: CHART.tooltipShadow }}
            >
              <div className="text-[0.6875rem] font-medium text-text-primary">{hoveredBin.range}</div>
              <div className="mt-0.5 text-[0.8125rem] font-semibold tabular-nums text-text-primary">
                {hoveredBin.count}{block.unit ? ` ${block.unit}` : ''}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
