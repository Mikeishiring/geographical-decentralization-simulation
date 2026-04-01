import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { BlockCanvas } from '../../explore/BlockCanvas'
import { cn } from '../../../lib/cn'
import {
  getSimulationArtifact,
  type SimulationArtifact,
  type SimulationConfig,
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
  buildExactCopilotGeneratedBlocks,
  buildExactCopilotGroundingPacket,
  buildExpandedProposedConfigs,
  buildPublishedCopilotGeneratedBlocks,
  buildPublishedCopilotGroundingPacket,
  type ExactGeneratedIntent,
  type PublishedGeneratedIntent,
} from './copilotGrounding'

interface CopilotGroundingIncubatorProps {
  readonly currentJobId: string | null
  readonly manifest: SimulationManifest | null
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly comparisonDataset?: ResearchDatasetEntry | null
  readonly viewerBaseUrl: string
}

type ManifestArtifact = SimulationArtifact

const EXACT_INTENT_OPTIONS: readonly {
  readonly id: ExactGeneratedIntent
  readonly label: string
}[] = [
  { id: 'metric-peaks', label: 'Metric peaks' },
  { id: 'region-shifts', label: 'Region shifts' },
  { id: 'migration-windows', label: 'Migration windows' },
  { id: 'validator-distribution', label: 'Validator distribution' },
] as const

const PUBLISHED_INTENT_OPTIONS: readonly {
  readonly id: PublishedGeneratedIntent
  readonly label: string
}[] = [
  { id: 'metric-peaks', label: 'Metric peaks' },
  { id: 'comparison-gaps', label: 'Comparison gaps' },
  { id: 'region-shifts', label: 'Region shifts' },
] as const

function buildArtifactQueryOptions(
  currentJobId: string | null,
  artifact: ManifestArtifact | null,
) {
  return {
    queryKey: [
      'roadmap-incubator-copilot-artifact',
      currentJobId ?? '',
      artifact?.name ?? '',
      artifact?.sha256 ?? 'missing',
    ],
    queryFn: () => getSimulationArtifact(currentJobId!, artifact!.name),
    enabled: Boolean(currentJobId && artifact),
    staleTime: Infinity,
  } as const
}

function configRows(config: SimulationConfig): ReadonlyArray<readonly [string, string]> {
  return [
    ['Paradigm', config.paradigm],
    ['Validators', config.validators.toLocaleString()],
    ['Slots', config.slots.toLocaleString()],
    ['Distribution', config.distribution],
    ['Source placement', config.sourcePlacement],
    ['Migration cost', `${config.migrationCost.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`],
    ['Gamma', config.attestationThreshold.toLocaleString(undefined, { maximumFractionDigits: 4 })],
    ['Slot time', `${config.slotTime}s`],
    ['Seed', config.seed.toLocaleString()],
  ]
}

