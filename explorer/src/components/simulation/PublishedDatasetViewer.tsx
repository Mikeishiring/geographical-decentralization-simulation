import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ExternalLink, LoaderCircle, Lock, Pause, Play, RotateCcw, X } from 'lucide-react'
import { ChartBlock } from '../blocks/ChartBlock'
import { InsightBlock } from '../blocks/InsightBlock'
import { StatBlock } from '../blocks/StatBlock'
import { TimeSeriesBlock } from '../blocks/TimeSeriesBlock'
import { formatNumber } from './simulation-constants'
import { CONTINENT_OUTLINES } from '../../data/world-outlines'
import { GCP_REGIONS, type GcpRegion, type MacroRegion } from '../../data/gcp-regions'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'

interface ResearchMetadata {
  readonly v?: number
  readonly cost?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly gamma?: number
  readonly description?: string
}

interface ResearchDatasetEntry {
  readonly evaluation: string
  readonly paradigm: string
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
  readonly metadata?: ResearchMetadata
}

interface PublishedViewerSettings {
  readonly theme: 'auto' | 'light' | 'dark'
  readonly step: 1 | 10 | 50
  readonly autoplay: boolean
}

interface PublishedViewerAnnotationNote {
  readonly id: string
  readonly intent: 'observation' | 'question' | 'theory' | 'methods'
  readonly status?: 'open_question' | 'needs_evidence' | 'challenged' | 'supported' | 'author_addressed'
  readonly contributionType?: 'claim' | 'question' | 'evidence' | 'counterpoint' | 'method_concern'
  readonly communityLane?: 'author' | 'reviewer' | 'community'
  readonly annotationScope?: 'exact_slot' | 'time_range' | 'trend' | 'comparison_gap' | 'paper_claim' | 'region_over_time'
  readonly rangeStartSlotNumber?: number | null
  readonly rangeEndSlotNumber?: number | null
  readonly anchorKind?: 'general' | 'region' | 'metric' | 'comparison' | null
  readonly anchorKey?: string | null
  readonly anchorLabel?: string | null
  readonly note: string
  readonly slotNumber: number
  readonly replies?: ReadonlyArray<{
    readonly id: string
    readonly text: string
    readonly createdAt: string
  }>
  readonly createdAt?: string
}

type PublishedViewerNoteFilter = 'all' | PublishedViewerAnnotationNote['intent']
type PublishedViewerFocusArea = 'geography' | 'concentration' | 'performance' | 'config'

function readInitialSlotLocked(): boolean {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('slotLocked')
  return value === '1' || value === 'true'
}

export interface PublishedViewerSnapshot {
  readonly slotIndex: number
  readonly slotNumber: number
  readonly totalSlots: number
  readonly stepSize: 1 | 10 | 50
  readonly playing: boolean
  readonly activeRegions: number
  readonly totalValidators: number
  readonly dominantRegionId: string | null
  readonly dominantRegionCity: string | null
  readonly dominantRegionShare: number
  readonly currentGini: number | null
  readonly currentHhi: number | null
  readonly currentLiveness: number | null
  readonly currentMev: number | null
  readonly currentProposalTime: number | null
  readonly currentAttestation: number | null
  readonly currentTotalDistance: number | null
  readonly currentFailedBlockProposals: number | null
  readonly currentClusters: number | null
}

interface PublishedDatasetViewerProps {
  readonly viewerBaseUrl: string
  readonly dataset: ResearchDatasetEntry
  readonly initialSettings: PublishedViewerSettings
  readonly initialSlotIndex?: number
  readonly onClose?: () => void
  readonly onStateChange?: (snapshot: PublishedViewerSnapshot | null) => void
  readonly annotationNotes?: readonly PublishedViewerAnnotationNote[]
  readonly anchorScope?: 'primary' | 'comparison'
}

interface PublishedMetrics {
  readonly clusters?: readonly number[]
  readonly total_distance?: readonly number[]
  readonly avg_nnd?: readonly number[]
  readonly nni?: readonly number[]
  readonly mev?: readonly number[]
  readonly attestations?: readonly number[]
  readonly proposal_times?: readonly number[]
  readonly gini?: readonly number[]
  readonly hhi?: readonly number[]
  readonly liveness?: readonly number[]
  readonly failed_block_proposals?: readonly number[]
}

interface PublishedDatasetPayload {
  readonly v?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly cost?: number
  readonly gamma?: number
  readonly description?: string
  readonly n_slots?: number
  readonly metrics?: PublishedMetrics
  readonly sources?: ReadonlyArray<readonly [string, string]>
  readonly slots?: Record<string, ReadonlyArray<readonly [string, number]>>
}

interface ViewerState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly data: PublishedDatasetPayload | null
  readonly error: string | null
}

interface RegionCount {
  readonly regionId: string
  readonly count: number
  readonly region: GcpRegion | null
}

interface MacroRegionCount {
  readonly region: MacroRegion | 'Unknown'
  readonly count: number
}

const REGION_LOOKUP = new Map(GCP_REGIONS.map(region => [region.id, region] as const))
const MACRO_REGION_ORDER: readonly (MacroRegion | 'Unknown')[] = [
  'Europe',
  'North America',
  'Asia Pacific',
  'Middle East',
  'South America',
  'Africa',
  'Oceania',
  'Unknown',
] as const

const CHART_COLORS = {
  gini: '#C2553A',
  hhi: '#2563EB',
  liveness: '#16A34A',
  totalDistance: '#C2553A',
  proposalTime: '#D97706',
  mev: '#2563EB',
} as const

function buildViewerUrl(
  viewerBaseUrl: string,
  datasetPath: string,
  settings: PublishedViewerSettings,
): string {
  const normalizedBase = viewerBaseUrl.replace(/\/$/, '')
  const params = new URLSearchParams({
    dataset: datasetPath,
    theme: settings.theme,
    step: String(settings.step),
    autoplay: String(settings.autoplay),
  })
  return `${normalizedBase}/viewer.html?${params.toString()}`
}

function persistViewerSettings(
  datasetPath: string,
  settings: PublishedViewerSettings,
) {
  try {
    window.localStorage.setItem('app_settings', JSON.stringify({
      dataset: datasetPath,
      theme: settings.theme,
      step: settings.step,
      autoplay: settings.autoplay,
    }))
  } catch {
    // Ignore storage failures and rely on explicit props.
  }
}

function readMetricValue(series: readonly number[] | undefined, slot: number): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slot, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sampleMetricSeries(
  series: readonly number[] | undefined,
  slot: number,
  maxPoints = 240,
): Array<{ x: number; y: number }> {
  if (!series?.length) return []

  const upperBound = Math.max(0, Math.min(slot, series.length - 1))
  const totalPoints = upperBound + 1
  const stride = Math.max(1, Math.floor(totalPoints / maxPoints))
  const sampled: Array<{ x: number; y: number }> = []

  for (let index = 0; index <= upperBound; index += stride) {
    const value = series[index]
    if (typeof value === 'number' && Number.isFinite(value)) {
      sampled.push({ x: index, y: value })
    }
  }

  const lastValue = series[upperBound]
  const lastPoint = typeof lastValue === 'number' && Number.isFinite(lastValue)
    ? { x: upperBound, y: lastValue }
    : null

  if (lastPoint && sampled[sampled.length - 1]?.x !== lastPoint.x) {
    sampled.push(lastPoint)
  }

  return sampled
}

function percentage(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`
}

function countLabel(value: number): string {
  return value.toLocaleString()
}

function compactNumber(value: number, digits = 2): string {
  return formatNumber(value, digits)
}

function deltaLabel(current: number | null, baseline: number | null): string | undefined {
  if (current == null || baseline == null) return undefined
  if (baseline === 0) return `from ${formatNumber(baseline, 2)}`
  const pct = ((current - baseline) / Math.abs(baseline)) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${formatNumber(pct, 1)}% vs slot 1`
}

function regionShareLabel(region: RegionCount | null, totalValidators: number): string {
  if (!region || totalValidators <= 0) return '0%'
  return percentage((region.count / totalValidators) * 100, 1)
}

