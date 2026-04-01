import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidersHorizontal, ChevronDown, Map as MapIcon, LayoutGrid, BarChart3 } from 'lucide-react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { BlockRenderer } from '../blocks/BlockRenderer'
import { cn } from '../../lib/cn'
import {
  readPublishedEvidenceSelectionFromSearch,
  writePublishedEvidenceSelectionToHistory,
} from '../../lib/published-evidence-url'
import { SPRING, SPRING_CRISP } from '../../lib/theme'
import { GCP_REGIONS, type MacroRegion } from '../../data/gcp-regions'
import type { Block } from '../../types/blocks'
import { formatNumber, paradigmLabel } from './simulation-constants'
import { CHART_COLORS } from './simulation-evidence-constants'
import {
  totalSlotsFromPayload,
  topRegionsForSlot,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import type { ResearchCatalog, ResearchDatasetEntry } from './simulation-lab-types'
import {
  EvidenceKpiStrip,
  EvidenceCategoryBar,
  EvidenceConfigSnapshot,
  SlotMetricsGrid,
  categorizeChart,
  countByCategory,
  type PlotCategory,
  type TaggedChartBlock,
} from './EvidenceSurfacePanels'
import { EvidenceMapSurface, type MapLayout } from './EvidenceMapSurface'

// ── Catalog loader ──────────────────────────────────────────────────────────

function readResearchCatalog(): ResearchCatalog | null {
  return typeof window !== 'undefined'
    ? (window as { RESEARCH_CATALOG?: ResearchCatalog }).RESEARCH_CATALOG ?? null
    : null
}

function useResearchCatalog(catalogScriptUrl: string) {
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(readResearchCatalog)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const existing = readResearchCatalog()
    if (existing) { setCatalog(existing); setError(null); return }

    const scriptId = 'research-demo-catalog-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleLoad = () => {
      const loaded = readResearchCatalog()
      if (loaded) { setCatalog(loaded); setError(null); return }
      setError('Research catalog loaded but no datasets were exposed.')
    }
    const handleError = () => setError('Could not load the research catalog.')

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = catalogScriptUrl
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)
    return () => {
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
    }
  }, [catalogScriptUrl])

  return { catalog, error }
}

// ── Data fetcher ────────────────────────────────────────────────────────────

