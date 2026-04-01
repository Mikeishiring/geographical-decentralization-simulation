import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { BlockCanvas } from '../../explore/BlockCanvas'
import { cn } from '../../../lib/cn'
import {
  getSimulationArtifact,
  type SimulationArtifact,
  type SimulationManifest,
} from '../../../lib/simulation-api'
import type { PublishedDatasetPayload } from '../PublishedDatasetViewer'
import {
  fetchPublishedAnalyticsPayload,
  formatPublishedDatasetLabel,
} from '../simulation-lab-comparison'
import type { ResearchDatasetEntry } from '../simulation-lab-types'
import {
  parseAttestBySlotJson,
  parseActionReasonsCsv,
  parsePaperGeographyMetrics,
  parseProposalTimeBySlotJson,
  parseRegionCounterBySlotJson,
} from './csvArtifacts'
import {
  buildExactCopilotGroundingPacket,
  buildPublishedCopilotGroundingPacket,
} from './copilotGrounding'
import {
  buildDormantAiAnalysisPlan,
  buildDormantNotebookBlueprint,
  type DormantAnalysisRecipeId,
} from './analysisWorkbench'

interface CustomAnalysisNotebookIncubatorProps {
  readonly currentJobId: string | null
  readonly manifest: SimulationManifest | null
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly comparisonDataset?: ResearchDatasetEntry | null
  readonly catalogDatasets: readonly ResearchDatasetEntry[]
  readonly viewerBaseUrl: string
}

type ManifestArtifact = SimulationArtifact

function buildArtifactQueryOptions(
  currentJobId: string | null,
  artifact: ManifestArtifact | null,
) {
  return {
    queryKey: [
      'roadmap-incubator-analysis-artifact',
      currentJobId ?? '',
      artifact?.name ?? '',
      artifact?.sha256 ?? 'missing',
    ],
    queryFn: () => getSimulationArtifact(currentJobId!, artifact!.name),
    enabled: Boolean(currentJobId && artifact),
    staleTime: Infinity,
  } as const
}

const RECIPE_ORDER: readonly DormantAnalysisRecipeId[] = [
  'parameter-sweep',
  'foil-divergence',
  'migration-audit',
  'validator-tail-risk',
] as const

