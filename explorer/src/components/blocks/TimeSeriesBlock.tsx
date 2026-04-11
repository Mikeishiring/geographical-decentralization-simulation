import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BLOCK_COLORS, CHART, INTENT_COLORS, SPRING_CRISP } from '../../lib/theme'
import { crosshairFadeNearLive } from '../../lib/chart-animations'
import type { TimeSeriesBlock as TimeSeriesBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'
import { InlineTooltip } from '../ui/Tooltip'

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
  const absoluteValue = Math.abs(value)
  if (absoluteValue === 0) return '0'

  const digits = absoluteValue >= 100
    ? 0
    : absoluteValue >= 10
      ? 1
      : absoluteValue >= 1
        ? 2
        : absoluteValue >= 0.1
          ? 3
          : 4

  return value.toFixed(digits).replace(/\.?0+$/, '')
}

function notePinColor(intent: 'observation' | 'question' | 'theory' | 'methods'): string {
  if (intent === 'question') return INTENT_COLORS.warn
  if (intent === 'theory') return INTENT_COLORS.info
  if (intent === 'methods') return INTENT_COLORS.safe
  return INTENT_COLORS.highlight
}

// ── Metric explanations — plain-English tooltips for chart titles ───────────

const METRIC_EXPLANATIONS: Record<string, string> = {
  gini: 'Gini coefficient measures how unevenly validator stake is distributed across regions. 0 means perfectly equal, 1 means one region controls everything.',
  hhi: 'Herfindahl-Hirschman Index measures market concentration. Below 0.15 is unconcentrated (healthy), above 0.25 is highly concentrated.',
  liveness: 'What percentage of available GCP regions have at least one active validator? Higher means the network is more geographically spread out.',
  distance: 'The total physical distance between all validator pairs. Higher means validators are more geographically spread, lower means they cluster together.',
  cluster: 'How many distinct geographic groupings of validators exist? More clusters generally means better decentralization.',
  mev: 'Maximum Extractable Value — the extra profit block builders capture by reordering transactions. Affected by geographic position relative to information sources.',
  attestation: 'How reliably do validators participate in consensus? Higher attestation rates mean the network is coordinating well despite geographic spread.',
  'failed': 'Blocks that couldn\'t meet the attestation threshold in time. Often caused by excessive latency between the proposer and attesters.',
  proposal: 'How quickly block proposals propagate through the network. Lower latency means faster consensus finality.',
  'coefficient of variation': 'How fairly are profits distributed among validators? Lower CV means more equitable rewards regardless of geographic location.',
  'nearest-neighbor': 'Are validators clustered or dispersed? Below 1 means clustered (validators bunch up), above 1 means regularly spaced.',
  nni: 'Nearest Neighbor Index — a spatial statistics measure. Below 1 = validators cluster together, above 1 = evenly dispersed across regions.',
  relay: 'Average distance from validators to information sources (relays/builders). Shorter distance = faster access to block-building opportunities.',
  source: 'Where block-building information originates geographically. Concentrated sources create centralization pressure around those locations.',
}

function getMetricExplanation(title: string): string | null {
  const t = title.toLowerCase()
  for (const [keyword, explanation] of Object.entries(METRIC_EXPLANATIONS)) {
    if (t.includes(keyword)) return explanation
  }
  return null
}

