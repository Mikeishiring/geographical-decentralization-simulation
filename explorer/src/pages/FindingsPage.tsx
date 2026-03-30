import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, ArrowUpRight, Link2, FileText } from 'lucide-react'
import { cn } from '../lib/cn'
import { DEFAULT_BLOCKS, OVERVIEW_CARD, TOPIC_CARDS, type TopicCard } from '../data/default-blocks'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { QueryBar } from '../components/explore/QueryBar'
import { QueryHistory, type HistoryEntry } from '../components/explore/QueryHistory'
import { ShimmerLoading } from '../components/explore/ShimmerBlock'
import { ErrorDisplay } from '../components/explore/ErrorDisplay'
import { createExploration, explore, getApiHealth, getExploration, publishExploration, type ExploreError, type ExploreProvenance, type ExploreResponse } from '../lib/api'
import { NodeConstellation } from '../components/decorative/NodeConstellation'
import { ModeBanner } from '../components/layout/ModeBanner'
import { Wayfinder } from '../components/layout/Wayfinder'
import { SPRING } from '../lib/theme'
import { blocksToMarkdown } from '../lib/export'
import type { TabId } from '../components/layout/TabNav'

function upsertHistory(previous: HistoryEntry[], next: HistoryEntry): HistoryEntry[] {
  return [
    next,
    ...previous.filter(entry => entry.query !== next.query),
  ].slice(0, 8)
}

const dotColor: Record<string, string> = {
  curated: 'bg-success',
  history: 'bg-warning',
  generated: 'bg-accent',
}

function fallbackCuratedProvenance(label: string, detail: string): ExploreProvenance {
  return {
    source: 'curated',
    label,
    detail,
    canonical: true,
  }
}

