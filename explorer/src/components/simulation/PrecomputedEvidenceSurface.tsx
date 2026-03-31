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
  activeRegionCountAtSlot,
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

// ── Catalog loader ──────────────────────────────────────────────────────────

function readResearchCatalog(): ResearchCatalog | null {
  return typeof window !== 'undefined' ? (window as { RESEARCH_CATALOG?: ResearchCatalog }).RESEARCH_CATALOG ?? null : null
}

function useResearchCatalog(catalogScriptUrl: string) {
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(readResearchCatalog)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const existing = readResearchCatalog()
    if (existing) {
      setCatalog(existing)
      setError(null)
      return
    }

    const scriptId = 'research-demo-catalog-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleLoad = () => {
      const loaded = readResearchCatalog()
      if (loaded) {
        setCatalog(loaded)
        setError(null)
        return
      }
      setError('Research catalog loaded but no datasets were exposed.')
    }

    const handleError = () => {
      setError('Could not load the research catalog.')
    }

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
        ? {
            name: gcpRegion.city,
            lat: gcpRegion.lat,
            lon: gcpRegion.lon,
            value: Number(count),
            label: `${gcpRegion.city}: ${Number(count).toLocaleString()} validators`,
          }
        : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return {
    type: 'map' as const,
    title: `Validator distribution at slot ${(finalSlot + 1).toLocaleString()}`,
    regions,
    colorScale: 'density' as const,
    unit: 'validators',
  }
}

function sampleSeries(raw: readonly number[] | undefined, maxPoints = 200): Array<{ x: number; y: number }> {
  if (!raw || raw.length === 0) return []
  const step = Math.max(1, Math.ceil(raw.length / maxPoints))
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < raw.length; i += step) {
    points.push({ x: i + 1, y: raw[i]! })
  }
  const lastIndex = raw.length - 1
  if (points[points.length - 1]?.x !== lastIndex + 1) {
    points.push({ x: lastIndex + 1, y: raw[lastIndex]! })
  }
  return points
}

const CHART_COLORS = {
  gini: '#C2553A',
  hhi: '#2563EB',
  liveness: '#16A34A',
  totalDistance: '#C2553A',
  proposalTime: '#D97706',
  mev: '#2563EB',
  attestation: '#0F766E',
  failedProposals: '#BE123C',
  clusters: '#7C3AED',
} as const

function buildTimeseriesBlocks(payload: PublishedAnalyticsPayload): Block[] {
  const metrics = payload.metrics ?? {}
  const blocks: Block[] = []

  // 1. Gini coefficient (individual)
  const giniData = sampleSeries(metrics.gini)
  if (giniData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Gini coefficient',
      series: [{ label: 'Gini', data: giniData, color: CHART_COLORS.gini }],
      xLabel: 'Slot',
      yLabel: 'Index',
    })
  }

  // 2. HHI (individual)
  const hhiData = sampleSeries(metrics.hhi)
  if (hhiData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'HHI — concentration pressure',
      series: [{ label: 'HHI', data: hhiData, color: CHART_COLORS.hhi }],
      xLabel: 'Slot',
      yLabel: 'Index',
    })
  }

  // 3. Liveness
  const livenessData = sampleSeries(metrics.liveness)
  if (livenessData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Liveness — region representation',
      series: [{ label: 'Liveness', data: livenessData, color: CHART_COLORS.liveness }],
      xLabel: 'Slot',
      yLabel: 'Percent',
    })
  }

  // 4. Total validator distance
  const distanceData = sampleSeries(metrics.total_distance)
  if (distanceData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Total validator distance',
      series: [{ label: 'Total distance', data: distanceData, color: CHART_COLORS.totalDistance }],
      xLabel: 'Slot',
      yLabel: 'Distance',
    })
  }

  // 5. Clusters
  const clusterData = sampleSeries(metrics.clusters)
  if (clusterData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Clusters — spatial groupings',
      series: [{ label: 'Clusters', data: clusterData, color: CHART_COLORS.clusters }],
      xLabel: 'Slot',
      yLabel: 'Count',
    })
  }

  // 6. MEV earned
  const mevData = sampleSeries(metrics.mev)
  if (mevData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'MEV earned — block value',
      series: [{ label: 'MEV', data: mevData, color: CHART_COLORS.mev }],
      xLabel: 'Slot',
      yLabel: 'ETH',
    })
  }

  // 7. Attestation rate
  const attestData = sampleSeries(metrics.attestations)
  if (attestData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Attestation rate',
      series: [{ label: 'Attestations', data: attestData, color: CHART_COLORS.attestation }],
      xLabel: 'Slot',
      yLabel: 'Count',
    })
  }

  // 8. Failed block proposals
  const failedData = sampleSeries(metrics.failed_block_proposals)
  if (failedData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Failed block proposals — operational friction',
      series: [{ label: 'Failed proposals', data: failedData, color: CHART_COLORS.failedProposals }],
      xLabel: 'Slot',
      yLabel: 'Count',
    })
  }

  // 9. Proposal time
  const proposalData = sampleSeries(metrics.proposal_times)
  if (proposalData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Proposal time — latency',
      series: [{ label: 'Proposal time', data: proposalData, color: CHART_COLORS.proposalTime }],
      xLabel: 'Slot',
      yLabel: 'Milliseconds',
    })
  }

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
    const regionId = source[1]
    const macroRegion = GCP_REGION_MAP.get(regionId)?.macroRegion ?? 'Unknown'
    totals.set(macroRegion, (totals.get(macroRegion) ?? 0) + 1)
  }

  const data = MACRO_REGION_ORDER
    .map(region => ({ label: region, value: totals.get(region) ?? 0 }))
    .filter(entry => entry.value > 0)

  if (data.length === 0) return null

  return {
    type: 'chart' as const,
    title: 'Source footprint',
    data,
    chartType: 'bar' as const,
  }
}

