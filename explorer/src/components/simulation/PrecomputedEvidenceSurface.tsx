import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, BarChart3 } from 'lucide-react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { BlockRenderer } from '../blocks/BlockRenderer'
import { cn } from '../../lib/cn'
import { InlineTooltip } from '../ui/Tooltip'
import {
  readPublishedEvidenceSelectionFromSearch,
  writePublishedEvidenceSelectionToHistory,
} from '../../lib/published-evidence-url'
import { SPRING_CRISP } from '../../lib/theme'
import { type MacroRegion } from '../../data/gcp-regions'
import { GCP_REGION_MAP } from './evidence-map-helpers'
import type { Block } from '../../types/blocks'
import { formatNumber, paradigmLabel } from './simulation-constants'
import { CHART_COLORS } from './simulation-evidence-constants'
import {
  LIVENESS_LABEL,
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
import { EvidenceMapSurface } from './EvidenceMapSurface'
import {
  SimulationModeToggle,
  type SimulationSurfaceMode,
} from './SimulationModeToggle'

// ── Catalog loader ──────────────────────────────────────────────────────────

function readResearchCatalog(): ResearchCatalog | null {
  return typeof window !== 'undefined'
    ? (window as { RESEARCH_CATALOG?: ResearchCatalog }).RESEARCH_CATALOG ?? null
    : null
}

function useResearchCatalog(catalogScriptUrl: string) {
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(readResearchCatalog)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(catalog === null)

  useEffect(() => {
    const existing = readResearchCatalog()
    if (existing) { setCatalog(existing); setError(null); setLoading(false); return }

    setLoading(true)
    const scriptId = 'research-demo-catalog-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleLoad = () => {
      const loaded = readResearchCatalog()
      if (loaded) { setCatalog(loaded); setError(null); setLoading(false); return }
      setError('Research catalog loaded but no datasets were exposed.')
      setLoading(false)
    }
    const handleError = () => { setError('Could not load the research catalog.'); setLoading(false) }

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

  return { catalog, error, loading }
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
  push('Collapse threshold \u2014 regions required to fail the network', LIVENESS_LABEL, sampleSeries(metrics.liveness), CHART_COLORS.liveness, 'Regions')
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

const chipBase = 'rounded-[8px] border px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-all duration-150'
const chipActive = 'border-black/[0.12] bg-white text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
const chipInactive = 'border-transparent bg-transparent text-stone-500 hover:border-black/[0.06] hover:bg-white/80 hover:text-stone-700'
const filterLabel = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400 shrink-0'

function ScenarioSelector({ catalog, selectedEvaluation, selectedParadigm, selectedResult, onSelect }: ScenarioSelectorProps) {
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

  const { costResults } = useMemo(() => {
    const costs: Array<{ result: string; cost: number }> = []
    for (const r of allResults) {
      const cost = parseCostFromResult(r)
      if (cost != null) costs.push({ result: r, cost })
    }
    costs.sort((a, b) => a.cost - b.cost)
    return { costResults: costs }
  }, [allResults])

  const hasCostDimension = costResults.length > 1

  const findAndSelect = useCallback((evaluation: string, paradigm: string, result?: string) => {
    const match = result
      ? catalog.datasets.find(d => d.evaluation === evaluation && d.paradigm === paradigm && d.result === result)
      : catalog.datasets.find(d => d.evaluation === evaluation && d.paradigm === paradigm)
        ?? catalog.datasets.find(d => d.evaluation === evaluation)
    if (match) onSelect(match)
  }, [catalog, onSelect])

  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch overflow-hidden rounded-[12px] border border-black/[0.06] bg-[#FAF9F7]/96 shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.55)]">
        <div className="flex min-w-[180px] items-center gap-2.5 px-3.5 py-2.5" style={{ flex: hasCostDimension ? '1 1 0%' : '0 1 auto' }}>
          <span className={filterLabel}>Scenario</span>
          <div className="relative min-w-0" style={{ flex: hasCostDimension ? '1 1 0%' : '0 1 auto' }}>
            <select
              value={selectedEvaluation}
              onChange={e => findAndSelect(e.target.value, selectedParadigm)}
              className="w-full appearance-none rounded-[7px] border border-black/[0.08] bg-white pl-2.5 pr-7 py-1 text-[12px] font-medium text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {evaluations.map(evaluation => (
                <option key={evaluation} value={evaluation}>{evaluation}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-stone-400" />
          </div>
        </div>

        {hasCostDimension && (
          <div className="flex min-w-[280px] flex-[1.4] items-center gap-2.5 border-l border-black/[0.06] px-3.5 py-2.5">
            <InlineTooltip label="ETH cost when a validator relocates" detail="Higher cost = stronger geographic lock-in.">
              <span className={filterLabel}>Migration cost</span>
            </InlineTooltip>
            <div className="flex flex-wrap gap-1">
              {costResults.map(({ result, cost }) => {
                const hint = cost === 0.002 ? 'paper' : cost === 0 ? 'none' : null
                return (
                  <button
                    key={result}
                    type="button"
                    onClick={() => findAndSelect(selectedEvaluation, selectedParadigm, result)}
                    className={cn(chipBase, 'tabular-nums', selectedResult === result ? chipActive : chipInactive)}
                  >
                    {formatCostLabel(cost)}{hint ? ` (${hint})` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {paradigms.length > 1 && (
          <div className="flex items-center gap-2.5 border-l border-black/[0.06] px-3.5 py-2.5 ml-auto">
            <InlineTooltip label="Block-building paradigm: External (SSP) or Local (MSP)">
              <span className={filterLabel}>Paradigm</span>
            </InlineTooltip>
            <div className="flex gap-1">
              {paradigms.map(paradigm => (
                <button
                  key={paradigm}
                  type="button"
                  onClick={() => findAndSelect(selectedEvaluation, paradigm)}
                  className={cn(chipBase, selectedParadigm === paradigm ? chipActive : chipInactive)}
                >
                  {paradigmLabel(paradigm)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
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
  readonly onModeChange?: (mode: SimulationSurfaceMode) => void
}

export function PrecomputedEvidenceSurface({
  catalogScriptUrl,
  viewerBaseUrl,
  onModeChange,
}: PrecomputedEvidenceSurfaceProps) {
  const { catalog, error: catalogError } = useResearchCatalog(catalogScriptUrl)
  const [selectedEntry, setSelectedEntry] = useState<ResearchDatasetEntry | null>(null)
  const [activeCategory, setActiveCategory] = useState<PlotCategory>('all')
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
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_CRISP}
        className="rounded-2xl border border-rule bg-white p-8 sm:p-10"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-accent/[0.06] p-3">
            <BarChart3 className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Simulation Evidence Lab</h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
              Explore pre-computed simulation results across SSP and MSP paradigms. Compare Gini coefficients,
              HHI concentration, liveness thresholds, and geographic distribution metrics across scenarios.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {(['Gini coefficient', 'HHI concentration', 'Liveness threshold'] as const).map(metric => (
            <div key={metric} className="rounded-xl border border-rule/60 bg-canvas p-4">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-faint">{metric}</div>
              <div className="mt-2 h-16 rounded-lg bg-rule/20 animate-pulse" />
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <p className="text-xs text-muted">The pre-computed catalog is currently unavailable.</p>
          {onModeChange && (
            <button
              onClick={() => onModeChange('engine')}
              className="rounded-lg bg-text-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-text-primary/90"
            >
              Run your own simulation
            </button>
          )}
        </div>
      </motion.div>
    )
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
      {/* ── Unified top surface: title → controls → KPI rail → map ── */}
      <motion.section
        className="lab-stage"
        style={{ overflow: 'visible' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent dot-pulse" />
                <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">
                  Simulation Results
                </h2>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                <span>Published atlas</span>
                <span className="text-black/20">·</span>
                <span>{catalog.datasets.length} scenarios</span>
                {totalSlots > 0 && (
                  <>
                    <span className="text-black/20">·</span>
                    <span className="tabular-nums">{totalSlots.toLocaleString()} slots</span>
                  </>
                )}
                {selectedEntry && (
                  <>
                    <span className="text-black/20">·</span>
                    <span className="font-medium text-text-secondary">{selectedEntry.evaluation}</span>
                    <span className="text-black/20">·</span>
                    <span>{paradigmLabel(selectedEntry.paradigm)}</span>
                  </>
                )}
              </div>
            </div>

            <SimulationModeToggle
              value="evidence"
              onChange={next => onModeChange?.(next)}
              className="shrink-0 self-start xl:self-center"
            />
          </div>

          {selectedEntry && (
            <div className="mt-3 border-t border-rule/70 pt-3">
              <ScenarioSelector
                catalog={catalog}
                selectedEvaluation={selectedEntry.evaluation}
                selectedParadigm={selectedEntry.paradigm}
                selectedResult={selectedEntry.result}
                onSelect={setSelectedEntry}
              />
            </div>
          )}

          {(payloadQuery.isLoading || payloadQuery.isError || payloadQuery.data) && (
            <div className="mt-3 border-t border-rule/70 pt-3">
              {payloadQuery.isLoading && (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-[14px] border border-black/[0.06] bg-black/[0.05]">
                    <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-white/92 px-3 py-3 animate-pulse">
                          <div className="h-2 w-16 rounded bg-meridian/40 mb-2" />
                          <div className="h-5 w-12 rounded bg-meridian/30" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-[14px] border border-black/[0.06] bg-white animate-pulse">
                    <div className="border-b border-rule px-5 py-3">
                      <div className="h-3 w-32 rounded bg-meridian/40" />
                    </div>
                    <div className="aspect-[960/500] bg-gradient-to-b from-[#0E1520] to-[#0B0F14]" />
                  </div>
                </div>
              )}

              {payloadQuery.isError && (
                <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {(payloadQuery.error as Error).message}
                </div>
              )}

              {payloadQuery.data && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_CRISP}>
                  <EvidenceKpiStrip payload={payloadQuery.data} activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
                  <EvidenceMapSurface
                    payload={payloadQuery.data}
                    scenarioLabel={selectedEntry ? `${selectedEntry.evaluation}-${selectedEntry.paradigm}-${selectedEntry.result}` : undefined}
                    embedded
                    className="mt-3 border-t border-black/[0.06] pt-3"
                  />
                </motion.div>
              )}
            </div>
          )}
        </div>
      </motion.section>

      {/* ── Analytical lens and chart deck below the hero surface ── */}
      {payloadQuery.data && (
        <motion.div className="mt-3" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_CRISP}>
          <div className="lab-stage" style={{ overflow: 'visible' }}>
            <EvidenceCategoryBar
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              counts={categoryCounts}
              chartGridRef={chartGridRef}
              embedded
            />

            {/* Config snapshot + slot narrative — integrated into the chart section */}
            <details className="group/details border-b border-black/[0.06]">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary sm:px-5">
                <ChevronDown className="h-3 w-3 transition-transform duration-150 group-open/details:rotate-180" />
                Scenario details
                {selectedEntry && (
                  <span className="ml-1 text-2xs font-normal text-text-faint">
                    {selectedEntry.paradigm} · {totalSlots.toLocaleString()} slots
                  </span>
                )}
              </summary>
              <div className="border-t border-black/[0.06] bg-[#FCFBFA] px-4 py-3 sm:px-5">
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
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
              </div>
            </details>

            {/* Chart panels — layout-aware grid */}
            <div ref={chartGridRef} className="px-4 py-4 sm:px-5">
              {taggedBlocks.length > 0 && (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="text-[10px] font-medium text-muted">
                      {activeCategory === 'all'
                        ? 'All chart panels'
                        : `${activeCategory[0]?.toUpperCase()}${activeCategory.slice(1)} panels`}
                    </div>
                    <span className="text-black/20">·</span>
                    <span className="text-[10px] tabular-nums text-text-faint">
                      {visibleBlocks.length} of {taggedBlocks.length}
                    </span>
                    {activeCategory !== 'all' && (
                      <button
                        onClick={() => setActiveCategory('all')}
                        className="ml-auto text-[10px] font-medium text-accent hover:underline"
                      >
                        Clear lens
                      </button>
                    )}
                  </div>
                  <AnimatePresence mode="popLayout">
                    {visibleBlocks.length > 0 ? (
                      <motion.div
                        key="grid"
                        className="grid grid-cols-1 gap-3 lg:grid-cols-2"
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
                  <div className="mt-4 border-t border-rule/50 pt-2.5 text-center">
                    <span className="text-2xs text-text-faint">
                      {activeCategory !== 'all'
                        ? `Showing ${visibleBlocks.length} ${activeCategory} panel${visibleBlocks.length !== 1 ? 's' : ''} of ${taggedBlocks.length} total`
                        : `${taggedBlocks.length} panel${taggedBlocks.length !== 1 ? 's' : ''} total`}
                    </span>
                  </div>
                </>
              )}

              {taggedBlocks.length === 0 && (
                <div className="py-10 text-center">
                  <div className="text-sm text-muted">No visualization data available for this scenario.</div>
                  <div className="mt-1 text-2xs text-text-faint">Try selecting a different scenario or paradigm above.</div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
