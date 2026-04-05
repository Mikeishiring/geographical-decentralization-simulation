import type { StudyPackage, StudySimulationConfig } from '../src/studies/types.ts'
import {
  simulationArtifactBundles,
  simulationDistributionValues,
  simulationMetricKeys,
  simulationRenderableArtifactNames,
  simulationSourcePlacementValues,
} from '../src/types/simulation-view.ts'

function formatInlineList(values: readonly string[]): string {
  return values.filter(Boolean).join(', ')
}

function formatBulletList(values: readonly string[], fallback: string): string {
  return values.length > 0
    ? values.map(value => `- ${value}`).join('\n')
    : `- ${fallback}`
}

function formatStudyConfig(config: Partial<StudySimulationConfig>): readonly string[] {
  const rows: string[] = []

  if (config.paradigm) rows.push(`Paradigm: ${config.paradigm}`)
  if (typeof config.validators === 'number') rows.push(`Validators: ${config.validators}`)
  if (typeof config.slots === 'number') rows.push(`Slots: ${config.slots}`)
  if (config.distribution) rows.push(`Distribution: ${config.distribution}`)
  if (config.sourcePlacement) rows.push(`Source placement: ${config.sourcePlacement}`)
  if (typeof config.migrationCost === 'number') rows.push(`Migration cost: ${config.migrationCost}`)
  if (typeof config.attestationThreshold === 'number') rows.push(`Attestation threshold: ${config.attestationThreshold}`)
  if (typeof config.slotTime === 'number') rows.push(`Slot time: ${config.slotTime}s`)
  if (typeof config.seed === 'number') rows.push(`Seed: ${config.seed}`)

  return rows
}

function formatPresetSummaries(study: StudyPackage): readonly string[] {
  return Object.entries(study.runtime.simulationPresets)
    .slice(0, 10)
    .map(([presetId, preset]) => {
      const summary = formatStudyConfig(preset).join('; ')
      return summary
        ? `${presetId}: ${summary}`
        : `${presetId}: Preset declared in the study runtime.`
    })
}

function formatReplayFamilies(study: StudyPackage): readonly string[] {
  return Object.entries(study.paperCharts)
    .slice(0, 10)
    .map(([chartKey, chart]) => {
      const dashboard = chart.dashboardId
        ? study.dashboards.find(candidate => candidate.id === chart.dashboardId)
        : null
      const aliases = chart.askAliases?.length
        ? ` Aliases: ${formatInlineList(chart.askAliases)}.`
        : ''
      return dashboard
        ? `${chartKey} (${dashboard.title}): ${chart.takeaway}${aliases}`
        : `${chartKey}: ${chart.takeaway}${aliases}`
    })
}

function formatSourceRefs(study: StudyPackage): readonly string[] {
  return study.runtime.sourceBlockRefs.map(ref =>
    `${ref.label}${ref.section ? ` (${ref.section})` : ''}${ref.url ? `: ${ref.url}` : ''}`,
  )
}

function formatStudySpecificGuidance(study: StudyPackage): string {
  const supplement = study.assistant.systemPromptSupplement?.trim()
  return supplement
    ? `\n\n## Study-Specific Guidance\n${supplement}`
    : ''
}

export function buildSimulationCopilotContext(study: StudyPackage): string {
  const referenceSetup = formatStudyConfig({
    ...study.runtime.defaultSimulationConfig,
    ...study.runtime.paperReferenceOverrides,
  })
  const interactiveDefaults = formatStudyConfig(study.runtime.defaultSimulationConfig)

  return `You are the Simulation Lab copilot for "${study.metadata.title}".

You help users encode bounded experiments, stay inside the supported runtime surface,
and interpret exact outputs without overstating them.

## Study Snapshot
- Title: ${study.metadata.title}
- Subtitle: ${study.metadata.subtitle}
- Classification: ${study.classification}
- Citation: ${study.metadata.citation}

## Core Claims
${formatBulletList(study.metadata.keyClaims, 'No study-level claims were declared.')}

## Available Presets
${formatBulletList(
    formatPresetSummaries(study),
    'No explicit simulation presets were declared in the study runtime.',
  )}

## Published Results Families
${formatBulletList(
    formatReplayFamilies(study),
    'No published replay families were declared for this study package.',
  )}

## Supported Inputs
- Paradigm: ${study.runtime.defaultSimulationConfig.paradigm} by default; stay inside the study runtime adapter and declared presets when proposing runs.
- Distributions: ${formatInlineList(simulationDistributionValues)}
- Source placement: ${formatInlineList(simulationSourcePlacementValues)}
- Slot time: 6s, 8s, 12s

## Supported Summary Metrics
${formatBulletList(simulationMetricKeys, 'No summary metrics declared.')}

## Supported Renderable Artifacts
${formatBulletList(simulationRenderableArtifactNames, 'No renderable artifacts declared.')}

## Preferred Artifact Bundles
${formatBulletList(simulationArtifactBundles, 'No artifact bundles declared.')}

## Paper Reference Setup
${formatBulletList(referenceSetup, 'No paper-reference override was declared.')}

## Interactive Default
${formatBulletList(interactiveDefaults, 'No interactive default was declared.')}

## Source References
${formatBulletList(formatSourceRefs(study), 'No source references were declared.')}

## Response Policy
- The exact simulation engine is canonical. Do not alter, approximate, or narrate around missing outputs.
- Prefer exact run fields, manifest labels, and artifact names over paraphrased summaries.
- If a current exact run exists, answer from that run before proposing a new one.
- Keep interpretation explicitly labeled as guidance or framing rather than evidence.
- If the user asks for an unsupported parameter, metric, or conclusion, say so plainly and redirect to the nearest supported study-backed question.${formatStudySpecificGuidance(study)}`
}

export function buildPublishedReplayCopilotContext(study: StudyPackage): string {
  return `You are the Published Replay companion for "${study.metadata.title}".

You answer questions about one selected frozen published dataset and, when supplied,
an optional comparison dataset from the same study package.

## Study Snapshot
- Title: ${study.metadata.title}
- Subtitle: ${study.metadata.subtitle}
- Classification: ${study.classification}

## Replay Families
${formatBulletList(
    formatReplayFamilies(study),
    'No published replay families were declared for this study package.',
  )}

## Source References
${formatBulletList(formatSourceRefs(study), 'No source references were declared.')}

## Supported Replay Evidence
- Metadata from the selected replay payload should be treated as primary evidence.
- Use metric digests, focus-slot summaries, initial/final concentration snapshots, and top-region summaries when those fields are present.
- Use the optional comparison replay only when it materially sharpens the answer.
- Treat canonical paper sections and chart metadata as framing for interpretation, not as replacement evidence for the active replay.

## Response Guidelines
- Lead with what the selected replay shows, not with general background.
- Put evidence blocks before interpretation whenever evidence exists.
- Use stat, comparison, table, chart, caveat, and source blocks conservatively; prefer 3-5 high-signal blocks.
- Distinguish clearly between what the replay shows and what that might suggest.
- If the selected replay cannot answer the question directly, say so and redirect to the nearest replay-backed or paper-backed question.${formatStudySpecificGuidance(study)}`
}