export function CustomAnalysisNotebookIncubator({
  currentJobId,
  manifest,
  selectedDataset,
  comparisonDataset = null,
  catalogDatasets,
  viewerBaseUrl,
}: CustomAnalysisNotebookIncubatorProps) {
  const [activeRecipeId, setActiveRecipeId] = useState<DormantAnalysisRecipeId>('parameter-sweep')

  const actionReasonsArtifact = manifest?.artifacts.find(artifact => artifact.name === 'action_reasons.csv') ?? null
  const regionCounterArtifact = manifest?.artifacts.find(artifact => artifact.name === 'region_counter_per_slot.json') ?? null
  const paperMetricsArtifact = manifest?.artifacts.find(artifact => artifact.name === 'paper_geography_metrics.json') ?? null
  const proposalTimeArtifact = manifest?.artifacts.find(artifact => artifact.name === 'proposal_time_by_slot.json') ?? null
  const attestArtifact = manifest?.artifacts.find(artifact => artifact.name === 'attest_by_slot.json') ?? null

  const actionReasonsQuery = useQuery(buildArtifactQueryOptions(currentJobId, actionReasonsArtifact))
  const regionCounterQuery = useQuery(buildArtifactQueryOptions(currentJobId, regionCounterArtifact))
  const paperMetricsQuery = useQuery(buildArtifactQueryOptions(currentJobId, paperMetricsArtifact))
  const proposalTimeQuery = useQuery(buildArtifactQueryOptions(currentJobId, proposalTimeArtifact))
  const attestQuery = useQuery(buildArtifactQueryOptions(currentJobId, attestArtifact))

  const familyDatasets = useMemo(() => selectedDataset
    ? catalogDatasets.filter(entry => entry.evaluation === selectedDataset.evaluation)
    : [], [catalogDatasets, selectedDataset])

  const familyQueries = useQueries({
    queries: familyDatasets.map(dataset => ({
      queryKey: ['roadmap-incubator-custom-analysis-family', viewerBaseUrl, dataset.path],
      queryFn: () => fetchPublishedAnalyticsPayload(viewerBaseUrl, dataset.path),
      staleTime: Infinity,
    })),
  })

  const familyPayloadByPath = useMemo(() => new Map(
    familyDatasets.map((dataset, index) => [
      dataset.path,
      (familyQueries[index]?.data as PublishedDatasetPayload | undefined) ?? null,
    ] as const),
  ), [familyDatasets, familyQueries])

  const exactPacket = useMemo(() => {
    if (
      typeof actionReasonsQuery.data !== 'string'
      || typeof regionCounterQuery.data !== 'string'
      || typeof paperMetricsQuery.data !== 'string'
      || typeof proposalTimeQuery.data !== 'string'
      || typeof attestQuery.data !== 'string'
    ) {
      return null
    }

    return buildExactCopilotGroundingPacket({
      actionReasons: parseActionReasonsCsv(actionReasonsQuery.data),
      regionCounterBySlot: parseRegionCounterBySlotJson(regionCounterQuery.data),
      paperMetrics: parsePaperGeographyMetrics(paperMetricsQuery.data),
      proposalTimeBySlot: parseProposalTimeBySlotJson(proposalTimeQuery.data),
      attestBySlot: parseAttestBySlotJson(attestQuery.data),
    })
  }, [
    actionReasonsQuery.data,
    attestQuery.data,
    paperMetricsQuery.data,
    proposalTimeQuery.data,
    regionCounterQuery.data,
  ])

  const selectedPayload = selectedDataset
    ? familyPayloadByPath.get(selectedDataset.path) ?? null
    : null
  const comparisonPayload = comparisonDataset
    ? familyPayloadByPath.get(comparisonDataset.path) ?? null
    : null

  const publishedPacket = useMemo(() => {
    if (!selectedDataset) return null
    return buildPublishedCopilotGroundingPacket({
      dataset: selectedDataset,
      payload: selectedPayload,
      comparisonDataset,
      comparisonPayload,
    })
  }, [comparisonDataset, comparisonPayload, selectedDataset, selectedPayload])

  const plan = useMemo(() => buildDormantAiAnalysisPlan({
    manifest,
    selectedDataset,
    comparisonDataset,
    exactPacket,
    publishedPacket,
    familyEntries: familyDatasets.map(dataset => ({
      dataset,
      payload: familyPayloadByPath.get(dataset.path) ?? null,
    })),
  }), [
    comparisonDataset,
    exactPacket,
    familyDatasets,
    familyPayloadByPath,
    manifest,
    publishedPacket,
    selectedDataset,
  ])

  useEffect(() => {
    const active = plan.recipes.find(recipe => recipe.id === activeRecipeId)
    if (active) return
    const fallback = plan.recipes.find(recipe => recipe.ready) ?? plan.recipes[0] ?? null
    if (fallback) {
      setActiveRecipeId(fallback.id)
    }
  }, [activeRecipeId, plan.recipes])

  useEffect(() => {
    const active = plan.recipes.find(recipe => recipe.id === activeRecipeId)
    if (active?.ready) return
    const fallback = RECIPE_ORDER
      .map(id => plan.recipes.find(recipe => recipe.id === id) ?? null)
      .find((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe?.ready))
    if (fallback && fallback.id !== activeRecipeId) {
      setActiveRecipeId(fallback.id)
    }
  }, [activeRecipeId, plan.recipes])

  const notebookBlueprint = useMemo(() => buildDormantNotebookBlueprint({
    plan,
    activeRecipeId,
    manifest,
    selectedDataset,
    comparisonDataset,
  }), [activeRecipeId, comparisonDataset, manifest, plan, selectedDataset])

  const activeRecipe = plan.recipes.find(recipe => recipe.id === activeRecipeId) ?? null
  const errorMessages = [
    actionReasonsQuery.error,
    regionCounterQuery.error,
    paperMetricsQuery.error,
    proposalTimeQuery.error,
    attestQuery.error,
    ...familyQueries.map(query => query.error),
  ].flatMap(error => error instanceof Error ? [error.message] : [])

  const readyRecipeCount = plan.recipes.filter(recipe => recipe.ready).length
  const readySourceCount = plan.dataSources.filter(source => source.ready).length

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="text-xs text-muted">Roadmap incubator</div>
        <div className="mt-1 text-sm text-text-primary">4a, 4b. Custom analysis and notebook mode</div>
        <div className="mt-2 text-xs leading-5 text-muted">
          Dormant phase-4 scaffolding only. This workbench stages analysis recipes, output contracts, and notebook-session affordances without adding any live route, API surface, or execution path.
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        {errorMessages.map(message => (
          <div key={message} className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-danger">
            {message}
          </div>
        ))}

        <div className="grid gap-3 xl:grid-cols-4">
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs text-text-faint">Ready recipes</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{readyRecipeCount.toLocaleString()}</div>
            <div className="mt-1 text-xs leading-5 text-muted">Bounded prompts that can already produce structured outputs from cached data.</div>
          </div>
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs text-text-faint">Ready sources</div>
            <div className="mt-1 text-2xl font-semibold text-text-primary">{readySourceCount.toLocaleString()}</div>
            <div className="mt-1 text-xs leading-5 text-muted">Exact-run artifacts and frozen replay payloads currently available to the incubator.</div>
          </div>
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs text-text-faint">Selected replay</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              {selectedDataset ? formatPublishedDatasetLabel(selectedDataset) : 'None'}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">Primary replay context for sweep, foil, and notebook prompts.</div>
          </div>
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs text-text-faint">Exact run</div>
            <div className="mt-1 text-sm font-medium text-text-primary">{manifest?.jobId ?? 'None'}</div>
            <div className="mt-1 text-xs leading-5 text-muted">Cached exact-run job used for migration and validator-trace recipes.</div>
          </div>
        </div>

        <section className="space-y-4">
          <div className="text-sm font-medium text-text-primary">{plan.title}</div>

          <div className="grid gap-3 xl:grid-cols-2">
            {plan.dataSources.map(source => (
              <div
                key={source.id}
                className={cn(
                  'rounded-xl border px-4 py-3',
                  source.ready
                    ? 'border-rule bg-surface-active'
                    : 'border-rule/70 bg-white',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text-primary">{source.label}</div>
                  <div className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]',
                    source.ready
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700',
                  )}>
                    {source.ready ? 'Ready' : 'Waiting'}
                  </div>
                </div>
                <div className="mt-2 text-xs leading-5 text-muted">{source.detail}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {plan.promptSuggestions.map(prompt => (
              <div key={prompt} className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs text-text-primary">
                {prompt}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {plan.recipes.map(recipe => (
              <button
                key={recipe.id}
                onClick={() => setActiveRecipeId(recipe.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  activeRecipeId === recipe.id
                    ? 'border-accent bg-white text-accent'
                    : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                )}
              >
                {recipe.label}
              </button>
            ))}
          </div>

          {activeRecipe ? (
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="rounded-xl border border-rule bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-text-primary">{activeRecipe.label}</div>
                    <div className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]',
                      activeRecipe.ready
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700',
                    )}>
                      {activeRecipe.ready ? 'Ready' : 'Waiting'}
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">{activeRecipe.prompt}</div>
                  <div className="mt-2 text-xs leading-5 text-muted">{activeRecipe.readinessDetail}</div>
                  <div className="mt-4 text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Bounded script preview</div>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                    <code>{activeRecipe.script}</code>
                  </pre>
                </div>

                {activeRecipe.blocks.length > 0 ? (
                  <BlockCanvas blocks={activeRecipe.blocks} showExport={false} />
                ) : (
                  <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
                    This recipe has no preview blocks yet because its required data sources are not ready in the incubator context.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Safety rails</div>
                  <div className="mt-3 space-y-2">
                    {plan.safetyRails.map(rule => (
                      <div key={rule} className="text-sm leading-6 text-muted">{rule}</div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Output contract</div>
                  <div className="mt-3 space-y-3">
                    {plan.outputContract.map(([field, description]) => (
                      <div key={field}>
                        <div className="text-sm font-medium text-text-primary">{field}</div>
                        <div className="mt-1 text-xs leading-5 text-muted">{description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="text-sm font-medium text-text-primary">{notebookBlueprint.sessionLabel}</div>

          <div className="grid gap-3 xl:grid-cols-4">
            {notebookBlueprint.lifecycle.map(item => (
              <div key={item} className="rounded-xl border border-rule bg-surface-active px-4 py-3 text-sm leading-6 text-muted">
                {item}
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-rule bg-white px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Helper library</div>
                <div className="mt-3 space-y-3">
                  {notebookBlueprint.helperLibrary.map(([name, description]) => (
                    <div key={name}>
                      <div className="text-sm font-medium text-text-primary">{name}</div>
                      <div className="mt-1 text-xs leading-5 text-muted">{description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-rule bg-white px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">Notebook output contract</div>
                <div className="mt-3 space-y-3">
                  {notebookBlueprint.outputContract.map(([field, description]) => (
                    <div key={field}>
                      <div className="text-sm font-medium text-text-primary">{field}</div>
                      <div className="mt-1 text-xs leading-5 text-muted">{description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {notebookBlueprint.cells.map(cell => (
                <div key={cell.label} className="rounded-xl border border-rule bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-text-primary">{cell.label}</div>
                    <div className="rounded-full bg-surface-active px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                      {cell.kind}
                    </div>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                    <code>{cell.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {notebookBlueprint.previewBlocks.length > 0 ? (
            <BlockCanvas blocks={notebookBlueprint.previewBlocks} showExport={false} />
          ) : (
            <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
              The notebook session blueprint is staged, but its preview output depends on at least one ready analysis recipe.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
