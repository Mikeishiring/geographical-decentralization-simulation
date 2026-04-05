import type { OmissionReason } from './quality'
import type {
  StudyPackageFrame,
  StudyRuntimeAdapterKind,
  StudySurfaceSpec,
} from './schema'
import { getDashboardPatternDescriptor } from './dashboards'
import { getSurfaceDescriptor } from './surfaces'

export type StudyAssemblyLayer =
  | 'inputs'
  | 'evidence'
  | 'orchestration'
  | 'experience'

export type StudyAssemblyModuleKind =
  | 'artifacts'
  | 'claims'
  | 'dashboard'
  | 'runtime'
  | 'assistant'
  | 'surface'

export type StudyAssemblyModuleStatus = 'supporting' | 'enabled' | 'disabled'
export type StudyAssemblyCriterionSeverity = 'required' | 'recommended'
export type StudyAssemblyBlockerLevel = 'blocking' | 'warning'

export interface StudyAssemblyEntryCriterion {
  readonly code: string
  readonly label: string
  readonly severity: StudyAssemblyCriterionSeverity
  readonly satisfied: boolean
  readonly detail: string
}

export interface StudyAssemblyBlocker {
  readonly code: string
  readonly level: StudyAssemblyBlockerLevel
  readonly message: string
}

export interface StudyAssemblyModule {
  readonly id: string
  readonly layer: StudyAssemblyLayer
  readonly kind: StudyAssemblyModuleKind
  readonly status: StudyAssemblyModuleStatus
  readonly title: string
  readonly purpose: string
  readonly whyIncluded: string
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly dependsOn: readonly string[]
  readonly entryCriteria: readonly StudyAssemblyEntryCriterion[]
  readonly blockers: readonly StudyAssemblyBlocker[]
}

export interface StudyProvenanceCoverageDimension {
  readonly id: string
  readonly label: string
  readonly covered: number
  readonly total: number
  readonly coverage: number
  readonly detail: string
}

export interface StudyProvenanceCoverage {
  readonly overallCoverage: number
  readonly dimensions: readonly StudyProvenanceCoverageDimension[]
}

export interface StudyAssemblyPlan {
  readonly studyId: string
  readonly classification: StudyPackageFrame['classification']
  readonly runtimeAdapter: StudyRuntimeAdapterKind
  readonly summary: readonly string[]
  readonly provenanceCoverage: StudyProvenanceCoverage
  readonly modules: readonly StudyAssemblyModule[]
}

function roundCoverage(value: number): number {
  return Math.round(value * 1000) / 1000
}

function computeCoverage(covered: number, total: number): number {
  if (total === 0) return 1
  return roundCoverage(covered / total)
}

function buildCriteriaBlockers(
  criteria: readonly StudyAssemblyEntryCriterion[],
): readonly StudyAssemblyBlocker[] {
  return criteria
    .filter(criterion => !criterion.satisfied)
    .map<StudyAssemblyBlocker>(criterion => ({
      code: criterion.code,
      level: criterion.severity === 'required' ? 'blocking' : 'warning',
      message: criterion.detail,
    }))
}

function explainOmissionReason(reason: OmissionReason | undefined): string {
  switch (reason) {
    case 'not-supported-by-sources':
      return 'Omitted because the available paper and dataset artifacts do not support this surface honestly.'
    case 'no-usable-artifact':
      return 'Omitted because the package does not contain the required artifact to make the surface useful.'
    case 'duplicate-of-stronger-surface':
      return 'Omitted because another enabled surface already delivers the same value more clearly.'
    case 'implies-false-interactivity':
      return 'Omitted because enabling it would imply runtime capabilities the study does not actually provide.'
    case 'weak-component-fit':
      return 'Omitted because it is not a strong fit for the study classification or evidence shape.'
    case 'visual-noise':
      return 'Omitted because it would add interface weight without adding enough evidence value.'
    default:
      return 'Omitted because the current package shape does not justify it yet.'
  }
}

function explainRuntimeAdapter(adapter: StudyRuntimeAdapterKind): string {
  switch (adapter) {
    case 'none':
      return 'No runnable runtime is attached, so the site should stay evidence-first and static.'
    case 'static':
      return 'The runtime is static-only, so published artifacts can be shown without implying fresh execution.'
    case 'exact':
      return 'The runtime can execute bounded study configurations exactly, so interactive experiments are justified.'
    case 'hybrid':
      return 'The runtime combines exact execution with published artifacts, so the site can mix replay and bounded runs.'
  }
}

