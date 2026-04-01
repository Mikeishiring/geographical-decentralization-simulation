import { useState, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP, CHART } from '../../lib/theme'
import { crosshairFadeNearLive } from '../../lib/chart-animations'
import type { PaperChartBlock as PaperChartBlockType } from '../../types/blocks'
import { CiteBadge } from './CiteBadge'
import { PAPER_CHART_DATA, type PaperChartPoint, type PaperChartDataset } from '../../data/paper-chart-data'

interface PaperChartBlockProps {
  block: PaperChartBlockType
}

type MetricKey = 'gini' | 'hhi' | 'liveness' | 'cv'

const METRICS: readonly { key: MetricKey; label: string; yLabel: string }[] = [
  { key: 'gini', label: 'Gini_g', yLabel: 'Gini\u2097' },
  { key: 'hhi', label: 'HHI_g', yLabel: 'HHI\u2097' },
  { key: 'liveness', label: 'LC_g', yLabel: 'LC\u2097' },
  { key: 'cv', label: 'CV_g', yLabel: 'CV\u2097' },
]

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(4)
}

function nearestPoint(points: readonly PaperChartPoint[], slot: number): PaperChartPoint | null {
  return points.reduce<PaperChartPoint | null>((best, p) =>
    best === null || Math.abs(p.x - slot) < Math.abs(best.x - slot) ? p : best, null)
}

