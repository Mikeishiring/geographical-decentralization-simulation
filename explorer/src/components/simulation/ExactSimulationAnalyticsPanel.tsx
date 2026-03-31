import { cn } from '../../lib/cn'
import type { SurfaceMode } from './simulation-lab-types'
import { ANALYTICS_VIEW_OPTIONS, type AnalyticsCompareMode, type AnalyticsDeckView, type AnalyticsQueryMetric } from './simulation-analytics'
import { buildSimulationLabUrl, formatPublishedDatasetLabel } from './simulation-lab-comparison'
import { SimulationAnalyticsDesk } from './SimulationAnalyticsDesk'
import { useExactSimulationAnalytics } from './useExactSimulationAnalytics'

interface ExactSimulationAnalyticsPanelProps {
  readonly surfaceMode: SurfaceMode
  readonly currentJobId: string | null
  readonly analyticsView: AnalyticsDeckView
  readonly analyticsMetric: AnalyticsQueryMetric
  readonly analyticsCompareMode: AnalyticsCompareMode
  readonly analyticsRequestedSlot: number | null
  readonly comparisonPath: string | null
  readonly analytics: ReturnType<typeof useExactSimulationAnalytics>
  readonly onAnalyticsViewChange: (view: AnalyticsDeckView) => void
  readonly onAnalyticsMetricChange: (metric: AnalyticsQueryMetric) => void
  readonly onAnalyticsCompareModeChange: (mode: AnalyticsCompareMode) => void
  readonly onAnalyticsRequestedSlotChange: (slot: number | null) => void
  readonly onComparisonPathChange: (path: string | null) => void
  readonly onCopyShareUrl: (targetUrl?: string | null) => void
  readonly onCopyQueryJson: () => void
  readonly onDownloadExport: (format: 'json' | 'csv') => void
}

