/**
 * Agent Lab page — Stage 5 autonomous research loop.
 *
 * Users provide a research question. The agent analyzes it, proposes a simulation
 * config, waits for approval, runs the sim, interprets results, and suggests
 * the next hypothesis. The human stays in the loop at every config-approval gate.
 */

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/cn'
import type { SimulationConfig } from '../lib/simulation-api'
import {
  useAgentSession,
  useCreateAgentSession,
  useApproveStep,
  useRejectStep,
  useCompleteSession,
} from '../components/agent/agent-hooks'
import { AgentStepCard } from '../components/agent/AgentStepCard'
import { AgentCostBar } from '../components/agent/AgentCostBar'
import { SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM, ERROR_BANNER, CTA_BUTTON } from '../lib/theme'

export default function AgentLabPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questionDraft, setQuestionDraft] = useState('')
  const [maxSteps, setMaxSteps] = useState(5)

  const sessionQuery = useAgentSession(sessionId)
  const createSession = useCreateAgentSession()
  const approveStep = useApproveStep()
  const rejectStep = useRejectStep()
  const completeSession = useCompleteSession()

  const session = sessionQuery.data ?? null
  const isCreating = createSession.isPending

  const handleStart = useCallback(() => {
    const trimmed = questionDraft.trim()
    if (trimmed.length < 10) return

    createSession.mutate(
      { question: trimmed, maxSteps },
      {
        onSuccess: (newSession) => {
          setSessionId(newSession.id)
          setQuestionDraft('')
        },
      },
    )
  }, [createSession, maxSteps, questionDraft])

  const handleApprove = useCallback(
    (stepId: string, config?: SimulationConfig) => {
      if (!sessionId) return
      approveStep.mutate({ sessionId, stepId, config })
    },
    [approveStep, sessionId],
  )

  const handleReject = useCallback(
    (stepId: string, feedback?: string) => {
      if (!sessionId) return
      rejectStep.mutate({ sessionId, stepId, feedback })
    },
    [rejectStep, sessionId],
  )

  const handleComplete = useCallback(() => {
    if (!sessionId) return
    completeSession.mutate(sessionId)
  }, [completeSession, sessionId])

  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setQuestionDraft('')
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
          Stage 5
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          Autonomous research loop
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Ask a research question. The agent proposes a simulation config, you
          approve it, the simulation runs, and the agent interprets the results
          and suggests the next step. You stay in control at every gate.
        </p>
      </div>

      {/* Question input */}
      {!session || session.status !== 'active' ? (
        <div className="mb-8 rounded-xl border border-rule bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.04)]">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
            Research question
          </div>
          <textarea
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
            placeholder="What happens to centralization if we increase gamma from 0.5 to 2.0 under MSP?"
            className="mt-3 min-h-[100px] w-full resize-none bg-transparent text-sm leading-6 text-text-primary outline-none"
            maxLength={500}
            aria-label="Research question for agent loop"
          />

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="max-steps"
                className="text-xs text-muted"
              >
                Max steps
              </label>
              <select
                id="max-steps"
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="rounded-lg border border-rule bg-surface-active px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleStart}
              disabled={isCreating || questionDraft.trim().length < 10}
              className={cn(
                'rounded-xl px-5 py-2.5 text-sm font-medium transition-all',
                isCreating || questionDraft.trim().length < 10
                  ? 'cursor-not-allowed border border-rule bg-surface-active text-muted'
                  : `${CTA_BUTTON.base} ${CTA_BUTTON.hover}`,
              )}
              aria-label="Start autonomous research loop"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting
                </span>
              ) : (
                'Start agent loop'
              )}
            </button>
          </div>

          {createSession.isError ? (
            <div className={`mt-4 rounded-xl border ${ERROR_BANNER.border} ${ERROR_BANNER.bg} px-4 py-3 text-sm ${ERROR_BANNER.text}`}>
              {(createSession.error as Error).message}
            </div>
          ) : null}

          {session?.status === 'completed' ? (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
              Session completed. Start a new loop above.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Active session */}
      {session ? (
        <div className="space-y-4">
          {/* Cost bar */}
          <AgentCostBar session={session} />

          {/* Research question banner */}
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Research question
            </div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {session.researchQuestion}
            </div>
          </div>

          {/* Step timeline */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={STAGGER_CONTAINER}
            className="space-y-4"
          >
            {session.steps.map((step, index) => (
              <motion.div key={step.id} variants={STAGGER_ITEM}>
              <AgentStepCard
                step={step}
                isLatest={index === session.steps.length - 1}
                onApprove={handleApprove}
                onReject={handleReject}
                isApproving={approveStep.isPending}
                isRejecting={rejectStep.isPending}
              />
              </motion.div>
            ))}
          </motion.div>

          {/* Session controls */}
          {session.status === 'active' ? (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleComplete}
                disabled={completeSession.isPending}
                className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Complete agent session"
              >
                {completeSession.isPending ? 'Completing...' : 'End session'}
              </button>
              <button
                onClick={handleNewSession}
                className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
                aria-label="Start new agent session"
              >
                New session
              </button>
            </div>
          ) : (
            <button
              onClick={handleNewSession}
              className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
              aria-label="Start new agent session"
            >
              Start new session
            </button>
          )}
        </div>
      ) : null}

      {/* Empty state */}
      {!session && !isCreating ? (
        <div className="rounded-xl border border-dashed border-rule bg-white px-5 py-8 text-center">
          <div className="text-sm text-muted">
            Enter a research question above to start the autonomous loop.
            The agent will propose simulation configs, run them, and interpret the results.
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {[
              'What happens to centralization if we double gamma under MSP?',
              'Does starting geography matter more than paradigm choice?',
              'How does slot time affect geographic fairness under SSP?',
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setQuestionDraft(suggestion)}
                className="rounded-full border border-rule bg-surface-active px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