function hasAllIds(requiredIds: readonly string[], availableIds: ReadonlySet<string>): boolean {
  return requiredIds.every(id => availableIds.has(id))
}

function buildArtifactsCriteria(study: StudyPackageFrame): readonly StudyAssemblyEntryCriterion[] {
  const hasPrimaryDocument = study.artifacts.some(artifact =>
    artifact.kind === 'paper-pdf' || artifact.kind === 'paper-html',
  )

  return [
    {
      code: 'artifacts-present',
      label: 'At least one artifact exists',
      severity: 'required',
      satisfied: study.artifacts.length > 0,
      detail: study.artifacts.length > 0
        ? `The package includes ${study.artifacts.length} artifact references.`
        : 'Add at least one paper, dataset, figure, or appendix artifact before shaping the site.',
    },
    {
      code: 'primary-document',
      label: 'Primary paper document exists',
      severity: 'required',
      satisfied: hasPrimaryDocument,
      detail: hasPrimaryDocument
        ? 'A primary paper document is attached.'
        : 'Attach a paper PDF or HTML source so every later module has a canonical document anchor.',
    },
    {
      code: 'artifact-references',
      label: 'Artifacts include paths, URLs, or summaries',
      severity: 'recommended',
      satisfied: study.artifacts.every(artifact => Boolean(artifact.url || artifact.path || artifact.summary)),
      detail: 'Each artifact should expose a path, URL, or summary so downstream modules can explain what it is.',
    },
  ]
}

function buildClaimsCriteria(study: StudyPackageFrame): readonly StudyAssemblyEntryCriterion[] {
  const allClaimsHaveSources = study.claims.claims.every(claim => claim.sourceIds.length > 0)
  const allClaimsHaveAnchors = study.claims.claims.every(claim => claim.anchors.length > 0)

  return [
    {
      code: 'claims-present',
      label: 'At least one claim exists',
      severity: 'required',
      satisfied: study.claims.claims.length > 0,
      detail: study.claims.claims.length > 0
        ? `The package declares ${study.claims.claims.length} reusable claims.`
        : 'Add grounded claims before enabling interpretive or evidence-heavy surfaces.',
    },
    {
      code: 'claims-have-sources',
      label: 'Claims cite source artifacts',
      severity: 'required',
      satisfied: allClaimsHaveSources,
      detail: allClaimsHaveSources
        ? 'Every claim points back to at least one source artifact.'
        : 'Each claim should cite at least one artifact id in sourceIds.',
    },
    {
      code: 'claims-have-anchors',
      label: 'Claims include anchors',
      severity: 'required',
      satisfied: allClaimsHaveAnchors,
      detail: allClaimsHaveAnchors
        ? 'Every claim includes at least one anchor.'
        : 'Each claim should include section, figure, table, dataset, or appendix anchors.',
    },
    {
      code: 'featured-claims-valid',
      label: 'Featured claim ids resolve',
      severity: 'recommended',
      satisfied: study.claims.featuredClaimIds.every(id => study.claims.claims.some(claim => claim.id === id)),
      detail: 'Featured claim ids should resolve to real claims so the assistant and overview layers can trust them.',
    },
  ]
}

function buildDashboardCriteria(
  study: StudyPackageFrame,
  dashboard: StudyPackageFrame['dashboards'][number],
): readonly StudyAssemblyEntryCriterion[] {
  const artifactIds = new Set(study.artifacts.map(artifact => artifact.id))
  const claimIds = new Set(study.claims.claims.map(claim => claim.id))
  const metricIds = new Set(study.dashboardMetrics.map(metric => metric.id))

  return [
    {
      code: `dashboard:${dashboard.id}:artifacts`,
      label: 'Dashboard links source artifacts',
      severity: 'required',
      satisfied: dashboard.sourceArtifactIds.length > 0 && hasAllIds(dashboard.sourceArtifactIds, artifactIds),
      detail: dashboard.sourceArtifactIds.length > 0
        ? 'All declared source artifacts resolve.'
        : 'Each dashboard should name the artifacts that ground it.',
    },
    {
      code: `dashboard:${dashboard.id}:claims`,
      label: 'Dashboard links claims',
      severity: 'required',
      satisfied: dashboard.claimIds.length > 0 && hasAllIds(dashboard.claimIds, claimIds),
      detail: dashboard.claimIds.length > 0
        ? 'All declared dashboard claims resolve.'
        : 'Each dashboard should point to at least one claim so the generator knows which question it answers.',
    },
    {
      code: `dashboard:${dashboard.id}:metrics`,
      label: 'Dashboard links metrics',
      severity: 'required',
      satisfied: dashboard.metricIds.length > 0 && hasAllIds(dashboard.metricIds, metricIds),
      detail: dashboard.metricIds.length > 0
        ? 'All declared dashboard metrics resolve.'
        : 'Each dashboard should reference at least one dashboard metric id.',
    },
  ]
}

