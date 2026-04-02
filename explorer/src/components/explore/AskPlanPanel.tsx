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

function routeIcon(route: AskPlanData['route']) {
  switch (route) {
    case 'orientation':
      return Compass
    case 'results':
      return BarChart3
    case 'structured-results':
      return Database
    case 'simulation-config':
      return FlaskConical
    case 'hybrid':
    default:
      return Sparkles
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

export function AskPlanPanel({ plan, compact = false }: AskPlanPanelProps) {
  const Icon = routeIcon(plan.route)
  const visibleModules = compact ? plan.modules.slice(0, 3) : plan.modules
  const visibleTemplates = compact ? plan.templates.slice(0, 3) : plan.templates
  const visibleNextSteps = compact ? plan.nextSteps.slice(0, 2) : plan.nextSteps

  return (
    <div className="rounded-2xl border border-rule bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
            <Icon className="h-4 w-4 text-accent" />
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
        </div>
      </div>

      <div className={cn('mt-4 grid gap-3', compact ? 'lg:grid-cols-[1.2fr_0.8fr]' : 'xl:grid-cols-[1.2fr_1fr_0.9fr]')}>
        <div className="rounded-xl border border-rule bg-surface-active/60 px-3.5 py-3">
          <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
            Active modules
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
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
