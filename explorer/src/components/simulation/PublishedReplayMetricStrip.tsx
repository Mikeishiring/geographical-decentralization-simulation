import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'
import { InteractiveInspector } from '../ui/InteractiveInspector'

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
  readonly onCardScrub?: (card: PublishedReplayMetricStripCard, slotIndex: number) => void
  readonly className?: string
}

interface SparklineGeometry {
  readonly path: string
  readonly areaPath: string
  readonly currentX: number
  readonly currentY: number
}

interface SeriesExtreme {
  readonly value: number
  readonly slotIndex: number
}

function clampIndex(length: number, index: number): number {
  if (length <= 0) return 0
  return Math.max(0, Math.min(length - 1, Math.floor(index)))
}

function alignSlotByProgress(sourceIndex: number, sourceLength: number, comparisonLength: number): number {
  if (comparisonLength <= 1) return 0
  if (sourceLength <= 1) return Math.max(0, comparisonLength - 1)
  const progress = clampIndex(sourceLength, sourceIndex) / Math.max(1, sourceLength - 1)
  return clampIndex(comparisonLength, progress * Math.max(0, comparisonLength - 1))
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

  // Build smooth monotone cubic spline instead of straight segments
  let path: string
  if (points.length < 3) {
    path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  } else {
    const parts: string[] = [`M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`]
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]!
      const p1 = points[i]!
      const p2 = points[i + 1]!
      const p3 = points[Math.min(points.length - 1, i + 2)]!
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      parts.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`)
    }
    path = parts.join(' ')
  }

  const lastPoint = points[points.length - 1]!
  const areaPath = `${path} L ${lastPoint.x.toFixed(2)} ${height} L ${points[0]!.x.toFixed(2)} ${height} Z`
  const currentPoint = points[clampIndex(points.length, currentIndex)] ?? lastPoint

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

function resolveSeriesExtreme(
  values: readonly number[],
  direction: 'max' | 'min',
): SeriesExtreme | null {
  if (values.length === 0) return null

  let slotIndex = 0
  let bestValue = values[0]!

  for (let index = 1; index < values.length; index += 1) {
    const nextValue = values[index]!
    const isBetter = direction === 'max' ? nextValue > bestValue : nextValue < bestValue
    if (isBetter) {
      bestValue = nextValue
      slotIndex = index
    }
  }

  return { value: bestValue, slotIndex }
}

function resolveSlotIndexFromPointer(
  event: ReactPointerEvent<HTMLDivElement>,
  width: number,
  seriesLength: number,
): number {
  if (seriesLength <= 1 || width <= 0) return 0
  const clampedX = Math.max(0, Math.min(width, event.clientX - event.currentTarget.getBoundingClientRect().left))
  const progress = clampedX / width
  return clampIndex(seriesLength, progress * Math.max(0, seriesLength - 1))
}

function PublishedReplayMetricCard({
  card,
  active,
  onActivate,
  onScrub,
}: {
  readonly card: PublishedReplayMetricStripCard
  readonly active: boolean
  readonly onActivate?: () => void
  readonly onScrub?: (slotIndex: number) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [previewSlotIndex, setPreviewSlotIndex] = useState<number | null>(null)
  const sparklineRef = useRef<HTMLDivElement | null>(null)
  const effectiveSlotIndex = previewSlotIndex ?? card.currentSlotIndex
  const effectiveComparisonSlotIndex = card.comparisonSeries?.length
    ? previewSlotIndex != null
      ? alignSlotByProgress(previewSlotIndex, card.series.length, card.comparisonSeries.length)
      : card.comparisonSlotIndex ?? card.currentSlotIndex
    : null

  const primarySpark = useMemo(
    () => buildSparkline(card.series, effectiveSlotIndex),
    [card.series, effectiveSlotIndex],
  )
  const comparisonSpark = useMemo(
    () => card.comparisonSeries?.length
      ? buildSparkline(card.comparisonSeries, effectiveComparisonSlotIndex ?? effectiveSlotIndex)
      : null,
    [card.comparisonSeries, effectiveComparisonSlotIndex, effectiveSlotIndex],
  )

  const currentValue = readSeriesValue(card.series, effectiveSlotIndex)
  const baselineValue = readSeriesValue(card.series, 0)
  const previousValue = readSeriesValue(card.series, Math.max(0, effectiveSlotIndex - 1))
  const peak = useMemo(() => resolveSeriesExtreme(card.series, 'max'), [card.series])
  const trough = useMemo(() => resolveSeriesExtreme(card.series, 'min'), [card.series])
  const comparisonValue = card.comparisonSeries?.length
    ? readSeriesValue(card.comparisonSeries, effectiveComparisonSlotIndex ?? effectiveSlotIndex)
    : null
  const effectiveSlotNumber = effectiveSlotIndex + 1
  const showExpanded = hovered || active || previewSlotIndex != null
  const showSparkTooltip = previewSlotIndex != null || hovered
  const headlineValue = previewSlotIndex != null && currentValue != null
    ? card.formatSeriesValue(currentValue)
    : card.value
  const scrubProgress = card.series.length > 1
    ? Math.round((effectiveSlotIndex / Math.max(1, card.series.length - 1)) * 100)
    : 100
  const sparkTooltipLeft = `${(primarySpark.currentX / SPARKLINE_WIDTH) * 100}%`

  const commitPreviewSlot = (slotIndexToCommit: number | null) => {
    if (slotIndexToCommit == null) return
    onActivate?.()
    onScrub?.(slotIndexToCommit)
  }

  const handleSparklinePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const width = sparklineRef.current?.getBoundingClientRect().width ?? 0
    const nextSlotIndex = resolveSlotIndexFromPointer(event, width, card.series.length)
    setPreviewSlotIndex(nextSlotIndex)
    if (event.pointerType !== 'mouse') {
      commitPreviewSlot(nextSlotIndex)
    }
  }

  const handleSparklinePointerLeave = () => {
    setPreviewSlotIndex(null)
    setHovered(false)
  }

  const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onActivate?.()
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        setPreviewSlotIndex(null)
      }}
      onFocus={() => setHovered(true)}
      onBlur={() => {
        setHovered(false)
        setPreviewSlotIndex(null)
      }}
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
          <div className="mt-2 text-lg font-semibold tabular-nums tracking-[-0.02em] text-text-primary">{headlineValue}</div>
          <div className="mt-1 text-xs leading-5 text-muted">{card.detail}</div>
        </div>
        <div className="rounded-full border border-rule bg-surface-active px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">
          Slot {effectiveSlotNumber.toLocaleString()}
        </div>
      </div>

      <div
        ref={sparklineRef}
        className="relative mt-4 cursor-crosshair overflow-hidden rounded-xl border border-rule bg-surface-active/70 px-3 py-3"
        onClick={event => {
          event.stopPropagation()
          commitPreviewSlot(previewSlotIndex ?? card.currentSlotIndex)
        }}
        onPointerDown={handleSparklinePointerMove}
        onPointerMove={handleSparklinePointerMove}
        onPointerLeave={handleSparklinePointerLeave}
      >
        <AnimatePresence initial={false}>
          {showSparkTooltip && currentValue != null ? (
            <motion.div
              key="spark-tooltip"
              className="pointer-events-none absolute top-2 z-10"
              style={{
                left: sparkTooltipLeft,
                transform: 'translateX(-50%)',
              }}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={SPRING_CRISP}
            >
              <div className="rounded-lg border border-rule/80 bg-white/96 px-2.5 py-2 shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">
                  Slot {effectiveSlotNumber.toLocaleString()}
                </div>
                <div className="mt-1 text-xs font-medium tabular-nums text-text-primary">
                  {card.formatSeriesValue(currentValue)}
                </div>
                <div className="mt-1 text-[0.625rem] text-muted">
                  {card.comparisonSeries?.length
                    ? `vs ${card.comparisonLabel ?? 'comparison'} ${comparisonDeltaLabel(currentValue, comparisonValue, card.formatSeriesValue)}`
                    : `vs prev ${deltaLabel(currentValue, previousValue, card.formatSeriesValue)}`}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

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

      <div className="mt-1 flex items-center justify-between gap-3 text-[0.625rem] uppercase tracking-[0.08em] text-text-faint">
        <span>
          {previewSlotIndex != null
            ? 'Previewing replay cursor'
            : active
              ? 'Pinned to viewer focus'
              : 'Hover, drag, or tap to inspect'}
        </span>
        <span>{scrubProgress}% through replay</span>
      </div>

      <AnimatePresence initial={false}>
        {showExpanded ? (
          <InteractiveInspector
            eyebrow="Replay inspection"
            title={`${card.label} at slot ${effectiveSlotNumber.toLocaleString()}`}
            subtitle={
              previewSlotIndex != null
                ? `Scrubbing ${scrubProgress}% through the replay timeline.`
                : active
                  ? 'Pinned to the current viewer slot for side-by-side reading.'
                  : 'Hover the sparkline to inspect turning points and slot-level changes.'
            }
            hint={card.comparisonSeries?.length ? 'Compare ready' : 'Slot scrub'}
            metrics={[
              {
                label: 'Value',
                value: currentValue == null ? 'N/A' : card.formatSeriesValue(currentValue),
                tone: 'accent',
              },
              {
                label: 'Vs slot 1',
                value: deltaLabel(currentValue, baselineValue, card.formatSeriesValue),
              },
              {
                label: card.comparisonSeries?.length ? `Vs ${card.comparisonLabel ?? 'comparison'}` : 'Vs prev',
                value: card.comparisonSeries?.length
                  ? comparisonDeltaLabel(currentValue, comparisonValue, card.formatSeriesValue)
                  : deltaLabel(currentValue, previousValue, card.formatSeriesValue),
                tone: card.comparisonSeries?.length ? 'muted' : 'default',
              },
              {
                label: 'Peak',
                value: peak
                  ? `${card.formatSeriesValue(peak.value)} · slot ${(peak.slotIndex + 1).toLocaleString()}`
                  : 'N/A',
              },
              {
                label: 'Low',
                value: trough
                  ? `${card.formatSeriesValue(trough.value)} · slot ${(trough.slotIndex + 1).toLocaleString()}`
                  : 'N/A',
              },
            ]}
            className="mt-3"
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

export function PublishedReplayMetricStrip({
  cards,
  activeCardId = null,
  onCardActivate,
  onCardScrub,
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
          onScrub={onCardScrub ? slotIndex => onCardScrub(card, slotIndex) : undefined}
        />
      ))}
    </div>
  )
}
