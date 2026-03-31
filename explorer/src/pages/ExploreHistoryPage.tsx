import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ArrowUpDown, ThumbsUp, ThumbsDown, Tag, ChevronDown, ChevronUp, Users, Sparkles, Link2 } from 'lucide-react'
import { NodeArc } from '../components/decorative/NodeArc'
import { getExploration, listExplorations, voteExploration, type Exploration } from '../lib/api'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { cn } from '../lib/cn'
import { SPRING_CRISP, SPRING_SOFT, STAGGER_CONTAINER } from '../lib/theme'
import type { TabId } from '../components/layout/TabNav'

type SortMode = 'recent' | 'top'

function archiveState(exploration: Exploration): string {
  if (exploration.publication.published) {
    return 'Published human note'
  }
  return exploration.surface === 'simulation' ? 'Saved exact-run interpretation' : 'Saved reading interpretation'
}

function surfaceLabel(exploration: Exploration): string {
  return exploration.surface === 'simulation' ? 'Exact-run surface' : 'Paper-reading surface'
}

function cardTitle(exploration: Exploration): string {
  return exploration.publication.published
    ? exploration.publication.title
    : exploration.query
}

function cardSummary(exploration: Exploration): string {
  return exploration.publication.published
    ? exploration.publication.takeaway
    : `Saved interpretation: ${exploration.summary}`
}

function cardTimestamp(exploration: Exploration): string {
  return exploration.publication.publishedAt ?? exploration.createdAt
}

