import type {
  OmissionReason,
  StudyArtifactRef,
  StudyCapability,
  StudyClassification,
  StudyClaim,
  StudyDashboardMetric,
  StudyDashboardPattern,
  StudyPackageFrame,
  StudyRuntimeAdapterKind,
  StudySurfaceId,
} from '../../packages/study-schema/src/index.ts'
import {
  buildDefaultSurfacePlan,
  getSurfaceDescriptor,
} from '../../packages/study-schema/src/index.ts'

export interface GoldenFixtureExpectation {
  readonly includedSurfaces: readonly StudySurfaceId[]
  readonly runtimeAdapter: StudyRuntimeAdapterKind
  readonly dashboardPatterns: readonly StudyDashboardPattern[]
}

export interface GoldenFixture {
  readonly id: string
  readonly name: string
  readonly study: StudyPackageFrame
  readonly expectation: GoldenFixtureExpectation
}

const EMPTY_SIMULATION_CONFIG = {
  paradigm: 'SSP',
  validators: 1,
  slots: 1,
  distribution: 'homogeneous',
  sourcePlacement: 'homogeneous',
  migrationCost: 0,
  attestationThreshold: 0.67,
  slotTime: 12,
  seed: 1,
} as const

function buildOmittedSurfaces(
  includedSurfaces: readonly StudySurfaceId[],
  overrides: Partial<Record<StudySurfaceId, OmissionReason>>,
): Readonly<Record<StudySurfaceId, OmissionReason | undefined>> {
  const included = new Set(includedSurfaces)
  return {
    paper: included.has('paper') ? undefined : overrides.paper ?? 'weak-component-fit',
    'deep-dive': included.has('deep-dive') ? undefined : overrides['deep-dive'] ?? 'weak-component-fit',
    results: included.has('results') ? undefined : overrides.results ?? 'weak-component-fit',
    dashboard: included.has('dashboard') ? undefined : overrides.dashboard ?? 'weak-component-fit',
    'simulation-lab': included.has('simulation-lab') ? undefined : overrides['simulation-lab'] ?? 'implies-false-interactivity',
    agent: included.has('agent') ? undefined : overrides.agent ?? 'weak-component-fit',
    community: included.has('community') ? undefined : overrides.community ?? 'not-supported-by-sources',
  }
}

function buildSurfaceSpecs(
  classification: StudyClassification,
  runtimeAdapter: StudyRuntimeAdapterKind,
  includedSurfaces: readonly StudySurfaceId[],
  claimIds: readonly string[],
  artifactIds: readonly string[],
  omissionOverrides: Partial<Record<StudySurfaceId, OmissionReason>> = {},
): StudyPackageFrame['surfaces'] {
  const included = new Set(includedSurfaces)
  const plan = buildDefaultSurfacePlan(classification, runtimeAdapter)

  return plan.map(entry => {
    const descriptor = getSurfaceDescriptor(entry.id)
    return {
      id: entry.id,
      title: descriptor.title,
      purpose: descriptor.purpose,
      enabled: included.has(entry.id),
      componentIds: descriptor.defaultComponents,
      requiredClaimIds: included.has(entry.id) ? claimIds : [],
      requiredArtifactIds: included.has(entry.id) ? artifactIds : [],
      omissionReason: included.has(entry.id)
        ? undefined
        : omissionOverrides[entry.id] ?? entry.omissionReason ?? 'weak-component-fit',
    }
  })
}

