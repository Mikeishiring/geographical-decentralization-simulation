import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { cn } from '../../lib/cn'
import type { SimulationCopilotResponse, SimulationConfig } from '../../lib/simulation-api'

interface SimCopilotPanelProps {
  readonly copilotQuestion: string
  readonly onQuestionChange: (value: string) => void
  readonly onAsk: (question: string) => void
  readonly onApplyConfig: (config: SimulationConfig) => void
  readonly copilotResponse: SimulationCopilotResponse | null
  readonly copilotAvailable: boolean
  readonly isHealthLoading: boolean
  readonly isMutating: boolean
  readonly mutationError: Error | null
  readonly hasManifest: boolean
  readonly promptSuggestions: readonly string[]
}

export function SimCopilotPanel({
  copilotQuestion,
  onQuestionChange,
  onAsk,
  onApplyConfig,
  copilotResponse,
  copilotAvailable,
  isHealthLoading,
  isMutating,
  mutationError,
  hasManifest,
  promptSuggestions,
}: SimCopilotPanelProps) {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const copilotDisabled = isHealthLoading || !copilotAvailable || isMutating
  const showAssistant = assistantOpen || Boolean(copilotResponse) || Boolean(mutationError) || isMutating
  const inputClassName = 'lab-input-shell min-h-[112px] w-full resize-y rounded-[1rem] px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/10'

  return (
    <div className="lab-stage p-0 mb-6">
      <div className="lab-stage-soft m-3 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="lab-section-title">Assistant Framing</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              The exact run surface stays primary. The assistant is an opt-in interpretation layer.
            </div>
          </div>
          <div className="max-w-xl text-xs leading-5 text-muted">
            It can reorganize supported charts, suggest bounded configs, and add clearly labeled framing.
            It cannot invent metrics, replace the default result surface, or change the exact engine.
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border-subtle/90 bg-white/80 px-4 py-3 text-xs leading-5 text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          {isHealthLoading
            ? 'Checking assistant availability...'
            : copilotAvailable
              ? 'Assistant framing is available for bounded exact-mode questions. Use it when you want help comparing scenarios, explaining a run, or reordering supported visuals.'
              : 'Assistant framing is offline. Add ANTHROPIC_API_KEY to explorer/.env to enable bounded simulation guidance.'}
        </div>
      </div>

      {!showAssistant && (
        <div className="mx-3 mb-3 flex flex-col gap-4 rounded-[1.35rem] border border-border-subtle bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(247,244,238,0.92))] px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Default mode</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              Read the exact metadata, artifact labels, and charts first.
            </div>
            <div className="mt-2 max-w-2xl text-xs leading-5 text-muted">
              Open the assistant only when you want bounded help with phrasing a run, comparing scenarios, or turning the current exact result into a more deliberate story.
            </div>
          </div>
          <button
            onClick={() => setAssistantOpen(true)}
            disabled={!copilotAvailable && !isHealthLoading}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
              'bg-accent text-white hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <Sparkles className="h-4 w-4" />
            Open assistant
          </button>
        </div>
      )}

      {showAssistant && (
        <div className="mx-3 mb-3 rounded-[1.35rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,246,242,0.93))] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {hasManifest
                ? 'Optional layer over the current exact run.'
                : 'Optional help for shaping a bounded exact run.'}
            </div>
            <button
              onClick={() => setAssistantOpen(false)}
              className="text-xs text-muted transition-colors hover:text-text-primary"
            >
              Hide assistant
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <div className="mb-2 text-xs text-muted">
                {hasManifest
                  ? 'Ask about this exact run, or request the next bounded experiment.'
                  : 'Ask for a bounded exact run setup that stays within the paper and simulator surface.'}
              </div>
              <textarea
                value={copilotQuestion}
                onChange={event => onQuestionChange(event.target.value)}
                rows={3}
                placeholder={hasManifest
                  ? 'Example: Show avg_mev, then supermajority_success, then explain the top regions.'
                  : 'Example: Set up the paper baseline SSP run, then tell me what to inspect first.'}
                disabled={isHealthLoading || !copilotAvailable}
                className={inputClassName}
              />
            </div>

            <div className="flex flex-col gap-2 lg:w-52">
              <button
                onClick={() => onAsk(copilotQuestion.trim())}
                disabled={!copilotQuestion.trim() || copilotDisabled}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                  'bg-accent text-white hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <Sparkles className="h-4 w-4" />
                {isHealthLoading
                  ? 'Checking...'
                  : isMutating
                    ? 'Thinking...'
                    : 'Ask assistant'}
              </button>

              {copilotResponse?.proposedConfig && (
                <button
                  onClick={() => onApplyConfig({ ...copilotResponse.proposedConfig! })}
                  className="lab-option-card rounded-xl px-4 py-3 text-sm text-text-primary transition-colors hover:border-border-hover"
                >
                  Apply proposed config
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {promptSuggestions.map(prompt => (
              <button
                key={prompt}
                onClick={() => {
                  if (!copilotAvailable) return
                  onQuestionChange(prompt)
                  onAsk(prompt)
                }}
                disabled={!copilotAvailable}
                className="lab-option-card rounded-full px-3 py-2 text-xs text-muted transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {mutationError && (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {mutationError.message}
            </div>
          )}

          {isMutating && !copilotResponse && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[1.1rem] border border-border-subtle bg-white/80 p-4">
                <div className="lab-skeleton lab-skeleton-line w-1/3" />
                <div className="mt-3 space-y-3">
                  <div className="lab-skeleton lab-skeleton-line w-full" />
                  <div className="lab-skeleton lab-skeleton-line w-5/6" />
                  <div className="lab-skeleton lab-skeleton-line w-4/6" />
                </div>
              </div>
              <div className="lab-skeleton lab-skeleton-block h-[240px]" />
            </div>
          )}

          {copilotResponse && (
            <div className="mt-5 space-y-4">
              <div className="rounded-[1.1rem] border border-warning/25 bg-warning/7 px-4 py-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {copilotResponse.truthBoundary.label}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted">
                  {copilotResponse.truthBoundary.detail}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-border-subtle bg-white/90 px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
                  Assistant framing
                </div>
                <div className="mt-2 text-sm leading-6 text-text-primary">{copilotResponse.summary}</div>
                {copilotResponse.guidance && (
                  <div className="mt-3 rounded-xl border border-border-subtle/90 bg-surface-active px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-text-faint">Guide interpretation</div>
                    <div className="mt-1 text-xs leading-5 text-muted">{copilotResponse.guidance}</div>
                  </div>
                )}
                <div className="mt-3 text-xs text-muted">
                  {copilotResponse.mode === 'proposed-run'
                    ? 'Proposed bounded run'
                    : copilotResponse.mode === 'guidance'
                      ? 'Guidance only'
                      : 'Current exact result with assistant framing'}
                  {copilotResponse.cached
                    ? ' · assistant reused cached study context'
                    : ' · fresh assistant response over the bounded simulation surface'}
                </div>
              </div>

              {copilotResponse.proposedConfig && (
                <div className="grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
                  <div className="lab-option-card px-4 py-3">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-text-faint">Paradigm</span>
                    <div className="mt-2 text-sm font-medium text-text-primary">{copilotResponse.proposedConfig.paradigm}</div>
                  </div>
                  <div className="lab-option-card px-4 py-3">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-text-faint">Distribution</span>
                    <div className="mt-2 text-sm font-medium text-text-primary">{copilotResponse.proposedConfig.distribution}</div>
                  </div>
                  <div className="lab-option-card px-4 py-3">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-text-faint">Validators</span>
                    <div className="mt-2 text-sm font-medium text-text-primary">{copilotResponse.proposedConfig.validators.toLocaleString()}</div>
                  </div>
                  <div className="lab-option-card px-4 py-3">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-text-faint">Slots</span>
                    <div className="mt-2 text-sm font-medium text-text-primary">{copilotResponse.proposedConfig.slots.toLocaleString()}</div>
                  </div>
                </div>
              )}

              <BlockCanvas blocks={copilotResponse.blocks} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
