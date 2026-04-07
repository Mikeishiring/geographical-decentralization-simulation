import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ArrowUpDown, Tag, ChevronDown, ChevronUp, LayoutList, LayoutGrid, Check } from 'lucide-react'
import { NodeArc } from '../components/decorative/NodeArc'
import { getExploration, listExplorations, voteExploration, type Exploration } from '../lib/api'
import { MOCK_COMMUNITY_NOTES } from '../data/mock-community-notes'
import { CompactExplorationRow } from '../components/community/CompactExplorationRow'
import { ExplorationCard } from '../components/community/ExplorationCard'
import { cn } from '../lib/cn'
import { SPRING_CRISP, SPRING_SOFT, STAGGER_CONTAINER } from '../lib/theme'
import { replyCount, controversyScore, cardTimestamp } from '../lib/community-helpers'
import type { TabId } from '../components/layout/TabNav'

type SortMode = 'recent' | 'top' | 'discussed' | 'controversial'
type ViewMode = 'cards' | 'compact'

const SORT_OPTIONS: readonly { readonly value: SortMode; readonly label: string; readonly shortLabel: string; readonly description: string }[] = [
  { value: 'recent', label: 'Newest first', shortLabel: 'Newest', description: 'Most recently published' },
  { value: 'top', label: 'Most liked', shortLabel: 'Top', description: 'Highest vote count' },
  { value: 'discussed', label: 'Most discussed', shortLabel: 'Discussed', description: 'Most replies' },
  { value: 'controversial', label: 'Controversial', shortLabel: 'Mixed', description: 'High engagement, divided opinion' },
]



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
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [surfaceFilter, setSurfaceFilter] = useState<'all' | 'reading' | 'simulation'>('all')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

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

  const toggleExpand = useCallback((id: string) => setExpandedId(previous => (previous === id ? null : id)), [])

  // Close sort menu on outside click
  useEffect(() => {
    if (!sortMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sortMenuOpen])
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
    const sorted = [...merged]
    switch (sort) {
      case 'top':
        sorted.sort((a, b) => b.votes - a.votes)
        break
      case 'discussed':
        sorted.sort((a, b) => replyCount(b) - replyCount(a))
        break
      case 'controversial':
        sorted.sort((a, b) => controversyScore(b) - controversyScore(a))
        break
      case 'recent':
      default:
        sorted.sort((a, b) => new Date(cardTimestamp(b)).getTime() - new Date(cardTimestamp(a)).getTime())
    }
    return sorted
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

  const publishedExplorations = displayedExplorations.filter(exploration => exploration.publication.published)
  const publishedReadingNotes = publishedExplorations.filter(exploration => exploration.surface === 'reading')
  const publishedSimulationNotes = publishedExplorations.filter(exploration => exploration.surface === 'simulation')
  const filteredNotes = surfaceFilter === 'all'
    ? publishedExplorations
    : surfaceFilter === 'reading'
      ? publishedReadingNotes
      : publishedSimulationNotes
  const currentSort = SORT_OPTIONS.find(option => option.value === sort) ?? SORT_OPTIONS[0]

  if ((isLoading || deepLinkedExplorationQuery.isLoading) && displayedExplorations.length === 0) {
    return <LoadingSkeleton />
  }

  if (displayedExplorations.length === 0 && !search && !deepLinkedExplorationQuery.isLoading && !hiddenDraftExploration) {
    return <EmptyState onGoToPaper={onGoToPaper} onTabChange={onTabChange} />
  }

  return (
    <div className="space-y-5">
      {/* ── Single-row toolbar: KPIs · search · view · sort ────── */}
      <div className="flex items-center gap-2">
        {/* Filter pills — dual-purpose: show counts + toggle surface filter */}
        <div className="flex items-center gap-1 pr-1 sm:gap-1.5 sm:pr-2">
          <button
            onClick={() => setSurfaceFilter('all')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-2xs tabular-nums transition-all',
              surfaceFilter === 'all'
                ? 'border-accent/30 bg-accent/8 text-accent font-medium'
                : 'border-rule bg-white text-muted hover:border-accent/20',
            )}
          >
            All {publishedExplorations.length}
          </button>
          <button
            onClick={() => setSurfaceFilter(prev => prev === 'reading' ? 'all' : 'reading')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-2xs tabular-nums transition-all',
              surfaceFilter === 'reading'
                ? 'border-accent/30 bg-accent/8 text-accent font-medium'
                : 'border-rule bg-white text-muted hover:border-accent/20',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="sm:hidden">Read</span>
            <span className="hidden sm:inline">Reading</span>
            {publishedReadingNotes.length}
          </button>
          <button
            onClick={() => setSurfaceFilter(prev => prev === 'simulation' ? 'all' : 'simulation')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-2xs tabular-nums transition-all',
              surfaceFilter === 'simulation'
                ? 'border-warning/30 bg-warning/8 text-warning font-medium'
                : 'border-rule bg-white text-muted hover:border-warning/20',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            <span className="sm:hidden">Runs</span>
            <span className="hidden sm:inline">Simulation</span>
            {publishedSimulationNotes.length}
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search titles, takeaways, authors, paradigms..."
            className={cn(
              'w-full rounded-lg border border-rule bg-white py-1.5 pl-8 pr-3 text-xs',
              'text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/10',
            )}
          />
        </div>

        {/* View toggle — ghost buttons, no border wrapper */}
        <button
          onClick={() => setViewMode(viewMode === 'cards' ? 'compact' : 'cards')}
          className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-active hover:text-text-primary"
          aria-label={viewMode === 'cards' ? 'Switch to compact view' : 'Switch to card view'}
          title={viewMode === 'cards' ? 'Compact view' : 'Card view'}
        >
          {viewMode === 'cards' ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
        </button>

        {/* Sort — ghost trigger, no border */}
        <div ref={sortMenuRef} className="relative shrink-0">
          <button
            onClick={() => setSortMenuOpen(prev => !prev)}
            aria-expanded={sortMenuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1 rounded-md px-1.5 py-1.5 text-2xs font-medium text-muted transition-colors hover:bg-surface-active hover:text-text-primary"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{currentSort.shortLabel}</span>
          </button>
          <AnimatePresence>
            {sortMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={SPRING_CRISP}
                className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-rule bg-white shadow-lg"
                onKeyDown={(e) => { if (e.key === 'Escape') setSortMenuOpen(false) }}
              >
                {SORT_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => { setSort(option.value); setSortMenuOpen(false) }}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-active',
                      sort === option.value && 'bg-accent/5',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-2xs font-medium text-text-primary">{option.label}</div>
                      <div className="text-[10px] text-muted">{option.description}</div>
                    </div>
                    {sort === option.value && <Check className="h-3 w-3 shrink-0 text-accent" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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

      {/* ── Unified note feed ─────────────────────────────────────── */}
      {filteredNotes.length === 0 && search ? (
        <NoResults search={search} />
      ) : filteredNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule bg-white/85 px-4 py-6 text-center text-sm text-muted">
          No published {surfaceFilter === 'reading' ? 'reading' : surfaceFilter === 'simulation' ? 'simulation' : ''} notes yet.
        </div>
      ) : viewMode === 'compact' ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={STAGGER_CONTAINER}
          className="overflow-hidden rounded-xl border border-rule bg-white divide-y divide-rule"
        >
          <AnimatePresence mode="popLayout">
            {filteredNotes.map(exploration => (
              <CompactExplorationRow
                key={exploration.id}
                exploration={exploration}
                isExpanded={expandedId === exploration.id}
                onToggleExpand={() => toggleExpand(exploration.id)}
                onVote={delta => voteMutation.mutate({ id: exploration.id, delta })}
                onOpenQuery={onOpenQuery}
                onOpenSimulation={onTabChange ? () => onTabChange('results') : undefined}
                onShare={handleShare}
                shareCopied={sharedId === exploration.id}
                isDeepLinked={initialExplorationId === exploration.id}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={STAGGER_CONTAINER}
          className="grid gap-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredNotes.map(exploration => (
              <ExplorationCard
                key={exploration.id}
                exploration={exploration}
                isExpanded={expandedId === exploration.id}
                onToggleExpand={() => toggleExpand(exploration.id)}
                onVote={delta => voteMutation.mutate({ id: exploration.id, delta })}
                onOpenQuery={onOpenQuery}
                onOpenSimulation={onTabChange ? () => onTabChange('results') : undefined}
                onShare={handleShare}
                shareCopied={sharedId === exploration.id}
                isDeepLinked={initialExplorationId === exploration.id}
              />
            ))}
          </AnimatePresence>
        </motion.div>
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

