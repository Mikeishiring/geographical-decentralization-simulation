import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'

const SPARKLINE_WIDTH = 220
const SPARKLINE_HEIGHT = 58

export interface PublishedReplayMetricStripCard {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly color: string
  readonly series: readonly number[]
  readonly currentSlotIndex: number
  readonly totalSlotsLabel?: string
  readonly formatSeriesValue: (value: number) => string
  readonly comparisonSeries?: readonly number[]
  readonly comparisonSlotIndex?: number | null
  readonly comparisonLabel?: string
}

interface PublishedReplayMetricStripProps {
  readonly cards: readonly PublishedReplayMetricStripCard[]
  readonly activeCardId?: string | null
  readonly onCardActivate?: (card: PublishedReplayMetricStripCard) => void
  readonly className?: string
}

interface SparklineGeometry {
  readonly path: string
  readonly areaPath: string
  readonly currentX: number
  readonly currentY: number
}

function clampIndex(length: number, index: number): number {
  if (length <= 0) return 0
  return Math.max(0, Math.min(length - 1, Math.floor(index)))
}

function buildSparkline(
  values: readonly number[],
  currentIndex: number,
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT,
): SparklineGeometry {
  if (values.length === 0) {
    return {
      path: '',
      areaPath: '',
      currentX: 0,
      currentY: height / 2,
    }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - (((value - min) / range) * (height - 10) + 5)
    return { x, y }
  })
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${path} L ${width.toFixed(2)} ${height} L 0 ${height} Z`
  const currentPoint = points[clampIndex(points.length, currentIndex)] ?? points[points.length - 1]!

  return {
    path,
    areaPath,
    currentX: currentPoint.x,
    currentY: currentPoint.y,
  }
}

function readSeriesValue(values: readonly number[], index: number): number | null {
  if (values.length === 0) return null
  return values[clampIndex(values.length, index)] ?? null
}

function deltaLabel(value: number | null, baseline: number | null, formatSeriesValue: (value: number) => string): string {
  if (value == null || baseline == null) return 'N/A'
  const delta = value - baseline
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${formatSeriesValue(delta)}`
}

function comparisonDeltaLabel(
  value: number | null,
  comparisonValue: number | null,
  formatSeriesValue: (value: number) => string,
): string {
  if (value == null || comparisonValue == null) return 'N/A'
  const delta = value - comparisonValue
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${formatSeriesValue(delta)}`
}

function PublishedReplayMetricCard({
  card,
  active,
  onActivate,
}: {
  readonly card: PublishedReplayMetricStripCard
  readonly active: boolean
  readonly onActivate?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const primarySpark = useMemo(
    () => buildSparkline(card.series, card.currentSlotIndex),
    [card.currentSlotIndex, card.series],
  )
  const comparisonSpark = useMemo(
    () => card.comparisonSeries?.length
      ? buildSparkline(card.comparisonSeries, card.comparisonSlotIndex ?? card.currentSlotIndex)
      : null,
    [card.comparisonSeries, card.comparisonSlotIndex, card.currentSlotIndex],
  )

  const currentValue = readSeriesValue(card.series, card.currentSlotIndex)
  const baselineValue = readSeriesValue(card.series, 0)
  const peakValue = card.series.length > 0 ? Math.max(...card.series) : null
  const comparisonValue = card.comparisonSeries?.length
    ? readSeriesValue(card.comparisonSeries, card.comparisonSlotIndex ?? card.currentSlotIndex)
    : null
  const currentSlotNumber = card.currentSlotIndex + 1

  return (
    <motion.button
      type="button"
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border bg-white/96 px-4 py-4 text-left transition-all duration-200',
        active
          ? 'border-accent shadow-[0_18px_36px_rgba(37,99,235,0.12)]'
          : 'border-rule hover:border-border-hover hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, ${card.color}, transparent 82%)` }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
          <div className="mt-2 text-lg font-semibold tabular-nums tracking-[-0.02em] text-text-primary">{card.value}</div>
          <div className="mt-1 text-xs leading-5 text-muted">{card.detail}</div>
        </div>
        <div className="rounded-full border border-rule bg-surface-active px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">
          Slot {currentSlotNumber.toLocaleString()}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-rule bg-surface-active/70 px-3 py-3">
        {card.series.length > 0 ? (
          <svg viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`published-metric-fill-${card.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={card.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={card.color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <path d={primarySpark.areaPath} fill={`url(#published-metric-fill-${card.id})`} />
            {comparisonSpark ? (
              <path
                d={comparisonSpark.path}
                fill="none"
                stroke="rgba(100,116,139,0.72)"
                strokeWidth="1.45"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            <path
              d={primarySpark.path}
              fill="none"
              stroke={card.color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1={primarySpark.currentX}
              y1={0}
              x2={primarySpark.currentX}
              y2={SPARKLINE_HEIGHT}
              stroke={card.color}
              strokeWidth="1"
              strokeOpacity={0.18}
            />
            <circle cx={primarySpark.currentX} cy={primarySpark.currentY} r="4.2" fill={card.color} fillOpacity={0.12} />
            <circle cx={primarySpark.currentX} cy={primarySpark.currentY} r="2.6" fill="white" stroke={card.color} strokeWidth="1.4" />
          </svg>
        ) : (
          <div className="flex h-[58px] items-center text-xs text-muted">Series unavailable</div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[0.6875rem] text-text-faint">
        <span>{card.totalSlotsLabel ?? `${card.series.length.toLocaleString()} slots tracked`}</span>
        <span className="tabular-nums text-text-primary">
          {currentValue == null ? 'N/A' : card.formatSeriesValue(currentValue)}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {hovered ? (
          <motion.div
            key="hover-details"
            className="mt-3 grid gap-2 sm:grid-cols-3"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={SPRING_CRISP}
          >
            <div className="rounded-lg border border-rule bg-white/90 px-2.5 py-2">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">vs slot 1</div>
              <div className="mt-1 text-xs font-medium tabular-nums text-text-primary">
                {deltaLabel(currentValue, baselineValue, card.formatSeriesValue)}
              </div>
            </div>
            <div className="rounded-lg border border-rule bg-white/90 px-2.5 py-2">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">Peak</div>
              <div className="mt-1 text-xs font-medium tabular-nums text-text-primary">
                {peakValue == null ? 'N/A' : card.formatSeriesValue(peakValue)}
              </div>
            </div>
            <div className="rounded-lg border border-rule bg-white/90 px-2.5 py-2">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">
                {card.comparisonSeries?.length ? `vs ${card.comparisonLabel ?? 'comparison'}` : 'Current slot'}
              </div>
              <div className="mt-1 text-xs font-medium tabular-nums text-text-primary">
                {card.comparisonSeries?.length
                  ? comparisonDeltaLabel(currentValue, comparisonValue, card.formatSeriesValue)
                  : currentValue == null
                    ? 'N/A'
                    : card.formatSeriesValue(currentValue)}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.button>
  )
}

export function PublishedReplayMetricStrip({
  cards,
  activeCardId = null,
  onCardActivate,
  className,
}: PublishedReplayMetricStripProps) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-4', className)}>
      {cards.map(card => (
        <PublishedReplayMetricCard
          key={card.id}
          card={card}
          active={activeCardId === card.id}
          onActivate={onCardActivate ? () => onCardActivate(card) : undefined}
        />
      ))}
    </div>
  )
}
