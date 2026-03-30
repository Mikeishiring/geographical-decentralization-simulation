import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, FileText } from 'lucide-react'
import { cn } from '../lib/cn'
import { DEFAULT_BLOCKS, OVERVIEW_CARD, TOPIC_CARDS, type TopicCard } from '../data/default-blocks'
import { PAPER_SECTIONS } from '../data/paper-sections'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { QueryBar } from '../components/explore/QueryBar'
import { QueryHistory, type HistoryEntry } from '../components/explore/QueryHistory'
import { ShimmerLoading } from '../components/explore/ShimmerBlock'
import { ErrorDisplay } from '../components/explore/ErrorDisplay'
import { createExploration, explore, getApiHealth, getExploration, listExplorations, publishExploration, type ExploreError, type ExploreProvenance, type ExploreResponse } from '../lib/api'
import { FollowUpPrompts } from '../components/explore/FollowUpPrompts'
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

const CANONICAL_ENTRY_IDS = ['ssp-vs-msp', 'attestation-threshold', 'initial-distribution', 'policy-implications'] as const
const PAPER_SECTION_DETAILS = new Map(PAPER_SECTIONS.map(section => [section.id, `${section.number} ${section.title}`]))

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
  const [activeTopic, setActiveTopic] = useState<TopicCard | null>(null)

  const [aiResponse, setAiResponse] = useState<ExploreResponse | null>(null)
  const [activeQuery, setActiveQuery] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ExploreError | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle')
  const [publishedContextKey, setPublishedContextKey] = useState<string | null>(null)
  const [publishedExplorationId, setPublishedExplorationId] = useState<string | null>(null)
  const [activeHash, setActiveHash] = useState(() => typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''))
  const lastSyncedQueryRef = useRef<string | null>(initialQuery)
  const lastSyncedEidRef = useRef<string | null>(initialExplorationId)

  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    enabled: isActive,
    staleTime: 30_000,
    refetchInterval: isActive ? 30_000 : false,
  })

  const communityPreviewQuery = useQuery({
    queryKey: ['explorations', 'community-preview'],
    queryFn: () => listExplorations({
      sort: 'top',
      limit: 4,
      publishedOnly: true,
    }),
    enabled: isActive,
    staleTime: 60_000,
    refetchInterval: isActive ? 60_000 : false,
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

  const resetExplorationState = () => {
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
  }

  const handleTopicClick = (card: TopicCard) => {
    resetExplorationState()
    setActiveTopic(previous => (previous?.id === card.id ? null : card))
  }

  const handleBackToOverview = () => {
    resetExplorationState()
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
    const handleHashChange = () => {
      setActiveHash(window.location.hash.replace(/^#/, ''))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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
    const explorationId = publishedExplorationId ?? aiResponse?.provenance.explorationId
    if (!explorationId) return
    const url = new URL(window.location.href)
    url.searchParams.delete('q')
    url.searchParams.set('tab', publishedExplorationId ? 'community' : 'explore')
    url.searchParams.set('eid', explorationId)
    await navigator.clipboard.writeText(url.toString())
    setShareState('copied')
    setTimeout(() => setShareState('idle'), 2000)
  }, [aiResponse, publishedExplorationId])

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
      ? 'Fresh guided readings are available. Ask about a metric, scenario, mechanism, implication, or comparison, then publish separately only if you have your own takeaway.'
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
  const promptSectionTitle = aiResponse ? 'Continue questioning this reading' : 'Try one of these guide questions'
  const canonicalClaimCards = TOPIC_CARDS.filter(card =>
    CANONICAL_ENTRY_IDS.includes(card.id as (typeof CANONICAL_ENTRY_IDS)[number]),
  )
  const communityPreviewNotes = (communityPreviewQuery.data ?? [])
    .filter(exploration => exploration.publication.published)
    .slice(0, 3)
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
  const paperSectionHint = PAPER_SECTION_DETAILS.get(activeHash) ?? null
  const interpretationBoundary = aiResponse
    ? aiResponse.provenance.canonical
      ? 'This reading is tied directly to a canonical or curated paper-backed source.'
      : 'This reading is an interpretation layer. Use it to orient yourself, then verify against the paper or the published results.'
    : showTopic
      ? 'This is an editorial lens drawn from the paper and curated findings.'
      : 'This overview is editorial guidance into the paper, not a replacement for the canonical artifacts.'

  return (
    <div>
      {/* Dynamic heading — reflects current state */}
      <div className="mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-text-primary font-serif leading-tight max-w-xl">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          {showAi || showTopic
            ? interpretationBoundary
            : 'Ask about mechanisms, scenarios, or implications. Open a canonical claim for the cleanest entry point.'}
        </p>
      </div>

      {/* QueryBar — primary interaction, always visible above the fold */}
      <div className="mb-6">
        <QueryBar
          onSubmit={handleQuery}
          loading={loading}
          disabled={queryBarDisabled}
          disabledReason={queryBarDisabledReason}
          helperText={queryBarHelperText}
        />
      </div>

      {/* Topic cards — curated entry points */}
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
              ← Back to overview
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Topic cards">
          {TOPIC_CARDS.map(card => {
            const isActive = activeTopic?.id === card.id && !showAi
            const isDimmed = (activeTopic !== null || showAi) && !isActive

            return (
              <button
                key={card.id}
                onClick={() => handleTopicClick(card)}
                aria-label={card.title}
                aria-pressed={isActive}
                className={cn(
                  'text-left rounded-lg border p-3 transition-colors',
                  isActive
                    ? 'border-accent bg-white'
                    : isDimmed
                      ? 'border-rule bg-white opacity-40'
                      : 'border-rule bg-white hover:border-border-hover',
                )}
              >
                <h4 className="text-xs font-medium text-text-primary leading-snug line-clamp-2">
                  {card.title}
                </h4>
                <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                  {card.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Paper section deep-link hint */}
      {!showAi && !showTopic && paperSectionHint && onTabChange && (
        <div className="mb-6 rounded-xl border border-accent/20 bg-accent/[0.04] px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Canonical section available</div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            This link points to {paperSectionHint} in the paper guide.
          </div>
          <button onClick={() => onTabChange('paper')} className="arrow-link mt-3">
            Open paper section
          </button>
        </div>
      )}

      {/* Canonical claims — default state only */}
      {!showAi && !showTopic && (
        <div className="mb-6">
          <div className="mb-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Start here</div>
            <div className="mt-1 text-sm font-medium text-text-primary">Canonical claims from the paper</div>
          </div>

          <div className="rounded-xl border border-rule bg-white divide-y divide-rule">
            {canonicalClaimCards.map(card => (
              <button
                key={card.id}
                onClick={() => handleTopicClick(card)}
                className="group flex w-full items-baseline justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-active/50"
              >
                <div className="min-w-0">
                  <div className="text-[0.8125rem] font-medium leading-6 text-text-primary">{card.title}</div>
                  <div className="mt-0.5 text-xs leading-5 text-muted">{card.description}</div>
                </div>
                <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <QueryHistory
        entries={history}
        onSelect={handleHistorySelect}
        activeQuery={activeQuery ?? undefined}
      />

      {/* Research integrity card — active state only */}
      {(showAi || showTopic) && (
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[displayProvenance.source] ?? 'bg-accent')} />
              {evidencePath}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-white px-4 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Research integrity</div>
                <div className="mt-2 text-sm font-medium text-text-primary">{displayProvenance.label}</div>
                <div className="mt-1 text-xs text-muted">{displayProvenance.detail || interpretationBoundary}</div>
              </div>

              <div className="flex flex-col gap-2 lg:w-auto">
                <a
                  href="https://arxiv.org/abs/2509.21475"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="arrow-link"
                >
                  Read canonical paper
                </a>
                {onTabChange && (
                  <button onClick={() => onTabChange('results')} className="arrow-link">
                    Open simulation tab
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
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
              {aiResponse.provenance.explorationId && (
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors"
                >
                  <Link2 className="w-3 h-3" />
                  {shareState === 'copied' ? 'Link copied' : publishedExplorationId ? 'Share community note' : 'Share reading'}
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
                  : onTabChange
                    ? () => onTabChange('community')
                    : undefined}
                onPublish={payload => publishMutation.mutate({
                  contextKey: readingPublishContextKey,
                  ...payload,
                })}
              />
            )}

            <FollowUpPrompts prompts={aiResponse.followUps} title={promptSectionTitle} onSelect={handleQuery} />
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
                  : onTabChange
                    ? () => onTabChange('community')
                    : undefined}
                onPublish={payload => publishMutation.mutate({
                  contextKey: readingPublishContextKey,
                  ...payload,
                })}
              />
            )}
            <FollowUpPrompts prompts={promptOptions} title={promptSectionTitle} onSelect={handleQuery} />
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
            <FollowUpPrompts prompts={promptOptions} title={promptSectionTitle} onSelect={handleQuery} />
          </motion.div>
        )}
      </AnimatePresence>

      {onTabChange && (
        <Wayfinder links={[
          { label: 'Read the full paper', hint: 'Canonical paper text with the editorial guide', onClick: () => onTabChange('paper') },
          { label: 'Open simulation', hint: 'Inspect published scenarios or run a fresh exact experiment', onClick: () => onTabChange('results') },
          {
            label: communityPreviewNotes.length > 0
              ? `Browse community notes · ${communityPreviewNotes.length} published`
              : 'Browse community notes',
            hint: 'See public human-authored responses to paper readings and exact runs',
            onClick: () => onTabChange('community'),
          },
        ]} />
      )}
    </div>
  )
}
