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

function summarizeTopicCard(card: TopicCard): readonly string[] {
  const tags: string[] = []
  const blockTypes = new Set(card.blocks.map(block => block.type))
  if (blockTypes.has('chart') || blockTypes.has('timeseries')) tags.push('charts')
  if (blockTypes.has('table')) tags.push('data table')
  if (blockTypes.has('comparison')) tags.push('comparison')
  if (card.blocks.some(block => block.type === 'insight' && block.emphasis === 'surprising')) {
    tags.push('surprising')
  }
  if (card.blocks.some(block => block.type === 'caveat')) tags.push('caveat')
  return tags.slice(0, 3)
}

export function FindingsPage({
  initialQuery = null,
  initialExplorationId = null,
  isActive = true,
  onQueryChange,
  onExplorationIdChange,
  onOpenCommunityExploration,
  onTabChange,
}: {
  initialQuery?: string | null
  initialExplorationId?: string | null
  isActive?: boolean
  onQueryChange?: (query: string | null) => void
  onExplorationIdChange?: (explorationId: string | null) => void
  onOpenCommunityExploration?: (explorationId: string) => void
  onTabChange?: (tab: TabId) => void
}) {
  const queryClient = useQueryClient()
  const [activeTopic, setActiveTopic] = useState<TopicCard | null>(() => {
    const topicParam = new URLSearchParams(window.location.search).get('topic')
    if (!topicParam) return null
    return TOPIC_CARDS.find(card => card.id === topicParam) ?? null
  })

  const [aiResponse, setAiResponse] = useState<ExploreResponse | null>(null)
  const [activeQuery, setActiveQuery] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ExploreError | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle')
  const [publishedContextKey, setPublishedContextKey] = useState<string | null>(null)
  const [publishedExplorationId, setPublishedExplorationId] = useState<string | null>(null)
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
      setPublishedExplorationId(published.id)
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
    setPublishedExplorationId(null)
    lastSyncedQueryRef.current = null
    lastSyncedEidRef.current = null
    setAiResponse(null)
    setActiveQuery(null)
    setError(null)
    setLoading(false)
    const nextTopic = activeTopic?.id === card.id ? null : card
    setActiveTopic(nextTopic)
    onQueryChange?.(null)
    onExplorationIdChange?.(null)
    const url = new URL(window.location.href)
    if (nextTopic) {
      url.searchParams.set('topic', nextTopic.id)
    } else {
      url.searchParams.delete('topic')
    }
    window.history.replaceState({}, '', url.toString())
  }

  const handleBackToOverview = () => {
    publishMutation.reset()
    setPublishedExplorationId(null)
    lastSyncedQueryRef.current = null
    lastSyncedEidRef.current = null
    setActiveTopic(null)
    setAiResponse(null)
    setActiveQuery(null)
    setError(null)
    setLoading(false)
    onQueryChange?.(null)
    onExplorationIdChange?.(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('topic')
    window.history.replaceState({}, '', url.toString())
  }

  const handleQuery = useCallback(async (
    query: string,
    options?: {
      readonly syncRoute?: boolean
    },
  ) => {
    publishMutation.reset()
    setPublishedExplorationId(null)
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
    setPublishedExplorationId(entry.response.provenance.explorationId ?? null)
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
        setPublishedExplorationId(exploration.publication.published ? exploration.id : null)
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
    const explorationId = publishedExplorationId
    if (!explorationId) return
    const url = new URL(window.location.href)
    url.searchParams.delete('q')
    url.searchParams.set('tab', 'history')
    url.searchParams.set('eid', explorationId)
    await navigator.clipboard.writeText(url.toString())
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 2000)
  }, [publishedExplorationId])

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
      : "Start with the paper's sharpest questions"

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
        ? 'Saved reading reuse'
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
  const canShareCommunityNote = Boolean(publishedExplorationId && currentReadingPublished)
  const interpretationBoundary = aiResponse
    ? aiResponse.provenance.canonical
      ? 'This reading is tied directly to a canonical or curated paper-backed source.'
      : 'This reading is an interpretation layer. Use it to orient yourself, then verify against the paper or the published results.'
    : showTopic
      ? 'This is an editorial lens drawn from the paper and curated findings.'
      : 'This overview is editorial guidance into the paper, not a replacement for the canonical artifacts.'

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary font-serif leading-tight max-w-lg">
          What did this paper find?
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Ask a bounded question, open a curated lens, then move into published scenarios or community notes when you want to verify a claim beyond the summary layer.
        </p>
      </div>

      <div className="mb-6">
        <QueryBar
          onSubmit={handleQuery}
          loading={loading}
          disabled={queryBarDisabled}
          disabledReason={queryBarDisabledReason}
          helperText={queryBarHelperText}
        />
      </div>

      {/* Topic cards — go deeper into specific findings */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-muted">
            {showTopic || showAi ? 'Curated lenses' : 'Go deeper'}
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
                whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
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
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-text-faint">{card.blocks.length} blocks</span>
                  {summarizeTopicCard(card).map(tag => (
                    <span
                      key={tag}
                      className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-faint"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
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

        {policyCard && !showAi && !showTopic && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/6 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Protocol and policy lens</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              Read the paper as a design-tradeoff argument, not only as a mechanism explainer.
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              Shorter slots, threshold tuning, and infrastructure geography all shift incentives differently. The paper is stronger on diagnosis than on a single validated fix.
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
      </div>

      {/* Navigation cards — cross-tab + canonical sources (default state only) */}
      {!showAi && !showTopic && (
        <div className="mb-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {onTabChange && (
            <button
              onClick={() => onTabChange('paper')}
              className="rounded-xl border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover"
            >
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Read the source</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Open the paper guide</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                Editorial reading guide through the full paper, section by section.
              </div>
            </button>
          )}

          {onTabChange && (
            <button
              onClick={() => onTabChange('results')}
              className="rounded-xl border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover"
            >
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Verify with data</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Browse published results</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                Canonical scenarios and a simulation runner to test claims against the artifacts.
              </div>
            </button>
          )}

          <a
            href="https://arxiv.org/abs/2509.21475"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border-subtle bg-white px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-border-hover"
          >
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Canonical paper</div>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium text-text-primary">
              <span>Open arXiv source</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              Yang, Oz, Wu, Zhang (2025) — the full paper this explorer is built on.
            </div>
          </a>

          <a
            href="https://github.com/syang-ng/geographical-decentralization-simulation"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border-subtle bg-white px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-border-hover"
          >
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Implementation source</div>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium text-text-primary">
              <span>Open repository</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              Simulation code, data, and this explorer — all open source.
            </div>
          </a>
        </div>
      )}

      <QueryHistory
        entries={history}
        onSelect={handleHistorySelect}
        activeQuery={activeQuery ?? undefined}
      />

      {/* Active lens / AI response area — only when exploring */}
      {(showAi || showTopic) && (
        <>
          <div className="topo-divider mb-6" />

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

            <p className="text-xs text-muted">{interpretationBoundary}</p>
          </div>
        </>
      )}

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

            <div className="mt-4 flex items-center gap-3 text-xs">
              {canShareCommunityNote && (
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors"
                >
                  <Link2 className="w-3 h-3" />
                  {shareState === 'copied' ? 'Link copied' : 'Copy community link'}
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
                successLabel="Published human-authored note"
                viewPublishedLabel="Open Community"
                published={currentReadingPublished}
                isPublishing={publishMutation.isPending}
                error={(publishMutation.error as Error | null)?.message ?? null}
                onViewPublished={publishedExplorationId && onOpenCommunityExploration
                  ? () => onOpenCommunityExploration(publishedExplorationId)
                  : undefined}
                onPublish={payload => publishMutation.mutate({
                  contextKey: readingPublishContextKey,
                  ...payload,
                })}
              />
            )}

            <ReadingBridgePanel
              currentReadingPublished={currentReadingPublished}
              publishedExplorationId={publishedExplorationId}
              onOpenCommunityExploration={onOpenCommunityExploration}
              onTabChange={onTabChange}
            />

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
                onViewPublished={publishedExplorationId && onOpenCommunityExploration
                  ? () => onOpenCommunityExploration(publishedExplorationId)
                  : undefined}
                onPublish={payload => publishMutation.mutate({
                  contextKey: readingPublishContextKey,
                  ...payload,
                })}
              />
            )}
            <ReadingBridgePanel
              currentReadingPublished={currentReadingPublished}
              publishedExplorationId={publishedExplorationId}
              onOpenCommunityExploration={onOpenCommunityExploration}
              onTabChange={onTabChange}
            />
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
          { label: 'Read the full paper', hint: 'Canonical paper text with the editorial guide', onClick: () => onTabChange('paper') },
          { label: 'Open simulation', hint: 'Inspect published scenarios or run a fresh exact experiment', onClick: () => onTabChange('results') },
          { label: 'Start a fresh question', hint: 'Reset the page and ask a sharper paper-backed prompt', onClick: handleBackToOverview },
        ]} />
      )}
    </div>
  )
}

