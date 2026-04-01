import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ExternalLink, SlidersHorizontal } from 'lucide-react'
import { cn } from '../../lib/cn'
import { buildPublishedEvidenceUrl } from '../../lib/published-evidence-url'
import { SPRING_CRISP, CHART } from '../../lib/theme'
import { crosshairFadeNearLive } from '../../lib/chart-animations'
import { getActiveStudy } from '../../studies'
import type { PaperChartBlock as PaperChartBlockType } from '../../types/blocks'
import { CiteBadge } from './CiteBadge'
import type { PaperChartPoint, PaperChartDataset } from '../../data/paper-chart-data'

interface PaperChartBlockProps {
  readonly block: PaperChartBlockType
  readonly caption?: string
}

type MetricKey = 'gini' | 'hhi' | 'liveness' | 'cv'

const METRICS: readonly { key: MetricKey; label: string; yLabel: string }[] = [
  { key: 'gini', label: 'Gini_g', yLabel: 'Gini_g' },
  { key: 'hhi', label: 'HHI_g', yLabel: 'HHI_g' },
  { key: 'liveness', label: 'LC_g', yLabel: 'LC_g' },
  { key: 'cv', label: 'CV_g', yLabel: 'CV_g' },
]

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

const MiniChart = memo(function MiniChart({
  datasets,
  metricKey,
  metricLabel,
  yLabel,
  hoverSlot,
  onHoverSlot,
  gradientPrefix,
  activeGroup,
}: {
  readonly datasets: readonly PaperChartDataset[]
  readonly metricKey: MetricKey
  readonly metricLabel: string
  readonly yLabel: string
  readonly hoverSlot: number | null
  readonly onHoverSlot: (slot: number | null) => void
  readonly gradientPrefix: string
  readonly activeGroup: string | null
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
      yTicks,
      xTicks,
      latestSvgX: mapX(maxX),
      mapX,
      mapY,
      series,
    }
  }, [chartH, chartW, datasets, metricKey, padding.left, padding.right, padding.top])

  if (!chartGeometry) return null

  const { minX, rangeX, yTicks, xTicks, latestSvgX, mapX, mapY, series } = chartGeometry
  const isDenseFigure = datasets.length > 4
  const showAreaFill = !isDenseFigure
  const hoverSvgX = hoverSlot != null ? mapX(hoverSlot) : null
  const crosshairOpacity = hoverSvgX != null
    ? CHART.crosshairOpacity * crosshairFadeNearLive(hoverSvgX, latestSvgX, CHART.crosshairFadeDistance)
    : 0
  const hoverReadout = hoverSlot == null
    ? []
    : series.flatMap(({ dataset, points }) => {
      const isFocusedSeries = activeGroup == null || getSeriesGroupLabel(dataset.label) === activeGroup
      if (!isFocusedSeries) return []
      const point = pointAtSlot(points, hoverSlot)
      if (!point) return []
      return [{ label: dataset.label, value: point.y, color: dataset.color, dashed: dataset.dashed }]
    })
  const visibleHoverReadout = activeGroup == null ? hoverReadout.slice(0, 4) : hoverReadout
  const hiddenHoverReadoutCount = hoverReadout.length - visibleHoverReadout.length

  function updateHoverSlot(clientX: number, currentTarget: SVGSVGElement) {
    const rect = currentTarget.getBoundingClientRect()
    const relX = ((clientX - rect.left) / rect.width) * svgW
    if (relX >= padding.left && relX <= svgW - padding.right) {
      const slot = minX + ((relX - padding.left) / chartW) * rangeX
      onHoverSlot(Math.round(slot))
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="mb-2 flex items-start justify-between gap-3 px-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
            {metricLabel}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {yLabel}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-faint">
            {hoverSlot != null ? `Slot ${hoverSlot.toLocaleString()}` : 'Latest'}
          </div>
          <div className="mt-0.5 text-[11px] text-text-primary">
            {hoverSlot != null ? 'Hover readout' : formatSlotTick(chartGeometry.maxX)}
          </div>
        </div>
      </div>

      {hoverSlot != null && visibleHoverReadout.length > 0 && (
        <div className="pointer-events-none absolute right-1 top-10 z-10 max-w-[11.5rem] rounded-[14px] border border-accent/12 bg-white/96 px-3 py-2 shadow-[0_12px_34px_rgba(37,99,235,0.12)] backdrop-blur-sm">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-accent/70">
            Value readout
          </div>
          <div className="mt-1.5 space-y-1.5">
            {visibleHoverReadout.map(entry => (
              <div key={entry.label} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-text-body">
                  <svg width="16" height="6" viewBox="0 0 16 6" className="shrink-0">
                    <line
                      x1="0"
                      y1="3"
                      x2="16"
                      y2="3"
                      stroke={entry.color}
                      strokeWidth={1.8}
                      strokeDasharray={entry.dashed ? '4 2' : undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="truncate">{entry.label}</span>
                </span>
                <span className="font-semibold tabular-nums text-text-primary">{formatNum(entry.value)}</span>
              </div>
            ))}
            {hiddenHoverReadoutCount > 0 && (
              <div className="text-[10px] text-text-faint">
                +{hiddenHoverReadoutCount} more series in the full view
              </div>
            )}
          </div>
        </div>
      )}

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
            <g key={tick} opacity={0.92 - tickIndex * 0.12}>
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
            </g>
          )
        })}

        {xTicks.map((tick, index) => {
          const sx = mapX(tick)
          return (
            <text
              key={tick}
              x={sx}
              y={svgH - 11}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 10 }}
              opacity={0.78 - index * 0.08}
            >
              {formatSlotTick(tick)}
            </text>
          )
        })}

        <text
          x={padding.left + chartW / 2}
          y={svgH - 1}
          textAnchor="middle"
          className="fill-muted"
          style={{ fontSize: 9 }}
          opacity={0.6}
        >
          Slot
        </text>

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
                <path
                  d={areaD}
                  fill={`url(#${gradientPrefix}-${metricKey}-${index})`}
                  opacity={0.95}
                />
              )}

              <path
                d={pathD}
                fill="none"
                stroke={dataset.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dataset.dashed ? '6 3' : undefined}
                opacity={lineOpacity}
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
                  <circle
                    cx={latest.sx}
                    cy={latest.sy}
                    r={4.25}
                    fill="white"
                    stroke={dataset.color}
                    strokeWidth={1.4}
                    filter={`drop-shadow(0 1px 2px ${dataset.color}25)`}
                    opacity={latestOpacity}
                  />
                  <circle
                    cx={latest.sx}
                    cy={latest.sy}
                    r={2.15}
                    fill={dataset.color}
                    opacity={latestOpacity}
                  />
                </g>
              )}

              {hoveredCoord && (
                <circle
                  cx={hoveredCoord.sx}
                  cy={hoveredCoord.sy}
                  r={4.75}
                  fill="white"
                  stroke={dataset.color}
                  strokeWidth={1.8}
                />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
})

