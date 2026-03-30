import type { SimulationArtifact, SimulationManifest } from '../../lib/simulation-api'
import type { Block } from '../../types/blocks'
import type { SimulationOverviewBundle } from '../../lib/simulation-api'
import { OVERVIEW_BUNDLES } from './simulation-constants'

export const EXACT_ANALYTICS_ARTIFACT_NAME = 'published_analytics_payload.json'

export function selectDefaultArtifact(artifacts: readonly SimulationArtifact[]): string | null {
  const preferred = artifacts.find(artifact => artifact.renderable && !artifact.lazy)
  if (preferred) return preferred.name
  return artifacts.find(artifact => artifact.renderable)?.name ?? null
}

export function isManifestOverviewBundle(
  bundle: (typeof OVERVIEW_BUNDLES)[number] | SimulationOverviewBundle | null,
): bundle is SimulationOverviewBundle {
  return Boolean(bundle && 'bytes' in bundle)
}

export function formatEthValue(value: number): string {
  return `${value.toFixed(4)} ETH`
}

export function defaultSimulationSummary(manifest: SimulationManifest): string {
  return `Exact ${manifest.config.paradigm} run over ${manifest.summary.slotsRecorded.toLocaleString()} recorded slots with ${formatEthValue(manifest.summary.finalAverageMev)} average MEV and ${manifest.summary.finalSupermajoritySuccess.toFixed(0)}% supermajority success.`
}

export function defaultSimulationContributionBlocks(
  manifest: SimulationManifest,
  guidanceBlocks: readonly Block[],
): readonly Block[] {
  if (guidanceBlocks.length > 0) return guidanceBlocks

  return [
    {
      type: 'stat',
      value: formatEthValue(manifest.summary.finalAverageMev),
      label: 'Final average MEV',
      sublabel: `${manifest.config.paradigm} exact run`,
    },
    {
      type: 'stat',
      value: `${manifest.summary.finalSupermajoritySuccess.toFixed(0)}%`,
      label: 'Supermajority success',
      sublabel: `${manifest.summary.slotsRecorded.toLocaleString()} slots recorded`,
    },
    {
      type: 'table',
      title: 'Exact run setup',
      headers: ['Parameter', 'Value'],
      rows: [
        ['Paradigm', manifest.config.paradigm],
        ['Validators', manifest.config.validators.toLocaleString()],
        ['Slots', manifest.config.slots.toLocaleString()],
        ['Distribution', manifest.config.distribution],
        ['Source placement', manifest.config.sourcePlacement],
        ['Attestation threshold', manifest.config.attestationThreshold.toFixed(2)],
        ['Slot time', `${manifest.config.slotTime}s`],
      ],
    },
    {
      type: 'caveat',
      text: 'This community note is tied to one bounded exact run. Treat it as evidence about this configuration, not as a universal recommendation.',
    },
  ]
}
