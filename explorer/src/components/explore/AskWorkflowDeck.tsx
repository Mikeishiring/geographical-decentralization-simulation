import { motion } from 'framer-motion'
import { BarChart3, Compass, Database, FlaskConical, Sparkles } from 'lucide-react'
import type { StudyAssistantMode, StudyAssistantRouteHint, StudyAssistantWorkflow } from '../../studies/types'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'

interface AskWorkflowDeckProps {
  readonly workflows: readonly StudyAssistantWorkflow[]
  readonly mode: Exclude<StudyAssistantMode, 'both'>
  readonly activeRoute?: StudyAssistantRouteHint | null
  readonly activePrompt?: string | null
  readonly onPromptSelect: (prompt: string) => void
  readonly busy?: boolean
}

function routeIcon(routeHint: StudyAssistantWorkflow['routeHint']) {
  switch (routeHint) {
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

function routeLabel(routeHint: StudyAssistantWorkflow['routeHint']): string {
  switch (routeHint) {
    case 'orientation':
      return 'Reading route'
    case 'results':
      return 'Results route'
    case 'structured-results':
      return 'Structured query'
    case 'simulation-config':
      return 'Experiment plan'
    case 'hybrid':
    default:
      return 'Hybrid route'
  }
}

function matchesMode(
  workflow: StudyAssistantWorkflow,
  mode: Exclude<StudyAssistantMode, 'both'>,
): boolean {
  return workflow.mode == null || workflow.mode === 'both' || workflow.mode === mode
}

function normalizePrompt(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function AskWorkflowDeck({
  workflows,
  mode,
  activeRoute,
  activePrompt,
  onPromptSelect,
  busy = false,
}: AskWorkflowDeckProps) {
  const visibleWorkflows = workflows.filter(workflow => matchesMode(workflow, mode))
  if (visibleWorkflows.length === 0) return null

  return (
    <div className="rounded-2xl border border-rule bg-white px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Workspace Flows
          </div>
          <h2 className="mt-1 text-base font-semibold text-text-primary">
            Start from a concrete research action
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            These are study-owned workflows, not generic prompt chips. Each one starts the assistant on a bounded surface with a clearer output shape.
          </p>
        </div>
        <div className="rounded-full border border-rule bg-surface-active px-3 py-1.5 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
          {visibleWorkflows.length} launchable flows
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3 md:grid-cols-2">
        {visibleWorkflows.map((workflow, index) => {
          const Icon = routeIcon(workflow.routeHint)
          const isPromptActive = normalizePrompt(activePrompt) === normalizePrompt(workflow.prompt)
          const isRouteActive = !isPromptActive && workflow.routeHint != null && workflow.routeHint === activeRoute
          const isActive = isPromptActive || isRouteActive

          return (
            <motion.div
              key={workflow.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: index * 0.03 }}
              className={cn(
                'rounded-2xl border px-4 py-4 shadow-sm transition-colors',
                isActive
                  ? 'border-accent/25 bg-accent/[0.04]'
                  : 'border-rule bg-surface-active/60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rule bg-white text-text-primary shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {workflow.badge && (
                    <span className="rounded-full border border-accent/15 bg-white px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-accent">
                      {workflow.badge}
                    </span>
                  )}
                  <span className="rounded-full border border-rule bg-white px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-text-faint">
                    {routeLabel(workflow.routeHint)}
                  </span>
                </div>
              </div>

              <div className="mt-3 text-sm font-medium text-text-primary">
                {workflow.title}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                {workflow.description}
              </p>

              {workflow.outputs?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {workflow.outputs.slice(0, 3).map(output => (
                    <span key={`${workflow.id}-${output}`} className="rounded-full border border-rule bg-white px-2 py-0.5 text-11 text-text-faint">
                      {output}
                    </span>
                  ))}
                </div>
              ) : null}

              {workflow.bestFor?.length ? (
                <div className="mt-3 rounded-xl border border-rule bg-white/90 px-3 py-2 text-11 leading-5 text-muted">
                  <span className="font-medium text-text-primary">Best for:</span>{' '}
                  {workflow.bestFor.slice(0, 2).join(' • ')}
                </div>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => onPromptSelect(workflow.prompt)}
                className={cn(
                  'mt-3 rounded-full border px-3 py-1.5 text-11 font-medium transition-colors',
                  busy
                    ? 'cursor-not-allowed border-rule bg-white/60 text-muted'
                    : isActive
                      ? 'border-accent/25 bg-white text-accent hover:border-accent/35'
                      : 'border-accent/20 bg-white text-accent hover:border-accent/30 hover:bg-accent/[0.04]',
                )}
              >
                {mode === 'experiment' ? 'Use this run plan' : 'Launch workflow'}
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