export function PaperChartBlock({ block, caption }: PaperChartBlockProps) {
  const chart = getActiveStudy().paperCharts[block.dataKey]
  const chartData = chart?.data
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null)
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const gradientPrefix = useId().replace(/:/g, '')
  const hoverRafRef = useRef<number | null>(null)
  const pendingHoverSlotRef = useRef<number | null>(null)

  const commitHoverSlot = useCallback((slot: number | null) => {
    pendingHoverSlotRef.current = slot
    if (hoverRafRef.current != null) return

    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = null
      setHoverSlot(current => (current === pendingHoverSlotRef.current ? current : pendingHoverSlotRef.current))
    })
  }, [])

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) window.cancelAnimationFrame(hoverRafRef.current)
    }
  }, [])

  if (!chartData || !chart) {
    return (
      <div className="lab-panel rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        <p className="mt-2 text-sm text-muted">No chart data for key: {block.dataKey}</p>
      </div>
    )
  }

  const { datasets } = chartData
  const { minSlot, maxSlot } = getSlotBounds(datasets)
  const inspectedSlot = hoverSlot ?? maxSlot
  const isDenseFigure = datasets.length > 4
  const seriesGroups = Array.from(new Set(datasets.map(dataset => getSeriesGroupLabel(dataset.label))))
  const defaultFocusedGroup = seriesGroups.includes('γ=2/3') ? 'γ=2/3' : (seriesGroups[0] ?? null)
  const resolvedFocusedGroup = isDenseFigure
    ? (showAllGroups ? null : (focusedGroup ?? defaultFocusedGroup))
    : null

  const legendStats = datasets.map(dataset => {
    const first = dataset.gini[0]?.y ?? 0
    const last = dataset.gini[dataset.gini.length - 1]?.y ?? 0
    const delta = last - first
    return { label: dataset.label, color: dataset.color, dashed: dataset.dashed, first, last, delta }
  })

  const visibleLegendStats = resolvedFocusedGroup == null
    ? legendStats
    : legendStats.filter(series => getSeriesGroupLabel(series.label) === resolvedFocusedGroup)
  const inspectorDatasets = resolvedFocusedGroup == null
    ? datasets
    : datasets.filter(dataset => getSeriesGroupLabel(dataset.label) === resolvedFocusedGroup)
  const showLegendDelta = !isDenseFigure
  const publishedScenarioLinks = chart.publishedScenarioLinks ?? []
  const settingsSummary = isDenseFigure
    ? resolvedFocusedGroup != null
      ? `${resolvedFocusedGroup} pair selected`
      : `${visibleLegendStats.length} series visible`
    : `${visibleLegendStats.length} series visible`

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
            {chart.description && (
              <p className="mt-1.5 text-sm leading-6 text-muted">
                {chart.description}
              </p>
            )}
            {chart.takeaway && (
              <p className="mt-2 text-[13px] leading-6 text-text-body">
                <span className="font-medium text-text-primary">What changes:</span>{' '}
                {chart.takeaway}
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="inline-flex items-center rounded-full border border-rule/70 bg-white/85 px-3 py-1 text-[11px] font-medium text-text-faint">
              {hoverSlot != null ? `Inspecting slot ${hoverSlot.toLocaleString()}` : `Latest slot ${maxSlot.toLocaleString()}`}
            </div>
            <div className="text-[11px] text-text-faint">
              Hover a line for exact values.
            </div>
          </div>
        </div>

        <details
          open={settingsOpen}
          onToggle={event => setSettingsOpen(event.currentTarget.open)}
          className="group/details mt-4 overflow-hidden rounded-[1.1rem] border border-rule/70 bg-white/82"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-text-primary">Figure settings</div>
                <div className="text-[11px] text-text-faint">
                  {settingsSummary}. Open for filters, replay links, and slot readout.
                </div>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-faint transition-transform duration-150 group-open/details:rotate-180" />
          </summary>

          <div className="border-t border-rule/60 px-4 py-4">
            {isDenseFigure && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Focus threshold
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {seriesGroups.map(group => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => {
                        setShowAllGroups(false)
                        setFocusedGroup(group)
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                        resolvedFocusedGroup === group
                          ? 'border-accent/40 bg-accent/[0.08] text-text-primary'
                          : 'border-rule/60 bg-white/80 text-text-faint hover:text-text-primary',
                      )}
                    >
                      {group}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllGroups(true)
                      setFocusedGroup(null)
                    }}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                      showAllGroups
                        ? 'border-accent/40 bg-accent/[0.08] text-text-primary'
                        : 'border-rule/60 bg-white/80 text-text-faint hover:text-text-primary',
                    )}
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}

            <div className={cn('grid gap-4', isDenseFigure ? 'mt-4 lg:grid-cols-[minmax(0,1fr)_320px]' : 'mt-0')}>
              <div className={cn(isDenseFigure && 'min-w-0')}>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Visible series
                </div>
                <div className="mt-2 flex flex-wrap gap-2.5">
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
                <div className="mt-2 text-[11px] text-text-faint">
                  Solid = External, dashed = Local.
                </div>

                {(chart.metadata.length > 0 || publishedScenarioLinks.length > 0) && (
                  <div className="mt-4 space-y-3">
                    {publishedScenarioLinks.length > 0 && (
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                          Open replay
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {publishedScenarioLinks.map(link => (
                            <a
                              key={`${link.evaluation}-${link.paradigm}-${link.result}`}
                              href={buildPublishedEvidenceUrl(link)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.05] px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/[0.1]"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {chart.metadata.length > 0 && (
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                          Published setup
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {chart.metadata.map(item => (
                            <span
                              key={item}
                              className="inline-flex items-center rounded-full border border-rule/60 bg-white/78 px-2.5 py-1 text-[11px] text-text-faint"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-[1rem] border border-rule/60 bg-surface-active/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                      Slot readout
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-text-primary">
                      {hoverSlot != null ? `Nearest available values at slot ${hoverSlot.toLocaleString()}` : `Latest available values at slot ${maxSlot.toLocaleString()}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => commitHoverSlot(null)}
                    disabled={hoverSlot === null}
                    className="rounded-full border border-rule/70 bg-white px-3 py-1.5 text-[11px] font-medium text-text-faint transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span className="text-[11px] font-medium tabular-nums text-text-faint">{minSlot}</span>
                  <input
                    type="range"
                    min={minSlot}
                    max={maxSlot}
                    step={1}
                    value={inspectedSlot}
                    onChange={event => commitHoverSlot(Number(event.currentTarget.value))}
                    className="h-2 w-full cursor-pointer accent-[var(--color-accent)]"
                    aria-label="Inspect chart values by slot"
                  />
                  <span className="text-[11px] font-medium tabular-nums text-text-faint">{maxSlot.toLocaleString()}</span>
                </div>

                {isDenseFigure && (
                  <p className="mt-3 text-[11px] leading-5 text-text-faint">
                    {resolvedFocusedGroup == null
                      ? 'Showing all gamma pairs. Pick one threshold above for a cleaner comparison.'
                      : `Showing the ${resolvedFocusedGroup} external/local pair. Switch to Show all to compare every threshold at once.`}
                  </p>
                )}

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="overflow-hidden rounded-[1.12rem] border border-rule/60 bg-surface-active/45">
          <div className="grid gap-px bg-rule/55 lg:grid-cols-2">
            {METRICS.map(({ key, label, yLabel }) => (
              <div
                key={key}
                className="bg-white/92 px-3 py-3.5 sm:px-4"
              >
                <MiniChart
                  datasets={datasets}
                  metricKey={key}
                  metricLabel={label}
                  yLabel={yLabel}
                  hoverSlot={hoverSlot}
                  onHoverSlot={commitHoverSlot}
                  gradientPrefix={gradientPrefix}
                  activeGroup={resolvedFocusedGroup}
                />
              </div>
            ))}
          </div>
          <div className="border-t border-rule/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,250,252,0.94))] px-4 py-3 text-[11px] text-text-faint sm:px-5">
            Hover across the lines for slot-by-slot values. Open figure settings only when you need filters, replay links, or the full slot inspector.
          </div>
        </div>
      </div>

      <div className="border-t border-rule/70 bg-white/74 px-5 py-4 sm:px-6">
        {caption && (
          <p className="text-xs leading-6 text-muted">
            {caption}
          </p>
        )}

        <details className={cn('overflow-hidden rounded-xl border border-rule/60 bg-white/72', caption ? 'mt-4' : '')}>
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12px] font-medium text-text-primary marker:content-none">
            Provenance
          </summary>
          <div className="border-t border-rule/60 px-3.5 py-3 text-xs leading-6 text-muted">
            <p>{chart.datasetSummary}</p>
            <a
              href={chart.figureHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80"
            >
              <ExternalLink className="h-3 w-3" />
              {chart.figureLabel}
            </a>
            <div className="mt-2 space-y-1.5">
              {chart.repoPaths.map(path => (
                <p key={path} className="font-mono text-[11px] text-text-faint">
                  {path}
                </p>
              ))}
            </div>
          </div>
        </details>
      </div>
    </motion.div>
  )
}