function buildStudyFrame(input: {
  readonly id: string
  readonly title: string
  readonly classification: StudyClassification
  readonly runtimeAdapter: StudyRuntimeAdapterKind
  readonly capabilities: readonly StudyCapability[]
  readonly includedSurfaces: readonly StudySurfaceId[]
  readonly omissionOverrides?: Partial<Record<StudySurfaceId, OmissionReason>>
  readonly artifacts: readonly StudyArtifactRef[]
  readonly claims: readonly StudyClaim[]
  readonly dashboards: StudyPackageFrame['dashboards']
  readonly dashboardMetrics: readonly StudyDashboardMetric[]
  readonly rationale: readonly string[]
}): StudyPackageFrame {
  return {
    id: input.id,
    classification: input.classification,
    metadata: {
      title: input.title,
      subtitle: 'Golden fixture for study-package QA.',
      citation: `${input.title} fixture`,
      authors: [{ name: 'Fixture Author' }],
      abstract: 'Synthetic fixture used to test generator surface selection and validation.',
      keyClaims: input.claims.map(claim => claim.text),
      references: input.artifacts
        .filter(artifact => artifact.url)
        .map(artifact => ({ label: artifact.label, url: artifact.url })),
    },
    artifacts: input.artifacts,
    claims: {
      claims: input.claims,
      featuredClaimIds: input.claims.slice(0, 2).map(claim => claim.id),
    },
    generationDecision: {
      includedSurfaces: input.includedSurfaces,
      omittedSurfaces: buildOmittedSurfaces(input.includedSurfaces, input.omissionOverrides ?? {}),
      capabilities: input.capabilities,
      rationale: input.rationale,
    },
    surfaces: buildSurfaceSpecs(
      input.classification,
      input.runtimeAdapter,
      input.includedSurfaces,
      input.claims.map(claim => claim.id),
      input.artifacts.map(artifact => artifact.id),
      input.omissionOverrides,
    ),
    dashboards: input.dashboards,
    dashboardMetrics: input.dashboardMetrics,
    navigation: {
      bestFirstStopIds: ['overview'],
      pdfUrl: 'https://example.com/paper.pdf',
      htmlUrl: 'https://example.com/paper',
      sectionPageMap: { '§1': 1 },
      sectionHtmlIdMap: { overview: 'S1' },
      appendices: [],
    },
    runtime: {
      adapter: input.runtimeAdapter,
      defaultSimulationConfig: EMPTY_SIMULATION_CONFIG,
      paperReferenceOverrides: {},
      simulationPresets: input.runtimeAdapter === 'exact' || input.runtimeAdapter === 'hybrid'
        ? {
            baseline: {
              validators: 100,
              slots: 1000,
            },
          }
        : {},
      canonicalPrewarmConfigs: input.runtimeAdapter === 'exact' || input.runtimeAdapter === 'hybrid'
        ? [{ ...EMPTY_SIMULATION_CONFIG }]
        : [],
      sourceBlockRefs: input.artifacts
        .filter(artifact => artifact.url)
        .map(artifact => ({
          label: artifact.label,
          url: artifact.url,
        })),
    },
  }
}

