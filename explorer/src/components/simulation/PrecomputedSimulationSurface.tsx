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
    <div className="mb-5 overflow-hidden rounded-[28px] border border-rule bg-white shadow-[0_24px_64px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 border-b border-rule bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.9))] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <div className="lab-section-title">Start with published evidence</div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            Read the nearest checked-in scenario before you touch the exact lab.
          </div>
          <div className="mt-1 text-xs leading-5 text-muted">
            This replay gives you paper-backed charts and the map immediately. Use the controls below only if this fixed result does not answer the question.
          </div>
        </div>

        {dataset ? (
          <div className="flex flex-wrap gap-2">
            <span className="lab-chip bg-white/85">
              {formatPublishedDatasetLabel(dataset)}
            </span>
            <span className="lab-chip bg-white/85">
              {recommendation?.reason ?? 'Nearest checked-in result for the current controls.'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 border-b border-rule bg-surface-active/35 px-4 py-3 md:grid-cols-3">
        {[
          {
            title: '1. Read the replay',
            detail: 'Start with the checked-in result tied to the current scenario family.',
          },
          {
            title: '2. Use the desk',
            detail: 'Inspect the map, charts, and figure framing before changing any parameters.',
          },
          {
            title: '3. Rerun only if needed',
            detail: 'Open the exact lab below when you need fresh evidence rather than a published replay.',
          },
        ].map(item => (
          <div key={item.title} className="rounded-xl border border-rule bg-white/85 px-3 py-3">
            <div className="text-sm font-medium text-text-primary">{item.title}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{item.detail}</div>
          </div>
        ))}
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
