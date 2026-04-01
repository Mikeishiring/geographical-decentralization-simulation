import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BlockCanvas } from '../../explore/BlockCanvas'
import { getSimulationArtifact, type SimulationManifest } from '../../../lib/simulation-api'
import { EXACT_ANALYTICS_ARTIFACT_NAME } from '../pending-run-helpers'
import {
  parseAttestBySlotJson,
  parseActionReasonsCsv,
  parsePublishedAnalyticsPayload,
  parsePaperGeographyMetrics,
  parseProposalTimeBySlotJson,
  parseRegionProfitsCsv,
} from './csvArtifacts'
import {
  buildMigrationAuditTrailBlocks,
  buildPerValidatorDistributionBlocks,
  buildRegionProfitTrajectoryBlocks,
  buildSourceProximityBlocks,
  buildSpatialTopologyBlocks,
} from './buildRoadmapIncubatorBlocks'

interface ExactHiddenDataIncubatorProps {
  readonly currentJobId: string | null
  readonly manifest: SimulationManifest | null
}

type ManifestArtifact = SimulationManifest['artifacts'][number]

function buildArtifactQueryOptions(
  currentJobId: string | null,
  artifact: ManifestArtifact | null,
) {
  return {
    queryKey: [
      'roadmap-incubator-artifact',
      currentJobId ?? '',
      artifact?.name ?? '',
      artifact?.sha256 ?? 'missing',
    ],
    queryFn: () => getSimulationArtifact(currentJobId!, artifact!.name),
    enabled: Boolean(currentJobId && artifact),
    staleTime: Infinity,
  } as const
}