async function fetchPayload(
  viewerBaseUrl: string,
  datasetPath: string,
): Promise<PublishedAnalyticsPayload> {
  const base = viewerBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${base}/${datasetPath}`, { cache: 'default' })
  if (!response.ok) throw new Error(`Failed to load ${datasetPath}`)
  const text = await response.text()
  if (text.startsWith('version https://git-lfs')) {
    throw new Error(`${datasetPath} is an unresolved Git LFS pointer.`)
  }
  return JSON.parse(text) as PublishedAnalyticsPayload
}

// ── Block builders ──────────────────────────────────────────────────────────

const GCP_REGION_MAP = new Map(GCP_REGIONS.map(r => [r.id, r]))

function sampleSeries(raw: readonly number[] | undefined, maxPoints = 200): Array<{ x: number; y: number }> {
  if (!raw || raw.length === 0) return []
  const step = Math.max(1, Math.ceil(raw.length / maxPoints))
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < raw.length; i += step) points.push({ x: i + 1, y: raw[i]! })
  const lastIndex = raw.length - 1
  if (points[points.length - 1]?.x !== lastIndex + 1) points.push({ x: lastIndex + 1, y: raw[lastIndex]! })
  return points
}


function buildTimeseriesBlocks(payload: PublishedAnalyticsPayload): Block[] {
  const metrics = payload.metrics ?? {}
  const blocks: Block[] = []
  const push = (title: string, label: string, data: Array<{ x: number; y: number }>, color: string, yLabel: string) => {
    if (data.length > 0) blocks.push({ type: 'timeseries' as const, title, series: [{ label, data, color }], xLabel: 'Slot', yLabel })
  }
  push('Gini coefficient \u2014 stake inequality over time', 'Gini', sampleSeries(metrics.gini), CHART_COLORS.gini, 'Index (0 = equal, 1 = monopoly)')
  push('HHI \u2014 market concentration pressure', 'HHI', sampleSeries(metrics.hhi), CHART_COLORS.hhi, 'Index (< 0.15 = unconcentrated)')
  push('Liveness \u2014 geographic region coverage', 'Liveness', sampleSeries(metrics.liveness), CHART_COLORS.liveness, 'Active regions (%)')
  push('Total validator distance \u2014 network spread', 'Total distance', sampleSeries(metrics.total_distance), CHART_COLORS.totalDistance, 'Sum of inter-node distances')
  push('Clusters \u2014 spatial grouping density', 'Clusters', sampleSeries(metrics.clusters), CHART_COLORS.clusters, 'Distinct geographic clusters')
  push('MEV \u2014 block value captured by builders', 'MEV', sampleSeries(metrics.mev), CHART_COLORS.mev, 'ETH per block')
  push('Attestation rate \u2014 coordination health', 'Attestations', sampleSeries(metrics.attestations), CHART_COLORS.attestation, 'Successful attestations')
  push('Failed block proposals \u2014 operational friction', 'Failed proposals', sampleSeries(metrics.failed_block_proposals), CHART_COLORS.failedProposals, 'Missed proposal count')
  push('Proposal latency \u2014 pipeline responsiveness', 'Proposal time', sampleSeries(metrics.proposal_times), CHART_COLORS.proposalTime, 'Milliseconds (lower = better)')
  push('Coefficient of variation \u2014 profit disparity', 'CV', sampleSeries(metrics.profit_variance), CHART_COLORS.cv, 'Variance ratio (lower = fairer)')
  push('Average nearest-neighbor distance \u2014 local spacing', 'Avg NND', sampleSeries(metrics.avg_nnd), CHART_COLORS.avgNnd, 'Distance between nearest validators')
  push('Nearest neighbor index \u2014 spatial regularity', 'NNI', sampleSeries(metrics.nni), CHART_COLORS.nni, 'Ratio (< 1 = clustered, > 1 = dispersed)')
  push('Relay distance \u2014 source accessibility', 'Relay dist', sampleSeries(metrics.info_avg_distance), CHART_COLORS.relayDist, 'Avg distance to information sources')
  return blocks
}

const MACRO_REGION_ORDER: readonly (MacroRegion | 'Unknown')[] = [
  'Europe', 'North America', 'Asia Pacific', 'Middle East', 'South America', 'Unknown',
]

function buildSourceFootprintBlock(payload: PublishedAnalyticsPayload): Block | null {
  const sources = (payload as { sources?: readonly (readonly [string, string])[] }).sources
  if (!sources || sources.length === 0) return null
  const totals = new Map<MacroRegion | 'Unknown', number>()
  for (const source of sources) {
    const macroRegion = GCP_REGION_MAP.get(source[1])?.macroRegion ?? 'Unknown'
    totals.set(macroRegion, (totals.get(macroRegion) ?? 0) + 1)
  }
  const data = MACRO_REGION_ORDER.map(region => ({ label: region, value: totals.get(region) ?? 0 })).filter(entry => entry.value > 0)
  return data.length > 0 ? { type: 'chart' as const, title: 'Source footprint \u2014 information origin by continent', data, chartType: 'bar' as const } : null
}

function buildTopRegionsTable(payload: PublishedAnalyticsPayload): Block | null {
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const topRegions = topRegionsForSlot(payload, finalSlot, 10)
  if (topRegions.length === 0) return null
  return {
    type: 'table' as const, title: 'Top regions at final slot',
    headers: ['Rank', 'Region', 'Validators', 'Share'],
    rows: topRegions.map((region, i) => [`#${i + 1}`, region.label, region.count.toLocaleString(), `${formatNumber(region.share, 1)}%`]),
  }
}

