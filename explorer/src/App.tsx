import { Suspense, lazy, startTransition, useState, useCallback, useEffect } from 'react'
import { Header } from './components/layout/Header'
import { TabNav, type TabId } from './components/layout/TabNav'
import { Footer } from './components/layout/Footer'
import { FindingsPage } from './pages/FindingsPage'
import { cn } from './lib/cn'
import { PAPER_SECTIONS } from './data/paper-sections'

const VALID_TABS: readonly TabId[] = ['explore', 'paper', 'results', 'community']
const DEFAULT_TAB: TabId = 'explore'
const PAPER_TAB: TabId = 'paper'
const RESULTS_TAB: TabId = 'results'
const COMMUNITY_TAB: TabId = 'community'
const PAPER_SECTION_IDS = new Set(PAPER_SECTIONS.map(section => section.id))

const loadPaperReaderPageModule = () => import('./pages/PaperReaderPage')
const loadSimulationLabPageModule = () => import('./pages/SimulationLabPage')
const loadExploreHistoryPageModule = () => import('./pages/ExploreHistoryPage')

const PaperReaderPage = lazy(async () => {
  const module = await loadPaperReaderPageModule()
  return { default: module.PaperReaderPage }
})

const SimulationLabPage = lazy(async () => {
  const module = await loadSimulationLabPageModule()
  return { default: module.SimulationLabPage }
})

const ExploreHistoryPage = lazy(async () => {
  const module = await loadExploreHistoryPageModule()
  return { default: module.ExploreHistoryPage }
})

interface ExplorerRouteState {
  readonly tab: TabId
  readonly query: string | null
  readonly explorationId: string | null
}

const RESULTS_ROUTE_PARAM_KEYS = [
  'evaluation',
  'paradigm',
  'result',
  'dataset',
  'theme',
  'step',
  'autoplay',
  'lens',
  'compare',
  'audience',
  'replayQuestion',
  'paperSection',
  'slot',
  'compareSlot',
  'analytics',
] as const

function hasPaperSectionHash(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  return hash.length > 0 && PAPER_SECTION_IDS.has(hash)
}

function hasResultsRouteParams(params: URLSearchParams): boolean {
  return RESULTS_ROUTE_PARAM_KEYS.some(key => params.has(key))
}

function getInitialTab(): TabId {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('tab')
  // Support legacy tab IDs from old URLs
  const migrated = raw === 'findings' ? 'explore'
    : raw === 'deep-dive' ? 'paper'
    : raw === 'simulation' ? 'results'
    : raw === 'history' ? 'community'
    : raw
  const tab = migrated as TabId | null
  const hasPaperHash = hasPaperSectionHash()
  const hasResultsParams = hasResultsRouteParams(params)
  if (tab && VALID_TABS.includes(tab)) {
    if (tab === 'explore' && hasResultsParams) {
      return 'results'
    }
    if (tab === 'explore' && hasPaperHash && !params.get('q') && !params.get('eid')) {
      return 'paper'
    }
    return tab
  }
  if (hasResultsParams) return 'results'
  if (params.get('q') || params.get('eid') || params.get('topic')) return 'explore'
  if (hasPaperHash) return 'paper'
  return DEFAULT_TAB
}

function getInitialQuery(): string | null {
  return new URLSearchParams(window.location.search).get('q')
}

function getInitialExplorationId(): string | null {
  return new URLSearchParams(window.location.search).get('eid')
}

function readRouteState(): ExplorerRouteState {
  const params = new URLSearchParams(window.location.search)
  const tab = getInitialTab()
  const resultsRoute = tab === RESULTS_TAB && hasResultsRouteParams(params)

  return {
    tab,
    query: resultsRoute ? null : getInitialQuery(),
    explorationId: resultsRoute ? null : getInitialExplorationId(),
  }
}

function writeRouteState(next: ExplorerRouteState, replace = false) {
  const url = new URL(window.location.href)
  const shouldKeepExplicitTab = next.tab !== DEFAULT_TAB || Boolean(next.query) || Boolean(next.explorationId)

  if (shouldKeepExplicitTab) {
    url.searchParams.set('tab', next.tab)
  } else {
    url.searchParams.delete('tab')
  }

  if (next.query) {
    url.searchParams.set('q', next.query)
  } else {
    url.searchParams.delete('q')
  }

  if (next.explorationId) {
    url.searchParams.set('eid', next.explorationId)
  } else {
    url.searchParams.delete('eid')
  }

  if (replace) {
    window.history.replaceState({}, '', url.toString())
  } else {
    window.history.pushState({}, '', url.toString())
  }
}

function preloadTab(tab: TabId) {
  if (tab === PAPER_TAB) {
    void loadPaperReaderPageModule()
    return
  }
  if (tab === RESULTS_TAB) {
    void loadSimulationLabPageModule()
    return
  }
  if (tab === COMMUNITY_TAB) {
    void loadExploreHistoryPageModule()
  }
}

