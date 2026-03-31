import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { formatNumber } from './simulation-constants'
import {
  totalSlotsFromPayload,
  topRegionsForSlot,
  activeRegionCountAtSlot,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import type { ResearchMetadata } from './simulation-lab-types'
import {
  CHART_COLORS,
  THRESHOLDS,
  sentimentLower,
  sentimentHigher,
} from './simulation-evidence-constants'

// ── Inline sparkline ────────────────────────────────────────────────────────

function Sparkline({ data, color, width = 48, height = 16 }: {
  data: readonly number[]; color: string; width?: number; height?: number
}) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function sampleForSpark(raw: readonly number[] | undefined, maxPoints = 20): number[] {
  if (!raw || raw.length === 0) return []
  const step = Math.max(1, Math.ceil(raw.length / maxPoints))
  const out: number[] = []
  for (let i = 0; i < raw.length; i += step) out.push(raw[i]!)
  const last = raw[raw.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

// ── KPI card builder ────────────────────────────────────────────────────────

interface KpiCard {
  readonly label: string
  readonly value: string
  readonly delta: string | null
  readonly direction: 'up' | 'down' | 'flat'
  readonly note: string
  readonly sentiment: 'positive' | 'neutral' | 'negative'
  readonly sparkData: readonly number[]
  readonly sparkColor: string
}

function computeDelta(
  start: number | undefined,
  end: number | undefined,
): { formatted: string; direction: 'up' | 'down' | 'flat' } | null {
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null
  const diff = end - start
  if (Math.abs(diff) < 0.0001) return { formatted: '0', direction: 'flat' }
  const sign = diff > 0 ? '+' : ''
  return { formatted: `${sign}${formatNumber(diff, 4)}`, direction: diff > 0 ? 'up' : 'down' }
}

function buildKpiCards(payload: PublishedAnalyticsPayload): readonly KpiCard[] {
  const metrics = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const cards: KpiCard[] = []

  // Gini — inequality index
  const giniEnd = metrics.gini?.[finalSlot]
  const giniDelta = computeDelta(metrics.gini?.[0], giniEnd)
  if (giniEnd != null) {
    cards.push({
      label: 'Inequality',
      value: formatNumber(giniEnd, 3),
      delta: giniDelta?.formatted ?? null,
      direction: giniDelta?.direction ?? 'flat',
      note: sentimentLower(giniEnd, THRESHOLDS.gini) === 'positive' ? 'Relatively equal' : sentimentLower(giniEnd, THRESHOLDS.gini) === 'neutral' ? 'Moderate inequality' : 'Highly unequal',
      sentiment: sentimentLower(giniEnd, THRESHOLDS.gini),
      sparkData: sampleForSpark(metrics.gini),
      sparkColor: CHART_COLORS.gini,
    })
  }

  // HHI — market concentration
  const hhiEnd = metrics.hhi?.[finalSlot]
  const hhiDelta = computeDelta(metrics.hhi?.[0], hhiEnd)
  if (hhiEnd != null) {
    cards.push({
      label: 'Concentration',
      value: formatNumber(hhiEnd, 4),
      delta: hhiDelta?.formatted ?? null,
      direction: hhiDelta?.direction ?? 'flat',
      note: sentimentLower(hhiEnd, THRESHOLDS.hhi) === 'positive' ? 'Unconcentrated market' : sentimentLower(hhiEnd, THRESHOLDS.hhi) === 'neutral' ? 'Moderate concentration' : 'Highly concentrated',
      sentiment: sentimentLower(hhiEnd, THRESHOLDS.hhi),
      sparkData: sampleForSpark(metrics.hhi),
      sparkColor: CHART_COLORS.hhi,
    })
  }

  // Liveness — region coverage
  const livenessEnd = metrics.liveness?.[finalSlot]
  const livenessDelta = computeDelta(metrics.liveness?.[0], livenessEnd)
  const topRegion = topRegionsForSlot(payload, finalSlot, 1)[0]
  if (livenessEnd != null) {
    cards.push({
      label: 'Coverage',
      value: `${formatNumber(livenessEnd, 1)}%`,
      delta: livenessDelta ? `${livenessDelta.formatted}%` : null,
      direction: livenessDelta?.direction ?? 'flat',
      note: topRegion ? `Led by ${topRegion.label}` : 'Network liveness rate',
      sentiment: sentimentHigher(livenessEnd, THRESHOLDS.liveness),
      sparkData: sampleForSpark(metrics.liveness),
      sparkColor: CHART_COLORS.liveness,
    })
  }

  // Attestation — coordination health
  const attestEnd = metrics.attestations?.[finalSlot]
  const attestDelta = computeDelta(metrics.attestations?.[0], attestEnd)
  if (attestEnd != null) {
    cards.push({
      label: 'Attestation',
      value: formatNumber(attestEnd, 1),
      delta: attestDelta?.formatted ?? null,
      direction: attestDelta?.direction ?? 'flat',
      note: 'Coordination health',
      sentiment: 'neutral',
      sparkData: sampleForSpark(metrics.attestations),
      sparkColor: CHART_COLORS.attestation,
    })
  }

  // Proposal latency — pipeline speed
  const proposalEnd = metrics.proposal_times?.[finalSlot]
  const proposalDelta = computeDelta(metrics.proposal_times?.[0], proposalEnd)
  if (proposalEnd != null) {
    cards.push({
      label: 'Proposal latency',
      value: `${formatNumber(proposalEnd, 1)} ms`,
      delta: proposalDelta ? `${proposalDelta.formatted} ms` : null,
      direction: proposalDelta?.direction ?? 'flat',
      note: 'Pipeline responsiveness',
      sentiment: sentimentLower(proposalEnd, THRESHOLDS.proposalTime),
      sparkData: sampleForSpark(metrics.proposal_times),
      sparkColor: CHART_COLORS.proposalTime,
    })
  }

  // Active regions — geographic spread
  const activeEnd = activeRegionCountAtSlot(payload, finalSlot)
  if (activeEnd > 0) {
    cards.push({
      label: 'Active regions',
      value: String(activeEnd),
      delta: null,
      direction: 'flat',
      note: sentimentHigher(activeEnd, THRESHOLDS.activeRegions) === 'positive' ? 'Well-distributed' : sentimentHigher(activeEnd, THRESHOLDS.activeRegions) === 'neutral' ? 'Moderate spread' : 'Geographically narrow',
      sentiment: sentimentHigher(activeEnd, THRESHOLDS.activeRegions),
      sparkData: [],
      sparkColor: CHART_COLORS.activeRegions,
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
const DELTA_COLOR: Record<string, string> = {
  up: 'text-emerald-600', down: 'text-rose-500', flat: 'text-text-faint',
}

interface KpiStripProps {
  readonly payload: PublishedAnalyticsPayload
}

export function EvidenceKpiStrip({ payload }: KpiStripProps) {
  const cards = useMemo(() => buildKpiCards(payload), [payload])
  if (cards.length === 0) return null

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
      initial="hidden"
      animate="visible"
      variants={STAGGER_CONTAINER}
    >
      {cards.map(card => (
        <motion.div
          key={card.label}
          variants={STAGGER_ITEM}
          className="lab-option-card px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', SENTIMENT_DOT[card.sentiment])} />
              <span className="text-2xs uppercase tracking-[0.08em] text-text-faint font-medium truncate">{card.label}</span>
            </div>
            {card.sparkData.length > 1 && (
              <Sparkline data={card.sparkData} color={card.sparkColor} />
            )}
          </div>
          <div className="text-[15px] font-semibold text-text-primary tabular-nums leading-tight">{card.value}</div>
          {card.delta && (
            <div className={cn('mt-0.5 text-2xs tabular-nums flex items-center gap-0.5', DELTA_COLOR[card.direction])}>
              <span>{DELTA_ARROW[card.direction]}</span>
              <span>{card.delta}</span>
            </div>
          )}
          <div className="mt-1 text-2xs text-text-faint leading-snug">{card.note}</div>
        </motion.div>
      ))}
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
  format: (v: number) => string
}> = [
  { key: 'v', label: '|V|', format: v => v.toLocaleString() },
  { key: 'cost', label: 'cost', format: v => `${v} ETH` },
  { key: 'delta', label: '\u0394', format: v => `${v} ms` },
  { key: 'cutoff', label: 'cutoff', format: v => `${v} ms` },
  { key: 'gamma', label: '\u03B3', format: v => formatNumber(v, 2) },
]

export function EvidenceConfigSnapshot({ metadata, description, paradigm, totalSlots }: ConfigSnapshotProps) {
  return (
    <div className="lab-stage-soft px-4 py-3">
      <div className="lab-section-title mb-2">Configuration snapshot</div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="lab-chip bg-white/90 text-2xs">{paradigm}</span>
        <span className="lab-chip bg-white/90 text-2xs">{totalSlots.toLocaleString()} slots</span>
        {metadata && PARAM_DEFS.map(({ key, label, format }) => {
          const val = metadata[key]
          if (val == null || typeof val !== 'number') return null
          return (
            <span key={key} className="lab-chip bg-white/90 text-2xs">
              {label}: {format(val)}
            </span>
          )
        })}
      </div>

      <div className="border-t border-rule/50 pt-2">
        <div className="text-2xs font-semibold text-text-faint uppercase tracking-[0.06em] mb-0.5">How to read this result</div>
        <p className="text-xs leading-relaxed text-muted">
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
        <div className="lab-section-title">Analytical lens</div>
        <span className="text-2xs text-muted tabular-nums">
          {counts[activeCategory]} panel{counts[activeCategory] !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-2.5 max-w-xl">
        Focus the dashboard by category for a cleaner analytical pass.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PLOT_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            className={cn(
              'lab-option-card rounded-full px-3 py-1 text-xs font-medium',
              activeCategory === cat.id
                ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                : 'text-muted',
              counts[cat.id] === 0 && cat.id !== 'all' && 'opacity-30 pointer-events-none',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
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
    parts.push(gini < 0.4 ? 'Stake is relatively well-distributed' : gini < 0.6 ? 'Moderate stake inequality exists' : 'Stake is heavily concentrated')
  }

  const hhi = m.hhi?.[f]
  if (hhi != null) {
    parts.push(hhi < 0.15 ? 'with an unconcentrated market structure' : hhi < 0.25 ? 'with moderate market concentration' : 'with high market concentration')
  }

  const liveness = m.liveness?.[f]
  if (liveness != null) {
    parts.push(liveness > 95 ? 'and strong geographic coverage' : liveness > 80 ? 'and adequate coverage' : 'but weak geographic coverage')
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

export function SlotMetricsGrid({ payload }: SlotMetricsGridProps) {
  const metrics = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const topRegions = topRegionsForSlot(payload, finalSlot, 3)
  const takeaway = useMemo(() => buildTakeaway(payload), [payload])

  const items: Array<{ label: string; value: string }> = []
  if (metrics.clusters?.[finalSlot] != null)
    items.push({ label: 'Clusters', value: String(Math.round(metrics.clusters[finalSlot]!)) })
  if (metrics.total_distance?.[finalSlot] != null)
    items.push({ label: 'Total distance', value: formatNumber(metrics.total_distance[finalSlot]!, 0) })
  if (metrics.mev?.[finalSlot] != null)
    items.push({ label: 'MEV', value: `${formatNumber(metrics.mev[finalSlot]!, 6)} ETH` })
  if (metrics.attestations?.[finalSlot] != null)
    items.push({ label: 'Attestation', value: formatNumber(metrics.attestations[finalSlot]!, 1) })
  if (metrics.proposal_times?.[finalSlot] != null)
    items.push({ label: 'Proposal time', value: `${formatNumber(metrics.proposal_times[finalSlot]!, 1)} ms` })
  items.push({ label: 'Active regions', value: String(activeRegionCountAtSlot(payload, finalSlot)) })

  return (
    <div className="lab-stage-soft px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="lab-section-title">Slot narrative</div>
        <span className="text-2xs text-muted">Final slot — what this snapshot says</span>
      </div>

      {/* Auto-generated takeaway */}
      <p className="text-xs leading-relaxed text-muted mb-2.5 italic">{takeaway}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {items.map(item => (
          <div key={item.label} className="py-0.5">
            <div className="text-2xs text-text-faint">{item.label}</div>
            <div className="text-sm font-semibold text-text-primary tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Top 3 regions with share bars */}
      {topRegions.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-rule/50">
          <div className="text-2xs text-text-faint mb-1.5">Top regions</div>
          <div className="space-y-1">
            {topRegions.map((region, i) => (
              <div key={region.label} className="flex items-center gap-2">
                <span className="text-2xs text-text-faint w-4 tabular-nums text-right">#{i + 1}</span>
                <span className="text-xs text-text-primary min-w-[80px] truncate">{region.label}</span>
                <div className="flex-1 h-[5px] rounded-full bg-rule/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent/60"
                    style={{ width: `${Math.min(region.share, 100)}%` }}
                  />
                </div>
                <span className="text-2xs text-muted tabular-nums w-10 text-right">{formatNumber(region.share, 1)}%</span>
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
  if (t.includes('liveness') || t.includes('coverage') || t.includes('active region')) return 'coverage'
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