function buildTaggedChartBlocks(payload: PublishedAnalyticsPayload): readonly TaggedChartBlock[] {
  const tagged: TaggedChartBlock[] = []
  for (const block of buildTimeseriesBlocks(payload)) {
    const title = 'title' in block ? (block.title as string) ?? '' : ''
    tagged.push({ category: categorizeChart(title), key: title, block })
  }
  const sourceBlock = buildSourceFootprintBlock(payload)
  if (sourceBlock) tagged.push({ category: 'sources', key: 'source-footprint', block: sourceBlock })
  // Map is rendered by EvidenceMapSurface — no duplicate MapBlock here
  const tableBlock = buildTopRegionsTable(payload)
  if (tableBlock) tagged.push({ category: 'topology', key: 'top-regions', block: tableBlock })
  return tagged
}

// ── Cost parsing helpers ────────────────────────────────────────────────────

const COST_RE = /^cost_(\d+(?:\.\d+)?)$/

function parseCostFromResult(result: string): number | null {
  const match = COST_RE.exec(result)
  return match ? Number(match[1]) : null
}

function formatCostLabel(cost: number): string {
  return cost === 0 ? '0' : cost.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

// ── Scenario selector with dedicated cost control ───────────────────────────

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.filter(v => { if (seen.has(v)) return false; seen.add(v); return true })
}

interface ScenarioSelectorProps {
  readonly catalog: ResearchCatalog
  readonly selectedEvaluation: string
  readonly selectedParadigm: string
  readonly selectedResult: string
  readonly onSelect: (entry: ResearchDatasetEntry) => void
}

const chipBase = 'rounded-md border px-2.5 py-0.5 text-[10px] font-medium cursor-pointer transition-all duration-150'
const chipActive = 'border-black/[0.06] bg-white text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
const chipInactive = 'border-transparent text-stone-400 hover:text-stone-600 hover:bg-stone-50'
const filterLabel = 'text-2xs font-medium uppercase tracking-wider text-text-faint shrink-0'
const filterDivider = 'hidden sm:block w-px h-5 bg-rule/60 shrink-0'

/** Compact summary pill showing active secondary filter value */
function FilterPill({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-muted">
      <span className="text-text-faint">{label}:</span>
      <span className="font-medium text-text-secondary">{value}</span>
    </span>
  )
}

