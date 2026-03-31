import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { BlockRenderer } from '../blocks/BlockRenderer'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { GCP_REGIONS, type MacroRegion } from '../../data/gcp-regions'
import type { Block } from '../../types/blocks'
import { formatNumber } from './simulation-constants'
import {
  totalSlotsFromPayload,
  topRegionsForSlot,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import type { ResearchCatalog, ResearchDatasetEntry } from './simulation-lab-types'
import {
  EvidenceKpiStrip,
  EvidenceConfigSnapshot,
  PlotFilterToolbar,
  SlotMetricsGrid,
  categorizeChart,
  countByCategory,
  type PlotCategory,
  type TaggedChartBlock,
} from './EvidenceSurfacePanels'
import { EvidenceMapSurface } from './EvidenceMapSurface'

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

function buildMapBlock(payload: PublishedAnalyticsPayload): Block | null {
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const rawRegions = payload.slots?.[String(finalSlot)] ?? []
  if (rawRegions.length === 0) return null

  const regions = rawRegions
    .filter(([, count]) => Number(count) > 0)
    .map(([regionId, count]) => {
      const gcpRegion = GCP_REGION_MAP.get(regionId)
      return gcpRegion
        ? { name: gcpRegion.city, lat: gcpRegion.lat, lon: gcpRegion.lon, value: Number(count), label: `${gcpRegion.city}: ${Number(count).toLocaleString()} validators` }
        : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return { type: 'map' as const, title: `Validator distribution at slot ${(finalSlot + 1).toLocaleString()}`, regions, colorScale: 'density' as const, unit: 'validators' }
}

function sampleSeries(raw: readonly number[] | undefined, maxPoints = 200): Array<{ x: number; y: number }> {
  if (!raw || raw.length === 0) return []
  const step = Math.max(1, Math.ceil(raw.length / maxPoints))
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < raw.length; i += step) points.push({ x: i + 1, y: raw[i]! })
  const lastIndex = raw.length - 1
  if (points[points.length - 1]?.x !== lastIndex + 1) points.push({ x: lastIndex + 1, y: raw[lastIndex]! })
  return points
}

const CHART_COLORS = {
  gini: '#C2553A', hhi: '#2563EB', liveness: '#16A34A', totalDistance: '#C2553A',
  proposalTime: '#D97706', mev: '#2563EB', attestation: '#0F766E',
  failedProposals: '#BE123C', clusters: '#7C3AED',
} as const

function buildTimeseriesBlocks(payload: PublishedAnalyticsPayload): Block[] {
  const metrics = payload.metrics ?? {}
  const blocks: Block[] = []
  const push = (title: string, label: string, data: Array<{ x: number; y: number }>, color: string, yLabel: string) => {
    if (data.length > 0) blocks.push({ type: 'timeseries' as const, title, series: [{ label, data, color }], xLabel: 'Slot', yLabel })
  }
  push('Gini coefficient', 'Gini', sampleSeries(metrics.gini), CHART_COLORS.gini, 'Index')
  push('HHI \u2014 concentration pressure', 'HHI', sampleSeries(metrics.hhi), CHART_COLORS.hhi, 'Index')
  push('Liveness \u2014 region representation', 'Liveness', sampleSeries(metrics.liveness), CHART_COLORS.liveness, 'Percent')
  push('Total validator distance', 'Total distance', sampleSeries(metrics.total_distance), CHART_COLORS.totalDistance, 'Distance')
  push('Clusters \u2014 spatial groupings', 'Clusters', sampleSeries(metrics.clusters), CHART_COLORS.clusters, 'Count')
  push('MEV earned \u2014 block value', 'MEV', sampleSeries(metrics.mev), CHART_COLORS.mev, 'ETH')
  push('Attestation rate', 'Attestations', sampleSeries(metrics.attestations), CHART_COLORS.attestation, 'Count')
  push('Failed block proposals \u2014 operational friction', 'Failed proposals', sampleSeries(metrics.failed_block_proposals), CHART_COLORS.failedProposals, 'Count')
  push('Proposal time \u2014 latency', 'Proposal time', sampleSeries(metrics.proposal_times), CHART_COLORS.proposalTime, 'Milliseconds')
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
  return data.length > 0 ? { type: 'chart' as const, title: 'Source footprint', data, chartType: 'bar' as const } : null
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
  if (sourceBlock) tagged.push({ category: 'geography', key: 'source-footprint', block: sourceBlock })
  // Map is rendered by EvidenceMapSurface — no duplicate MapBlock here
  const tableBlock = buildTopRegionsTable(payload)
  if (tableBlock) tagged.push({ category: 'geography', key: 'top-regions', block: tableBlock })
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

const chipBase = 'lab-option-card rounded-full px-3 py-1 text-xs font-medium'
const chipActive = 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
const chipInactive = 'text-muted'

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

  const selectedCost = parseCostFromResult(selectedResult)
  const hasCostDimension = costResults.length > 1

  const findAndSelect = (evaluation: string, paradigm: string, result?: string) => {
    const match = result
      ? catalog.datasets.find(d => d.evaluation === evaluation && d.paradigm === paradigm && d.result === result)
      : catalog.datasets.find(d => d.evaluation === evaluation && d.paradigm === paradigm)
        ?? catalog.datasets.find(d => d.evaluation === evaluation)
    if (match) onSelect(match)
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {/* Scenario (always full-width) */}
      <div className="sm:col-span-2">
        <label className="text-xs text-muted mb-1.5 block">Scenario</label>
        <div className="flex flex-wrap gap-1.5">
          {evaluations.map(evaluation => (
            <button
              key={evaluation}
              onClick={() => findAndSelect(evaluation, selectedParadigm)}
              className={cn(chipBase, selectedEvaluation === evaluation ? chipActive : chipInactive)}
            >
              {evaluation}
            </button>
          ))}
        </div>
      </div>

      {/* Source paradigm */}
      {paradigms.length > 1 && (
        <div>
          <label className="text-xs text-muted mb-1.5 block">Source paradigm</label>
          <div className="flex flex-wrap gap-1.5">
            {paradigms.map(paradigm => (
              <button
                key={paradigm}
                onClick={() => findAndSelect(selectedEvaluation, paradigm)}
                className={cn(chipBase, selectedParadigm === paradigm ? chipActive : chipInactive)}
              >
                {paradigm}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Migration cost — dedicated control when cost variants exist */}
      {hasCostDimension && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted">Migration cost</label>
            {selectedCost != null && (
              <span className="text-11 text-text-faint tabular-nums">{selectedCost.toFixed(4)} ETH</span>
            )}
          </div>
          <div className={cn('grid gap-1.5', costResults.length <= 5 ? `grid-cols-${costResults.length}` : 'grid-cols-3 sm:grid-cols-5')}>
            {costResults.map(({ result, cost }) => (
              <button
                key={result}
                onClick={() => findAndSelect(selectedEvaluation, selectedParadigm, result)}
                className={cn(
                  'lab-option-card rounded-xl px-2.5 py-1.5 text-center transition-all hover:border-border-hover',
                  selectedResult === result
                    ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                    : 'text-muted',
                )}
              >
                <div className="text-xs font-medium tabular-nums">{formatCostLabel(cost)}</div>
                {cost === 0.002 && <div className="mt-0.5 text-2xs font-medium uppercase tracking-[0.1em] opacity-75">paper</div>}
                {cost === 0 && <div className="mt-0.5 text-2xs font-medium uppercase tracking-[0.1em] opacity-75">none</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-cost result variants */}
      {otherResults.length > 1 && (
        <div className={hasCostDimension ? '' : 'sm:col-span-2'}>
          <label className="text-xs text-muted mb-1.5 block">Result variant</label>
          <div className="flex flex-wrap gap-1.5">
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
        </div>
      )}
    </div>
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

  useEffect(() => {
    if (!catalog || selectedEntry) return
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

  const payloadQuery = useQuery({
    queryKey: ['evidence-payload', selectedEntry?.path],
    queryFn: () => fetchPayload(viewerBaseUrl, selectedEntry!.path),
    enabled: Boolean(selectedEntry?.path),
    staleTime: 5 * 60_000,
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
      <motion.div className="lab-stage-soft p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SPRING}>
        <div className="text-sm text-muted">Loading research catalog\u2026</div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Header + controls ── */}
      <motion.section
        className="lab-stage overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-text-primary">
                Geographical Decentralization Atlas
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted max-w-xl">
                Explore published simulation outputs as a living research surface.
                Adjust scenario, paradigm, and migration cost to compare outcomes.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="lab-chip bg-white/90 text-2xs">
                {catalog.datasets.length} scenario{catalog.datasets.length !== 1 ? 's' : ''}
              </span>
              {totalSlots > 0 && (
                <span className="lab-chip bg-white/90 text-2xs tabular-nums">
                  {totalSlots.toLocaleString()} slots
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-rule/70 px-5 py-4">
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

      {/* ── Loading / error ── */}
      {payloadQuery.isLoading && (
        <div className="lab-stage-soft p-8 text-sm text-muted text-center">Loading simulation data\u2026</div>
      )}
      {payloadQuery.isError && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {(payloadQuery.error as Error).message}
        </div>
      )}

      {/* ── Loaded surface ── */}
      {payloadQuery.data && (
        <motion.div className="space-y-3" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_CRISP}>
          {/* KPI analytics strip */}
          <EvidenceKpiStrip payload={payloadQuery.data} />

          {/* Config snapshot + how to read + slot narrative — side by side on desktop */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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

          {/* Interactive map with latency, playback, and overlays */}
          <EvidenceMapSurface payload={payloadQuery.data} />

          {/* Plot filter toolbar + chart panels */}
          {taggedBlocks.length > 0 && (
            <div className="lab-stage px-5 py-4">
              <PlotFilterToolbar activeCategory={activeCategory} onCategoryChange={setActiveCategory} counts={categoryCounts} />
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {visibleBlocks.map(({ key, block }) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={SPRING_CRISP}
                    >
                      <BlockRenderer block={block} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {taggedBlocks.length === 0 && (
            <div className="lab-stage-soft p-8 text-sm text-muted text-center">
              No visualization data available for this scenario.
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
