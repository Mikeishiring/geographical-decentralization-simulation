import { Suspense, lazy, startTransition, useState, useCallback, useEffect } from 'react'
import { Header } from './components/layout/Header'
import { TabNav, type TabId } from './components/layout/TabNav'
import { Footer } from './components/layout/Footer'
import { FindingsPage } from './pages/FindingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { cn } from './lib/cn'
import { readRouteStateFromLocation, type ExplorerRouteState } from './lib/route-state'
import { PAPER_SECTIONS } from './data/paper-sections'

const DEFAULT_TAB: TabId = 'explore'
const PAPER_TAB: TabId = 'paper'
const RESULTS_TAB: TabId = 'results'
const COMMUNITY_TAB: TabId = 'community'
const AGENT_TAB: TabId = 'agent'
const PAPER_SECTION_IDS = new Set(PAPER_SECTIONS.map(section => section.id))

const loadPaperReaderPageModule = () => import('./pages/PaperReaderPage')
const loadSimulationLabPageModule = () => import('./pages/SimulationLabPage')
const loadExploreHistoryPageModule = () => import('./pages/ExploreHistoryPage')
const loadAgentLabPageModule = () => import('./pages/AgentLabPage')

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

const AgentLabPage = lazy(async () => {
  const module = await loadAgentLabPageModule()
  return { default: module.default }
})

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

function readRouteState() {
  return readRouteStateFromLocation(window.location.search, window.location.hash, PAPER_SECTION_IDS)
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
    return
  }
  if (tab === AGENT_TAB) {
    void loadAgentLabPageModule()
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
    agent: initialRoute.tab === AGENT_TAB,
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
            activeTab === 'paper'
              ? 'max-w-[88rem]'
              : activeTab === 'results'
                ? 'max-w-[96rem]'
                : 'max-w-5xl',
          )}
        >
        <div hidden={activeTab !== 'explore'} aria-hidden={activeTab !== 'explore'}>
          <ErrorBoundary fallbackLabel="The Explore tab encountered an error.">
            <FindingsPage
              initialQuery={sharedQuery}
              initialExplorationId={sharedExplorationId}
              isActive={activeTab === 'explore'}
              onQueryChange={handleFindingsQueryChange}
              onExplorationIdChange={handleExplorationIdChange}
              onOpenCommunityExploration={handleOpenCommunityExploration}
              onTabChange={handleTabChange}
            />
          </ErrorBoundary>
        </div>

        {visitedTabs.paper && (
          <div hidden={activeTab !== 'paper'} aria-hidden={activeTab !== 'paper'}>
            <ErrorBoundary fallbackLabel="The Paper tab encountered an error.">
              <Suspense fallback={<PageFallback label="Loading paper guide" />}>
                <PaperReaderPage onTabChange={handleTabChange} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.results && (
          <div hidden={activeTab !== 'results'} aria-hidden={activeTab !== 'results'}>
            <ErrorBoundary fallbackLabel="The Results tab encountered an error.">
              <Suspense fallback={<PageFallback label="Loading simulation surface" />}>
                <SimulationLabPage
                  onOpenCommunityExploration={handleOpenCommunityExploration}
                  onTabChange={handleTabChange}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.community && (
          <div hidden={activeTab !== 'community'} aria-hidden={activeTab !== 'community'}>
            <ErrorBoundary fallbackLabel="The Community tab encountered an error.">
              <Suspense fallback={<PageFallback label="Loading community notes" />}>
                <ExploreHistoryPage
                  initialExplorationId={sharedExplorationId}
                  onGoToFindings={handleCommunityGoToFindings}
                  onOpenQuery={handleCommunityOpenQuery}
                  onTabChange={handleTabChange}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.agent && (
          <div hidden={activeTab !== 'agent'} aria-hidden={activeTab !== 'agent'}>
            <ErrorBoundary fallbackLabel="The Agent Lab encountered an error.">
              <Suspense fallback={<PageFallback label="Loading agent lab" />}>
                <AgentLabPage />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

export default App