export function ExactSimulationAnalyticsPanel({
  surfaceMode,
  currentJobId,
  analyticsView,
  analyticsMetric,
  analyticsCompareMode,
  analyticsRequestedSlot,
  comparisonPath,
  analytics,
  onAnalyticsViewChange,
  onAnalyticsMetricChange,
  onAnalyticsCompareModeChange,
  onAnalyticsRequestedSlotChange,
  onComparisonPathChange,
  onCopyShareUrl,
  onCopyQueryJson,
  onDownloadExport,
}: ExactSimulationAnalyticsPanelProps) {
  const {
    analyticsStatusMessage,
    blocks,
    compareModeOptions,
    comparisonAnalyticsPayload,
    comparisonCandidates,
    comparisonDatasetUrl,
    comparisonRecommendationDetail,
    comparisonSlot,
    comparisonStatusMessage,
    comparisonTotalSlots,
    dashboardPresets,
    exactAnalyticsPayload,
    metricCards,
    metricOptions,
    recommendedComparison,
    selectedComparisonDataset,
    slot,
    totalSlots,
  } = analytics

  return (
    <SimulationAnalyticsDesk
      description="Exact-run analytics — same contract as the frozen paper datasets."
      copyLabel="Copy exact analytics view"
      onCopyShareUrl={() => onCopyShareUrl()}
      onCopyQueryJson={() => onCopyQueryJson()}
      onDownloadQueryJson={() => onDownloadExport('json')}
      onDownloadQueryCsv={() => onDownloadExport('csv')}
      analyticsView={analyticsView}
      onAnalyticsViewChange={onAnalyticsViewChange}
      analyticsViewOptions={ANALYTICS_VIEW_OPTIONS}
      analyticsMetric={analyticsMetric}
      onAnalyticsMetricChange={onAnalyticsMetricChange}
      analyticsMetricOptions={metricOptions}
      compareMode={analyticsCompareMode}
      onCompareModeChange={onAnalyticsCompareModeChange}
      compareModeOptions={compareModeOptions}
      statusMessage={analyticsStatusMessage}
      metricCards={metricCards}
      blocks={blocks}
    >
      {exactAnalyticsPayload ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-rule bg-white px-4 py-3">
            <div
              className="text-2xs uppercase tracking-[0.1em] text-text-faint"
              title="Reusable dashboard reads over the same exact-run payload."
            >
              Named dashboards
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {dashboardPresets.map(preset => {
                const presetUrl = buildSimulationLabUrl({
                  surfaceMode,
                  currentJobId,
                  analyticsView: preset.analyticsView,
                  analyticsMetric: preset.analyticsMetric,
                  analyticsCompareMode: preset.analyticsCompareMode,
                  analyticsSlot: analyticsRequestedSlot == null ? null : slot,
                  comparisonPath: selectedComparisonDataset?.path ?? comparisonPath,
                })
                const presetActive = analyticsView === preset.analyticsView
                  && analyticsMetric === preset.analyticsMetric
                  && analyticsCompareMode === preset.analyticsCompareMode

                return (
                  <div
                    key={preset.id}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 transition-colors',
                      presetActive
                        ? 'border-accent bg-surface-active'
                        : 'border-rule bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted">{preset.note}</div>
                      </div>
                      {presetActive ? (
                        <span className="rounded-full bg-accent px-2 py-1 text-2xs font-medium uppercase tracking-[0.1em] text-white">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          onAnalyticsViewChange(preset.analyticsView)
                          onAnalyticsMetricChange(preset.analyticsMetric)
                          onAnalyticsCompareModeChange(preset.analyticsCompareMode)
                        }}
                        className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                      >
                        Open dashboard
                      </button>
                      <button
                        onClick={() => onCopyShareUrl(presetUrl)}
                        disabled={!presetUrl}
                        className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-white px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div
                  className="text-2xs uppercase tracking-[0.1em] text-text-faint"
                  title="Cards and comparisons stay bound to the selected slot."
                >
                  Slot posture
                </div>
                <div className="mt-1 text-sm font-medium text-text-primary" title={`Viewing metrics at consensus round ${slot + 1} of ${totalSlots.toLocaleString()} total`}>
                  Slot {slot + 1} of {totalSlots.toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'First', slot: 0 },
                  { label: 'Mid', slot: Math.max(0, Math.floor((totalSlots - 1) / 2)) },
                  { label: 'Final', slot: Math.max(0, totalSlots - 1) },
                ].map(option => (
                  <button
                    key={option.label}
                    onClick={() => onAnalyticsRequestedSlotChange(option.slot)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      slot === option.slot
                        ? 'border-accent bg-surface-active text-accent'
                        : 'border-rule bg-white text-text-primary hover:border-border-hover',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalSlots - 1)}
              step={1}
              value={slot}
              onChange={event => onAnalyticsRequestedSlotChange(Number.parseInt(event.target.value, 10))}
              className="mt-3 w-full accent-[var(--accent,#2563EB)]"
            />
            <div className="mt-2 text-xs leading-5 text-muted">
              {comparisonAnalyticsPayload
                ? `The published foil is aligned to the same progress point: slot ${comparisonSlot + 1} of ${comparisonTotalSlots.toLocaleString()}.`
                : 'Add a published foil to see the exact run against a frozen paper result at the same progress point.'}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-white px-4 py-3 xl:col-span-2">
            <div
              className="text-2xs uppercase tracking-[0.1em] text-text-faint"
              title="Compare against a checked-in paper dataset in the same desk."
            >
              Published foil
            </div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              {selectedComparisonDataset ? formatPublishedDatasetLabel(selectedComparisonDataset) : 'No published scenario selected'}
            </div>

            <label className="mt-3 block text-xs text-muted">
              Compare against
            </label>
            <select
              value={selectedComparisonDataset?.path ?? ''}
              onChange={event => {
                onComparisonPathChange(event.target.value || null)
              }}
              disabled={comparisonCandidates.length === 0}
              className="mt-1.5 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {comparisonCandidates.length > 0 ? (
                comparisonCandidates.map(dataset => (
                  <option key={dataset.path} value={dataset.path}>
                    {formatPublishedDatasetLabel(dataset)}
                  </option>
                ))
              ) : (
                <option value="">Published catalog unavailable</option>
              )}
            </select>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-rule bg-white px-3 py-2.5">
                <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Recommendation</div>
                <div className="mt-1 text-sm font-medium text-text-primary">
                  {recommendedComparison ? formatPublishedDatasetLabel(recommendedComparison.dataset) : 'Awaiting catalog'}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">{comparisonRecommendationDetail}</div>
              </div>
              <div className="rounded-xl border border-rule bg-white px-3 py-2.5">
                <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Alignment</div>
                <div className="mt-1 text-sm font-medium text-text-primary">
                  {comparisonAnalyticsPayload
                    ? `Slot ${comparisonSlot + 1} / ${comparisonTotalSlots.toLocaleString()}`
                    : 'Waiting for foil'}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">{comparisonStatusMessage}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={comparisonDatasetUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex items-center justify-center rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover',
                  !comparisonDatasetUrl && 'pointer-events-none opacity-60',
                )}
              >
                Open dataset JSON
              </a>
              <button
                onClick={() => {
                  onComparisonPathChange(recommendedComparison?.dataset.path ?? null)
                }}
                disabled={!recommendedComparison}
                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                Restore recommendation
              </button>
            </div>

          </div>
        </div>
      ) : null}
    </SimulationAnalyticsDesk>
  )
}
