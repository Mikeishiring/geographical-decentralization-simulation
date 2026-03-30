import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, LoaderCircle, Pause, Play, RotateCcw, X } from 'lucide-react'
import { ChartBlock } from '../blocks/ChartBlock'
import { InsightBlock } from '../blocks/InsightBlock'
import { StatBlock } from '../blocks/StatBlock'
import { TimeSeriesBlock } from '../blocks/TimeSeriesBlock'
import { formatNumber } from './simulation-constants'
import { CONTINENT_OUTLINES } from '../../data/world-outlines'
import { GCP_REGIONS, type GcpRegion, type MacroRegion } from '../../data/gcp-regions'
import { cn } from '../../lib/cn'

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

interface PublishedDatasetViewerProps {
  readonly viewerBaseUrl: string
  readonly dataset: ResearchDatasetEntry
  readonly initialSettings: PublishedViewerSettings
  readonly onClose?: () => void
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

function themeLabel(theme: PublishedViewerSettings['theme']): string {
  if (theme === 'auto') return 'Auto'
  if (theme === 'dark') return 'Dark'
  return 'Light'
}

function PublishedGeoCard({
  title,
  regions,
}: {
  title: string
  regions: readonly RegionCount[]
}) {
  const sortedRegions = [...regions].sort((left, right) => right.count - left.count)
  const topRegions = sortedRegions.slice(0, 6)
  const macroRegionCounts = aggregateMacroRegions(regions)
  const totalValidators = sortedRegions.reduce((sum, region) => sum + region.count, 0)
  const maxValue = Math.max(...sortedRegions.map(region => region.count), 1)

  const svgWidth = 820
  const svgHeight = 430
  const continentShapePaths = useMemo(() => continentPaths(svgWidth, svgHeight), [])

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-white">
      <div className="border-b border-border-subtle px-5 py-4">
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
        <div className="overflow-hidden rounded-2xl border border-[#1F2937] bg-[#0D1117]">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
          >
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#0D1117" />

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
                  <g key={region.regionId}>
                    <circle
                      cx={x}
                      cy={y}
                      r={radius * 1.8}
                      fill={fill}
                      opacity={0.1}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      fill={fill}
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth={1}
                    >
                      <title>{`${geoRegion.city} (${region.regionId}) · ${countLabel(region.count)} validators · ${percentage(share, 1)}`}</title>
                    </circle>
                  </g>
                )
              })}
          </svg>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] p-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Top regions</div>
            <div className="mt-3 space-y-2.5">
              {topRegions.map(region => {
                const regionLabel = region.region ? region.region.city : region.regionId
                const fill = regionValueColor(region.count, maxValue)
                const share = totalValidators > 0 ? (region.count / totalValidators) * 100 : 0
                return (
                  <div key={region.regionId}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-text-primary">{regionLabel}</div>
                        <div className="truncate text-[11px] text-muted">{region.regionId}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-medium tabular-nums text-text-primary">{countLabel(region.count)}</div>
                        <div className="text-[11px] text-muted">{percentage(share, 1)}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-active">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, backgroundColor: fill }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-white p-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Macro regions</div>
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
                        style={{ width: `${share}%` }}
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
  onClose,
}: PublishedDatasetViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>({
    status: 'loading',
    data: null,
    error: null,
  })
  const [slot, setSlot] = useState(0)
  const [playing, setPlaying] = useState(initialSettings.autoplay)
  const [stepSize, setStepSize] = useState<1 | 10 | 50>(initialSettings.step)

  useEffect(() => {
    const controller = new AbortController()
    const normalizedBase = viewerBaseUrl.replace(/\/$/, '')

    setViewerState({
      status: 'loading',
      data: null,
      error: null,
    })
    setSlot(0)
    setPlaying(initialSettings.autoplay)
    setStepSize(initialSettings.step)

    const load = async () => {
      try {
        const response = await fetch(`${normalizedBase}/${dataset.path}`, {
          cache: 'force-cache',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Failed to load ${dataset.path}`)

        const payload = await response.json() as PublishedDatasetPayload
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

    return () => controller.abort()
  }, [dataset, initialSettings.autoplay, initialSettings.step, viewerBaseUrl])

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
    if (!playing) return
    const intervalId = window.setInterval(() => {
      setSlot(previous => Math.min(previous + stepSize, lastSlot))
    }, 240)
    return () => window.clearInterval(intervalId)
  }, [lastSlot, playing, stepSize])

  useEffect(() => {
    if (slot >= lastSlot) setPlaying(false)
  }, [lastSlot, slot])

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
  const currentMev = readMetricValue(metrics.mev, slot)
  const currentProposalTime = readMetricValue(metrics.proposal_times, slot)
  const currentAttestation = readMetricValue(metrics.attestations, slot)
  const currentClusters = readMetricValue(metrics.clusters, slot)
  const currentTotalDistance = readMetricValue(metrics.total_distance, slot)
  const initialGini = readMetricValue(metrics.gini, 0)
  const initialMev = readMetricValue(metrics.mev, 0)
  const initialProposalTime = readMetricValue(metrics.proposal_times, 0)
  const initialTotalDistance = readMetricValue(metrics.total_distance, 0)

  const metadata = dataset.metadata ?? {}
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
    <div className="space-y-6">
      <div className="lab-stage overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-text-primary">
                In-app published viewer
              </div>
              <h3 className="mt-3 text-xl font-semibold text-text-primary">
                {dataset.evaluation} · {dataset.paradigm} · {dataset.result}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                <span className="lab-chip">{sourceRoleLabel(dataset.sourceRole)}</span>
                <span className="lab-chip">{countLabel(totalSlots)} slots</span>
                <span className="lab-chip">standalone theme {themeLabel(initialSettings.theme)}</span>
                <span className="lab-chip">dataset {dataset.path}</span>
              </div>
              <p className="mt-3 max-w-3xl text-sm text-muted">
                {data?.description ?? metadata.description ?? 'Frozen published dataset.'}
              </p>
            </div>

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
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-white px-3 py-2 text-xs text-text-primary hover:border-border-hover transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open standalone viewer
              </button>
              {onClose ? (
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-white px-3 py-2 text-xs text-text-primary hover:border-border-hover transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Hide viewer
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="lab-lens-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Playback</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{playing ? 'Autoplay active' : 'Manual review'}</div>
              <div className="mt-1 text-xs text-muted">Step {stepSize} · slot {countLabel(slot + 1)} of {countLabel(totalSlots)}</div>
            </div>
            <div className="lab-lens-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Top region</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{topRegion?.region?.city ?? 'No active region'}</div>
              <div className="mt-1 text-xs text-muted">{regionShareLabel(topRegion, totalValidators)} of visible validators</div>
            </div>
            <div className="lab-lens-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Source footprint</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{sourceRoleLabel(dataset.sourceRole)}</div>
              <div className="mt-1 text-xs text-muted">{sourceFootprint.length} macro regions represented</div>
            </div>
            <div className="lab-lens-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Truth boundary</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Frozen published payload</div>
              <div className="mt-1 text-xs text-muted">Viewer controls change playback only. They do not alter the dataset.</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatBlock block={{ type: 'stat', value: `${countLabel(slot + 1)} / ${countLabel(totalSlots)}`, label: 'Current slot', sublabel: `Playback step ${stepSize}`, delta: playing ? 'Autoplay active' : 'Paused', sentiment: 'neutral' }} />
            <StatBlock block={{ type: 'stat', value: countLabel(currentRegions.length), label: 'Active regions', sublabel: `${countLabel(totalValidators)} validators visible in this slot`, delta: `${currentRegions.length - initialRegions.length >= 0 ? '+' : ''}${countLabel(currentRegions.length - initialRegions.length)} vs slot 1`, sentiment: currentRegions.length <= initialRegions.length ? 'positive' : 'neutral' }} />
            <StatBlock block={{ type: 'stat', value: regionShareLabel(topRegion, totalValidators), label: 'Dominant region share', sublabel: topRegion?.region ? topRegion.region.city : 'No active region', delta: deltaLabel(dominantShare, initialDominantShare), sentiment: dominantShare >= initialDominantShare ? 'negative' : 'positive' }} />
            <StatBlock block={{ type: 'stat', value: currentGini != null ? compactNumber(currentGini, 3) : 'N/A', label: 'Gini', sublabel: 'Geographic concentration', delta: deltaLabel(currentGini, initialGini), sentiment: (currentGini ?? 0) <= (initialGini ?? 0) ? 'positive' : 'negative' }} />
            <StatBlock block={{ type: 'stat', value: currentMev != null ? `${compactNumber(currentMev, 4)} ETH` : 'N/A', label: 'Average MEV', sublabel: 'Current slot reward surface', delta: deltaLabel(currentMev, initialMev), sentiment: (currentMev ?? 0) >= (initialMev ?? 0) ? 'positive' : 'neutral' }} />
            <StatBlock block={{ type: 'stat', value: currentProposalTime != null ? `${compactNumber(currentProposalTime, 1)} ms` : 'N/A', label: 'Proposal time', sublabel: currentAttestation != null ? `Attestation ${percentage(currentAttestation, 1)}` : 'Consensus timing', delta: deltaLabel(currentProposalTime, initialProposalTime), sentiment: (currentProposalTime ?? Number.POSITIVE_INFINITY) <= (initialProposalTime ?? Number.POSITIVE_INFINITY) ? 'positive' : 'negative' }} />
          </div>
        </div>
      </div>

      <div className="lab-stage p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-xs text-muted">Playback controls</div>
            <div className="mt-1 text-sm text-text-primary">Scrub the frozen published trajectory without leaving the app.</div>
            <div className="mt-2 text-xs text-muted">
              The control language mirrors the original viewer, but the surface is tuned to match the rest of the explorer.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setPlaying(previous => !previous)} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all hover:-translate-y-0.5', playing ? 'bg-accent text-white shadow-[0_16px_30px_rgba(37,99,235,0.18)]' : 'border border-border-subtle bg-white text-text-primary hover:border-border-hover')}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => { setPlaying(false); setSlot(0) }} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-white px-3.5 py-2.5 text-xs text-text-primary transition-all hover:-translate-y-0.5 hover:border-border-hover">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            {[1, 10, 50].map(option => (
              <button key={option} onClick={() => setStepSize(option as 1 | 10 | 50)} className={cn('rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-all hover:-translate-y-0.5', stepSize === option ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent shadow-[0_12px_24px_rgba(37,99,235,0.08)]' : 'border-border-subtle bg-white text-text-primary hover:border-border-hover')}>
                Step {option}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-[1.15rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,244,240,0.9))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span className="lab-chip">{playing ? 'Autoplay active' : 'Paused for inspection'}</span>
            <span className="lab-chip">Step {stepSize}</span>
            <span className="lab-chip">Slot {countLabel(slot + 1)} of {countLabel(totalSlots)}</span>
          </div>
          <input type="range" min={0} max={lastSlot} step={1} value={slot} onChange={event => { setPlaying(false); setSlot(Number(event.target.value)) }} className="w-full accent-accent" aria-label="Simulation slot" />
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
            <span>slot 1</span>
            <span>slot {countLabel(slot + 1)} of {countLabel(totalSlots)}</span>
            <span>slot {countLabel(totalSlots)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <PublishedGeoCard title={`${dataset.evaluation} · ${dataset.paradigm} · ${dataset.result}`} regions={currentRegions} />
        <div className="space-y-6">
          <ChartBlock block={sourceChartBlock} />
          <InsightBlock block={insightBlock} />
          <div className="rounded-xl border border-border-subtle bg-white px-4 py-4 text-xs text-muted">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Frozen configuration</div>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between gap-3"><span>Validators</span><span className="font-medium tabular-nums text-text-primary">{countLabel(data?.v ?? metadata.v ?? totalValidators)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Migration cost</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.cost ?? metadata.cost ?? 0, 4)} ETH</span></div>
              <div className="flex items-center justify-between gap-3"><span>Slot time</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.delta ?? metadata.delta ?? 0, 0)} ms</span></div>
              <div className="flex items-center justify-between gap-3"><span>Cutoff</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.cutoff ?? metadata.cutoff ?? 0, 0)} ms</span></div>
              <div className="flex items-center justify-between gap-3"><span>Gamma</span><span className="font-medium tabular-nums text-text-primary">{compactNumber(data?.gamma ?? metadata.gamma ?? 0, 4)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Clusters now</span><span className="font-medium tabular-nums text-text-primary">{currentClusters != null ? countLabel(currentClusters) : 'N/A'}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TimeSeriesBlock block={concentrationSeriesBlock} />
        <TimeSeriesBlock block={distanceSeriesBlock} />
        <TimeSeriesBlock block={proposalSeriesBlock} />
        <TimeSeriesBlock block={mevSeriesBlock} />
      </div>
    </div>
  )
}
