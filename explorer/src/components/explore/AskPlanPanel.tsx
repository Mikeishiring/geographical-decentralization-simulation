import { motion } from 'framer-motion'
import { BarChart3, Compass, Database, FlaskConical, Sparkles } from 'lucide-react'
import type { AskPlanData } from '../../lib/ask-artifact'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'

interface AskPlanPanelProps {
  readonly plan: AskPlanData
  readonly compact?: boolean
}

function routeLabel(route: AskPlanData['route']): string {
  switch (route) {
    case 'orientation':
      return 'Orientation'
    case 'results':
      return 'Results replay'
    case 'structured-results':
      return 'Structured query'
    case 'simulation-config':
      return 'Experiment setup'
    case 'hybrid':
    default:
      return 'Hybrid route'
  }
}

function RouteIcon({ route, className }: { readonly route: AskPlanData['route']; readonly className?: string }) {
  switch (route) {
    case 'orientation':
      return <Compass className={className} />
    case 'results':
      return <BarChart3 className={className} />
    case 'structured-results':
      return <Database className={className} />
    case 'simulation-config':
      return <FlaskConical className={className} />
    case 'hybrid':
    default:
      return <Sparkles className={className} />
  }
}

function planStatusLabel(status: AskPlanData['status']): string {
  switch (status) {
    case 'active':
      return 'Live'
    case 'ready':
      return 'Ready'
    case 'planned':
    default:
      return 'Planned'
  }
}

function planStatusClass(status: AskPlanData['status']): string {
  switch (status) {
    case 'active':
      return 'border-accent/20 bg-accent/[0.05] text-accent'
    case 'ready':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'planned':
    default:
      return 'border-rule bg-surface-active text-text-faint'
  }
}

function querySurfaceLabel(surface: string | undefined): string {
  switch (surface) {
    case 'comparison-table':
      return 'Comparison'
    case 'parameter-sweep':
      return 'Sweep'
    case 'results-catalog':
      return 'Catalog'
    case 'leaderboard':
    default:
      return 'Leaderboard'
  }
}

