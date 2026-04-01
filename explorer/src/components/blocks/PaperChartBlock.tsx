import { useId, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP, CHART } from '../../lib/theme'
import { crosshairFadeNearLive } from '../../lib/chart-animations'
import type { PaperChartBlock as PaperChartBlockType } from '../../types/blocks'
import { CiteBadge } from './CiteBadge'
import { PAPER_CHART_DATA, type PaperChartPoint, type PaperChartDataset } from '../../data/paper-chart-data'

interface PaperChartBlockProps {
  block: PaperChartBlockType
  caption?: string
}

type MetricKey = 'gini' | 'hhi' | 'liveness' | 'cv'

const METRICS: readonly { key: MetricKey; label: string; yLabel: string }[] = [
  { key: 'gini', label: 'Gini_g', yLabel: 'Gini_g' },
  { key: 'hhi', label: 'HHI_g', yLabel: 'HHI_g' },
  { key: 'liveness', label: 'LC_g', yLabel: 'LC_g' },
  { key: 'cv', label: 'CV_g', yLabel: 'CV_g' },
]

const CHART_DESCRIPTIONS: Record<string, string> = {
  'baseline-results': 'Paper Figure 3 replay over 10,000 slots. One composite figure, four metrics, shared slot axis.',
  'se4a-attestation': 'Paper Figure 7 replay across four attestation-threshold settings. One composite figure, four metrics, shared slot axis.',
}

const CHART_TAKEAWAYS: Record<string, string> = {
  'baseline-results': 'Local block building pulls concentration upward faster and farther than external block building in the baseline setup.',
  'se4a-attestation': 'Raising gamma increases external centralization pressure while reducing local centralization pressure.',
}

const CHART_METADATA: Record<string, readonly string[]> = {
  'baseline-results': ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'gamma = 2/3'],
  'se4a-attestation': ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'gamma in {1/3, 1/2, 2/3, 4/5}'],
}

const CHART_PROVENANCE: Record<string, {
  readonly figureHref: string
  readonly figureLabel: string
  readonly datasetSummary: string
  readonly repoPaths: readonly string[]
}> = {
  'baseline-results': {
    figureHref: '/paper-figures/fig3-baseline.png',
    figureLabel: 'Open original paper figure',
    datasetSummary: 'Derived directly from the full raw slot series in the checked-in baseline simulation outputs.',
    repoPaths: [
      'dashboard/simulations/baseline/SSP/cost_0.002/data.json',
      'dashboard/simulations/baseline/MSP/cost_0.002/data.json',
    ],
  },
  'se4a-attestation': {
    figureHref: '/paper-figures/fig7-se4a-gamma.png',
    figureLabel: 'Open original paper figure',
    datasetSummary: 'Derived directly from the full raw slot series in the checked-in attestation-threshold simulation outputs.',
    repoPaths: [
      'dashboard/simulations/different_gammas/{SSP,MSP}/cost_0.002_gamma_{0.3333,0.5,0.6667,0.8}/data.json',
    ],
  },
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(4)
}

function formatSlotTick(value: number): string {
  if (value < 1000) return String(value)

  const compact = Math.round((value / 1000) * 10) / 10
  return Number.isInteger(compact) ? `${compact}k` : `${compact.toFixed(1)}k`
}

function getSeriesGroupLabel(label: string): string {
  const match = label.match(/^(γ=[^ ]+)/)
  return match?.[1] ?? label
}

function pointAtSlot(points: readonly PaperChartPoint[], slot: number): PaperChartPoint | null {
  if (points.length === 0) return null

  let low = 0
  let high = points.length - 1

  if (slot <= points[low].x) return points[low]
  if (slot >= points[high].x) return points[high]

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const point = points[mid]

    if (point.x === slot) return point
    if (point.x < slot) low = mid + 1
    else high = mid - 1
  }

  const before = points[Math.max(0, high)] ?? null
  const after = points[Math.min(points.length - 1, low)] ?? null

  if (!before) return after
  if (!after) return before
  return Math.abs(before.x - slot) <= Math.abs(after.x - slot) ? before : after
}

