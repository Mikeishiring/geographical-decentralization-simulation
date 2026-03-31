/**
 * Agent workspace — unified research interface.
 *
 * Two modes:
 * - "Ask the paper" — LLM question → rendered blocks (from old Explore tab)
 * - "Run experiment" — autonomous simulation loop with approval gates
 *
 * Users can switch modes freely. Both share the same research context.
 */

import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, MessageSquare, FlaskConical, Link2, FileText } from 'lucide-react'
import { NodeArc } from '../components/decorative/NodeArc'
import { cn } from '../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../lib/theme'
import { explore, getApiHealth, createExploration, publishExploration, type ExploreResponse, type ExploreError } from '../lib/api'
import { blocksToMarkdown } from '../lib/export'
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
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { ShimmerLoading } from '../components/explore/ShimmerBlock'
import { ErrorDisplay } from '../components/explore/ErrorDisplay'
import { FollowUpPrompts } from '../components/explore/FollowUpPrompts'
import { ContributionComposer } from '../components/community/ContributionComposer'

type AgentMode = 'ask' | 'experiment'

const SUGGESTED_QUESTIONS = [
  { label: 'Mechanism', prompt: 'Why does a higher gamma centralize SSP more but MSP less?' },
  { label: 'Comparison', prompt: 'Does starting geography matter more than paradigm choice?' },
  { label: 'Geography', prompt: 'Why do the same low-latency regions keep winning?' },
  { label: 'Design', prompt: 'What does this imply for protocol design and relay policy?' },
  { label: 'Timing', prompt: 'What changes under shorter slots: geography or fairness?' },
  { label: 'Experiment', prompt: 'What happens to centralization if we double gamma under MSP?' },
  { label: 'Experiment', prompt: 'How does slot time affect geographic fairness under SSP?' },
  { label: 'Realism', prompt: 'Does the simplified MEV model bias the results toward SSP?' },
]

