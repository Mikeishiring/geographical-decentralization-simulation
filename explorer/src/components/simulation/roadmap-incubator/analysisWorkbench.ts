import type { Block } from '../../../types/blocks'
import type { SimulationManifest } from '../../../lib/simulation-api'
import type { PublishedDatasetPayload } from '../PublishedDatasetViewer'
import {
  analyticsMetricSeriesForPayload,
  totalSlotsFromPayload,
  type AnalyticsQueryMetric,
} from '../simulation-analytics'
import { formatPublishedDatasetLabel } from '../simulation-lab-comparison'
import type { ResearchDatasetEntry } from '../simulation-lab-types'
import {
  buildExactCopilotGeneratedBlocks,
  buildPublishedCopilotGeneratedBlocks,
  type ExactCopilotGroundingPacket,
  type PublishedCopilotGroundingPacket,
} from './copilotGrounding'

export type DormantAnalysisRecipeId =
  | 'parameter-sweep'
  | 'foil-divergence'
  | 'migration-audit'
  | 'validator-tail-risk'

export interface DormantAnalysisSource {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly ready: boolean
}

export interface DormantAnalysisRecipe {
  readonly id: DormantAnalysisRecipeId
  readonly label: string
  readonly prompt: string
  readonly ready: boolean
  readonly readinessDetail: string
  readonly dataSourceIds: readonly string[]
  readonly script: string
  readonly blocks: readonly Block[]
}

export interface DormantAiAnalysisPlan {
  readonly title: string
  readonly promptSuggestions: readonly string[]
  readonly dataSources: readonly DormantAnalysisSource[]
  readonly safetyRails: readonly string[]
  readonly outputContract: ReadonlyArray<readonly [string, string]>
  readonly recipes: readonly DormantAnalysisRecipe[]
}

export interface DormantNotebookCell {
  readonly kind: 'markdown' | 'python'
  readonly label: string
  readonly code: string
}

export interface DormantNotebookBlueprint {
  readonly sessionLabel: string
  readonly helperLibrary: ReadonlyArray<readonly [string, string]>
  readonly lifecycle: readonly string[]
  readonly outputContract: ReadonlyArray<readonly [string, string]>
  readonly cells: readonly DormantNotebookCell[]
  readonly previewBlocks: readonly Block[]
}

interface FamilyPayloadEntry {
  readonly dataset: ResearchDatasetEntry
  readonly payload: PublishedDatasetPayload | null
}

interface NumericAxisDescriptor {
  readonly key: 'cost' | 'gamma' | 'delta' | 'cutoff'
  readonly label: string
}

const NUMERIC_AXIS_LABELS: Readonly<Record<NumericAxisDescriptor['key'], string>> = {
  cost: 'Migration cost (ETH)',
  gamma: 'Gamma',
  delta: 'Slot delta (ms)',
  cutoff: 'Cutoff (ms)',
}

function formatNumber(value: number, digits = 3): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function readSeriesValue(series: readonly number[] | undefined, slotIndex: number): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slotIndex, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readMetricAtProgress(
  payload: PublishedDatasetPayload | null,
  metric: AnalyticsQueryMetric,
  progress: number,
): number | null {
  if (!payload) return null
  const series = analyticsMetricSeriesForPayload(payload, metric)
  const totalSlots = totalSlotsFromPayload(payload)
  if (!series?.length || totalSlots <= 0) return null
  const slotIndex = totalSlots <= 1
    ? 0
    : Math.max(0, Math.min(totalSlots - 1, Math.round(progress * (totalSlots - 1))))
  return readSeriesValue(series, slotIndex)
}

function resolveNumericAxis(entries: readonly FamilyPayloadEntry[]): NumericAxisDescriptor | null {
  const candidates = (Object.keys(NUMERIC_AXIS_LABELS) as NumericAxisDescriptor['key'][])
    .map(key => {
      const values = [...new Set(
        entries
          .map(entry => entry.dataset.metadata?.[key])
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      )]
      return { key, values }
    })
    .filter(candidate => candidate.values.length > 1)
    .sort((left, right) => right.values.length - left.values.length)

  if (candidates.length === 0) return null
  const winner = candidates[0]!
  return {
    key: winner.key,
    label: NUMERIC_AXIS_LABELS[winner.key],
  }
}

