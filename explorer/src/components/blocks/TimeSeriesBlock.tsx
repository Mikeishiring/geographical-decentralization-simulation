import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BLOCK_COLORS, CHART, INTENT_COLORS, SPRING_CRISP } from '../../lib/theme'
import { crosshairFadeNearLive } from '../../lib/chart-animations'
import type { TimeSeriesBlock as TimeSeriesBlockType } from '../../types/blocks'

interface TimeSeriesBlockProps {
  block: TimeSeriesBlockType
  notePins?: ReadonlyArray<{
    id: string
    label: string
    x: number
    y: number
    intent: 'observation' | 'question' | 'theory' | 'methods'
    active?: boolean
    onSelect?: () => void
  }>
}

function formatSeriesNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function notePinColor(intent: 'observation' | 'question' | 'theory' | 'methods'): string {
  if (intent === 'question') return INTENT_COLORS.warn
  if (intent === 'theory') return INTENT_COLORS.info
  if (intent === 'methods') return INTENT_COLORS.safe
  return INTENT_COLORS.highlight
}

export function TimeSeriesBlock({ block, notePins = [] }: TimeSeriesBlockProps) {
  const [hover, setHover] = useState<{ x: number; svgX: number; svgY: number } | null>(null)
  const gradientBaseId = useId().replace(/:/g, '')

  const padding = { top: 20, right: 60, bottom: 35, left: 45 }
  const svgW = 600
  const svgH = 240
  const chartW = svgW - padding.left - padding.right
  const chartH = svgH - padding.top - padding.bottom

  const allPoints = block.series.flatMap(series => series.data)
  if (allPoints.length === 0) {
    return (
      <div className="lab-panel rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        <p className="mt-3 text-sm text-muted">No time series data to display.</p>
      </div>
    )
  }

  const minX = Math.min(...allPoints.map(point => point.x))
  const maxX = Math.max(...allPoints.map(point => point.x))
  const minY = Math.min(...allPoints.map(point => point.y))
  const maxY = Math.max(...allPoints.map(point => point.y))
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const seriesSnapshots = block.series.flatMap((series, index) => {
    const first = series.data[0]
    const latestPt = series.data[series.data.length - 1]
    if (!first || !latestPt) return []
    return [{
      label: series.label,
      color: series.color ?? BLOCK_COLORS[index % BLOCK_COLORS.length],
      first: first.y,
      latest: latestPt.y,
      peak: Math.max(...series.data.map(point => point.y)),
      delta: latestPt.y - first.y,
    }]
  })
  const highestValue = Math.max(...allPoints.map(point => point.y))
  const pointStep = Math.max(1, Math.floor(Math.max(...block.series.map(series => series.data.length)) / 18))
  const hoverReadout = hover
    ? block.series.flatMap((series, index) => {
        const nearest = series.data.reduce((best, point) => {
          if (best === null) return point
          return Math.abs(point.x - hover.x) < Math.abs(best.x - hover.x) ? point : best
        }, null as TimeSeriesBlockType['series'][number]['data'][number] | null)
        if (!nearest) return []
        return [{
          label: series.label,
          value: nearest.y,
          x: nearest.x,
          color: series.color ?? BLOCK_COLORS[index % BLOCK_COLORS.length],
        }]
      })
    : []
  const hoverSlot = hoverReadout[0]?.x ?? null

  function toSvg(x: number, y: number) {
    return {
      sx: padding.left + ((x - minX) / rangeX) * chartW,
      sy: padding.top + chartH - ((y - minY) / rangeY) * chartH,
    }
  }

  const yTicks = Array.from({ length: 5 }, (_, index) => minY + (rangeY * index) / 4)
  const xTicks = Array.from({ length: 5 }, (_, index) => Math.round(minX + (rangeX * index) / 4))

  /* Tooltip position: anchor near the first series' hovered point, flip if near right edge */
  const tooltipAnchor = hover && hoverReadout.length > 0
    ? (() => {
        const nearest = block.series[0]?.data.reduce((best, point) => {
          if (best === null) return point
          return Math.abs(point.x - hover.x) < Math.abs(best.x - hover.x) ? point : best
        }, null as TimeSeriesBlockType['series'][number]['data'][number] | null)
        if (!nearest) return null
        const { sx, sy } = toSvg(nearest.x, nearest.y)
        const flipX = sx > svgW * 0.65
        return { sx, sy, flipX }
      })()
    : null

  /* Liveline-inspired: compute crosshair opacity that fades near the latest data point */
  const latestSvgX = toSvg(maxX, 0).sx
  const crosshairOpacity = hover
    ? CHART.crosshairOpacity * crosshairFadeNearLive(hover.svgX, latestSvgX, CHART.crosshairFadeDistance)
    : 0

  return (
    <div className="lab-panel overflow-hidden rounded-xl">
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              {block.title}
            </h3>
            <p className="mt-1 text-xs text-muted">
              Hover the chart to inspect exact readings at any point.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="lab-chip">
              range {formatSeriesNumber(minY)} to {formatSeriesNumber(maxY)}
            </span>
            <span className="lab-chip">
              peak {formatSeriesNumber(highestValue)}
            </span>
            {block.series.map((series, index) => {
              const latest = series.data[series.data.length - 1]
              const color = series.color ?? BLOCK_COLORS[index % BLOCK_COLORS.length]
              return (
                <span
                  key={series.label}
                  className="lab-chip"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {series.label}
                  {latest && (
                    <span className="font-medium tabular-nums text-text-primary">
                      {formatSeriesNumber(latest.y)}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {seriesSnapshots.map(snapshot => (
          <div
            key={`snapshot-${snapshot.label}`}
            className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-rule bg-white px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: snapshot.color }} />
              <span className="text-xs font-medium text-text-primary">{snapshot.label}</span>
              <span className="text-sm font-semibold tabular-nums text-text-primary">{formatSeriesNumber(snapshot.latest)}</span>
            </div>
            <div className="flex items-center gap-3 text-11">
              <span className="text-text-faint">Start <span className="font-medium tabular-nums text-text-primary">{formatSeriesNumber(snapshot.first)}</span></span>
              <span className="text-text-faint">Peak <span className="font-medium tabular-nums text-text-primary">{formatSeriesNumber(snapshot.peak)}</span></span>
              <span className="text-text-faint">Delta <span className="font-medium tabular-nums text-text-primary">{formatSeriesNumber(snapshot.delta)}</span></span>
            </div>
          </div>
        ))}

        <div className="relative rounded-xl border border-rule bg-white px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-11 uppercase tracking-[0.1em] text-text-faint">
                Measurement deck
              </span>
              {hoverSlot != null && (
                <span className="text-11 font-medium tabular-nums text-text-primary">
                  Slot {hoverSlot}
                  {hoverReadout.map(point => (
                    <span key={point.label} className="ml-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: point.color }} />
                      {' '}{formatSeriesNumber(point.value)}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="text-11 text-muted tabular-nums">
              {block.series.length} series · x {formatSeriesNumber(minX)} to {formatSeriesNumber(maxX)}
            </div>
          </div>
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full chart-edge-fade"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={event => {
              const rect = event.currentTarget.getBoundingClientRect()
              const relX = ((event.clientX - rect.left) / rect.width) * svgW
              const relY = ((event.clientY - rect.top) / rect.height) * svgH
              if (relX >= padding.left && relX <= svgW - padding.right) {
                setHover({ x: minX + ((relX - padding.left) / chartW) * rangeX, svgX: relX, svgY: relY })
              }
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              {block.series.map((series, index) => {
                const color = series.color ?? BLOCK_COLORS[index % BLOCK_COLORS.length]
                return (
                  <linearGradient
                    key={series.label}
                    id={`${gradientBaseId}-${index}`}
                    x1="0%"
                    x2="0%"
                    y1="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={CHART.areaTopOpacity} />
                    <stop offset="100%" stopColor={color} stopOpacity={CHART.areaBottomOpacity} />
                  </linearGradient>
                )
              })}
            </defs>

            {/* Grid lines — staggered fade-in */}
            {yTicks.map((tick, tickIdx) => {
              const { sy } = toSvg(0, tick)
              return (
                <motion.g
                  key={tick}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: tickIdx * 0.04 }}
                >
                  <line
                    x1={padding.left}
                    y1={sy}
                    x2={svgW - padding.right}
                    y2={sy}
                    stroke="currentColor"
                    strokeWidth={CHART.gridWidth}
                    opacity={CHART.gridOpacity}
                  />
                  <text
                    x={padding.left - 6}
                    y={sy + 3}
                    textAnchor="end"
                    className="fill-muted"
                    style={{ fontSize: CHART.labelSize }}
                  >
                    {formatSeriesNumber(tick)}
                  </text>
                </motion.g>
              )
            })}

            {xTicks.map((tick, index) => {
              const { sx } = toSvg(tick, minY)
              return (
                <motion.text
                  key={`${tick}-${index}`}
                  x={sx}
                  y={svgH - 5}
                  textAnchor="middle"
                  className="fill-muted"
                  style={{ fontSize: CHART.labelSize }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: 0.2 + index * 0.04 }}
                >
                  {tick}
                </motion.text>
              )
            })}

            {block.yLabel && (
              <text
                x={12}
                y={padding.top + chartH / 2}
                textAnchor="middle"
                className="fill-muted"
                style={{ fontSize: CHART.labelSize }}
                transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}
              >
                {block.yLabel}
              </text>
            )}

            {block.xLabel && (
              <text
                x={padding.left + chartW / 2}
                y={svgH - 2}
                textAnchor="middle"
                className="fill-muted"
                style={{ fontSize: CHART.labelSize }}
              >
                {block.xLabel}
              </text>
            )}

            {/* Crosshair — fades near latest data point (liveline pattern) */}
            {hover && crosshairOpacity > 0.01 && (
              <>
                <line
                  x1={hover.svgX}
                  y1={padding.top}
                  x2={hover.svgX}
                  y2={padding.top + chartH}
                  stroke="currentColor"
                  opacity={crosshairOpacity}
                  strokeWidth={1}
                />
                {/* Dim region to the right of crosshair */}
                <rect
                  x={hover.svgX}
                  y={padding.top}
                  width={svgW - padding.right - hover.svgX}
                  height={chartH}
                  fill="currentColor"
                  opacity={0.015}
                />
              </>
            )}

            {block.series.map((series, index) => {
              const color = series.color ?? BLOCK_COLORS[index % BLOCK_COLORS.length]
              const coordinates = series.data.map(point => toSvg(point.x, point.y))
              const pathD = coordinates
                .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.sx} ${point.sy}`)
                .join(' ')
              const baselineY = padding.top + chartH
              const areaD = coordinates.length > 0
                ? `${pathD} L ${coordinates[coordinates.length - 1].sx} ${baselineY} L ${coordinates[0].sx} ${baselineY} Z`
                : ''
              const latest = coordinates[coordinates.length - 1]
              const hoveredPoint = hover
                ? series.data.reduce((best, point) => {
                    if (best === null) return point
                    return Math.abs(point.x - hover.x) < Math.abs(best.x - hover.x) ? point : best
                  }, null as TimeSeriesBlockType['series'][number]['data'][number] | null)
                : null
              const hoveredCoordinate = hoveredPoint ? toSvg(hoveredPoint.x, hoveredPoint.y) : null

              return (
                <g key={series.label}>
                  {/* Area fill — staggered entrance */}
                  {areaD && (
                    <motion.path
                      d={areaD}
                      fill={`url(#${gradientBaseId}-${index})`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ ...SPRING_CRISP, delay: 0.1 + index * 0.04 }}
                    />
                  )}

                  {/* Line path — draw animation */}
                  <motion.path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ ...SPRING_CRISP, delay: 0.15 + index * 0.06 }}
                  />

                  {/* Data points — center-out entrance stagger */}
                  {coordinates.map((point, pointIndex) => {
                    if (pointIndex % pointStep !== 0 && pointIndex !== coordinates.length - 1) return null
                    const isLast = pointIndex === coordinates.length - 1
                    /* Center-out delay: center points appear first */
                    const centerDist = Math.abs((pointIndex / Math.max(coordinates.length - 1, 1)) - 0.5) * 2
                    const delay = 0.3 + centerDist * 0.15 + index * 0.04

                    return (
                      <motion.circle
                        key={`${series.label}-${pointIndex}`}
                        cx={point.sx}
                        cy={point.sy}
                        r={isLast ? 3.75 : 1.8}
                        fill={color}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: isLast ? 0.95 : 0.65 }}
                        transition={{ ...SPRING_CRISP, delay }}
                      />
                    )
                  })}

                  {/* Liveline-style pulsing live dot at latest point */}
                  {latest && (
                    <g>
                      {/* Pulse ring — expanding and fading */}
                      <circle
                        cx={latest.sx}
                        cy={latest.sy}
                        r={CHART.liveDotRadius}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        opacity={0.4}
                        className="live-dot-pulse"
                      />
                      {/* Outer white ring */}
                      <motion.circle
                        cx={latest.sx}
                        cy={latest.sy}
                        r={5}
                        fill="white"
                        stroke={color}
                        strokeWidth={2}
                        filter={`drop-shadow(0 1px 3px ${color}40)`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ ...SPRING_CRISP, delay: 0.4 + index * 0.06 }}
                      />
                      {/* Inner colored dot */}
                      <motion.circle
                        cx={latest.sx}
                        cy={latest.sy}
                        r={2.5}
                        fill={color}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ ...SPRING_CRISP, delay: 0.45 + index * 0.06 }}
                      />
                    </g>
                  )}

                  {/* Hover intersection dot — scale-in with spring */}
                  {hoveredCoordinate && (
                    <motion.circle
                      cx={hoveredCoordinate.sx}
                      cy={hoveredCoordinate.sy}
                      r={5.5}
                      fill="white"
                      stroke={color}
                      strokeWidth={2}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={CHART.tooltipSpring}
                    />
                  )}
                </g>
              )
            })}

            {block.annotations?.map(annotation => {
              const { sx } = toSvg(annotation.x, minY)
              return (
                <g key={annotation.x}>
                  <line
                    x1={sx}
                    y1={padding.top}
                    x2={sx}
                    y2={padding.top + chartH}
                    stroke="#C2553A"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={sx}
                    y={padding.top - 5}
                    textAnchor="middle"
                    className="fill-accent-warm text-[8px]"
                  >
                    {annotation.label}
                  </text>
                </g>
              )
            })}

            {notePins.map(notePin => {
              const { sx, sy } = toSvg(notePin.x, notePin.y)
              const color = notePinColor(notePin.intent)
              return (
                <g
                  key={notePin.id}
                  transform={`translate(${sx}, ${sy})`}
                  onClick={() => notePin.onSelect?.()}
                  style={{ cursor: notePin.onSelect ? 'pointer' : 'default' }}
                >
                  <circle
                    cx={0}
                    cy={0}
                    r={notePin.active ? 8.5 : 6.5}
                    fill={color}
                    opacity={0.16}
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={notePin.active ? 4.2 : 3.4}
                    fill="white"
                    stroke={color}
                    strokeWidth={notePin.active ? 2.2 : 1.8}
                  />
                  <path
                    d={`M 0 -10 L 6 -22 Q 7 -24 5 -24 L -5 -24 Q -7 -24 -6 -22 Z`}
                    fill="rgba(255,255,255,0.96)"
                    stroke={color}
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={-14}
                    textAnchor="middle"
                    className="fill-text-primary text-[7px] font-medium"
                  >
                    {notePin.label}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* ── Floating tooltip card — spring entrance with overshoot ── */}
          <AnimatePresence>
            {hover && tooltipAnchor && hoverReadout.length > 0 && (
              <motion.div
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${(tooltipAnchor.sx / svgW) * 100}%`,
                  top: `${((tooltipAnchor.sy / svgH) * 100) + 4}%`,
                }}
                initial={{ opacity: 0, scale: 0.92, x: tooltipAnchor.flipX ? '-100%' : 12, y: 0 }}
                animate={{ opacity: 1, scale: 1, x: tooltipAnchor.flipX ? '-100%' : 12, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={CHART.tooltipSpring}
              >
                <div
                  className="rounded-lg border border-rule bg-white px-3 py-2.5"
                  style={{ boxShadow: `${CHART.tooltipShadow}, 0 0 0 1px rgba(37,99,235,0.06)` }}
                >
                  <div className="text-2xs font-medium tabular-nums text-muted">
                    Slot {hoverReadout[0].x}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {hoverReadout.map(point => (
                      <div key={point.label} className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: point.color }} />
                        <span className="text-11 text-muted">{point.label}</span>
                        <span className="ml-auto text-13 font-semibold tabular-nums text-text-primary">
                          {formatSeriesNumber(point.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {block.annotations && block.annotations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {block.annotations.map(annotation => (
              <span
                key={`${annotation.x}-${annotation.label}`}
                className="lab-chip"
              >
                x={annotation.x}: {annotation.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
