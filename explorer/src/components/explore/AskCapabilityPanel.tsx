import { BarChart3, Database, FlaskConical, MessageSquareText, Sparkles } from 'lucide-react'
import type {
  StudyAssistantCapability,
  StudyAssistantPromptTip,
  StudyAssistantQueryView,
} from '../../studies/types'
import { cn } from '../../lib/cn'

interface AskCapabilityPanelProps {
  readonly capabilities: readonly StudyAssistantCapability[]
  readonly promptTips: readonly StudyAssistantPromptTip[]
  readonly queryViews?: readonly StudyAssistantQueryView[]
  readonly onPromptSelect: (prompt: string) => void
  readonly busy?: boolean
}

function capabilityIcon(index: number) {
  return [MessageSquareText, BarChart3, FlaskConical, Database, Sparkles][index % 5]!
}

function capabilityStateLabel(state: StudyAssistantCapability['state']): string {
  switch (state) {
    case 'exact':
      return 'Exact'
    case 'guided':
      return 'Guided'
    case 'planned':
      return 'Planned'
    case 'live':
    default:
      return 'Live'
  }
}

function capabilityStateClass(state: StudyAssistantCapability['state']): string {
  switch (state) {
    case 'exact':
      return 'border-accent/20 bg-accent/[0.05] text-accent'
    case 'guided':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'planned':
      return 'border-rule bg-surface-active text-muted'
    case 'live':
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
}

export function AskCapabilityPanel({
  capabilities,
  promptTips,
  queryViews = [],
  onPromptSelect,
  busy = false,
}: AskCapabilityPanelProps) {
  if (capabilities.length === 0 && promptTips.length === 0 && queryViews.length === 0) return null

  return (
    <div className="rounded-2xl border border-rule bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Assistant Surface
          </div>
          <h2 className="mt-1 text-base font-semibold text-text-primary">
            What this workspace can do
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Each paper can expose a different mix of explanation, Results replay, experiment loops, and structured analysis.
          </p>
        </div>
        <div className="rounded-full border border-rule bg-surface-active px-3 py-1.5 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
          {capabilities.filter(capability => capability.state !== 'planned').length + queryViews.length} active modules
        </div>
      </div>

      {capabilities.length > 0 && (
        <div className="mt-4 grid gap-3 xl:grid-cols-4 md:grid-cols-2">
          {capabilities.map((capability, index) => {
            const Icon = capabilityIcon(index)
            const primaryPrompt = capability.prompts?.[0]
            return (
              <div
                key={capability.id}
                className="rounded-2xl border border-rule bg-surface-active/70 px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rule bg-white text-text-primary shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className={cn(
                    'rounded-full border px-2.5 py-1 text-11 font-medium uppercase tracking-[0.08em]',
                    capabilityStateClass(capability.state),
                  )}>
                    {capabilityStateLabel(capability.state)}
                  </div>
                </div>
                <div className="mt-3 text-sm font-medium text-text-primary">
                  {capability.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {capability.description}
                </p>
                {primaryPrompt && capability.state !== 'planned' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPromptSelect(primaryPrompt)}
                    className={cn(
                      'mt-3 rounded-full border px-3 py-1.5 text-11 font-medium transition-colors',
                      busy
                        ? 'cursor-not-allowed border-rule bg-white/60 text-muted'
                        : 'border-accent/20 bg-white text-accent hover:border-accent/30 hover:bg-accent/[0.04]',
                    )}
                  >
                    Try it
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {queryViews.length > 0 && (
        <div className="mt-5 rounded-2xl border border-rule bg-surface-active/60 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-text-primary">
              Structured query views
            </div>
            <div className="text-11 uppercase tracking-[0.08em] text-text-faint">
              Study-owned table and leaderboard surfaces
            </div>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {queryViews.map(view => {
              const primaryPrompt = view.prompts?.[0]
              return (
                <div key={view.id} className="rounded-xl border border-rule bg-white/90 px-3.5 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-medium text-text-primary">
                      {view.title}
                    </div>
                    <div className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-text-faint">
                      {view.id}
                    </div>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {view.description}
                  </p>
                  {(view.defaultMetrics?.length || view.defaultDimensions?.length) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {view.defaultMetrics?.map(metric => (
                        <span key={`${view.id}-${metric}`} className="rounded-full border border-accent/15 bg-accent/[0.04] px-2 py-0.5 text-11 text-accent">
                          {metric}
                        </span>
                      ))}
                      {view.defaultDimensions?.slice(0, 2).map(dimension => (
                        <span key={`${view.id}-${dimension}`} className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-11 text-text-faint">
                          {dimension}
                        </span>
                      ))}
                    </div>
                  )}
                  {primaryPrompt && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPromptSelect(primaryPrompt)}
                      className={cn(
                        'mt-3 rounded-full border px-3 py-1 text-11 font-medium transition-colors',
                        busy
                          ? 'cursor-not-allowed border-rule bg-surface-active text-muted'
                          : 'border-accent/20 bg-white text-accent hover:border-accent/30 hover:bg-accent/[0.04]',
                      )}
                    >
                      {primaryPrompt}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {promptTips.length > 0 && (
        <div className="mt-5 rounded-2xl border border-rule bg-surface-active/60 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-text-primary">
              How to ask better questions
            </div>
            <div className="text-11 uppercase tracking-[0.08em] text-text-faint">
              Faster paths to stronger answers
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {promptTips.map(tip => (
              <div key={tip.id} className="rounded-xl border border-rule bg-white/90 px-3.5 py-3 shadow-sm">
                <div className="text-xs font-medium text-text-primary">
                  {tip.label}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {tip.description}
                </p>
                {tip.example && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPromptSelect(tip.example!)}
                    className={cn(
                      'mt-2 rounded-full border px-3 py-1 text-11 font-medium transition-colors',
                      busy
                        ? 'cursor-not-allowed border-rule bg-surface-active text-muted'
                        : 'border-rule bg-surface-active text-text-primary hover:border-accent/25 hover:text-accent',
                    )}
                  >
                    {tip.example}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