function getSlotBounds(datasets: readonly PaperChartDataset[]) {
  let minSlot = Number.POSITIVE_INFINITY
  let maxSlot = Number.NEGATIVE_INFINITY

  for (const dataset of datasets) {
    for (const metric of METRICS) {
      const points = dataset[metric.key]
      if (points.length === 0) continue
      minSlot = Math.min(minSlot, points[0].x)
      maxSlot = Math.max(maxSlot, points[points.length - 1].x)
    }
  }

  return {
    minSlot: Number.isFinite(minSlot) ? minSlot : 0,
    maxSlot: Number.isFinite(maxSlot) ? maxSlot : 0,
  }
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
  activeGroup,
}: {
  datasets: readonly PaperChartDataset[]
  metricKey: MetricKey
  metricLabel: string
  yLabel: string
  hoverSlot: number | null
  onHoverSlot: (slot: number | null) => void
  gradientPrefix: string
  panelIndex: number
  activeGroup: string | null
}) {
  const padding = { top: 12, right: 16, bottom: 30, left: 48 }
  const svgW = 380
  const svgH = 224
  const chartW = svgW - padding.left - padding.right
  const chartH = svgH - padding.top - padding.bottom

  const chartGeometry = useMemo(() => {
    const allSeries = datasets.map(dataset => dataset[metricKey])
    const allPoints = allSeries.flat()
    if (allPoints.length === 0) return null

    const minX = allPoints[0].x
    const maxX = allPoints[allPoints.length - 1].x
    const minY = Math.min(...allPoints.map(point => point.y))
    const maxY = Math.max(...allPoints.map(point => point.y))
    const rangeX = maxX - minX || 1
    const padY = (maxY - minY) * 0.08 || 0.01
    const yLo = minY - padY
    const yHi = maxY + padY
    const rangeY = yHi - yLo

    const mapX = (x: number) => padding.left + ((x - minX) / rangeX) * chartW
    const mapY = (y: number) => padding.top + chartH - ((y - yLo) / rangeY) * chartH
    const toSvg = (x: number, y: number) => ({ sx: mapX(x), sy: mapY(y) })

    const yTicks = Array.from({ length: 4 }, (_, index) => yLo + (rangeY * index) / 3)
    const xTicks = Array.from({ length: 5 }, (_, index) => Math.round(minX + (rangeX * index) / 4))
      .filter((tick, index, ticks) => index === 0 || tick !== ticks[index - 1])

    const series = datasets.map((dataset, index) => {
      const points = dataset[metricKey]
      const coords = points.map(point => toSvg(point.x, point.y))
      const pathD = coords.map((coord, coordIndex) => `${coordIndex === 0 ? 'M' : 'L'} ${coord.sx} ${coord.sy}`).join(' ')
      const baseY = padding.top + chartH
      const areaD = coords.length > 0
        ? `${pathD} L ${coords[coords.length - 1].sx} ${baseY} L ${coords[0].sx} ${baseY} Z`
        : ''

      return {
        dataset,
        index,
        points,
        pathD,
        areaD,
        latest: coords[coords.length - 1] ?? null,
      }
    })

    return {
      minX,
      maxX,
      rangeX,
      yLo,
      yTicks,
      xTicks,
      latestSvgX: mapX(maxX),
      mapX,
      mapY,
      series,
    }
  }, [chartH, chartW, datasets, metricKey, padding.bottom, padding.left, padding.right, padding.top])

  if (!chartGeometry) return null

  const { minX, rangeX, yTicks, xTicks, latestSvgX, mapX, mapY, series } = chartGeometry
  const baseDelay = panelIndex * 0.05
  const isDenseFigure = datasets.length > 4
  const showAreaFill = !isDenseFigure

  const hoverSvgX = hoverSlot != null
    ? mapX(hoverSlot)
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
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          {metricLabel}
        </div>
        <div className="text-[11px] text-muted">
          {yLabel}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="aspect-[15/10] w-full"
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
          {datasets.map((dataset, index) => (
            <linearGradient
              key={dataset.label}
              id={`${gradientPrefix}-${metricKey}-${index}`}
              x1="0%"
              x2="0%"
              y1="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={dataset.color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={dataset.color} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((tick, tickIndex) => {
          const sy = mapY(tick)
          return (
            <motion.g
              key={tick}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...SPRING_CRISP, delay: baseDelay + tickIndex * 0.03 }}
            >
              <line
                x1={padding.left}
                y1={sy}
                x2={svgW - padding.right}
                y2={sy}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.08}
              />
              <text
                x={padding.left - 4}
                y={sy + 3}
                textAnchor="end"
                className="fill-muted"
                style={{ fontSize: 10 }}
              >
                {formatNum(tick)}
              </text>
            </motion.g>
          )
        })}

        {xTicks.map((tick, index) => {
          const sx = mapX(tick)
          return (
            <motion.text
              key={tick}
              x={sx}
              y={svgH - 11}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 10 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...SPRING_CRISP, delay: baseDelay + 0.15 + index * 0.03 }}
            >
              {formatSlotTick(tick)}
            </motion.text>
          )
        })}

        <motion.text
          x={padding.left + chartW / 2}
          y={svgH - 1}
          textAnchor="middle"
          className="fill-muted"
          style={{ fontSize: 9 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ ...SPRING_CRISP, delay: baseDelay + 0.3 }}
        >
          Slot
        </motion.text>

        {hoverSvgX != null && crosshairOpacity > 0.01 && (
          <>
            <line
              x1={hoverSvgX}
              y1={padding.top}
              x2={hoverSvgX}
              y2={padding.top + chartH}
              stroke="currentColor"
              opacity={crosshairOpacity}
              strokeWidth={0.75}
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

        {series.map(({ dataset, index, points, pathD, areaD, latest }) => {
          const seriesDelay = baseDelay + 0.1 + index * 0.04
          const isFocusedSeries = activeGroup == null || getSeriesGroupLabel(dataset.label) === activeGroup
          const showMarkers = !isDenseFigure || activeGroup !== null
          const lineOpacity = isFocusedSeries ? 0.96 : 0.2
          const latestOpacity = isFocusedSeries ? 1 : 0
          const strokeWidth = isDenseFigure
            ? dataset.dashed ? 1.45 : 1.7
            : dataset.dashed ? 2 : 2.2

          const hoveredPoint = hoverSlot != null && showMarkers && isFocusedSeries ? pointAtSlot(points, hoverSlot) : null
          const hoveredCoord = hoveredPoint
            ? { sx: mapX(hoveredPoint.x), sy: mapY(hoveredPoint.y) }
            : null

          return (
            <g key={dataset.label}>
              {showAreaFill && areaD && isFocusedSeries && (
                <motion.path
                  d={areaD}
                  fill={`url(#${gradientPrefix}-${metricKey}-${index})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING_CRISP, delay: seriesDelay }}
                />
              )}

              <motion.path
                d={pathD}
                fill="none"
                stroke={dataset.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dataset.dashed ? '6 3' : undefined}
                opacity={lineOpacity}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.05 }}
              />

              {latest && showMarkers && (
                <g>
                  <circle
                    cx={latest.sx}
                    cy={latest.sy}
                    r={CHART.liveDotRadius}
                    fill="none"
                    stroke={dataset.color}
                    strokeWidth={1}
                    opacity={0.24}
                    className="live-dot-pulse"
                    style={{ opacity: latestOpacity * 0.24 }}
                  />
                  <motion.circle
                    cx={latest.sx}
                    cy={latest.sy}
                    r={4.25}
                    fill="white"
                    stroke={dataset.color}
                    strokeWidth={1.4}
                    filter={`drop-shadow(0 1px 2px ${dataset.color}25)`}
                    opacity={latestOpacity}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.3 }}
                  />
                  <motion.circle
                    cx={latest.sx}
                    cy={latest.sy}
                    r={2.15}
                    fill={dataset.color}
                    opacity={latestOpacity}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_CRISP, delay: seriesDelay + 0.35 }}
                  />
                </g>
              )}

              <AnimatePresence>
                {hoveredCoord && (
                  <motion.circle
                    cx={hoveredCoord.sx}
                    cy={hoveredCoord.sy}
                    r={4.75}
                    fill="white"
                    stroke={dataset.color}
                    strokeWidth={1.8}
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

export function PaperChartBlock({ block, caption }: PaperChartBlockProps) {
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
  const takeaway = CHART_TAKEAWAYS[block.dataKey]
  const metadata = CHART_METADATA[block.dataKey] ?? []
  const provenance = CHART_PROVENANCE[block.dataKey]
  const { minSlot, maxSlot } = getSlotBounds(datasets)
  const inspectedSlot = hoverSlot ?? maxSlot
  const isDenseFigure = datasets.length > 4
  const seriesGroups = Array.from(new Set(datasets.map(dataset => getSeriesGroupLabel(dataset.label))))
  const defaultFocusedGroup = seriesGroups.includes('γ=2/3') ? 'γ=2/3' : (seriesGroups[0] ?? null)
  const [focusedGroup, setFocusedGroup] = useState<string | null>(defaultFocusedGroup)

  const legendStats = datasets.map(dataset => {
    const first = dataset.gini[0]?.y ?? 0
    const last = dataset.gini[dataset.gini.length - 1]?.y ?? 0
    const delta = last - first
    return { label: dataset.label, color: dataset.color, dashed: dataset.dashed, first, last, delta }
  })
  const activeGroup = isDenseFigure ? focusedGroup : null
  const visibleLegendStats = activeGroup == null
    ? legendStats
    : legendStats.filter(series => getSeriesGroupLabel(series.label) === activeGroup)
  const inspectorDatasets = activeGroup == null
    ? datasets
    : datasets.filter(dataset => getSeriesGroupLabel(dataset.label) === activeGroup)
  const showLegendDelta = !isDenseFigure

  return (
    <motion.div
      className="lab-panel overflow-hidden rounded-[1.3rem] border border-rule/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(255,255,255,0.99))] card-hover"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <div className="border-b border-rule/70 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-medium text-text-primary">
                {block.title}
              </h3>
              {block.cite && <CiteBadge cite={block.cite} />}
            </div>
            {description && (
              <p className="mt-1.5 text-sm leading-6 text-muted">
                {description}
              </p>
            )}
            {takeaway && (
              <p className="mt-2 text-[13px] leading-6 text-text-body">
                <span className="font-medium text-text-primary">What changes:</span>{' '}
                {takeaway}
              </p>
            )}
            {metadata.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metadata.map(item => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded-full border border-rule/60 bg-white/78 px-2.5 py-1 text-[11px] text-text-faint"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="inline-flex items-center rounded-full border border-rule/70 bg-white/85 px-3 py-1 text-[11px] font-medium text-text-faint">
            {hoverSlot != null ? `Inspecting slot ${hoverSlot.toLocaleString()}` : `Latest slot ${maxSlot.toLocaleString()}`}
          </div>
        </div>

        {isDenseFigure ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Focus threshold
              </span>
              {seriesGroups.map(group => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setFocusedGroup(group)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                    focusedGroup === group
                      ? 'border-accent/40 bg-accent/[0.08] text-text-primary'
                      : 'border-rule/60 bg-white/80 text-text-faint hover:text-text-primary',
                  )}
                >
                  {group}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFocusedGroup(null)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                  focusedGroup == null
                    ? 'border-accent/40 bg-accent/[0.08] text-text-primary'
                    : 'border-rule/60 bg-white/80 text-text-faint hover:text-text-primary',
                )}
              >
                Show all
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {visibleLegendStats.map(series => (
                <div
                  key={series.label}
                  className="inline-flex items-center gap-2 rounded-full border border-rule/60 bg-white/78 px-3 py-1.5"
                >
                  <svg width="18" height="8" viewBox="0 0 18 8" className="shrink-0">
                    <line
                      x1="0"
                      y1="4"
                      x2="18"
                      y2="4"
                      stroke={series.color}
                      strokeWidth={2}
                      strokeDasharray={series.dashed ? '4 2' : undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-[12px] font-medium text-text-primary">{series.label}</span>
                </div>
              ))}
              <span className="text-[11px] text-text-faint">
                Solid = External, dashed = Local.
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2.5">
            {visibleLegendStats.map(series => (
              <div
                key={series.label}
                className="inline-flex items-center gap-2 rounded-full border border-rule/60 bg-white/78 px-3 py-1.5"
              >
                <svg width="18" height="8" viewBox="0 0 18 8" className="shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    stroke={series.color}
                    strokeWidth={2}
                    strokeDasharray={series.dashed ? '4 2' : undefined}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-[12px] font-medium text-text-primary">{series.label}</span>
                {showLegendDelta && (
                  <span className={cn('text-[11px] tabular-nums', series.delta > 0 ? 'text-danger' : 'text-success')}>
                    {formatNum(series.first)} {'->'} {formatNum(series.last)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="overflow-hidden rounded-[1.12rem] border border-rule/60 bg-surface-active/45">
          <div className="grid gap-px bg-rule/55 lg:grid-cols-2">
            {METRICS.map(({ key, label, yLabel }, panelIndex) => (
              <div
                key={key}
                className="bg-white/90 px-3 py-3.5 sm:px-4"
              >
                <MiniChart
                  datasets={datasets}
                  metricKey={key}
                  metricLabel={label}
                  yLabel={yLabel}
                  hoverSlot={hoverSlot}
                  onHoverSlot={setHoverSlot}
                  gradientPrefix={gradientPrefix}
                  panelIndex={panelIndex}
                  activeGroup={activeGroup}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-rule/70 bg-white/74 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
              Slot inspector
            </p>
            <p className="mt-1 text-sm font-medium tabular-nums text-text-primary">
              {hoverSlot != null ? `Showing nearest raw values at slot ${hoverSlot.toLocaleString()}` : `Showing latest raw values at slot ${maxSlot.toLocaleString()}`}
            </p>
            {isDenseFigure && (
              <p className="mt-1 text-[11px] leading-5 text-text-faint">
                {activeGroup == null
                  ? 'Showing all gamma pairs. Use the focus pills above for a cleaner comparison.'
                  : `Showing the ${activeGroup} external/local pair. Switch to Show all to compare every threshold at once.`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setHoverSlot(null)}
            disabled={hoverSlot === null}
            className="rounded-full border border-rule/70 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-text-faint transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-50"
          >
            Reset to latest
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] font-medium tabular-nums text-text-faint">{minSlot}</span>
          <input
            type="range"
            min={minSlot}
            max={maxSlot}
            step={1}
            value={inspectedSlot}
            onChange={event => setHoverSlot(Number(event.currentTarget.value))}
            className="h-2 w-full cursor-pointer accent-[var(--color-accent)]"
            aria-label="Inspect chart values by slot"
          />
          <span className="text-[11px] font-medium tabular-nums text-text-faint">{maxSlot.toLocaleString()}</span>
        </div>

        <div className={cn('mt-4 grid gap-2', isDenseFigure ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4')}>
          {inspectorDatasets.map(dataset => {
            const values = METRICS.map(metric => ({
              label: metric.label,
              value: pointAtSlot(dataset[metric.key], inspectedSlot)?.y ?? 0,
            }))

            return (
              <div
                key={dataset.label}
                className="rounded-xl border border-rule/60 bg-white/88 px-3.5 py-3"
              >
                <div className="flex items-center gap-2">
                  <svg width="14" height="7" viewBox="0 0 14 7" className="shrink-0">
                    <line
                      x1="0"
                      y1="3.5"
                      x2="14"
                      y2="3.5"
                      stroke={dataset.color}
                      strokeWidth={2}
                      strokeDasharray={dataset.dashed ? '3 2' : undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">{dataset.label}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
                  {values.map(value => (
                    <span key={value.label} className="flex items-baseline justify-between gap-2 text-text-body">
                      <span className="text-text-faint">{value.label}</span>
                      <span className="font-semibold text-text-primary">{formatNum(value.value)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {caption && (
          <p className="mt-4 text-xs leading-6 text-muted">
            {caption}
          </p>
        )}

        {provenance && (
          <details className="mt-4 overflow-hidden rounded-xl border border-rule/60 bg-white/72">
            <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12px] font-medium text-text-primary marker:content-none">
              Provenance
            </summary>
            <div className="border-t border-rule/60 px-3.5 py-3 text-xs leading-6 text-muted">
              <p>{provenance.datasetSummary}</p>
              <a
                href={provenance.figureHref}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-[12px] font-medium text-accent hover:text-accent/80"
              >
                {provenance.figureLabel}
              </a>
              <div className="mt-2 space-y-1.5">
                {provenance.repoPaths.map(path => (
                  <p key={path} className="font-mono text-[11px] text-text-faint">
                    {path}
                  </p>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </motion.div>
  )
}
