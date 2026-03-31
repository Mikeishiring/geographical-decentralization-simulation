import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BlockCanvas } from '../explore/BlockCanvas'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import type { Block } from '../../types/blocks'
import type {
  AnalyticsCompareMode,
  AnalyticsCompareModeOption,
  AnalyticsDeckView,
  AnalyticsMetricCard,
  AnalyticsQueryMetric,
  AnalyticsQueryOption,
  AnalyticsViewOption,
} from './simulation-analytics'

interface SimulationAnalyticsDeskProps {
  readonly title?: string
  readonly description: string
  readonly copyLabel?: string
  readonly onCopyShareUrl?: () => void
  readonly onCopyQueryJson?: () => void
  readonly onDownloadQueryJson?: () => void
  readonly onDownloadQueryCsv?: () => void
  readonly analyticsView: AnalyticsDeckView
  readonly onAnalyticsViewChange: (view: AnalyticsDeckView) => void
  readonly analyticsViewOptions: readonly AnalyticsViewOption[]
  readonly analyticsMetric: AnalyticsQueryMetric
  readonly onAnalyticsMetricChange: (metric: AnalyticsQueryMetric) => void
  readonly analyticsMetricOptions: readonly AnalyticsQueryOption[]
  readonly compareMode: AnalyticsCompareMode
  readonly onCompareModeChange: (mode: AnalyticsCompareMode) => void
  readonly compareModeOptions: readonly AnalyticsCompareModeOption[]
  readonly statusMessage: string | null
  readonly metricCards: readonly AnalyticsMetricCard[]
  readonly blocks: readonly Block[]
  readonly children?: ReactNode
}

export function SimulationAnalyticsDesk({
  title = 'Analytics desk',
  description,
  copyLabel = 'Copy analytics view',
  onCopyShareUrl,
  onCopyQueryJson,
  onDownloadQueryJson,
  onDownloadQueryCsv,
  analyticsView,
  onAnalyticsViewChange,
  analyticsViewOptions,
  analyticsMetric,
  onAnalyticsMetricChange,
  analyticsMetricOptions,
  compareMode,
  onCompareModeChange,
  compareModeOptions,
  statusMessage,
  metricCards,
  blocks,
  children,
}: SimulationAnalyticsDeskProps) {
  const activeView = analyticsViewOptions.find(view => view.id === analyticsView) ?? analyticsViewOptions[0]
  const activeMetric = analyticsMetricOptions.find(option => option.id === analyticsMetric) ?? analyticsMetricOptions[0]
  const activeCompareMode = compareModeOptions.find(option => option.id === compareMode) ?? compareModeOptions[0]

  return (
    <motion.div
      className="lab-stage overflow-hidden p-0"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <motion.div
        className="flex flex-col gap-4 border-b border-rule px-5 py-5 lg:flex-row lg:items-start lg:justify-between"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...SPRING_CRISP, delay: 0.04 }}
      >
        <div>
          <div className="text-xs text-muted mb-1">{title}</div>
          <div className="text-sm text-text-primary">{description}</div>
        </div>
        {onCopyShareUrl || onCopyQueryJson || onDownloadQueryJson || onDownloadQueryCsv ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {onCopyShareUrl ? (
              <button
                onClick={onCopyShareUrl}
                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                {copyLabel}
              </button>
            ) : null}
            {onCopyQueryJson ? (
              <button
                onClick={onCopyQueryJson}
                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                Copy query JSON
              </button>
            ) : null}
            {onDownloadQueryJson ? (
              <button
                onClick={onDownloadQueryJson}
                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                Download JSON
              </button>
            ) : null}
            {onDownloadQueryCsv ? (
              <button
                onClick={onDownloadQueryCsv}
                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                Download CSV
              </button>
            ) : null}
          </div>
        ) : null}
      </motion.div>

      <motion.div
        className="grid gap-3 border-b border-rule px-5 py-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={STAGGER_ITEM} className="rounded-xl border border-rule bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4">
          <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Dashboard view</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {analyticsViewOptions.map(view => (
              <button
                key={view.id}
                onClick={() => onAnalyticsViewChange(view.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  analyticsView === view.id
                    ? 'border-accent bg-white text-accent'
                    : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
              >
                {view.label}
              </button>
            ))}
          </div>
        </motion.div>

        {analyticsMetricOptions.length > 0 ? (
          <motion.div variants={STAGGER_ITEM} className="rounded-xl border border-rule bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4">
            <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Metric query</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {analyticsMetricOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => onAnalyticsMetricChange(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    analyticsMetric === option.id
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                  )}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : <div />}

        {compareModeOptions.length > 0 ? (
          <motion.div variants={STAGGER_ITEM} className="rounded-xl border border-rule bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4">
            <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Compare mode</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {compareModeOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => onCompareModeChange(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    compareMode === option.id
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                  )}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </motion.div>

      <motion.div
        className="px-5 py-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_CRISP, delay: 0.1 }}
      >
      <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-text-primary">
            {activeMetric?.label ?? activeView?.label ?? 'Analytics'}
          </div>
          {activeCompareMode ? (
            <span
              className="lab-chip bg-white/85 text-2xs"
              title={activeCompareMode.description}
            >
              {activeCompareMode.label}
            </span>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
          {statusMessage}
        </div>
      ) : null}

      {!statusMessage ? children : null}

      {!statusMessage && metricCards.length > 0 ? (
        <motion.div
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="show"
        >
          {metricCards.map(card => (
            <motion.div key={card.label} variants={STAGGER_ITEM} className="rounded-xl border border-rule bg-white px-4 py-4">
              <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{card.value}</div>
              <div className="mt-2 text-xs leading-5 text-muted">{card.detail}</div>
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {!statusMessage && blocks.length > 0 ? (
        <div className="mt-4">
          <BlockCanvas blocks={blocks} showExport={false} />
        </div>
      ) : null}
      </motion.div>
    </motion.div>
  )
}
