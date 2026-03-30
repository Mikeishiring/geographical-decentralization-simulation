import { useState, useCallback, useEffect } from 'react'
import { Header } from './components/layout/Header'
import { TabNav, type TabId } from './components/layout/TabNav'
import { Footer } from './components/layout/Footer'
import { FindingsPage } from './pages/FindingsPage'
import { PaperReaderPage } from './pages/PaperReaderPage'
import { SimulationLabPage } from './pages/SimulationLabPage'
import { cn } from './lib/cn'

const VALID_TABS: readonly TabId[] = ['explore', 'paper', 'results']

interface ExplorerRouteState {
  readonly tab: TabId
  readonly query: string | null
  readonly explorationId: string | null
}

function getInitialTab(): TabId {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('tab')
  // Support legacy tab IDs from old URLs
  const migrated = raw === 'findings' || raw === 'history' ? 'explore'
    : raw === 'deep-dive' ? 'paper'
    : raw === 'simulation' ? 'results'
    : raw
  const tab = migrated as TabId | null
  if (tab && VALID_TABS.includes(tab)) return tab
  if (params.get('q') || params.get('eid') || params.get('topic')) return 'explore'
  return 'paper'
}

function getInitialQuery(): string | null {
  return new URLSearchParams(window.location.search).get('q')
}

function getInitialExplorationId(): string | null {
  return new URLSearchParams(window.location.search).get('eid')
}

function readRouteState(): ExplorerRouteState {
  return {
    tab: getInitialTab(),
    query: getInitialQuery(),
    explorationId: getInitialExplorationId(),
  }
}

function writeRouteState(next: ExplorerRouteState, replace = false) {
  const url = new URL(window.location.href)

  if (next.tab === 'paper') {
    url.searchParams.delete('tab')
  } else {
    url.searchParams.set('tab', next.tab)
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

function App() {
  const initialRoute = readRouteState()
  const [activeTab, setActiveTab] = useState<TabId>(initialRoute.tab)
  const [sharedQuery, setSharedQuery] = useState<string | null>(initialRoute.query)
  const [sharedExplorationId, setSharedExplorationId] = useState<string | null>(initialRoute.explorationId)

  const applyRouteState = useCallback((next: ExplorerRouteState, replace = false) => {
    setActiveTab(next.tab)
    setSharedQuery(next.query)
    setSharedExplorationId(next.explorationId)
    writeRouteState(next, replace)
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

  const handleTabChange = useCallback((tab: TabId) => {
    applyRouteState({ tab, query: sharedQuery, explorationId: null }, false)
  }, [applyRouteState, sharedQuery])

  const handleFindingsQueryChange = useCallback((query: string | null) => {
    applyRouteState({ tab: 'explore', query, explorationId: null }, false)
  }, [applyRouteState])

  const handleExplorationIdChange = useCallback((explorationId: string | null) => {
    applyRouteState({ tab: 'explore', query: null, explorationId }, false)
  }, [applyRouteState])

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Header />
      <TabNav activeTab={activeTab} onTabChange={handleTabChange} />

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
            onTabChange={handleTabChange}
          />
        </div>

        <div hidden={activeTab !== 'paper'} aria-hidden={activeTab !== 'paper'}>
          <PaperReaderPage onTabChange={handleTabChange} />
        </div>

        <div hidden={activeTab !== 'results'} aria-hidden={activeTab !== 'results'}>
          <SimulationLabPage onTabChange={handleTabChange} />
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default App