function PageFallback({ label }: { readonly label: string }) {
  return (
    <div className="rounded-xl border border-rule bg-white/92 px-5 py-8 shadow-sm">
      <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Loading</div>
      <div className="mt-2 text-lg font-medium text-text-primary">{label}</div>
      <div className="mt-4 space-y-3">
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-active" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-active" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-active" />
      </div>
    </div>
  )
}

function App() {
  const initialRoute = readRouteState()
  const [activeTab, setActiveTab] = useState<TabId>(initialRoute.tab)
  const [sharedQuery, setSharedQuery] = useState<string | null>(initialRoute.query)
  const [sharedExplorationId, setSharedExplorationId] = useState<string | null>(initialRoute.explorationId)
  const [visitedTabs, setVisitedTabs] = useState<Record<TabId, boolean>>({
    explore: initialRoute.tab === DEFAULT_TAB,
    paper: initialRoute.tab === PAPER_TAB,
    results: initialRoute.tab === RESULTS_TAB,
    community: initialRoute.tab === COMMUNITY_TAB,
  })

  const applyRouteState = useCallback((next: ExplorerRouteState, replace = false) => {
    startTransition(() => {
      setActiveTab(next.tab)
      setSharedQuery(next.query)
      setSharedExplorationId(next.explorationId)
      setVisitedTabs(previous => (previous[next.tab] ? previous : { ...previous, [next.tab]: true }))
      writeRouteState(next, replace)
    })
  }, [])

  const syncFromLocation = useCallback(() => {
    const next = readRouteState()
    setActiveTab(next.tab)
    setSharedQuery(next.query)
    setSharedExplorationId(next.explorationId)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      syncFromLocation()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [syncFromLocation])

  useEffect(() => {
    setVisitedTabs(previous => (previous[activeTab] ? previous : { ...previous, [activeTab]: true }))
    preloadTab(activeTab)
  }, [activeTab])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ;([PAPER_TAB, RESULTS_TAB, COMMUNITY_TAB] as const)
        .filter(tab => tab !== activeTab)
        .forEach(preloadTab)
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [activeTab])

  const handleTabChange = useCallback((tab: TabId) => {
    preloadTab(tab)
    applyRouteState({ tab, query: sharedQuery, explorationId: null }, false)
  }, [applyRouteState, sharedQuery])

  const handleTabIntent = useCallback((tab: TabId) => {
    preloadTab(tab)
  }, [])

  const handleFindingsQueryChange = useCallback((query: string | null) => {
    applyRouteState({ tab: 'explore', query, explorationId: null }, false)
  }, [applyRouteState])

  const handleExplorationIdChange = useCallback((explorationId: string | null) => {
    applyRouteState({ tab: 'explore', query: null, explorationId }, false)
  }, [applyRouteState])

  const handleOpenCommunityExploration = useCallback((explorationId: string) => {
    applyRouteState({ tab: 'community', query: null, explorationId }, false)
  }, [applyRouteState])

  const handleCommunityGoToFindings = useCallback(() => {
    applyRouteState({ tab: 'explore', query: null, explorationId: null }, false)
  }, [applyRouteState])

  const handleCommunityOpenQuery = useCallback((query: string) => {
    applyRouteState({ tab: 'explore', query, explorationId: null }, false)
  }, [applyRouteState])

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Header />
      <TabNav activeTab={activeTab} onTabChange={handleTabChange} onTabIntent={handleTabIntent} />

      <main
        id="main-content"
        className={cn(
          'mx-auto px-4 py-8 sm:px-6',
          activeTab === 'paper' ? 'max-w-7xl' : 'max-w-5xl',
        )}
      >
        <div hidden={activeTab !== 'explore'} aria-hidden={activeTab !== 'explore'}>
          <FindingsPage
            initialQuery={sharedQuery}
            initialExplorationId={sharedExplorationId}
            isActive={activeTab === 'explore'}
            onQueryChange={handleFindingsQueryChange}
            onExplorationIdChange={handleExplorationIdChange}
            onOpenCommunityExploration={handleOpenCommunityExploration}
            onTabChange={handleTabChange}
          />
        </div>

        {visitedTabs.paper && (
          <div hidden={activeTab !== 'paper'} aria-hidden={activeTab !== 'paper'}>
            <Suspense fallback={<PageFallback label="Loading paper guide" />}>
              <PaperReaderPage onTabChange={handleTabChange} />
            </Suspense>
          </div>
        )}

        {visitedTabs.results && (
          <div hidden={activeTab !== 'results'} aria-hidden={activeTab !== 'results'}>
            <Suspense fallback={<PageFallback label="Loading simulation surface" />}>
              <SimulationLabPage
                onOpenCommunityExploration={handleOpenCommunityExploration}
                onTabChange={handleTabChange}
              />
            </Suspense>
          </div>
        )}

        {visitedTabs.community && (
          <div hidden={activeTab !== 'community'} aria-hidden={activeTab !== 'community'}>
            <Suspense fallback={<PageFallback label="Loading community notes" />}>
              <ExploreHistoryPage
                initialExplorationId={sharedExplorationId}
                onGoToFindings={handleCommunityGoToFindings}
                onOpenQuery={handleCommunityOpenQuery}
                onTabChange={handleTabChange}
              />
            </Suspense>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

export default App