function buildParameterSweepBlocks(entries: readonly FamilyPayloadEntry[]): readonly Block[] {
  const axis = resolveNumericAxis(entries)
  if (!axis) return []

  const rows = entries.flatMap(entry => {
    const axisValue = entry.dataset.metadata?.[axis.key]
    if (typeof axisValue !== 'number' || !Number.isFinite(axisValue) || !entry.payload) return []

    const halfwayGini = readMetricAtProgress(entry.payload, 'gini', 0.5)
    const finalGini = readMetricAtProgress(entry.payload, 'gini', 1)
    const finalHhi = readMetricAtProgress(entry.payload, 'hhi', 1)
    const finalLiveness = readMetricAtProgress(entry.payload, 'liveness', 1)
    if (halfwayGini == null || finalGini == null || finalHhi == null || finalLiveness == null) return []

    return [{
      dataset: entry.dataset,
      axisValue,
      halfwayGini,
      finalGini,
      finalHhi,
      finalLiveness,
    }]
  })

  if (rows.length < 3) return []

  return [
    {
      type: 'insight',
      title: 'AI analysis recipe preview',
      text: `This hidden recipe is already structured for custom sweep questions across ${rows.length.toLocaleString()} cached runs. It samples Gini at 50% progress and final-state Gini/HHI/Liveness against ${axis.label.toLowerCase()} without requesting any new simulation execution.`,
      emphasis: 'key-finding',
    },
    {
      type: 'scatter',
      title: `Halfway Gini vs ${axis.label}`,
      xLabel: axis.label,
      yLabel: 'Gini at 50% progress',
      points: rows.map(row => ({
        x: row.axisValue,
        y: row.halfwayGini,
        label: formatPublishedDatasetLabel(row.dataset),
        category: row.dataset.paradigm,
      })),
    },
    {
      type: 'table',
      title: 'Sweep sample frame',
      headers: ['Replay', axis.label, 'Halfway Gini', 'Final Gini', 'Final HHI', 'Final Liveness'],
      rows: rows.map(row => [
        formatPublishedDatasetLabel(row.dataset),
        formatNumber(row.axisValue, 4),
        formatNumber(row.halfwayGini, 4),
        formatNumber(row.finalGini, 4),
        formatNumber(row.finalHhi, 4),
        formatNumber(row.finalLiveness, 2),
      ]),
    },
  ]
}

function buildRecipeScript(
  id: DormantAnalysisRecipeId,
  selectedDataset: ResearchDatasetEntry | null,
  comparisonDataset: ResearchDatasetEntry | null,
  manifest: SimulationManifest | null,
): string {
  const exactJobId = manifest?.jobId ?? 'exact-job-id'
  const selectedPath = selectedDataset?.path ?? 'path/to/published.json'
  const comparisonPath = comparisonDataset?.path ?? 'path/to/foil.json'
  const familyLabel = selectedDataset?.evaluation ?? 'published-family'

  if (id === 'parameter-sweep') {
    return [
      'from explorer import load_published_family, render_blocks',
      '',
      `family = load_published_family("${familyLabel}")`,
      'frame = family.metric_frame(metric="gini", progress=0.5, axis="auto")',
      'blocks = family.render_scatter(',
      '    frame,',
      '    x="parameter_value",',
      '    y="metric_value",',
      '    category="paradigm",',
      ')',
      'render_blocks(blocks)',
    ].join('\n')
  }

  if (id === 'foil-divergence') {
    return [
      'from explorer import load_published_replay, compare_replays, render_blocks',
      '',
      `primary = load_published_replay("${selectedPath}")`,
      `foil = load_published_replay("${comparisonPath}")`,
      'blocks = compare_replays(primary, foil).peak_gap_report(metrics=["gini", "hhi", "liveness"])',
      'render_blocks(blocks)',
    ].join('\n')
  }

  if (id === 'migration-audit') {
    return [
      'from explorer import load_exact_run, render_blocks',
      '',
      `run = load_exact_run("${exactJobId}")`,
      'audit = run.migration_audit()',
      'blocks = audit.render(window="quarterly", include_sankey=True)',
      'render_blocks(blocks)',
    ].join('\n')
  }

  return [
    'from explorer import load_exact_run, render_blocks',
    '',
    `run = load_exact_run("${exactJobId}")`,
    'validator_frame = run.validator_timing(slot_step=10)',
    'blocks = validator_frame.render_distribution_panels(',
    '    include_boxplot=True,',
    '    include_failure_heatmap=True,',
    ')',
    'render_blocks(blocks)',
  ].join('\n')
}