function buildTopRegionsTable(payload: PublishedAnalyticsPayload): Block | null {
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const topRegions = topRegionsForSlot(payload, finalSlot, 10)
  if (topRegions.length === 0) return null

  return {
    type: 'table' as const,
    title: 'Top regions at final slot',
    headers: ['Rank', 'Region', 'Validators', 'Share'],
    rows: topRegions.map((region, i) => [
      `#${i + 1}`,
      region.label,
      region.count.toLocaleString(),
      `${formatNumber(region.share, 1)}%`,
    ]),
  }
}

// ── Build all chart blocks with category tags ───────────────────────────────

function buildTaggedChartBlocks(payload: PublishedAnalyticsPayload): readonly TaggedChartBlock[] {
  const tagged: TaggedChartBlock[] = []

  for (const block of buildTimeseriesBlocks(payload)) {
    tagged.push({ category: categorizeChart(block.title ?? ''), key: block.title ?? '', block })
  }

  const sourceBlock = buildSourceFootprintBlock(payload)
  if (sourceBlock) {
    tagged.push({ category: 'geography', key: 'source-footprint', block: sourceBlock })
  }

  const mapBlock = buildMapBlock(payload)
  if (mapBlock) {
    tagged.push({ category: 'geography', key: 'map', block: mapBlock })
  }

  const tableBlock = buildTopRegionsTable(payload)
  if (tableBlock) {
    tagged.push({ category: 'geography', key: 'top-regions', block: tableBlock })
  }

  return tagged
}

// ── Scenario chip selector ──────────────────────────────────────────────────

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.filter(v => {
    if (seen.has(v)) return false
    seen.add(v)
    return true
  })
}

interface ScenarioSelectorProps {
  readonly catalog: ResearchCatalog
  readonly selectedEvaluation: string
  readonly selectedParadigm: string
  readonly selectedResult: string
  readonly onSelect: (entry: ResearchDatasetEntry) => void
}

