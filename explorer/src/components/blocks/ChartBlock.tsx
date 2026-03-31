import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BLOCK_COLORS, CHART, SPRING_CRISP } from '../../lib/theme'
import type { ChartBlock as ChartBlockType } from '../../types/blocks'

interface ChartBlockProps {
  block: ChartBlockType
}

export function ChartBlock({ block }: ChartBlockProps) {
  if (block.data.length === 0) {
    return <EmptyBlock title={block.title} />
  }

  const maxValue = Math.max(1, ...block.data.map(d => Math.abs(d.value)))
  const categoryColors = new Map<string, string>()
  let colorIndex = 0

  for (const datum of block.data) {
    if (!datum.category || categoryColors.has(datum.category)) continue
    categoryColors.set(datum.category, BLOCK_COLORS[colorIndex % BLOCK_COLORS.length])
    colorIndex += 1
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{block.data.length} points</span>
            {block.unit && <span className="font-mono text-2xs">{block.unit}</span>}
            {categoryColors.size > 0 && [...categoryColors.entries()].map(([category, color]) => (
              <span key={category} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {category}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {block.chartType === 'line' ? (
          <LineChart data={block.data} unit={block.unit} />
        ) : (
          <BarChart data={block.data} maxValue={maxValue} unit={block.unit} categoryColors={categoryColors} />
        )}
      </div>
    </div>
  )
}

function EmptyBlock({ title }: { readonly title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      </div>
      <div className="px-5 py-8 text-center text-xs text-muted">No data available</div>
    </div>
  )
}

function LineChart({ data, unit }: { data: ChartBlockType['data']; unit?: string }) {
  const gradientId = useId()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const padding = { top: 10, right: 40, bottom: 30, left: 10 }
  const width = 500
  const height = 160
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const maxY = Math.max(1, ...data.map(d => d.value))
  const minY = Math.min(0, ...data.map(d => d.value))
  const rangeY = maxY - minY || 1

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - ((d.value - minY) / rangeY) * chartH,
    label: d.label,
    value: d.value,
  }))

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  const baselineY = padding.top + chartH - ((Math.min(Math.max(0, minY), maxY) - minY) / rangeY) * chartH
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
    : ''
  const latestPoint = points[points.length - 1]
  const highestPoint = [...points].sort((left, right) => right.value - left.value)[0]
  const labelIndices = data.length <= 6
    ? new Set(data.map((_, index) => index))
    : new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])

  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div>
      <div className="rounded-lg border border-rule bg-surface-active p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full chart-edge-fade"
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            const relX = ((event.clientX - rect.left) / rect.width) * width
            /* Find the nearest point */
            let nearest = 0
            let bestDist = Infinity
            for (let i = 0; i < points.length; i++) {
              const dist = Math.abs(points[i].x - relX)
              if (dist < bestDist) { bestDist = dist; nearest = i }
            }
            setHoverIdx(nearest)
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor={BLOCK_COLORS[0]} stopOpacity={CHART.areaTopOpacity} />
              <stop offset="100%" stopColor={BLOCK_COLORS[0]} stopOpacity={CHART.areaBottomOpacity} />
            </linearGradient>
          </defs>

          {/* Grid lines — staggered entrance */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
            const y = padding.top + chartH * (1 - frac)
            return (
              <motion.line
                key={frac}
                x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                stroke="currentColor" strokeWidth={CHART.gridWidth} opacity={CHART.gridOpacity}
                initial={{ opacity: 0 }}
                animate={{ opacity: CHART.gridOpacity }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              />
            )
          })}

          <line x1={padding.left} y1={baselineY} x2={width - padding.right} y2={baselineY}
            stroke="currentColor" strokeWidth={0.8} opacity={0.1} />

          {areaD && (
            <motion.path d={areaD} fill={`url(#${gradientId})`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ ...SPRING_CRISP, delay: 0.12 }} />
          )}

          <motion.path d={pathD} fill="none" stroke={BLOCK_COLORS[0]} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={SPRING_CRISP} />

          {/* Crosshair */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x} y1={padding.top}
              x2={hoveredPoint.x} y2={padding.top + chartH}
              stroke="currentColor" strokeWidth={1} opacity={CHART.crosshairOpacity}
            />
          )}

          {points.map((p, i) => {
            const isLast = i === points.length - 1
            const isHovered = hoverIdx === i
            return (
              <g key={`${p.label}-${i}`}>
                <motion.circle
                  cx={p.x} cy={p.y}
                  r={isHovered ? 5 : (isLast ? 3.5 : 2)}
                  fill="white" stroke="#2563EB" strokeWidth={isHovered ? 2 : 1.5}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...SPRING_CRISP, delay: 0.2 + i * 0.02 }}
                />
                {labelIndices.has(i) && (
                  <text x={p.x} y={height - 5} textAnchor="middle"
                    className="fill-muted" style={{ fontSize: CHART.labelSize }}
                    fontFamily="var(--font-mono)">
                    {p.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Pulsing live dot at latest point */}
          {latestPoint && (
            <circle
              cx={latestPoint.x} cy={latestPoint.y}
              r={CHART.liveDotRadius}
              fill="none" stroke="#2563EB" strokeWidth={1.5} opacity={0.4}
              className="live-dot-pulse"
            />
          )}
        </svg>
      </div>

      {/* Hover tooltip — spring entrance */}
      <AnimatePresence>
        {hoveredPoint && (
          <motion.div
            className="mt-2 flex gap-4 text-xs text-muted"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={CHART.tooltipSpring}
          >
            <span>
              <span className="text-text-primary font-medium tabular-nums">{hoveredPoint.label}</span>
              {' '}{hoveredPoint.value}{unit ?? ''}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!hoveredPoint && (
        <div className="mt-2 flex gap-4 text-xs text-muted">
          {highestPoint && (
            <span>Peak: <span className="text-text-primary font-medium tabular-nums">{highestPoint.label} {highestPoint.value}{unit ?? ''}</span></span>
          )}
          {latestPoint && (
            <span>Latest: <span className="text-text-primary font-medium tabular-nums">{latestPoint.label} {latestPoint.value}{unit ?? ''}</span></span>
          )}
        </div>
      )}
    </div>
  )
}

function BarChart({
  data,
  maxValue,
  unit,
  categoryColors,
}: {
  data: ChartBlockType['data']
  maxValue: number
  unit?: string
  categoryColors: Map<string, string>
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const barColor = d.category
          ? (categoryColors.get(d.category) ?? BLOCK_COLORS[i % BLOCK_COLORS.length])
          : (d.value >= 0 ? BLOCK_COLORS[0] : BLOCK_COLORS[4])
        const isHovered = hoveredIndex === i
        const isDimmed = hoveredIndex !== null && !isHovered

        return (
          <motion.div
            key={`${d.label}-${i}`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: isDimmed ? 0.4 : 1, x: 0 }}
            transition={{ ...SPRING_CRISP, delay: i * 0.03 }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-text-primary truncate">{d.label}</span>
                {d.category && <span className="text-2xs text-muted">{d.category}</span>}
              </div>
              <span className="text-xs text-text-primary tabular-nums font-medium shrink-0">
                {d.value}{unit ?? ''}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-active">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(Math.abs(d.value) / maxValue) * 100}%` }}
                transition={{ ...SPRING_CRISP, delay: i * CHART.stagger }}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  backgroundColor: barColor,
                  boxShadow: isHovered ? `${CHART.hoverGlow} ${barColor}${CHART.hoverGlowOpacity}` : 'none',
                  transition: 'box-shadow 0.15s ease',
                }}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
