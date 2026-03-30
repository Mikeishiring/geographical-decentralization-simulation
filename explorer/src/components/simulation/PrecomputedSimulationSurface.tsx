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
    <div className="lab-stage-hero mb-5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="lab-section-title">Precomputed starter result</div>
          <div className="mt-2 text-[1.55rem] font-semibold tracking-tight text-text-primary sm:text-[1.7rem]">
            Start from a live paper-backed result surface, then adjust the controls around it.
          </div>
          <div className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            This is the nearest precomputed simulation for the current setup. It gives you the charts and world map immediately, so the page starts from evidence instead of an empty lab shell.
          </div>
        </div>

        {dataset ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
            <div className="lab-option-card px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Using dataset</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">{formatPublishedDatasetLabel(dataset)}</div>
              <div className="mt-1 text-xs leading-5 text-muted">{recommendation?.reason ?? 'Nearest checked-in result for the current controls.'}</div>
            </div>
            <div className="lab-option-card px-4 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Why it is here</div>
              <div className="mt-1.5 text-sm font-medium text-text-primary">Visible before exact execution</div>
              <div className="mt-1 text-xs leading-5 text-muted">Use the controls below to change the scenario, then run the exact engine only when you need fresh evidence.</div>
            </div>
          </div>
        ) : null}
      </div>

      {catalogQuery.isLoading ? (
        <div className="mt-5 rounded-2xl border border-dashed border-rule bg-white/75 px-5 py-12 text-center text-sm text-muted">
          Loading the precomputed simulation surface...
        </div>
      ) : catalogQuery.isError ? (
        <div className="mt-5 rounded-2xl border border-dashed border-warning/35 bg-warning/6 px-5 py-8 text-sm text-text-primary">
          {(catalogQuery.error as Error).message}
        </div>
      ) : dataset ? (
        <div className="mt-5 overflow-hidden rounded-[28px] border border-rule bg-white shadow-[0_24px_64px_rgba(15,23,42,0.08)]">
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
          'mt-5 rounded-2xl border border-dashed border-rule bg-white/75 px-5 py-12 text-center text-sm text-muted',
        )}>
          No precomputed simulation dataset is available for this surface yet.
        </div>
      )}
    </div>
  )
}