function ScenarioSelector({
  catalog,
  selectedEvaluation,
  selectedParadigm,
  selectedResult,
  onSelect,
}: ScenarioSelectorProps) {
  const evaluations = useMemo(() => uniqueOrdered(catalog.datasets.map(d => d.evaluation)), [catalog])
  const paradigms = useMemo(
    () => uniqueOrdered(catalog.datasets.filter(d => d.evaluation === selectedEvaluation).map(d => d.paradigm)),
    [catalog, selectedEvaluation],
  )
  const results = useMemo(
    () => uniqueOrdered(
      catalog.datasets
        .filter(d => d.evaluation === selectedEvaluation && d.paradigm === selectedParadigm)
        .map(d => d.result),
    ),
    [catalog, selectedEvaluation, selectedParadigm],
  )

  const selectEvaluation = (evaluation: string) => {
    const match = catalog.datasets.find(d => d.evaluation === evaluation) ?? catalog.datasets[0]
    if (match) onSelect(match)
  }

  const selectParadigm = (paradigm: string) => {
    const match = catalog.datasets.find(
      d => d.evaluation === selectedEvaluation && d.paradigm === paradigm,
    ) ?? catalog.datasets[0]
    if (match) onSelect(match)
  }

  const selectResult = (result: string) => {
    const match = catalog.datasets.find(
      d => d.evaluation === selectedEvaluation && d.paradigm === selectedParadigm && d.result === result,
    )
    if (match) onSelect(match)
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-2xs uppercase tracking-[0.1em] text-text-faint mb-1.5">Scenario</div>
        <div className="flex flex-wrap gap-1.5">
          {evaluations.map(evaluation => (
            <button
              key={evaluation}
              onClick={() => selectEvaluation(evaluation)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedEvaluation === evaluation
                  ? 'border-accent bg-white text-accent'
                  : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
              )}
            >
              {evaluation}
            </button>
          ))}
        </div>
      </div>

      {paradigms.length > 1 && (
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] text-text-faint mb-1.5">Source paradigm</div>
          <div className="flex flex-wrap gap-1.5">
            {paradigms.map(paradigm => (
              <button
                key={paradigm}
                onClick={() => selectParadigm(paradigm)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedParadigm === paradigm
                    ? 'border-accent bg-white text-accent'
                    : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
              >
                {paradigm}
              </button>
            ))}
          </div>
        </div>
      )}

      {results.length > 1 && (
        <div>
          <div className="text-2xs uppercase tracking-[0.1em] text-text-faint mb-1.5">Result variant</div>
          <div className="flex flex-wrap gap-1.5">
            {results.map(result => (
              <button
                key={result}
                onClick={() => selectResult(result)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedResult === result
                    ? 'border-accent bg-white text-accent'
                    : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
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

export function PrecomputedEvidenceSurface({
  catalogScriptUrl,
  viewerBaseUrl,
}: PrecomputedEvidenceSurfaceProps) {
  const { catalog, error: catalogError } = useResearchCatalog(catalogScriptUrl)
  const [selectedEntry, setSelectedEntry] = useState<ResearchDatasetEntry | null>(null)
  const [activeCategory, setActiveCategory] = useState<PlotCategory>('all')

  useEffect(() => {
    if (!catalog || selectedEntry) return
    const defaultEntry = catalog.defaultSelection
      ? catalog.datasets.find(
          d => d.evaluation === catalog.defaultSelection!.evaluation
            && d.paradigm === catalog.defaultSelection!.paradigm
            && d.result === catalog.defaultSelection!.result,
        ) ?? catalog.datasets[0]
      : catalog.datasets[0]
    if (defaultEntry) setSelectedEntry(defaultEntry)
  }, [catalog, selectedEntry])

  // Reset filter when scenario changes
  useEffect(() => {
    setActiveCategory('all')
  }, [selectedEntry?.path])

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
    () => activeCategory === 'all'
      ? taggedBlocks
      : taggedBlocks.filter(t => t.category === activeCategory),
    [taggedBlocks, activeCategory],
  )

  const totalSlots = payloadQuery.data ? totalSlotsFromPayload(payloadQuery.data) : 0

  if (catalogError) {
    return (
      <div className="rounded-2xl border border-rule bg-white/92 p-5 text-sm text-muted">
        {catalogError}
      </div>
    )
  }

  if (!catalog) {
    return (
      <motion.div
        className="rounded-2xl border border-rule bg-white/92 p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={SPRING}
      >
        <div className="text-sm text-muted">Loading research catalog…</div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header: title + scenario selector ── */}
      <motion.div
        className="rounded-2xl border border-rule bg-white/92 overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="px-5 py-4">
          <div className="mb-1">
            <h2 className="text-base font-semibold tracking-tight text-text-primary">
              Geographical Decentralization Atlas
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted max-w-2xl">
              Explore the published simulation outputs as a living research surface.
              Synchronized metrics, timelines, and geographic views read as a continuous
              narrative rather than disconnected charts.
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-xs text-muted">
              {catalog.datasets.length} published scenario{catalog.datasets.length !== 1 ? 's' : ''}
            </div>
            {totalSlots > 0 && (
              <span className="lab-chip bg-surface-active text-2xs shrink-0">
                {totalSlots.toLocaleString()} slots
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-rule px-5 py-3">
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
      </motion.div>

      {/* ── Loading / error states ── */}
      {payloadQuery.isLoading && (
        <div className="rounded-2xl border border-rule bg-white/92 p-8 text-sm text-muted text-center">
          Loading simulation data…
        </div>
      )}

      {payloadQuery.isError && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {(payloadQuery.error as Error).message}
        </div>
      )}

      {/* ── Loaded content ── */}
      {payloadQuery.data && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_CRISP}
        >
          {/* KPI analytics strip */}
          <EvidenceKpiStrip payload={payloadQuery.data} />

          {/* Config snapshot + how to read */}
          {selectedEntry && (
            <EvidenceConfigSnapshot
              metadata={selectedEntry.metadata}
              description={payloadQuery.data.description}
              paradigm={selectedEntry.paradigm}
              totalSlots={totalSlots}
            />
          )}

          {/* Slot narrative — metrics grid */}
          <SlotMetricsGrid payload={payloadQuery.data} />

          {/* Plot filter toolbar + charts */}
          {taggedBlocks.length > 0 && (
            <div className="rounded-2xl border border-rule bg-white/92 px-5 py-4">
              <PlotFilterToolbar
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                counts={categoryCounts}
              />

              <motion.div
                initial="hidden"
                animate="visible"
                variants={STAGGER_CONTAINER}
                className="space-y-3"
              >
                <AnimatePresence mode="popLayout">
                  {visibleBlocks.map(({ key, block }) => (
                    <motion.div
                      key={key}
                      variants={STAGGER_ITEM}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={SPRING_CRISP}
                    >
                      <BlockRenderer block={block} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}

          {taggedBlocks.length === 0 && (
            <div className="rounded-2xl border border-rule bg-white/92 p-8 text-sm text-muted text-center">
              No visualization data available for this scenario.
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
