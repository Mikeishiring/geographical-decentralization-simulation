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

const CHART_DESCRIPTIONS: Record<string, string> = {
  'baseline-results': 'Published Figure 3 replay over 10,000 slots. Solid lines are External and dashed lines are Local.',
  'se4a-attestation': 'Published Figure 7 replay across four gamma settings. Solid lines are External and dashed lines are Local.',
}

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
  metricLabel,
  yLabel,
  hoverSlot,
  onHoverSlot,
  gradientPrefix,
  panelIndex,
}: {
  datasets: readonly PaperChartDataset[]
  metricKey: MetricKey
  metricLabel: string
  yLabel: string
  hoverSlot: number | null
  onHoverSlot: (slot: number | null) => void
  gradientPrefix: string
  panelIndex: number
}) {
  const padding = { top: 20, right: 18, bottom: 34, left: 56 }
  const svgW = 380
  const svgH = 220
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

  function updateHoverSlot(clientX: number, currentTarget: SVGSVGElement) {
    const rect = currentTarget.getBoundingClientRect()
    const relX = ((clientX - rect.left) / rect.width) * svgW
    if (relX >= padding.left && relX <= svgW - padding.right) {
      const slot = minX + ((relX - padding.left) / chartW) * rangeX
      onHoverSlot(Math.round(slot))
    }
  }

  return (
    <div className="relative">
      <div className="absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full border border-rule/60 bg-white/90 px-2 py-1 text-[10px] font-semibold tracking-wide text-muted/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span className="text-text-primary">{metricLabel}</span>
        <span className="text-text-faint">{yLabel}</span>
      </div>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="aspect-[19/11] w-full"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={event => {
          if (event.pointerType !== 'mouse') return
          updateHoverSlot(event.clientX, event.currentTarget)
        }}
        onPointerDown={event => {
          updateHoverSlot(event.clientX, event.currentTarget)
        }}
        onPointerLeave={event => {
          if (event.pointerType === 'mouse') onHoverSlot(null)
        }}
        style={{ touchAction: 'pan-y' }}
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
                textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}
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
              key={tick} x={sx} y={svgH - 11}
              textAnchor="middle" className="fill-muted" style={{ fontSize: 10 }}
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
          x={padding.left + chartW / 2} y={svgH - 1}
          textAnchor="middle" className="fill-muted" style={{ fontSize: 9 }}
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
                strokeWidth={d.dashed ? 2 : 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={d.dashed ? '6 3' : undefined}
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
                    cx={latest.sx} cy={latest.sy} r={4.5}
                    fill="white" stroke={d.color} strokeWidth={1.5}
                    filter={`drop-shadow(0 1px 2px ${d.color}30)`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.3 }}
                  />
                  {/* Inner dot */}
                  <motion.circle
                    cx={latest.sx} cy={latest.sy} r={2.25}
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
                    r={5}
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
  const description = CHART_DESCRIPTIONS[block.dataKey]

  // Build snapshot for each series (first → last delta)
  const snapshots = datasets.map(d => {
    const first = d.gini[0]?.y ?? 0
    const last = d.gini[d.gini.length - 1]?.y ?? 0
    return { label: d.label, color: d.color, first, last, delta: last - first }
  })

  return (
    <motion.div
      className="lab-panel overflow-hidden rounded-[1.25rem] border border-rule/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] card-hover"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule/70 px-6 py-5">
        <div className="max-w-3xl">
          <h3 className="text-base font-medium text-text-primary">
            {block.title}
          </h3>
          {description && (
            <p className="mt-2 text-sm leading-6 text-muted">
              {description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center rounded-full border border-rule/70 bg-white/80 px-3 py-1 text-[11px] font-medium text-text-faint">
            {hoverSlot != null ? `Slot ${hoverSlot.toLocaleString()}` : 'Hover or tap to inspect values'}
          </span>
          {block.cite && <CiteBadge cite={block.cite} />}
        </div>
      </div>

      <div className="grid gap-2 border-b border-rule/60 px-6 py-4 sm:grid-cols-2 xl:grid-cols-4">
        {snapshots.map(s => (
          <div
            key={s.label}
            className="rounded-xl border border-rule/60 bg-white/80 px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
                <line
                  x1="0"
                  y1="4"
                  x2="16"
                  y2="4"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={datasets.find(d => d.label === s.label)?.dashed ? '4 2' : undefined}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-sm font-medium text-text-primary">{s.label}</span>
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.08em] text-text-faint">
              Gini start → end
            </div>
            <div className="mt-1 flex items-baseline gap-2 tabular-nums">
              <span className="text-sm font-semibold text-text-primary">
                {formatNum(s.first)} → {formatNum(s.last)}
              </span>
              <span className={cn('text-[11px] font-semibold', s.delta > 0 ? 'text-danger' : 'text-success')}>
                {s.delta > 0 ? '+' : ''}{formatNum(s.delta)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 2x2 grid */}
      <div className="grid grid-cols-1 gap-3 px-6 pb-4 pt-4 lg:grid-cols-2">
        {METRICS.map(({ key, label, yLabel }, panelIdx) => (
          <div
            key={key}
            className={cn(
              'overflow-hidden rounded-[1.1rem] border border-rule/55 bg-white/92 px-3 py-2.5 shadow-[0_2px_12px_rgba(15,23,42,0.03)] transition-shadow duration-150',
              hoverSlot != null && 'border-accent/10 shadow-[0_8px_20px_rgba(37,99,235,0.06)]',
            )}
          >
            <MiniChart
              datasets={datasets}
              metricKey={key}
              metricLabel={label}
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
            className="border-t border-rule/70 bg-white/70 px-6 py-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ ...SPRING_CRISP, duration: 0.15 }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-text-faint">
                Nearest sampled values
              </p>
              <p className="text-sm font-medium tabular-nums text-text-primary">
                Slot {hoverSlot.toLocaleString()}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {datasets.map(d => {
                const vals = METRICS.map(({ key, label }) => ({
                  label,
                  value: nearestPoint(d[key], hoverSlot)?.y ?? 0,
                }))
                return (
                  <div
                    key={d.label}
                    className="rounded-xl border border-rule/60 bg-white/85 px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <svg width="14" height="7" viewBox="0 0 14 7" className="shrink-0">
                        <line x1="0" y1="3.5" x2="14" y2="3.5" stroke={d.color} strokeWidth={2} strokeDasharray={d.dashed ? '3 2' : undefined} strokeLinecap="round" />
                      </svg>
                      <span className="text-sm font-medium text-text-primary">{d.label}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
                      {vals.map(v => (
                        <span key={v.label} className="flex items-baseline justify-between gap-2 text-text-body">
                          <span className="text-text-faint">{v.label}</span>
                          <span className="font-semibold text-text-primary">{formatNum(v.value)}</span>
                        </span>
                      ))}
                    </div>
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
