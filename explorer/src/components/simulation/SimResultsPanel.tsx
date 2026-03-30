import { startTransition, useEffect, useState } from 'react'
import { ArrowUpRight, Check, Copy, Download } from 'lucide-react'
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
    <div className="lab-stage p-5 mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs text-muted mb-1">Interactive chart deck</div>
          <div className="text-sm text-text-primary">
            Six emitted exact series, styled as one reading surface instead of a one-artifact-at-a-time browser.
          </div>
        </div>
        <div className="text-xs text-muted">
          Hover a card to preview it, click to pin it, then inspect the full raw slot curve below.
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
          <div className="overflow-hidden rounded-[1.4rem] border border-border-subtle bg-[radial-gradient(circle_at_12%_0%,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_100%_10%,rgba(194,85,58,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,243,239,0.92))] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Focused measurement</div>
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
                    className="rounded-2xl border border-border-subtle bg-white/88 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
                  >
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{metric.label}</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                      {metric.value == null ? '—' : formatExactChartValue(metric.value)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">{focusedVisual.unit}</div>
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
                    'group relative overflow-hidden rounded-[1.25rem] border px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border-hover',
                    isFocused
                      ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(255,255,255,0.98))] shadow-[0_16px_36px_rgba(37,99,235,0.12)]'
                      : 'border-border-subtle bg-white/92',
                  )}
                  style={{ boxShadow: isFocused ? `0 18px 40px ${visual?.glow ?? 'rgba(37,99,235,0.12)'}` : undefined }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
                        {isPinned ? 'Pinned chart' : isFocused ? 'Previewing now' : 'Hover to preview'}
                      </div>
                      <div className="mt-2 text-sm font-medium text-text-primary">{visual?.title ?? entry.label}</div>
                      <div className="mt-1 text-xs leading-5 text-muted line-clamp-2">{entry.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Latest</div>
                      <div className="mt-2 text-sm font-semibold tabular-nums text-text-primary">
                        {formatExactChartValue(latest)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-border-subtle bg-[linear-gradient(180deg,rgba(250,250,248,1),rgba(244,243,239,0.92))] px-3 py-3">
                    <svg viewBox="0 0 220 72" className="w-full" preserveAspectRatio="none">
                      <path d={sparkline} fill="none" stroke={visual?.color ?? '#2563EB'} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    {[
                      { label: 'Start', value: start },
                      { label: 'Peak', value: peak },
                      { label: 'Delta', value: delta },
                    ].map(metric => (
                      <div key={metric.label} className="rounded-lg border border-border-subtle bg-white/82 px-2.5 py-2">
                        <div className="uppercase tracking-[0.12em] text-text-faint">{metric.label}</div>
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
      )}

      {!loading && series.length === 0 && (
        <div className="mt-4 rounded-[1.15rem] border border-dashed border-border-subtle bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
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
      <div className="lab-stage-hero p-6 mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="lab-section-title">Exact Result Surface</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-[1.9rem]">
              The manifest landed. This view stays literal to what the exact run emitted.
            </div>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              The explorer now upgrades itself into the results shell using the current manifest, overview bundles,
              and renderable artifacts. No paper metrics are inferred unless the exact output explicitly exports them.
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {paperScenarioLabels(manifest.config).map(label => (
                <span key={label} className="lab-chip bg-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Execution mode</div>
              <div className="mt-2 text-sm font-medium text-text-primary">
                {manifest.cacheHit ? 'Exact cache hit' : 'Fresh exact execution'}
              </div>
              <div className="mt-1 text-xs text-muted">{formatNumber(manifest.runtimeSeconds, 2)}s runtime</div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Scenario</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{describeParadigmWithAlias(manifest.config.paradigm)}</div>
              <div className="mt-1 text-xs text-muted">{manifest.config.validators.toLocaleString()} validators · {manifest.config.slots.toLocaleString()} slots</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5 xl:grid-cols-6">
          {exactMetricCards.map(card => (
            <div key={card.key} className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{card.label}</div>
              <div className="mt-2 text-xl font-semibold text-text-primary tabular-nums">
                {card.value}
              </div>
              {card.suffix && (
                <div className="mt-1 text-xs text-muted">{card.suffix}</div>
              )}
              {card.note && (
                <div className="mt-2 text-[11px] leading-5 text-muted">{card.note}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 mb-6 md:grid-cols-3">
        <div className="lab-lens-card px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Reading mode</div>
          <div className="mt-2 text-sm font-medium text-text-primary">Live exact experiment</div>
          <div className="mt-1 text-xs leading-5 text-muted">
            This view is assembled from the current manifest and emitted artifact sidecars for one exact run.
          </div>
        </div>
        <div className="lab-lens-card px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Chart integrity</div>
          <div className="mt-2 text-sm font-medium text-text-primary">Raw slot ordering preserved</div>
          <div className="mt-1 text-xs leading-5 text-muted">
            Hover, preview, and pinning only change the reading posture. They do not smooth or reinterpret the emitted series.
          </div>
        </div>
        <div className="lab-lens-card px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Comparability</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{paperComparability.title}</div>
          <div className="mt-1 text-xs leading-5 text-muted">{paperComparability.detail}</div>
        </div>
      </div>

      <ExactChartDeck
        series={exactChartSeries}
        loading={isExactChartDeckLoading}
      />

      <div className="lab-stage p-5 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs text-muted mb-1">
              Exact metadata and provenance
            </div>
            <div className="text-sm text-text-primary">
              {manifest.cacheHit ? 'Exact cache hit' : 'Fresh exact execution'}
            </div>
            <div className="text-xs text-muted mt-1 max-w-2xl">
              {manifest.cacheHit
                ? 'Reused an identical exact run from the shared exact cache. Outputs are unchanged for the same inputs.'
                : 'Executed the canonical exact simulator with the current configuration and seed.'}
            </div>
            <div className="mt-3">
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium',
                  paperComparability.tone === 'canonical' && 'border-success/30 bg-success/8 text-text-primary',
                  paperComparability.tone === 'editorial' && 'border-warning/30 bg-warning/8 text-text-primary',
                  paperComparability.tone === 'experimental' && 'border-border-subtle bg-white text-text-primary',
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
              <div className="mt-1 max-w-2xl text-xs text-muted">
                {paperComparability.detail}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
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
                  ? 'cursor-wait border-border-subtle bg-surface-active text-muted'
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
              className="lab-option-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
            >
              Published demo
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>

        {exportError && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {exportError}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Research integrity</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{paperComparability.title}</div>
          <div className="mt-1 text-sm text-muted">{paperComparability.detail}</div>
          <div className="mt-2 text-xs text-muted">
            Truth boundary: this panel only reports values emitted by the exact manifest and derived artifact sidecars. It should not stand in for a published paper result unless the configuration is directly comparable.
          </div>
        </div>

        <div className="grid gap-3 mt-4 text-xs text-muted sm:grid-cols-2 xl:grid-cols-4">
          <div className="lab-metric-card">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Configuration</div>
            <div className="mt-2 text-sm font-medium text-text-primary">{describeParadigmWithAlias(manifest.config.paradigm)} exact mode</div>
            <div className="mt-1 text-xs text-muted">{describeDistribution(manifest.config.distribution)}</div>
            <div className="mt-1 text-xs text-muted">{describeSourcePlacement(manifest.config.sourcePlacement)}</div>
          </div>
          <div className="lab-metric-card">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Consensus timing</div>
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
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Run identity</div>
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
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Paper metric availability</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              Published surface: Gini_g / HHI_g / CV_g / LC_g
            </div>
            <div className="mt-1 text-xs text-muted">
              Live exact manifest currently emits MEV, supermajority, failed proposals, utility increase, and renderable artifacts. Paper metrics should move here only when the exact manifest exports them directly.
            </div>
          </div>
        </div>
      </div>

      <div className="lab-stage p-5 mb-6">
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
                'lab-option-card rounded-xl px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover',
                selectedBundle === option.bundle
                  ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))]'
                  : '',
              )}
            >
              <div className="text-xs font-medium text-text-primary">{option.label}</div>
              <div className="text-xs text-muted">{option.description}</div>
              {isManifestOverviewBundle(option) && (
                <div className="mt-1 text-[11px] text-text-faint">
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
            <div className="space-y-3 rounded-[1.15rem] border border-border-subtle bg-white/80 p-4">
              <div className="lab-skeleton lab-skeleton-line w-1/3" />
              <div className="lab-skeleton lab-skeleton-line w-full" />
              <div className="lab-skeleton lab-skeleton-line w-4/5" />
              <div className="lab-skeleton lab-skeleton-block h-[88px]" />
              <div className="lab-skeleton lab-skeleton-block h-[88px]" />
            </div>
          </div>
        )}

        {!isOverviewLoading && overviewBlocks.length > 0 && (
          <BlockCanvas blocks={overviewBlocks} />
        )}

        {!isOverviewLoading && overviewBlocks.length === 0 && (
          <div className="rounded-[1.15rem] border border-dashed border-border-subtle bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
            This exact run does not have a ready overview sidecar for the selected bundle yet.
          </div>
        )}
      </div>

      <div className="lab-stage p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs text-muted mb-1">
              Artifact manifest
            </div>
            <div className="text-sm text-text-primary">
              Exact artifact labels and descriptions emitted for this run.
            </div>
          </div>
          <div className="text-xs text-muted text-right">
            {manifest.cacheHit ? 'Served from exact cache' : 'Fresh exact run'}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {manifest.artifacts.map(artifact => (
            <button
              key={artifact.name}
              onClick={() => onSelectArtifact(artifact.name)}
              disabled={!artifact.renderable}
              className={cn(
                'lab-option-card text-left rounded-[1rem] px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-border-hover',
                selectedArtifactName === artifact.name
                  ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))]'
                  : '',
                !artifact.renderable && 'opacity-60 cursor-not-allowed',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{artifact.label}</div>
                  <div className="text-xs text-muted mt-1">{artifact.description}</div>
                </div>
                <div className="text-xs text-muted whitespace-nowrap">
                  {artifact.lazy ? 'lazy' : 'ready'}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-3 text-xs text-muted">
                <span>{formatBytes(artifact.bytes)}</span>
                {artifact.brotliBytes != null && <span>br {formatBytes(artifact.brotliBytes)}</span>}
                {artifact.gzipBytes != null && <span>gzip {formatBytes(artifact.gzipBytes)}</span>}
                <span>{artifact.kind}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="lab-stage p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
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
          </div>
          {selectedArtifact && (
            <div className="text-xs text-muted">
              {selectedArtifact.kind} · {selectedArtifact.lazy ? 'lazy-loaded' : 'manifest-ready'}
            </div>
          )}
        </div>

        {((isArtifactFetching && !parsedBlocks.length) || isParsing) && (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="lab-skeleton lab-skeleton-block h-[320px]" />
            <div className="space-y-3 rounded-[1.15rem] border border-border-subtle bg-white/80 p-4">
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

        {!isArtifactFetching && !isParsing && !parseError && parsedBlocks.length > 0 && (
          <BlockCanvas blocks={parsedBlocks} />
        )}

        {!isArtifactFetching && !isParsing && !parseError && parsedBlocks.length === 0 && (
          <div className="rounded-[1.15rem] border border-dashed border-border-subtle bg-surface-active/70 px-5 py-12 text-center text-sm text-muted">
            Pick a renderable artifact to inspect the exact run.
          </div>
        )}
      </div>
    </>
  )
}
