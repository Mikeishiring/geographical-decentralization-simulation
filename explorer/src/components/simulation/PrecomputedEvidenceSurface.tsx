import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { BlockCanvas } from '../explore/BlockCanvas'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP } from '../../lib/theme'
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

function buildStatBlocks(payload: PublishedAnalyticsPayload): Block[] {
  const totalSlots = totalSlotsFromPayload(payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const metrics = payload.metrics ?? {}

  const gini = metrics.gini?.[finalSlot]
  const hhi = metrics.hhi?.[finalSlot]
  const liveness = metrics.liveness?.[finalSlot]
  const activeRegions = activeRegionCountAtSlot(payload, finalSlot)
  const topRegion = topRegionsForSlot(payload, finalSlot, 1)[0]

  const stats: Block[] = []

  if (gini != null) {
    stats.push({
      type: 'stat' as const,
      value: formatNumber(gini, 3),
      label: 'Gini coefficient',
      sublabel: 'Concentration index (0 = equal, 1 = monopoly)',
      sentiment: gini < 0.5 ? 'positive' as const : gini < 0.7 ? 'neutral' as const : 'negative' as const,
    })
  }

  if (hhi != null) {
    stats.push({
      type: 'stat' as const,
      value: formatNumber(hhi, 4),
      label: 'HHI',
      sublabel: 'Herfindahl-Hirschman Index',
      sentiment: hhi < 0.15 ? 'positive' as const : hhi < 0.25 ? 'neutral' as const : 'negative' as const,
    })
  }

  if (liveness != null) {
    stats.push({
      type: 'stat' as const,
      value: `${formatNumber(liveness, 1)}%`,
      label: 'Liveness',
      sublabel: 'Network availability rate',
      sentiment: liveness > 95 ? 'positive' as const : liveness > 80 ? 'neutral' as const : 'negative' as const,
    })
  }

  stats.push({
    type: 'stat' as const,
    value: activeRegions.toLocaleString(),
    label: 'Active regions',
    sublabel: topRegion ? `Led by ${topRegion.label} (${formatNumber(topRegion.share, 1)}%)` : 'Geographic spread',
  })

  return stats
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
} as const

function buildTimeseriesBlocks(payload: PublishedAnalyticsPayload): Block[] {
  const metrics = payload.metrics ?? {}
  const blocks: Block[] = []

  // 1. Concentration & liveness — multi-series
  const giniData = sampleSeries(metrics.gini)
  const hhiData = sampleSeries(metrics.hhi)
  const livenessData = sampleSeries(metrics.liveness)
  if (giniData.length > 0 || hhiData.length > 0 || livenessData.length > 0) {
    const series = [
      ...(giniData.length > 0 ? [{ label: 'Gini', data: giniData, color: CHART_COLORS.gini }] : []),
      ...(hhiData.length > 0 ? [{ label: 'HHI', data: hhiData, color: CHART_COLORS.hhi }] : []),
      ...(livenessData.length > 0 ? [{ label: 'Liveness', data: livenessData, color: CHART_COLORS.liveness }] : []),
    ]
    blocks.push({
      type: 'timeseries' as const,
      title: 'Concentration and liveness',
      series,
      xLabel: 'Slot',
      yLabel: 'Index',
    })
  }

  // 2. Total validator distance
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

  // 3. Proposal time
  const proposalData = sampleSeries(metrics.proposal_times)
  if (proposalData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Proposal time',
      series: [{ label: 'Proposal time', data: proposalData, color: CHART_COLORS.proposalTime }],
      xLabel: 'Slot',
      yLabel: 'Milliseconds',
    })
  }

  // 4. Average MEV
  const mevData = sampleSeries(metrics.mev)
  if (mevData.length > 0) {
    blocks.push({
      type: 'timeseries' as const,
      title: 'Average MEV',
      series: [{ label: 'MEV', data: mevData, color: CHART_COLORS.mev }],
      xLabel: 'Slot',
      yLabel: 'ETH',
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

function buildEvidenceBlocks(payload: PublishedAnalyticsPayload): readonly Block[] {
  const blocks: Block[] = [
    ...buildStatBlocks(payload),
    ...buildTimeseriesBlocks(payload),
  ]

  const sourceBlock = buildSourceFootprintBlock(payload)
  if (sourceBlock) blocks.push(sourceBlock)

  const mapBlock = buildMapBlock(payload)
  if (mapBlock) blocks.push(mapBlock)

  const tableBlock = buildTopRegionsTable(payload)
  if (tableBlock) blocks.push(tableBlock)

  return blocks
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

  const payloadQuery = useQuery({
    queryKey: ['evidence-payload', selectedEntry?.path],
    queryFn: () => fetchPayload(viewerBaseUrl, selectedEntry!.path),
    enabled: Boolean(selectedEntry?.path),
    staleTime: 5 * 60_000,
  })

  const blocks = useMemo<readonly Block[]>(
    () => payloadQuery.data ? buildEvidenceBlocks(payloadQuery.data) : [],
    [payloadQuery.data],
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
    <motion.div
      className="rounded-2xl border border-rule bg-white/92 overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      {/* ── Scenario selector header ── */}
      <div className="border-b border-rule px-5 py-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <div className="text-xs font-semibold text-text-primary">Published evidence</div>
            <div className="mt-0.5 text-xs text-muted">
              Pre-computed results from {catalog.datasets.length} published simulation{catalog.datasets.length !== 1 ? 's' : ''}
            </div>
          </div>
          {totalSlots > 0 && (
            <span className="lab-chip bg-surface-active text-2xs shrink-0">
              {totalSlots.toLocaleString()} slots
            </span>
          )}
        </div>

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

      {/* ── Content area ── */}
      <div className="px-5 py-4">
        {payloadQuery.isLoading && (
          <div className="text-sm text-muted py-8 text-center">Loading simulation data…</div>
        )}

        {payloadQuery.isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {(payloadQuery.error as Error).message}
          </div>
        )}

        {payloadQuery.data && blocks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_CRISP}
          >
            <BlockCanvas blocks={blocks} showExport={false} />
          </motion.div>
        )}

        {payloadQuery.data && blocks.length === 0 && (
          <div className="text-sm text-muted py-8 text-center">
            No visualization data available for this scenario.
          </div>
        )}
      </div>
    </motion.div>
  )
}