function buildRuntimeCriteria(study: StudyPackageFrame): readonly StudyAssemblyEntryCriterion[] {
  const runtime = study.runtime
  const needsRunnableRuntime = runtime.adapter === 'exact' || runtime.adapter === 'hybrid'
  const needsPublishedResults = runtime.adapter === 'static' || runtime.adapter === 'hybrid'

  return [
    {
      code: 'runtime-adapter',
      label: 'Runtime adapter is declared',
      severity: 'required',
      satisfied: Boolean(runtime.adapter),
      detail: 'Every study package should declare whether runtime support is none, static, exact, or hybrid.',
    },
    {
      code: 'runtime-sources',
      label: 'Runtime source references exist',
      severity: needsRunnableRuntime || needsPublishedResults ? 'required' : 'recommended',
      satisfied: runtime.sourceBlockRefs.length > 0 || runtime.adapter === 'none',
      detail: runtime.sourceBlockRefs.length > 0 || runtime.adapter === 'none'
        ? 'Runtime source references are present.'
        : 'Static, exact, and hybrid runtimes should point to the paper, repo, or published results they rely on.',
    },
    {
      code: 'runtime-presets',
      label: 'Runnable presets exist when runtime is executable',
      severity: needsRunnableRuntime ? 'required' : 'recommended',
      satisfied: !needsRunnableRuntime || Object.keys(runtime.simulationPresets).length > 0,
      detail: needsRunnableRuntime
        ? 'Exact or hybrid runtimes should expose at least one simulation preset.'
        : 'Static or disabled runtimes do not require simulation presets.',
    },
    {
      code: 'runtime-prewarm',
      label: 'Canonical prewarm configs exist for executable runtimes',
      severity: needsRunnableRuntime ? 'recommended' : 'recommended',
      satisfied: !needsRunnableRuntime || runtime.canonicalPrewarmConfigs.length > 0,
      detail: needsRunnableRuntime
        ? 'Exact or hybrid runtimes benefit from canonical prewarm configs for warm startup and smoke tests.'
        : 'Disabled or static runtimes do not need prewarm configs.',
    },
    {
      code: 'runtime-published-results',
      label: 'Published results are declared for replay-style runtimes',
      severity: needsPublishedResults ? 'recommended' : 'recommended',
      satisfied: !needsPublishedResults || Boolean(runtime.publishedResults?.catalogPath),
      detail: needsPublishedResults
        ? 'Static or hybrid runtimes should expose a published results catalog when the site replays frozen outputs.'
        : 'Executable-only runtimes do not need a published results catalog.',
    },
  ]
}

function buildAssistantCriteria(study: StudyPackageFrame): readonly StudyAssemblyEntryCriterion[] {
  const agentEnabled = study.surfaces.some(surface => surface.id === 'agent' && surface.enabled)

  return [
    {
      code: 'assistant-prompts',
      label: 'Assistant prompts exist',
      severity: agentEnabled ? 'required' : 'recommended',
      satisfied: study.assistant.suggestedPrompts.length > 0,
      detail: study.assistant.suggestedPrompts.length > 0
        ? 'The assistant has starter prompts.'
        : 'Add suggested prompts so the spin-up module can see how readers should enter the study.',
    },
    {
      code: 'assistant-claim-coverage',
      label: 'Assistant can point to featured claims or sources',
      severity: agentEnabled ? 'required' : 'recommended',
      satisfied: study.claims.featuredClaimIds.length > 0 || study.runtime.sourceBlockRefs.length > 0,
      detail: 'The assistant should be anchored by featured claims or source refs before the agent surface goes live.',
    },
    {
      code: 'assistant-workflows-or-views',
      label: 'Assistant declares workflows, query views, or prompt tips',
      severity: 'recommended',
      satisfied: Boolean(
        study.assistant.workflows?.length
        || study.assistant.queryViews?.length
        || study.assistant.promptTips?.length,
      ),
      detail: 'Workflows, query views, or prompt tips make the assistant self-describing instead of chat-only.',
    },
  ]
}