export function buildDormantAiAnalysisPlan(options: {
  readonly manifest: SimulationManifest | null
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly comparisonDataset?: ResearchDatasetEntry | null
  readonly exactPacket: ExactCopilotGroundingPacket | null
  readonly publishedPacket: PublishedCopilotGroundingPacket | null
  readonly familyEntries: readonly FamilyPayloadEntry[]
}): DormantAiAnalysisPlan {
  const exactReady = Boolean(options.exactPacket && options.manifest)
  const publishedReady = Boolean(options.selectedDataset)
  const familyReadyCount = options.familyEntries.filter(entry => entry.payload).length
  const sweepBlocks = buildParameterSweepBlocks(options.familyEntries)

  const dataSources: readonly DormantAnalysisSource[] = [
    {
      id: 'exact-run',
      label: 'Exact cached run',
      detail: options.manifest
        ? `${options.manifest.artifacts.length.toLocaleString()} artifacts are available from ${options.manifest.jobId}.`
        : 'No exact run is currently selected.',
      ready: exactReady,
    },
    {
      id: 'published-primary',
      label: 'Selected published replay',
      detail: options.selectedDataset
        ? formatPublishedDatasetLabel(options.selectedDataset)
        : 'No published replay is selected.',
      ready: publishedReady,
    },
    {
      id: 'published-foil',
      label: 'Comparison replay',
      detail: options.comparisonDataset
        ? formatPublishedDatasetLabel(options.comparisonDataset)
        : 'No foil replay selected.',
      ready: Boolean(options.comparisonDataset && options.publishedPacket?.comparisonLabel),
    },
    {
      id: 'published-family',
      label: 'Published family cache',
      detail: options.selectedDataset
        ? `${familyReadyCount.toLocaleString()} family payloads are already resolved for ${options.selectedDataset.evaluation}.`
        : 'Family payloads depend on a selected published replay.',
      ready: familyReadyCount >= 3,
    },
  ]

  const recipes: readonly DormantAnalysisRecipe[] = [
    {
      id: 'parameter-sweep',
      label: 'Parameter sweep',
      prompt: 'How does Gini at the halfway point change across the current family as the numeric parameter increases?',
      ready: sweepBlocks.length > 0,
      readinessDetail: sweepBlocks.length > 0
        ? 'Ready from frozen family payloads.'
        : 'Requires at least three family payloads with a shared numeric metadata axis.',
      dataSourceIds: ['published-primary', 'published-family'],
      script: buildRecipeScript('parameter-sweep', options.selectedDataset, options.comparisonDataset ?? null, options.manifest),
      blocks: sweepBlocks,
    },
    {
      id: 'foil-divergence',
      label: 'Foil divergence',
      prompt: 'Where does the selected replay diverge most from the current foil, and how large is the gap?',
      ready: Boolean(options.publishedPacket?.comparisonLabel),
      readinessDetail: options.publishedPacket?.comparisonLabel
        ? 'Ready from aligned replay payloads.'
        : 'Requires both a primary replay and a foil replay.',
      dataSourceIds: ['published-primary', 'published-foil'],
      script: buildRecipeScript('foil-divergence', options.selectedDataset, options.comparisonDataset ?? null, options.manifest),
      blocks: options.publishedPacket
        ? buildPublishedCopilotGeneratedBlocks(options.publishedPacket, 'comparison-gaps')
        : [],
    },
    {
      id: 'migration-audit',
      label: 'Migration audit',
      prompt: 'How much migration happened early versus late, and is cost blocking a dominant reason in this exact run?',
      ready: exactReady,
      readinessDetail: exactReady
        ? 'Ready from hidden exact-run artifacts.'
        : 'Requires a completed exact run with hidden artifacts loaded.',
      dataSourceIds: ['exact-run'],
      script: buildRecipeScript('migration-audit', options.selectedDataset, options.comparisonDataset ?? null, options.manifest),
      blocks: options.exactPacket
        ? buildExactCopilotGeneratedBlocks(options.exactPacket, 'migration-windows')
        : [],
    },
    {
      id: 'validator-tail-risk',
      label: 'Validator tail risk',
      prompt: 'Do proposal-time tails or weak attestation pockets cluster in a small set of validators?',
      ready: Boolean(options.exactPacket?.validatorSummary.observedProposerSlots),
      readinessDetail: options.exactPacket?.validatorSummary.observedProposerSlots
        ? 'Ready from per-validator timing traces.'
        : 'Requires per-validator timing artifacts from an exact run.',
      dataSourceIds: ['exact-run'],
      script: buildRecipeScript('validator-tail-risk', options.selectedDataset, options.comparisonDataset ?? null, options.manifest),
      blocks: options.exactPacket
        ? buildExactCopilotGeneratedBlocks(options.exactPacket, 'validator-distribution')
        : [],
    },
  ]

  return {
    title: '4a. AI-driven analysis workbench',
    promptSuggestions: recipes.map(recipe => recipe.prompt),
    dataSources,
    safetyRails: [
      'Execute only against cached artifacts and frozen published payloads by default.',
      'Require block-structured output with explicit summaries, not free-form notebooks as the transport.',
      'Keep long-running simulation reruns out of band and surface them as async follow-up jobs.',
      'Treat helper-library calls as the only stable API; generated code should not reach into raw filesystem paths directly.',
    ],
    outputContract: [
      ['summary', 'One short narrative answer for the inbox or panel header.'],
      ['blocks', 'Structured block payload rendered through BlockCanvas.'],
      ['artifacts', 'Optional files such as CSV extracts or notebook attachments.'],
      ['warnings', 'Explicit limits, missing data, or approximation notes.'],
    ],
    recipes,
  }
}