export function TimeSeriesBlock({ block, notePins = [] }: TimeSeriesBlockProps) {
  const [hover, setHover] = useState<{ x: number; svgX: number; svgY: number } | null>(null)
  const gradientBaseId = useId().replace(/:/g, '')

  const padding = { top: 20, right: 60, bottom: 34, left: 45 }
  const svgW = 600
  const svgH = 240
  const chartW = svgW - padding.left - padding.right
  const chartH = svgH - padding.top - padding.bottom
  const xAxisLabel = block.xLabel?.trim() || 'Slot'

  const allPoints = block.series.flatMap(series => series.data).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (allPoints.length === 0) {
    return <BlockEmptyState title={block.title} message="No time-series samples were attached to this block." />
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
  const uniqueXValues = Array.from(new Set(allPoints.map(point => point.x))).sort((left, right) => left - right)
  const xTicks = uniqueXValues.length <= 6
    ? uniqueXValues
    : Array.from({ length: 5 }, (_, index) => minX + (rangeX * index) / 4)

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
    <div className="lab-panel rounded-xl">
      <div className="border-b border-rule px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-text-primary">
            {getMetricExplanation(block.title ?? '') ? (
              <InlineTooltip label={getMetricExplanation(block.title ?? '')!} placement="above">
                {block.title}
              </InlineTooltip>
            ) : (
              block.title
            )}
          </h3>

          <div className="flex flex-wrap items-center gap-1.5">
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

        {/* Compact snapshot strip */}
        {seriesSnapshots.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-11 text-text-faint">
            {seriesSnapshots.map(snapshot => (
              <div key={`snapshot-${snapshot.label}`} className="flex items-center gap-2">
                <span>range <span className="tabular-nums text-muted">{formatSeriesNumber(snapshot.first)}</span>–<span className="tabular-nums text-muted">{formatSeriesNumber(snapshot.peak)}</span></span>
                <span className="text-rule">·</span>
                <span>delta <span className="tabular-nums text-muted">{formatSeriesNumber(snapshot.delta)}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="relative rounded-xl border border-rule bg-white px-3 py-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {hoverSlot != null ? (
                <span className="text-11 font-medium tabular-nums text-text-primary">
                  {xAxisLabel} {formatSeriesNumber(hoverSlot)}
                  {hoverReadout.map(point => (
                    <span key={point.label} className="ml-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: point.color }} />
                      {' '}{formatSeriesNumber(point.value)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-11 text-text-faint tabular-nums">
                  {block.series.length} series · {xAxisLabel} {formatSeriesNumber(minX)}–{formatSeriesNumber(maxX)}
                </span>
              )}
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
                  y={svgH - 8}
                  textAnchor="middle"
                  className="fill-muted"
                  style={{ fontSize: CHART.labelSize }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: 0.2 + index * 0.04 }}
                >
                  {formatSeriesNumber(tick)}
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

            {block.annotations?.map((annotation, annotationIdx) => {
              const { sx } = toSvg(annotation.x, minY)
              return (
                <g key={`annotation-${annotationIdx}-${annotation.label}`}>
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

          {/* ── Floating tooltip card — Stripe-style bubble with overshoot ── */}
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
                  className="rounded-xl border border-black/[0.06] bg-white px-3.5 py-3 min-w-[140px]"
                  style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' }}
                >
                  {/* Arrow pointer */}
                  {!tooltipAnchor.flipX && (
                    <div className="absolute left-0 top-1/2 -translate-x-[5px] -translate-y-1/2 h-2.5 w-2.5 rotate-45 border-l border-b border-black/[0.06] bg-white" />
                  )}
                  {tooltipAnchor.flipX && (
                    <div className="absolute right-0 top-1/2 translate-x-[5px] -translate-y-1/2 h-2.5 w-2.5 rotate-45 border-r border-t border-black/[0.06] bg-white" />
                  )}
                  <div className="text-[10px] font-medium tabular-nums text-stone-500">
                    Slot {hoverReadout[0].x.toLocaleString()}
                    <span className="ml-1.5 text-stone-300">of {formatSeriesNumber(maxX)}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {hoverReadout.map(point => {
                      const pctOfRange = rangeY > 0 ? ((point.value - minY) / rangeY) * 100 : 0
                      return (
                        <div key={point.label}>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: point.color }} />
                            <span className="text-[11px] text-stone-500">{point.label}</span>
                            <span className="ml-auto text-[14px] font-semibold tabular-nums text-stone-900">
                              {formatSeriesNumber(point.value)}
                            </span>
                          </div>
                          {/* Mini progress bar showing value within range */}
                          <div className="mt-1 ml-4 h-[2px] rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-75"
                              style={{ width: `${Math.min(Math.max(pctOfRange, 2), 100)}%`, backgroundColor: point.color }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {block.annotations && block.annotations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {block.annotations.map((annotation, annotationIdx) => (
              <span
                key={`chip-${annotationIdx}-${annotation.label}`}
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
