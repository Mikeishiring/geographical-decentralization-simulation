import { lazy, Suspense, useEffect, useState } from 'react'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { TabNav } from './components/layout/TabNav'
import { PaperReaderPage } from './pages/PaperReaderPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { CONTENT_MAX_WIDTH } from './lib/theme'

const Results = lazy(() => import('./components/simulation/PrecomputedEvidenceSurface').then(m => ({ default: m.PrecomputedEvidenceSurface })))
const DataLab = lazy(() => import('./components/data/DemoDataLab'))

function readTab() {
  return new URLSearchParams(location.search).get('tab') === 'results' ? 'results' : 'paper'
}

export default function DemoApp() {
  const [tab, setTab] = useState<'paper' | 'results'>(readTab)
  const [mode, setMode] = useState<'evidence' | 'data'>('evidence')
  useEffect(() => {
    const sync = () => setTab(readTab())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  return <div className="min-h-screen overflow-x-clip bg-canvas">
    <a href="#main-content" className="skip-to-content">Skip to content</a>
    <Header />
    <TabNav demo activeTab={tab} onTabChange={next => {
      const value = next === 'results' ? 'results' : 'paper'
      const url = new URL(location.href)
      url.searchParams.set('tab', value)
      url.hash = ''
      history.pushState({}, '', url)
      setTab(value)
    }} />
    <main id="main-content" className={`${CONTENT_MAX_WIDTH} mx-auto px-4 py-4 sm:px-6`}>
      <p className="mb-4 text-xs leading-5 text-muted">Explore the published paper and recorded simulations. This edition uses saved research data; it does not run new simulations or AI queries.</p>
      <ErrorBoundary fallbackLabel="The research view could not load.">
        {tab === 'paper' ? <PaperReaderPage readOnly /> : <Suspense fallback={<p role="status">Loading research data…</p>}>
          {mode === 'evidence' ? <Results catalogScriptUrl="/research-demo/assets/research-catalog.js" viewerBaseUrl="/research-demo" onModeChange={setMode} /> : <DataLab onBack={() => setMode('evidence')} />}
        </Suspense>}
      </ErrorBoundary>
    </main>
    <Footer />
  </div>
}
