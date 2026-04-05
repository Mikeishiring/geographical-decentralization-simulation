import { startTransition, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Copy, Download } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { TimeSeriesBlock } from '../blocks/TimeSeriesBlock'
import { cn } from '../../lib/cn'
import { BLOCK_COLORS, CHART, SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
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
  readonly detail?: string
}

type ExactChartSeries = NonNullable<SimResultsPanelProps['exactChartSeries']>[number]

/** Chart visual metadata — colors sourced from BLOCK_COLORS design tokens */
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
    color: BLOCK_COLORS[0],
    glow: `${BLOCK_COLORS[0]}28`,
  },
  'supermajority_success.json': {
    title: 'Supermajority success',
    unit: '%',
    yLabel: 'Success (%)',
    color: BLOCK_COLORS[2],
    glow: `${BLOCK_COLORS[2]}28`,
  },
  'failed_block_proposals.json': {
    title: 'Failed block proposals',
    unit: 'count',
    yLabel: 'Count',
    color: BLOCK_COLORS[1],
    glow: `${BLOCK_COLORS[1]}2E`,
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
    color: BLOCK_COLORS[3],
    glow: `${BLOCK_COLORS[3]}28`,
  },
  'attestation_sum.json': {
    title: 'Aggregate attestations',
    unit: 'sum',
    yLabel: 'Aggregate attestations',
    color: BLOCK_COLORS[2],
    glow: `${BLOCK_COLORS[2]}28`,
  },
}

function formatExactChartValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(value) >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  if (Math.abs(value) >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function buildSparkline(values: readonly number[], width = 220, height = 72): {
  path: string
  areaPath: string
  endX: number
  endY: number
} {
  if (values.length === 0) return { path: '', areaPath: '', endX: 0, endY: 0 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const path = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - (((value - min) / range) * (height - 8) + 4)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
  const lastX = width
  const lastY = height - (((values[values.length - 1] - min) / range) * (height - 8) + 4)
  const areaPath = `${path} L ${lastX.toFixed(2)} ${height} L 0 ${height} Z`
  return { path, areaPath, endX: lastX, endY: lastY }
}

function buildArtifactFigureNote(artifact: SimulationArtifact): {
  readonly title: string
  readonly detail: string
} {
  switch (artifact.name) {
    case 'paper_geography_metrics.json':
      return {
        title: 'Paper-facing concentration figure',
        detail: 'Use this when checking claims about geography concentration, collapse threshold, or profit variance rather than just final rewards.',
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
        detail: 'Read this as the timing cost of the current geography and source placement, especially when comparing external against local block building.',
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
    <motion.div
      className="geo-accent-bar lab-stage p-5 mb-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.06 }}
    >
      <div className="flex items-center justify-between">
        <div className="lab-section-title">Chart deck</div>
        <div className="mono-xs" title="Hover a card to preview, click to pin.">
          {series.length} series
        </div>
      </div>

      {loading && series.length === 0 && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="lab-skeleton lab-skeleton-block h-[380px] chart-skeleton-breathe" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="lab-skeleton lab-skeleton-block h-[94px] chart-skeleton-breathe" style={{ animationDelay: `${index * 120}ms` }} />
            ))}
          </div>
        </div>
      )}

      {!loading && focusedSeries && focusedVisual && focusedBlock && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
          <AnimatePresence mode="wait">
            <motion.div
              key={focusedSeries.artifactName}
              className="overflow-hidden rounded-xl border border-rule bg-white p-4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={SPRING_CRISP}
            >
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-semibold tracking-tight text-text-primary">{focusedVisual.title}</div>
                  <div className="mt-1 max-w-2xl text-sm leading-6 text-muted">{focusedSeries.description}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  {[
                    { label: 'Latest', value: focusedLatest, detail: 'Value at the final recorded slot' },
                    { label: 'Peak', value: focusedPeak, detail: 'Highest value reached during the run' },
                    { label: 'Delta', value: focusedDelta, detail: 'Change from start to final slot' },
                  ].map((metric, mi) => (
                    <motion.div
                      key={metric.label}
                      className="rounded-xl border border-rule bg-surface-active/60 px-3 py-2.5"
                      title={metric.detail}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_CRISP, delay: 0.06 + mi * 0.03 }}
                    >
                      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{metric.label}</div>
                      <div className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                        {metric.value == null ? '—' : formatExactChartValue(metric.value)}
                      </div>
                      <div className="mt-0.5 mono-xs">{focusedVisual.unit}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <TimeSeriesBlock block={focusedBlock} />
            </motion.div>
          </AnimatePresence>

          <motion.div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"
            initial="hidden" animate="visible" variants={STAGGER_CONTAINER}
          >
              {series.map(entry => {
                const visual = CHART_VISUALS[entry.artifactName]
                const latest = entry.values.at(-1) ?? 0
                const start = entry.values[0] ?? 0
              const peak = Math.max(...entry.values)
              const delta = latest - start
              const spark = buildSparkline(entry.values)
              const isFocused = entry.artifactName === focusedSeries.artifactName
              const isPinned = entry.artifactName === pinnedArtifactName

                return (
                  <motion.button
                    variants={STAGGER_ITEM}
                    key={entry.artifactName}
                    onClick={() => setPinnedArtifactName(entry.artifactName)}
                    onMouseEnter={() => setHoveredArtifactName(entry.artifactName)}
                    onMouseLeave={() => setHoveredArtifactName(null)}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:border-border-hover',
                      isFocused
                        ? 'border-accent bg-gradient-to-b from-accent/[0.08] to-white/98 shadow-[0_16px_36px_rgba(37,99,235,0.12)]'
                        : 'border-rule bg-white/92',
                    )}
                    style={{ boxShadow: isFocused ? `0 18px 40px ${visual?.glow ?? `${BLOCK_COLORS[0]}1F`}` : undefined }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
                          {isPinned ? 'Pinned chart' : isFocused ? 'Previewing now' : 'Hover to preview'}
                        </div>
                        <div className="mt-2 text-sm font-medium text-text-primary">{visual?.title ?? entry.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted line-clamp-2">{entry.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Latest</div>
                        <div className="mt-2 text-sm font-semibold tabular-nums text-text-primary">
                          {formatExactChartValue(latest)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-rule bg-surface-active px-3 py-3">
                      <svg viewBox="0 0 220 72" className="w-full chart-edge-fade" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id={`spark-fill-${entry.artifactName.replace(/\./g, '-')}`} x1="0%" x2="0%" y1="0%" y2="100%">
                            <stop offset="0%" stopColor={visual?.color ?? BLOCK_COLORS[0]} stopOpacity={0.14} />
                            <stop offset="100%" stopColor={visual?.color ?? BLOCK_COLORS[0]} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        {/* Area fill — liveline-style gradient */}
                        <path d={spark.areaPath} fill={`url(#spark-fill-${entry.artifactName.replace(/\./g, '-')})`} />
                        {/* Line path */}
                        <path d={spark.path} fill="none" stroke={visual?.color ?? BLOCK_COLORS[0]} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Pulsing live dot at endpoint */}
                        <circle cx={spark.endX} cy={spark.endY} r="3.5" fill="none" stroke={visual?.color ?? BLOCK_COLORS[0]} strokeWidth="1.5" opacity="0.4" className="live-dot-pulse" />
                        <circle cx={spark.endX} cy={spark.endY} r="3" fill="white" stroke={visual?.color ?? BLOCK_COLORS[0]} strokeWidth="1.5" />
                        <circle cx={spark.endX} cy={spark.endY} r="1.5" fill={visual?.color ?? BLOCK_COLORS[0]} />
                      </svg>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-11 sm:grid-cols-3">
                      {[
                        { label: 'Start', value: start, detail: 'Value at slot 0 (beginning of run)' },
                        { label: 'Peak', value: peak, detail: 'Highest value reached during the run' },
                        { label: 'Delta', value: delta, detail: 'Change from start to final slot' },
                      ].map(metric => (
                        <div key={metric.label} className="rounded-lg border border-rule bg-white/82 px-2.5 py-2" title={metric.detail}>
                          <div className="font-medium uppercase tracking-[0.1em] text-text-faint">{metric.label}</div>
                          <div className="mt-1 font-medium tabular-nums text-text-primary">
                            {formatExactChartValue(metric.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.button>
                )
              })}
          </motion.div>
          </div>
      )}

      {!loading && series.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-rule bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
          This exact run did not emit any interactive chart series.
        </div>
      )}
    </motion.div>
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
      detail: 'Average maximal extractable value per validator at final slot. Higher = better incentive alignment.',
    },
    {
      key: 'finalSupermajoritySuccess',
      label: 'Supermajority success',
      value: `${formatNumber(manifest.summary.finalSupermajoritySuccess, 2)}%`,
      note: 'Consensus completion',
      detail: 'Percentage of slots where ≥2/3 of validators attested successfully. >99% indicates healthy consensus.',
    },
    {
      key: 'finalFailedBlockProposals',
      label: 'Failed proposals',
      value: formatNumber(manifest.summary.finalFailedBlockProposals, 0),
      note: 'Final emitted count',
      detail: 'Block proposals that failed to reach the attestation threshold. Lower is better.',
    },
    {
      key: 'finalUtilityIncrease',
      label: 'Utility increase',
      value: formatNumber(manifest.summary.finalUtilityIncrease, 4),
      suffix: 'ETH',
      note: 'Net improvement',
      detail: 'Net MEV gain compared to baseline. Positive = geographic configuration improved validator rewards.',
    },
    {
      key: 'slotsRecorded',
      label: 'Slots recorded',
      value: manifest.summary.slotsRecorded.toLocaleString(),
      note: 'Manifest coverage',
      detail: 'Total consensus rounds captured in the result manifest. Should match requested slot count.',
    },
    {
      key: 'runtimeSeconds',
      label: 'Runtime',
      value: `${formatNumber(manifest.runtimeSeconds, 2)}s`,
      note: manifest.cacheHit ? 'Served from exact cache' : 'Fresh exact execution',
      detail: manifest.cacheHit ? 'Result served instantly from cache — identical config was run before.' : 'Fresh simulation execution time. Depends on validator × slot count.',
    },
  ] as const

  return (
    <>
      <motion.div
        className="stripe-top-accent lab-stage p-5 mb-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="lab-section-title">Exact results</div>
            <motion.div
              className="mt-2.5 flex flex-wrap items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...SPRING_CRISP, delay: 0.08 }}
            >
              {paperScenarioLabels(manifest.config).map(label => (
                <span key={label} className="lab-chip bg-white/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {label}
                </span>
              ))}
              <span className="lab-chip bg-white/90">
                {manifest.cacheHit ? 'Cache hit' : 'Fresh run'}
                <span className="mono-xs">{formatNumber(manifest.runtimeSeconds, 2)}s</span>
              </span>
            </motion.div>
          </div>

          <motion.div
            className="flex items-center gap-3 text-sm"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING_CRISP, delay: 0.12 }}
          >
            <span className="font-medium text-text-primary">{describeParadigmWithAlias(manifest.config.paradigm)}</span>
            <span className="text-muted">{manifest.config.validators.toLocaleString()} val · {manifest.config.slots.toLocaleString()} slots</span>
          </motion.div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 sm:grid-cols-6">
          {exactMetricCards.map((card, i) => (
            <motion.div
              key={card.key}
              className="lab-metric-card card-hover"
              title={card.detail ?? card.note ?? undefined}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING_CRISP, delay: 0.1 + i * CHART.stagger }}
            >
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
              <div className="mt-1.5 text-lg font-semibold text-text-primary tabular-nums">
                {card.value}
              </div>
              {card.suffix && (
                <div className="mt-0.5 mono-xs">{card.suffix}</div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      <ExactChartDeck
        series={exactChartSeries}
        loading={isExactChartDeckLoading}
      />

      <motion.div
        className="lab-panel p-4 mb-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-11 font-medium',
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
            <button
              onClick={() => onCopy(JSON.stringify(manifest.config, null, 2), 'config')}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1 text-11 font-medium text-text-primary transition-colors hover:border-border-hover"
            >
              {copyState === 'config' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copyState === 'config' ? 'Copied' : 'Config'}
            </button>
            <button
              onClick={() => onCopy(buildRunSummary(manifest), 'run')}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1 text-11 font-medium text-text-primary transition-colors hover:border-border-hover"
            >
              {copyState === 'run' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copyState === 'run' ? 'Copied' : 'Summary'}
            </button>
            <button
              onClick={onExportData}
              disabled={exportState === 'exporting'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-11 font-medium transition-colors',
                exportState === 'exporting'
                  ? 'cursor-wait border-rule bg-surface-active text-muted'
                  : 'border-rule bg-white text-text-primary hover:border-border-hover',
              )}
            >
              {exportState === 'done'
                ? <Check className="w-3 h-3" />
                : <Download className="w-3 h-3" />}
              {exportState === 'exporting' ? 'Exporting…' : exportState === 'done' ? 'Done' : 'Export'}
            </button>
          </div>
          <a
            href="https://geo-decentralization.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="arrow-link"
          >
            Published demo
          </a>
        </div>

        {exportError && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {exportError}
          </div>
        )}

        <details className="mt-4 rounded-xl border border-rule bg-surface-active/50 px-4 py-3">
          <summary className="cursor-pointer list-none text-11 text-muted hover:text-text-primary transition-colors">
            Provenance details
          </summary>
          <motion.div className="grid gap-2 mt-3 text-xs text-muted sm:grid-cols-2 xl:grid-cols-4" variants={STAGGER_CONTAINER} initial="hidden" animate="visible">
            <motion.div variants={STAGGER_ITEM} className="rounded-lg border border-rule bg-white px-3 py-2.5 card-hover">
              <div className="mono-xs uppercase text-text-faint">Config</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">{describeParadigmWithAlias(manifest.config.paradigm)}</div>
              <div className="mt-1">{describeDistribution(manifest.config.distribution)} · {describeSourcePlacement(manifest.config.sourcePlacement)}</div>
            </motion.div>
            <motion.div variants={STAGGER_ITEM} className="rounded-lg border border-rule bg-white px-3 py-2.5 card-hover">
              <div className="mono-xs uppercase text-text-faint">Timing</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary mono-sm">γ {formatNumber(manifest.config.attestationThreshold, 4)}</div>
              <div className="mt-1">cutoff {attestationCutoffMs(manifest.config.slotTime).toLocaleString()}ms · {manifest.config.slotTime}s slots</div>
            </motion.div>
            <motion.div variants={STAGGER_ITEM} className="rounded-lg border border-rule bg-white px-3 py-2.5 card-hover">
              <div className="mono-xs uppercase text-text-faint">Identity</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">seed {manifest.config.seed}</div>
              <div className="mt-1">{manifest.config.validators.toLocaleString()} val · {manifest.config.slots.toLocaleString()} slots</div>
              <div className="mt-1 break-all mono-xs">{manifest.cacheKey}</div>
            </motion.div>
            <motion.div variants={STAGGER_ITEM} className="rounded-lg border border-rule bg-white px-3 py-2.5 card-hover">
              <div className="mono-xs uppercase text-text-faint">Paper surface</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary mono-sm">Gini / HHI / CV / LC</div>
              <div className="mt-1">{paperComparability.detail}</div>
            </motion.div>
          </motion.div>
        </details>
      </motion.div>

      <motion.div
        className="lab-stage p-5 mb-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.14 }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="lab-section-title">Overview bundles</div>
          <div className="mono-xs">
            {selectedOverviewBundleMetrics
              ? formatBytes(selectedOverviewBundleMetrics.bytes)
              : null}
          </div>
        </div>

        <motion.div className="flex flex-wrap gap-2 mb-4" variants={STAGGER_CONTAINER} initial="hidden" animate="visible">
          {overviewBundleOptions.map(option => (
            <motion.button variants={STAGGER_ITEM}
              key={option.bundle}
              onClick={() => startTransition(() => onSelectBundle(option.bundle))}
              title={option.description}
              className={cn(
                'lab-option-card rounded-xl px-3.5 py-2.5 text-left transition-all hover:border-border-hover hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]',
                selectedBundle === option.bundle
                  ? 'border-accent bg-gradient-to-b from-accent/[0.08] to-white/98 shadow-[0_4px_16px_rgba(37,99,235,0.1)]'
                  : '',
              )}
            >
              <div className="text-xs font-medium text-text-primary">{option.label}</div>
              {isManifestOverviewBundle(option) && (
                <div className="mt-0.5 mono-xs">{formatBytes(option.bytes)}</div>
              )}
            </motion.button>
          ))}
        </motion.div>

        {isOverviewLoading && overviewBlocks.length === 0 && (
          <div className="lab-skeleton lab-skeleton-block h-[320px]" />
        )}

        {!isOverviewLoading && overviewBlocks.length > 0 && (
          <BlockCanvas blocks={overviewFigureBlocks} showExport={false} />
        )}

        {!isOverviewLoading && overviewBlocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-rule bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
            No overview sidecar available for this bundle.
          </div>
        )}
      </motion.div>

      <motion.div
        className="lab-stage p-5 mb-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.18 }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="lab-section-title">
            Artifacts
            <span className="ml-2 mono-xs font-normal normal-case tracking-normal">{renderableArtifacts.length} renderable · {referenceArtifacts.length} reference</span>
          </div>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-3 xl:grid-cols-3"
          initial="hidden" animate="visible" variants={STAGGER_CONTAINER}
        >
          {renderableArtifacts.map(artifact => (
            <motion.button
              key={artifact.name}
              variants={STAGGER_ITEM}
              onClick={() => onSelectArtifact(artifact.name)}
              className={cn(
                'lab-option-card text-left rounded-[1rem] px-4 py-3 transition-all hover:border-border-hover',
                selectedArtifactName === artifact.name
                  ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98'
                  : '',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{artifact.label}</div>
                  <div className="text-xs text-muted mt-1 line-clamp-2">{artifact.description}</div>
                </div>
                <div className="text-11 text-muted whitespace-nowrap">
                  {artifact.kind}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3 text-11 text-muted">
                <span className="rounded-full border border-rule bg-white/88 px-2 py-0.5">
                  {artifact.lazy ? 'Lazy fetch' : 'Manifest-ready'}
                </span>
                <span>{formatBytes(artifact.bytes)}</span>
                {artifact.brotliBytes != null && <span>br {formatBytes(artifact.brotliBytes)}</span>}
                {artifact.gzipBytes != null && <span>gzip {formatBytes(artifact.gzipBytes)}</span>}
              </div>
            </motion.button>
          ))}
        </motion.div>

          {referenceArtifacts.length > 0 && (
            <details className="mt-4 rounded-xl border border-rule bg-white/78 px-4 py-3.5">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Reference artifacts</div>
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
                        <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 text-muted">
                          {artifact.kind}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">{artifact.description}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-11 text-muted sm:justify-end">
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
      </motion.div>

      <motion.div
        className="lab-stage p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.22 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="lab-section-title">
              {selectedArtifact?.label ?? 'Rendered artifact'}
            </div>
            {selectedArtifact?.description && (
              <div className="mt-1.5 text-xs text-muted max-w-2xl">{selectedArtifact.description}</div>
            )}
          </div>
          {selectedArtifact && (
            <span className="lab-chip bg-white/90" title={selectedArtifactFigureNote?.detail}>
              {selectedArtifact.kind}
            </span>
          )}
        </div>

        {((isArtifactFetching && !parsedBlocks.length) || isParsing) && (
          <div className="lab-skeleton lab-skeleton-block h-[320px] chart-skeleton-breathe" />
        )}

        {parseError && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {parseError}
          </div>
        )}

        <AnimatePresence mode="wait">
          {!isArtifactFetching && !isParsing && !parseError && parsedBlocks.length > 0 && (
            <motion.div
              key={selectedArtifactName ?? 'none'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={SPRING_CRISP}
            >
              <BlockCanvas blocks={renderedArtifactBlocks} showExport={false} />
            </motion.div>
          )}
        </AnimatePresence>

        {!isArtifactFetching && !isParsing && !parseError && parsedBlocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-rule bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
            Select an artifact above to render.
          </div>
        )}
      </motion.div>
    </>
  )
}