function ScenarioSelector({ catalog, selectedEvaluation, selectedParadigm, selectedResult, onSelect }: ScenarioSelectorProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const evaluations = useMemo(() => uniqueOrdered(catalog.datasets.map(d => d.evaluation)), [catalog])
  const paradigms = useMemo(
    () => uniqueOrdered(catalog.datasets.filter(d => d.evaluation === selectedEvaluation).map(d => d.paradigm)),
    [catalog, selectedEvaluation],
  )

  // Split results into cost-based and non-cost variants
  const allResults = useMemo(
    () => uniqueOrdered(
      catalog.datasets
        .filter(d => d.evaluation === selectedEvaluation && d.paradigm === selectedParadigm)
        .map(d => d.result),
    ),
    [catalog, selectedEvaluation, selectedParadigm],
  )

  const { costResults, otherResults } = useMemo(() => {
    const costs: Array<{ result: string; cost: number }> = []
    const others: string[] = []
    for (const r of allResults) {
      const cost = parseCostFromResult(r)
      if (cost != null) costs.push({ result: r, cost })
      else others.push(r)
    }
    costs.sort((a, b) => a.cost - b.cost)
    return { costResults: costs, otherResults: others }
  }, [allResults])

  const hasCostDimension = costResults.length > 1
  // Cost is always visible; only paradigm/variant go into collapsible
  const hasSecondaryFilters = paradigms.length > 1 || otherResults.length > 1

  // Build summary of current secondary selections (cost excluded — always shown)
  const filterSummary = useMemo(() => {
    const parts: Array<{ label: string; value: string }> = []
    if (paradigms.length > 1) parts.push({ label: 'Source', value: selectedParadigm })
    if (otherResults.length > 1) parts.push({ label: 'Variant', value: selectedResult })
    return parts
  }, [paradigms, selectedParadigm, otherResults, selectedResult])

  const findAndSelect = useCallback((evaluation: string, paradigm: string, result?: string) => {
    const match = result
      ? catalog.datasets.find(d => d.evaluation === evaluation && d.paradigm === paradigm && d.result === result)
      : catalog.datasets.find(d => d.evaluation === evaluation && d.paradigm === paradigm)
        ?? catalog.datasets.find(d => d.evaluation === evaluation)
    if (match) onSelect(match)
  }, [catalog, onSelect])

  return (
    <div className="space-y-0">
      {/* Primary row: scenario dropdown + filter summary + customize toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Scenario selector — styled native select for clean UX */}
        <div className="relative">
          <select
            value={selectedEvaluation}
            onChange={e => findAndSelect(e.target.value, selectedParadigm)}
            className="appearance-none rounded-lg border border-black/[0.06] bg-white pl-2.5 pr-7 py-1 text-[11px] font-medium text-stone-800 cursor-pointer hover:border-stone-300 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200 transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            {evaluations.map(evaluation => (
              <option key={evaluation} value={evaluation}>{evaluation}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" />
        </div>

        {/* Cost chips — always visible when cost dimension exists */}
        {hasCostDimension && (
          <div className="flex items-center gap-1.5">
            <div className="w-px h-4 bg-rule/60" />
            <span className={filterLabel} title="ETH migration cost charged when a validator relocates between regions. Higher cost = stronger geographic lock-in.">Cost</span>
            <div className="flex gap-1">
              {costResults.map(({ result, cost }) => {
                const hint = cost === 0.002 ? 'paper' : cost === 0 ? 'none' : null
                const costTooltips: Record<string, string> = {
                  '0': 'Zero migration cost — validators can move freely between regions with no penalty',
                  '0.001': 'Low migration cost — minimal friction for geographic relocation',
                  '0.002': 'Paper baseline — the migration cost used in the published research paper',
                  '0.003': 'High migration cost — significant penalty discourages validator movement',
                }
                return (
                  <button
                    key={result}
                    onClick={() => findAndSelect(selectedEvaluation, selectedParadigm, result)}
                    title={costTooltips[formatCostLabel(cost)] ?? `Migration cost: ${formatCostLabel(cost)} ETH per relocation`}
                    className={cn(chipBase, 'tabular-nums', selectedResult === result ? chipActive : chipInactive)}
                  >
                    {formatCostLabel(cost)}{hint ? ` (${hint})` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Active filter summary pills — collapsed view */}
        {hasSecondaryFilters && !filtersOpen && filterSummary.length > 0 && (
          <div className="flex items-center gap-2.5">
            <div className="w-px h-4 bg-rule/60" />
            {filterSummary.map(({ label, value }) => (
              <FilterPill key={label} label={label} value={value} />
            ))}
          </div>
        )}

        {/* Customize toggle — only for paradigm/variant (cost is always shown) */}
        {hasSecondaryFilters && (
          <button
            onClick={() => setFiltersOpen(prev => !prev)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors',
              filtersOpen
                ? 'bg-accent/8 text-accent border border-accent/15'
                : 'text-muted hover:text-text-secondary hover:bg-surface-active',
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span className="hidden sm:inline">{filtersOpen ? 'Less' : 'Customize'}</span>
          </button>
        )}
      </div>

      {/* Secondary filters — collapsible tray */}
      <AnimatePresence>
        {filtersOpen && hasSecondaryFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2.5 flex-wrap pt-2.5">
              {/* Source paradigm */}
              {paradigms.length > 1 && (
                <>
                  <span className={filterLabel} title="Block-building paradigm: External or Local">Paradigm</span>
                  <div className="flex gap-1">
                    {paradigms.map(paradigm => (
                      <button
                        key={paradigm}
                        onClick={() => findAndSelect(selectedEvaluation, paradigm)}
                        className={cn(chipBase, selectedParadigm === paradigm ? chipActive : chipInactive)}
                      >
                        {paradigmLabel(paradigm)}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Non-cost result variants */}
              {otherResults.length > 1 && (
                <>
                  {paradigms.length > 1 && <div className={filterDivider} />}
                  <span className={filterLabel}>Variant</span>
                  <div className="flex gap-1">
                    {otherResults.map(result => (
                      <button
                        key={result}
                        onClick={() => findAndSelect(selectedEvaluation, selectedParadigm, result)}
                        className={cn(chipBase, selectedResult === result ? chipActive : chipInactive)}
                      >
                        {result}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Scroll-reveal chart block ───────────────────────────────────────────────

function ScrollRevealBlock({ block }: { block: import('../../types/blocks').Block }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '40px 0px', threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={SPRING_CRISP}
    >
      <BlockRenderer block={block} />
    </motion.div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

interface PrecomputedEvidenceSurfaceProps {
  readonly catalogScriptUrl: string
  readonly viewerBaseUrl: string
}

export function PrecomputedEvidenceSurface({ catalogScriptUrl, viewerBaseUrl }: PrecomputedEvidenceSurfaceProps) {
  const { catalog, error: catalogError } = useResearchCatalog(catalogScriptUrl)
  const [selectedEntry, setSelectedEntry] = useState<ResearchDatasetEntry | null>(null)
  const [activeCategory, setActiveCategory] = useState<PlotCategory>('all')
  const [mapLayout, setMapLayout] = useState<MapLayout>('split')
  const chartGridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!catalog || selectedEntry) return
    const requestedSelection = readPublishedEvidenceSelectionFromSearch(window.location.search)
    if (requestedSelection) {
      const requestedEntry = catalog.datasets.find(dataset => (
        dataset.evaluation === requestedSelection.evaluation
        && dataset.paradigm === requestedSelection.paradigm
        && dataset.result === requestedSelection.result
      ))
      if (requestedEntry) {
        setSelectedEntry(requestedEntry)
        return
      }
    }

    const defaultEntry = catalog.defaultSelection
      ? catalog.datasets.find(d =>
          d.evaluation === catalog.defaultSelection!.evaluation
          && d.paradigm === catalog.defaultSelection!.paradigm
          && d.result === catalog.defaultSelection!.result,
        ) ?? catalog.datasets[0]
      : catalog.datasets[0]
    if (defaultEntry) setSelectedEntry(defaultEntry)
  }, [catalog, selectedEntry])

  useEffect(() => { setActiveCategory('all') }, [selectedEntry?.path])

  useEffect(() => {
    if (!selectedEntry) return
    writePublishedEvidenceSelectionToHistory({
      evaluation: selectedEntry.evaluation,
      paradigm: selectedEntry.paradigm,
      result: selectedEntry.result,
    })
  }, [selectedEntry])

  const payloadQuery = useQuery({
    queryKey: ['evidence-payload', selectedEntry?.path],
    queryFn: () => fetchPayload(viewerBaseUrl, selectedEntry!.path),
    enabled: Boolean(selectedEntry?.path),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })

  const taggedBlocks = useMemo<readonly TaggedChartBlock[]>(
    () => payloadQuery.data ? buildTaggedChartBlocks(payloadQuery.data) : [],
    [payloadQuery.data],
  )
  const categoryCounts = useMemo(() => countByCategory(taggedBlocks), [taggedBlocks])
  const visibleBlocks = useMemo(
    () => activeCategory === 'all' ? taggedBlocks : taggedBlocks.filter(t => t.category === activeCategory),
    [taggedBlocks, activeCategory],
  )
  const totalSlots = payloadQuery.data ? totalSlotsFromPayload(payloadQuery.data) : 0

  if (catalogError) {
    return <div className="lab-stage-soft p-5 text-sm text-muted">{catalogError}</div>
  }

  if (!catalog) {
    return (
      <div className="space-y-3">
        <div className="lab-stage overflow-hidden animate-pulse">
          <div className="px-4 py-3 space-y-2">
            <div className="h-3 w-48 rounded bg-meridian/40" />
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-5 w-16 rounded-full bg-meridian/15" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Compact filter toolbar ── */}
      <motion.section
        className="lab-stage overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="px-4 py-3 space-y-2.5">
          {/* Title row with badges */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-tight text-text-primary">
              Geographical Decentralization Atlas
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <span className="lab-chip bg-white/90 text-2xs">
                {catalog.datasets.length} scenario{catalog.datasets.length !== 1 ? 's' : ''}
              </span>
              {totalSlots > 0 && (
                <span className="lab-chip bg-white/90 text-2xs tabular-nums">
                  {totalSlots.toLocaleString()} slots
                </span>
              )}
              {/* Layout mode toggle */}
              <div className="flex items-center rounded-[10px] border border-black/[0.06] bg-[#F6F5F4] p-[2px] gap-[2px]" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)' }}>
                {([
                  { mode: 'full' as MapLayout, icon: MapIcon, tip: 'Full map view' },
                  { mode: 'split' as MapLayout, icon: LayoutGrid, tip: 'Map + charts side by side' },
                  { mode: 'charts' as MapLayout, icon: BarChart3, tip: 'Charts focused' },
                ] as const).map(({ mode, icon: Icon, tip }) => (
                  <button
                    key={mode}
                    onClick={() => setMapLayout(mode)}
                    title={tip}
                    className={cn(
                      'flex items-center justify-center h-6 w-6 rounded-[8px] transition-all duration-150',
                      mapLayout === mode
                        ? 'bg-white text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                        : 'text-stone-400 hover:text-stone-600',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Inline filters */}
          {selectedEntry && (
            <ScenarioSelector
              catalog={catalog}
              selectedEvaluation={selectedEntry.evaluation}
              selectedParadigm={selectedEntry.paradigm}
              selectedResult={selectedEntry.result}
              onSelect={setSelectedEntry}
            />
          )}
        </div>
      </motion.section>

      {/* ── Loading skeleton — matches KPI → Map hero order ── */}
      {payloadQuery.isLoading && (
        <div className="mt-3 space-y-3">
          {/* KPI shimmer row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="lab-option-card px-3 py-2.5 animate-pulse">
                <div className="h-2 w-16 rounded bg-meridian/40 mb-2" />
                <div className="h-5 w-12 rounded bg-meridian/30" />
              </div>
            ))}
          </div>
          {/* Map shimmer — hero position */}
          <div className="lab-stage overflow-hidden animate-pulse">
            <div className="border-b border-rule px-5 py-3">
              <div className="h-3 w-32 rounded bg-meridian/40" />
            </div>
            <div className="aspect-[960/500] bg-gradient-to-b from-[#0E1520] to-[#0B0F14]" />
          </div>
        </div>
      )}
      {payloadQuery.isError && (
        <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {(payloadQuery.error as Error).message}
        </div>
      )}

      {/* ── Loaded surface: Filter → KPI → Map (hero) → Lens → Charts ── */}
      {payloadQuery.data && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_CRISP}>
          {/* KPI analytics strip — first thing after filters */}
          <div className="mt-2.5">
            <EvidenceKpiStrip payload={payloadQuery.data} activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
          </div>

          {/* Map hero — the primary visual */}
          {mapLayout !== 'charts' && (
            <div className="mt-3">
              <EvidenceMapSurface
                payload={payloadQuery.data}
                scenarioLabel={selectedEntry ? `${selectedEntry.evaluation}-${selectedEntry.paradigm}-${selectedEntry.result}` : undefined}
              />
            </div>
          )}

          {/* Analytical lens — directly above the charts it filters */}
          {mapLayout !== 'full' && (
            <div className="mt-3">
              <EvidenceCategoryBar
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                counts={categoryCounts}
                chartGridRef={chartGridRef}
              />
            </div>
          )}

          {/* Config snapshot + slot narrative — collapsible detail below lens */}
          {mapLayout !== 'full' && (
            <details className="mt-3 group/details">
              <summary className="lab-stage-soft px-4 py-2.5 cursor-pointer select-none flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors">
                <ChevronDown className="h-3 w-3 transition-transform duration-150 group-open/details:rotate-180" />
                Scenario details
                {selectedEntry && (
                  <span className="text-2xs text-text-faint font-normal ml-1">
                    {selectedEntry.paradigm} · {totalSlots.toLocaleString()} slots
                  </span>
                )}
              </summary>
              <div className="mt-1 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {selectedEntry && (
                  <EvidenceConfigSnapshot
                    metadata={selectedEntry.metadata}
                    description={payloadQuery.data.description}
                    paradigm={selectedEntry.paradigm}
                    totalSlots={totalSlots}
                  />
                )}
                <SlotMetricsGrid payload={payloadQuery.data} />
              </div>
            </details>
          )}

          {/* Chart panels — layout-aware grid */}
          {mapLayout !== 'full' && (
          <div ref={chartGridRef} className={mapLayout === 'charts' ? 'mt-1' : ''}>
            {taggedBlocks.length > 0 && (
              <div className="lab-stage px-5 py-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="lab-section-title">Charts</div>
                  {activeCategory !== 'all' && (
                    <span className="lab-chip bg-accent/8 text-accent text-2xs">{activeCategory}</span>
                  )}
                  <span className="text-2xs text-text-faint tabular-nums ml-auto">
                    {visibleBlocks.length} of {taggedBlocks.length}
                  </span>
                </div>
                <AnimatePresence mode="popLayout">
                  {visibleBlocks.length > 0 ? (
                    <motion.div
                      key="grid"
                      className="grid grid-cols-1 lg:grid-cols-2 gap-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={SPRING_CRISP}
                    >
                      {visibleBlocks.map(({ key, block }) => (
                        <ScrollRevealBlock key={key} block={block} />
                      ))}
                    </motion.div>
                  ) : activeCategory !== 'all' ? (
                    <motion.div
                      key="empty"
                      className="py-10 text-center"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={SPRING_CRISP}
                    >
                      <div className="text-sm text-muted">No {activeCategory} charts in this scenario.</div>
                      <button
                        onClick={() => setActiveCategory('all')}
                        className="mt-2 text-xs text-accent hover:underline"
                      >
                        Show all panels
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {/* Chart count footer */}
                <div className="mt-3 pt-2.5 border-t border-rule/50 text-center">
                  <span className="text-2xs text-text-faint">
                    {activeCategory !== 'all'
                      ? `Showing ${visibleBlocks.length} ${activeCategory} panel${visibleBlocks.length !== 1 ? 's' : ''} of ${taggedBlocks.length} total`
                      : `${taggedBlocks.length} panel${taggedBlocks.length !== 1 ? 's' : ''} total`}
                  </span>
                  {activeCategory !== 'all' && (
                    <>
                      <span className="text-2xs text-text-faint mx-1.5">\u00b7</span>
                      <button onClick={() => setActiveCategory('all')} className="text-2xs text-accent hover:underline">
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {taggedBlocks.length === 0 && (
              <div className="lab-stage-soft p-10 text-center">
                <div className="text-sm text-muted">No visualization data available for this scenario.</div>
                <div className="mt-1 text-2xs text-text-faint">Try selecting a different scenario or paradigm above.</div>
              </div>
            )}
          </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