export function CopilotGroundingIncubator({
  currentJobId,
  manifest,
  selectedDataset,
  comparisonDataset = null,
  viewerBaseUrl,
}: CopilotGroundingIncubatorProps) {
  const [exactIntent, setExactIntent] = useState<ExactGeneratedIntent>('metric-peaks')
  const [publishedIntent, setPublishedIntent] = useState<PublishedGeneratedIntent>('metric-peaks')

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

  const publishedQueries = useQueries({
    queries: [selectedDataset, comparisonDataset]
      .filter((dataset): dataset is ResearchDatasetEntry => Boolean(dataset))
      .map(dataset => ({
        queryKey: ['roadmap-incubator-copilot-published', viewerBaseUrl, dataset.path],
        queryFn: () => fetchPublishedAnalyticsPayload(viewerBaseUrl, dataset.path),
        staleTime: Infinity,
      })),
  })

  const publishedPayloadByPath = useMemo(() => {
    const datasets = [selectedDataset, comparisonDataset].filter((dataset): dataset is ResearchDatasetEntry => Boolean(dataset))
    return new Map(
      datasets.map((dataset, index) => [
        dataset.path,
        (publishedQueries[index]?.data as PublishedDatasetPayload | undefined) ?? null,
      ] as const),
    )
  }, [comparisonDataset, publishedQueries, selectedDataset])

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

  const publishedPacket = useMemo(() => {
    if (!selectedDataset) return null
    return buildPublishedCopilotGroundingPacket({
      dataset: selectedDataset,
      payload: publishedPayloadByPath.get(selectedDataset.path) ?? null,
      comparisonDataset,
      comparisonPayload: comparisonDataset
        ? publishedPayloadByPath.get(comparisonDataset.path) ?? null
        : null,
    })
  }, [comparisonDataset, publishedPayloadByPath, selectedDataset])

  const exactBlocks = useMemo(
    () => exactPacket ? buildExactCopilotGeneratedBlocks(exactPacket, exactIntent) : [],
    [exactIntent, exactPacket],
  )
  const publishedBlocks = useMemo(
    () => publishedPacket ? buildPublishedCopilotGeneratedBlocks(publishedPacket, publishedIntent) : [],
    [publishedIntent, publishedPacket],
  )
  const expandedConfigs = useMemo(
    () => buildExpandedProposedConfigs(manifest?.config ?? null),
    [manifest?.config],
  )

  const errorMessages = [
    actionReasonsQuery.error,
    regionCounterQuery.error,
    paperMetricsQuery.error,
    proposalTimeQuery.error,
    attestQuery.error,
    ...publishedQueries.map(query => query.error),
  ].flatMap(error => error instanceof Error ? [error.message] : [])

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="text-xs text-muted">Roadmap incubator</div>
        <div className="mt-1 text-sm text-text-primary">2a, 2b, 2c. Data-grounded copilot workbench</div>
        <div className="mt-2 text-xs leading-5 text-muted">
          Dormant copilot extensions only. This workbench builds full artifact-grounding packets, deterministic chartable answers, and full-field proposed configs without touching the live exact or replay copilot flows.
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        {errorMessages.map(message => (
          <div key={message} className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-danger">
            {message}
          </div>
        ))}

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">2a Exact grounding</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {exactPacket ? 'Full artifact packet ready' : 'Waiting for hidden exact artifacts'}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              Builds quantitative answers from `action_reasons.csv`, `region_counter_per_slot.json`, `paper_geography_metrics.json`, `proposal_time_by_slot.json`, and `attest_by_slot.json`.
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">2a Published grounding</div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {publishedPacket ? 'Full replay packet ready' : 'Waiting for selected published replay payload'}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              Expands the replay companion from slot-snapshot narration into full-series peak and divergence summaries over the frozen payload.
            </div>
          </div>
        </div>

        {exactPacket ? (
          <section className="space-y-4">
            <div className="text-sm font-medium text-text-primary">2a. Exact packet summary</div>
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
              <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-xs text-text-faint">Grounded peaks</div>
                <div className="mt-1 text-2xl font-semibold text-text-primary">{exactPacket.metricPeaks.length}</div>
              </div>
              <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-xs text-text-faint">Total migrations</div>
                <div className="mt-1 text-2xl font-semibold text-text-primary">{exactPacket.migrationSummary.totalMigrations.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-xs text-text-faint">Observed proposer slots</div>
                <div className="mt-1 text-2xl font-semibold text-text-primary">{exactPacket.validatorSummary.observedProposerSlots.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-rule bg-surface-active px-4 py-3">
                <div className="text-xs text-text-faint">Prompt seeds</div>
                <div className="mt-1 text-2xl font-semibold text-text-primary">{exactPacket.promptSuggestions.length}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {exactPacket.promptSuggestions.map(prompt => (
                <div key={prompt} className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs text-text-primary">
                  {prompt}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {EXACT_INTENT_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setExactIntent(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    exactIntent === option.id
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <BlockCanvas blocks={exactBlocks} showExport={false} />
          </section>
        ) : null}

        {publishedPacket ? (
          <section className="space-y-4">
            <div className="text-sm font-medium text-text-primary">2b. Published replay generated blocks</div>
            <div className="rounded-xl border border-rule bg-surface-active px-4 py-3 text-xs leading-5 text-muted">
              Active replay: <span className="font-medium text-text-primary">{formatPublishedDatasetLabel(selectedDataset!)}</span>
              {comparisonDataset ? (
                <>
                  {' '}· Foil: <span className="font-medium text-text-primary">{formatPublishedDatasetLabel(comparisonDataset)}</span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {publishedPacket.promptSuggestions.map(prompt => (
                <div key={prompt} className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs text-text-primary">
                  {prompt}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {PUBLISHED_INTENT_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setPublishedIntent(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    publishedIntent === option.id
                      ? 'border-accent bg-white text-accent'
                      : 'border-rule bg-surface-active text-text-primary hover:border-border-hover',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <BlockCanvas blocks={publishedBlocks} showExport={false} />
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="text-sm font-medium text-text-primary">2c. Expanded proposed configs</div>
          <div className="grid gap-4 xl:grid-cols-3">
            {expandedConfigs.map(entry => (
              <div key={entry.label} className="rounded-xl border border-rule bg-white px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">{entry.label}</div>
                <div className="mt-2 text-sm leading-6 text-muted">{entry.reason}</div>
                <div className="mt-4 space-y-2 text-xs">
                  {configRows(entry.config).map(([label, value]) => (
                    <div key={`${entry.label}-${label}`} className="flex items-center justify-between gap-3">
                      <span className="text-text-faint">{label}</span>
                      <span className="font-medium text-text-primary">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
