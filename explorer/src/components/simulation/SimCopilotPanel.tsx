import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
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
  const availabilityText = isHealthLoading
    ? 'Checking guide availability...'
    : copilotAvailable
      ? 'Optional help for comparing scenarios or explaining the current run after you read the visible evidence.'
      : 'Guide framing is offline. Add ANTHROPIC_API_KEY to explorer/.env to enable it.'

  if (!showAssistant) {
    return (
      <motion.div
        className="mb-5 rounded-2xl border border-rule bg-white/88 px-4 py-3"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_CRISP}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="lab-section-title">Optional guide</div>
            <div className="mt-1 text-xs leading-5 text-muted">{availabilityText}</div>
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
            Open optional guide
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="lab-stage mb-5 p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="rounded-xl border border-rule bg-white p-5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="lab-section-title">Simulation Guide</div>
            <div className="mt-1 text-xs leading-5 text-muted">
              {availabilityText}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-11 leading-5 text-text-faint">
              Guide output stays private until you publish a separate note.
            </div>
            <button
              onClick={() => setAssistantOpen(false)}
              className="text-xs text-muted transition-colors hover:text-text-primary"
            >
              Hide guide
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-rule bg-surface-active/70 px-4 py-3 text-xs leading-5 text-muted">
          Read the replay, manifest, or exact figures first. Then use the guide to compare scenarios, frame the next run, or summarize supported charts. It does not replace the visible evidence or invent new metrics.
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted">
            {hasManifest
              ? 'Secondary layer over the current exact run.'
              : 'Secondary layer for shaping a bounded exact run.'}
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <div className="mb-2 text-xs text-muted">
                {hasManifest
                  ? 'Ask about this run only after you have read the emitted figures, or request the next bounded experiment.'
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
                    : 'Draft guide reading'}
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

          <motion.div
            className="mt-4 flex flex-wrap gap-2"
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="visible"
          >
            {promptSuggestions.map(prompt => (
              <motion.button
                key={prompt}
                variants={STAGGER_ITEM}
                onClick={() => {
                  if (!copilotAvailable) return
                  onQuestionChange(prompt)
                  onAsk(prompt)
                }}
                disabled={!copilotAvailable}
                className="lab-option-card rounded-full px-3 py-2 text-xs text-muted transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prompt}
              </motion.button>
            ))}
          </motion.div>

          {mutationError && (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {mutationError.message}
            </div>
          )}

          {isMutating && !copilotResponse && (
            <motion.div
              className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"
              variants={STAGGER_CONTAINER}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={STAGGER_ITEM} className="rounded-xl border border-rule bg-white/80 p-4">
                <div className="lab-skeleton lab-skeleton-line w-1/3" />
                <div className="mt-3 space-y-3">
                  <div className="lab-skeleton lab-skeleton-line w-full" />
                  <div className="lab-skeleton lab-skeleton-line w-5/6" />
                  <div className="lab-skeleton lab-skeleton-line w-4/6" />
                </div>
              </motion.div>
              <motion.div variants={STAGGER_ITEM} className="lab-skeleton lab-skeleton-block h-[240px] chart-skeleton-breathe" />
            </motion.div>
          )}

          <AnimatePresence mode="wait">
          {copilotResponse && (
            <motion.div
              className="mt-5 space-y-4"
              key="copilot-response"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={SPRING_CRISP}
            >
              <div className="rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {copilotResponse.truthBoundary.label}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted">
                  {copilotResponse.truthBoundary.detail}
                </div>
              </div>

                <div className="rounded-xl border border-rule bg-white/90 px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
                  <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
                    Guide framing
                  </div>
                  <div className="mt-2 text-sm leading-6 text-text-primary">{copilotResponse.summary}</div>
                {copilotResponse.guidance && (
                  <div className="mt-3 rounded-xl border border-rule bg-surface-active px-4 py-3">
                    <div className="text-11 uppercase tracking-[0.1em] text-text-faint">Guide interpretation</div>
                    <div className="mt-1 text-xs leading-5 text-muted">{copilotResponse.guidance}</div>
                  </div>
                )}
                <div className="mt-3 text-xs text-muted">
                  {copilotResponse.mode === 'proposed-run'
                    ? 'Proposed bounded run'
                    : copilotResponse.mode === 'guidance'
                      ? 'Guidance only'
                      : 'Current exact result with guide framing'}
                  {copilotResponse.cached
                    ? ' · guide reused cached study context'
                    : ' · fresh guide response over the bounded simulation surface'}
                </div>
              </div>

              {copilotResponse.proposedConfig && (
                <motion.div
                  className="grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4"
                  variants={STAGGER_CONTAINER}
                  initial="hidden"
                  animate="visible"
                >
                  {[
                    { label: 'Paradigm', value: copilotResponse.proposedConfig.paradigm },
                    { label: 'Distribution', value: copilotResponse.proposedConfig.distribution },
                    { label: 'Validators', value: copilotResponse.proposedConfig.validators.toLocaleString() },
                    { label: 'Slots', value: copilotResponse.proposedConfig.slots.toLocaleString() },
                  ].map(card => (
                    <motion.div key={card.label} variants={STAGGER_ITEM} className="lab-option-card px-4 py-3">
                      <span className="block text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</span>
                      <div className="mt-2 text-sm font-medium text-text-primary">{card.value}</div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              <BlockCanvas blocks={copilotResponse.blocks} />
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
