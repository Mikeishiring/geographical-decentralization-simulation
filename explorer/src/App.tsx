import { Suspense, lazy, startTransition, useState, useCallback, useEffect } from 'react'
import { Header } from './components/layout/Header'
import { TabNav, type TabId } from './components/layout/TabNav'
import { Footer } from './components/layout/Footer'
import { PaperReaderPage } from './pages/PaperReaderPage'
import { PaperHtmlPreviewPage } from './pages/PaperHtmlPreviewPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { cn } from './lib/cn'
import { AGENT_ROUTE_PARAM_KEYS, readRouteStateFromLocation, type ExplorerRouteState } from './lib/route-state'
import { PAPER_SECTIONS } from './data/paper-sections'

const DEFAULT_TAB: TabId = 'paper'
const RESULTS_TAB: TabId = 'results'
const AGENT_TAB: TabId = 'agent'
const COMMUNITY_TAB: TabId = 'community'
const PAPER_SECTION_IDS = new Set(PAPER_SECTIONS.map(section => section.id))

const loadSimulationLabPageModule = () => import('./pages/SimulationLabPage')
const loadAgentLabPageModule = () => import('./pages/AgentLabPage')
const loadExploreHistoryPageModule = () => import('./pages/ExploreHistoryPage')

const SimulationLabPage = lazy(async () => {
  const module = await loadSimulationLabPageModule()
  return { default: module.SimulationLabPage }
})

const AgentLabPage = lazy(async () => {
  const module = await loadAgentLabPageModule()
  return { default: module.default }
})

const ExploreHistoryPage = lazy(async () => {
  const module = await loadExploreHistoryPageModule()
  return { default: module.ExploreHistoryPage }
})

function writeRouteState(
  next: ExplorerRouteState,
  replace = false,
  options?: {
    readonly resetAgentRoute?: boolean
  },
) {
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

  if ((next.tab !== AGENT_TAB && next.tab !== RESULTS_TAB) || options?.resetAgentRoute) {
    for (const key of AGENT_ROUTE_PARAM_KEYS) {
      url.searchParams.delete(key)
    }
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
  if (tab === RESULTS_TAB) {
    void loadSimulationLabPageModule()
    return
  }
  if (tab === AGENT_TAB) {
    void loadAgentLabPageModule()
    return
  }
  if (tab === COMMUNITY_TAB) {
    void loadExploreHistoryPageModule()
  }
}

function PageFallback({ label }: { readonly label: string }) {
  return (
    <div className="rounded-xl border border-rule bg-white/92 px-5 py-8 shadow-sm">
      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Loading</div>
      <div className="mt-2 text-lg font-medium text-text-primary">{label}</div>
      <div className="mt-4 space-y-3">
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-active" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-active" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-active" />
      </div>
    </div>
  )
}

function hiddenPanelProps(isHidden: boolean) {
  return {
    hidden: isHidden,
    'aria-hidden': isHidden,
    ...(isHidden ? ({ inert: true } as Record<string, unknown>) : {}),
  }
}

function readPreviewMode(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('preview')
}

function App() {
  const previewMode = readPreviewMode()
  if (previewMode === 'paper-html') {
    return <PaperHtmlPreviewPage />
  }

  const initialRoute = readRouteState()
  const [activeTab, setActiveTab] = useState<TabId>(initialRoute.tab)
  const [sharedQuery, setSharedQuery] = useState<string | null>(initialRoute.query)
  const [sharedExplorationId, setSharedExplorationId] = useState<string | null>(initialRoute.explorationId)
  const [visitedTabs, setVisitedTabs] = useState<Record<TabId, boolean>>({
    paper: initialRoute.tab === DEFAULT_TAB,
    results: initialRoute.tab === RESULTS_TAB,
    agent: initialRoute.tab === AGENT_TAB,
    community: initialRoute.tab === COMMUNITY_TAB,
  })

  const applyRouteState = useCallback((
    next: ExplorerRouteState,
    replace = false,
    options?: {
      readonly resetAgentRoute?: boolean
    },
  ) => {
    startTransition(() => {
      setActiveTab(next.tab)
      setSharedQuery(next.query)
      setSharedExplorationId(next.explorationId)
      setVisitedTabs(previous => (previous[next.tab] ? previous : { ...previous, [next.tab]: true }))
      writeRouteState(next, replace, options)
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
      ;([RESULTS_TAB, AGENT_TAB, COMMUNITY_TAB] as const)
        .filter(tab => tab !== activeTab)
        .forEach(preloadTab)
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [activeTab])

  const handleTabChange = useCallback((tab: TabId) => {
    preloadTab(tab)
    applyRouteState(
      { tab, query: sharedQuery, explorationId: null },
      false,
      (tab === AGENT_TAB || tab === RESULTS_TAB) ? { resetAgentRoute: true } : undefined,
    )
  }, [applyRouteState, sharedQuery])

  const handleTabIntent = useCallback((tab: TabId) => {
    preloadTab(tab)
  }, [])

  const handleOpenCommunityExploration = useCallback((explorationId: string) => {
    applyRouteState({ tab: 'community', query: null, explorationId }, false)
  }, [applyRouteState])

  const handleCommunityGoToPaper = useCallback(() => {
    applyRouteState({ tab: 'paper', query: null, explorationId: null }, false)
  }, [applyRouteState])

  const handleCommunityOpenQuery = useCallback((query: string) => {
    applyRouteState({ tab: 'agent', query, explorationId: null }, false)
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
            'mx-auto px-4 sm:px-6',
            activeTab === 'paper' ? 'max-w-[96rem] pb-8 pt-3 sm:pt-4' : 'py-8',
            activeTab === 'paper'
              ? ''
              : (activeTab === 'agent' || activeTab === 'results')
                ? 'max-w-[96rem]'
                : 'max-w-6xl',
          )}
        >
        <div {...hiddenPanelProps(activeTab !== 'paper')}>
          <ErrorBoundary fallbackLabel="The Paper tab encountered an error.">
            <PaperReaderPage
              isActive={activeTab === 'paper'}
              onOpenCommunityExploration={handleOpenCommunityExploration}
              onTabChange={handleTabChange}
              onQueryAgent={handleCommunityOpenQuery}
            />
          </ErrorBoundary>
        </div>

        {visitedTabs.results && (
          <div {...hiddenPanelProps(activeTab !== 'results')}>
            <ErrorBoundary fallbackLabel="The Results tab encountered an error.">
              <Suspense fallback={<PageFallback label="Loading simulation lab" />}>
                <SimulationLabPage
                  onOpenCommunityExploration={handleOpenCommunityExploration}
                  onTabChange={handleTabChange}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.agent && (
          <div {...hiddenPanelProps(activeTab !== 'agent')}>
            <ErrorBoundary fallbackLabel="The Agent encountered an error.">
              <Suspense fallback={<PageFallback label="Loading agent workspace" />}>
                <AgentLabPage
                  onTabChange={handleTabChange}
                  onOpenCommunityExploration={handleOpenCommunityExploration}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {visitedTabs.community && (
          <div {...hiddenPanelProps(activeTab !== 'community')}>
            <ErrorBoundary fallbackLabel="The Community tab encountered an error.">
              <Suspense fallback={<PageFallback label="Loading community notes" />}>
                <ExploreHistoryPage
                  initialExplorationId={sharedExplorationId}
                  onGoToPaper={handleCommunityGoToPaper}
                  onOpenQuery={handleCommunityOpenQuery}
                  onTabChange={handleTabChange}
                />
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
