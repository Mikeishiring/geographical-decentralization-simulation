import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BLOCK_COLORS, CHART, SPRING_CRISP } from '../../lib/theme'
import { centerOutReveal } from '../../lib/chart-animations'
import type { ScatterBlock as ScatterBlockType } from '../../types/blocks'

interface ScatterBlockProps {
  block: ScatterBlockType
}

export function ScatterBlock({ block }: ScatterBlockProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const gradientId = useId()

  if (block.points.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-5 py-3">
          <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        </div>
        <div className="px-5 py-8 text-center text-xs text-muted">No data available</div>
      </div>
    )
  }

  const padding = { top: 20, right: 50, bottom: 40, left: 50 }
  const svgW = 500
  const svgH = 300
  const chartW = svgW - padding.left - padding.right
  const chartH = svgH - padding.top - padding.bottom

  const xs = block.points.map(p => p.x)
  const ys = block.points.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  const categoryColors = new Map<string, string>()
  let colorIndex = 0
  for (const point of block.points) {
    if (!point.category || categoryColors.has(point.category)) continue
    categoryColors.set(point.category, BLOCK_COLORS[colorIndex % BLOCK_COLORS.length])
    colorIndex += 1
  }

  function toSvg(x: number, y: number) {
    return {
      sx: padding.left + ((x - minX) / rangeX) * chartW,
      sy: padding.top + chartH - ((y - minY) / rangeY) * chartH,
    }
  }

  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (rangeY * i) / 4)
  const xTicks = Array.from({ length: 5 }, (_, i) => minX + (rangeX * i) / 4)

  const hoveredPoint = hoveredIndex !== null ? block.points[hoveredIndex] : null
  const hoveredSvg = hoveredPoint ? toSvg(hoveredPoint.x, hoveredPoint.y) : null

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{block.points.length} points</span>
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
        <div className="rounded-lg border border-rule bg-surface-active p-3">
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id={gradientId}>
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Grid — staggered entrance */}
            {yTicks.map((tick, idx) => {
              const { sy } = toSvg(0, tick)
              return (
                <motion.g
                  key={tick}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                >
                  <line x1={padding.left} y1={sy} x2={svgW - padding.right} y2={sy}
                    stroke="currentColor" strokeWidth={CHART.gridWidth} opacity={CHART.gridOpacity} />
                  <text x={padding.left - 6} y={sy + 3} textAnchor="end"
                    className="fill-muted" style={{ fontSize: CHART.labelSize }}>
                    {Number.isInteger(tick) ? tick : tick.toFixed(2)}
                  </text>
                </motion.g>
              )
            })}

            {xTicks.map((tick, i) => {
              const { sx } = toSvg(tick, 0)
              return (
                <motion.text
                  key={`x-${i}`} x={sx} y={svgH - 8} textAnchor="middle"
                  className="fill-muted" style={{ fontSize: CHART.labelSize }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.2 + i * 0.04 }}
                >
                  {Number.isInteger(tick) ? tick : tick.toFixed(2)}
                </motion.text>
              )
            })}

            {block.xLabel && (
              <text x={padding.left + chartW / 2} y={svgH - 2} textAnchor="middle"
                className="fill-muted" style={{ fontSize: CHART.labelSize }}>{block.xLabel}</text>
            )}
            {block.yLabel && (
              <text x={12} y={padding.top + chartH / 2} textAnchor="middle"
                className="fill-muted" style={{ fontSize: CHART.labelSize }}
                transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}>{block.yLabel}</text>
            )}

            {block.points.map((point, i) => {
              const { sx, sy } = toSvg(point.x, point.y)
              const color = point.category
                ? (categoryColors.get(point.category) ?? BLOCK_COLORS[0])
                : BLOCK_COLORS[0]
              const isHovered = hoveredIndex === i
              /* Center-out entrance — points near center of scatter appear first */
              const revealFactor = centerOutReveal(i, block.points.length, 1)
              const delay = (1 - revealFactor) * 0.25

              return (
                <g key={i}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Radial halo on hover — liveline-inspired glow */}
                  {isHovered && (
                    <motion.circle
                      cx={sx} cy={sy} r={16}
                      fill={color} opacity={0.12}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={CHART.tooltipSpring}
                    />
                  )}
                  <motion.circle
                    cx={sx} cy={sy}
                    r={isHovered ? 6 : 4}
                    fill={color}
                    opacity={isHovered ? 1 : 0.7}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: isHovered ? 1 : 0.7 }}
                    transition={{ ...SPRING_CRISP, delay }}
                    style={{ cursor: 'pointer' }}
                  />
                  {/* White ring on hover */}
                  {isHovered && (
                    <motion.circle
                      cx={sx} cy={sy} r={8}
                      fill="none" stroke={color} strokeWidth={1.5} opacity={0.3}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={CHART.tooltipSpring}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Floating tooltip — spring entrance with overshoot */}
        <AnimatePresence>
          {hoveredPoint && hoveredSvg && (
            <motion.div
              className="pointer-events-none absolute z-20"
              style={{
                left: `${(hoveredSvg.sx / svgW) * 100}%`,
                top: `${((hoveredSvg.sy / svgH) * 100) - 2}%`,
              }}
              initial={{
                opacity: 0,
                scale: 0.92,
                x: hoveredSvg.sx > svgW * 0.65 ? '-100%' : 12,
                y: '-100%',
              }}
              animate={{
                opacity: 1,
                scale: 1,
                x: hoveredSvg.sx > svgW * 0.65 ? '-100%' : 12,
                y: '-100%',
              }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={CHART.tooltipSpring}
            >
              <div
                className="rounded-lg border border-rule bg-white px-3 py-2"
                style={{ boxShadow: `${CHART.tooltipShadow}, 0 0 0 1px rgba(37,99,235,0.06)` }}
              >
                {hoveredPoint.label && (
                  <div className="text-11 font-medium text-text-primary">{hoveredPoint.label}</div>
                )}
                <div className="mt-0.5 text-[0.75rem] font-semibold tabular-nums text-text-primary">
                  ({hoveredPoint.x.toFixed(2)}, {hoveredPoint.y.toFixed(2)})
                </div>
                {hoveredPoint.category && (
                  <div className="mt-0.5 text-2xs text-muted">{hoveredPoint.category}</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
