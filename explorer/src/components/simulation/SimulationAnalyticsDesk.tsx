import type { ReactNode } from 'react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { cn } from '../../lib/cn'
import type { Block } from '../../types/blocks'
import type {
  AnalyticsDeckView,
  AnalyticsMetricCard,
  AnalyticsViewOption,
} from './simulation-analytics'

interface SimulationAnalyticsDeskProps {
  readonly title?: string
  readonly description: string
  readonly copyLabel?: string
  readonly onCopyShareUrl?: () => void
  readonly analyticsView: AnalyticsDeckView
  readonly onAnalyticsViewChange: (view: AnalyticsDeckView) => void
  readonly analyticsViewOptions: readonly AnalyticsViewOption[]
  readonly statusMessage: string | null
  readonly metricCards: readonly AnalyticsMetricCard[]
  readonly blocks: readonly Block[]
  readonly queryHint?: string
  readonly children?: ReactNode
}

export function SimulationAnalyticsDesk({
  title = 'Analytics desk',
  description,
  copyLabel = 'Copy analytics view',
  onCopyShareUrl,
  analyticsView,
  onAnalyticsViewChange,
  analyticsViewOptions,
  statusMessage,
  metricCards,
  blocks,
  queryHint = 'Use the query to establish what the data shows first. Only then ask for implications or interpretation.',
  children,
}: SimulationAnalyticsDeskProps) {
  const activeView = analyticsViewOptions.find(view => view.id === analyticsView) ?? analyticsViewOptions[0]

  return (
    <div className="lab-stage p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs text-muted mb-1">{title}</div>
          <div className="text-sm text-text-primary">{description}</div>
        </div>
        {onCopyShareUrl ? (
          <button
            onClick={onCopyShareUrl}
            className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
          >
            {copyLabel}
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Query framing</div>
        <div className="mt-2 text-sm font-medium text-text-primary">
          {activeView?.label ?? 'Analytics'} query
        </div>
        <div className="mt-2 text-xs leading-5 text-muted">
          {activeView?.description ?? 'Exact metric query over the current analytics payload.'}
        </div>
        <div className="mt-3 text-[11px] leading-5 text-text-faint">{queryHint}</div>
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
          {statusMessage}
        </div>
      ) : null}

      {!statusMessage ? children : null}

      {!statusMessage && metricCards.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map(card => (
            <div key={card.label} className="rounded-xl border border-rule bg-white px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{card.label}</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{card.value}</div>
              <div className="mt-2 text-xs leading-5 text-muted">{card.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      {!statusMessage && blocks.length > 0 ? (
        <div className="mt-4">
          <BlockCanvas blocks={blocks} showExport={false} />
        </div>
      ) : null}
    </div>
  )
}