function buildSurfaceCriteria(
  study: StudyPackageFrame,
  surface: StudySurfaceSpec,
): readonly StudyAssemblyEntryCriterion[] {
  const descriptor = getSurfaceDescriptor(surface.id)
  const artifactIds = new Set(study.artifacts.map(artifact => artifact.id))
  const claimIds = new Set(study.claims.claims.map(claim => claim.id))
  const hasRunnableRuntime = study.runtime.adapter === 'exact' || study.runtime.adapter === 'hybrid'

  if (!surface.enabled) {
    return [
      {
        code: `surface:${surface.id}:omission`,
        label: 'Disabled surfaces record an omission reason',
        severity: 'recommended',
        satisfied: Boolean(surface.omissionReason),
        detail: surface.omissionReason
          ? explainOmissionReason(surface.omissionReason)
          : 'Disabled surfaces should still explain why they are omitted.',
      },
    ]
  }

  return [
    {
      code: `surface:${surface.id}:artifacts`,
      label: 'Enabled surface names its required artifacts',
      severity: 'required',
      satisfied: surface.requiredArtifactIds.length > 0 && hasAllIds(surface.requiredArtifactIds, artifactIds),
      detail: surface.requiredArtifactIds.length > 0
        ? 'All required artifact ids resolve for this surface.'
        : 'Enabled surfaces should list the artifacts that make them honest and useful.',
    },
    {
      code: `surface:${surface.id}:claims`,
      label: 'Enabled surface names its required claims',
      severity: 'required',
      satisfied: surface.requiredClaimIds.length > 0 && hasAllIds(surface.requiredClaimIds, claimIds),
      detail: surface.requiredClaimIds.length > 0
        ? 'All required claim ids resolve for this surface.'
        : 'Enabled surfaces should list the claims they are expected to carry.',
    },
    {
      code: `surface:${surface.id}:runtime`,
      label: 'Runtime-backed surfaces only appear when runtime exists',
      severity: descriptor.requiresRuntime ? 'required' : 'recommended',
      satisfied: !descriptor.requiresRuntime || hasRunnableRuntime,
      detail: descriptor.requiresRuntime
        ? 'Runtime-backed surfaces require an exact or hybrid runtime adapter.'
        : 'This surface does not require runtime support.',
    },
  ]
}

function buildProvenanceCoverage(study: StudyPackageFrame): StudyProvenanceCoverage {
  const enabledSurfaces = study.surfaces.filter(surface => surface.enabled)
  const dimensions: readonly StudyProvenanceCoverageDimension[] = [
    {
      id: 'claim-sources',
      label: 'Claims with source ids',
      covered: study.claims.claims.filter(claim => claim.sourceIds.length > 0).length,
      total: study.claims.claims.length,
      coverage: computeCoverage(
        study.claims.claims.filter(claim => claim.sourceIds.length > 0).length,
        study.claims.claims.length,
      ),
      detail: 'Measures whether claims point back to concrete artifacts.',
    },
    {
      id: 'claim-anchors',
      label: 'Claims with anchors',
      covered: study.claims.claims.filter(claim => claim.anchors.length > 0).length,
      total: study.claims.claims.length,
      coverage: computeCoverage(
        study.claims.claims.filter(claim => claim.anchors.length > 0).length,
        study.claims.claims.length,
      ),
      detail: 'Measures whether claims are localized to sections, figures, tables, or datasets.',
    },
    {
      id: 'dashboard-artifacts',
      label: 'Dashboards grounded in artifacts',
      covered: study.dashboards.filter(dashboard => dashboard.sourceArtifactIds.length > 0).length,
      total: study.dashboards.length,
      coverage: computeCoverage(
        study.dashboards.filter(dashboard => dashboard.sourceArtifactIds.length > 0).length,
        study.dashboards.length,
      ),
      detail: 'Measures whether dashboards point to real datasets, figures, or tables.',
    },
    {
      id: 'dashboard-claims',
      label: 'Dashboards grounded in claims',
      covered: study.dashboards.filter(dashboard => dashboard.claimIds.length > 0).length,
      total: study.dashboards.length,
      coverage: computeCoverage(
        study.dashboards.filter(dashboard => dashboard.claimIds.length > 0).length,
        study.dashboards.length,
      ),
      detail: 'Measures whether dashboards are attached to explicit research questions and claims.',
    },
    {
      id: 'surface-artifacts',
      label: 'Enabled surfaces with artifact requirements',
      covered: enabledSurfaces.filter(surface => surface.requiredArtifactIds.length > 0).length,
      total: enabledSurfaces.length,
      coverage: computeCoverage(
        enabledSurfaces.filter(surface => surface.requiredArtifactIds.length > 0).length,
        enabledSurfaces.length,
      ),
      detail: 'Measures whether enabled reader surfaces say which artifacts justify them.',
    },
    {
      id: 'surface-claims',
      label: 'Enabled surfaces with claim requirements',
      covered: enabledSurfaces.filter(surface => surface.requiredClaimIds.length > 0).length,
      total: enabledSurfaces.length,
      coverage: computeCoverage(
        enabledSurfaces.filter(surface => surface.requiredClaimIds.length > 0).length,
        enabledSurfaces.length,
      ),
      detail: 'Measures whether enabled reader surfaces say which claims they are responsible for.',
    },
  ]

  return {
    overallCoverage: roundCoverage(
      dimensions.reduce((sum, dimension) => sum + dimension.coverage, 0) / dimensions.length,
    ),
    dimensions,
  }
}