export function buildDormantNotebookBlueprint(options: {
  readonly plan: DormantAiAnalysisPlan
  readonly activeRecipeId: DormantAnalysisRecipeId
  readonly manifest: SimulationManifest | null
  readonly selectedDataset: ResearchDatasetEntry | null
  readonly comparisonDataset?: ResearchDatasetEntry | null
}): DormantNotebookBlueprint {
  const activeRecipe = options.plan.recipes.find(recipe => recipe.id === options.activeRecipeId) ?? options.plan.recipes[0] ?? null
  const selectedLabel = options.selectedDataset
    ? formatPublishedDatasetLabel(options.selectedDataset)
    : 'No published replay selected'
  const comparisonLabel = options.comparisonDataset
    ? formatPublishedDatasetLabel(options.comparisonDataset)
    : 'No foil selected'

  return {
    sessionLabel: '4b. Code editor / notebook mode',
    helperLibrary: [
      ['load_exact_run(job_id)', 'Load cached artifacts and parsed helpers for one exact simulation job.'],
      ['load_published_replay(path)', 'Load a frozen replay payload from the checked-in catalog.'],
      ['load_published_family(evaluation)', 'Resolve every frozen replay in one evaluation family.'],
      ['render_blocks(blocks)', 'Validate and emit structured chart/table/map blocks.'],
      ['save_artifact(name, content)', 'Attach derived CSV or markdown output back to the session.'],
    ],
    lifecycle: [
      'Create one Python kernel per viewer session and recycle it after inactivity.',
      'Preload helper functions and cached data handles before the first user cell runs.',
      'Allow analysis of cached results immediately; queue any new simulation requests separately.',
      'Keep execution bounded with explicit wall-clock and memory limits before activation.',
    ],
    outputContract: options.plan.outputContract,
    cells: [
      {
        kind: 'markdown',
        label: 'Prompt cell',
        code: [
          '# Analysis goal',
          '',
          activeRecipe?.prompt ?? 'Select a recipe to seed the notebook.',
          '',
          `Primary replay: ${selectedLabel}`,
          `Foil replay: ${comparisonLabel}`,
          `Exact run: ${options.manifest?.jobId ?? 'none'}`,
        ].join('\n'),
      },
      {
        kind: 'python',
        label: 'Bootstrap cell',
        code: [
          'from explorer import (',
          '    load_exact_run,',
          '    load_published_replay,',
          '    load_published_family,',
          '    render_blocks,',
          '    save_artifact,',
          ')',
          '',
          `exact_run = load_exact_run("${options.manifest?.jobId ?? 'exact-job-id'}") if "${options.manifest?.jobId ?? ''}" else None`,
          `primary = load_published_replay("${options.selectedDataset?.path ?? 'path/to/published.json'}")`,
          `foil = load_published_replay("${options.comparisonDataset?.path ?? 'path/to/foil.json'}") if "${options.comparisonDataset?.path ?? ''}" else None`,
          `family = load_published_family("${options.selectedDataset?.evaluation ?? 'published-family'}")`,
        ].join('\n'),
      },
      {
        kind: 'python',
        label: 'Analysis cell',
        code: activeRecipe?.script ?? '# No active recipe selected.',
      },
      {
        kind: 'python',
        label: 'Output cell',
        code: [
          'result = {',
          '    "summary": "Bounded analysis result",',
          '    "blocks": blocks,',
          '    "warnings": [],',
          '}',
          '',
          'render_blocks(result["blocks"])',
          'save_artifact("analysis-summary.md", result["summary"])',
        ].join('\n'),
      },
    ],
    previewBlocks: activeRecipe?.blocks ?? [],
  }
}
