import { startTransition, useEffect, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { TimeSeriesBlock } from '../blocks/TimeSeriesBlock'
import { cn } from '../../lib/cn'
import {
  attestationCutoffMs,
  describeDistribution,
  describePaperComparability,
  describeParadigmWithAlias,
  describeSourcePlacement,
  formatBytes,
  formatNumber,
  paperScenarioLabels,
} from './simulation-constants'
import type {
  SimulationArtifact,
  SimulationManifest,
  SimulationOverviewBundle,
} from '../../lib/simulation-api'
import type { SimulationArtifactBundle } from '../../types/simulation-view'
import type { Block } from '../../types/blocks'

function buildRunSummary(manifest: SimulationManifest): string {
  return [
    `Exact simulation run`,
    `Paradigm: ${describeParadigmWithAlias(manifest.config.paradigm)}`,
    `Reference tags: ${paperScenarioLabels(manifest.config).join(' | ')}`,
    `Seed: ${manifest.config.seed}`,
    `Validators: ${manifest.config.validators}`,
    `Slots: ${manifest.config.slots}`,
    `Runtime: ${formatNumber(manifest.runtimeSeconds, 2)}s`,
    `Final average MEV: ${formatNumber(manifest.summary.finalAverageMev, 4)} ETH`,
    `Final supermajority success: ${formatNumber(manifest.summary.finalSupermajoritySuccess, 2)}%`,
    `Execution: ${manifest.cacheHit ? 'Exact cache hit' : 'Fresh exact run'}`,
    `Cache key: ${manifest.cacheKey}`,
  ].join('\n')
}

function isManifestOverviewBundle(
  bundle: OverviewBundleOption | SimulationOverviewBundle | null,
): bundle is SimulationOverviewBundle {
  return Boolean(bundle && 'bytes' in bundle)
}

type OverviewBundleOption = {
  readonly bundle: SimulationArtifactBundle
  readonly label: string
  readonly description: string
}

interface SimResultsPanelProps {
  readonly manifest: SimulationManifest
  readonly overviewBundleOptions: ReadonlyArray<OverviewBundleOption | SimulationOverviewBundle>
  readonly selectedBundle: SimulationArtifactBundle
  readonly onSelectBundle: (bundle: SimulationArtifactBundle) => void
  readonly exactChartSeries?: ReadonlyArray<{
    readonly artifactName: string
    readonly label: string
    readonly description: string
    readonly kind: SimulationArtifact['kind']
    readonly values: readonly number[]
  }>
  readonly isExactChartDeckLoading?: boolean
  readonly selectedOverviewBundleMetrics: SimulationOverviewBundle | null
  readonly overviewBlocks: readonly Block[]
  readonly isOverviewLoading: boolean
  readonly selectedArtifact: SimulationArtifact | null
  readonly selectedArtifactName: string | null
  readonly onSelectArtifact: (name: string) => void
  readonly isArtifactFetching: boolean
  readonly isParsing: boolean
  readonly parseError: string | null
  readonly parsedBlocks: readonly Block[]
  readonly copyState: 'config' | 'run' | null
  readonly exportState: 'idle' | 'exporting' | 'done'
  readonly exportError: string | null
  readonly onCopy: (text: string, kind: 'config' | 'run') => void
  readonly onExportData: () => void
}

interface ExactMetricCard {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly suffix?: string
  readonly note?: string
}

type ExactChartSeries = NonNullable<SimResultsPanelProps['exactChartSeries']>[number]

const CHART_VISUALS: Record<string, {
  readonly title: string
  readonly unit: string
  readonly yLabel: string
  readonly color: string
  readonly glow: string
}> = {
  'avg_mev.json': {
    title: 'Average MEV earned',
    unit: 'ETH',
    yLabel: 'ETH',
    color: '#2563EB',
    glow: 'rgba(37, 99, 235, 0.16)',
  },
  'supermajority_success.json': {
    title: 'Supermajority success',
    unit: '%',
    yLabel: 'Success (%)',
    color: '#0F766E',
    glow: 'rgba(15, 118, 110, 0.16)',
  },
  'failed_block_proposals.json': {
    title: 'Failed block proposals',
    unit: 'count',
    yLabel: 'Count',
    color: '#C2553A',
    glow: 'rgba(194, 85, 58, 0.18)',
  },
  'utility_increase.json': {
    title: 'Utility increase',
    unit: 'ETH',
    yLabel: 'ETH',
    color: '#7C3AED',
    glow: 'rgba(124, 58, 237, 0.16)',
  },
  'proposal_time_avg.json': {
    title: 'Average proposal time',
    unit: 'ms',
    yLabel: 'Milliseconds',
    color: '#D97706',
    glow: 'rgba(217, 119, 6, 0.16)',
  },
  'attestation_sum.json': {
    title: 'Aggregate attestations',
    unit: 'sum',
    yLabel: 'Aggregate attestations',
    color: '#16A34A',
    glow: 'rgba(22, 163, 74, 0.16)',
  },
}

function formatExactChartValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(value) >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  if (Math.abs(value) >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function buildSparkline(values: readonly number[], width = 220, height = 72): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - (((value - min) / range) * (height - 8) + 4)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function buildArtifactFigureNote(artifact: SimulationArtifact): {
  readonly title: string
  readonly detail: string
} {
  switch (artifact.name) {
    case 'paper_geography_metrics.json':
      return {
        title: 'Paper-facing concentration figure',
        detail: 'Use this when checking claims about geography concentration, liveness, or profit variance rather than just final rewards.',
      }
    case 'top_regions_final.json':
      return {
        title: 'Final-state geography snapshot',
        detail: 'This is a terminal picture of where validators ended up. Pair it with a trend artifact when you need the migration story.',
      }
    case 'avg_mev.json':
      return {
        title: 'Reward accumulation trace',
        detail: 'Read the shape of incentives across the run, not just the endpoint at the final slot.',
      }
    case 'supermajority_success.json':
      return {
        title: 'Consensus completion trace',
        detail: 'Use this to see whether the run stabilizes cleanly or degrades over time under the current configuration.',
      }
    case 'proposal_time_avg.json':
      return {
        title: 'Latency pressure trace',
        detail: 'Read this as the timing cost of the current geography and source placement, especially when comparing SSP against MSP.',
      }
    default:
      switch (artifact.kind) {
        case 'map':
          return {
            title: 'Spatial state figure',
            detail: 'Use the map to inspect where the run concentrates geographically, then pair it with timing or reward traces for explanation.',
          }
        case 'timeseries':
          return {
            title: 'Trend figure',
            detail: 'Read the slope and inflection points before treating the final value as the story.',
          }
        case 'table':
          return {
            title: 'Audit figure',
            detail: 'Use the table for exact values and provenance, then return to a visual artifact when you want pattern recognition.',
          }
        default:
          return {
            title: 'Supporting evidence figure',
            detail: 'Treat this artifact as part of the exact record for the run and pair it with the summary cards above when drawing conclusions.',
          }
      }
  }
}

function buildOverviewBundleNote(bundle: string): {
  readonly title: string
  readonly detail: string
  readonly prompt: string
} {
  switch (bundle) {
    case 'core-outcomes':
      return {
        title: 'Outcomes overview',
        detail: 'Start here when you need the shortest path from exact run to headline outcomes: rewards, consensus completion, and failed proposals.',
        prompt: 'Ask whether the slope changes, not just whether the final values look good.',
      }
    case 'timing-and-attestation':
      return {
        title: 'Timing and participation overview',
        detail: 'Use this bundle to read latency pressure and attestation behavior together before inferring anything about overall robustness.',
        prompt: 'Check whether timing degradation appears before rewards or concentration move.',
      }
    case 'geography-overview':
      return {
        title: 'Geography overview',
        detail: 'This bundle is for where the run ended up spatially and which regions dominate the final state.',
        prompt: 'Treat this as a final-state picture, then pair it with a trend view if you need the migration story.',
      }
    case 'paper-metrics':
      return {
        title: 'Paper metrics overview',
        detail: 'This is the closest bridge from an exact run to the paper-facing geography and concentration frame.',
        prompt: 'Use this when checking whether the exact run supports or weakens a paper claim.',
      }
    default:
      return {
        title: 'Overview bundle',
        detail: 'This bundle groups emitted artifacts into one faster reading surface for the current exact run.',
        prompt: 'Read the ordering and grouping as navigation aid, not new evidence.',
      }
  }
}

function buildChartFigureNote(series: ExactChartSeries): {
  readonly title: string
  readonly detail: string
} {
  return buildArtifactFigureNote({
    name: series.artifactName,
    label: series.label,
    kind: series.kind,
    description: series.description,
    contentType: 'application/json',
    bytes: 0,
    gzipBytes: null,
    brotliBytes: null,
    sha256: '',
    lazy: false,
    renderable: true,
  })
}

function buildInlineFigureBlocks(input: {
  readonly title: string
  readonly detail: string
  readonly prompt: string
}): readonly Block[] {
  return [
    {
      type: 'insight',
      title: input.title,
      text: input.detail,
      emphasis: 'key-finding',
    },
    {
      type: 'caveat',
      text: input.prompt,
    },
  ]
}

function ExactChartDeck({
  series,
  loading,
}: {
  readonly series: ReadonlyArray<ExactChartSeries>
  readonly loading: boolean
}) {
  const [pinnedArtifactName, setPinnedArtifactName] = useState<string | null>(series[0]?.artifactName ?? null)
  const [hoveredArtifactName, setHoveredArtifactName] = useState<string | null>(null)

  useEffect(() => {
    if (series.length === 0) {
      setPinnedArtifactName(null)
      return
    }
    if (!pinnedArtifactName || !series.some(entry => entry.artifactName === pinnedArtifactName)) {
      setPinnedArtifactName(series[0].artifactName)
    }
  }, [pinnedArtifactName, series])

  const activeArtifactName = hoveredArtifactName ?? pinnedArtifactName
  const focusedSeries = series.find(entry => entry.artifactName === activeArtifactName) ?? series[0] ?? null
  const focusedVisual = focusedSeries ? CHART_VISUALS[focusedSeries.artifactName] : null
  const focusedLatest = focusedSeries?.values.at(-1) ?? null
  const focusedPeak = focusedSeries ? Math.max(...focusedSeries.values) : null
  const focusedStart = focusedSeries?.values[0] ?? null
  const focusedDelta = focusedLatest != null && focusedStart != null ? focusedLatest - focusedStart : null
  const focusedFigureNote = focusedSeries ? buildChartFigureNote(focusedSeries) : null
  const focusedBlock = !focusedSeries || !focusedVisual
    ? null
    : {
        type: 'timeseries' as const,
        title: focusedVisual.title,
        xLabel: 'Slot',
        yLabel: focusedVisual.yLabel,
        series: [
          {
            label: focusedSeries.label,
            color: focusedVisual.color,
            data: focusedSeries.values.map((value, index) => ({ x: index + 1, y: value })),
          },
        ],
      }

  return (
    <div className="lab-stage p-4 mb-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-text-primary">Chart deck</div>
        <div className="text-xs text-muted" title="Hover a card to preview, click to pin.">
          {series.length} series
        </div>
      </div>

      {loading && series.length === 0 && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="lab-skeleton lab-skeleton-block h-[380px]" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="lab-skeleton lab-skeleton-block h-[94px]" />
            ))}
          </div>
        </div>
      )}

      {!loading && focusedSeries && focusedVisual && focusedBlock && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="overflow-hidden rounded-xl border border-rule bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Focused measurement</div>
                <div className="mt-2 text-lg font-semibold text-text-primary">{focusedVisual.title}</div>
                <div className="mt-1 max-w-2xl text-sm leading-6 text-muted">{focusedSeries.description}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { label: 'Latest', value: focusedLatest },
                  { label: 'Peak', value: focusedPeak },
                  { label: 'Delta', value: focusedDelta },
                ].map(metric => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-rule bg-white/88 px-3 py-3"
                  >
                    <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">{metric.label}</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {metric.value == null ? '—' : formatExactChartValue(metric.value)}
                    </div>
                    <div className="mt-1 text-[0.6875rem] text-muted">{focusedVisual.unit}</div>
                  </div>
                ))}
              </div>
            </div>

            <TimeSeriesBlock block={focusedBlock} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {series.map(entry => {
                const visual = CHART_VISUALS[entry.artifactName]
                const latest = entry.values.at(-1) ?? 0
                const start = entry.values[0] ?? 0
              const peak = Math.max(...entry.values)
              const delta = latest - start
              const sparkline = buildSparkline(entry.values)
              const isFocused = entry.artifactName === focusedSeries.artifactName
              const isPinned = entry.artifactName === pinnedArtifactName

                return (
                  <button
                    key={entry.artifactName}
                    onClick={() => setPinnedArtifactName(entry.artifactName)}
                    onMouseEnter={() => setHoveredArtifactName(entry.artifactName)}
                    onMouseLeave={() => setHoveredArtifactName(null)}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:border-border-hover',
                      isFocused
                        ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(255,255,255,0.98))] shadow-[0_16px_36px_rgba(37,99,235,0.12)]'
                        : 'border-rule bg-white/92',
                    )}
                    style={{ boxShadow: isFocused ? `0 18px 40px ${visual?.glow ?? 'rgba(37,99,235,0.12)'}` : undefined }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                          {isPinned ? 'Pinned chart' : isFocused ? 'Previewing now' : 'Hover to preview'}
                        </div>
                        <div className="mt-2 text-sm font-medium text-text-primary">{visual?.title ?? entry.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted line-clamp-2">{entry.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Latest</div>
                        <div className="mt-2 text-sm font-semibold tabular-nums text-text-primary">
                          {formatExactChartValue(latest)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-rule bg-surface-active px-3 py-3">
                      <svg viewBox="0 0 220 72" className="w-full" preserveAspectRatio="none">
                        <path d={sparkline} fill="none" stroke={visual?.color ?? '#2563EB'} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-[0.6875rem] sm:grid-cols-3">
                      {[
                        { label: 'Start', value: start },
                        { label: 'Peak', value: peak },
                        { label: 'Delta', value: delta },
                      ].map(metric => (
                        <div key={metric.label} className="rounded-lg border border-rule bg-white/82 px-2.5 py-2">
                          <div className="font-medium uppercase tracking-[0.1em] text-text-faint">{metric.label}</div>
                          <div className="mt-1 font-medium tabular-nums text-text-primary">
                            {formatExactChartValue(metric.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && series.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-rule bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
          This exact run did not emit any interactive chart series.
        </div>
      )}
    </div>
  )
}

export function SimResultsPanel({
  manifest,
  overviewBundleOptions,
  selectedBundle,
  onSelectBundle,
  exactChartSeries = [],
  isExactChartDeckLoading = false,
  selectedOverviewBundleMetrics,
  overviewBlocks,
  isOverviewLoading,
  selectedArtifact,
  selectedArtifactName,
  onSelectArtifact,
  isArtifactFetching,
  isParsing,
  parseError,
  parsedBlocks,
  copyState,
  exportState,
  exportError,
  onCopy,
  onExportData,
}: SimResultsPanelProps) {
  const paperComparability = describePaperComparability(manifest.config)
  const renderableArtifacts = manifest.artifacts.filter(artifact => artifact.renderable)
  const referenceArtifacts = manifest.artifacts.filter(artifact => !artifact.renderable)
  const selectedArtifactFigureNote = selectedArtifact ? buildArtifactFigureNote(selectedArtifact) : null
  const selectedOverviewBundleNote = buildOverviewBundleNote(selectedBundle)
  const overviewFigureBlocks = overviewBlocks.length > 0
    ? [
        ...buildInlineFigureBlocks({
          title: selectedOverviewBundleNote.title,
          detail: selectedOverviewBundleNote.detail,
          prompt: selectedOverviewBundleNote.prompt,
        }),
        ...overviewBlocks,
      ]
    : overviewBlocks
  const renderedArtifactBlocks = parsedBlocks.length > 0 && selectedArtifactFigureNote
    ? [
        ...buildInlineFigureBlocks({
          title: selectedArtifactFigureNote.title,
          detail: selectedArtifactFigureNote.detail,
          prompt: 'Read the figure shape first, then ask which assumption most plausibly drives it.',
        }),
        ...parsedBlocks,
      ]
    : parsedBlocks
  const exactMetricCards: readonly ExactMetricCard[] = [
    {
      key: 'finalAverageMev',
      label: 'Final average MEV',
      value: formatNumber(manifest.summary.finalAverageMev, 4),
      suffix: 'ETH',
      note: 'Ending reward surface',
    },
    {
      key: 'finalSupermajoritySuccess',
      label: 'Supermajority success',
      value: `${formatNumber(manifest.summary.finalSupermajoritySuccess, 2)}%`,
      note: 'Consensus completion',
    },
    {
      key: 'finalFailedBlockProposals',
      label: 'Failed proposals',
      value: formatNumber(manifest.summary.finalFailedBlockProposals, 0),
      note: 'Final emitted count',
    },
    {
      key: 'finalUtilityIncrease',
      label: 'Utility increase',
      value: formatNumber(manifest.summary.finalUtilityIncrease, 4),
      suffix: 'ETH',
      note: 'Net improvement',
    },
    {
      key: 'slotsRecorded',
      label: 'Slots recorded',
      value: manifest.summary.slotsRecorded.toLocaleString(),
      note: 'Manifest coverage',
    },
    {
      key: 'runtimeSeconds',
      label: 'Runtime',
      value: `${formatNumber(manifest.runtimeSeconds, 2)}s`,
      note: manifest.cacheHit ? 'Served from exact cache' : 'Fresh exact execution',
    },
  ] as const

  return (
    <>
      <div className="lab-stage p-4 mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="lab-section-title">Exact results</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {paperScenarioLabels(manifest.config).map(label => (
                <span key={label} className="lab-chip bg-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[340px]">
            <div className="lab-option-card px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Execution</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">
                {manifest.cacheHit ? 'Exact cache hit' : 'Fresh exact execution'}
              </div>
              <div className="mt-1 text-xs text-muted">{formatNumber(manifest.runtimeSeconds, 2)}s runtime</div>
            </div>
            <div className="lab-option-card px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Scenario</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">{describeParadigmWithAlias(manifest.config.paradigm)}</div>
              <div className="mt-1 text-xs text-muted">{manifest.config.validators.toLocaleString()} validators · {manifest.config.slots.toLocaleString()} slots</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 xl:grid-cols-6">
          {exactMetricCards.map(card => (
            <div key={card.key} className="lab-option-card px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
              <div className="mt-1.5 text-lg font-semibold text-text-primary tabular-nums">
                {card.value}
              </div>
              {card.suffix && (
                <div className="mt-1 text-xs text-muted">{card.suffix}</div>
              )}
              {card.note && (
                <div className="mt-1.5 text-[0.6875rem] leading-5 text-muted">{card.note}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ExactChartDeck
        series={exactChartSeries}
        loading={isExactChartDeckLoading}
      />

      <div className="lab-stage p-4 mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6875rem] font-medium',
                  paperComparability.tone === 'canonical' && 'border-success/30 bg-success/8 text-text-primary',
                  paperComparability.tone === 'editorial' && 'border-warning/30 bg-warning/8 text-text-primary',
                  paperComparability.tone === 'experimental' && 'border-rule bg-white text-text-primary',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    paperComparability.tone === 'canonical' && 'bg-success',
                    paperComparability.tone === 'editorial' && 'bg-warning',
                    paperComparability.tone === 'experimental' && 'bg-accent',
                  )}
                />
                {paperComparability.title}
              </span>
              {paperScenarioLabels(manifest.config).map(label => (
                <span key={label} className="lab-chip">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onCopy(JSON.stringify(manifest.config, null, 2), 'config')}
              className="lab-option-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
            >
              {copyState === 'config' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copyState === 'config' ? 'Copied config' : 'Copy config JSON'}
            </button>
            <button
              onClick={() => onCopy(buildRunSummary(manifest), 'run')}
              className="lab-option-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
            >
              {copyState === 'run' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copyState === 'run' ? 'Copied summary' : 'Copy run summary'}
            </button>
            <button
              onClick={onExportData}
              disabled={exportState === 'exporting'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors',
                exportState === 'exporting'
                  ? 'cursor-wait border-rule bg-surface-active text-muted'
                  : 'lab-option-card rounded-xl bg-white text-text-primary hover:border-border-hover',
              )}
            >
              {exportState === 'done'
                ? <Check className="w-3 h-3" />
                : <Download className="w-3 h-3" />}
              {exportState === 'exporting'
                ? 'Preparing export…'
                : exportState === 'done'
                  ? 'Package downloaded'
                  : 'Export run package'}
            </button>
            <a
              href="https://geo-decentralization.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="arrow-link"
            >
              Published demo
            </a>
          </div>
        </div>

        {exportError && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {exportError}
          </div>
        )}

        <details className="mt-4 rounded-xl border border-rule bg-white px-4 py-3">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Provenance and integrity</div>
                <div className="mt-1 text-sm font-medium text-text-primary">
                  Exact configuration, timing, and truth-boundary details
                </div>
              </div>
              <div className="text-xs text-muted">
                Open details
              </div>
            </div>
          </summary>

          <div className="mt-4">
            <div className="rounded-xl border border-rule bg-surface-active/70 px-4 py-3">
              <div className="text-sm font-medium text-text-primary">{paperComparability.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted">{paperComparability.detail}</div>
            </div>

            <div className="grid gap-2 mt-3 text-xs text-muted sm:grid-cols-2 xl:grid-cols-4">
              <div className="lab-metric-card">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Configuration</div>
                <div className="mt-2 text-sm font-medium text-text-primary">{describeParadigmWithAlias(manifest.config.paradigm)} exact mode</div>
                <div className="mt-1 text-xs text-muted">{describeDistribution(manifest.config.distribution)}</div>
                <div className="mt-1 text-xs text-muted">{describeSourcePlacement(manifest.config.sourcePlacement)}</div>
              </div>
              <div className="lab-metric-card">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Consensus timing</div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  gamma {formatNumber(manifest.config.attestationThreshold, 4)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  cutoff {attestationCutoffMs(manifest.config.slotTime).toLocaleString()} ms
                </div>
                <div className="mt-1 text-xs text-muted">
                  slot time {manifest.config.slotTime}s
                </div>
              </div>
              <div className="lab-metric-card">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Run identity</div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  seed {manifest.config.seed}
                </div>
                <div className="mt-1 text-xs text-muted">
                  validators {manifest.config.validators.toLocaleString()} · slots {manifest.config.slots.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted break-all">
                  cache {manifest.cacheKey}
                </div>
              </div>
              <div className="lab-metric-card">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Paper metric availability</div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  Published surface: Gini_g / HHI_g / CV_g / LC_g
                </div>
                <div className="mt-1 text-xs text-muted">
                  The live exact manifest still centers MEV, supermajority, failed proposals, utility increase, and renderable artifacts.
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="lab-stage p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs text-muted mb-1">
              Exact overview
            </div>
            <div className="text-sm text-text-primary">
              Prebuilt exact bundles derived from the current manifest and artifact sidecars.
            </div>
          </div>
          <div className="text-xs text-muted">
            {selectedOverviewBundleMetrics
              ? [
                  formatBytes(selectedOverviewBundleMetrics.bytes),
                  selectedOverviewBundleMetrics.brotliBytes != null
                    ? `br ${formatBytes(selectedOverviewBundleMetrics.brotliBytes)}`
                    : null,
                  selectedOverviewBundleMetrics.gzipBytes != null
                    ? `gzip ${formatBytes(selectedOverviewBundleMetrics.gzipBytes)}`
                    : null,
                ].filter(Boolean).join(' · ')
              : 'Manifest-ready sidecars'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {overviewBundleOptions.map(option => (
            <button
              key={option.bundle}
              onClick={() => startTransition(() => onSelectBundle(option.bundle))}
              className={cn(
                'lab-option-card min-w-[180px] rounded-xl px-3.5 py-2.5 text-left transition-all hover:border-border-hover',
                selectedBundle === option.bundle
                  ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))]'
                  : '',
              )}
            >
              <div className="text-xs font-medium text-text-primary">{option.label}</div>
              <div className="text-xs text-muted">{option.description}</div>
              {isManifestOverviewBundle(option) && (
                <div className="mt-1 text-[0.6875rem] text-text-faint">
                  {[
                    formatBytes(option.bytes),
                    option.brotliBytes != null ? `br ${formatBytes(option.brotliBytes)}` : null,
                    option.gzipBytes != null ? `gzip ${formatBytes(option.gzipBytes)}` : null,
                  ].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>

        {isOverviewLoading && overviewBlocks.length === 0 && (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="lab-skeleton lab-skeleton-block h-[320px]" />
            <div className="space-y-3 rounded-xl border border-rule bg-white/80 p-4">
              <div className="lab-skeleton lab-skeleton-line w-1/3" />
              <div className="lab-skeleton lab-skeleton-line w-full" />
              <div className="lab-skeleton lab-skeleton-line w-4/5" />
              <div className="lab-skeleton lab-skeleton-block h-[88px]" />
              <div className="lab-skeleton lab-skeleton-block h-[88px]" />
            </div>
          </div>
        )}

        {!isOverviewLoading && overviewBlocks.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted">
                <span className="rounded-full border border-rule bg-white/88 px-2 py-0.5">
                  Active bundle
                </span>
                <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
                  {selectedOverviewBundleNote.title}
                </span>
              </div>
              <BlockCanvas blocks={overviewFigureBlocks} showExport={false} />
            </div>
            <aside className="rounded-xl border border-rule bg-white/82 px-4 py-3.5">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                Bundle marginalia
              </div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">
                {selectedOverviewBundleNote.title}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted">
                {selectedOverviewBundleNote.detail}
              </div>
              <div className="mt-3 rounded-lg border border-rule bg-surface-active/80 px-3 py-2 text-[0.75rem] leading-5 text-muted">
                {selectedOverviewBundleNote.prompt}
              </div>
            </aside>
          </div>
        )}

        {!isOverviewLoading && overviewBlocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-rule bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
            This exact run does not have a ready overview sidecar for the selected bundle yet.
          </div>
        )}
      </div>

      <div className="lab-stage p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs text-muted mb-1">
              Artifact manifest
            </div>
            <div className="text-sm text-text-primary">
              Inspectable artifacts first, then raw references emitted for the same run.
            </div>
            <div className="mt-1 text-xs text-muted">
              {renderableArtifacts.length} renderable · {referenceArtifacts.length} reference-only
            </div>
          </div>
          <div className="text-xs text-muted text-right">
            {manifest.cacheHit ? 'Served from exact cache' : 'Fresh exact run'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {renderableArtifacts.map(artifact => (
            <button
              key={artifact.name}
              onClick={() => onSelectArtifact(artifact.name)}
              className={cn(
                'lab-option-card text-left rounded-[1rem] px-4 py-3 transition-all hover:border-border-hover',
                selectedArtifactName === artifact.name
                  ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))]'
                  : '',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{artifact.label}</div>
                  <div className="text-xs text-muted mt-1 line-clamp-2">{artifact.description}</div>
                </div>
                <div className="text-[0.6875rem] text-muted whitespace-nowrap">
                  {artifact.kind}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3 text-[0.6875rem] text-muted">
                <span className="rounded-full border border-rule bg-white/88 px-2 py-0.5">
                  {artifact.lazy ? 'Lazy fetch' : 'Manifest-ready'}
                </span>
                <span>{formatBytes(artifact.bytes)}</span>
                {artifact.brotliBytes != null && <span>br {formatBytes(artifact.brotliBytes)}</span>}
                {artifact.gzipBytes != null && <span>gzip {formatBytes(artifact.gzipBytes)}</span>}
              </div>
            </button>
          ))}
        </div>

          {referenceArtifacts.length > 0 && (
            <details className="mt-4 rounded-xl border border-rule bg-white/78 px-4 py-3.5">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Reference artifacts</div>
                    <div className="mt-1 text-sm text-text-primary">
                      Raw exports preserved for audit and offline analysis.
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    {referenceArtifacts.length} hidden sources
                  </div>
                </div>
              </summary>

              <div className="mt-3 grid gap-2">
                {referenceArtifacts.map(artifact => (
                  <div
                    key={artifact.name}
                    className="flex flex-col gap-2 rounded-xl border border-rule bg-white/92 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-text-primary">{artifact.label}</div>
                        <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-[0.6875rem] text-muted">
                          {artifact.kind}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">{artifact.description}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted sm:justify-end">
                      <span>{formatBytes(artifact.bytes)}</span>
                      {artifact.brotliBytes != null && <span>br {formatBytes(artifact.brotliBytes)}</span>}
                      {artifact.gzipBytes != null && <span>gzip {formatBytes(artifact.gzipBytes)}</span>}
                      <span className="rounded-full border border-rule bg-white px-2 py-0.5">
                        {artifact.lazy ? 'Lazy source' : 'Manifest source'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
        )}
      </div>

      <div className="lab-stage p-4">
        <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="text-xs text-muted mb-1">
              Rendered artifact
            </div>
            <div className="text-sm text-text-primary">
              {selectedArtifact?.label ?? 'Select an artifact to render'}
            </div>
            {selectedArtifact?.description && (
              <div className="mt-1 text-xs text-muted">
                {selectedArtifact.description}
              </div>
            )}
            {!selectedArtifact && (
              <div className="mt-1 text-xs text-muted">
                Choose from {renderableArtifacts.length} renderable artifacts above.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-rule bg-white/82 px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Figure marginalia
            </div>
            {selectedArtifact && selectedArtifactFigureNote ? (
              <>
                <div className="mt-1.5 text-sm font-medium text-text-primary">
                  {selectedArtifactFigureNote.title}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">
                  {selectedArtifactFigureNote.detail}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted">
                  <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
                    {selectedArtifact.kind}
                  </span>
                  <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
                    {selectedArtifact.lazy ? 'Lazy-loaded from manifest' : 'Manifest-ready'}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-1.5 text-xs leading-5 text-muted">
                Pick a renderable artifact and this rail will frame what kind of evidence it provides and how to read it.
              </div>
            )}
          </div>
        </div>

        {((isArtifactFetching && !parsedBlocks.length) || isParsing) && (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="lab-skeleton lab-skeleton-block h-[320px]" />
            <div className="space-y-3 rounded-xl border border-rule bg-white/80 p-4">
              <div className="lab-skeleton lab-skeleton-line w-1/3" />
              <div className="lab-skeleton lab-skeleton-line w-full" />
              <div className="lab-skeleton lab-skeleton-line w-5/6" />
              <div className="lab-skeleton lab-skeleton-block h-[88px]" />
              <div className="lab-skeleton lab-skeleton-block h-[88px]" />
            </div>
          </div>
        )}

        {parseError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {parseError}
          </div>
        )}

        {selectedArtifact && !isArtifactFetching && !isParsing && !parseError && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted">
            <span className="rounded-full border border-rule bg-white px-2 py-0.5">
              Figure cue
            </span>
            <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
              Read as {selectedArtifact.kind === 'timeseries' ? 'trend' : selectedArtifact.kind === 'map' ? 'spatial state' : selectedArtifact.kind}
            </span>
            <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
              {selectedArtifact.lazy ? 'Loaded on demand' : 'Ready from manifest'}
            </span>
            <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5">
              Exact output, no smoothing
            </span>
          </div>
        )}

        {!isArtifactFetching && !isParsing && !parseError && parsedBlocks.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <BlockCanvas blocks={renderedArtifactBlocks} showExport={false} />
            </div>
            <aside className="rounded-xl border border-rule bg-white/82 px-4 py-3.5">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                Reading prompts
              </div>
              {selectedArtifactFigureNote ? (
                <>
                  <div className="mt-1.5 text-sm font-medium text-text-primary">
                    {selectedArtifactFigureNote.title}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {selectedArtifactFigureNote.detail}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-lg border border-rule bg-surface-active/80 px-3 py-2 text-[0.75rem] leading-5 text-muted">
                      What changes in the shape before the final slot?
                    </div>
                    <div className="rounded-lg border border-rule bg-surface-active/80 px-3 py-2 text-[0.75rem] leading-5 text-muted">
                      Which assumption in this run most plausibly drives this figure?
                    </div>
                    <div className="rounded-lg border border-rule bg-surface-active/80 px-3 py-2 text-[0.75rem] leading-5 text-muted">
                      Would the same pattern likely hold under the other paradigm?
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-1.5 text-xs leading-5 text-muted">
                  Select an artifact to frame the figure with a concrete reading posture.
                </div>
              )}
            </aside>
          </div>
        )}

        {!isArtifactFetching && !isParsing && !parseError && parsedBlocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-rule bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
            Pick a renderable artifact to inspect the exact run.
          </div>
        )}
      </div>
    </>
  )
}