export function ExploreHistoryPage({
  initialExplorationId = null,
  onGoToFindings,
  onOpenQuery,
  onTabChange,
}: {
  readonly initialExplorationId?: string | null
  readonly onGoToFindings?: () => void
  readonly onOpenQuery?: (query: string) => void
  readonly onTabChange?: (tab: TabId) => void
} = {}) {
  const [sort, setSort] = useState<SortMode>('recent')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: explorations = [], isLoading } = useQuery({
    queryKey: ['explorations', sort, search, 'published'],
    queryFn: () => listExplorations({
      sort,
      search: search || undefined,
      limit: 120,
      publishedOnly: true,
    }),
  })

  const deepLinkedExplorationQuery = useQuery({
    queryKey: ['exploration', initialExplorationId],
    queryFn: () => getExploration(initialExplorationId!),
    enabled: Boolean(initialExplorationId) && !explorations.some(exploration => exploration.id === initialExplorationId),
    staleTime: 30_000,
  })

  const voteMutation = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: 1 | -1 }) =>
      voteExploration(id, delta),
    onMutate: async ({ id, delta }) => {
      await queryClient.cancelQueries({ queryKey: ['explorations'] })
      const previous = queryClient.getQueryData<Exploration[]>(['explorations', sort, search, 'published'])

      queryClient.setQueryData<Exploration[]>(
        ['explorations', sort, search, 'published'],
        old => old?.map(entry => (entry.id === id ? { ...entry, votes: entry.votes + delta } : entry)) ?? [],
      )

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['explorations', sort, search, 'published'], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
    },
  })

  const toggleSort = () => setSort(previous => (previous === 'recent' ? 'top' : 'recent'))
  const toggleExpand = (id: string) => setExpandedId(previous => (previous === id ? null : id))
  const deepLinkedExploration = deepLinkedExplorationQuery.data ?? null
  const deepLinkedPublishedExploration = deepLinkedExploration?.publication.published
    ? deepLinkedExploration
    : null
  const hiddenDraftExploration = deepLinkedExploration && !deepLinkedExploration.publication.published
    ? deepLinkedExploration
    : null
  const displayedExplorations = useMemo(() => (
    deepLinkedPublishedExploration
      && !explorations.some(exploration => exploration.id === deepLinkedPublishedExploration.id)
      ? [deepLinkedPublishedExploration, ...explorations]
      : explorations
  ), [deepLinkedPublishedExploration, explorations])

  useEffect(() => {
    if (!initialExplorationId || !displayedExplorations.some(exploration => exploration.id === initialExplorationId)) {
      return
    }

    setExpandedId(initialExplorationId)
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`community-note-${initialExplorationId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [displayedExplorations, initialExplorationId])

  const handleShare = async (explorationId: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'community')
    url.searchParams.delete('q')
    url.searchParams.set('eid', explorationId)
    await navigator.clipboard.writeText(url.toString())
    setSharedId(explorationId)
    window.setTimeout(() => {
      setSharedId(previous => (previous === explorationId ? null : previous))
    }, 2_000)
  }

  const featuredContributions = displayedExplorations.filter(exploration =>
    exploration.publication.published && (exploration.publication.featured || exploration.verified),
  )
  const featuredIds = new Set(featuredContributions.map(exploration => exploration.id))
  const communityContributions = displayedExplorations.filter(exploration =>
    exploration.publication.published && !featuredIds.has(exploration.id),
  )
  const publishedReadingNotes = displayedExplorations.filter(exploration => exploration.surface === 'reading')
  const publishedSimulationNotes = displayedExplorations.filter(exploration => exploration.surface === 'simulation')

  if ((isLoading || deepLinkedExplorationQuery.isLoading) && displayedExplorations.length === 0) {
    return <LoadingSkeleton />
  }

  if (displayedExplorations.length === 0 && !search && !deepLinkedExplorationQuery.isLoading && !hiddenDraftExploration) {
    return <EmptyState onGoToFindings={onGoToFindings} onTabChange={onTabChange} />
  }

  return (
    <div className="space-y-6">
      {(onGoToFindings || onTabChange) && (
        <div className="rounded-xl border border-rule bg-white px-5 py-5">
          <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Read evidence, then publish</span>
          <div className="mt-1 text-[0.8125rem] font-medium text-text-primary">Community works best when notes start from a canonical reading or an exact run, not from raw guide output.</div>

          <div className="mt-4 divide-y divide-rule">
            {onGoToFindings && (
              <button
                onClick={onGoToFindings}
                className="group flex w-full items-baseline justify-between gap-4 py-3 text-left"
              >
                <div>
                  <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Paper-backed reading</span>
                  <div className="mt-0.5 text-[0.8125rem] font-medium text-text-primary group-hover:text-accent transition-colors">Start in Explore</div>
                  <div className="mt-0.5 text-xs leading-5 text-muted">Open a canonical claim or ask a bounded question before writing a public note.</div>
                </div>
                <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
              </button>
            )}
            {onTabChange && (
              <button
                onClick={() => onTabChange('agent')}
                className="group flex w-full items-baseline justify-between gap-4 py-3 text-left"
              >
                <div>
                  <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Exact evidence</span>
                  <div className="mt-0.5 text-[0.8125rem] font-medium text-text-primary group-hover:text-accent transition-colors">Open Results</div>
                  <div className="mt-0.5 text-xs leading-5 text-muted">Read the published replay first, then run an exact scenario only when the fixed evidence is not enough.</div>
                </div>
                <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
              </button>
            )}
            {onTabChange && (
              <button
                onClick={() => onTabChange('paper')}
                className="group flex w-full items-baseline justify-between gap-4 py-3 text-left"
              >
                <div>
                  <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Canonical argument</span>
                  <div className="mt-0.5 text-[0.8125rem] font-medium text-text-primary group-hover:text-accent transition-colors">Read the paper</div>
                  <div className="mt-0.5 text-xs leading-5 text-muted">Go section by section through the paper when you want the exact claim, method, or caveat.</div>
                </div>
                <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="stagger-reveal grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<Users className="h-4 w-4 text-accent" />}
          label="Published reading notes"
          value={publishedReadingNotes.length}
          detail="Reader-written notes that started from Findings or a saved paper reading."
        />
        <SummaryCard
          icon={<Sparkles className="h-4 w-4 text-warning" />}
          label="Published exact-run notes"
          value={publishedSimulationNotes.length}
          detail="Reader-written notes layered on top of exact manifests, figures, and artifacts."
        />
        <SummaryCard
          icon={<Sparkles className="h-4 w-4 text-accent-warm" />}
          label="Featured or verified"
          value={featuredContributions.length}
          detail="Researcher-verified or editorially surfaced notes."
        />
      </div>

      <div className="rounded-xl border border-rule bg-white px-5 py-4">
        <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Community standard</span>
        <div className="stagger-reveal mt-3 divide-y divide-rule">
          {[
            {
              title: 'Lead with observation',
              detail: 'Start from what the paper, chart, or exact run actually shows before adding your interpretation.',
            },
            {
              title: 'Label the inference',
              detail: 'Treat design advice and intuition as your reading of the evidence, not as new facts emitted by the system.',
            },
            {
              title: 'Publish intentionally',
              detail: 'The public surface should contain notes with a real title and takeaway, not raw assistant exhaust.',
            },
          ].map(item => (
            <div key={item.title} className="py-3">
              <div className="text-[0.8125rem] font-medium text-text-primary">{item.title}</div>
              <div className="mt-0.5 text-[0.75rem] leading-[1.6] text-muted">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <HistoryHeader
        search={search}
        sort={sort}
        onSearchChange={setSearch}
        onToggleSort={toggleSort}
      />

      {hiddenDraftExploration && (
        <div className="rounded-xl border border-warning/30 bg-warning/6 px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Not on the public surface</div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            This link points to saved context, not a published community note.
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
            Unpublished readings stay off the Community page until someone adds a human-authored title and takeaway.
            Reopen it in its original surface if you want to review or publish it intentionally.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hiddenDraftExploration.surface === 'reading' && onOpenQuery && (
              <button
                onClick={() => onOpenQuery(hiddenDraftExploration.query)}
                className="rounded-md border border-rule bg-white px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
              >
                Open in Findings
              </button>
            )}
            {hiddenDraftExploration.surface === 'simulation' && onTabChange && (
              <button
                onClick={() => onTabChange('agent')}
                className="rounded-md border border-rule bg-white px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
              >
                Open Simulation
              </button>
            )}
          </div>
        </div>
      )}

      {displayedExplorations.length === 0 && search ? (
        <NoResults search={search} />
      ) : (
        <div className="space-y-6">
          <ContributionSection
            eyebrow="Featured"
            title="Featured contributions"
            detail="Start here for the clearest public readings: researcher-verified or editorially surfaced notes over the evidence."
            explorations={featuredContributions}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onVote={delta => voteMutation.mutate(delta)}
            onOpenQuery={onOpenQuery}
            onOpenSimulation={onTabChange ? () => onTabChange('agent') : undefined}
            onShare={handleShare}
            sharedId={sharedId}
            deepLinkedExplorationId={initialExplorationId}
            emptyMessage="No featured contributions match the current filters yet."
          />

          <ContributionSection
            eyebrow="Latest"
            title="Latest published notes"
            detail="Published readings and simulation notes that people intentionally sent to the shared surface after reviewing the evidence."
            explorations={communityContributions}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onVote={delta => voteMutation.mutate(delta)}
            onOpenQuery={onOpenQuery}
            onOpenSimulation={onTabChange ? () => onTabChange('agent') : undefined}
            onShare={handleShare}
            sharedId={sharedId}
            deepLinkedExplorationId={initialExplorationId}
            emptyMessage="No published contributions match the current filters yet."
          />

        </div>
      )}

    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly value: number
  readonly detail: string
}) {
  return (
    <div className="rounded-xl border border-rule bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{value}</div>
      <div className="mt-1 text-[0.75rem] text-muted">{detail}</div>
    </div>
  )
}

function ContributionSection({
  eyebrow,
  title,
  detail,
  explorations,
  expandedId,
  onToggleExpand,
  onVote,
  onOpenQuery,
  onOpenSimulation,
  onShare,
  sharedId,
  deepLinkedExplorationId,
  emptyMessage,
}: {
  readonly eyebrow: string
  readonly title: string
  readonly detail: string
  readonly explorations: readonly Exploration[]
  readonly expandedId: string | null
  readonly onToggleExpand: (id: string) => void
  readonly onVote?: (input: { id: string; delta: 1 | -1 }) => void
  readonly onOpenQuery?: (query: string) => void
  readonly onOpenSimulation?: () => void
  readonly onShare?: (explorationId: string) => void
  readonly sharedId: string | null
  readonly deepLinkedExplorationId: string | null
  readonly emptyMessage: string
}) {
  return (
    <section className="space-y-3">
      <div>
        <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">{eyebrow}</span>
        <div className="mt-1 text-[0.9375rem] font-medium text-text-primary">{title}</div>
        <p className="mt-0.5 max-w-3xl text-[0.8125rem] leading-[1.6] text-muted">{detail}</p>
      </div>

      {explorations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule bg-white/85 px-4 py-5 text-sm text-muted">
          {emptyMessage}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={STAGGER_CONTAINER}
          className="grid gap-4"
        >
          <AnimatePresence mode="popLayout">
            {explorations.map(exploration => (
              <ExplorationCard
                key={exploration.id}
                exploration={exploration}
                isExpanded={expandedId === exploration.id}
                onToggleExpand={() => onToggleExpand(exploration.id)}
                onVote={onVote ? delta => onVote({ id: exploration.id, delta }) : undefined}
                onOpenQuery={onOpenQuery}
                onOpenSimulation={onOpenSimulation}
                onShare={onShare}
                shareCopied={sharedId === exploration.id}
                isDeepLinked={deepLinkedExplorationId === exploration.id}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  )
}

function HistoryHeader({
  search,
  sort,
  onSearchChange,
  onToggleSort,
}: {
  readonly search: string
  readonly sort: SortMode
  readonly onSearchChange: (value: string) => void
  readonly onToggleSort: () => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search titles, takeaways, authors, paradigms, scenarios, or metrics..."
            className={cn(
              'w-full rounded-xl border border-rule bg-white py-2.5 pl-10 pr-4 text-[0.8125rem]',
              'text-text-primary placeholder:text-muted/70 focus:outline-none focus:border-accent/30 focus:ring-2 focus:ring-accent/10',
            )}
          />
        </div>
        <p className="mt-2 text-[0.6875rem] text-text-faint">
          Search titles, takeaways, authors, paradigm tags, and note text.
        </p>
      </div>

      <button
        onClick={onToggleSort}
        className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted transition-colors hover:text-text-primary"
        >
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span>{sort === 'recent' ? 'Newest first' : 'Most supported'}</span>
      </button>
    </div>
  )
}

function ExplorationCard({
  exploration,
  isExpanded,
  onToggleExpand,
  onVote,
  onOpenQuery,
  onOpenSimulation,
  onShare,
  shareCopied,
  isDeepLinked,
}: {
  readonly exploration: Exploration
  readonly isExpanded: boolean
  readonly onToggleExpand: () => void
  readonly onVote?: (delta: 1 | -1) => void
  readonly onOpenQuery?: (query: string) => void
  readonly onOpenSimulation?: () => void
  readonly onShare?: (explorationId: string) => void
  readonly shareCopied?: boolean
  readonly isDeepLinked?: boolean
}) {
  const timeAgo = formatTimeAgo(cardTimestamp(exploration))
  const allTags = [...exploration.paradigmTags, ...exploration.experimentTags]

  return (
    <motion.div
      id={`community-note-${exploration.id}`}
      layout
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: SPRING_CRISP },
      }}
      className={cn(
        'overflow-hidden rounded-xl border border-rule bg-white',
        'transition-colors hover:border-border-hover',
        isDeepLinked && 'border-accent/20 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_6%,transparent)]',
      )}
    >
      <div className="flex gap-3 p-4">
        {onVote ? (
          <VoteControls votes={exploration.votes} onVote={onVote} />
        ) : (
          <div className="w-8 shrink-0" />
        )}

        <button onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-text-primary">
            {cardTitle(exploration)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">
            {cardSummary(exploration)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                exploration.publication.published ? 'bg-accent' : 'bg-warning',
              )} />
              {archiveState(exploration)}
            </span>

            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                exploration.surface === 'simulation' ? 'bg-accent-warm' : 'bg-success',
              )} />
              {surfaceLabel(exploration)}
            </span>

            {exploration.publication.featured && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                Editor&apos;s pick
              </span>
            )}

            {exploration.verified && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Researcher verified
              </span>
            )}

            {exploration.publication.author && (
              <span className="text-xs text-text-faint">
                by {exploration.publication.author}
              </span>
            )}

            {isDeepLinked && (
              <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Direct link
              </span>
            )}

            <span className="ml-auto text-xs text-text-faint">
              {timeAgo}
            </span>
          </div>

          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allTags.map(tag => (
                <span key={tag} className="lab-chip">
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    tag === 'SSP' && 'bg-accent',
                    tag === 'MSP' && 'bg-accent-warm',
                    tag.startsWith('SE') && 'bg-success',
                  )} />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </button>

        <button
          onClick={onToggleExpand}
          className="self-start p-1 text-muted transition-colors hover:text-text-primary"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SOFT}
            className="overflow-hidden"
          >
            <div className="border-t border-rule p-4">
              <div className="mb-4 rounded-lg border border-rule bg-surface-active px-3 py-2 text-xs text-muted">
                <span className="font-medium text-text-primary">Truth boundary:</span>{' '}
                {exploration.publication.published
                  ? 'This is a published human-authored note layered on top of a reading or exact-run artifact.'
                  : 'This is saved secondary context. It can be useful, but it is not a canonical paper or published-results artifact.'}
              </div>

              {exploration.publication.editorNote && (
                <div className="mb-4 rounded-lg border border-warning/30 bg-warning/6 px-3 py-2 text-xs text-muted">
                  <span className="font-medium text-text-primary">Editor note:</span> {exploration.publication.editorNote}
                </div>
              )}

              <BlockCanvas blocks={exploration.blocks} />

              <div className="mt-4 flex flex-wrap gap-2">
                {exploration.surface === 'reading' && onOpenQuery && (
                  <button
                    onClick={() => onOpenQuery(exploration.query)}
                    className="rounded-md border border-rule bg-white px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
                  >
                    Reopen in Findings
                  </button>
                )}

                {exploration.surface === 'simulation' && onOpenSimulation && (
                  <button
                    onClick={onOpenSimulation}
                    className="rounded-md border border-rule bg-white px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
                  >
                    Open Simulation
                  </button>
                )}

                {exploration.publication.published && onShare && (
                  <button
                    onClick={() => void onShare(exploration.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-3 py-2 text-xs text-text-primary transition-colors hover:border-border-hover"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {shareCopied ? 'Link copied' : 'Copy note link'}
                  </button>
                )}
              </div>

              {exploration.followUps.length > 0 && (
                <FollowUpList followUps={exploration.followUps} onSelect={exploration.surface === 'reading' ? onOpenQuery : undefined} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function VoteControls({
  votes,
  onVote,
}: {
  readonly votes: number
  readonly onVote: (delta: 1 | -1) => void
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        onClick={event => {
          event.stopPropagation()
          onVote(1)
        }}
        className="flex items-center justify-center min-w-[32px] min-h-[32px] p-1.5 text-muted transition-colors hover:text-accent rounded-md hover:bg-surface-active"
        aria-label="Upvote"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <span
        className={cn(
          'text-xs font-medium tabular-nums',
          votes > 0 && 'text-accent',
          votes < 0 && 'text-rose-400',
          votes === 0 && 'text-muted',
        )}
      >
        {votes}
      </span>
      <button
        onClick={event => {
          event.stopPropagation()
          onVote(-1)
        }}
        className="flex items-center justify-center min-w-[32px] min-h-[32px] p-1.5 text-muted transition-colors hover:text-rose-400 rounded-md hover:bg-surface-active"
        aria-label="Downvote"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function FollowUpList({
  followUps,
  onSelect,
}: {
  readonly followUps: readonly string[]
  readonly onSelect?: (query: string) => void
}) {
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <span className="mb-2 block text-xs text-muted">
        Useful next questions
      </span>
      <div className="flex flex-wrap gap-2">
        {followUps.map(question => (
          <button
            key={question}
            onClick={() => onSelect?.(question)}
            disabled={!onSelect}
            className="text-left text-xs text-muted transition-colors hover:text-text-primary disabled:cursor-default disabled:hover:text-muted"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyState({
  onGoToFindings,
  onTabChange,
}: {
  readonly onGoToFindings?: () => void
  readonly onTabChange?: (tab: TabId) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            title: '1. Start from evidence',
            detail: 'Open a paper reading or exact run first so the note is grounded in a canonical section, curated finding, or simulation artifact.',
          },
          {
            title: '2. Add your own read',
            detail: 'Write a real title and takeaway in your own words. Lead with what the source shows, then label the inference.',
          },
          {
            title: '3. Publish intentionally',
            detail: 'Only intentionally published notes appear here. Drafts and saved readings stay off the public surface until someone makes that choice.',
          },
        ].map(item => (
          <div key={item.title} className="rounded-xl border border-rule bg-white px-4 py-4">
            <div className="text-sm font-medium text-text-primary">{item.title}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden flex flex-col items-center justify-center rounded-xl border border-rule bg-white py-20 text-center">
        {/* Node-arc motif — echoes the header globe's visual language */}
        <div className="absolute right-6 top-6 w-[160px] h-[80px] opacity-[0.4] pointer-events-none select-none" aria-hidden="true">
          <NodeArc className="w-full h-full text-muted" />
        </div>
        <div className="absolute left-6 bottom-8 w-[120px] h-[60px] opacity-[0.25] pointer-events-none select-none rotate-180" aria-hidden="true">
          <NodeArc className="w-full h-full text-muted" />
        </div>

        <Tag className="relative mb-4 h-8 w-8 text-text-faint" />
        <h2 className="mb-2 text-lg font-medium text-text-primary">No community notes yet</h2>
        <p className="mb-5 max-w-lg text-sm text-muted">
          Start from Findings for a paper-backed reading, or from Simulation for an exact run. Then publish a note intentionally with your own title and takeaway.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {onGoToFindings && (
            <button
              onClick={onGoToFindings}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent/80"
            >
              Open Findings
            </button>
          )}
          {onTabChange && (
            <>
              <button
                onClick={() => onTabChange('paper')}
                className="rounded-lg border border-rule bg-white px-4 py-2 text-sm text-text-primary transition-colors hover:border-border-hover"
              >
                Read the paper
              </button>
              <button
                onClick={() => onTabChange('agent')}
                className="rounded-lg border border-rule bg-white px-4 py-2 text-sm text-text-primary transition-colors hover:border-border-hover"
              >
                Open Simulation
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Guidance card placeholder */}
      <div className="h-[180px] animate-pulse rounded-xl border border-rule bg-white" />

      {/* 3-up summary stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[88px] animate-pulse rounded-xl border border-rule bg-white" />
        ))}
      </div>

      {/* Community standards card */}
      <div className="h-[160px] animate-pulse rounded-xl border border-rule bg-white" />

      {/* Search + sort header */}
      <div className="flex gap-3">
        <div className="h-[42px] flex-1 animate-pulse rounded-xl border border-rule bg-white" />
        <div className="h-[42px] w-[140px] animate-pulse rounded-xl border border-rule bg-white" />
      </div>

      {/* Contribution cards */}
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[100px] animate-pulse rounded-xl border border-rule bg-white" />
        ))}
      </div>
    </div>
  )
}

function NoResults({ search }: { readonly search: string }) {
  return (
    <div className="rounded-xl border border-rule bg-white px-4 py-8 text-center">
      <div className="text-sm font-medium text-text-primary">No matches for “{search}”</div>
      <p className="mt-2 text-sm text-muted">
        Try a paradigm, scenario family, metric, paper term, or contributor name instead.
      </p>
    </div>
  )
}

function formatTimeAgo(isoTimestamp: string): string {
  const deltaMs = Date.now() - new Date(isoTimestamp).getTime()
  const deltaMinutes = Math.floor(deltaMs / 60_000)

  if (deltaMinutes < 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays < 7) return `${deltaDays}d ago`

  const deltaWeeks = Math.floor(deltaDays / 7)
  if (deltaWeeks < 5) return `${deltaWeeks}w ago`

  const deltaMonths = Math.floor(deltaDays / 30)
  if (deltaMonths < 12) return `${deltaMonths}mo ago`

  const deltaYears = Math.floor(deltaDays / 365)
  return `${deltaYears}y ago`
}