// Intentionally not imported into the live results surface yet.
// This keeps roadmap work compile-tested but dormant until manual activation.
export function ExactHiddenDataIncubator({
  currentJobId,
  manifest,
}: ExactHiddenDataIncubatorProps) {
  const actionReasonsArtifact = manifest?.artifacts.find(artifact => artifact.name === 'action_reasons.csv') ?? null
  const regionProfitsArtifact = manifest?.artifacts.find(artifact => artifact.name === 'region_profits.csv') ?? null
  const paperMetricsArtifact = manifest?.artifacts.find(artifact => artifact.name === 'paper_geography_metrics.json') ?? null
  const analyticsPayloadArtifact = manifest?.artifacts.find(artifact => artifact.name === EXACT_ANALYTICS_ARTIFACT_NAME) ?? null
  const proposalTimeArtifact = manifest?.artifacts.find(artifact => artifact.name === 'proposal_time_by_slot.json') ?? null
  const attestBySlotArtifact = manifest?.artifacts.find(artifact => artifact.name === 'attest_by_slot.json') ?? null

  const actionReasonsQuery = useQuery(buildArtifactQueryOptions(currentJobId, actionReasonsArtifact))
  const regionProfitsQuery = useQuery(buildArtifactQueryOptions(currentJobId, regionProfitsArtifact))
  const paperMetricsQuery = useQuery(buildArtifactQueryOptions(currentJobId, paperMetricsArtifact))
  const analyticsPayloadQuery = useQuery(buildArtifactQueryOptions(currentJobId, analyticsPayloadArtifact))
  const proposalTimeQuery = useQuery(buildArtifactQueryOptions(currentJobId, proposalTimeArtifact))
  const attestBySlotQuery = useQuery(buildArtifactQueryOptions(currentJobId, attestBySlotArtifact))

  const actionReasonEntries = useMemo(
    () => typeof actionReasonsQuery.data === 'string' ? parseActionReasonsCsv(actionReasonsQuery.data) : [],
    [actionReasonsQuery.data],
  )
  const regionProfitEntries = useMemo(
    () => typeof regionProfitsQuery.data === 'string' ? parseRegionProfitsCsv(regionProfitsQuery.data) : [],
    [regionProfitsQuery.data],
  )
  const paperMetrics = useMemo(
    () => typeof paperMetricsQuery.data === 'string' ? parsePaperGeographyMetrics(paperMetricsQuery.data) : null,
    [paperMetricsQuery.data],
  )
  const analyticsPayload = useMemo(
    () => typeof analyticsPayloadQuery.data === 'string' ? parsePublishedAnalyticsPayload(analyticsPayloadQuery.data) : null,
    [analyticsPayloadQuery.data],
  )
  const proposalTimeBySlot = useMemo(
    () => typeof proposalTimeQuery.data === 'string' ? parseProposalTimeBySlotJson(proposalTimeQuery.data) : [],
    [proposalTimeQuery.data],
  )
  const attestBySlot = useMemo(
    () => typeof attestBySlotQuery.data === 'string' ? parseAttestBySlotJson(attestBySlotQuery.data) : [],
    [attestBySlotQuery.data],
  )

  const migrationBlocks = useMemo(
    () => buildMigrationAuditTrailBlocks(actionReasonEntries),
    [actionReasonEntries],
  )
  const regionProfitBlocks = useMemo(
    () => buildRegionProfitTrajectoryBlocks(regionProfitEntries, paperMetrics),
    [paperMetrics, regionProfitEntries],
  )
  const topologyBlocks = useMemo(
    () => buildSpatialTopologyBlocks(analyticsPayload),
    [analyticsPayload],
  )
  const sourceProximityBlocks = useMemo(
    () => buildSourceProximityBlocks(analyticsPayload),
    [analyticsPayload],
  )
  const validatorDistributionBlocks = useMemo(
    () => buildPerValidatorDistributionBlocks(proposalTimeBySlot, attestBySlot),
    [attestBySlot, proposalTimeBySlot],
  )

  const sectionStatuses = useMemo(() => ([
    {
      id: '3a',
      title: 'Migration audit trail',
      ready: Boolean(actionReasonsArtifact),
      detail: actionReasonsArtifact
        ? 'Backed by action_reasons.csv.'
        : 'Waiting for action_reasons.csv in the exact-run manifest.',
    },
    {
      id: '3b',
      title: 'Per-region profit trajectories',
      ready: Boolean(regionProfitsArtifact),
      detail: regionProfitsArtifact
        ? paperMetricsArtifact
          ? 'Backed by region_profits.csv with paper_geography_metrics.json enrichment.'
          : 'Backed by region_profits.csv; paper-level enrichment is missing but the hidden charts can still render.'
        : 'Waiting for region_profits.csv in the exact-run manifest.',
    },
    {
      id: '3c',
      title: 'Spatial topology metrics',
      ready: Boolean(analyticsPayloadArtifact),
      detail: analyticsPayloadArtifact
        ? `Backed by ${EXACT_ANALYTICS_ARTIFACT_NAME}.`
        : `Waiting for ${EXACT_ANALYTICS_ARTIFACT_NAME} in the exact-run manifest.`,
    },
    {
      id: '3e',
      title: 'Information source distance',
      ready: Boolean(analyticsPayloadArtifact),
      detail: analyticsPayloadArtifact
        ? `Backed by ${EXACT_ANALYTICS_ARTIFACT_NAME}.`
        : `Waiting for ${EXACT_ANALYTICS_ARTIFACT_NAME} in the exact-run manifest.`,
    },
    {
      id: '3d',
      title: 'Per-validator distributions',
      ready: Boolean(proposalTimeArtifact || attestBySlotArtifact),
      detail: proposalTimeArtifact && attestBySlotArtifact
        ? 'Backed by proposal_time_by_slot.json and attest_by_slot.json.'
        : proposalTimeArtifact
          ? 'Backed by proposal_time_by_slot.json; attestation heatmap coverage is missing.'
          : attestBySlotArtifact
            ? 'Backed by attest_by_slot.json; proposal distribution coverage is missing.'
            : 'Waiting for proposal_time_by_slot.json and/or attest_by_slot.json in the exact-run manifest.',
    },
  ]), [
    actionReasonsArtifact,
    analyticsPayloadArtifact,
    attestBySlotArtifact,
    paperMetricsArtifact,
    proposalTimeArtifact,
    regionProfitsArtifact,
  ])

  if (!actionReasonsArtifact && !regionProfitsArtifact && !analyticsPayloadArtifact && !proposalTimeArtifact && !attestBySlotArtifact) {
    return null
  }

  const loading = actionReasonsQuery.isLoading
    || regionProfitsQuery.isLoading
    || paperMetricsQuery.isLoading
    || analyticsPayloadQuery.isLoading
    || proposalTimeQuery.isLoading
    || attestBySlotQuery.isLoading
  const errorMessages = [
    actionReasonsQuery.error,
    regionProfitsQuery.error,
    paperMetricsQuery.error,
    analyticsPayloadQuery.error,
    proposalTimeQuery.error,
    attestBySlotQuery.error,
  ].flatMap(error => error instanceof Error ? [error.message] : [])

  return (
    <div className="lab-stage overflow-hidden p-0">
      <div className="border-b border-rule bg-white/96 px-5 py-4">
        <div className="text-xs text-muted">Roadmap incubator</div>
        <div className="mt-1 text-sm text-text-primary">Hidden data surfaces for exact results</div>
        <div className="mt-2 text-xs leading-5 text-muted">
          Dormant 3a, 3b, 3c, and 3e work for the exact-run surface. This remains off the live UI until it is wired in deliberately.
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-3 xl:grid-cols-2">
          {sectionStatuses.map(section => (
            <div key={section.id} className="rounded-xl border border-rule bg-surface-active px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">{section.id}</div>
                <div className={section.ready ? 'text-xs font-medium text-[#0F766E]' : 'text-xs font-medium text-[#C2553A]'}>
                  {section.ready ? 'Ready in incubator' : 'Artifact missing'}
                </div>
              </div>
              <div className="mt-2 text-sm font-medium text-text-primary">{section.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted">{section.detail}</div>
            </div>
          ))}
        </div>

        {loading
          && migrationBlocks.length === 0
          && regionProfitBlocks.length === 0
          && topologyBlocks.length === 0
          && sourceProximityBlocks.length === 0
          && validatorDistributionBlocks.length === 0 ? (
          <div className="rounded-xl border border-rule bg-white px-4 py-4 text-sm text-muted">
            Loading hidden exact-run artifacts for the incubator surface...
          </div>
        ) : null}

        {errorMessages.map(message => (
          <div key={message} className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-danger">
            {message}
          </div>
        ))}

        {migrationBlocks.length > 0 ? (
          <section>
            <div className="mb-3 text-sm font-medium text-text-primary">3a. Migration audit trail</div>
            <BlockCanvas blocks={migrationBlocks} showExport={false} />
          </section>
        ) : null}

        {regionProfitBlocks.length > 0 ? (
          <section>
            <div className="mb-3 text-sm font-medium text-text-primary">3b. Per-region profit trajectories</div>
            <BlockCanvas blocks={regionProfitBlocks} showExport={false} />
          </section>
        ) : null}

        {topologyBlocks.length > 0 ? (
          <section>
            <div className="mb-3 text-sm font-medium text-text-primary">3c. Spatial topology metrics</div>
            <BlockCanvas blocks={topologyBlocks} showExport={false} />
          </section>
        ) : null}

        {sourceProximityBlocks.length > 0 ? (
          <section>
            <div className="mb-3 text-sm font-medium text-text-primary">3e. Information source distance</div>
            <BlockCanvas blocks={sourceProximityBlocks} showExport={false} />
          </section>
        ) : null}

        {validatorDistributionBlocks.length > 0 ? (
          <section>
            <div className="mb-3 text-sm font-medium text-text-primary">3d. Per-validator distributions</div>
            <BlockCanvas blocks={validatorDistributionBlocks} showExport={false} />
          </section>
        ) : null}
      </div>
    </div>
  )
}
