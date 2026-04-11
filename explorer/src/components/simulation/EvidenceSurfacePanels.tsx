import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { InlineTooltip } from '../ui/Tooltip'
import { SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { formatNumber, paradigmLabel } from './simulation-constants'
import {
  LIVENESS_DESCRIPTION,
  LIVENESS_LABEL,
  formatLivenessCount,
  formatLivenessCountWithUnit,
  totalSlotsFromPayload,
  topRegionsForSlot,
  activeRegionCountAtSlot,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import type { ResearchMetadata } from './simulation-lab-types'
import {
  CHART_COLORS,
  CATEGORY_DESCRIPTIONS,
  THRESHOLDS,
  sentimentLower,
  sentimentHigher,
  type MetricSentiment,
} from './simulation-evidence-constants'

// ── Inline sparkline ────────────────────────────────────────────────────────

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const normalized = hex.length === 3 ? hex.split('').map(char => `${char}${char}`).join('') : hex
    if (normalized.length === 6) {
      const r = Number.parseInt(normalized.slice(0, 2), 16)
      const g = Number.parseInt(normalized.slice(2, 4), 16)
      const b = Number.parseInt(normalized.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  return color
}

interface SparklineGeometry {
  readonly coords: ReadonlyArray<{ x: number; y: number; value: number }>
  readonly points: string
  readonly areaD: string
  readonly baselineY: number
}

/** Inset padding so end-of-line circles aren't clipped by the viewBox edge */
const SPARK_PAD = 4

function buildSparklineGeometry(
  data: readonly number[],
  width: number,
  height: number,
): SparklineGeometry | null {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const innerW = width - SPARK_PAD * 2
  const innerH = height - SPARK_PAD * 2
  const step = innerW / (data.length - 1)
  const coords = data.map((value, index) => ({
    x: Number((SPARK_PAD + index * step).toFixed(1)),
    y: Number((SPARK_PAD + innerH - ((value - min) / range) * innerH).toFixed(1)),
    value,
  }))
  const points = coords.map(coord => `${coord.x},${coord.y}`).join(' ')
  const last = coords[coords.length - 1]!
  const baselineY = height - 1
  const areaD = `${coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ')} L ${last.x} ${baselineY} L ${coords[0]!.x} ${baselineY} Z`
  return { coords, points, areaD, baselineY }
}

/** Build a smooth monotone cubic SVG path from coordinate pairs */
function buildSmoothPath(coords: ReadonlyArray<{ x: number; y: number }>): string {
  if (coords.length < 2) return ''
  if (coords.length === 2) return `M ${coords[0]!.x} ${coords[0]!.y} L ${coords[1]!.x} ${coords[1]!.y}`

  const parts: string[] = [`M ${coords[0]!.x} ${coords[0]!.y}`]
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]!
    const p1 = coords[i]!
    const p2 = coords[i + 1]!
    const p3 = coords[Math.min(coords.length - 1, i + 2)]!

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    parts.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`)
  }
  return parts.join(' ')
}

function Sparkline({
  data,
  color,
  width = 88,
  height = 28,
  highlightIndex = null,
}: {
  readonly data: readonly number[]
  readonly color: string
  readonly width?: number
  readonly height?: number
  readonly highlightIndex?: number | null
}) {
  const geometry = buildSparklineGeometry(data, width, height)
  if (!geometry) return null
  const { coords, baselineY } = geometry
  const highlight = coords[Math.max(0, Math.min(coords.length - 1, highlightIndex ?? (coords.length - 1)))] ?? coords[coords.length - 1]!
  const smoothD = buildSmoothPath(coords)
  const last = coords[coords.length - 1]!
  const first = coords[0]!
  const smoothAreaD = `${smoothD} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`
  const gradientId = `spark-fill-${color.replace(/[^a-zA-Z0-9]/g, '')}`
  const edgeFadeId = `spark-edge-${color.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" style={{ overflow: 'visible' }} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={height}>
          <stop offset="0%" stopColor={color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
        {/* Horizontal edge fade mask — soft dissolve at left and right edges */}
        <linearGradient id={edgeFadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity={0} />
          <stop offset="12%" stopColor="white" stopOpacity={1} />
          <stop offset="85%" stopColor="white" stopOpacity={1} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
        <mask id={`${edgeFadeId}-mask`}>
          <rect width={width} height={height} fill={`url(#${edgeFadeId})`} />
        </mask>
      </defs>
      <g mask={`url(#${edgeFadeId}-mask)`}>
        <path d={smoothAreaD} fill={`url(#${gradientId})`} />
        <path d={smoothD} fill="none" stroke={withAlpha(color, 0.8)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <line x1={highlight.x} y1={2} x2={highlight.x} y2={baselineY} stroke={withAlpha(color, 0.14)} strokeWidth={0.75} strokeDasharray="2 2" />
      <circle cx={highlight.x} cy={highlight.y} r={3} fill={withAlpha(color, 0.1)} />
      <circle cx={highlight.x} cy={highlight.y} r={2} fill="white" stroke={color} strokeWidth={1.2} />
    </svg>
  )
}

function sampleForSpark(raw: readonly number[] | undefined, maxPoints = 32): number[] {
  if (!raw || raw.length === 0) return []
  const clean = raw.filter(v => Number.isFinite(v))
  if (clean.length === 0) return []
  const step = Math.max(1, Math.ceil(clean.length / maxPoints))
  const out: number[] = []
  for (let i = 0; i < clean.length; i += step) out.push(clean[i]!)
  const last = clean[clean.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

// ── KPI card builder ────────────────────────────────────────────────────────

type DeltaDirection = 'up' | 'down' | 'flat'

interface KpiCard {
  readonly label: string
  /** Short clarifier shown next to label (e.g. "Gini" for Inequality) */
  readonly subtitle?: string
  readonly value: string
  readonly showDelta: boolean
  readonly preferredDeltaDirection: 'higher' | 'lower' | 'neutral'
  readonly note: string
  readonly insight: string
  readonly detail: string
  readonly sentiment: MetricSentiment
  readonly sparkData: readonly number[]
  readonly series: readonly number[]
  readonly totalSlots: number
  readonly formatSeriesValue: (value: number) => string
  readonly formatDeltaValue: (value: number) => string
  readonly sparkColor: string
  readonly linkedCategory: PlotCategory
}

function computeDelta(
  start: number | undefined,
  end: number | undefined,
): { raw: number; formatted: string; direction: DeltaDirection } | null {
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null
  const diff = end - start
  if (Math.abs(diff) < 0.0001) return { raw: diff, formatted: '0', direction: 'flat' }
  const sign = diff > 0 ? '+' : ''
  return { raw: diff, formatted: `${sign}${formatNumber(diff, 4)}`, direction: diff > 0 ? 'up' : 'down' }
}

function deltaTone(direction: DeltaDirection, preferredDirection: 'higher' | 'lower' | 'neutral'): MetricSentiment {
  if (direction === 'flat' || preferredDirection === 'neutral') return 'neutral'
  if (preferredDirection === 'higher') return direction === 'up' ? 'positive' : 'negative'
  return direction === 'down' ? 'positive' : 'negative'
}

function computeSeriesDelta(
  start: number | undefined,
  end: number | undefined,
  formatter: (value: number) => string,
): { raw: number; formatted: string; direction: DeltaDirection } | null {
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null
  const diff = end - start
  if (Math.abs(diff) < 0.0001) return { raw: diff, formatted: formatter(0), direction: 'flat' }
  const prefix = diff > 0 ? '+' : ''
  return { raw: diff, formatted: `${prefix}${formatter(diff)}`, direction: diff > 0 ? 'up' : 'down' }
}

function buildKpiCards(payload: PublishedAnalyticsPayload): readonly KpiCard[] {
  const metrics = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const activeRegionSeries = Array.from({ length: totalSlots }, (_, slotIndex) => activeRegionCountAtSlot(payload, slotIndex))
  const cards: KpiCard[] = []

  // Gini — inequality index
  const giniEnd = metrics.gini?.[finalSlot]
  if (giniEnd != null && giniEnd >= 0 && giniEnd <= 1 && Number.isFinite(giniEnd)) {
    const giniDelta = computeDelta(metrics.gini?.[0], giniEnd)
    const giniSentiment = sentimentLower(giniEnd, THRESHOLDS.gini)
    cards.push({
      label: 'Inequality',
      subtitle: 'Gini index',
      value: formatNumber(giniEnd, 3),
      showDelta: true,
      preferredDeltaDirection: 'lower',
      note: giniSentiment === 'positive' ? 'Relatively balanced finish.' : giniSentiment === 'neutral' ? 'Some geographic skew remains.' : 'Stake ends in a narrow footprint.',
      insight: giniDelta?.direction === 'up'
        ? 'Stake concentrated as the run progressed.'
        : giniDelta?.direction === 'down'
          ? 'Stake diffused across regions over time.'
          : 'Stake balance stayed broadly steady.',
      detail: 'Gini coefficient (0 = perfectly equal, 1 = maximally concentrated). Measures geographic validator distribution.',
      sentiment: giniSentiment,
      sparkData: sampleForSpark(metrics.gini),
      series: metrics.gini ?? [],
      totalSlots,
      formatSeriesValue: value => formatNumber(value, 3),
      formatDeltaValue: value => formatNumber(value, 4),
      sparkColor: CHART_COLORS.gini,
      linkedCategory: 'decentralization',
    })
  }

  // HHI — market concentration
  const hhiEnd = metrics.hhi?.[finalSlot]
  if (hhiEnd != null && hhiEnd >= 0 && Number.isFinite(hhiEnd)) {
    const hhiDelta = computeDelta(metrics.hhi?.[0], hhiEnd)
    const hhiSentiment = sentimentLower(hhiEnd, THRESHOLDS.hhi)
    cards.push({
      label: 'Concentration',
      subtitle: 'HHI',
      value: formatNumber(hhiEnd, 4),
      showDelta: true,
      preferredDeltaDirection: 'lower',
      note: hhiSentiment === 'positive' ? 'Market power stays diffuse.' : hhiSentiment === 'neutral' ? 'Moderate concentration persists.' : 'A few regions dominate the run.',
      insight: hhiDelta?.direction === 'up'
        ? 'Market power consolidated into fewer regions.'
        : hhiDelta?.direction === 'down'
          ? 'Market power dispersed over the run.'
          : 'Concentration finished near its starting point.',
      detail: 'Herfindahl-Hirschman Index — sum of squared shares. Higher values indicate more concentrated markets.',
      sentiment: hhiSentiment,
      sparkData: sampleForSpark(metrics.hhi),
      series: metrics.hhi ?? [],
      totalSlots,
      formatSeriesValue: value => formatNumber(value, 4),
      formatDeltaValue: value => formatNumber(value, 4),
      sparkColor: CHART_COLORS.hhi,
      linkedCategory: 'decentralization',
    })
  }

  // Collapse threshold — regions required to fail the network
  const livenessEnd = metrics.liveness?.[finalSlot]
  const livenessDelta = computeDelta(metrics.liveness?.[0], livenessEnd)
  if (livenessEnd != null && Number.isFinite(livenessEnd)) {
    const livenessSentiment = sentimentHigher(livenessEnd, THRESHOLDS.liveness)
    cards.push({
      label: LIVENESS_LABEL,
      subtitle: 'Liveness threshold',
      value: formatLivenessCount(livenessEnd),
      showDelta: true,
      preferredDeltaDirection: 'higher',
      note: livenessSentiment === 'positive'
        ? 'Several regional outages would be required to collapse the network.'
        : livenessSentiment === 'neutral'
          ? 'The network can tolerate some regional outages before collapsing.'
          : 'Only a small number of regional outages would collapse the network.',
      insight: livenessDelta?.direction === 'up'
        ? 'The collapse threshold improved over the run.'
        : livenessDelta?.direction === 'down'
          ? 'Fewer regional outages are needed to collapse the network than at the start.'
          : 'The collapse threshold stayed steady across the run.',
      detail: LIVENESS_DESCRIPTION,
      sentiment: livenessSentiment,
      sparkData: sampleForSpark(metrics.liveness),
      series: metrics.liveness ?? [],
      totalSlots,
      formatSeriesValue: value => formatLivenessCount(value),
      formatDeltaValue: value => formatLivenessCount(value),
      sparkColor: CHART_COLORS.liveness,
      linkedCategory: 'coverage',
    })
  }

  // Attestation — coordination health
  const attestEnd = metrics.attestations?.[finalSlot]
  const attestDelta = computeDelta(metrics.attestations?.[0], attestEnd)
  if (attestEnd != null && Number.isFinite(attestEnd)) {
    const attestationSentiment: MetricSentiment = attestEnd >= 85 ? 'positive' : attestEnd >= 70 ? 'neutral' : 'negative'
    cards.push({
      label: 'Attestation',
      subtitle: 'Consensus health',
      value: formatNumber(attestEnd, 1),
      showDelta: true,
      preferredDeltaDirection: 'higher',
      note: attestationSentiment === 'positive' ? 'Consensus closes from a healthy base.' : attestationSentiment === 'neutral' ? 'Coordination lands in a mixed zone.' : 'Coordination closes under pressure.',
      insight: attestDelta?.direction === 'up'
        ? 'Coordination improved into the final slots.'
        : attestDelta?.direction === 'down'
          ? 'Coordination softened by the finish.'
          : 'Consensus health stayed stable through the run.',
      detail: 'Average attestation count per slot. Measures validator coordination and network health.',
      sentiment: attestationSentiment,
      sparkData: sampleForSpark(metrics.attestations),
      series: metrics.attestations ?? [],
      totalSlots,
      formatSeriesValue: value => formatNumber(value, 1),
      formatDeltaValue: value => formatNumber(value, 1),
      sparkColor: CHART_COLORS.attestation,
      linkedCategory: 'economics',
    })
  }

  // Proposal latency — pipeline speed
  const proposalEnd = metrics.proposal_times?.[finalSlot]
  const proposalDelta = computeDelta(metrics.proposal_times?.[0], proposalEnd)
  if (proposalEnd != null && Number.isFinite(proposalEnd)) {
    const proposalSentiment = sentimentLower(proposalEnd, THRESHOLDS.proposalTime)
    cards.push({
      label: 'Proposal latency',
      subtitle: 'Pipeline speed',
      value: `${formatNumber(proposalEnd, 1)} ms`,
      showDelta: true,
      preferredDeltaDirection: 'lower',
      note: proposalSentiment === 'positive' ? 'Pipeline closes in a responsive range.' : proposalSentiment === 'neutral' ? 'Pipeline lands in a watch zone.' : 'Propagation ends materially slowed.',
      insight: proposalDelta?.direction === 'up'
        ? 'Proposal delivery slowed as the run matured.'
        : proposalDelta?.direction === 'down'
          ? 'Proposal delivery tightened into the close.'
          : 'Pipeline latency stayed mostly unchanged.',
      detail: 'Average time in milliseconds for block proposals to propagate. Lower = faster consensus.',
      sentiment: proposalSentiment,
      sparkData: sampleForSpark(metrics.proposal_times),
      series: metrics.proposal_times ?? [],
      totalSlots,
      formatSeriesValue: value => `${formatNumber(value, 1)} ms`,
      formatDeltaValue: value => `${formatNumber(value, 1)} ms`,
      sparkColor: CHART_COLORS.proposalTime,
      linkedCategory: 'latency',
    })
  }

  // Active regions — geographic spread
  const activeEnd = activeRegionCountAtSlot(payload, finalSlot)
  const activeStart = activeRegionCountAtSlot(payload, 0)
  const regionSentiment = sentimentHigher(activeEnd, THRESHOLDS.activeRegions)
  if (activeEnd > 0) {
    cards.push({
      label: 'Active regions',
      subtitle: 'Geographic spread',
      value: String(activeEnd),
      showDelta: activeStart > 0,
      preferredDeltaDirection: 'higher',
      note: regionSentiment === 'positive' ? 'Final stake footprint stays broad.' : regionSentiment === 'neutral' ? 'Final stake footprint stays mixed.' : 'Final stake footprint narrows sharply.',
      insight: regionSentiment === 'positive'
        ? `${activeEnd} regions still carry stake at the finish.`
        : regionSentiment === 'neutral'
          ? `${activeEnd} regions stay active, but concentration remains visible.`
          : `Only ${activeEnd} regions still carry stake at the finish.`,
      detail: 'Number of distinct GCP regions with at least one active validator in the final slot.',
      sentiment: regionSentiment,
      sparkData: sampleForSpark(activeRegionSeries),
      series: activeRegionSeries,
      totalSlots,
      formatSeriesValue: value => formatNumber(value, 0),
      formatDeltaValue: value => formatNumber(value, 0),
      sparkColor: CHART_COLORS.activeRegions,
      linkedCategory: 'topology',
    })
  }

  return cards
}

// ── KPI Strip ───────────────────────────────────────────────────────────────

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-amber-500',
  negative: 'bg-rose-500',
}

const DELTA_ARROW: Record<string, string> = { up: '↑', down: '↓', flat: '→' }
const DELTA_COLOR: Record<MetricSentiment, string> = {
  positive: 'text-emerald-700',
  neutral: 'text-stone-500',
  negative: 'text-rose-600',
}

function clampIndex(length: number, index: number): number {
  if (length <= 0) return 0
  return Math.max(0, Math.min(length - 1, Math.floor(index)))
}

function formatSignedSeriesDelta(
  value: number | undefined,
  baseline: number | undefined,
  formatter: (value: number) => string,
): string {
  if (value == null || baseline == null || !Number.isFinite(value) || !Number.isFinite(baseline)) return 'N/A'
  const delta = value - baseline
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${formatter(delta)}`
}

function EvidenceKpiCard({
  card,
  active,
  onActivate,
}: {
  readonly card: KpiCard
  readonly active: boolean
  readonly onActivate: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const sparklineRef = useRef<HTMLDivElement | null>(null)
  const effectiveIndex = hoverIndex ?? Math.max(0, card.series.length - 1)
  const baselineValue = card.series[0]
  const currentValue = card.series[effectiveIndex]
  const previousValue = card.series[Math.max(0, effectiveIndex - 1)]
  const seriesDelta = card.showDelta
    ? computeSeriesDelta(baselineValue, currentValue, card.formatDeltaValue)
    : null
  const deltaDirection = seriesDelta?.direction ?? 'flat'
  const deltaSentiment = deltaTone(deltaDirection, card.preferredDeltaDirection)
  const slotLabel = hoverIndex != null ? `Slot ${(effectiveIndex + 1).toLocaleString()}` : 'Final slot'
  const popoverHeadline = hoverIndex != null
    ? `${card.label} at ${slotLabel.toLowerCase()}`
    : card.insight
  const popoverDetail = hoverIndex != null
    ? `${formatSignedSeriesDelta(currentValue, previousValue, card.formatSeriesValue)} vs previous slot.`
    : card.note
  const hoverProgress = card.series.length > 1
    ? effectiveIndex / Math.max(1, card.series.length - 1)
    : 1
  const tooltipPositionClass = hoverProgress <= 0.28
    ? 'left-0'
    : hoverProgress >= 0.72
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2'

  const handleSparklinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const width = sparklineRef.current?.getBoundingClientRect().width ?? 0
    if (width <= 0 || card.series.length <= 1) return
    const clampedX = Math.max(0, Math.min(width, event.clientX - event.currentTarget.getBoundingClientRect().left))
    const progress = clampedX / width
    setHoverIndex(clampIndex(card.series.length, progress * Math.max(0, card.series.length - 1)))
  }

  return (
    <motion.button
      variants={STAGGER_ITEM}
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        setHoverIndex(null)
      }}
      onFocus={() => setHovered(true)}
      onBlur={() => {
        setHovered(false)
        setHoverIndex(null)
      }}
      aria-pressed={active}
      aria-label={`${card.label}: ${card.value}. ${card.detail}`}
      className={cn(
        'group relative z-0 min-h-[72px] h-full overflow-visible bg-white/80 px-4 py-2.5 text-left transition-[background-color,box-shadow,transform] duration-150 hover:bg-white/94 active:scale-[0.97] active:duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20',
        active && 'z-10 bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]',
        hovered && 'z-20',
      )}
      style={active ? {
        backgroundImage: `linear-gradient(180deg, ${withAlpha(card.sparkColor, 0.04)} 0%, rgba(255,255,255,0) 50%)`,
      } : undefined}
    >
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[2px] rounded-full"
        style={{ backgroundColor: active ? card.sparkColor : 'transparent' }}
      />

      <AnimatePresence initial={false}>
        {hovered && hoverIndex == null && (
          <motion.div
            className="pointer-events-none absolute inset-x-3 bottom-full z-30 mb-1.5"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.1, ease: [0.22, 1, 0.36, 1] } }}
          >
            <div className="rounded-lg border border-black/[0.06] bg-white/96 px-2.5 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <div className="text-[11px] font-medium leading-[1.4] text-stone-800">
                {popoverHeadline}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-stone-500">
                {popoverDetail}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <InlineTooltip label={card.subtitle ? `${card.subtitle} — ${card.detail}` : card.detail}>
        <div title={card.detail} className="flex items-center gap-1.5 min-w-0 h-[16px]">
          <span className={cn('h-2 w-2 rounded-full shrink-0 shadow-[0_0_3px_currentColor]', SENTIMENT_DOT[card.sentiment])} style={{ opacity: 0.85 }} />
          <span className="text-[9px] uppercase tracking-[0.08em] text-stone-500 font-semibold truncate">{card.label}</span>
        </div>
      </InlineTooltip>

      <div className="mt-1 flex items-center gap-1.5 h-[28px]">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-baseline gap-x-1.5">
            <div className="min-w-0 truncate text-[18px] font-medium text-stone-900 tabular-nums leading-none tracking-[-0.01em] font-[family-name:var(--font-mono)]">
              {hoverIndex != null && currentValue != null ? card.formatSeriesValue(currentValue) : card.value}
            </div>
            {seriesDelta && (
              <InlineTooltip label={hoverIndex != null ? 'Change from slot 1 to the inspected slot' : 'Change from slot 1 to the final slot'}>
              <div
                className={cn('inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium tabular-nums whitespace-nowrap', DELTA_COLOR[deltaSentiment])}
              >
                <span>{DELTA_ARROW[deltaDirection]}</span>
                <span>{seriesDelta.formatted}</span>
              </div>
              </InlineTooltip>
            )}
          </div>
        </div>

        <div
          ref={sparklineRef}
          className="relative shrink-0 w-[72px] h-[28px]"
          onPointerMove={handleSparklinePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {card.sparkData.length > 1 ? (
            <>
              <AnimatePresence initial={false}>
                {hoverIndex != null && currentValue != null ? (
                  <motion.div
                    className={cn('pointer-events-none absolute bottom-full z-30 mb-2', tooltipPositionClass)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="min-w-[96px] rounded-lg border border-rule/70 bg-white/96 px-2 py-1.5 text-[9px] leading-tight text-stone-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                      <div className="font-medium text-stone-900">Slot {(effectiveIndex + 1).toLocaleString()}</div>
                      <div className="mt-0.5 tabular-nums">{card.formatSeriesValue(currentValue)}</div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <Sparkline
                data={card.sparkData}
                color={card.sparkColor}
                width={72}
                height={28}
                highlightIndex={hoverIndex != null && card.sparkData.length > 1 ? Math.round((hoverIndex / Math.max(1, card.series.length - 1)) * Math.max(0, card.sparkData.length - 1)) : null}
              />
            </>
          ) : null}
        </div>
      </div>
    </motion.button>
  )
}

interface KpiStripProps {
  readonly payload: PublishedAnalyticsPayload
  readonly activeCategory: PlotCategory
  readonly onCategoryChange: (category: PlotCategory) => void
}

export function EvidenceKpiStrip({ payload, activeCategory, onCategoryChange }: KpiStripProps) {
  const cards = useMemo(() => buildKpiCards(payload), [payload])
  if (cards.length === 0) return null

  return (
    <motion.div
      className="rounded-[14px] border border-black/[0.06] bg-black/[0.05]"
      initial="hidden"
      animate="visible"
      variants={STAGGER_CONTAINER}
    >
      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 [&>*:first-child]:rounded-tl-[13px] [&>*:first-child]:rounded-tr-[13px] sm:[&>*:first-child]:rounded-tr-none sm:[&>*:nth-child(2)]:rounded-tr-[13px] xl:[&>*:nth-child(2)]:rounded-tr-none xl:[&>*:last-child]:rounded-tr-[13px] [&>*:last-child]:rounded-br-[13px] [&>*:last-child]:rounded-bl-[13px] sm:[&>*:last-child]:rounded-bl-none sm:[&>*:nth-last-child(2)]:rounded-bl-[13px] xl:[&>*:nth-last-child(2)]:rounded-bl-none xl:[&>*:first-child]:rounded-bl-[13px]">
        {cards.map(card => {
          const isActive = activeCategory === card.linkedCategory
          return (
            <EvidenceKpiCard
              key={card.label}
              card={card}
              active={isActive}
              onActivate={() => onCategoryChange(isActive ? 'all' : card.linkedCategory)}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

// ── Config Snapshot ─────────────────────────────────────────────────────────

interface ConfigSnapshotProps {
  readonly metadata?: ResearchMetadata
  readonly description?: string
  readonly paradigm: string
  readonly totalSlots: number
}

const PARAM_DEFS: ReadonlyArray<{
  key: keyof ResearchMetadata
  label: string
  title: string
  format: (v: number) => string
}> = [
  { key: 'v', label: '|V|', title: 'Number of validator agents', format: v => v.toLocaleString() },
  { key: 'cost', label: 'cost', title: 'Migration cost in ETH', format: v => `${v} ETH` },
  { key: 'delta', label: '\u0394', title: 'Slot duration in milliseconds', format: v => `${v} ms` },
  { key: 'cutoff', label: 'cutoff', title: 'Attestation propagation cutoff', format: v => `${v} ms` },
  { key: 'gamma', label: '\u03B3', title: 'Attestation threshold — fraction of validators required to accept a block', format: v => formatNumber(v, 2) },
]

export function EvidenceConfigSnapshot({ metadata, description, paradigm, totalSlots }: ConfigSnapshotProps) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium mb-2">Configuration snapshot</div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <InlineTooltip label="Block-building paradigm used in this simulation">
          <span className="rounded-md border border-black/[0.06] bg-[#FAFAF8] px-2 py-0.5 text-[10px] text-stone-600 font-medium">{paradigmLabel(paradigm)}</span>
        </InlineTooltip>
        <InlineTooltip label="Total number of consensus slots simulated">
          <span className="rounded-md border border-black/[0.06] bg-[#FAFAF8] px-2 py-0.5 text-[10px] text-stone-600 font-medium tabular-nums">{totalSlots.toLocaleString()} slots</span>
        </InlineTooltip>
        {metadata && PARAM_DEFS.map(({ key, label, title, format }) => {
          const val = metadata[key]
          if (val == null || typeof val !== 'number') return null
          return (
            <InlineTooltip key={key} label={title}>
              <span className="rounded-md border border-black/[0.06] bg-[#FAFAF8] px-2 py-0.5 text-[10px] text-stone-600 font-medium tabular-nums">
                {label}: {format(val)}
              </span>
            </InlineTooltip>
          )
        })}
      </div>

      <div className="border-t border-black/[0.04] pt-2">
        <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium mb-0.5">How to read this result</div>
        <p className="text-[11px] leading-relaxed text-stone-500">
          {description ?? 'This surface presents the final-slot snapshot alongside time-series evolution. Each chart tracks a single metric across the full simulation run. The KPI strip above summarizes the headline numbers with deltas computed from the first to last slot.'}
        </p>
      </div>
    </div>
  )
}

// ── Plot category filter ────────────────────────────────────────────────────

export type PlotCategory = 'all' | 'decentralization' | 'coverage' | 'equity' | 'topology' | 'economics' | 'performance' | 'latency' | 'sources'

export interface TaggedChartBlock {
  readonly category: PlotCategory
  readonly key: string
  readonly block: import('../../types/blocks').Block
}

const PLOT_CATEGORIES: ReadonlyArray<{ id: PlotCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'decentralization', label: 'Decentralization' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'equity', label: 'Equity' },
  { id: 'topology', label: 'Topology' },
  { id: 'economics', label: 'Economics' },
  { id: 'performance', label: 'Performance' },
  { id: 'latency', label: 'Latency' },
  { id: 'sources', label: 'Sources' },
]

interface PlotFilterToolbarProps {
  readonly activeCategory: PlotCategory
  readonly onCategoryChange: (category: PlotCategory) => void
  readonly counts: Record<PlotCategory, number>
}

export function PlotFilterToolbar({ activeCategory, onCategoryChange, counts }: PlotFilterToolbarProps) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium">Analytical lens</div>
        <span className="text-[10px] text-stone-400 tabular-nums">
          {counts[activeCategory]} panel{counts[activeCategory] !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-[11px] text-stone-500 leading-relaxed mb-2.5 max-w-xl">
        Focus the dashboard by category for a cleaner analytical pass.
      </p>
      <div className="flex flex-wrap gap-1">
        {PLOT_CATEGORIES.map(cat => (
          <InlineTooltip key={cat.id} label={CATEGORY_DESCRIPTIONS[cat.id] ?? `Show ${cat.label.toLowerCase()} charts`}>
          <button
            onClick={() => onCategoryChange(cat.id)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-150',
              activeCategory === cat.id
                ? 'border-black/[0.06] bg-white text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                : 'border-transparent text-stone-400 hover:text-stone-600 hover:bg-stone-50',
              counts[cat.id] === 0 && cat.id !== 'all' && 'opacity-30 pointer-events-none',
            )}
          >
            {cat.label}
          </button>
          </InlineTooltip>
        ))}
      </div>
    </div>
  )
}

// ── Sticky category bar ───────────────────────────────────────────────────

interface EvidenceCategoryBarProps {
  readonly activeCategory: PlotCategory
  readonly onCategoryChange: (category: PlotCategory) => void
  readonly counts: Record<PlotCategory, number>
  readonly chartGridRef?: React.RefObject<HTMLDivElement | null>
  readonly embedded?: boolean
}

export function EvidenceCategoryBar({
  activeCategory,
  onCategoryChange,
  counts,
  chartGridRef,
  embedded = false,
}: EvidenceCategoryBarProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(entry ? !entry.isIntersecting : false),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleCategoryChange = (category: PlotCategory) => {
    onCategoryChange(category)
    if (category !== 'all' && chartGridRef?.current) {
      chartGridRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  return (
    <>
      <div ref={sentinelRef} className="h-0" aria-hidden />
      <div
        className={cn(
          'sticky top-[4.85rem] z-20 transition-all duration-200',
          embedded
            ? cn(
                'border-b border-black/[0.06]',
                isStuck ? 'bg-white/94 shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur-md' : 'bg-[#FCFBFA]/96',
              )
            : cn(
                '-mx-px px-px py-2.5',
                isStuck ? 'bg-white/92 backdrop-blur-md' : 'bg-transparent',
              ),
        )}
      >
        <div className={cn(
          embedded
            ? 'px-4 py-3 sm:px-5'
            : cn(
                'rounded-[18px] border border-black/[0.06] px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-200',
                isStuck ? 'bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.08)]' : 'bg-[#FBFAF9]/92',
              ),
        )}>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-semibold">Chart lens</div>
                <span className="text-[10px] font-medium tabular-nums text-stone-500">
                  {counts[activeCategory]} panel{counts[activeCategory] !== 1 ? 's' : ''}
                </span>
                <span className="text-black/20">·</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`${activeCategory}-desktop`}
                    className="text-[10px] text-stone-500"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={SPRING_CRISP}
                  >
                    {CATEGORY_DESCRIPTIONS[activeCategory] ?? ''}
                  </motion.span>
                </AnimatePresence>
              </div>
              {activeCategory !== 'all' && (
                <div className="mt-1 text-[10px] text-stone-400">
                  Selecting a lens narrows the chart deck below.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {PLOT_CATEGORIES.map(cat => (
                <InlineTooltip key={cat.id} label={CATEGORY_DESCRIPTIONS[cat.id] ?? `Show ${cat.label.toLowerCase()} charts`}>
                <button
                  onClick={() => handleCategoryChange(cat.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[8px] border px-2 py-1 text-[10px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
                    activeCategory === cat.id
                      ? 'border-black/[0.08] bg-white text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                      : 'border-transparent bg-transparent text-stone-400 hover:bg-black/[0.035] hover:text-stone-700',
                    counts[cat.id] === 0 && cat.id !== 'all' && 'opacity-30 pointer-events-none',
                  )}
                >
                  <span>{cat.label}</span>
                  {cat.id !== 'all' && counts[cat.id] > 0 && (
                    <span className={cn(
                      'rounded-[6px] px-1 py-0 text-[9px] tabular-nums',
                      activeCategory === cat.id ? 'bg-black/[0.05] text-stone-600' : 'bg-black/[0.04] text-stone-400',
                    )}>
                      {counts[cat.id]}
                    </span>
                  )}
                </button>
                </InlineTooltip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Takeaway generator ─────────────────────────────────────────────────────

function buildTakeaway(payload: PublishedAnalyticsPayload): string {
  const m = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const f = Math.max(0, totalSlots - 1)
  const parts: string[] = []

  const gini = m.gini?.[f]
  if (gini != null) {
    const s = sentimentLower(gini, THRESHOLDS.gini)
    parts.push(s === 'positive' ? 'Stake is relatively well-distributed' : s === 'neutral' ? 'Moderate stake inequality exists' : 'Stake is heavily concentrated')
  }

  const hhi = m.hhi?.[f]
  if (hhi != null) {
    const s = sentimentLower(hhi, THRESHOLDS.hhi)
    parts.push(s === 'positive' ? 'with an unconcentrated market structure' : s === 'neutral' ? 'with moderate market concentration' : 'with high market concentration')
  }

  const liveness = m.liveness?.[f]
  if (liveness != null) {
    const s = sentimentHigher(liveness, THRESHOLDS.liveness)
    parts.push(
      s === 'positive'
        ? `and needs at least ${formatLivenessCountWithUnit(liveness)} to fail before it collapses`
        : s === 'neutral'
          ? `and currently collapses after ${formatLivenessCountWithUnit(liveness)} fail`
          : `but collapses if only ${formatLivenessCountWithUnit(liveness)} fail`,
    )
  }

  const activeRegions = activeRegionCountAtSlot(payload, f)
  if (activeRegions > 0) {
    parts.push(`across ${activeRegions} active region${activeRegions !== 1 ? 's' : ''}`)
  }

  return parts.length > 0 ? `${parts.join(' ')}.` : 'Simulation complete — examine metrics for details.'
}

// ── Slot narrative metrics grid ─────────────────────────────────────────────

interface SlotMetricsGridProps {
  readonly payload: PublishedAnalyticsPayload
}

const METRIC_TOOLTIPS: Record<string, string> = {
  Clusters: 'Number of distinct geographic clusters identified by nearest-neighbor analysis',
  'Total distance': 'Sum of pairwise distances between all active validator regions (km)',
  MEV: 'Maximum extractable value captured in the final slot (ETH)',
  'Failed proposals': 'Block proposals that failed to meet attestation threshold',
  'Profit CV': 'Coefficient of variation for validator profits — lower means more equitable',
  NNI: 'Nearest Neighbor Index — <1 = clustered, 1 = random, >1 = dispersed',
}

export function SlotMetricsGrid({ payload }: SlotMetricsGridProps) {
  const metrics = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const topRegions = topRegionsForSlot(payload, finalSlot, 3)
  const takeaway = useMemo(() => buildTakeaway(payload), [payload])

  // Only show metrics NOT duplicated in the KPI strip (gini, hhi, liveness, attestation, proposal_times, active regions)
  const items: Array<{ label: string; value: string }> = []
  if (metrics.clusters?.[finalSlot] != null)
    items.push({ label: 'Clusters', value: String(Math.round(metrics.clusters[finalSlot]!)) })
  if (metrics.total_distance?.[finalSlot] != null)
    items.push({ label: 'Total distance', value: formatNumber(metrics.total_distance[finalSlot]!, 0) })
  if (metrics.mev?.[finalSlot] != null)
    items.push({ label: 'MEV', value: `${formatNumber(metrics.mev[finalSlot]!, 6)} ETH` })
  if (metrics.failed_block_proposals?.[finalSlot] != null)
    items.push({ label: 'Failed proposals', value: String(Math.round(metrics.failed_block_proposals[finalSlot]!)) })
  if (metrics.profit_variance?.[finalSlot] != null)
    items.push({ label: 'Profit CV', value: formatNumber(metrics.profit_variance[finalSlot]!, 4) })
  if (metrics.nni?.[finalSlot] != null)
    items.push({ label: 'NNI', value: formatNumber(metrics.nni[finalSlot]!, 3) })

  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium">Slot narrative</div>
        <span className="text-[10px] text-stone-400">Final slot — what this snapshot says</span>
      </div>

      {/* Auto-generated takeaway */}
      <p className="text-[11px] leading-relaxed text-stone-500 mb-2.5 italic">{takeaway}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {items.map(item => (
          <div key={item.label} className="py-0.5">
            <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium">
              {METRIC_TOOLTIPS[item.label] ? (
                <InlineTooltip label={METRIC_TOOLTIPS[item.label]}>{item.label}</InlineTooltip>
              ) : item.label}
            </div>
            <div className="text-[13px] font-semibold text-stone-800 tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Top 3 regions with share bars */}
      {topRegions.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-black/[0.04]">
          <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">Top regions</div>
          <div className="space-y-1">
            {topRegions.map((region, i) => (
              <div key={region.label} className="flex items-center gap-2">
                <span className="text-[10px] text-stone-400 w-4 tabular-nums text-right font-medium">#{i + 1}</span>
                <span className="text-[11px] text-stone-700 min-w-[80px] truncate font-medium">{region.label}</span>
                <div className="flex-1 h-[4px] rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-stone-400"
                    style={{ width: `${Math.min(region.share, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-400 tabular-nums w-10 text-right font-medium">{formatNumber(region.share, 1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chart category tagging ──────────────────────────────────────────────────

export function categorizeChart(title: string): PlotCategory {
  const t = title.toLowerCase()
  if (t.includes('gini') || t.includes('hhi') || t.includes('concentration')) return 'decentralization'
  if (t.includes('liveness') || t.includes('coverage') || t.includes('active region') || t.includes('critical regions') || t.includes('collapse threshold')) return 'coverage'
  if (t.includes('coefficient of variation') || t.includes('profit') || t.includes('disparity')) return 'equity'
  if (t.includes('cluster') || t.includes('nearest-neighbor') || t.includes('nearest neighbor') || t.includes('nni') || t.includes('total validator distance') || t.includes('network spread')) return 'topology'
  if (t.includes('mev') || t.includes('block value') || t.includes('attestation')) return 'economics'
  if (t.includes('failed') || t.includes('operational')) return 'performance'
  if (t.includes('proposal') || t.includes('latency') || t.includes('pipeline')) return 'latency'
  if (t.includes('relay') || t.includes('source') || t.includes('footprint') || t.includes('information')) return 'sources'
  return 'all'
}

export function countByCategory(tagged: readonly TaggedChartBlock[]): Record<PlotCategory, number> {
  const counts: Record<PlotCategory, number> = {
    all: tagged.length, decentralization: 0, coverage: 0, equity: 0,
    topology: 0, economics: 0, performance: 0, latency: 0, sources: 0,
  }
  for (const t of tagged) {
    if (t.category !== 'all') counts[t.category]++
  }
  return counts
}