export function FindingsPage({
  initialQuery = null,
  initialExplorationId = null,
  isActive = true,
  onQueryChange,
  onExplorationIdChange,
  onTabChange,
}: {
  initialQuery?: string | null
  initialExplorationId?: string | null
  isActive?: boolean
  onQueryChange?: (query: string | null) => void
  onExplorationIdChange?: (explorationId: string | null) => void
  onTabChange?: (tab: TabId) => void
}) {
  const queryClient = useQueryClient()
  const [activeTopic, setActiveTopic] = useState<TopicCard | null>(null)

  const [aiResponse, setAiResponse] = useState<ExploreResponse | null>(null)
  const [activeQuery, setActiveQuery] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ExploreError | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle')
  const [publishedContextKey, setPublishedContextKey] = useState<string | null>(null)
  const lastSyncedQueryRef = useRef<string | null>(initialQuery)
  const lastSyncedEidRef = useRef<string | null>(initialExplorationId)

  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    enabled: isActive,
    staleTime: 30_000,
    refetchInterval: isActive ? 30_000 : false,
  })

  const publishMutation = useMutation({
    mutationFn: async (input: {
      contextKey: string
      title: string
      takeaway: string
      author: string
    }) => {
      if (aiResponse) {
        let explorationId = aiResponse.provenance.explorationId
        if (!explorationId) {
          const created = await createExploration({
            query: activeQuery ?? aiResponse.summary,
            summary: aiResponse.summary,
            blocks: aiResponse.blocks,
            followUps: aiResponse.followUps,
            model: aiResponse.model,
            cached: aiResponse.cached,
            surface: 'reading',
          })
          explorationId = created.id
        }

        return await publishExploration(explorationId, {
          title: input.title,
          takeaway: input.takeaway,
          author: input.author || undefined,
        })
      }

      if (activeTopic) {
        const created = await createExploration({
          query: activeTopic.title,
          summary: activeTopic.description,
          blocks: activeTopic.blocks,
          followUps: activeTopic.prompts,
          model: '',
          cached: false,
          surface: 'reading',
        })

        return await publishExploration(created.id, {
          title: input.title,
          takeaway: input.takeaway,
          author: input.author || undefined,
        })
      }

      throw new Error('There is no active reading to publish.')
    },
    onSuccess: (published, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
      setPublishedContextKey(variables.contextKey)
      setAiResponse(previous => previous
        ? {
            ...previous,
            provenance: {
              ...previous.provenance,
              explorationId: published.id,
            },
          }
        : previous)
    },
  })

  const handleTopicClick = (card: TopicCard) => {
    publishMutation.reset()
    lastSyncedQueryRef.current = null
    lastSyncedEidRef.current = null
    setAiResponse(null)
    setActiveQuery(null)
    setError(null)
    setLoading(false)
    setActiveTopic(previous => (previous?.id === card.id ? null : card))
    onQueryChange?.(null)
    onExplorationIdChange?.(null)
  }

  const handleBackToOverview = () => {
    publishMutation.reset()
    lastSyncedQueryRef.current = null
    lastSyncedEidRef.current = null
    setActiveTopic(null)
    setAiResponse(null)
    setActiveQuery(null)
    setError(null)
    setLoading(false)
    onQueryChange?.(null)
    onExplorationIdChange?.(null)
  }

  const handleQuery = useCallback(async (
    query: string,
    options?: {
      readonly syncRoute?: boolean
    },
  ) => {
    publishMutation.reset()
    if (options?.syncRoute !== false) {
      lastSyncedQueryRef.current = query
      onQueryChange?.(query)
      onExplorationIdChange?.(null)
    }
    lastSyncedEidRef.current = null
    setActiveTopic(null)
    setActiveQuery(query)
    setAiResponse(null)
    setError(null)
    setLoading(true)

    const result = await explore(
      query,
      history.map(entry => ({ query: entry.query, summary: entry.summary })),
    )

    setLoading(false)

    if (result.ok) {
      setAiResponse(result.data)
      onExplorationIdChange?.(result.data.provenance.explorationId ?? null)
      setHistory(previous => upsertHistory(previous, {
        query,
        summary: result.data.summary,
        response: result.data,
        timestamp: Date.now(),
      }))
    } else {
      setError(result.error)
    }
  }, [history, onExplorationIdChange, onQueryChange, publishMutation])

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    publishMutation.reset()
    lastSyncedQueryRef.current = entry.query
    lastSyncedEidRef.current = entry.response.provenance.explorationId ?? null
    setActiveTopic(null)
    setActiveQuery(entry.query)
    setAiResponse(entry.response)
    setError(null)
    setLoading(false)
    onQueryChange?.(entry.query)
    onExplorationIdChange?.(entry.response.provenance.explorationId ?? null)
  }, [onExplorationIdChange, onQueryChange, publishMutation])

  const handleRetry = useCallback(() => {
    if (activeQuery) handleQuery(activeQuery)
  }, [activeQuery, handleQuery])

  useEffect(() => {
    if (!isActive) return

    if (!initialQuery) {
      if (lastSyncedQueryRef.current !== null) {
        lastSyncedQueryRef.current = null
        setActiveTopic(null)
        setAiResponse(null)
        setActiveQuery(null)
        setError(null)
        setLoading(false)
      }
      return
    }

    if (initialQuery === lastSyncedQueryRef.current) return
    lastSyncedQueryRef.current = initialQuery
    void handleQuery(initialQuery, { syncRoute: false })
  }, [handleQuery, initialQuery, isActive])

  // Deep-link by exploration ID (?eid=...)
  useEffect(() => {
    if (!isActive) return
    if (!initialExplorationId) {
      if (lastSyncedEidRef.current !== null) {
        lastSyncedEidRef.current = null
      }
      return
    }
    if (initialExplorationId === lastSyncedEidRef.current) return
    lastSyncedEidRef.current = initialExplorationId

    void (async () => {
      setActiveTopic(null)
      setLoading(true)
      setError(null)
      setAiResponse(null)

      try {
        const exploration = await getExploration(initialExplorationId)
        onExplorationIdChange?.(exploration.id)
        setPublishedContextKey(exploration.publication.published ? `reading:${exploration.query}` : null)
        setActiveQuery(exploration.query)
        setAiResponse({
          summary: exploration.summary,
          blocks: exploration.blocks,
          followUps: exploration.followUps,
          model: exploration.model,
          cached: exploration.cached,
          provenance: {
            source: 'history',
            label: exploration.publication.published ? 'Community contribution' : 'Saved reading',
            detail: exploration.publication.published
              ? `Deep-linked published contribution ${exploration.id}`
              : `Deep-linked saved reading ${exploration.id}`,
            canonical: false,
            explorationId: exploration.id,
          },
        })
      } catch {
        setError({ error: 'Could not load shared exploration. It may have been removed.', status: 404 })
      }

      setLoading(false)
    })()
  }, [initialExplorationId, isActive, onExplorationIdChange])

  const handleShare = useCallback(async () => {
    const explorationId = aiResponse?.provenance.explorationId
    if (!explorationId) return
    const url = new URL(window.location.href)
    url.searchParams.delete('q')
    url.searchParams.delete('tab')
    url.searchParams.set('eid', explorationId)
    await navigator.clipboard.writeText(url.toString())
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 2000)
  }, [aiResponse])

  const handleExportMarkdown = useCallback(async () => {
    const response = aiResponse
    const blocks = response?.blocks
    if (!response || !blocks?.length) return
    const markdown = blocksToMarkdown(activeQuery ?? 'Exploration', response.summary, blocks)
    await navigator.clipboard.writeText(markdown)
    setExportState('copied')
    setTimeout(() => setExportState('idle'), 2000)
  }, [aiResponse, activeQuery])

  const showAi = aiResponse !== null || loading || error !== null
  const showTopic = activeTopic !== null && !showAi

  const heading = aiResponse
    ? aiResponse.summary
    : showTopic && activeTopic
      ? activeTopic.title
      : 'Start with the paper’s sharpest questions'

  const displayProvenance = aiResponse?.provenance
    ?? (showTopic && activeTopic
      ? fallbackCuratedProvenance('Curated topic card', 'Editorial paper finding selected from the curated findings library.')
      : fallbackCuratedProvenance('Curated overview', "Editorial overview assembled from the paper's main findings and caveats."))
  const queryBarDisabled = apiHealthQuery.isError
  const queryBarDisabledReason = apiHealthQuery.isError
    ? 'The API server is unreachable right now.'
    : undefined
  const queryBarHelperText = apiHealthQuery.isError
    ? 'The API server is unreachable. Start the explorer API to restore live and cached query routing.'
    : apiHealthQuery.data?.anthropicEnabled
      ? 'Fresh guided readings are available. Ask about a metric, scenario, mechanism, implication, or comparison for the strongest answers.'
      : apiHealthQuery.data
        ? 'Fresh guided readings are offline. Curated and prior readings still work, but fresh interpretation needs ANTHROPIC_API_KEY in explorer/.env.'
        : 'Checking reading-guide availability. Best prompts mention a paradigm, metric, experiment, implication, or comparison.'
  const evidencePath = aiResponse
    ? aiResponse.provenance.source === 'curated'
      ? 'Curated paper finding'
      : aiResponse.provenance.source === 'history'
        ? 'Prior saved exploration'
        : aiResponse.cached
          ? 'Fresh interpretation with cached study context'
          : 'Fresh interpretation from current study context'
    : showTopic
      ? 'Curated paper finding'
      : 'Editorial default state'
  const promptOptions = aiResponse
    ? aiResponse.followUps
    : activeTopic?.prompts ?? OVERVIEW_CARD.prompts
  const promptSectionTitle = aiResponse ? 'Keep exploring' : 'Try one of these questions'
  const policyCard = TOPIC_CARDS.find(card => card.id === 'policy-implications') ?? null
  const readingPublishContextKey = aiResponse
    ? `reading:${activeQuery ?? aiResponse.summary}`
    : showTopic && activeTopic
      ? `topic:${activeTopic.id}`
      : null
  const readingPublishTitle = aiResponse
    ? activeQuery ?? aiResponse.summary
    : showTopic && activeTopic
      ? activeTopic.title
      : ''
  const readingPublishTakeaway = aiResponse
    ? aiResponse.summary
    : showTopic && activeTopic
      ? activeTopic.description
      : ''
  const readingPublishHelper = aiResponse
    ? 'Add your own title and takeaway before publishing. This turns a guided reading into an intentional community note instead of dumping raw model output into the feed.'
    : 'Publishing a curated lens still requires your own title and takeaway. Community notes should carry a human-authored framing layer, not just the default card.'
  const currentReadingPublished = readingPublishContextKey !== null && publishedContextKey === readingPublishContextKey
  const interpretationBoundary = aiResponse
    ? aiResponse.provenance.canonical
      ? 'This reading is tied directly to a canonical or curated paper-backed source.'
      : 'This reading is an interpretation layer. Use it to orient yourself, then verify against the paper or the published results.'
    : showTopic
      ? 'This is an editorial lens drawn from the paper and curated findings.'
      : 'This overview is editorial guidance into the paper, not a replacement for the canonical artifacts.'

  return (
    <div>
      <div className="mb-5">
        <ModeBanner
          eyebrow="Mode"
          title="Curated questions, implications, and guided readings"
          detail="Use this page for bounded, paper-backed questions. The responses can synthesize and interpret, but the paper and published results remain the canonical sources, and only intentionally published notes enter the community surface."
          tone="interpretation"
        />
      </div>

      {/* Page header with constellation decoration */}
      <div className="mb-6 relative">
        <NodeConstellation className="absolute right-0 top-0 w-32 h-32 opacity-40 pointer-events-none hidden sm:block" />

        <p className="text-[11px] text-text-faint mb-2 leading-relaxed max-w-xl">
          An interactive companion for the geo-decentralization paper. Pick a lens below, or ask a question about latency, concentration metrics, or protocol design.
        </p>
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary font-serif leading-tight max-w-lg">
          Start with the paper’s sharpest questions.
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Curated lenses for the stakes, protocol tradeoffs, paradoxes, and model limitations. Then ask a bounded question.
        </p>

        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Curated lenses
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            Prior readings
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent dot-pulse" />
            Fresh interpretation
          </span>
        </div>

        <div className="mt-3">
          <QueryBar
            onSubmit={handleQuery}
            loading={loading}
            disabled={queryBarDisabled}
            disabledReason={queryBarDisabledReason}
            helperText={queryBarHelperText}
          />
        </div>
      </div>
      <QueryHistory
        entries={history}
        onSelect={handleHistorySelect}
        activeQuery={activeQuery ?? undefined}
      />

      {/* Topic cards */}
      <div className="mb-8">
        {policyCard && (
          <div className="mb-4 rounded-xl border border-warning/30 bg-warning/6 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Protocol and policy lens</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              Read the paper as a design-tradeoff argument, not only as a mechanism explainer.
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              This lens pulls the implications angle into the top-level Findings flow: shorter slots, threshold tuning, and infrastructure geography all shift incentives differently, and the paper is stronger on diagnosis than on a single validated fix.
            </p>
            <button
              onClick={() => handleTopicClick(policyCard)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent transition-colors hover:text-accent/80"
            >
              Open implications lens
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-muted">
            Start with a lens
          </span>
          {(showTopic || showAi) && (
            <button
              onClick={handleBackToOverview}
              className="flex items-center gap-1 text-xs text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to overview
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Topic cards">
          {TOPIC_CARDS.map(card => {
            const isActive = activeTopic?.id === card.id && !showAi
            const isDimmed = (activeTopic !== null || showAi) && !isActive

            return (
              <motion.button
                key={card.id}
                onClick={() => handleTopicClick(card)}
                layout
                whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                whileTap={{ scale: 0.985 }}
                transition={SPRING}
                aria-label={card.title}
                aria-pressed={isActive}
                className={cn(
                  'text-left rounded-lg border p-4 transition-all topo-bg group',
                  isActive
                    ? 'border-accent bg-white'
                    : isDimmed
                      ? 'border-border-subtle bg-white opacity-40'
                      : 'border-border-subtle bg-white hover:border-border-hover',
                )}
              >
                <h4 className="text-xs font-medium text-text-primary leading-snug mb-1 line-clamp-2">
                  {card.title}
                </h4>
                <p className="text-xs text-muted leading-relaxed line-clamp-2 mb-2">
                  {card.description}
                </p>
                <span className={cn(
                  'flex items-center gap-1 text-xs',
                  isActive ? 'text-accent' : 'text-text-faint',
                )}>
                  {isActive ? 'Viewing' : 'Explore'}
                  {!isActive && <ArrowRight className="w-2.5 h-2.5" />}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="topo-divider mb-6" />

      {/* Active lens */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold text-text-primary font-serif truncate">
            {heading}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-muted shrink-0">
            <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[displayProvenance.source] ?? 'bg-accent')} />
            {evidencePath}
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Research integrity</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{displayProvenance.label}</div>
              <div className="mt-1 text-sm text-muted">{displayProvenance.detail || interpretationBoundary}</div>
              <div className="mt-2 text-xs text-muted">
                Truth boundary: {interpretationBoundary}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:w-[340px]">
              <a
                href="https://arxiv.org/abs/2509.21475"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary transition-colors hover:border-border-hover"
              >
                <span>Read canonical paper</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
              </a>
              {onTabChange && (
                <button
                  onClick={() => onTabChange('results')}
                  className="inline-flex items-center justify-between rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary transition-colors hover:border-border-hover"
                >
                  <span>Open published results</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <ShimmerLoading />
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <ErrorDisplay error={error} onRetry={handleRetry} />
          </motion.div>
        ) : aiResponse ? (
          <motion.div
            key={`ai-${activeQuery}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <BlockCanvas blocks={aiResponse.blocks} />

            {/* Share + Export actions */}
            <div className="mt-4 flex items-center gap-3 text-xs">
              {aiResponse.provenance.explorationId && (
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors"
                >
                  <Link2 className="w-3 h-3" />
                  {shareState === 'copied' ? 'Link copied' : 'Share exploration'}
                </button>
              )}
              <button
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors"
              >
                <FileText className="w-3 h-3" />
                {exportState === 'copied' ? 'Markdown copied' : 'Copy as markdown'}
              </button>
            </div>

            {readingPublishContextKey && (
              <ContributionComposer
                key={readingPublishContextKey}
                sourceLabel="Turn this reading into an intentional community note"
                defaultTitle={readingPublishTitle}
                defaultTakeaway={readingPublishTakeaway}
                helperText={readingPublishHelper}
              publishLabel="Publish human-authored note"
              successLabel="Note published"
              viewPublishedLabel="View published"
              published={currentReadingPublished}
              isPublishing={publishMutation.isPending}
              error={(publishMutation.error as Error | null)?.message ?? null}
              onViewPublished={onTabChange ? () => onTabChange('explore') : undefined}
              onPublish={payload => publishMutation.mutate({
                contextKey: readingPublishContextKey,
                ...payload,
                })}
              />
            )}

            {aiResponse.followUps.length > 0 && (
              <div className="mt-6 pt-4 border-t border-rule">
                <span className="text-xs text-muted mb-2 block">
                  {promptSectionTitle}
                </span>
                <div className="flex flex-wrap gap-2">
                  {promptOptions.map((query, index) => (
                    <button
                      key={`${query}-${index}`}
                      onClick={() => handleQuery(query)}
                      className="text-xs text-muted hover:text-accent transition-colors group/followup"
                      title={`Ask: ${query}`}
                    >
                      <span className="group-hover/followup:underline underline-offset-2">{query}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : showTopic && activeTopic ? (
          <motion.div
            key={activeTopic.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <BlockCanvas blocks={activeTopic.blocks} />
            {readingPublishContextKey && (
              <ContributionComposer
                key={readingPublishContextKey}
                sourceLabel="Publish this curated lens as a community reading"
                defaultTitle={readingPublishTitle}
                defaultTakeaway={readingPublishTakeaway}
                helperText={readingPublishHelper}
                publishLabel="Publish human-authored note"
                successLabel="Note published"
                viewPublishedLabel="View published"
                published={currentReadingPublished}
                isPublishing={publishMutation.isPending}
                error={(publishMutation.error as Error | null)?.message ?? null}
                onViewPublished={onTabChange ? () => onTabChange('explore') : undefined}
                onPublish={payload => publishMutation.mutate({
                  contextKey: readingPublishContextKey,
                  ...payload,
                })}
              />
            )}
            {promptOptions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-rule">
                <span className="text-xs text-muted mb-2 block">
                  {promptSectionTitle}
                </span>
                <div className="flex flex-wrap gap-2">
                  {promptOptions.map((query, index) => (
                    <button
                      key={`${query}-${index}`}
                      onClick={() => handleQuery(query)}
                      className="text-xs text-muted hover:text-accent transition-colors group/followup"
                      title={`Ask: ${query}`}
                    >
                      <span className="group-hover/followup:underline underline-offset-2">{query}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <BlockCanvas blocks={DEFAULT_BLOCKS} />
            {promptOptions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-rule">
                <span className="text-xs text-muted mb-2 block">
                  {promptSectionTitle}
                </span>
                <div className="flex flex-wrap gap-2">
                  {promptOptions.map((query, index) => (
                    <button
                      key={`${query}-${index}`}
                      onClick={() => handleQuery(query)}
                      className="text-xs text-muted hover:text-accent transition-colors group/followup"
                      title={`Ask: ${query}`}
                    >
                      <span className="group-hover/followup:underline underline-offset-2">{query}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {onTabChange && (
        <Wayfinder links={[
          { label: 'Read the full paper', hint: 'Editorial reading guide with annotations', onClick: () => onTabChange('paper') },
          { label: 'Run a simulation', hint: 'Test parameters with the exact model', onClick: () => onTabChange('results') },
        ]} />
      )}
    </div>
  )
}