function buildSurfaceModule(study: StudyPackageFrame, surface: StudySurfaceSpec): StudyAssemblyModule {
  const descriptor = getSurfaceDescriptor(surface.id)
  const status: StudyAssemblyModuleStatus = surface.enabled ? 'enabled' : 'disabled'
  const entryCriteria = buildSurfaceCriteria(study, surface)
  const dependsOn = [
    'artifacts',
    'claims',
    ...(descriptor.requiresRuntime ? ['runtime'] : []),
    ...(surface.id === 'agent' ? ['assistant'] : []),
  ]

  return {
    id: `surface:${surface.id}`,
    layer: 'experience',
    kind: 'surface',
    status,
    title: descriptor.title,
    purpose: surface.purpose,
    whyIncluded: surface.enabled
      ? `Enabled because this study package uses the ${descriptor.title} surface to expose grounded evidence in the final website.`
      : explainOmissionReason(surface.omissionReason),
    inputs: [
      ...surface.requiredArtifactIds.map(id => `artifact:${id}`),
      ...surface.requiredClaimIds.map(id => `claim:${id}`),
    ],
    outputs: surface.componentIds,
    dependsOn,
    entryCriteria,
    blockers: buildCriteriaBlockers(entryCriteria),
  }
}

export function buildStudyAssemblyPlan(study: StudyPackageFrame): StudyAssemblyPlan {
  const enabledSurfaceIds = study.surfaces
    .filter(surface => surface.enabled)
    .map(surface => surface.id)
  const omittedSurfaceIds = study.surfaces
    .filter(surface => !surface.enabled)
    .map(surface => surface.id)

  const artifactsCriteria = buildArtifactsCriteria(study)
  const claimsCriteria = buildClaimsCriteria(study)
  const runtimeCriteria = buildRuntimeCriteria(study)
  const assistantCriteria = buildAssistantCriteria(study)

  const modules: StudyAssemblyModule[] = [
    {
      id: 'artifacts',
      layer: 'inputs',
      kind: 'artifacts',
      status: 'supporting',
      title: 'Artifacts',
      purpose: 'Collect the paper, figures, datasets, appendices, and code references that anchor the site.',
      whyIncluded: 'Artifacts are the raw evidence layer. Every other module should be able to point back to them.',
      inputs: study.metadata.references.map(reference => reference.label),
      outputs: study.artifacts.map(artifact => `artifact:${artifact.id}`),
      dependsOn: [],
      entryCriteria: artifactsCriteria,
      blockers: buildCriteriaBlockers(artifactsCriteria),
    },
    {
      id: 'claims',
      layer: 'evidence',
      kind: 'claims',
      status: 'supporting',
      title: 'Claims',
      purpose: 'Translate raw artifacts into reusable research claims with explicit grounding.',
      whyIncluded: 'Claims are the bridge between source material and website surfaces, so the generator can reason about what each surface is allowed to say.',
      inputs: study.artifacts.map(artifact => `artifact:${artifact.id}`),
      outputs: study.claims.claims.map(claim => `claim:${claim.id}`),
      dependsOn: ['artifacts'],
      entryCriteria: claimsCriteria,
      blockers: buildCriteriaBlockers(claimsCriteria),
    },
    ...study.dashboards.map<StudyAssemblyModule>(dashboard => {
      const descriptor = getDashboardPatternDescriptor(dashboard.pattern)
      const entryCriteria = buildDashboardCriteria(study, dashboard)
      return {
        id: `dashboard:${dashboard.id}`,
        layer: 'evidence',
        kind: 'dashboard',
        status: 'supporting',
        title: dashboard.title,
        purpose: dashboard.questionAnswered,
        whyIncluded: `Uses the ${descriptor.title} pattern so the generator knows which evidence shape should answer this question.`,
        inputs: [
          ...dashboard.sourceArtifactIds.map(id => `artifact:${id}`),
          ...dashboard.claimIds.map(id => `claim:${id}`),
        ],
        outputs: dashboard.metricIds.map(id => `metric:${id}`),
        dependsOn: ['artifacts', 'claims'],
        entryCriteria,
        blockers: buildCriteriaBlockers(entryCriteria),
      }
    }),
    {
      id: 'runtime',
      layer: 'orchestration',
      kind: 'runtime',
      status: study.runtime.adapter === 'none' ? 'disabled' : 'enabled',
      title: 'Runtime',
      purpose: 'Declare whether the site can stay static, replay published outputs, or run bounded exact experiments.',
      whyIncluded: explainRuntimeAdapter(study.runtime.adapter),
      inputs: study.runtime.sourceBlockRefs.map(ref => ref.label),
      outputs: [
        ...Object.keys(study.runtime.simulationPresets).map(id => `preset:${id}`),
        ...(study.runtime.publishedResults?.catalogPath
          ? [`published-results:${study.runtime.publishedResults.catalogPath}`]
          : []),
      ],
      dependsOn: ['artifacts'],
      entryCriteria: runtimeCriteria,
      blockers: buildCriteriaBlockers(runtimeCriteria),
    },
    {
      id: 'assistant',
      layer: 'orchestration',
      kind: 'assistant',
      status: study.assistant.suggestedPrompts.length > 0 ? 'enabled' : 'disabled',
      title: 'Assistant',
      purpose: study.assistant.askDescription
        ?? 'Guide grounded Q&A, structured results lookup, and bounded experiment planning.',
      whyIncluded: study.assistant.suggestedPrompts.length > 0
        ? 'Included so the spin-up module can see how questioning, workflow launch, and evidence retrieval are supposed to work.'
        : 'Disabled because the package does not yet declare prompt scaffolding or assistant workflows.',
      inputs: [
        ...study.claims.featuredClaimIds.map(id => `claim:${id}`),
        ...study.runtime.sourceBlockRefs.map(ref => ref.label),
      ],
      outputs: [
        ...study.assistant.suggestedPrompts.map(prompt => prompt.label),
        ...(study.assistant.workflows ?? []).map(workflow => workflow.id),
        ...(study.assistant.queryViews ?? []).map(view => view.id),
      ],
      dependsOn: ['claims', 'runtime'],
      entryCriteria: assistantCriteria,
      blockers: buildCriteriaBlockers(assistantCriteria),
    },
    ...study.surfaces.map(surface => buildSurfaceModule(study, surface)),
  ]

  return {
    studyId: study.id,
    classification: study.classification,
    runtimeAdapter: study.runtime.adapter,
    summary: [
      `${study.metadata.title} is classified as ${study.classification}.`,
      enabledSurfaceIds.length > 0
        ? `Enabled surfaces: ${enabledSurfaceIds.join(', ')}.`
        : 'No experience surfaces are enabled yet.',
      omittedSurfaceIds.length > 0
        ? `Omitted surfaces: ${omittedSurfaceIds.join(', ')}.`
        : 'No surfaces are currently omitted.',
      ...study.generationDecision.rationale,
    ],
    provenanceCoverage: buildProvenanceCoverage(study),
    modules,
  }
}
