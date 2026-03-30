import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { BLOCK_COLORS, SPRING_SOFT } from '../../lib/theme'
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
  if (intent === 'question') return '#C2410C'
  if (intent === 'theory') return '#1D4ED8'
  if (intent === 'methods') return '#0F766E'
  return '#7C3AED'
}

export function TimeSeriesBlock({ block, notePins = [] }: TimeSeriesBlockProps) {
  const [hover, setHover] = useState<{ x: number; svgX: number } | null>(null)
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
  const latestValues = block.series.flatMap(series => {
    const latest = series.data[series.data.length - 1]
    return latest ? [{ label: series.label, value: latest.y }] : []
  })
  const seriesSnapshots = block.series.flatMap((series, index) => {
    const first = series.data[0]
    const latest = series.data[series.data.length - 1]
    if (!first || !latest) return []
    return [{
      label: series.label,
      color: series.color ?? BLOCK_COLORS[index % BLOCK_COLORS.length],
      first: first.y,
      latest: latest.y,
      peak: Math.max(...series.data.map(point => point.y)),
      delta: latest.y - first.y,
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

  return (
    <div className="lab-panel overflow-hidden rounded-xl">
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              {block.title}
            </h3>
            <p className="mt-1 text-xs text-muted">
              Exact series values, rendered with the same slot ordering as the simulation output and framed like a measurement surface.
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

      <div className="px-5 py-5">
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {latestValues.map((entry, index) => (
            <div
              key={`${entry.label}-${index}`}
              className="rounded-xl border border-rule bg-white px-3 py-2.5"
            >
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Latest</div>
              <div className="mt-1 text-xs font-medium text-text-primary">{entry.label}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                {formatSeriesNumber(entry.value)}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {seriesSnapshots.map(snapshot => (
            <div
              key={`snapshot-${snapshot.label}`}
              className="rounded-xl border border-rule bg-white px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: snapshot.color }} />
                <div className="text-xs font-medium text-text-primary">{snapshot.label}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[0.6875rem]">
                <div>
                  <div className="uppercase tracking-[0.1em] text-text-faint">Start</div>
                  <div className="mt-1 font-medium tabular-nums text-text-primary">{formatSeriesNumber(snapshot.first)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.1em] text-text-faint">Peak</div>
                  <div className="mt-1 font-medium tabular-nums text-text-primary">{formatSeriesNumber(snapshot.peak)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.1em] text-text-faint">Delta</div>
                  <div className="mt-1 font-medium tabular-nums text-text-primary">{formatSeriesNumber(snapshot.delta)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-rule bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Integrity</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              Raw slot series, full ordering, no smoothing.
            </div>
            <div className="mt-1 text-xs text-muted">
              Hover the chart to inspect exact values at the nearest emitted slot.
            </div>
          </div>
          {hoverSlot != null && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {hoverReadout.map(point => (
                <div
                  key={`${point.label}-${point.x}`}
                  className="rounded-xl border border-rule bg-white/92 px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: point.color }} />
                    <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Slot {point.x}</span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-text-primary">{point.label}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                    {formatSeriesNumber(point.value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-rule bg-white px-3 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[0.6875rem] uppercase tracking-[0.1em] text-text-faint">
              Measurement deck
            </div>
            <div className="text-[0.6875rem] text-muted">
              {block.series.length} series · x {formatSeriesNumber(minX)} to {formatSeriesNumber(maxX)}
            </div>
          </div>
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={event => {
              const rect = event.currentTarget.getBoundingClientRect()
              const relX = ((event.clientX - rect.left) / rect.width) * svgW
              if (relX >= padding.left && relX <= svgW - padding.right) {
                setHover({ x: minX + ((relX - padding.left) / chartW) * rangeX, svgX: relX })
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
                    <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                  </linearGradient>
                )
              })}
            </defs>

            {yTicks.map(tick => {
              const { sy } = toSvg(0, tick)
              return (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    y1={sy}
                    x2={svgW - padding.right}
                    y2={sy}
                    stroke="#E8E8E6"
                    strokeWidth={0.5}
                  />
                  <text
                    x={padding.left - 6}
                    y={sy + 3}
                    textAnchor="end"
                    className="fill-[#6B7280] text-[9px]"
                  >
                    {formatSeriesNumber(tick)}
                  </text>
                </g>
              )
            })}

            {xTicks.map((tick, index) => {
              const { sx } = toSvg(tick, minY)
              return (
                <text
                  key={`${tick}-${index}`}
                  x={sx}
                  y={svgH - 5}
                  textAnchor="middle"
                  className="fill-[#6B7280] text-[9px]"
                >
                  {tick}
                </text>
              )
            })}

            {block.yLabel && (
              <text
                x={12}
                y={padding.top + chartH / 2}
                textAnchor="middle"
                className="fill-[#6B7280] text-[9px]"
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
                className="fill-[#6B7280] text-[9px]"
              >
                {block.xLabel}
              </text>
            )}

            {hover && (
              <line
                x1={hover.svgX}
                y1={padding.top}
                x2={hover.svgX}
                y2={padding.top + chartH}
                stroke="rgba(37,99,235,0.28)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
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
                  {areaD && (
                    <motion.path
                      d={areaD}
                      fill={`url(#${gradientBaseId}-${index})`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ ...SPRING_SOFT, delay: index * 0.05 }}
                    />
                  )}
                  <motion.path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ ...SPRING_SOFT, delay: index * 0.08 }}
                  />
                  {coordinates.map((point, pointIndex) => (
                    (pointIndex % pointStep === 0 || pointIndex === coordinates.length - 1) ? (
                    <circle
                      key={`${series.label}-${pointIndex}`}
                      cx={point.sx}
                      cy={point.sy}
                      r={pointIndex === coordinates.length - 1 ? 3.75 : 1.8}
                      fill={color}
                      opacity={pointIndex === coordinates.length - 1 ? 0.95 : 0.65}
                    />
                    ) : null
                  ))}
                  {latest && (
                    <circle cx={latest.sx} cy={latest.sy} r={4} fill="white" stroke={color} strokeWidth={1.5} />
                  )}
                  {hoveredCoordinate && (
                    <circle
                      cx={hoveredCoordinate.sx}
                      cy={hoveredCoordinate.sy}
                      r={5.5}
                      fill="white"
                      stroke={color}
                      strokeWidth={2}
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
                    className="fill-[#8B5E4D] text-[8px]"
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
                    className="fill-[#0F172A] text-[7px] font-medium"
                  >
                    {notePin.label}
                  </text>
                </g>
              )
            })}

            {hover && (
              <line
                x1={hover.svgX}
                y1={padding.top}
                x2={hover.svgX}
                y2={padding.top + chartH}
                stroke="#9CA3AF"
                strokeWidth={0.5}
                strokeDasharray="2 2"
              />
            )}
          </svg>
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
