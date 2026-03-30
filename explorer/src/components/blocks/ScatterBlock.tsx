import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { BLOCK_COLORS, SPRING_SOFT } from '../../lib/theme'
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

      <div className="px-5 py-4">
        <div className="rounded-lg border border-rule bg-surface-active p-3">
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id={gradientId}>
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {yTicks.map(tick => {
              const { sy } = toSvg(0, tick)
              return (
                <g key={tick}>
                  <line x1={padding.left} y1={sy} x2={svgW - padding.right} y2={sy}
                    stroke="var(--color-rule)" strokeWidth={0.5} />
                  <text x={padding.left - 6} y={sy + 3} textAnchor="end"
                    className="fill-muted text-[9px]">
                    {Number.isInteger(tick) ? tick : tick.toFixed(2)}
                  </text>
                </g>
              )
            })}

            {xTicks.map((tick, i) => {
              const { sx } = toSvg(tick, 0)
              return (
                <text key={`x-${i}`} x={sx} y={svgH - 8} textAnchor="middle"
                  className="fill-muted text-[9px]">
                  {Number.isInteger(tick) ? tick : tick.toFixed(2)}
                </text>
              )
            })}

            {block.xLabel && (
              <text x={padding.left + chartW / 2} y={svgH - 2} textAnchor="middle"
                className="fill-muted text-[9px]">{block.xLabel}</text>
            )}
            {block.yLabel && (
              <text x={12} y={padding.top + chartH / 2} textAnchor="middle"
                className="fill-muted text-[9px]"
                transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}>{block.yLabel}</text>
            )}

            {block.points.map((point, i) => {
              const { sx, sy } = toSvg(point.x, point.y)
              const color = point.category
                ? (categoryColors.get(point.category) ?? BLOCK_COLORS[0])
                : BLOCK_COLORS[0]
              const isHovered = hoveredIndex === i

              return (
                <g key={i}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <motion.circle
                    cx={sx} cy={sy}
                    r={isHovered ? 6 : 4}
                    fill={color}
                    opacity={isHovered ? 1 : 0.7}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_SOFT, delay: i * 0.01 }}
                    style={{ cursor: 'pointer' }}
                  />
                  {isHovered && point.label && (
                    <text x={sx} y={sy - 10} textAnchor="middle"
                      className="fill-text-primary text-[9px] font-medium">
                      {point.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {hoveredIndex !== null && (
          <div className="mt-2 text-xs text-muted">
            <span className="text-text-primary font-medium tabular-nums">
              ({block.points[hoveredIndex].x.toFixed(2)}, {block.points[hoveredIndex].y.toFixed(2)})
            </span>
            {block.points[hoveredIndex].label && (
              <span className="ml-2">{block.points[hoveredIndex].label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