const SIMULATION_FIXTURE = buildStudyFrame({
  id: 'fixture-simulation',
  title: 'Simulation Archetype',
  classification: 'simulation',
  runtimeAdapter: 'exact',
  capabilities: ['static-reading', 'figure-replay', 'exact-runtime', 'preset-comparisons', 'agent-grounded-qa'],
  includedSurfaces: ['paper', 'deep-dive', 'results', 'simulation-lab', 'agent'],
  omissionOverrides: {
    dashboard: 'duplicate-of-stronger-surface',
  },
  artifacts: [
    { id: 'sim-paper', label: 'Simulation paper', kind: 'paper-pdf', url: 'https://example.com/sim-paper.pdf' },
    { id: 'sim-dataset', label: 'Simulation dataset', kind: 'dataset', path: 'fixtures/sim.csv' },
    { id: 'sim-figure', label: 'Simulation figure', kind: 'figure', path: 'fixtures/sim-figure.png' },
    { id: 'sim-code', label: 'Simulation repo', kind: 'code', url: 'https://example.com/repo' },
  ],
  claims: [
    {
      id: 'sim-main-result',
      text: 'The baseline simulation centralizes faster under the local regime.',
      sourceIds: ['sim-paper', 'sim-dataset'],
      anchors: [
        { kind: 'section', label: '§3' },
        { kind: 'dataset', label: 'Baseline output', artifactId: 'sim-dataset' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.94,
    },
    {
      id: 'sim-boundary',
      text: 'The model abstracts away production-level stochasticity.',
      sourceIds: ['sim-paper'],
      anchors: [{ kind: 'section', label: '§4' }],
      evidenceType: 'close-paraphrase',
      presentationMode: 'caveat',
      confidence: 0.92,
      truthBoundary: 'Do not restate the simulation boundary as a production claim.',
    },
  ],
  dashboards: [
    {
      id: 'sim-results',
      title: 'Simulation Results',
      pattern: 'timeseries-panel',
      questionAnswered: 'How do the two regimes evolve over time?',
      summary: 'Compares the main reported outcomes across simulated rounds.',
      metricIds: ['sim-centralization'],
      sourceArtifactIds: ['sim-dataset', 'sim-figure'],
      claimIds: ['sim-main-result'],
      isFigureReplay: true,
    },
  ],
  dashboardMetrics: [
    {
      id: 'sim-centralization',
      label: 'Centralization',
      sourceArtifactIds: ['sim-dataset'],
    },
  ],
  rationale: [
    'The fixture keeps a simulation lab because the runtime adapter is exact.',
    'Results stay figure-forward rather than adding a redundant generic dashboard tab.',
  ],
})

const EVENT_STUDY_FIXTURE = buildStudyFrame({
  id: 'fixture-event-study',
  title: 'Event Study Archetype',
  classification: 'empirical-event-study',
  runtimeAdapter: 'static',
  capabilities: ['static-reading', 'dataset-dashboard', 'agent-grounded-qa'],
  includedSurfaces: ['paper', 'deep-dive', 'dashboard', 'agent'],
  omissionOverrides: {
    results: 'duplicate-of-stronger-surface',
  },
  artifacts: [
    { id: 'event-paper', label: 'Event-study paper', kind: 'paper-pdf', url: 'https://example.com/event-paper.pdf' },
    { id: 'event-data', label: 'Event data', kind: 'dataset', path: 'fixtures/event.csv' },
    { id: 'event-table', label: 'Event table', kind: 'table', path: 'fixtures/event-table.csv' },
  ],
  claims: [
    {
      id: 'event-regime-shift',
      text: 'The intervention date is associated with a measurable shift in bidding behavior.',
      sourceIds: ['event-paper', 'event-data'],
      anchors: [
        { kind: 'section', label: '§2' },
        { kind: 'dataset', label: 'Panel dataset', artifactId: 'event-data' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.9,
    },
    {
      id: 'event-interpretation',
      text: 'The surplus shift likely reflects a change in auction competition rather than demand alone.',
      sourceIds: ['event-paper', 'event-table'],
      anchors: [{ kind: 'table', label: 'Table 3', artifactId: 'event-table' }],
      evidenceType: 'inference',
      presentationMode: 'interpretation',
      confidence: 0.78,
      truthBoundary: 'Interpret this as a paper-backed inference, not as directly observed decomposition.',
    },
  ],
  dashboards: [
    {
      id: 'event-window',
      title: 'Event Window',
      pattern: 'event-timeline',
      questionAnswered: 'What changes around the intervention window?',
      summary: 'Tracks regime change with annotated timeseries around the event date.',
      metricIds: ['event-bid-rate', 'event-surplus'],
      sourceArtifactIds: ['event-data'],
      claimIds: ['event-regime-shift', 'event-interpretation'],
      isFigureReplay: false,
    },
    {
      id: 'event-pre-post',
      title: 'Pre/Post Comparison',
      pattern: 'pre-post-comparison',
      questionAnswered: 'How do the headline outcomes differ before and after the event?',
      summary: 'Condenses the main outcomes into a pre/post comparison.',
      metricIds: ['event-bid-rate'],
      sourceArtifactIds: ['event-data', 'event-table'],
      claimIds: ['event-regime-shift'],
      isFigureReplay: false,
    },
  ],
  dashboardMetrics: [
    {
      id: 'event-bid-rate',
      label: 'Observed bids',
      sourceArtifactIds: ['event-data'],
    },
    {
      id: 'event-surplus',
      label: 'Estimated surplus',
      sourceArtifactIds: ['event-data', 'event-table'],
    },
  ],
  rationale: [
    'The fixture uses a dashboard rather than a simulation lab because the study is observational.',
    'Interpretive claims are allowed only with explicit truth-boundary labels.',
  ],
})

const THEORY_FIXTURE = buildStudyFrame({
  id: 'fixture-theory',
  title: 'Theory Archetype',
  classification: 'theory-mechanism',
  runtimeAdapter: 'none',
  capabilities: ['static-reading', 'agent-grounded-qa'],
  includedSurfaces: ['paper', 'deep-dive', 'agent'],
  artifacts: [
    { id: 'theory-paper', label: 'Theory paper', kind: 'paper-pdf', url: 'https://example.com/theory-paper.pdf' },
    { id: 'theory-figure', label: 'Mechanism figure', kind: 'figure', path: 'fixtures/theory-figure.png' },
    { id: 'theory-appendix', label: 'Proof appendix', kind: 'appendix', url: 'https://example.com/theory-appendix' },
  ],
  claims: [
    {
      id: 'theory-core',
      text: 'The mechanism aligns incentives only under a bounded information structure.',
      sourceIds: ['theory-paper', 'theory-appendix'],
      anchors: [
        { kind: 'section', label: '§1' },
        { kind: 'appendix', label: 'Appendix A', artifactId: 'theory-appendix' },
      ],
      evidenceType: 'close-paraphrase',
      presentationMode: 'fact',
      confidence: 0.88,
    },
    {
      id: 'theory-limit',
      text: 'The equilibrium intuition should not be restated as an empirical finding.',
      sourceIds: ['theory-paper'],
      anchors: [{ kind: 'section', label: '§3' }],
      evidenceType: 'inference',
      presentationMode: 'interpretation',
      confidence: 0.82,
      truthBoundary: 'This is a mechanism-design implication, not observed behavior.',
    },
  ],
  dashboards: [
    {
      id: 'theory-evidence',
      title: 'Evidence Board',
      pattern: 'evidence-board',
      questionAnswered: 'Which assumptions support the main mechanism result?',
      summary: 'Pins the theorem statement, intuition, and proof boundary to their sources.',
      metricIds: ['assumption-count'],
      sourceArtifactIds: ['theory-figure', 'theory-appendix'],
      claimIds: ['theory-core', 'theory-limit'],
      isFigureReplay: false,
    },
  ],
  dashboardMetrics: [
    {
      id: 'assumption-count',
      label: 'Assumption count',
      sourceArtifactIds: ['theory-appendix'],
    },
  ],
  rationale: [
    'Theory papers should avoid fake dashboards and fake runtime controls.',
    'The evidence board is the only visual layer because it matches the source structure.',
  ],
})

export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  {
    id: 'simulation',
    name: 'Simulation archetype',
    study: SIMULATION_FIXTURE,
    expectation: {
      includedSurfaces: ['paper', 'deep-dive', 'results', 'simulation-lab', 'agent'],
      runtimeAdapter: 'exact',
      dashboardPatterns: ['timeseries-panel'],
    },
  },
  {
    id: 'event-study',
    name: 'Empirical event-study archetype',
    study: EVENT_STUDY_FIXTURE,
    expectation: {
      includedSurfaces: ['paper', 'deep-dive', 'dashboard', 'agent'],
      runtimeAdapter: 'static',
      dashboardPatterns: ['event-timeline', 'pre-post-comparison'],
    },
  },
  {
    id: 'theory',
    name: 'Theory mechanism archetype',
    study: THEORY_FIXTURE,
    expectation: {
      includedSurfaces: ['paper', 'deep-dive', 'agent'],
      runtimeAdapter: 'none',
      dashboardPatterns: ['evidence-board'],
    },
  },
]