export default function AgentLabPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<AgentMode>('ask')

  // ── Ask mode state ──
  const [query, setQuery] = useState('')
  const [aiResponse, setAiResponse] = useState<ExploreResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<ExploreError | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle')
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ query: string; summary: string }[]>([])

  // ── Experiment mode state ──
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questionDraft, setQuestionDraft] = useState('')
  const [maxSteps, setMaxSteps] = useState(5)

  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    staleTime: 30_000,
  })

  const sessionQuery = useAgentSession(sessionId)
  const createSession = useCreateAgentSession()
  const approveStep = useApproveStep()
  const rejectStep = useRejectStep()
  const completeSession = useCompleteSession()

  const session = sessionQuery.data ?? null
  const isCreating = createSession.isPending

  const publishMutation = useMutation({
    mutationFn: async (input: { title: string; takeaway: string; author: string }) => {
      if (!aiResponse) throw new Error('No active response to publish.')
      const created = await createExploration({
        query: query || aiResponse.summary,
        summary: aiResponse.summary,
        blocks: aiResponse.blocks,
        followUps: aiResponse.followUps,
        model: aiResponse.model,
        cached: aiResponse.cached,
        surface: 'reading',
      })
      return await publishExploration(created.id, {
        title: input.title,
        takeaway: input.takeaway,
        author: input.author || undefined,
      })
    },
    onSuccess: (published) => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
      setPublishedId(published.id)
    },
  })

  // ── Ask mode handlers ──
  const handleAskSubmit = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setQuery(trimmed)
    setAiResponse(null)
    setAiError(null)
    setAiLoading(true)
    setPublishedId(null)
    publishMutation.reset()

    const result = await explore(trimmed, history)
    setAiLoading(false)

    if (result.ok) {
      setAiResponse(result.data)
      setHistory(prev => [{ query: trimmed, summary: result.data.summary }, ...prev].slice(0, 8))
    } else {
      setAiError(result.error)
    }
  }, [history, publishMutation])

  const handleShare = useCallback(async () => {
    const id = publishedId ?? aiResponse?.provenance.explorationId
    if (!id) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'community')
    url.searchParams.set('eid', id)
    url.searchParams.delete('q')
    await navigator.clipboard.writeText(url.toString())
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 2000)
  }, [aiResponse, publishedId])

  const handleExportMarkdown = useCallback(async () => {
    if (!aiResponse?.blocks?.length) return
    const md = blocksToMarkdown(query || 'Exploration', aiResponse.summary, aiResponse.blocks)
    await navigator.clipboard.writeText(md)
    setExportState('copied')
    setTimeout(() => setExportState('idle'), 2000)
  }, [aiResponse, query])

  // ── Experiment mode handlers ──
  const handleStartExperiment = useCallback(() => {
    const trimmed = questionDraft.trim()
    if (trimmed.length < 10) return
    createSession.mutate(
      { question: trimmed, maxSteps },
      { onSuccess: (s) => { setSessionId(s.id); setQuestionDraft('') } },
    )
  }, [createSession, maxSteps, questionDraft])

  const handleApprove = useCallback((stepId: string, config?: SimulationConfig) => {
    if (!sessionId) return
    approveStep.mutate({ sessionId, stepId, config })
  }, [approveStep, sessionId])

  const handleReject = useCallback((stepId: string, feedback?: string) => {
    if (!sessionId) return
    rejectStep.mutate({ sessionId, stepId, feedback })
  }, [rejectStep, sessionId])

  const handleComplete = useCallback(() => {
    if (!sessionId) return
    completeSession.mutate(sessionId)
  }, [completeSession, sessionId])

  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setQuestionDraft('')
  }, [])

  const handleSuggestionClick = (prompt: string) => {
    if (mode === 'ask') {
      setQuery(prompt)
      handleAskSubmit(prompt)
    } else {
      setQuestionDraft(prompt)
    }
  }

  const apiDisabled = apiHealthQuery.isError
  const hasAskResult = aiResponse !== null || aiLoading || aiError !== null
  const hasExperiment = session !== null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="reveal-up">
        <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
          Research workspace
        </span>
        <h1 className="mt-1 text-xl font-semibold text-text-primary">
          Ask questions & run experiments
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Ask the paper any question for an instant LLM-guided answer with evidence blocks, or start an autonomous simulation loop to test hypotheses with real data.
        </p>
      </div>

      {/* Mode selector */}
      <div className="reveal-up flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-1 w-fit">
        {([
          { id: 'ask' as AgentMode, icon: MessageSquare, label: 'Ask the paper' },
          { id: 'experiment' as AgentMode, icon: FlaskConical, label: 'Run experiment' },
        ]).map(m => (
          <motion.button
            key={m.id}
            onClick={() => setMode(m.id)}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_SNAPPY}
            className={cn(
              'relative flex items-center gap-1.5 rounded-md px-4 py-2 text-sm transition-colors',
              mode === m.id ? 'text-text-primary font-medium' : 'text-muted hover:text-text-primary',
            )}
          >
            {mode === m.id && (
              <motion.span
                layoutId="agent-mode-pill"
                className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-black/[0.04]"
                transition={SPRING_SNAPPY}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <m.icon className="h-4 w-4" />
              {m.label}
            </span>
          </motion.button>
        ))}
      </div>

      {/* ─── ASK MODE ─── */}
      {mode === 'ask' && (
        <div className="space-y-6">
          {/* Query input */}
          <div className="rounded-xl border border-rule bg-white px-5 py-5">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Ask a question about the paper
            </div>
            <div className={cn(
              'mt-3 flex items-center gap-3 rounded-xl border border-rule bg-surface-active px-4 py-3 transition-all',
              !apiDisabled && 'focus-within:border-accent/30 focus-within:ring-2 focus-within:ring-accent/10',
            )}>
              {aiLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
              ) : (
                <MessageSquare className="h-4 w-4 shrink-0 text-muted/60" />
              )}
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAskSubmit(query)}
                placeholder={apiDisabled ? 'API server is unavailable' : 'Ask about a mechanism, paradox, comparison, or implication...'}
                disabled={apiDisabled || aiLoading}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-muted/70 outline-none disabled:opacity-50"
              />
              {query.trim() && !apiDisabled && !aiLoading && (
                <button
                  onClick={() => handleAskSubmit(query)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
                >
                  Ask
                </button>
              )}
            </div>

            {/* API health indicator */}
            {apiHealthQuery.data && (
              <div className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-text-faint">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  apiHealthQuery.data.anthropicEnabled ? 'bg-success' : 'bg-warning',
                )} />
                {apiHealthQuery.data.anthropicEnabled
                  ? 'Reading guide online'
                  : 'Curated content only — needs an API key'}
              </div>
            )}
          </div>

          {/* AI results */}
          <AnimatePresence mode="wait">
            {aiLoading ? (
              <motion.div key="loading" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
                <ShimmerLoading />
              </motion.div>
            ) : aiError ? (
              <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
                <ErrorDisplay error={aiError} onRetry={() => handleAskSubmit(query)} />
              </motion.div>
            ) : aiResponse ? (
              <motion.div key={`ai-${query}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-text-primary font-serif">{aiResponse.summary}</h2>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <span className={cn('w-1.5 h-1.5 rounded-full', aiResponse.cached ? 'bg-success' : 'bg-accent')} />
                    {aiResponse.cached ? 'Cached response' : 'Fresh interpretation'}
                  </div>
                </div>

                <BlockCanvas blocks={aiResponse.blocks} />

                {/* Action bar */}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  {aiResponse.provenance.explorationId && (
                    <button onClick={handleShare} className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors">
                      <Link2 className="w-3 h-3" />
                      {shareState === 'copied' ? 'Link copied' : 'Share'}
                    </button>
                  )}
                  <button onClick={handleExportMarkdown} className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors">
                    <FileText className="w-3 h-3" />
                    {exportState === 'copied' ? 'Copied' : 'Export markdown'}
                  </button>
                </div>

                {/* Publish as community note */}
                <ContributionComposer
                  sourceLabel="Turn this into a community note"
                  defaultTitle={query || aiResponse.summary}
                  defaultTakeaway={aiResponse.summary}
                  helperText="Add your own title and takeaway before publishing."
                  publishLabel="Publish note"
                  successLabel="Published"
                  viewPublishedLabel="View in Community"
                  published={publishedId !== null}
                  isPublishing={publishMutation.isPending}
                  error={(publishMutation.error as Error | null)?.message ?? null}
                  onPublish={payload => publishMutation.mutate(payload)}
                />

                {/* Follow-ups */}
                <FollowUpPrompts
                  prompts={aiResponse.followUps}
                  title="Continue questioning"
                  onSelect={handleAskSubmit}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      {/* ─── EXPERIMENT MODE ─── */}
      {mode === 'experiment' && (
        <div className="space-y-6">
          {/* Question input */}
          {!session || session.status !== 'active' ? (
            <div className="rounded-xl border border-rule bg-white px-5 py-5">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                Research question for simulation loop
              </div>
              <textarea
                value={questionDraft}
                onChange={e => setQuestionDraft(e.target.value)}
                placeholder="What happens to centralization if we increase gamma from 0.5 to 2.0 under MSP?"
                className="mt-3 min-h-[100px] w-full resize-none rounded-xl border border-rule bg-surface-active px-4 py-3 text-sm leading-6 text-text-primary placeholder:text-muted/70 outline-none focus:border-accent/30 focus:ring-2 focus:ring-accent/10"
                maxLength={500}
              />

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="max-steps" className="text-xs text-muted">Max steps</label>
                  <select
                    id="max-steps"
                    value={maxSteps}
                    onChange={e => setMaxSteps(Number(e.target.value))}
                    className="rounded-lg border border-rule bg-surface-active px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleStartExperiment}
                  disabled={isCreating || questionDraft.trim().length < 10}
                  className={cn(
                    'rounded-xl px-5 py-2.5 text-sm font-medium transition-all',
                    isCreating || questionDraft.trim().length < 10
                      ? 'cursor-not-allowed border border-rule bg-surface-active text-muted'
                      : 'bg-text-primary text-white hover:bg-text-primary/90',
                  )}
                >
                  {isCreating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Starting
                    </span>
                  ) : (
                    'Start experiment loop'
                  )}
                </button>
              </div>

              {createSession.isError && (
                <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {(createSession.error as Error).message}
                </div>
              )}

              {session?.status === 'completed' && (
                <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
                  Session completed. Start a new loop above.
                </div>
              )}
            </div>
          ) : null}

          {/* Active experiment session */}
          {session && (
            <div className="space-y-4">
              <AgentCostBar session={session} />

              <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Research question</div>
                <div className="mt-2 text-sm font-medium text-text-primary">{session.researchQuestion}</div>
              </div>

              <div className="space-y-4">
                {session.steps.map((step, index) => (
                  <AgentStepCard
                    key={step.id}
                    step={step}
                    isLatest={index === session.steps.length - 1}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isApproving={approveStep.isPending}
                    isRejecting={rejectStep.isPending}
                  />
                ))}
              </div>

              {session.status === 'active' ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleComplete}
                    disabled={completeSession.isPending}
                    className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {completeSession.isPending ? 'Completing...' : 'End session'}
                  </button>
                  <button
                    onClick={handleNewSession}
                    className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
                  >
                    New session
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleNewSession}
                  className="rounded-xl border border-rule bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
                >
                  Start new session
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Suggested questions — shown when no active results in either mode */}
      {!hasAskResult && mode === 'ask' && !aiLoading && (
        <div className="rounded-xl border border-dashed border-rule bg-white px-5 py-8 relative overflow-hidden">
          {/* Node-arc motif — visual DNA echoing the header globe */}
          <div className="absolute right-4 top-2 w-[140px] h-[70px] opacity-[0.5] pointer-events-none select-none" aria-hidden="true">
            <NodeArc className="w-full h-full text-muted" />
          </div>
          <div className="text-center text-sm text-muted mb-4 relative">
            Choose a question below or write your own above
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 stagger-reveal">
            {SUGGESTED_QUESTIONS.map((s, i) => (
              <motion.button
                key={s.prompt}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...SPRING, delay: i * 0.03 }}
                onClick={() => handleSuggestionClick(s.prompt)}
                className="group rounded-lg border border-rule bg-surface-active px-3 py-2.5 text-left transition-all hover:border-border-hover hover:bg-white"
              >
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                  {s.label}
                </div>
                <div className="mt-1 text-xs leading-5 text-text-body group-hover:text-text-primary transition-colors">
                  {s.prompt}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {!hasExperiment && mode === 'experiment' && !isCreating && (
        <div className="rounded-xl border border-dashed border-rule bg-white px-5 py-8">
          <div className="text-center text-sm text-muted mb-4">
            Enter a research question to start the autonomous loop, or choose one below
          </div>
          <div className="flex flex-wrap justify-center gap-2 stagger-reveal">
            {SUGGESTED_QUESTIONS.filter(s => s.label === 'Experiment' || s.label === 'Mechanism').map(s => (
              <button
                key={s.prompt}
                onClick={() => handleSuggestionClick(s.prompt)}
                className="rounded-full border border-rule bg-surface-active px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                {s.prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
