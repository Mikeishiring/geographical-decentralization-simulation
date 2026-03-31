import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SimulationConfig } from '../../lib/simulation-api'
import { cn } from '../../lib/cn'
import { PublishedDatasetViewer } from './PublishedDatasetViewer'
import {
  fetchResearchCatalog,
  formatPublishedDatasetLabel,
  recommendPublishedComparisonDataset,
} from './simulation-lab-comparison'

interface PrecomputedSimulationSurfaceProps {
  readonly config: SimulationConfig
  readonly catalogScriptUrl: string
  readonly viewerBaseUrl: string
}

export function PrecomputedSimulationSurface({
  config,
  catalogScriptUrl,
  viewerBaseUrl,
}: PrecomputedSimulationSurfaceProps) {
  const catalogQuery = useQuery({
    queryKey: ['simulation-starter-catalog', catalogScriptUrl],
    queryFn: () => fetchResearchCatalog(catalogScriptUrl),
    staleTime: Infinity,
  })

  const datasets = useMemo(
    () => (catalogQuery.data?.datasets ?? []).filter(dataset => dataset.evaluation !== 'Test'),
    [catalogQuery.data],
  )
  const recommendation = useMemo(
    () => recommendPublishedComparisonDataset(config, datasets),
    [config, datasets],
  )
  const dataset = recommendation?.dataset ?? datasets[0] ?? null

  return (
    <div className="geo-accent-bar mb-5 overflow-hidden rounded-[28px] border border-rule bg-white shadow-[0_24px_64px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-rule bg-[linear-gradient(180deg,rgba(250,250,248,0.98),rgba(255,255,255,0.92))] px-5 py-3.5">
        <div
          className="lab-section-title"
          title="Paper-backed charts and map from the nearest checked-in scenario."
        >
          Published evidence
        </div>
        {dataset ? (
          <span className="lab-chip bg-white/90">
            {formatPublishedDatasetLabel(dataset)}
          </span>
        ) : null}
      </div>

      {catalogQuery.isLoading ? (
        <div className="px-5 py-12 text-center text-sm text-muted">
          Loading the precomputed simulation surface...
        </div>
      ) : catalogQuery.isError ? (
        <div className="px-5 py-8 text-sm text-text-primary">
          {(catalogQuery.error as Error).message}
        </div>
      ) : dataset ? (
        <div>
          <PublishedDatasetViewer
            viewerBaseUrl={viewerBaseUrl}
            dataset={dataset}
            initialSettings={{
              theme: 'auto',
              step: 10,
              autoplay: false,
            }}
            initialSlotIndex={0}
            anchorScope="primary"
          />
        </div>
      ) : (
        <div className={cn(
          'px-5 py-12 text-center text-sm text-muted',
        )}>
          No precomputed simulation dataset is available for this surface yet.
        </div>
      )}
    </div>
  )
}
