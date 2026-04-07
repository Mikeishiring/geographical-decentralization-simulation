/**
 * Agent workspace — unified research interface.
 *
 * Two modes:
 * - "Ask the paper" — LLM question → rendered blocks (from old Explore tab)
 * - "Run experiment" — autonomous simulation loop with approval gates
 *
 * Users can switch modes freely. Both share the same research context.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, MessageSquare, FlaskConical, Link2, FileText } from 'lucide-react'
import { cn } from '../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../lib/theme'
import { explore, getApiHealth, createExploration, publishExploration, type ExploreResponse, type ExploreError } from '../lib/api'
import { ASK_DATA_PART_SCHEMAS, type AskArtifactData } from '../lib/ask-artifact'
import type { AskLaunchContext } from '../lib/ask-launch'
import {
  type AskUIMessage,
  extractLatestAskPlan,
  extractAskStatusHistory,
  extractLatestAssistantText,
  extractLatestExploreArtifact,
  extractLatestExploreResponse,
  extractLatestToolActivities,
} from '../lib/ask-chat'
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
import { AskPlanPanel } from '../components/explore/AskPlanPanel'
import { AskStageRail } from '../components/explore/AskStageRail'
import { AskStatusFeed } from '../components/explore/AskStatusFeed'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { AskLoadingStateCard, buildAskLoadingDescriptor } from '../components/explore/AskLoadingState'
import { ShimmerLoading } from '../components/explore/ShimmerBlock'
import { ErrorDisplay } from '../components/explore/ErrorDisplay'
import { FollowUpPrompts } from '../components/explore/FollowUpPrompts'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { getActiveStudy } from '../studies'

type AgentMode = 'ask' | 'experiment'

const ACTIVE_STUDY = getActiveStudy()
const ASSISTANT_CONFIG = ACTIVE_STUDY.assistant
const SUGGESTED_QUESTIONS = ASSISTANT_CONFIG.suggestedPrompts.length > 0
  ? ASSISTANT_CONFIG.suggestedPrompts
  : [
      { label: 'Overview', prompt: `What is the main claim of ${ACTIVE_STUDY.metadata.title}?`, mode: 'ask' as const },
      { label: 'Comparison', prompt: 'Which result matters most, and why?', mode: 'ask' as const },
      { label: 'Experiment', prompt: 'What experiment should I run next?', mode: 'experiment' as const },
    ]
const ASK_SUGGESTIONS = SUGGESTED_QUESTIONS.filter(
  suggestion => suggestion.mode !== 'experiment',
)
const EXPERIMENT_SUGGESTIONS = SUGGESTED_QUESTIONS.filter(
  suggestion => suggestion.mode === 'experiment' || suggestion.mode === 'both',
)
const ASK_DESCRIPTION = ASSISTANT_CONFIG.askDescription
  ?? `Ask grounded questions about ${ACTIVE_STUDY.metadata.title}, or run a bounded experiment against this study package.`
const ASK_PLACEHOLDER = ASSISTANT_CONFIG.askPlaceholder
  ?? 'Ask about a mechanism, comparison, metric, or implication...'
const ASK_HEADING = ASSISTANT_CONFIG.askHeading ?? 'Ask a question about the paper'

interface AgentLabPageProps {
  readonly onTabChange?: (tab: import('../components/layout/TabNav').TabId) => void
  readonly onOpenCommunityExploration?: (explorationId: string) => void
}

function buildReadyArtifact(response: ExploreResponse): AskArtifactData {
  return {
    status: 'ready',
    stage: 'Answer ready',
    response: {
      summary: response.summary,
      blocks: [...response.blocks],
      followUps: [...response.followUps],
      model: response.model,
      cached: response.cached,
      provenance: response.provenance,
    },
  }
}

export default function AgentLabPage({ onTabChange, onOpenCommunityExploration }: AgentLabPageProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<AgentMode>('ask')

  // ── Ask mode state ──
  const [query, setQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('q') ?? ''
  })
  const [aiResponse, setAiResponse] = useState<ExploreResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<ExploreError | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle')
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ query: string; summary: string }[]>([])
  const [askProgressMeta, setAskProgressMeta] = useState<{ startedAt: number; lastSignalAt: number } | null>(null)
  const [askProgressClock, setAskProgressClock] = useState(() => Date.now())
  const historyRef = useRef(history)
  const pendingAskQueryRef = useRef<string | null>(null)
  const pendingAskLaunchRef = useRef<AskLaunchContext | null>(null)
  const askProgressSignalRef = useRef('')
  const askTransportRef = useRef(new DefaultChatTransport<AskUIMessage>({
    api: '/api/explore/chat',
    prepareSendMessagesRequest: async ({ body }) => {
      const launch = pendingAskLaunchRef.current
      pendingAskLaunchRef.current = null
      return {
        body: {
          ...(body ?? {}),
          history: historyRef.current,
          launch,
        },
      }
    },
  }))

  // ── Experiment mode state ──
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questionDraft, setQuestionDraft] = useState('')
  const [maxSteps, setMaxSteps] = useState(5)

  // Track pending timers for cleanup on unmount
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    staleTime: 30_000,
  })
  const anthropicEnabled = apiHealthQuery.data?.anthropicEnabled ?? false

  useEffect(() => {
    historyRef.current = history
  }, [history])

  const {
    messages: askMessages,
    sendMessage,
    setMessages: setAskMessages,
    status: askStatus,
    error: askChatError,
    clearError: clearAskChatError,
  } = useChat<AskUIMessage>({
    transport: askTransportRef.current,
    dataPartSchemas: ASK_DATA_PART_SCHEMAS,
    onFinish: ({ messages }) => {
      const nextResponse = extractLatestExploreResponse(messages)
      const submittedQuery = pendingAskQueryRef.current
      if (!nextResponse || !submittedQuery) return
      setHistory(prev => [{ query: submittedQuery, summary: nextResponse.summary }, ...prev].slice(0, 8))
      pendingAskQueryRef.current = null
    },
  })
  const streamedArtifact = extractLatestExploreArtifact(askMessages)
  const displayedArtifact = aiResponse
    ? buildReadyArtifact(aiResponse)
    : streamedArtifact
  const askPlan = extractLatestAskPlan(askMessages)
  const askLeadText = extractLatestAssistantText(askMessages)
  const askToolActivities = extractLatestToolActivities(askMessages)
  const askStatusHistory = extractAskStatusHistory(askMessages)
  const askProgressSignal = [
    askMessages.length,
    askPlan ? `${askPlan.route}:${askPlan.status}:${askPlan.templates.map(template => `${template.id}:${template.state}`).join('|')}` : '',
    askLeadText.trim(),
    askToolActivities.map(activity => `${activity.id}:${activity.state}`).join('|'),
    askStatusHistory.map(status => `${status.id}:${status.state}`).join('|'),
    displayedArtifact?.stage ?? '',
    displayedArtifact?.response.blocks.length ?? 0,
  ].join('::')

  const sessionQuery = useAgentSession(sessionId)
  const createSession = useCreateAgentSession()
  const approveStep = useApproveStep()
  const rejectStep = useRejectStep()
  const completeSession = useCompleteSession()

  const session = sessionQuery.data ?? null
  const isCreating = createSession.isPending

  useEffect(() => {
    const latestResponse = extractLatestExploreResponse(askMessages)
    if (latestResponse) {
      setAiResponse(latestResponse)
    }
  }, [askMessages])

  useEffect(() => {
    if (!askChatError) return
    pendingAskQueryRef.current = null
    setAiError({ error: askChatError.message, status: 500 })
  }, [askChatError])

  useEffect(() => {
    if (!anthropicEnabled) return
    if (askStatus !== 'ready' || askMessages.length === 0 || aiResponse || streamedArtifact || aiError || askChatError) return
    pendingAskQueryRef.current = null
    setAiError({
      error: 'The assistant finished without a renderable page. Try narrowing the question to one comparison, metric, or mechanism.',
      status: 500,
    })
  }, [aiError, aiResponse, anthropicEnabled, askChatError, askMessages, askStatus, streamedArtifact])

  useEffect(() => {
    const isAskBusy = anthropicEnabled
      ? askStatus === 'submitted' || askStatus === 'streaming'
      : aiLoading
    if (!isAskBusy || !askProgressMeta) return

    const intervalId = window.setInterval(() => {
      setAskProgressClock(Date.now())
    }, 300)

    return () => window.clearInterval(intervalId)
  }, [aiLoading, anthropicEnabled, askProgressMeta, askStatus])

  useEffect(() => {
    const isAskBusy = anthropicEnabled
      ? askStatus === 'submitted' || askStatus === 'streaming'
      : aiLoading
    if (!isAskBusy || !askProgressMeta) return

    const hasVisibleSignal = askMessages.length > 0 || askLeadText.trim().length > 0 || askToolActivities.length > 0
    if (!hasVisibleSignal) return
    if (askProgressSignal === askProgressSignalRef.current) return

    askProgressSignalRef.current = askProgressSignal
    setAskProgressMeta(prev => prev
      ? { ...prev, lastSignalAt: Date.now() }
      : prev)
  }, [aiLoading, anthropicEnabled, askLeadText, askMessages.length, askProgressMeta, askProgressSignal, askStatus, askToolActivities.length])

  useEffect(() => {
    const isAskBusy = anthropicEnabled
      ? askStatus === 'submitted' || askStatus === 'streaming'
      : aiLoading
    if (isAskBusy || !askProgressMeta) return
    if (!aiResponse && !aiError && pendingAskQueryRef.current) return

    askProgressSignalRef.current = ''
    setAskProgressMeta(null)
  }, [aiError, aiLoading, aiResponse, anthropicEnabled, askProgressMeta, askStatus])

  const publishMutation = useMutation({
    mutationFn: async (input: { title: string; takeaway: string; author: string }) => {
      if (!aiResponse) throw new Error('No active response to publish.')
      if (aiResponse.provenance.explorationId) {
        return await publishExploration(aiResponse.provenance.explorationId, {
          title: input.title,
          takeaway: input.takeaway,
          author: input.author || undefined,
        })
      }

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
  const handleAskSubmit = useCallback(async (text: string, launch?: AskLaunchContext) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const startedAt = Date.now()
    setQuery(trimmed)
    setAiResponse(null)
    setAiError(null)
    setPublishedId(null)
    setAskProgressMeta({ startedAt, lastSignalAt: startedAt })
    setAskProgressClock(startedAt)
    askProgressSignalRef.current = ''
    pendingAskLaunchRef.current = null
    publishMutation.reset()

    if (anthropicEnabled) {
      pendingAskQueryRef.current = trimmed
      pendingAskLaunchRef.current = launch ?? null
      clearAskChatError()
      setAskMessages([])
      await sendMessage({ text: trimmed })
      return
    }

    setAiLoading(true)
    const result = await explore(trimmed, history)
    setAiLoading(false)

    if (result.ok) {
      setAiResponse(result.data)
      setHistory(prev => [{ query: trimmed, summary: result.data.summary }, ...prev].slice(0, 8))
    } else {
      setAiError(result.error)
    }
  }, [anthropicEnabled, clearAskChatError, history, publishMutation, sendMessage, setAskMessages])

  // Auto-submit if query came from URL (e.g. topic chip → Agent tab)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlQuery = params.get('q')
    const busyAsking = anthropicEnabled
      ? askStatus === 'submitted' || askStatus === 'streaming'
      : aiLoading
    if (urlQuery && !aiResponse && !busyAsking) {
      void handleAskSubmit(urlQuery)
      // Clear the q param so it doesn't re-fire
      params.delete('q')
      const url = new URL(window.location.href)
      url.searchParams.delete('q')
      window.history.replaceState({}, '', url.toString())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = useCallback(async () => {
    const id = publishedId ?? aiResponse?.provenance.explorationId
    if (!id) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'community')
    url.searchParams.set('eid', id)
    url.searchParams.delete('q')
    await navigator.clipboard.writeText(url.toString())
    setShareState('copied')
    timersRef.current.push(setTimeout(() => setShareState('idle'), 2000))
  }, [aiResponse, publishedId])

  const handleExportMarkdown = useCallback(async () => {
    if (!aiResponse?.blocks?.length) return
    const md = blocksToMarkdown(query || 'Exploration', aiResponse.summary, aiResponse.blocks)
    await navigator.clipboard.writeText(md)
    setExportState('copied')
    timersRef.current.push(setTimeout(() => setExportState('idle'), 2000))
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

  const handleSuggestionClick = (prompt: string, launch?: AskLaunchContext) => {
    if (mode === 'ask') {
      setQuery(prompt)
      handleAskSubmit(prompt, launch)
    } else {
      setQuestionDraft(prompt)
    }
  }

  const apiDisabled = apiHealthQuery.isError
  const askLoading = anthropicEnabled
    ? askStatus === 'submitted' || askStatus === 'streaming'
    : aiLoading
  const askLoadingState = askProgressMeta
    ? buildAskLoadingDescriptor({
        anthropicEnabled,
        elapsedMs: Math.max(0, askProgressClock - askProgressMeta.startedAt),
        quietMs: Math.max(0, askProgressClock - askProgressMeta.lastSignalAt),
        assistantText: askLeadText,
        toolActivities: askToolActivities,
      })
    : null
  const hasAskResult = aiResponse !== null || streamedArtifact !== null || askLoading || aiError !== null
  const hasExperiment = session !== null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="reveal-up">
        <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
          Research workspace
        </span>
        <h1 className="mt-1 text-xl font-semibold text-text-primary">
          Ask questions & run experiments
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {ASK_DESCRIPTION}
        </p>
      </div>

      {/* Mode selector */}
      <div className="reveal-up flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-1 w-fit">
        {([
          { id: 'ask' as AgentMode, icon: MessageSquare, label: 'Ask the paper', tooltip: 'Type a question and get an AI answer grounded in the paper\u2019s data and findings' },
          { id: 'experiment' as AgentMode, icon: FlaskConical, label: 'Run experiment', tooltip: 'Start an autonomous loop that configures, runs, and interprets a simulation for you' },
        ]).map(m => (
          <motion.button
            key={m.id}
            onClick={() => setMode(m.id)}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_SNAPPY}
            title={m.tooltip}
            className={cn(
              'relative flex items-center gap-1.5 rounded-md px-4 py-2 text-sm transition-colors',
              mode === m.id ? 'text-text-primary font-medium' : 'text-muted hover:text-text-primary',
            )}
          >
            {mode === m.id && (
              <motion.span
                layoutId="agent-mode-pill"
                className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-rule"
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
          <div className="rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar">
            <div className="lab-section-title">
              {ASK_HEADING}
            </div>
            <div className={cn(
              'mt-3 flex items-center gap-3 rounded-xl border border-rule bg-surface-active px-4 py-3 transition-all',
              !apiDisabled && 'focus-within:border-accent/30 focus-within:ring-2 focus-within:ring-accent/10',
            )}>
              {askLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
              ) : (
                <MessageSquare className="h-4 w-4 shrink-0 text-muted/60" />
              )}
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAskSubmit(query)}
                placeholder={apiDisabled ? 'API server is unavailable' : ASK_PLACEHOLDER}
                disabled={apiDisabled || askLoading}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-muted/70 outline-none disabled:opacity-50"
              />
              <button
                onClick={() => handleAskSubmit(query)}
                disabled={!query.trim() || apiDisabled || askLoading}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  query.trim() && !apiDisabled && !askLoading
                    ? 'bg-accent text-white hover:bg-accent/90'
                    : 'cursor-not-allowed bg-rule text-muted',
                )}
              >
                {askLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking
                  </span>
                ) : (
                  'Ask'
                )}
              </button>
            </div>

            {/* API health indicator */}
            {apiHealthQuery.data && (
              <div className="mt-2 flex items-center gap-1.5 text-11 text-text-faint">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  apiHealthQuery.data.anthropicEnabled ? 'bg-success' : 'bg-warning',
                )} />
                {apiHealthQuery.data.anthropicEnabled
                  ? 'Reading guide online'
                  : 'Curated content only — needs an API key'}
              </div>
            )}

            {askLoadingState && askLoading && (
              <div className="mt-4">
                <AskLoadingStateCard
                  compact
                  descriptor={askLoadingState}
                  assistantText={askLeadText}
                  toolActivities={askToolActivities}
                />
              </div>
            )}
          </div>

          {askPlan && (
            <AskPlanPanel
              plan={askPlan}
              compact={askLoading && !displayedArtifact}
            />
          )}


          {/* AI results */}
          <AnimatePresence mode="wait">
            {askLoading && !displayedArtifact ? (
              <motion.div key="loading" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
                <div className="space-y-4">
                  {askStatusHistory.length > 0 && (
                    <AskStageRail statuses={askStatusHistory} />
                  )}
                  {askStatusHistory.length > 0 && (
                    <AskStatusFeed statuses={askStatusHistory} />
                  )}
                  {askLoadingState && (
                    <AskLoadingStateCard
                      descriptor={askLoadingState}
                      assistantText={askLeadText}
                      toolActivities={askToolActivities}
                    />
                  )}
                  <ShimmerLoading tone={askLoadingState?.tone} />
                </div>
              </motion.div>
            ) : aiError ? (
              <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
                <ErrorDisplay error={aiError} onRetry={() => handleAskSubmit(query)} />
              </motion.div>
            ) : displayedArtifact ? (
              <motion.div key={`ai-${query}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-text-primary font-serif">
                    {displayedArtifact.response.summary || displayedArtifact.stage}
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      aiResponse
                        ? (aiResponse.cached ? 'bg-success' : 'bg-accent')
                        : displayedArtifact.status === 'ready'
                          ? 'bg-success'
                          : 'bg-accent',
                    )} />
                    {aiResponse
                      ? (aiResponse.cached ? 'Cached response' : 'Fresh interpretation')
                      : displayedArtifact.stage}
                  </div>
                  {!aiResponse && displayedArtifact.status !== 'ready' && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/[0.04] px-3 py-1 text-11 font-medium text-accent">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      Live artifact update
                    </div>
                  )}
                </div>

                {askStatusHistory.length > 0 && !aiResponse && (
                  <div className="mb-4 space-y-4">
                    <AskStageRail statuses={askStatusHistory} />
                    <AskStatusFeed statuses={askStatusHistory} compact />
                  </div>
                )}

                {askToolActivities.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {askToolActivities.map(activity => (
                      <div
                        key={activity.id}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-11 font-medium',
                          activity.state === 'done' && 'border-success/25 bg-success/5 text-success',
                          activity.state === 'error' && 'border-danger/20 bg-danger/5 text-danger',
                          activity.state === 'running' && 'border-accent/20 bg-accent/[0.03] text-accent',
                        )}
                      >
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          activity.state === 'done' && 'bg-success',
                          activity.state === 'error' && 'bg-danger',
                          activity.state === 'running' && 'bg-accent',
                        )} />
                        {activity.label}
                      </div>
                    ))}
                  </div>
                )}

                <BlockCanvas blocks={displayedArtifact.response.blocks} />

                {/* Action bar */}
                {aiResponse && (
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
                )}

                {/* Publish as community note */}
                {aiResponse && (
                  <ContributionComposer
                    sourceLabel="Share as a community note"
                    defaultTitle={query || aiResponse.summary}
                    defaultTakeaway={aiResponse.summary}
                    helperText="Write your own title and takeaway, then publish. Others can see, vote, and reply to your note on the Community page."
                    publishLabel="Publish note"
                    successLabel="Published"
                    viewPublishedLabel="View in Community"
                    published={publishedId !== null}
                    isPublishing={publishMutation.isPending}
                    error={(publishMutation.error as Error | null)?.message ?? null}
                    onViewPublished={publishedId != null && onOpenCommunityExploration
                      ? () => onOpenCommunityExploration(publishedId)
                      : onTabChange
                        ? () => onTabChange('community')
                        : undefined}
                    onPublish={payload => publishMutation.mutate(payload)}
                  />
                )}

                {/* Follow-ups */}
                {aiResponse && (
                  <FollowUpPrompts
                    prompts={aiResponse.followUps}
                    title="Continue questioning"
                    onSelect={handleAskSubmit}
                  />
                )}
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
            <div className="rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar">
              <div className="lab-section-title">
                Research question for simulation loop
              </div>
              <textarea
                value={questionDraft}
                onChange={e => setQuestionDraft(e.target.value)}
                placeholder="What happens to centralization if we increase gamma from 0.5 to 2.0 under local block building?"
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
                    className="rounded-lg border border-rule bg-surface-active px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-accent/30 focus:ring-2 focus:ring-accent/10"
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
                <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Research question</div>
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

      {/* Idea prompts — minimal, 3 lines */}
      {!hasAskResult && mode === 'ask' && !askLoading && (
        <div className="rounded-xl border border-rule bg-white px-5 py-5">
          <div className="space-y-1 text-13 leading-relaxed text-muted">
            <p>Ask about any mechanism, metric, or finding in the paper.</p>
            <p>Compare paradigms, question assumptions, or request evidence tables.</p>
            <p>The model reads the full study package and returns grounded answers.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 stagger-reveal">
            {ASK_SUGGESTIONS.map((s, i) => (
              <motion.button
                key={s.prompt}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: i * 0.03 }}
                onClick={() => handleSuggestionClick(s.prompt)}
                className="rounded-full border border-rule bg-surface-active/60 px-3.5 py-1.5 text-xs font-medium text-text-body transition-all hover:border-border-hover hover:bg-white hover:shadow-sm active:scale-[0.97]"
              >
                {s.label}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {!hasExperiment && mode === 'experiment' && !isCreating && (
        <div className="rounded-xl border border-rule bg-white px-5 py-5">
          <div className="space-y-1 text-13 leading-relaxed text-muted">
            <p>Describe a hypothesis you want to test against the simulation.</p>
            <p>The agent configures parameters, runs the model, and interprets results.</p>
            <p>You approve each step before it executes.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 stagger-reveal">
            {EXPERIMENT_SUGGESTIONS.map((s, i) => (
              <motion.button
                key={s.prompt}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: i * 0.03 }}
                onClick={() => handleSuggestionClick(s.prompt)}
                className="rounded-full border border-rule bg-surface-active/60 px-3.5 py-1.5 text-xs font-medium text-text-body transition-all hover:border-border-hover hover:bg-white hover:shadow-sm active:scale-[0.97]"
              >
                {s.prompt}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