function sourceRoleLabel(sourceRole: string | undefined): string {
  if (sourceRole === 'signal') return 'Signal sources'
  if (sourceRole === 'supplier') return 'Supplier sources'
  return 'Info sources'
}

function getSlotRegions(data: PublishedDatasetPayload | null, slot: number): readonly RegionCount[] {
  if (!data?.slots) return []
  const rawRegions = data.slots[String(slot)] ?? []
  return rawRegions
    .map(([regionId, count]) => ({
      regionId,
      count: Number(count) || 0,
      region: REGION_LOOKUP.get(regionId) ?? null,
    }))
    .filter(region => region.count > 0)
}

function aggregateMacroRegions(regions: readonly RegionCount[]): readonly MacroRegionCount[] {
  const totals = new Map<MacroRegion | 'Unknown', number>()
  for (const region of regions) {
    const macroRegion = region.region?.macroRegion ?? 'Unknown'
    totals.set(macroRegion, (totals.get(macroRegion) ?? 0) + region.count)
  }
  return MACRO_REGION_ORDER
    .map(macroRegion => ({ region: macroRegion, count: totals.get(macroRegion) ?? 0 }))
    .filter(entry => entry.count > 0)
}

function aggregateSourceFootprint(data: PublishedDatasetPayload | null): readonly MacroRegionCount[] {
  const totals = new Map<MacroRegion | 'Unknown', number>()
  for (const source of data?.sources ?? []) {
    const regionId = source[1]
    const macroRegion = REGION_LOOKUP.get(regionId)?.macroRegion ?? 'Unknown'
    totals.set(macroRegion, (totals.get(macroRegion) ?? 0) + 1)
  }
  return MACRO_REGION_ORDER
    .map(macroRegion => ({ region: macroRegion, count: totals.get(macroRegion) ?? 0 }))
    .filter(entry => entry.count > 0)
}

function latLonToMercator(lat: number, lon: number, width: number, height: number) {
  const x = ((lon + 180) / 360) * width
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = height / 2 - (mercN / Math.PI) * (height / 2)
  return { x, y }
}

