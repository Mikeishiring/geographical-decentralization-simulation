import { useState } from 'react'
import { motion } from 'framer-motion'
import { Database } from 'lucide-react'
import { PrecomputedEvidenceSurface } from '../components/simulation/PrecomputedEvidenceSurface'
import {
  SimulationModeToggle,
  type SimulationSurfaceMode,
} from '../components/simulation/SimulationModeToggle'
import { useSimulationLabRouteState } from '../components/simulation/useSimulationLabRouteState'
import { DataLabSurface } from '../components/data/DataLabSurface'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../lib/theme'
import type { TabId } from '../components/layout/TabNav'

export function SimulationLabPage({
  onOpenCommunityExploration: _onOpenCommunityExploration,
  onTabChange,
}: {
  onOpenCommunityExploration?: (explorationId: string) => void
  onTabChange?: (tab: TabId) => void
} = {}) {
  const routeState = useSimulationLabRouteState()
  const [resultsMode, setResultsMode] = useState<SimulationSurfaceMode>('evidence')

  return (
    <div className="space-y-6">
      {resultsMode === 'evidence' ? (
        <PrecomputedEvidenceSurface
          catalogScriptUrl={routeState.researchCatalogScriptUrl}
          viewerBaseUrl={routeState.researchViewerBaseUrl}
          onModeChange={setResultsMode}
        />
      ) : (
        <>
          <motion.div
            className="relative overflow-hidden rounded-[1.15rem] border border-rule/70 bg-white/92 px-5 py-5 shadow-sm"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
          >
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[0.08]">
                  <Database className="h-[18px] w-[18px] text-accent" />
                </div>
                <div className="max-w-2xl">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                    Results
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
                    Data Lab
                  </h1>
                  <p className="mt-2 text-[14px] leading-6 text-muted">
                    Query the underlying research datasets directly in SQL with DuckDB in the browser.
                  </p>
                </div>
              </div>

              <div className="self-start">
                <SimulationModeToggle value={resultsMode} onChange={setResultsMode} />
              </div>
            </div>
          </motion.div>

          <DataLabSurface
            currentJobId={routeState.currentJobId}
            publishedDetailPath={routeState.exactComparisonPath}
            researchViewerBaseUrl={routeState.researchViewerBaseUrl}
          />
        </>
      )}

      {/* Cross-tab navigation footer */}
      {onTabChange && (
        <motion.div
          className="mt-12 grid gap-3 sm:grid-cols-3"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          {([
            { tab: 'paper' as TabId, eyebrow: 'Read the paper', title: 'Paper', detail: 'Editorial reading with source provenance and visual evidence.' },
            { tab: 'agent' as TabId, eyebrow: 'Questions & experiments', title: 'Agent workspace', detail: 'Ask questions about the paper or run autonomous experiments.' },
            { tab: 'community' as TabId, eyebrow: 'Public responses', title: 'Community notes', detail: 'Human notes on readings and simulation runs.' },
          ] as const).map(item => (
            <motion.button
              key={item.tab}
              variants={STAGGER_ITEM}
              whileTap={{ scale: 0.98 }}
              transition={SPRING_CRISP}
              onClick={() => onTabChange(item.tab)}
              className="group relative overflow-hidden rounded-xl border border-rule bg-white p-4 text-left card-hover"
            >
              <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{item.eyebrow}</span>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-13 font-medium text-text-primary group-hover:text-accent transition-colors">{item.title}</span>
                <span className="text-xs text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted">{item.detail}</div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}
