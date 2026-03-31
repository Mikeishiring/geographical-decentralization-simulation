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

// ── KPI card builder ────────────────────────────────────────────────────────

interface KpiCard {
  readonly label: string
  readonly value: string
  readonly delta: string | null
  readonly note: string
  readonly sentiment: 'positive' | 'neutral' | 'negative'
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

  const hhiEnd = metrics.hhi?.[finalSlot]
  const hhiDelta = computeDelta(metrics.hhi?.[0], hhiEnd)
  if (hhiEnd != null) {
    cards.push({
      label: 'Concentration',
      value: formatNumber(hhiEnd, 4),
      delta: hhiDelta?.formatted ?? null,
      note: hhiEnd < 0.15 ? 'Unconcentrated market' : hhiEnd < 0.25 ? 'Moderate concentration' : 'Highly concentrated',
      sentiment: hhiEnd < 0.15 ? 'positive' : hhiEnd < 0.25 ? 'neutral' : 'negative',
    })
  }

  const livenessEnd = metrics.liveness?.[finalSlot]
  const livenessDelta = computeDelta(metrics.liveness?.[0], livenessEnd)
  const topRegion = topRegionsForSlot(payload, finalSlot, 1)[0]
  if (livenessEnd != null) {
    cards.push({
      label: 'Coverage',
      value: `${formatNumber(livenessEnd, 1)}%`,
      delta: livenessDelta ? `${livenessDelta.formatted}%` : null,
      note: topRegion ? `Led by ${topRegion.label}` : 'Network liveness rate',
      sentiment: livenessEnd > 95 ? 'positive' : livenessEnd > 80 ? 'neutral' : 'negative',
    })
  }

  const attestEnd = metrics.attestations?.[finalSlot]
  const attestDelta = computeDelta(metrics.attestations?.[0], attestEnd)
  if (attestEnd != null) {
    cards.push({
      label: 'Attestation',
      value: formatNumber(attestEnd, 1),
      delta: attestDelta?.formatted ?? null,
      note: 'Coordination health',
      sentiment: 'neutral',
    })
  }

  const proposalEnd = metrics.proposal_times?.[finalSlot]
  const proposalDelta = computeDelta(metrics.proposal_times?.[0], proposalEnd)
  if (proposalEnd != null) {
    cards.push({
      label: 'Proposal latency',
      value: `${formatNumber(proposalEnd, 1)} ms`,
      delta: proposalDelta ? `${proposalDelta.formatted} ms` : null,
      note: 'Pipeline responsiveness',
      sentiment: proposalEnd < 200 ? 'positive' : proposalEnd < 500 ? 'neutral' : 'negative',
    })
  }

  const mevEnd = metrics.mev?.[finalSlot]
  const mevDelta = computeDelta(metrics.mev?.[0], mevEnd)
  if (mevEnd != null) {
    cards.push({
      label: 'Block value',
      value: `${formatNumber(mevEnd, 6)} ETH`,
      delta: mevDelta ? `${mevDelta.formatted} ETH` : null,
      note: 'Relay distance reference',
      sentiment: 'neutral',
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

interface KpiStripProps {
  readonly payload: PublishedAnalyticsPayload
}

export function EvidenceKpiStrip({ payload }: KpiStripProps) {
  const cards = useMemo(() => buildKpiCards(payload), [payload])
  if (cards.length === 0) return null

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2"
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
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', SENTIMENT_DOT[card.sentiment])} />
            <span className="text-2xs uppercase tracking-[0.08em] text-text-faint font-medium truncate">{card.label}</span>
          </div>
          <div className="text-[15px] font-semibold text-text-primary tabular-nums leading-tight">{card.value}</div>
          {card.delta && (
            <div className="mt-0.5 text-2xs text-muted tabular-nums">{card.delta}</div>
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

export type PlotCategory = 'all' | 'decentralization' | 'coverage' | 'economics' | 'performance' | 'geography'

export interface TaggedChartBlock {
  readonly category: PlotCategory
  readonly key: string
  readonly block: import('../../types/blocks').Block
}

const PLOT_CATEGORIES: ReadonlyArray<{ id: PlotCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'decentralization', label: 'Decentralization' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'economics', label: 'Economics' },
  { id: 'performance', label: 'Performance' },
  { id: 'geography', label: 'Geography' },
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

// ── Slot narrative metrics grid ─────────────────────────────────────────────

interface SlotMetricsGridProps {
  readonly payload: PublishedAnalyticsPayload
}

export function SlotMetricsGrid({ payload }: SlotMetricsGridProps) {
  const metrics = payload.metrics ?? {}
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const topRegion = topRegionsForSlot(payload, finalSlot, 1)[0]

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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {items.map(item => (
          <div key={item.label} className="py-0.5">
            <div className="text-2xs text-text-faint">{item.label}</div>
            <div className="text-sm font-semibold text-text-primary tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      {topRegion && (
        <div className="mt-2 pt-2 border-t border-rule/50 flex items-center gap-6">
          <div>
            <div className="text-2xs text-text-faint">Lead region</div>
            <div className="text-xs font-medium text-text-primary">{topRegion.label} ({formatNumber(topRegion.share, 1)}%)</div>
          </div>
          <div>
            <div className="text-2xs text-text-faint">Progress</div>
            <div className="text-xs font-medium text-text-primary">100% — final slot</div>
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
  if (t.includes('mev') || t.includes('block value') || t.includes('attestation') || t.includes('cluster')) return 'economics'
  if (t.includes('proposal') || t.includes('latency') || t.includes('failed') || t.includes('distance')) return 'performance'
  if (t.includes('map') || t.includes('region') || t.includes('footprint') || t.includes('geography')) return 'geography'
  return 'all'
}

export function countByCategory(tagged: readonly TaggedChartBlock[]): Record<PlotCategory, number> {
  const counts: Record<PlotCategory, number> = { all: tagged.length, decentralization: 0, coverage: 0, economics: 0, performance: 0, geography: 0 }
  for (const t of tagged) {
    if (t.category !== 'all') counts[t.category]++
  }
  return counts
}