function ReadingBridgePanel({
  currentReadingPublished,
  publishedExplorationId,
  onOpenCommunityExploration,
  onTabChange,
}: {
  readonly currentReadingPublished: boolean
  readonly publishedExplorationId: string | null
  readonly onOpenCommunityExploration?: (explorationId: string) => void
  readonly onTabChange?: (tab: TabId) => void
}) {
  if (!onTabChange && !(currentReadingPublished && publishedExplorationId && onOpenCommunityExploration)) {
    return null
  }

  const openCommunity = currentReadingPublished && publishedExplorationId && onOpenCommunityExploration
    ? () => onOpenCommunityExploration(publishedExplorationId)
    : undefined

  const communityTitle = currentReadingPublished
    ? 'Open community note'
    : 'Keep it private or publish'
  const communityDetail = currentReadingPublished
    ? 'This reading now lives on the Community surface with your human title and takeaway.'
    : 'Readings can stay private context. Publish only after you have added your own framing.'

  return (
    <div className="mt-5 rounded-xl border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,246,242,0.96))] px-4 py-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Cross-check and handoff</div>
      <div className="mt-1 text-sm font-medium text-text-primary">
        Move this reading across the rest of the explorer without losing the thread.
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <button
          onClick={() => onTabChange?.('paper')}
          disabled={!onTabChange}
          className="rounded-lg border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-border-subtle"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Source text</div>
          <div className="mt-2 text-sm font-medium text-text-primary">Read the paper guide</div>
          <div className="mt-1 text-xs leading-5 text-muted">
            Verify the claim against the paper’s section structure and caveats.
          </div>
        </button>

        <button
          onClick={() => onTabChange?.('results')}
          disabled={!onTabChange}
          className="rounded-lg border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-border-subtle"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Artifact check</div>
          <div className="mt-2 text-sm font-medium text-text-primary">Open simulation</div>
          <div className="mt-1 text-xs leading-5 text-muted">
            Compare the reading against published scenarios or a fresh exact run.
          </div>
        </button>

        <button
          onClick={openCommunity}
          disabled={!openCommunity}
          className="rounded-lg border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-border-subtle"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Public framing</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{communityTitle}</div>
          <div className="mt-1 text-xs leading-5 text-muted">
            {communityDetail}
          </div>
        </button>
      </div>
    </div>
  )
}