export function AskPlanPanel({ plan, compact = false }: AskPlanPanelProps) {
  const visibleModules = compact ? plan.modules.slice(0, 3) : plan.modules
  const visibleTemplates = compact ? plan.templates.slice(0, 3) : plan.templates
  const visibleNextSteps = compact ? plan.nextSteps.slice(0, 2) : plan.nextSteps

  return (
    <div className="rounded-2xl border border-rule bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
            <RouteIcon route={plan.route} className="h-4 w-4 text-accent" />
            Live query plan
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {plan.title}
            </h3>
            <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-text-faint">
              {routeLabel(plan.route)}
            </span>
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-11 uppercase tracking-[0.08em]',
              planStatusClass(plan.status),
            )}>
              {planStatusLabel(plan.status)}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">
            {plan.rationale}
          </p>
          {plan.launch && (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-accent/15 bg-accent/[0.04] px-3 py-1.5 text-11 text-accent">
              <span className="font-medium uppercase tracking-[0.08em]">
                {plan.launch.source === 'workflow' ? 'Workflow launch' : 'Typed launch'}
              </span>
              <span className="truncate text-muted">
                {plan.launch.label}
              </span>
            </div>
          )}
          {plan.launch?.inputs?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.launch.inputs.map(input => (
                <span key={`${plan.launch?.workflowId ?? plan.launch?.label}-${input.id}`} className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 text-text-faint">
                  {input.label}: {input.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn('mt-4 grid gap-3', compact ? 'lg:grid-cols-[1.2fr_0.8fr]' : 'xl:grid-cols-[1.2fr_1fr_0.9fr]')}>
        <div className="rounded-xl border border-rule bg-surface-active/60 px-3.5 py-3">
          <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
            Active modules
          </div>
          {plan.queryView && (
            <div className="mt-2 rounded-xl border border-accent/15 bg-white px-3 py-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-medium text-text-primary">
                  {plan.queryView.title}
                </div>
                {plan.queryView.surface && (
                  <span className="rounded-full border border-accent/15 bg-accent/[0.04] px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-accent">
                    {querySurfaceLabel(plan.queryView.surface)}
                  </span>
                )}
              </div>
              <div className="mt-1 text-11 leading-5 text-muted">
                {plan.queryView.description}
              </div>
              {plan.queryView.bestFor?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.queryView.bestFor.slice(0, compact ? 2 : 3).map(item => (
                    <span key={`${plan.queryView?.id}-${item}`} className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 text-text-faint">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              {plan.queryRequest && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-rule bg-surface-active/70 px-2.5 py-2">
                    <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
                      Query shape
                    </div>
                    <div className="mt-1 text-11 leading-5 text-muted">
                      {plan.queryRequest.metrics.join(', ')} over {plan.queryRequest.dimensions.join(', ')}
                    </div>
                  </div>
                  <div className="rounded-lg border border-rule bg-surface-active/70 px-2.5 py-2">
                    <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
                      Execution
                    </div>
                    <div className="mt-1 text-11 leading-5 text-muted">
                      {plan.queryRequest.slot} snapshot
                      {plan.queryRequest.orderBy ? ` • ${plan.queryRequest.orderBy} ${plan.queryRequest.order}` : ''}
                      {` • top ${plan.queryRequest.limit}`}
                    </div>
                  </div>
                </div>
              )}
              {!compact && plan.queryView.executionHints?.length ? (
                <div className="mt-2 rounded-lg border border-accent/10 bg-accent/[0.03] px-2.5 py-2 text-11 leading-5 text-muted">
                  <span className="font-medium text-text-primary">Execution hint:</span>{' '}
                  {plan.queryView.executionHints[0]?.description}
                </div>
              ) : null}
              {plan.queryRequest?.notes.length ? (
                <div className="mt-2 space-y-1">
                  {plan.queryRequest.notes.slice(0, compact ? 1 : 2).map((note, index) => (
                    <div key={`${plan.queryView?.id}-note-${index}`} className="text-11 leading-5 text-muted">
                      {note}
                    </div>
                  ))}
                </div>
              ) : null}
              {!compact && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.queryView.allowedMetrics?.slice(0, 4).map(metric => (
                    <span key={`${plan.queryView?.id}-metric-${metric}`} className="rounded-full border border-accent/15 bg-accent/[0.04] px-2 py-0.5 text-11 text-accent">
                      {metric}
                    </span>
                  ))}
                  {plan.queryView.allowedDimensions?.slice(0, 3).map(dimension => (
                    <span key={`${plan.queryView?.id}-dimension-${dimension}`} className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 text-text-faint">
                      {dimension}
                    </span>
                  ))}
                </div>
              )}
              {!compact && plan.queryView.filters && (
                <div className="mt-2 text-11 leading-5 text-muted">
                  {plan.queryView.filters.evaluation?.length ? `Evaluations: ${plan.queryView.filters.evaluation.join(', ')}. ` : ''}
                  {plan.queryView.filters.paradigm?.length ? `Paradigms: ${plan.queryView.filters.paradigm.join(', ')}. ` : ''}
                  {plan.queryView.supportedSlots?.length ? `Snapshots: ${plan.queryView.supportedSlots.join(', ')}.` : ''}
                </div>
              )}
              {plan.queryRequest?.filters && (
                <div className="mt-2 text-11 leading-5 text-muted">
                  {plan.queryRequest.filters.evaluation ? `Filter: ${plan.queryRequest.filters.evaluation}` : ''}
                  {plan.queryRequest.filters.paradigm ? `${plan.queryRequest.filters.evaluation ? ' • ' : 'Filter: '}${plan.queryRequest.filters.paradigm}` : ''}
                  {plan.queryRequest.filters.result ? `${plan.queryRequest.filters.evaluation || plan.queryRequest.filters.paradigm ? ' • ' : 'Filter: '}${plan.queryRequest.filters.result}` : ''}
                </div>
              )}
              {!compact && plan.launch?.detail && (
                <div className="mt-2 text-11 leading-5 text-muted">
                  {plan.launch.detail}
                </div>
              )}
            </div>
          )}
          <div className={cn('mt-2 flex flex-wrap gap-2', plan.queryView ? 'pt-0' : '')}>
            {visibleModules.map(module => (
              <div
                key={module.id}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-11 font-medium shadow-sm',
                  module.state === 'selected'
                    ? 'border-accent/20 bg-white text-accent'
                    : 'border-rule bg-white/70 text-text-faint',
                )}
                title={module.detail}
              >
                {module.label}
              </div>
            ))}
          </div>
        </div>

        {visibleTemplates.length > 0 && (
          <div className="rounded-xl border border-rule bg-surface-active/60 px-3.5 py-3">
            <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
              Results families
            </div>
            <div className="mt-2 space-y-2">
              {visibleTemplates.map((template, index) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING, delay: index * 0.03 }}
                  className={cn(
                    'rounded-xl border px-3 py-2 shadow-sm',
                    template.state === 'loaded'
                      ? 'border-emerald-200 bg-white'
                      : 'border-rule bg-white/80',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">
                      {template.title}
                    </span>
                    <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-text-faint">
                      {template.pattern}
                    </span>
                  </div>
                  {!compact && (
                    <p className="mt-1 text-11 leading-5 text-muted">
                      {template.questionAnswered}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-rule bg-surface-active/60 px-3.5 py-3">
          <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
            Next
          </div>
          <div className="mt-2 space-y-2">
            {visibleNextSteps.map((step, index) => (
              <div key={`${plan.route}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-muted">
                <span className="mt-[0.35rem] h-1.5 w-1.5 rounded-full bg-accent" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
