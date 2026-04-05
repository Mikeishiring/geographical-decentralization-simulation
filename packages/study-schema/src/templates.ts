import type {
  OmissionReason,
  StudyCapability,
  StudyClassification,
  StudySurfaceId,
} from './quality'
import type {
  StudyArtifactKind,
  StudyDashboardPattern,
  StudyRuntimeAdapterKind,
} from './schema'

export interface StudySpinupTemplate {
  readonly id: string
  readonly classification: StudyClassification
  readonly title: string
  readonly description: string
  readonly runtimeAdapter: StudyRuntimeAdapterKind
  readonly capabilities: readonly StudyCapability[]
  readonly includedSurfaces: readonly StudySurfaceId[]
  readonly omissionOverrides?: Readonly<Partial<Record<StudySurfaceId, OmissionReason>>>
  readonly dashboardPatterns: readonly StudyDashboardPattern[]
  readonly requiredArtifactKinds: readonly StudyArtifactKind[]
  readonly optionalArtifactKinds: readonly StudyArtifactKind[]
  readonly rationale: readonly string[]
  readonly starterQuestions: readonly string[]
  readonly nextSteps: readonly string[]
}

export const STUDY_SPINUP_TEMPLATES: readonly StudySpinupTemplate[] = [
  {
    id: 'simulation',
    classification: 'simulation',
    title: 'Simulation Study',
    description: 'Best for papers with runnable models, parameter sweeps, and figure replays.',
    runtimeAdapter: 'exact',
    capabilities: ['static-reading', 'figure-replay', 'exact-runtime', 'preset-comparisons', 'agent-grounded-qa'],
    includedSurfaces: ['paper', 'deep-dive', 'results', 'simulation-lab', 'agent'],
    omissionOverrides: {
      dashboard: 'duplicate-of-stronger-surface',
      community: 'not-supported-by-sources',
    },
    dashboardPatterns: ['timeseries-panel', 'parameter-sweep', 'geography-map'],
    requiredArtifactKinds: ['paper-pdf', 'dataset', 'figure', 'code'],
    optionalArtifactKinds: ['paper-html', 'runtime-output', 'appendix'],
    rationale: [
      'Simulation papers should lead with results and only expose controls that the runtime can execute honestly.',
      'A generic dashboard is usually secondary to figure replay and bounded runtime comparisons.',
    ],
    starterQuestions: [
      'What is the baseline comparison this study needs to explain?',
      'Which parameters are safe to expose as bounded experiments?',
      'What claims must stay clearly inside the model boundary?',
    ],
    nextSteps: [
      'Attach the paper PDF, core datasets, and at least one figure replay source.',
      'Map the paper scenarios into named presets before enabling the simulation lab.',
      'Record truth boundaries for any interpretation that goes beyond exact outputs.',
    ],
  },
  {
    id: 'empirical-event-study',
    classification: 'empirical-event-study',
    title: 'Empirical Event Study',
    description: 'Best for intervention windows, pre/post shifts, and observational datasets with clear timing.',
    runtimeAdapter: 'static',
    capabilities: ['static-reading', 'dataset-dashboard', 'agent-grounded-qa'],
    includedSurfaces: ['paper', 'deep-dive', 'dashboard', 'agent'],
    omissionOverrides: {
      results: 'duplicate-of-stronger-surface',
      'simulation-lab': 'implies-false-interactivity',
      community: 'not-supported-by-sources',
    },
    dashboardPatterns: ['event-timeline', 'pre-post-comparison'],
    requiredArtifactKinds: ['paper-pdf', 'dataset', 'table'],
    optionalArtifactKinds: ['paper-html', 'figure', 'appendix'],
    rationale: [
      'Event studies should expose timing-aware dashboards instead of fake runtime controls.',
      'Interpretive claims need explicit truth-boundary labels because causal language can outrun the evidence.',
    ],
    starterQuestions: [
      'What changes around the event window?',
      'Which outcomes deserve a pre/post comparison?',
      'Which interpretations are inferred rather than directly observed?',
    ],
    nextSteps: [
      'Define the intervention window and key before/after cohorts.',
      'Attach the main panel dataset and any summary tables used in the paper.',
      'Mark all causal interpretation blocks with their evidence boundary.',
    ],
  },
  {
    id: 'empirical-observational',
    classification: 'empirical-observational',
    title: 'Empirical Observational Study',
    description: 'Best for descriptive datasets, distribution maps, and cross-sectional or longitudinal evidence.',
    runtimeAdapter: 'static',
    capabilities: ['static-reading', 'dataset-dashboard', 'agent-grounded-qa'],
    includedSurfaces: ['paper', 'deep-dive', 'dashboard', 'agent'],
    omissionOverrides: {
      'simulation-lab': 'implies-false-interactivity',
      community: 'not-supported-by-sources',
    },
    dashboardPatterns: ['timeseries-panel', 'benchmark-matrix', 'geography-map'],
    requiredArtifactKinds: ['paper-pdf', 'dataset', 'figure'],
    optionalArtifactKinds: ['paper-html', 'table', 'appendix'],
    rationale: [
      'Observational studies usually need dataset-first surfaces, not scenario replays.',
      'Maps and benchmark matrices help when the paper compares cohorts, regions, or entities without a runnable model.',
    ],
    starterQuestions: [
      'Which distributions, cohorts, or regions should the site compare?',
      'Which measures are directly observed versus derived?',
      'Where does the paper warn against over-interpreting the data?',
    ],
    nextSteps: [
      'Attach the primary dataset and one descriptive figure or map source.',
      'Decide whether the reader needs timeseries, benchmark matrix, or geography-first views.',
      'Define the strongest descriptive claim and its limitations early.',
    ],
  },
  {
    id: 'theory-mechanism',
    classification: 'theory-mechanism',
    title: 'Theory Mechanism Study',
    description: 'Best for theorem, mechanism, and proof-oriented work without honest runtime interactivity.',
    runtimeAdapter: 'none',
    capabilities: ['static-reading', 'agent-grounded-qa'],
    includedSurfaces: ['paper', 'deep-dive', 'agent'],
    omissionOverrides: {
      results: 'weak-component-fit',
      dashboard: 'weak-component-fit',
      'simulation-lab': 'implies-false-interactivity',
      community: 'not-supported-by-sources',
    },
    dashboardPatterns: ['evidence-board', 'artifact-gallery'],
    requiredArtifactKinds: ['paper-pdf', 'figure', 'appendix'],
    optionalArtifactKinds: ['paper-html', 'table'],
    rationale: [
      'Theory papers should avoid fake dashboards and fake runtime affordances.',
      'The site should focus on assumptions, mechanism logic, and proof boundaries.',
    ],
    starterQuestions: [
      'Which assumptions support the core result?',
      'What is the strongest mechanism claim the paper actually makes?',
      'Which implications are interpretive rather than proved?',
    ],
    nextSteps: [
      'Attach the main paper and proof appendix before drafting claims.',
      'Use evidence boards to map theorem statements, assumptions, and proof references.',
      'Keep empirical-sounding copy behind explicit interpretation labels.',
    ],
  },
  {
    id: 'benchmark-evaluation',
    classification: 'benchmark-evaluation',
    title: 'Benchmark Evaluation Study',
    description: 'Best for system comparisons, quality tradeoffs, and benchmark tables.',
    runtimeAdapter: 'static',
    capabilities: ['static-reading', 'figure-replay', 'dataset-dashboard', 'agent-grounded-qa'],
    includedSurfaces: ['paper', 'deep-dive', 'results', 'agent'],
    omissionOverrides: {
      'simulation-lab': 'implies-false-interactivity',
      community: 'not-supported-by-sources',
    },
    dashboardPatterns: ['benchmark-matrix', 'pre-post-comparison', 'artifact-gallery'],
    requiredArtifactKinds: ['paper-pdf', 'dataset', 'table', 'code'],
    optionalArtifactKinds: ['paper-html', 'figure', 'runtime-output'],
    rationale: [
      'Benchmark papers need comparison-first surfaces that keep metrics grounded in the published evaluation table.',
      'Readers should be able to inspect tradeoffs without implying a runnable benchmark harness unless one actually exists.',
    ],
    starterQuestions: [
      'Which systems or baselines are being compared?',
      'Which benchmark metrics drive the main conclusion?',
      'What caveats or environment constraints bound the comparison?',
    ],
    nextSteps: [
      'Attach the benchmark table and evaluation dataset before drafting the results surface.',
      'Choose one comparison matrix that acts as the canonical reader view.',
      'Keep implementation or environment caveats tied to the claims they limit.',
    ],
  },
  {
    id: 'mixed',
    classification: 'mixed',
    title: 'Mixed-Method Study',
    description: 'Best for papers that combine simulation, empirical evidence, and interpretive synthesis.',
    runtimeAdapter: 'hybrid',
    capabilities: ['static-reading', 'figure-replay', 'dataset-dashboard', 'exact-runtime', 'preset-comparisons', 'agent-grounded-qa'],
    includedSurfaces: ['paper', 'deep-dive', 'results', 'dashboard', 'agent'],
    omissionOverrides: {
      community: 'not-supported-by-sources',
    },
    dashboardPatterns: ['timeseries-panel', 'geography-map', 'evidence-board', 'artifact-gallery'],
    requiredArtifactKinds: ['paper-pdf', 'dataset', 'figure', 'table', 'code'],
    optionalArtifactKinds: ['paper-html', 'runtime-output', 'appendix'],
    rationale: [
      'Mixed studies need explicit separation between published evidence, runtime-backed comparisons, and interpretation.',
      'A hybrid runtime is justified only when the site can keep exact execution and frozen artifacts clearly distinguished.',
    ],
    starterQuestions: [
      'Which parts of the paper are published evidence versus runnable comparisons?',
      'Where should the site switch from dashboard mode to results mode?',
      'Which claims combine more than one evidence source and need careful framing?',
    ],
    nextSteps: [
      'Separate frozen results families from exact runtime presets early.',
      'Map each major claim to the surface that should carry it.',
      'Define which comparisons are safe to expose live and which should stay replay-only.',
    ],
  },
] as const

export function listStudySpinupTemplates(): readonly StudySpinupTemplate[] {
  return STUDY_SPINUP_TEMPLATES
}

export function getStudySpinupTemplate(
  classificationOrId: StudyClassification | string,
): StudySpinupTemplate {
  const template = STUDY_SPINUP_TEMPLATES.find(candidate =>
    candidate.id === classificationOrId || candidate.classification === classificationOrId,
  )

  if (!template) {
    throw new Error(`Unknown study spinup template: ${classificationOrId}`)
  }

  return template
}