function continentPaths(width: number, height: number): string[] {
  return CONTINENT_OUTLINES.map(continent => {
    const segments = continent.points.map((point, index) => {
      const { x, y } = latLonToMercator(point[0], point[1], width, height)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    return `${segments.join(' ')} Z`
  })
}

function regionValueColor(value: number, maxValue: number): string {
  const normalized = Math.min(value / Math.max(maxValue, 1), 1)
  if (normalized < 0.15) return '#64748B'
  if (normalized < 0.4) return '#2563EB'
  if (normalized < 0.7) return '#C2553A'
  return '#F59E0B'
}

function regionValueRadius(value: number, maxValue: number): number {
  const normalized = Math.max(value / Math.max(maxValue, 1), 0.04)
  return 3 + normalized * 10
}

function noteIntentLabel(intent: PublishedViewerAnnotationNote['intent']): string {
  if (intent === 'question') return 'Question'
  if (intent === 'theory') return 'Theory'
  if (intent === 'methods') return 'Methods'
  return 'Observation'
}

function noteIntentClass(intent: PublishedViewerAnnotationNote['intent']): string {
  if (intent === 'question') return 'border-[#C2410C]/20 bg-[#FFF7ED] text-[#9A3412]'
  if (intent === 'theory') return 'border-[#1D4ED8]/20 bg-[#EFF6FF] text-[#1D4ED8]'
  if (intent === 'methods') return 'border-[#0F766E]/20 bg-[#ECFDF5] text-[#0F766E]'
  return 'border-[#7C3AED]/18 bg-[#F5F3FF] text-[#6D28D9]'
}

function resolvedMetricAnchorKey(note: PublishedViewerAnnotationNote): string | null {
  if (note.anchorKind === 'metric' && typeof note.anchorKey === 'string') return note.anchorKey
  if (note.anchorKind === 'comparison' && typeof note.anchorKey === 'string' && note.anchorKey.startsWith('metric:')) {
    return note.anchorKey.slice('metric:'.length)
  }
  return null
}

function isRegionAnchoredNote(note: PublishedViewerAnnotationNote): boolean {
  return note.anchorKind === 'region'
    || (note.anchorKind === 'comparison' && typeof note.anchorKey === 'string' && note.anchorKey.startsWith('region:'))
}

function noteFocusArea(note: PublishedViewerAnnotationNote): PublishedViewerFocusArea {
  if (note.anchorKind === 'region') return 'geography'
  if (note.anchorKind === 'comparison') {
    if (typeof note.anchorKey === 'string' && note.anchorKey.startsWith('region:')) {
      return 'geography'
    }
    const metricKey = resolvedMetricAnchorKey(note)
    if (metricKey === 'gini' || metricKey === 'hhi' || metricKey === 'liveness') {
      return 'concentration'
    }
    if (metricKey === 'proposal_time' || metricKey === 'mev' || metricKey === 'total_distance') {
      return 'performance'
    }
    return 'performance'
  }
  if (note.anchorKind === 'metric') {
    const metricKey = resolvedMetricAnchorKey(note)
    if (metricKey === 'gini' || metricKey === 'hhi' || metricKey === 'liveness') {
      return 'concentration'
    }
    if (metricKey === 'proposal_time' || metricKey === 'mev' || metricKey === 'total_distance') {
      return 'performance'
    }
  }

  if (note.intent === 'theory') return 'concentration'
  if (note.intent === 'methods') return 'config'
  if (note.intent === 'question') return 'performance'
  return 'geography'
}

function focusAreaLabel(area: PublishedViewerFocusArea): string {
  if (area === 'concentration') return 'concentration view'
  if (area === 'performance') return 'performance charts'
  if (area === 'config') return 'methods and configuration'
  return 'geography canvas'
}

function noteStatusLabel(
  status: PublishedViewerAnnotationNote['status'],
): string | null {
  if (status === 'open_question') return 'Open question'
  if (status === 'needs_evidence') return 'Needs evidence'
  if (status === 'challenged') return 'Challenged'
  if (status === 'supported') return 'Supported'
  if (status === 'author_addressed') return 'Author addressed'
  return null
}

function noteContributionLabel(
  contributionType: PublishedViewerAnnotationNote['contributionType'],
): string | null {
  if (contributionType === 'method_concern') return 'Method concern'
  if (!contributionType) return null
  return contributionType.charAt(0).toUpperCase() + contributionType.slice(1)
}

function noteLaneLabel(
  communityLane: PublishedViewerAnnotationNote['communityLane'],
): string | null {
  if (communityLane === 'author') return 'Author note'
  if (communityLane === 'reviewer') return 'Reviewer note'
  if (communityLane === 'community') return 'Community note'
  return null
}

function noteMetaLabel(note: PublishedViewerAnnotationNote): string | null {
  const parts = [
    noteLaneLabel(note.communityLane),
    noteContributionLabel(note.contributionType),
    noteStatusLabel(note.status),
  ].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(' · ') : null
}

function noteMatchesMetric(
  note: PublishedViewerAnnotationNote,
  keys: readonly string[],
): boolean {
  const metricKey = resolvedMetricAnchorKey(note)
  return metricKey != null && keys.includes(metricKey)
}

function noteMatchesRegion(
  note: PublishedViewerAnnotationNote,
  regionId: string,
  regionLabel: string,
): boolean {
  if (note.anchorKind === 'region') {
    return note.anchorKey === regionId || note.anchorKey === regionLabel
  }
  if (note.anchorKind === 'comparison' && typeof note.anchorKey === 'string' && note.anchorKey.startsWith('region:')) {
    const comparisonKey = note.anchorKey.slice('region:'.length)
    return comparisonKey === regionId || comparisonKey === regionLabel
  }
  return false
}

function curatedNotePriority(note: PublishedViewerAnnotationNote): number {
  let score = 0
  if (note.communityLane === 'author') score += 40
  if (note.status === 'author_addressed') score += 32
  if (note.status === 'open_question') score += 28
  if (note.status === 'challenged') score += 24
  if (note.contributionType === 'question') score += 14
  if (note.contributionType === 'counterpoint') score += 12
  if (note.annotationScope === 'time_range' || note.annotationScope === 'region_over_time') score += 8
  score += Math.min(note.replies?.length ?? 0, 4)
  return score
}

function sortNotesForDisplay(
  notes: readonly PublishedViewerAnnotationNote[],
): PublishedViewerAnnotationNote[] {
  return [...notes].sort((left, right) => {
    const priorityGap = curatedNotePriority(right) - curatedNotePriority(left)
    if (priorityGap !== 0) return priorityGap
    const leftReplies = left.replies?.length ?? 0
    const rightReplies = right.replies?.length ?? 0
    if (leftReplies !== rightReplies) return rightReplies - leftReplies
    const rightCreatedAt = typeof right.createdAt === 'string' ? new Date(right.createdAt).getTime() : 0
    const leftCreatedAt = typeof left.createdAt === 'string' ? new Date(left.createdAt).getTime() : 0
    return rightCreatedAt - leftCreatedAt
  })
}

function summarizeNoteCluster(
  notes: readonly PublishedViewerAnnotationNote[],
): string | null {
  if (notes.length === 0) return null

  const openQuestions = notes.filter(note => note.status === 'open_question' || note.contributionType === 'question').length
  if (openQuestions > 0) {
    return `${openQuestions} open question${openQuestions === 1 ? '' : 's'}`
  }

  const challenged = notes.filter(note => note.status === 'challenged' || note.contributionType === 'counterpoint').length
  if (challenged > 0) {
    return `${challenged} challenged read${challenged === 1 ? '' : 's'}`
  }

  const authorNotes = notes.filter(note => note.communityLane === 'author' || note.status === 'author_addressed').length
  if (authorNotes > 0) {
    return `${authorNotes} author response${authorNotes === 1 ? '' : 's'}`
  }

  const evidenceNotes = notes.filter(note => note.contributionType === 'evidence').length
  if (evidenceNotes > 0) {
    return `${evidenceNotes} evidence thread${evidenceNotes === 1 ? '' : 's'}`
  }

  return `${notes.length} discussion note${notes.length === 1 ? '' : 's'}`
}

function buildPublishedReplayAnchorSelection(
  anchorScope: 'primary' | 'comparison',
  detail: {
    kind: 'general' | 'region' | 'metric' | 'comparison'
    key: string
    label: string
  },
) {
  if (anchorScope === 'comparison') {
    if (detail.kind === 'general' || detail.kind === 'comparison') {
      return { kind: 'comparison' as const, key: 'comparison', label: 'Comparison posture' }
    }
    if (detail.kind === 'region') {
      return { kind: 'comparison' as const, key: `region:${detail.key}`, label: `Comparison ${detail.label}` }
    }
    return { kind: 'comparison' as const, key: `metric:${detail.key}`, label: `Comparison ${detail.label}` }
  }

  return detail
}

function dispatchPublishedReplayAnchorSelection(detail: {
  kind: 'general' | 'region' | 'metric' | 'comparison'
  key: string
  label: string
}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('published-replay-anchor-select', { detail }))
}

function PublishedGeoCard({
  title,
  regions,
  annotationNotes,
  selectedNoteId,
  onSelectNote,
  focusAreaActive,
  anchorScope,
}: {
  title: string
  regions: readonly RegionCount[]
  annotationNotes?: readonly PublishedViewerAnnotationNote[]
  selectedNoteId?: string | null
  onSelectNote?: (id: string) => void
  focusAreaActive?: boolean
  anchorScope: 'primary' | 'comparison'
}) {
  const sortedRegions = [...regions].sort((left, right) => right.count - left.count)
  const topRegions = sortedRegions.slice(0, 6)
  const macroRegionCounts = aggregateMacroRegions(regions)
  const totalValidators = sortedRegions.reduce((sum, region) => sum + region.count, 0)
  const maxValue = Math.max(...sortedRegions.map(region => region.count), 1)
  const dominantRegion = topRegions[0] ?? null
  const regionAnchoredNotes = useMemo(
    () => annotationNotes?.filter(note => isRegionAnchoredNote(note)) ?? [],
    [annotationNotes],
  )

  const svgWidth = 820
  const svgHeight = 430
  const continentShapePaths = useMemo(() => continentPaths(svgWidth, svgHeight), [])
  const gradientKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const atmosphereId = `geo-atmosphere-${gradientKey}`
  const dominantGlowId = `geo-dominant-${gradientKey}`
  const dominantRegionPoint = dominantRegion?.region
    ? latLonToMercator(dominantRegion.region.lat, dominantRegion.region.lon, svgWidth, svgHeight)
    : null

  return (
    <div className={cn(
      'overflow-hidden rounded-xl border border-rule bg-white transition-all duration-300',
      focusAreaActive ? 'ring-2 ring-accent/40' : '',
    )}>
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted">Current slot geography</div>
            <h3 className="mt-1 text-sm font-medium text-text-primary">{title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="lab-chip">{countLabel(totalValidators)} validators</span>
            <span className="lab-chip">{countLabel(regions.length)} active regions</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
        <div className="relative overflow-hidden rounded-2xl border border-[#1F2937] bg-[#0D1117]">
          {annotationNotes && annotationNotes.length > 0 ? (
            <div className="absolute inset-x-4 top-4 z-10 flex max-w-xl flex-wrap gap-2">
              <div className="rounded-full border border-white/12 bg-[#0F172A]/78 px-3 py-1.5 text-2xs font-medium uppercase tracking-[0.1em] text-white/85 backdrop-blur-md">
                {annotationNotes.length} paper note{annotationNotes.length === 1 ? '' : 's'} pinned to this slot
              </div>
              {annotationNotes.slice(0, 2).map(note => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote?.(note.id)}
                  className={cn(
                    'pointer-events-auto max-w-[18rem] rounded-full border px-3 py-1.5 text-left text-11 text-white/88 backdrop-blur-md transition-all',
                    selectedNoteId === note.id
                      ? 'border-white/45 bg-white/20 shadow-[0_16px_30px_rgba(15,23,42,0.22)]'
                      : 'border-white/12 bg-white/10 hover:border-white/30 hover:bg-white/14',
                  )}
                >
                  <span className="font-medium">{noteIntentLabel(note.intent)}{note.anchorLabel ? ` · ${note.anchorLabel}` : ''}:</span> {note.note}
                </button>
              ))}
            </div>
          ) : null}
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
          >
            <defs>
              <linearGradient id={atmosphereId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#08111F" />
                <stop offset="55%" stopColor="#0B1323" />
                <stop offset="100%" stopColor="#101A2E" />
              </linearGradient>
              <radialGradient id={dominantGlowId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(96,165,250,0.72)" />
                <stop offset="55%" stopColor="rgba(59,130,246,0.22)" />
                <stop offset="100%" stopColor="rgba(15,23,42,0)" />
              </radialGradient>
            </defs>

            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill={`url(#${atmosphereId})`} />

            {dominantRegionPoint ? (
              <circle
                cx={dominantRegionPoint.x}
                cy={dominantRegionPoint.y}
                r={72}
                fill={`url(#${dominantGlowId})`}
                opacity={0.7}
              >
                <animate attributeName="opacity" values="0.48;0.82;0.48" dur="3.2s" repeatCount="indefinite" />
              </circle>
            ) : null}

            {[0.2, 0.4, 0.6, 0.8].map(fraction => (
              <line
                key={`h-${fraction}`}
                x1={0}
                y1={svgHeight * fraction}
                x2={svgWidth}
                y2={svgHeight * fraction}
                stroke="#1F2937"
                strokeWidth={0.6}
              />
            ))}

            {[0.2, 0.4, 0.6, 0.8].map(fraction => (
              <line
                key={`v-${fraction}`}
                x1={svgWidth * fraction}
                y1={0}
                x2={svgWidth * fraction}
                y2={svgHeight}
                stroke="#1F2937"
                strokeWidth={0.6}
              />
            ))}

            {continentShapePaths.map((pathD, index) => (
              <path
                key={CONTINENT_OUTLINES[index]!.name}
                d={pathD}
                fill="#172233"
                stroke="#2B3A52"
                strokeWidth={0.5}
                strokeLinejoin="round"
              />
            ))}

            {sortedRegions
              .filter(region => region.region)
              .map(region => {
                const geoRegion = region.region!
                const { x, y } = latLonToMercator(geoRegion.lat, geoRegion.lon, svgWidth, svgHeight)
                const fill = regionValueColor(region.count, maxValue)
                const radius = regionValueRadius(region.count, maxValue)
                const share = totalValidators > 0 ? (region.count / totalValidators) * 100 : 0

                return (
                  <g
                    key={region.regionId}
                    onClick={() => dispatchPublishedReplayAnchorSelection(buildPublishedReplayAnchorSelection(anchorScope, {
                      kind: 'region',
                      key: region.regionId,
                      label: `Region · ${geoRegion.city}`,
                    }))}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={radius * 1.8}
                      fill={fill}
                      opacity={0.1}
                      style={{ transition: 'r 360ms ease, opacity 360ms ease, fill 360ms ease' }}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      fill={fill}
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth={1}
                      style={{ transition: 'r 360ms ease, opacity 360ms ease, fill 360ms ease, cx 360ms ease, cy 360ms ease' }}
                    >
                      <title>{`${geoRegion.city} (${region.regionId}) · ${countLabel(region.count)} validators · ${percentage(share, 1)}`}</title>
                    </circle>
                  </g>
                )
              })}
          </svg>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-rule bg-surface-active p-4">
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Top regions</div>
            <div className="mt-3 space-y-2.5">
              {topRegions.map(region => {
                const regionLabel = region.region ? region.region.city : region.regionId
                const fill = regionValueColor(region.count, maxValue)
                const share = totalValidators > 0 ? (region.count / totalValidators) * 100 : 0
                const regionNotes = regionAnchoredNotes.filter(note => noteMatchesRegion(note, region.regionId, regionLabel))
                const regionNoteCount = regionNotes.length
                const regionNoteSummary = summarizeNoteCluster(regionNotes)
                return (
                  <button
                    key={region.regionId}
                    type="button"
                    onClick={() => dispatchPublishedReplayAnchorSelection(buildPublishedReplayAnchorSelection(anchorScope, {
                      kind: 'region',
                      key: region.regionId,
                      label: `Region · ${regionLabel}`,
                    }))}
                    className="block w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-active"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-xs font-medium text-text-primary">{regionLabel}</div>
                          {regionNoteCount > 0 ? (
                            <span className="rounded-full border border-[#DBE4F0] bg-[#F8FAFC] px-2 py-0.5 text-2xs font-medium text-text-primary">
                              {regionNoteCount} note{regionNoteCount === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-11 text-muted">{region.regionId}</div>
                        {regionNoteSummary ? (
                          <div className="mt-1 truncate text-2xs font-medium text-text-primary">
                            {regionNoteSummary}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-medium tabular-nums text-text-primary">{countLabel(region.count)}</div>
                        <div className="text-11 text-muted">{percentage(share, 1)}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-active">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, backgroundColor: fill, transition: 'width 420ms ease' }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-white p-4">
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Macro regions</div>
            <div className="mt-3 space-y-2">
              {macroRegionCounts.map(entry => {
                const share = totalValidators > 0 ? (entry.count / totalValidators) * 100 : 0
                return (
                  <div key={entry.region}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-text-primary">{entry.region}</span>
                      <span className="tabular-nums text-muted">{percentage(share, 1)}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-surface-active">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${share}%`, transition: 'width 420ms ease' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PublishedDatasetViewer({
  viewerBaseUrl,
  dataset,
  initialSettings,
  initialSlotIndex = 0,
  onClose,
  onStateChange,
  annotationNotes = [] as readonly PublishedViewerAnnotationNote[],
  anchorScope = 'primary',
}: PublishedDatasetViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>({
    status: 'loading',
    data: null,
    error: null,
  })
  const [slot, setSlot] = useState(0)
  const [playing, setPlaying] = useState(initialSettings.autoplay)
  const [stepSize, setStepSize] = useState<1 | 10 | 50>(initialSettings.step)
  const [slotLocked, setSlotLocked] = useState(() => readInitialSlotLocked())
  const [activeNoteFilter, setActiveNoteFilter] = useState<PublishedViewerNoteFilter>(() => {
    if (typeof window === 'undefined') return 'all'
    const value = new URLSearchParams(window.location.search).get('noteFilter')
    return value === 'observation' || value === 'question' || value === 'theory' || value === 'methods'
      ? value
      : 'all'
  })
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('note')
  })
  const [noteShareStatus, setNoteShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const controller = new AbortController()
    const normalizedBase = viewerBaseUrl.replace(/\/$/, '')

    setViewerState({
      status: 'loading',
      data: null,
      error: null,
    })
    onStateChange?.(null)
    setSlot(Math.max(0, Math.floor(initialSlotIndex)))
    setPlaying(initialSettings.autoplay)
    setStepSize(initialSettings.step)
    setSlotLocked(readInitialSlotLocked())

    const load = async () => {
      try {
        const response = await fetch(`${normalizedBase}/${dataset.path}`, {
          cache: 'force-cache',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Failed to load ${dataset.path}`)

        const text = await response.text()

        if (text.startsWith('version https://git-lfs')) {
          throw new Error(
            `${dataset.path} is a Git LFS pointer, not resolved data. The deployment needs git-lfs installed to fetch the actual simulation files.`,
          )
        }

        const payload = JSON.parse(text) as PublishedDatasetPayload
        setViewerState({
          status: 'ready',
          data: payload,
          error: null,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setViewerState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Unknown dataset error',
        })
      }
    }

    void load()

    return () => {
      controller.abort()
      onStateChange?.(null)
    }
  }, [dataset, initialSettings.autoplay, initialSettings.step, initialSlotIndex, onStateChange, viewerBaseUrl])

  const data = viewerState.data
  const totalSlots = Math.max(
    1,
    data?.n_slots ?? 0,
    data?.metrics?.gini?.length ?? 0,
    data?.metrics?.mev?.length ?? 0,
    Object.keys(data?.slots ?? {}).length,
  )
  const lastSlot = Math.max(0, totalSlots - 1)

  useEffect(() => {
    if (!playing || slotLocked) return
    const intervalId = window.setInterval(() => {
      setSlot(previous => Math.min(previous + stepSize, lastSlot))
    }, 240)
    return () => window.clearInterval(intervalId)
  }, [lastSlot, playing, slotLocked, stepSize])

  useEffect(() => {
    setSlot(previous => Math.min(previous, lastSlot))
  }, [lastSlot])

  useEffect(() => {
    if (slot >= lastSlot) setPlaying(false)
  }, [lastSlot, slot])

  const filteredAnnotationNotes = useMemo(() => (
    activeNoteFilter === 'all'
      ? annotationNotes
      : annotationNotes.filter(note => note.intent === activeNoteFilter)
  ), [activeNoteFilter, annotationNotes])
  const regionAnchoredNotes = useMemo(
    () => annotationNotes.filter(note => isRegionAnchoredNote(note)),
    [annotationNotes],
  )

  useEffect(() => {
    if (activeNoteFilter !== 'all' && !annotationNotes.some(note => note.intent === activeNoteFilter)) {
      setActiveNoteFilter('all')
    }
  }, [activeNoteFilter, annotationNotes])

  useEffect(() => {
    if (filteredAnnotationNotes.length === 0) {
      if (selectedNoteId !== null) setSelectedNoteId(null)
      return
    }

    if (!selectedNoteId || !filteredAnnotationNotes.some(note => note.id === selectedNoteId)) {
      setSelectedNoteId(filteredAnnotationNotes[0]!.id)
    }
  }, [filteredAnnotationNotes, selectedNoteId])

  const currentRegions = useMemo(() => getSlotRegions(data, slot), [data, slot])
  const initialRegions = useMemo(() => getSlotRegions(data, 0), [data])
  const sourceFootprint = useMemo(() => aggregateSourceFootprint(data), [data])

  const topRegion = currentRegions.length > 0
    ? [...currentRegions].sort((left, right) => right.count - left.count)[0] ?? null
    : null
  const initialDominantRegion = initialRegions.length > 0
    ? [...initialRegions].sort((left, right) => right.count - left.count)[0] ?? null
    : null

  const totalValidators = currentRegions.reduce((sum, region) => sum + region.count, 0)
  const initialValidators = Math.max(initialRegions.reduce((sum, region) => sum + region.count, 0), 1)
  const dominantShare = topRegion && totalValidators > 0
    ? (topRegion.count / totalValidators) * 100
    : 0
  const initialDominantShare = initialDominantRegion
    ? (initialDominantRegion.count / initialValidators) * 100
    : 0

  const metrics = data?.metrics ?? {}
  const currentGini = readMetricValue(metrics.gini, slot)
  const currentHhi = readMetricValue(metrics.hhi, slot)
  const currentLiveness = readMetricValue(metrics.liveness, slot)
  const currentMev = readMetricValue(metrics.mev, slot)
  const currentProposalTime = readMetricValue(metrics.proposal_times, slot)
  const currentAttestation = readMetricValue(metrics.attestations, slot)
  const currentClusters = readMetricValue(metrics.clusters, slot)
  const currentTotalDistance = readMetricValue(metrics.total_distance, slot)
  const currentFailedBlockProposals = readMetricValue(metrics.failed_block_proposals, slot)
  const initialGini = readMetricValue(metrics.gini, 0)
  const initialMev = readMetricValue(metrics.mev, 0)
  const initialProposalTime = readMetricValue(metrics.proposal_times, 0)
  const initialTotalDistance = readMetricValue(metrics.total_distance, 0)
  const noteIntentCounts = useMemo(() => ({
    observation: annotationNotes.filter(note => note.intent === 'observation').length,
    question: annotationNotes.filter(note => note.intent === 'question').length,
    theory: annotationNotes.filter(note => note.intent === 'theory').length,
    methods: annotationNotes.filter(note => note.intent === 'methods').length,
  }), [annotationNotes])
  const metricNoteCounts = useMemo(() => ({
    geography: annotationNotes.filter(note => isRegionAnchoredNote(note)).length,
    gini: annotationNotes.filter(note => noteMatchesMetric(note, ['gini'])).length,
    concentration: annotationNotes.filter(note => noteMatchesMetric(note, ['gini', 'hhi', 'liveness'])).length,
    performance: annotationNotes.filter(note => noteMatchesMetric(note, ['proposal_time', 'mev', 'total_distance'])).length,
    mev: annotationNotes.filter(note => noteMatchesMetric(note, ['mev'])).length,
    proposalTime: annotationNotes.filter(note => noteMatchesMetric(note, ['proposal_time'])).length,
    methods: annotationNotes.filter(note => (note.anchorKind === 'comparison' && note.anchorKey === 'comparison') || note.intent === 'methods').length,
  }), [annotationNotes])
  const topRegionNotes = useMemo(() => {
    if (!topRegion) return regionAnchoredNotes
    const regionLabel = topRegion.region?.city ?? topRegion.regionId
    return regionAnchoredNotes.filter(note => noteMatchesRegion(note, topRegion.regionId, regionLabel))
  }, [regionAnchoredNotes, topRegion])
  const noteSurfaceSummaries = useMemo(() => ({
    slot: summarizeNoteCluster(annotationNotes),
    geography: summarizeNoteCluster(topRegionNotes),
    gini: summarizeNoteCluster(annotationNotes.filter(note => noteMatchesMetric(note, ['gini']))),
    mev: summarizeNoteCluster(annotationNotes.filter(note => noteMatchesMetric(note, ['mev']))),
    proposal: summarizeNoteCluster(annotationNotes.filter(note => noteMatchesMetric(note, ['proposal_time']))),
  }), [annotationNotes, topRegionNotes])
  const focusedNote = useMemo(
    () => filteredAnnotationNotes.find(note => note.id === selectedNoteId) ?? filteredAnnotationNotes[0] ?? null,
    [filteredAnnotationNotes, selectedNoteId],
  )
  const focusedArea = focusedNote ? noteFocusArea(focusedNote) : null
  const discussionSummary = useMemo(() => ({
    openQuestions: annotationNotes.filter(note => note.status === 'open_question' || note.contributionType === 'question').length,
    challenged: annotationNotes.filter(note => note.status === 'challenged' || note.contributionType === 'counterpoint').length,
    authorAddressed: annotationNotes.filter(note => note.status === 'author_addressed' || note.communityLane === 'author').length,
    timeRanges: annotationNotes.filter(note => note.annotationScope === 'time_range' || note.annotationScope === 'region_over_time').length,
  }), [annotationNotes])
  const marginaliaNotes = useMemo(() => {
    return sortNotesForDisplay(filteredAnnotationNotes).slice(0, 4)
  }, [filteredAnnotationNotes])
  const leadingDebate = useMemo(() => {
    const anchors = new Map<string, PublishedViewerAnnotationNote[]>()
    for (const note of filteredAnnotationNotes) {
      const key = note.anchorLabel ?? noteIntentLabel(note.intent)
      const existing = anchors.get(key) ?? []
      existing.push(note)
      anchors.set(key, existing)
    }
    const leading = [...anchors.entries()].sort((left, right) => {
      const countGap = right[1].length - left[1].length
      if (countGap !== 0) return countGap
      return curatedNotePriority(right[1][0]!) - curatedNotePriority(left[1][0]!)
    })[0]
    if (!leading) return null
    return {
      label: leading[0],
      count: leading[1].length,
      summary: summarizeNoteCluster(leading[1]),
    }
  }, [filteredAnnotationNotes])
  const buildChartNotePins = (
    notes: readonly PublishedViewerAnnotationNote[],
    chartKey: 'concentration' | 'distance' | 'proposal' | 'mev',
  ) => notes.flatMap(note => {
    const metricKey = resolvedMetricAnchorKey(note)
    let pinValue: number | null = null

    if (chartKey === 'concentration') {
      if (metricKey === 'hhi') pinValue = currentHhi
      else if (metricKey === 'liveness') pinValue = currentLiveness
      else pinValue = currentGini ?? currentLiveness ?? currentHhi
    } else if (chartKey === 'distance') {
      pinValue = currentTotalDistance
    } else if (chartKey === 'proposal') {
      if (metricKey === 'mev') pinValue = currentMev
      else if (metricKey === 'total_distance') pinValue = currentTotalDistance
      else pinValue = currentProposalTime ?? currentMev ?? currentTotalDistance
    } else if (chartKey === 'mev') {
      pinValue = currentMev
    }

    if (pinValue == null) return []

    return [{
      id: note.id,
      label: note.anchorLabel ?? noteIntentLabel(note.intent),
      x: slot,
      y: pinValue,
      intent: note.intent,
      active: focusedNote?.id === note.id,
      onSelect: () => setSelectedNoteId(note.id),
    }]
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const params = url.searchParams
    if (activeNoteFilter === 'all' || annotationNotes.length === 0) {
      params.delete('noteFilter')
    } else {
      params.set('noteFilter', activeNoteFilter)
    }
    if (focusedNote?.id && annotationNotes.length > 0) {
      params.set('note', focusedNote.id)
    } else {
      params.delete('note')
    }
    if (slotLocked) {
      params.set('slotLocked', '1')
    } else {
      params.delete('slotLocked')
    }
    window.history.replaceState({}, '', `${url.pathname}?${params.toString()}${url.hash}`)
  }, [activeNoteFilter, annotationNotes.length, focusedNote?.id, slotLocked])

  useEffect(() => {
    if (noteShareStatus !== 'idle') {
      setNoteShareStatus('idle')
    }
  }, [activeNoteFilter, focusedNote?.id, noteShareStatus])

  useEffect(() => {
    if (!onStateChange || viewerState.status !== 'ready') return

    onStateChange({
      slotIndex: slot,
      slotNumber: slot + 1,
      totalSlots,
      stepSize,
      playing,
      activeRegions: currentRegions.length,
      totalValidators,
      dominantRegionId: topRegion?.regionId ?? null,
      dominantRegionCity: topRegion?.region?.city ?? null,
      dominantRegionShare: dominantShare,
      currentGini,
      currentHhi,
      currentLiveness,
      currentMev,
      currentProposalTime,
      currentAttestation,
      currentTotalDistance,
      currentFailedBlockProposals,
      currentClusters,
    })
  }, [
    currentAttestation,
    currentClusters,
    currentFailedBlockProposals,
    currentGini,
    currentHhi,
    currentLiveness,
    currentMev,
    currentProposalTime,
    currentRegions.length,
    currentTotalDistance,
    dominantShare,
    onStateChange,
    playing,
    slot,
    stepSize,
    topRegion?.region?.city,
    topRegion?.regionId,
    totalSlots,
    totalValidators,
    viewerState.status,
  ])

  const metadata = dataset.metadata ?? {}
  const timelineProgress = lastSlot > 0 ? (slot / lastSlot) * 100 : 0
  const viewerUrl = buildViewerUrl(viewerBaseUrl, dataset.path, {
    theme: initialSettings.theme,
    step: stepSize,
    autoplay: playing,
  })

  const sourceChartBlock = {
    type: 'chart' as const,
    title: `${sourceRoleLabel(dataset.sourceRole)} footprint`,
    data: sourceFootprint.map(entry => ({
      label: entry.region,
      value: entry.count,
    })),
    chartType: 'bar' as const,
  }

  const concentrationSeriesBlock = {
    type: 'timeseries' as const,
    title: 'Concentration and liveness',
    series: [
      { label: 'Gini', data: sampleMetricSeries(metrics.gini, slot), color: CHART_COLORS.gini },
      { label: 'HHI', data: sampleMetricSeries(metrics.hhi, slot), color: CHART_COLORS.hhi },
      { label: 'Liveness', data: sampleMetricSeries(metrics.liveness, slot), color: CHART_COLORS.liveness },
    ],
    xLabel: 'Slot',
    yLabel: 'Index',
    annotations: slot > 0 ? [{ x: slot, label: 'Current slot' }] : [],
  }

  const distanceSeriesBlock = {
    type: 'timeseries' as const,
    title: 'Total validator distance',
    series: [
      { label: 'Total distance', data: sampleMetricSeries(metrics.total_distance, slot), color: CHART_COLORS.totalDistance },
    ],
    xLabel: 'Slot',
    yLabel: 'Distance',
    annotations: slot > 0 ? [{ x: slot, label: 'Current slot' }] : [],
  }

  const proposalSeriesBlock = {
    type: 'timeseries' as const,
    title: 'Proposal time',
    series: [
      { label: 'Proposal time', data: sampleMetricSeries(metrics.proposal_times, slot), color: CHART_COLORS.proposalTime },
    ],
    xLabel: 'Slot',
    yLabel: 'Milliseconds',
    annotations: slot > 0 ? [{ x: slot, label: 'Current slot' }] : [],
  }

  const mevSeriesBlock = {
    type: 'timeseries' as const,
    title: 'Average MEV',
    series: [
      { label: 'MEV', data: sampleMetricSeries(metrics.mev, slot), color: CHART_COLORS.mev },
    ],
    xLabel: 'Slot',
    yLabel: 'ETH',
    annotations: slot > 0 ? [{ x: slot, label: 'Current slot' }] : [],
  }

  const insightText = topRegion?.region
    ? `At **slot ${countLabel(slot + 1)}**, **${topRegion.region.city}** leads with **${countLabel(topRegion.count)} validators** (${regionShareLabel(topRegion, totalValidators)}). Relative to slot 1, the geography moved from **${countLabel(initialRegions.length)}** active regions to **${countLabel(currentRegions.length)}**, while total distance moved from **${compactNumber(initialTotalDistance ?? 0, 2)}** to **${compactNumber(currentTotalDistance ?? 0, 2)}**. This stays on the frozen published dataset, but renders the core viewer inside our shell.`
    : 'This stays on the frozen published dataset, but renders the core viewer inside our shell.'

  const insightBlock = {
    type: 'insight' as const,
    title: 'Published dataset readout',
    text: insightText,
    emphasis: dominantShare >= 40 ? 'key-finding' as const : 'normal' as const,
  }

  if (viewerState.status === 'loading') {
    return (
      <div className="lab-stage p-6">
        <div className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading frozen published dataset…
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="lab-skeleton lab-skeleton-block h-[320px] chart-skeleton-breathe" />
          <div className="space-y-4">
            <div className="lab-skeleton lab-skeleton-block h-[160px] chart-skeleton-breathe" style={{ animationDelay: '120ms' }} />
            <div className="lab-skeleton lab-skeleton-block h-[140px] chart-skeleton-breathe" style={{ animationDelay: '240ms' }} />
          </div>
        </div>
      </div>
    )
  }

  if (viewerState.status === 'error') {
    return (
      <div className="lab-stage p-6">
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {viewerState.error ?? 'Unable to load the published dataset.'}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      {/* ── Compact header ── */}
      <motion.div
        className="flex flex-wrap items-center justify-between gap-3 px-1"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_CRISP, delay: 0.04 }}
      >
        <motion.div
          className="flex flex-wrap items-center gap-2 text-xs text-muted"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="show"
        >
          <motion.span variants={STAGGER_ITEM} className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1 text-11 font-medium text-text-primary">
            {dataset.evaluation} · {dataset.paradigm} · {dataset.result}
          </motion.span>
          <motion.span variants={STAGGER_ITEM} className="lab-chip">{sourceRoleLabel(dataset.sourceRole)}</motion.span>
          <motion.span variants={STAGGER_ITEM} className="lab-chip">{countLabel(totalSlots)} slots</motion.span>
          <motion.span variants={STAGGER_ITEM} className="lab-chip">Slot {countLabel(slot + 1)}</motion.span>
          {topRegion?.region && <motion.span variants={STAGGER_ITEM} className="lab-chip">{topRegion.region.city} {regionShareLabel(topRegion, totalValidators)}</motion.span>}
        </motion.div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              persistViewerSettings(dataset.path, {
                theme: initialSettings.theme,
                step: stepSize,
                autoplay: playing,
              })
              const popup = window.open(viewerUrl, '_blank', 'noopener,noreferrer')
              if (!popup) window.location.assign(viewerUrl)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-text-primary hover:border-border-hover transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Standalone
          </button>
          {onClose ? (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-text-primary hover:border-border-hover transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Hide
            </button>
          ) : null}
        </div>
      </motion.div>

      {/* ── Playback controls (compact inline bar) ── */}
      <motion.div
        className="flex flex-wrap items-center gap-2 px-1"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_CRISP, delay: 0.08 }}
      >
        <button disabled={slotLocked} onClick={() => setPlaying(previous => !previous)} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:border disabled:border-rule disabled:bg-surface-active disabled:text-muted', playing ? 'bg-accent text-white shadow-[0_12px_24px_rgba(37,99,235,0.16)]' : 'border border-rule bg-white text-text-primary hover:border-border-hover')}>
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => { setPlaying(false); setSlotLocked(previous => !previous) }}
          className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all', slotLocked ? 'bg-[#0F172A] text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)]' : 'border border-rule bg-white text-text-primary hover:border-border-hover')}
        >
          <Lock className="h-3.5 w-3.5" />
          {slotLocked ? 'Unlock' : 'Lock'}
        </button>
        <button onClick={() => { setPlaying(false); setSlotLocked(false); setSlot(0) }} className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary transition-all hover:border-border-hover">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        {[1, 10, 50].map(option => (
          <button key={option} onClick={() => setStepSize(option as 1 | 10 | 50)} className={cn('rounded-xl border px-3 py-2 text-xs font-medium transition-all', stepSize === option ? 'border-accent bg-accent/10 text-accent' : 'border-rule bg-white text-text-primary hover:border-border-hover')}>
            ×{option}
          </button>
        ))}
        <div className="flex-1 min-w-[120px]">
          <input
            type="range"
            min={0}
            max={lastSlot}
            step={1}
            value={slot}
            disabled={slotLocked}
            onChange={event => { setPlaying(false); setSlot(Number(event.target.value)) }}
            className="h-1.5 w-full appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: `linear-gradient(90deg, rgba(37,99,235,0.95) 0%, rgba(37,99,235,0.95) ${timelineProgress}%, rgba(226,232,240,0.95) ${timelineProgress}%, rgba(226,232,240,0.95) 100%)`,
            }}
            aria-label="Simulation slot"
          />
        </div>
      </motion.div>

      {/* ── Map + Charts (primary content) ── */}
      <motion.div
        className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.12 }}
      >
        <PublishedGeoCard
          title={`${dataset.evaluation} · ${dataset.paradigm} · ${dataset.result}`}
          regions={currentRegions}
          annotationNotes={filteredAnnotationNotes}
          selectedNoteId={focusedNote?.id ?? null}
          onSelectNote={setSelectedNoteId}
          focusAreaActive={focusedArea === 'geography'}
          anchorScope={anchorScope}
        />
        <div className="space-y-4">
          <ChartBlock block={sourceChartBlock} />
          <InsightBlock block={insightBlock} />
        </div>
      </motion.div>

      <motion.div
        className="grid gap-6 xl:grid-cols-2"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="show"
      >
        {[
          {
            key: 'concentration',
            block: concentrationSeriesBlock,
            notes: filteredAnnotationNotes.filter(note =>
              isRegionAnchoredNote(note)
              || noteMatchesMetric(note, ['gini', 'hhi', 'liveness']),
            ),
            notePins: buildChartNotePins(filteredAnnotationNotes.filter(note =>
              isRegionAnchoredNote(note) || noteMatchesMetric(note, ['gini', 'hhi', 'liveness'])
            ), 'concentration'),
          },
          {
            key: 'distance',
            block: distanceSeriesBlock,
            notes: filteredAnnotationNotes.filter(note => noteMatchesMetric(note, ['total_distance'])),
            notePins: buildChartNotePins(
              filteredAnnotationNotes.filter(note => noteMatchesMetric(note, ['total_distance'])),
              'distance',
            ),
          },
          {
            key: 'proposal',
            block: proposalSeriesBlock,
            notes: filteredAnnotationNotes.filter(note =>
              noteMatchesMetric(note, ['proposal_time']) || note.anchorKind === 'comparison',
            ),
            notePins: buildChartNotePins(
              filteredAnnotationNotes.filter(note =>
                noteMatchesMetric(note, ['proposal_time']) || note.anchorKind === 'comparison'
              ),
              'proposal',
            ),
          },
          {
            key: 'mev',
            block: mevSeriesBlock,
            notes: filteredAnnotationNotes.filter(note => noteMatchesMetric(note, ['mev'])),
            notePins: buildChartNotePins(
              filteredAnnotationNotes.filter(note => noteMatchesMetric(note, ['mev'])),
              'mev',
            ),
          },
        ].map(entry => {
          const curatedEntryNotes = sortNotesForDisplay(entry.notes)
          const entrySummary = summarizeNoteCluster(entry.notes)

          return (
          <motion.div key={entry.key} className="relative" variants={STAGGER_ITEM}>
            {entry.notes.length > 0 ? (
              <div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-2">
                <div className="rounded-full border border-[#0F172A]/12 bg-white/92 px-3 py-1 text-2xs font-medium uppercase tracking-[0.1em] text-text-faint shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
                  Slot notes
                </div>
                {entrySummary ? (
                  <div className="rounded-full border border-[#DBE4F0] bg-white/96 px-3 py-1 text-2xs font-medium text-text-primary shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
                    {entrySummary}
                  </div>
                ) : null}
                {curatedEntryNotes.slice(0, 2).map(note => (
                  <button
                    key={`${entry.key}-${note.id}`}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      'pointer-events-auto rounded-full border px-3 py-1.5 text-left text-2xs font-medium shadow-[0_10px_20px_rgba(15,23,42,0.05)] transition-all',
                      focusedNote?.id === note.id ? 'scale-[1.02] ring-2 ring-accent/25' : '',
                      noteIntentClass(note.intent),
                    )}
                  >
                    <div>{note.anchorLabel ?? noteIntentLabel(note.intent)}</div>
                    {noteMetaLabel(note) ? (
                      <div className="mt-1 text-[0.55rem] uppercase tracking-[0.08em] text-current/80">
                        {noteMetaLabel(note)}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className={cn(
              'transition-all duration-300',
              (focusedArea === 'concentration' && entry.key === 'concentration')
                || (focusedArea === 'performance' && entry.key !== 'concentration')
                ? 'rounded-xl ring-2 ring-accent/35 shadow-[0_18px_36px_rgba(37,99,235,0.1)]'
                : '',
            )}>
              <TimeSeriesBlock block={entry.block} notePins={entry.notePins} />
            </div>
          </motion.div>
        )})}
      </motion.div>

      {/* ── Metrics & details (collapsed by default) ── */}
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 rounded-xl border border-rule bg-white px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-border-hover [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
          Metrics, stats & configuration
          <span className="ml-auto flex flex-wrap gap-2 text-xs text-muted">
            <span className="lab-chip">Gini {currentGini != null ? compactNumber(currentGini, 3) : 'N/A'}</span>
            <span className="lab-chip">{countLabel(currentRegions.length)} regions</span>
            {annotationNotes.length > 0 && <span className="lab-chip">{annotationNotes.length} note{annotationNotes.length === 1 ? '' : 's'}</span>}
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          <motion.div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
          >
            {[
              {
                key: 'slot',
                noteCount: annotationNotes.length,
                noteSummary: noteSurfaceSummaries.slot,
                focus: false,
                anchor: { kind: 'general' as const, key: 'slot', label: 'Whole slot' },
                block: { type: 'stat' as const, value: `${countLabel(slot + 1)} / ${countLabel(totalSlots)}`, label: 'Current slot', sublabel: `Playback step ${stepSize}`, delta: slotLocked ? 'Locked for notes' : playing ? 'Autoplay active' : 'Paused', sentiment: 'neutral' as const },
              },
              {
                key: 'regions',
                noteCount: metricNoteCounts.geography,
                noteSummary: noteSurfaceSummaries.geography,
                focus: focusedArea === 'geography',
                anchor: topRegion?.region
                  ? { kind: 'region' as const, key: topRegion.regionId, label: `Region · ${topRegion.region.city}` }
                  : { kind: 'general' as const, key: 'slot', label: 'Whole slot' },
                block: { type: 'stat' as const, value: countLabel(currentRegions.length), label: 'Active regions', sublabel: `${countLabel(totalValidators)} validators visible in this slot`, delta: `${currentRegions.length - initialRegions.length >= 0 ? '+' : ''}${countLabel(currentRegions.length - initialRegions.length)} vs slot 1`, sentiment: currentRegions.length <= initialRegions.length ? 'positive' as const : 'neutral' as const },
              },
              {
                key: 'dominant',
                noteCount: metricNoteCounts.geography,
                noteSummary: noteSurfaceSummaries.geography,
                focus: focusedArea === 'geography',
                anchor: topRegion?.region
                  ? { kind: 'region' as const, key: topRegion.regionId, label: `Region · ${topRegion.region.city}` }
                  : { kind: 'general' as const, key: 'slot', label: 'Whole slot' },
                block: { type: 'stat' as const, value: regionShareLabel(topRegion, totalValidators), label: 'Dominant region share', sublabel: topRegion?.region ? topRegion.region.city : 'No active region', delta: deltaLabel(dominantShare, initialDominantShare), sentiment: dominantShare >= initialDominantShare ? 'negative' as const : 'positive' as const },
              },
              {
                key: 'gini',
                noteCount: metricNoteCounts.gini,
                noteSummary: noteSurfaceSummaries.gini,
                focus: focusedArea === 'concentration',
                anchor: { kind: 'metric' as const, key: 'gini', label: 'Metric · Gini' },
                block: { type: 'stat' as const, value: currentGini != null ? compactNumber(currentGini, 3) : 'N/A', label: 'Gini', sublabel: 'Geographic concentration', delta: deltaLabel(currentGini, initialGini), sentiment: (currentGini ?? 0) <= (initialGini ?? 0) ? 'positive' as const : 'negative' as const },
              },
              {
                key: 'mev',
                noteCount: metricNoteCounts.mev,
                noteSummary: noteSurfaceSummaries.mev,
                focus: focusedArea === 'performance',
                anchor: { kind: 'metric' as const, key: 'mev', label: 'Metric · MEV' },
                block: { type: 'stat' as const, value: currentMev != null ? `${compactNumber(currentMev, 4)} ETH` : 'N/A', label: 'Average MEV', sublabel: 'Current slot reward surface', delta: deltaLabel(currentMev, initialMev), sentiment: (currentMev ?? 0) >= (initialMev ?? 0) ? 'positive' as const : 'neutral' as const },
              },
              {
                key: 'proposal',
                noteCount: metricNoteCounts.proposalTime,
                noteSummary: noteSurfaceSummaries.proposal,
                focus: focusedArea === 'performance',
                anchor: { kind: 'metric' as const, key: 'proposal_time', label: 'Metric · Proposal time' },
                block: { type: 'stat' as const, value: currentProposalTime != null ? `${compactNumber(currentProposalTime, 1)} ms` : 'N/A', label: 'Proposal time', sublabel: currentAttestation != null ? `Attestation ${percentage(currentAttestation, 1)}` : 'Consensus timing', delta: deltaLabel(currentProposalTime, initialProposalTime), sentiment: (currentProposalTime ?? Number.POSITIVE_INFINITY) <= (initialProposalTime ?? Number.POSITIVE_INFINITY) ? 'positive' as const : 'negative' as const },
              },
            ].map(card => (
              <motion.button
                key={card.key}
                type="button"
                variants={STAGGER_ITEM}
                onClick={() => dispatchPublishedReplayAnchorSelection(buildPublishedReplayAnchorSelection(anchorScope, card.anchor))}
                className={cn(
                  'relative w-full text-left transition-all duration-300',
                  card.focus ? 'rounded-xl ring-2 ring-accent/30 shadow-[0_16px_34px_rgba(37,99,235,0.08)]' : '',
                )}
              >
                {card.noteCount > 0 ? (
                  <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-[#DBE4F0] bg-white/96 px-2 py-0.5 text-2xs font-medium text-text-primary shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
                    {card.noteCount} note{card.noteCount === 1 ? '' : 's'}
                  </div>
                ) : null}
                {card.noteSummary ? (
                  <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-full border border-[#0F172A]/10 bg-white/94 px-2.5 py-1 text-2xs font-medium text-text-primary shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
                    {card.noteSummary}
                  </div>
                ) : null}
                <StatBlock block={card.block} />
              </motion.button>
            ))}
          </motion.div>

      {annotationNotes.length > 0 ? (
        <div className="px-5 pb-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="rounded-xl border border-rule bg-gradient-to-b from-white/98 to-slate-50/94 px-4 py-4 shadow-sm">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Figure discussion</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {[
                  { label: 'Open questions', value: discussionSummary.openQuestions, tone: 'text-[#9A3412]' },
                  { label: 'Challenged', value: discussionSummary.challenged, tone: 'text-[#BE123C]' },
                  { label: 'Author notes', value: discussionSummary.authorAddressed, tone: 'text-[#92400E]' },
                  { label: 'Range-based', value: discussionSummary.timeRanges, tone: 'text-[#1D4ED8]' },
                ].map(card => (
                  <div key={card.label} className="rounded-xl border border-rule bg-white px-3 py-3">
                    <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
                    <div className={cn('mt-2 text-xl font-semibold', card.tone)}>{card.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              {leadingDebate ? (
                <div className="mt-3 rounded-xl border border-rule bg-white px-3 py-3 text-xs leading-5 text-muted">
                  <span className="font-medium text-text-primary">{leadingDebate.label}</span> is pulling the most attention in this figure. {leadingDebate.summary ?? `${leadingDebate.count} notes live here.`}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-rule bg-gradient-to-b from-white/98 to-stone-50/96 px-4 py-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Figure marginalia</div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {leadingDebate
                      ? `${leadingDebate.label} is drawing the most attention. ${leadingDebate.summary ?? ''}`
                      : 'Most important live notes for this posture.'}
                  </div>
                </div>
                {focusedNote ? (
                  <div className="rounded-full border border-accent/18 bg-[rgba(37,99,235,0.08)] px-2.5 py-1 text-2xs font-medium text-accent">
                    Focus on {focusAreaLabel(focusedArea ?? 'geography')}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {marginaliaNotes.map(note => (
                  <button
                    key={`marginalia-${note.id}`}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-all',
                      focusedNote?.id === note.id
                        ? 'border-accent/24 bg-[rgba(37,99,235,0.06)] shadow-[0_12px_24px_rgba(37,99,235,0.08)]'
                        : 'border-rule bg-white hover:border-border-hover',
                      note.communityLane === 'author'
                        ? 'border-l-[3px] border-l-[#1D4ED8]'
                        : note.communityLane === 'reviewer'
                          ? 'border-l-[3px] border-l-[#9F1239]'
                          : 'border-l-[3px] border-l-[#0F766E]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#DBE4F0] bg-[#F8FAFC] px-2.5 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-text-primary">
                            {note.anchorLabel ?? 'Whole slot'}
                          </span>
                          {noteMetaLabel(note) ? (
                            <span className="text-2xs uppercase tracking-[0.08em] text-text-faint">
                              {noteMetaLabel(note)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {(note.replies?.length ?? 0) > 0 ? (
                        <div className="shrink-0 text-2xs uppercase tracking-[0.08em] text-text-faint">
                          {note.replies?.length ?? 0} repl{(note.replies?.length ?? 0) === 1 ? 'y' : 'ies'}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-text-primary">{note.note}</div>
                    {(note.annotationScope === 'time_range' || note.annotationScope === 'region_over_time') && note.rangeStartSlotNumber != null && note.rangeEndSlotNumber != null ? (
                      <div className="mt-2 text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
                        Slots {note.rangeStartSlotNumber.toLocaleString()}-{note.rangeEndSlotNumber.toLocaleString()}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Frozen configuration (inside details) ── */}
          <div className={cn(
            'rounded-xl border border-rule bg-white px-4 py-4 text-xs text-muted transition-all duration-300',
            focusedArea === 'config' ? 'ring-2 ring-accent/35 shadow-[0_18px_36px_rgba(37,99,235,0.1)]' : '',
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Frozen configuration</div>
              {metricNoteCounts.methods > 0 ? (
                <span className="rounded-full border border-[#0F766E]/18 bg-[#ECFDF5] px-2 py-0.5 text-2xs font-medium text-[#0F766E]">
                  {metricNoteCounts.methods} note{metricNoteCounts.methods === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between gap-3"><span>Validators</span><span className="font-medium tabular-nums text-text-primary">{countLabel(data?.v ?? metadata.v ?? totalValidators)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Migration cost</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.cost ?? metadata.cost ?? 0, 4)} ETH</span></div>
              <div className="flex items-center justify-between gap-3"><span>Slot time</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.delta ?? metadata.delta ?? 0, 0)} ms</span></div>
              <div className="flex items-center justify-between gap-3"><span>Cutoff</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.cutoff ?? metadata.cutoff ?? 0, 0)} ms</span></div>
              <div className="flex items-center justify-between gap-3"><span>Gamma</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.gamma ?? metadata.gamma ?? 0, 4)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Clusters now</span><span className="font-medium tabular-nums text-text-primary">{currentClusters != null ? countLabel(currentClusters) : 'N/A'}</span></div>
            </div>
          </div>

          {annotationNotes.length > 0 ? (
            <div className="rounded-xl border border-rule bg-white px-4 py-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Note filters</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { id: 'all' as const, label: 'All', count: annotationNotes.length },
                  { id: 'observation' as const, label: 'Observation', count: noteIntentCounts.observation },
                  { id: 'question' as const, label: 'Question', count: noteIntentCounts.question },
                  { id: 'theory' as const, label: 'Theory', count: noteIntentCounts.theory },
                  { id: 'methods' as const, label: 'Methods', count: noteIntentCounts.methods },
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setActiveNoteFilter(filter.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      activeNoteFilter === filter.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-rule bg-white text-text-primary hover:border-border-hover',
                    )}
                  >
                    {filter.label} · {filter.count}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </details>

    </motion.div>
  )
}