function MiniChart({
  datasets,
  metricKey,
  yLabel,
  hoverSlot,
  onHoverSlot,
  gradientPrefix,
  panelIndex,
}: {
  datasets: readonly PaperChartDataset[]
  metricKey: MetricKey
  yLabel: string
  hoverSlot: number | null
  onHoverSlot: (slot: number | null) => void
  gradientPrefix: string
  panelIndex: number
}) {
  const padding = { top: 12, right: 10, bottom: 24, left: 40 }
  const svgW = 300
  const svgH = 150
  const chartW = svgW - padding.left - padding.right
  const chartH = svgH - padding.top - padding.bottom

  const allSeries = datasets.map(d => d[metricKey])
  const allPoints = allSeries.flat()
  if (allPoints.length === 0) return null

  const minX = Math.min(...allPoints.map(p => p.x))
  const maxX = Math.max(...allPoints.map(p => p.x))
  const minY = Math.min(...allPoints.map(p => p.y))
  const maxY = Math.max(...allPoints.map(p => p.y))
  const rangeX = maxX - minX || 1
  const padY = (maxY - minY) * 0.08 || 0.01
  const yLo = minY - padY
  const yHi = maxY + padY
  const rangeY = yHi - yLo

  function toSvg(x: number, y: number) {
    return {
      sx: padding.left + ((x - minX) / rangeX) * chartW,
      sy: padding.top + chartH - ((y - yLo) / rangeY) * chartH,
    }
  }

  const yTicks = Array.from({ length: 4 }, (_, i) => yLo + (rangeY * i) / 3)
  const xTicks = [0, 2500, 5000, 7500, 10000].filter(t => t >= minX && t <= maxX)
  const latestSvgX = toSvg(maxX, 0).sx
  const baseDelay = panelIndex * 0.06

  const hoverSvgX = hoverSlot != null
    ? padding.left + ((hoverSlot - minX) / rangeX) * chartW
    : null
  const crosshairOpacity = hoverSvgX != null
    ? CHART.crosshairOpacity * crosshairFadeNearLive(hoverSvgX, latestSvgX, CHART.crosshairFadeDistance)
    : 0

  return (
    <div className="relative">
      <div className="absolute left-1 top-0.5 text-[9px] font-semibold text-muted/70 tracking-wide z-10">
        {yLabel}
      </div>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const relX = ((event.clientX - rect.left) / rect.width) * svgW
          if (relX >= padding.left && relX <= svgW - padding.right) {
            const slot = minX + ((relX - padding.left) / chartW) * rangeX
            onHoverSlot(Math.round(slot))
          }
        }}
        onMouseLeave={() => onHoverSlot(null)}
      >
        <defs>
          {datasets.map((d, i) => (
            <linearGradient
              key={d.label}
              id={`${gradientPrefix}-${metricKey}-${i}`}
              x1="0%" x2="0%" y1="0%" y2="100%"
            >
              <stop offset="0%" stopColor={d.color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={d.color} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>

        {/* Grid lines — staggered entrance */}
        {yTicks.map((tick, tickIdx) => {
          const { sy } = toSvg(0, tick)
          return (
            <motion.g
              key={tick}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...SPRING_CRISP, delay: baseDelay + tickIdx * 0.03 }}
            >
              <line
                x1={padding.left} y1={sy}
                x2={svgW - padding.right} y2={sy}
                stroke="currentColor" strokeWidth={0.5} opacity={0.08}
              />
              <text
                x={padding.left - 4} y={sy + 3}
                textAnchor="end" className="fill-muted" style={{ fontSize: 8 }}
              >
                {formatNum(tick)}
              </text>
            </motion.g>
          )
        })}

        {/* X-axis ticks — staggered */}
        {xTicks.map((tick, idx) => {
          const { sx } = toSvg(tick, yLo)
          return (
            <motion.text
              key={tick} x={sx} y={svgH - 6}
              textAnchor="middle" className="fill-muted" style={{ fontSize: 8 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...SPRING_CRISP, delay: baseDelay + 0.15 + idx * 0.03 }}
            >
              {tick >= 1000 ? `${tick / 1000}k` : tick}
            </motion.text>
          )
        })}

        {/* X-axis label */}
        <motion.text
          x={padding.left + chartW / 2} y={svgH}
          textAnchor="middle" className="fill-muted" style={{ fontSize: 7 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ ...SPRING_CRISP, delay: baseDelay + 0.3 }}
        >
          Slot
        </motion.text>

        {/* Crosshair + dim region */}
        {hoverSvgX != null && crosshairOpacity > 0.01 && (
          <>
            <line
              x1={hoverSvgX} y1={padding.top}
              x2={hoverSvgX} y2={padding.top + chartH}
              stroke="currentColor" opacity={crosshairOpacity} strokeWidth={0.75}
            />
            <rect
              x={hoverSvgX}
              y={padding.top}
              width={Math.max(0, svgW - padding.right - hoverSvgX)}
              height={chartH}
              fill="currentColor"
              opacity={0.015}
            />
          </>
        )}

        {/* Series */}
        {datasets.map((d, i) => {
          const points = d[metricKey]
          const coords = points.map(p => toSvg(p.x, p.y))
          const pathD = coords.map((c, j) => `${j === 0 ? 'M' : 'L'} ${c.sx} ${c.sy}`).join(' ')
          const baseY = padding.top + chartH
          const areaD = coords.length > 0
            ? `${pathD} L ${coords[coords.length - 1].sx} ${baseY} L ${coords[0].sx} ${baseY} Z`
            : ''
          const latest = coords[coords.length - 1]
          const seriesDelay = baseDelay + 0.1 + i * 0.05

          const hoveredPt = hoverSlot != null ? nearestPoint(points, hoverSlot) : null
          const hoveredCoord = hoveredPt ? toSvg(hoveredPt.x, hoveredPt.y) : null

          return (
            <g key={d.label}>
              {/* Area fill — fade in */}
              {areaD && (
                <motion.path
                  d={areaD}
                  fill={`url(#${gradientPrefix}-${metricKey}-${i})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: seriesDelay }}
                />
              )}

              {/* Line path — draw animation */}
              <motion.path
                d={pathD}
                fill="none"
                stroke={d.color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.05 }}
              />

              {/* Liveline dot at latest point */}
              {latest && (
                <g>
                  {/* Pulse ring */}
                  <circle
                    cx={latest.sx} cy={latest.sy}
                    r={CHART.liveDotRadius}
                    fill="none" stroke={d.color}
                    strokeWidth={1} opacity={0.3}
                    className="live-dot-pulse"
                  />
                  {/* Outer ring */}
                  <motion.circle
                    cx={latest.sx} cy={latest.sy} r={4}
                    fill="white" stroke={d.color} strokeWidth={1.5}
                    filter={`drop-shadow(0 1px 2px ${d.color}30)`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.3 }}
                  />
                  {/* Inner dot */}
                  <motion.circle
                    cx={latest.sx} cy={latest.sy} r={2}
                    fill={d.color}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.35 }}
                  />
                </g>
              )}

              {/* Hover intersection dot — spring entrance */}
              <AnimatePresence>
                {hoveredCoord && (
                  <motion.circle
                    cx={hoveredCoord.sx} cy={hoveredCoord.sy}
                    r={4.5}
                    fill="white" stroke={d.color} strokeWidth={1.8}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={CHART.tooltipSpring}
                  />
                )}
              </AnimatePresence>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function PaperChartBlock({ block }: PaperChartBlockProps) {
  const chartData = PAPER_CHART_DATA[block.dataKey]
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const gradientPrefix = useId().replace(/:/g, '')

  if (!chartData) {
    return (
      <div className="lab-panel rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        <p className="mt-2 text-sm text-muted">No chart data for key: {block.dataKey}</p>
      </div>
    )
  }

  const { datasets } = chartData

  // Build snapshot for each series (first → last delta)
  const snapshots = datasets.map(d => {
    const first = d.gini[0]?.y ?? 0
    const last = d.gini[d.gini.length - 1]?.y ?? 0
    return { label: d.label, color: d.color, first, last, delta: last - first }
  })

  return (
    <motion.div
      className="lab-panel overflow-hidden rounded-2xl topo-bg card-hover"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rule px-5 py-3.5">
        <div>
          <h3 className="text-sm font-medium text-text-primary">
            {block.title}
          </h3>
          {/* Snapshot strip */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-faint tabular-nums">
            {snapshots.map(s => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-muted">{s.label}</span>
                <span>Gini {formatNum(s.first)} → {formatNum(s.last)}</span>
                <span className={s.delta > 0 ? 'text-danger' : 'text-success'}>
                  {s.delta > 0 ? '+' : ''}{formatNum(s.delta)}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {block.cite && <CiteBadge cite={block.cite} />}
        </div>
      </div>

      {/* Legend + hover slot */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3 pb-1">
        {datasets.map(d => (
          <span key={d.label} className="lab-chip !py-0.5 !text-2xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.label}
          </span>
        ))}
        <AnimatePresence>
          {hoverSlot != null && (
            <motion.span
              className="ml-auto text-2xs font-medium tabular-nums text-text-primary"
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={CHART.tooltipSpring}
            >
              Slot {hoverSlot.toLocaleString()}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 2x2 grid */}
      <div className="grid grid-cols-2 gap-2 px-5 pb-2 pt-1">
        {METRICS.map(({ key, yLabel }, panelIdx) => (
          <div
            key={key}
            className={cn(
              'rounded-xl border border-rule/40 bg-white px-2 py-1.5 transition-shadow duration-150',
              hoverSlot != null && 'shadow-[0_2px_8px_rgba(37,99,235,0.04)] border-accent/10',
            )}
          >
            <MiniChart
              datasets={datasets}
              metricKey={key}
              yLabel={yLabel}
              hoverSlot={hoverSlot}
              onHoverSlot={setHoverSlot}
              gradientPrefix={gradientPrefix}
              panelIndex={panelIdx}
            />
          </div>
        ))}
      </div>

      {/* Hover tooltip strip — animated entrance */}
      <AnimatePresence>
        {hoverSlot != null && (
          <motion.div
            className="border-t border-rule px-5 py-2.5 bg-white/60"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ ...SPRING_CRISP, duration: 0.15 }}
          >
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[10px] tabular-nums">
              {datasets.map(d => {
                const vals = METRICS.map(({ key, label }) => ({
                  label,
                  value: nearestPoint(d[key], hoverSlot)?.y ?? 0,
                }))
                return (
                  <div key={d.label} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted font-semibold">{d.label}</span>
                    {vals.map(v => (
                      <span key={v.label} className="text-text-body">
                        <span className="text-text-faint">{v.label}</span>{' '}
                        <span className="font-semibold text-text-primary">{formatNum(v.value)}</span>
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
