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
      description="This exact run emits the same analytics contract as the frozen paper datasets, so you can read the exact evidence and only then decide what interpretation or note is warranted."
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
      queryHint="Use this desk in order: pick a stable dashboard, inspect one slot, then compare it against the closest frozen paper foil. Interpretation should follow the measurements, not lead them."
    >
      {exactAnalyticsPayload ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-accent/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92))] px-4 py-4 xl:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">How to read this desk</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              Treat the exact run like a publication artifact: evidence first, comparison second, takeaway last.
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                {
                  title: '1. Pick one stable read',
                  detail: 'Open a named dashboard so you stay in one analysis posture instead of hopping between metrics mid-claim.',
                },
                {
                  title: '2. Inspect a slot directly',
                  detail: 'Use the slot scrubber to bind the cards, sources, and comparisons to one moment in the run.',
                },
                {
                  title: '3. Compare before publishing',
                  detail: 'Add the closest paper foil, then decide whether the difference is strong enough to warrant a public note.',
                },
              ].map(item => (
                <div key={item.title} className="rounded-xl border border-white/70 bg-white/80 px-3 py-3">
                  <div className="text-sm font-medium text-text-primary">{item.title}</div>
                  <div className="mt-2 text-xs leading-5 text-muted">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Named dashboards</div>
            <div className="mt-2 text-xs leading-5 text-muted">
              These are reusable dashboard reads over the same exact-run payload, so you can move between stable analysis postures instead of rebuilding the query each time.
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                      'rounded-xl border px-3 py-3 transition-colors',
                      presetActive
                        ? 'border-accent bg-[#FAFAF8]'
                        : 'border-border-subtle bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted">{preset.note}</div>
                      </div>
                      {presetActive ? (
                        <span className="rounded-full bg-accent px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          onAnalyticsViewChange(preset.analyticsView)
                          onAnalyticsMetricChange(preset.analyticsMetric)
                          onAnalyticsCompareModeChange(preset.analyticsCompareMode)
                        }}
                        className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                      >
                        Open dashboard
                      </button>
                      <button
                        onClick={() => onCopyShareUrl(presetUrl)}
                        disabled={!presetUrl}
                        className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-white px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Slot posture</div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  Slot {slot + 1} of {totalSlots.toLocaleString()}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">
                  Scrub the exact run directly from the analytics desk. The cards, sources, and comparison table stay bound to this slot.
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
              className="mt-4 w-full accent-[var(--accent,#2563EB)]"
            />
            <div className="mt-3 text-xs leading-5 text-muted">
              {comparisonAnalyticsPayload
                ? `The published foil is aligned to the same progress point: slot ${comparisonSlot + 1} of ${comparisonTotalSlots.toLocaleString()}.`
                : 'Add a published foil to see the exact run against a frozen paper result at the same progress point.'}
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-white px-4 py-4 xl:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Published foil</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {selectedComparisonDataset ? formatPublishedDatasetLabel(selectedComparisonDataset) : 'No published scenario selected'}
            </div>
            <div className="mt-2 text-xs leading-5 text-muted">
              {selectedComparisonDataset?.metadata?.description ?? 'Choose a checked-in paper dataset so the exact run can be compared against frozen evidence in the same desk.'}
            </div>

            <label className="mt-4 block text-xs text-muted">
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

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-rule bg-white px-3 py-3">
                <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Recommendation</div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  {recommendedComparison ? formatPublishedDatasetLabel(recommendedComparison.dataset) : 'Awaiting catalog'}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted">{comparisonRecommendationDetail}</div>
              </div>
              <div className="rounded-xl border border-rule bg-white px-3 py-3">
                <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">Alignment</div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  {comparisonAnalyticsPayload
                    ? `Slot ${comparisonSlot + 1} / ${comparisonTotalSlots.toLocaleString()}`
                    : 'Waiting for foil'}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted">{comparisonStatusMessage}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
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

            <div className="mt-4 text-xs leading-5 text-muted">
              Shared exact-analytics links preserve the active foil dataset, analytics view, and slot posture.
            </div>
          </div>
        </div>
      ) : null}
    </SimulationAnalyticsDesk>
  )
}
