import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ArrowUpDown, Tag, ChevronDown, ChevronUp, Users, FlaskConical, Award, Link2, MessageSquare } from 'lucide-react'
import { NodeArc } from '../components/decorative/NodeArc'
import { getExploration, listExplorations, voteExploration, type Exploration } from '../lib/api'
import { MOCK_COMMUNITY_NOTES, MOCK_NOTE_EXTRAS } from '../data/mock-community-notes'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { VoteControls, FollowUpList } from '../components/community/VoteControls'
import { ReplyThread } from '../components/community/ReplyThread'
import { cn } from '../lib/cn'
import { SPRING_CRISP, SPRING_SOFT, STAGGER_CONTAINER } from '../lib/theme'
import type { TabId } from '../components/layout/TabNav'

type SortMode = 'recent' | 'top'


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
  onGoToPaper,
  onOpenQuery,
  onTabChange,
}: {
  readonly initialExplorationId?: string | null
  readonly onGoToPaper?: () => void
  readonly onOpenQuery?: (query: string) => void
  readonly onTabChange?: (tab: TabId) => void
} = {}) {
  const [sort, setSort] = useState<SortMode>('recent')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)
  const [guidanceOpen, setGuidanceOpen] = useState(false)

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
  const displayedExplorations = useMemo(() => {
    // Merge real API notes with mock seed data (dedup by ID)
    const realIds = new Set(explorations.map(e => e.id))
    const merged = [
      ...explorations,
      ...MOCK_COMMUNITY_NOTES.filter(m => !realIds.has(m.id)),
    ]
    // Prepend deep-linked exploration if missing
    if (deepLinkedPublishedExploration && !merged.some(e => e.id === deepLinkedPublishedExploration.id)) {
      merged.unshift(deepLinkedPublishedExploration)
    }
    // Sort merged list (API may already sort real notes, but mock data needs it)
    return sort === 'top'
      ? [...merged].sort((a, b) => b.votes - a.votes)
      : [...merged].sort((a, b) => new Date(cardTimestamp(b)).getTime() - new Date(cardTimestamp(a)).getTime())
  }, [deepLinkedPublishedExploration, explorations, sort])

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
    return <EmptyState onGoToPaper={onGoToPaper} onTabChange={onTabChange} />
  }

  return (
    <div className="space-y-5">
      {/* ── Compact KPI strip + search ───────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-4">
          <KpiPill icon={<Users className="h-3.5 w-3.5 text-accent" />} value={publishedReadingNotes.length} label="reading" />
          <KpiPill icon={<FlaskConical className="h-3.5 w-3.5 text-warning" />} value={publishedSimulationNotes.length} label="exact-run" />
          <KpiPill icon={<Award className="h-3.5 w-3.5 text-accent-warm" />} value={featuredContributions.length} label="featured" />
        </div>
        <button
          onClick={toggleSort}
          className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text-primary"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort === 'recent' ? 'Newest first' : 'Most supported'}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search titles, takeaways, authors, paradigms, scenarios, or metrics..."
          className={cn(
            'w-full rounded-xl border border-rule bg-white py-2.5 pl-10 pr-4 text-13',
            'text-text-primary placeholder:text-muted/70 focus:outline-none focus:border-accent/30 focus:ring-2 focus:ring-accent/10',
          )}
        />
      </div>

      {hiddenDraftExploration && (
        <div className="rounded-xl border border-warning/30 bg-warning/6 px-4 py-3">
          <div className="text-sm font-medium text-text-primary">
            This link points to saved context, not a published community note.
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
            Unpublished readings stay off the Community page until someone adds a human-authored title and takeaway.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hiddenDraftExploration.surface === 'reading' && onOpenQuery && (
              <button
                onClick={() => onOpenQuery(hiddenDraftExploration.query)}
                className="rounded-md border border-rule bg-white px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
              >
                Explore with AI
              </button>
            )}
            {hiddenDraftExploration.surface === 'simulation' && onTabChange && (
              <button
                onClick={() => onTabChange('results')}
                className="rounded-md border border-rule bg-white px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
              >
                Open Simulation
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Notes (the main content) ─────────────────────────────── */}
      {displayedExplorations.length === 0 && search ? (
        <NoResults search={search} />
      ) : (
        <div className="space-y-6">
          <ContributionSection
            eyebrow="Featured"
            title="Featured contributions"
            detail="Researcher-verified or editorially surfaced notes over the evidence."
            explorations={featuredContributions}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onVote={delta => voteMutation.mutate(delta)}
            onOpenQuery={onOpenQuery}
            onOpenSimulation={onTabChange ? () => onTabChange('results') : undefined}
            onShare={handleShare}
            sharedId={sharedId}
            deepLinkedExplorationId={initialExplorationId}
            emptyMessage="No featured contributions match the current filters yet."
          />

          <ContributionSection
            eyebrow="Latest"
            title="Latest published notes"
            detail="Published readings and simulation notes sent to the shared surface after reviewing the evidence."
            explorations={communityContributions}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onVote={delta => voteMutation.mutate(delta)}
            onOpenQuery={onOpenQuery}
            onOpenSimulation={onTabChange ? () => onTabChange('results') : undefined}
            onShare={handleShare}
            sharedId={sharedId}
            deepLinkedExplorationId={initialExplorationId}
            emptyMessage="No published contributions match the current filters yet."
          />
        </div>
      )}

      {/* ── Collapsible guidance footer ──────────────────────────── */}
      <div className="rounded-xl border border-rule bg-white">
        <button
          onClick={() => setGuidanceOpen(prev => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs font-medium text-text-faint">Community guidelines & how to contribute</span>
          {guidanceOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
        </button>
        <AnimatePresence>
          {guidanceOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_SOFT}
              className="overflow-hidden"
            >
              <div className="border-t border-rule px-4 pb-4 pt-3 space-y-4">
                <div>
                  <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Standards</span>
                  <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                    {[
                      { title: 'Lead with observation', detail: 'Start from what the paper, chart, or exact run actually shows before adding your interpretation.' },
                      { title: 'Label the inference', detail: 'Treat design advice and intuition as your reading of the evidence, not as new facts emitted by the system.' },
                      { title: 'Publish intentionally', detail: 'Notes should contain a real title and takeaway, not raw assistant exhaust.' },
                    ].map(item => (
                      <div key={item.title}>
                        <div className="text-xs font-medium text-text-primary">{item.title}</div>
                        <div className="mt-0.5 text-xs leading-[1.5] text-muted">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {(onGoToPaper || onTabChange) && (
                  <div>
                    <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Start from</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {onGoToPaper && (
                        <button
                          onClick={onGoToPaper}
                          className="rounded-md border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                        >
                          Paper reading
                        </button>
                      )}
                      {onTabChange && (
                        <>
                          <button
                            onClick={() => onTabChange('results')}
                            className="rounded-md border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                          >
                            Exact run
                          </button>
                          <button
                            onClick={() => onTabChange('paper')}
                            className="rounded-md border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                          >
                            Full paper
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  )
}

function KpiPill({
  icon,
  value,
  label,
}: {
  readonly icon: ReactNode
  readonly value: number
  readonly label: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-sm font-semibold tabular-nums text-text-primary">{value}</span>
      <span className="text-xs text-muted">{label}</span>
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
        <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{eyebrow}</span>
        <div className="mt-1 text-[0.9375rem] font-medium text-text-primary">{title}</div>
        <p className="mt-0.5 max-w-3xl text-13 leading-[1.6] text-muted">{detail}</p>
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
  const mockReplies = MOCK_NOTE_EXTRAS[exploration.id]?.replies ?? []
  const realReplies = exploration.replies ?? []
  const realReplyIds = new Set(realReplies.map(r => r.id))
  const replyCount = realReplies.length + mockReplies.filter(m => !realReplyIds.has(m.id)).length

  return (
    <motion.div
      id={`community-note-${exploration.id}`}
      layout
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: SPRING_CRISP },
      }}
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-shadow duration-150',
        isDeepLinked
          ? 'border-accent/20 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_6%,transparent)]'
          : 'border-black/[0.06]',
      )}
      style={{
        boxShadow: isDeepLinked
          ? undefined
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => {
        if (!isDeepLinked) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        if (!isDeepLinked) (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      <div className="flex gap-3 p-4">
        {onVote ? (
          <VoteControls votes={exploration.votes} onVote={onVote} />
        ) : (
          <div className="w-8 shrink-0" />
        )}

        <button onClick={onToggleExpand} className="min-w-0 flex-1 text-left" aria-expanded={isExpanded}>
          <p className="truncate text-sm font-medium text-text-primary">
            {cardTitle(exploration)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">
            {cardSummary(exploration)}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full',
                exploration.surface === 'simulation' ? 'bg-accent-warm' : 'bg-accent',
              )} />
              {surfaceLabel(exploration)}
            </span>

            {exploration.publication.featured && (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                Editor&apos;s pick
              </span>
            )}

            {exploration.verified && (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Researcher verified
              </span>
            )}

            {replyCount > 0 && (
              <span className="inline-flex items-center gap-1 text-muted">
                <MessageSquare className="h-3 w-3" />
                {replyCount}
              </span>
            )}

            {exploration.publication.author && (
              <span className="text-text-faint">
                by {exploration.publication.author}
              </span>
            )}

            {isDeepLinked && (
              <span className="inline-flex items-center gap-1.5 text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Direct link
              </span>
            )}

            <span className="ml-auto text-text-faint tabular-nums">
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

          {/* Anchored text excerpt */}
          {exploration.anchor?.excerpt && (
            <div className="mt-2 rounded-md border-l-2 border-l-accent/40 bg-canvas px-3 py-2">
              <p className="text-xs italic text-muted line-clamp-2">
                &ldquo;{exploration.anchor.excerpt}&rdquo;
              </p>
              {exploration.anchor.sectionId && (
                <span className="mt-1 block text-2xs text-text-faint">
                  from {exploration.anchor.sectionId.replace(/-/g, ' ')}
                </span>
              )}
            </div>
          )}
        </button>

        <button
          onClick={onToggleExpand}
          className="self-start p-1 text-muted transition-colors hover:text-text-primary"
          aria-label={isExpanded ? 'Collapse note' : 'Expand note'}
          aria-expanded={isExpanded}
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
              <div role="note" aria-label="Truth boundary" className="mb-4 rounded-lg border border-rule bg-surface-active px-3 py-2.5 text-xs text-muted">
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
                    title="Ask the AI copilot about this topic — it will use the paper's findings to answer"
                  >
                    Explore with AI
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

              <ReplyThread
                explorationId={exploration.id}
                realReplies={realReplies}
                mockReplies={mockReplies}
              />

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

function EmptyState({
  onGoToPaper,
  onTabChange,
}: {
  readonly onGoToPaper?: () => void
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
          <div key={item.title} className="rounded-xl border border-rule bg-white px-5 py-4 card-hover">
            <div className="text-sm font-medium text-text-primary">{item.title}</div>
            <div className="mt-1 text-xs leading-5 text-muted line-clamp-3">{item.detail}</div>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden flex flex-col items-center justify-center rounded-xl border border-rule bg-white py-20 text-center">
        <div className="absolute right-6 top-6 w-[160px] h-[80px] opacity-[0.4] pointer-events-none select-none" aria-hidden="true">
          <NodeArc className="w-full h-full text-muted" />
        </div>
        <div className="absolute left-6 bottom-8 w-[120px] h-[60px] opacity-[0.25] pointer-events-none select-none rotate-180" aria-hidden="true">
          <NodeArc className="w-full h-full text-muted" />
        </div>

        <Tag className="relative mb-4 h-8 w-8 text-text-faint" />
        <h2 className="mb-2 text-lg font-medium text-text-primary">No community notes yet</h2>
        <p className="mb-5 max-w-lg text-sm text-muted">
          Start from the Paper for a section-backed reading, or from Results for an exact run. Then publish a note intentionally with your own title and takeaway.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {onGoToPaper && (
            <button
              onClick={onGoToPaper}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent/80"
            >
              Open Paper
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
                onClick={() => onTabChange('results')}
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 w-24 animate-pulse rounded bg-surface-active" />
          ))}
        </div>
        <div className="h-5 w-24 animate-pulse rounded bg-surface-active" />
      </div>
      <div className="h-[42px] animate-pulse rounded-xl border border-rule bg-white" />
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[120px] animate-pulse rounded-xl border border-rule bg-white" />
        ))}
      </div>
    </div>
  )
}

function NoResults({ search }: { readonly search: string }) {
  return (
    <div className="rounded-xl border border-rule bg-white px-4 py-8 text-center">
      <div className="text-sm font-medium text-text-primary">No matches for &ldquo;{search}&rdquo;</div>
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
