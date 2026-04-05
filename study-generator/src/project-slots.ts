import path from 'node:path'
import type {
  StudyPackageFrame,
  StudySpinupTemplate,
} from '../../packages/study-schema/src/index.ts'

export type StudyProjectArea =
  | 'generator'
  | 'explorer'
  | 'server'
  | 'runtime'

export type StudyProjectSlotStatus = 'ready' | 'partial' | 'pending'
export type StudyProjectSlotCriterionSeverity = 'required' | 'recommended'

export interface StudyProjectSlotCriterion {
  readonly code: string
  readonly label: string
  readonly severity: StudyProjectSlotCriterionSeverity
  readonly satisfied: boolean
  readonly detail: string
}

export interface StudyProjectSlot {
  readonly id: string
  readonly area: StudyProjectArea
  readonly status: StudyProjectSlotStatus
  readonly title: string
  readonly purpose: string
  readonly why: string
  readonly targetPaths: readonly string[]
  readonly dependsOn: readonly string[]
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly entryCriteria: readonly StudyProjectSlotCriterion[]
  readonly blockers: readonly string[]
}

export interface StudyProjectSlotMap {
  readonly studyId: string
  readonly classification: StudyPackageFrame['classification']
  readonly runtimeAdapter: StudyPackageFrame['runtime']['adapter']
  readonly summary: readonly string[]
  readonly slots: readonly StudyProjectSlot[]
}

function buildBlockers(criteria: readonly StudyProjectSlotCriterion[]): readonly string[] {
  return criteria
    .filter(criterion => criterion.severity === 'required' && !criterion.satisfied)
    .map(criterion => criterion.detail)
}

function resolveStatus(criteria: readonly StudyProjectSlotCriterion[]): StudyProjectSlotStatus {
  const required = criteria.filter(criterion => criterion.severity === 'required')
  const requiredSatisfied = required.filter(criterion => criterion.satisfied).length
  const anySatisfied = criteria.some(criterion => criterion.satisfied)

  if (required.length === 0 || required.every(criterion => criterion.satisfied)) {
    return criteria.every(criterion => criterion.satisfied || criterion.severity === 'recommended')
      ? 'ready'
      : 'partial'
  }

  if (requiredSatisfied > 0 || anySatisfied) {
    return 'partial'
  }

  return 'pending'
}

function createSlot(input: Omit<StudyProjectSlot, 'status' | 'blockers'>): StudyProjectSlot {
  return {
    ...input,
    status: resolveStatus(input.entryCriteria),
    blockers: buildBlockers(input.entryCriteria),
  }
}

function countLocalArtifactPaths(study: StudyPackageFrame): number {
  return study.artifacts.filter(artifact => Boolean(artifact.path)).length
}

function countRuntimeSourceRefs(study: StudyPackageFrame): number {
  return study.runtime.sourceBlockRefs.length
}

function listRuntimeTargetPaths(study: StudyPackageFrame): readonly string[] {
  const paths = study.artifacts
    .map(artifact => artifact.path)
    .filter((value): value is string => Boolean(value))

  if (study.runtime.publishedResults?.catalogPath) {
    paths.push(study.runtime.publishedResults.catalogPath)
  }
  if (study.runtime.publishedResults?.baseDir) {
    paths.push(study.runtime.publishedResults.baseDir)
  }

  return [...new Set(paths)]
}

export function buildStudyProjectSlotMap(
  study: StudyPackageFrame,
  input: {
    readonly bundleOutDir: string
    readonly template?: StudySpinupTemplate
  },
): StudyProjectSlotMap {
  const hasDashboards = study.dashboards.length > 0
  const hasClaims = study.claims.claims.length > 0
  const hasArtifacts = study.artifacts.length > 0
  const hasPrompts = study.assistant.suggestedPrompts.length > 0
  const hasEditorialSeed = Boolean(
    study.metadata.abstract
    || study.metadata.keyClaims.length
    || hasClaims
    || hasDashboards,
  )
  const runnableRuntime = study.runtime.adapter === 'exact' || study.runtime.adapter === 'hybrid'
  const replayRuntime = study.runtime.adapter === 'static' || study.runtime.adapter === 'hybrid'
  const runtimeTargetPaths = listRuntimeTargetPaths(study)
  const explorerStudyDir = `explorer/src/studies/${study.id}`

  const slots = [
    createSlot({
      id: 'generator-bundle',
      area: 'generator',
      title: 'Generated Study Bundle',
      purpose: 'Produce the canonical study-package, assembly-plan, validation-report, and editorial scaffolding bundle.',
      why: 'This is the source-of-truth artifact the spin-up module reasons over before anything is wired into the website.',
      targetPaths: [
        path.join(input.bundleOutDir, 'study-package.json'),
        path.join(input.bundleOutDir, 'assembly-plan.json'),
        path.join(input.bundleOutDir, 'template.json'),
      ],
      dependsOn: [],
      inputs: ['intake packet', 'template selection', 'study-schema contract'],
      outputs: ['study-package frame', 'assembly plan', 'validation report', 'editorial scorecard'],
      entryCriteria: [
        {
          code: 'bundle-metadata',
          label: 'Metadata exists',
          severity: 'required',
          satisfied: Boolean(study.metadata.title && study.metadata.citation),
          detail: 'The bundle needs title and citation metadata before it can anchor downstream modules.',
        },
        {
          code: 'bundle-artifacts',
          label: 'Artifacts exist',
          severity: 'required',
          satisfied: hasArtifacts,
          detail: 'Add at least one artifact before generating a site bundle.',
        },
        {
          code: 'bundle-claims',
          label: 'Claims exist',
          severity: 'required',
          satisfied: hasClaims,
          detail: 'Add at least one grounded claim before generating a site bundle.',
        },
      ],
    }),
    createSlot({
      id: 'explorer-adapter',
      area: 'explorer',
      title: 'Explorer Adapter Scaffold',
      purpose: 'Generate starter sections, narratives, topic cards, chart manifests, and a study-package stub for the current explorer contract.',
      why: 'The explorer still needs editorial wrappers around the shared frame; the adapter turns the study package into those repo-specific pieces.',
      targetPaths: [
        path.join(input.bundleOutDir, 'explorer-adapter', 'study-package.stub.ts'),
        path.join(input.bundleOutDir, 'explorer-adapter', 'sections.stub.ts'),
        path.join(input.bundleOutDir, 'explorer-adapter', 'narratives.stub.ts'),
        path.join(input.bundleOutDir, 'explorer-adapter', 'topic-cards.stub.ts'),
        path.join(input.bundleOutDir, 'explorer-adapter', 'paper-charts.stub.ts'),
      ],
      dependsOn: ['generator-bundle'],
      inputs: ['study-package frame', 'claims', 'dashboards', 'assistant prompts'],
      outputs: ['explorer study stub', 'editorial scaffolds', 'chart manifests'],
      entryCriteria: [
        {
          code: 'adapter-editorial-seed',
          label: 'Editorial seed exists',
          severity: 'required',
          satisfied: hasEditorialSeed,
          detail: 'The explorer adapter needs abstract, claims, or dashboards to synthesize sections and narratives.',
        },
        {
          code: 'adapter-claims',
          label: 'Claims exist',
          severity: 'required',
          satisfied: hasClaims,
          detail: 'The explorer adapter needs claims to produce grounded editorial copy.',
        },
        {
          code: 'adapter-dashboards-or-questions',
          label: 'Dashboards or question prompts exist',
          severity: 'recommended',
          satisfied: hasDashboards || hasPrompts,
          detail: 'Dashboards or prompts help the adapter generate better topic cards and results stubs.',
        },
      ],
    }),
    createSlot({
      id: 'explorer-live-module',
      area: 'explorer',
      title: 'Live Explorer Study Module',
      purpose: 'Host the actual study package consumed by the Paper, Deep Dive, Results, and Agent pages.',
      why: 'The website reads one active StudyPackage from the explorer registry, so each new paper eventually has to land here.',
      targetPaths: [
        `${explorerStudyDir}/study-package.ts`,
        `${explorerStudyDir}/sections.ts`,
        `${explorerStudyDir}/narratives.ts`,
        `${explorerStudyDir}/topic-cards.ts`,
        `${explorerStudyDir}/paper-charts.ts`,
      ],
      dependsOn: ['explorer-adapter'],
      inputs: ['explorer adapter scaffold', 'study artifacts', 'editorial review'],
      outputs: ['runtime-ready StudyPackage module'],
      entryCriteria: [
        {
          code: 'live-module-frame',
          label: 'Shared study frame is ready',
          severity: 'required',
          satisfied: hasArtifacts && hasClaims,
          detail: 'The live explorer module needs a valid shared frame with artifacts and claims.',
        },
        {
          code: 'live-module-runtime',
          label: 'Runtime configuration exists',
          severity: 'required',
          satisfied: Boolean(study.runtime.adapter),
          detail: 'Declare the runtime adapter before landing a live explorer module.',
        },
        {
          code: 'live-module-assistant',
          label: 'Assistant guidance exists',
          severity: 'recommended',
          satisfied: hasPrompts || countRuntimeSourceRefs(study) > 0,
          detail: 'Suggested prompts or source refs make the live agent surface legible on first load.',
        },
      ],
    }),
    createSlot({
      id: 'explorer-registry',
      area: 'explorer',
      title: 'Study Registry And Selection',
      purpose: 'Register the study package and make it selectable through environment configuration.',
      why: 'The site is now multi-study, so adding a new package should mean registration and selection, not route rewrites.',
      targetPaths: [
        'explorer/src/studies/index.ts',
        'explorer/.env.example',
      ],
      dependsOn: ['explorer-live-module'],
      inputs: ['study id', 'live explorer study module'],
      outputs: ['selectable active study'],
      entryCriteria: [
        {
          code: 'registry-study-id',
          label: 'Study id exists',
          severity: 'required',
          satisfied: Boolean(study.id),
          detail: 'A stable study id is required before the registry can select it.',
        },
        {
          code: 'registry-default-surface',
          label: 'Best first stop is declared',
          severity: 'recommended',
          satisfied: study.navigation.bestFirstStopIds.length > 0,
          detail: 'A best-first stop helps the registry expose a sensible default landing route.',
        },
      ],
    }),
    createSlot({
      id: 'server-context',
      area: 'server',
      title: 'Server Copilot Context',
      purpose: 'Derive ask/agent system context from the active study package without per-paper server rewrites.',
      why: 'The server now reads prompt context from the study package, so the generator should verify that the package exposes enough grounding.',
      targetPaths: [
        'explorer/server/study-context.ts',
        'explorer/server/index.ts',
        'explorer/server/agent-loop-orchestrator.ts',
      ],
      dependsOn: ['explorer-live-module'],
      inputs: ['assistant config', 'featured claims', 'source refs', 'runtime summary'],
      outputs: ['study-specific ask and experiment context'],
      entryCriteria: [
        {
          code: 'server-claims-or-sources',
          label: 'Claims or source refs exist',
          severity: 'required',
          satisfied: study.claims.featuredClaimIds.length > 0 || countRuntimeSourceRefs(study) > 0,
          detail: 'The server context needs featured claims or source refs to stay grounded.',
        },
        {
          code: 'server-prompts',
          label: 'Assistant prompts or tips exist',
          severity: 'recommended',
          satisfied: hasPrompts || Boolean(study.assistant.promptTips?.length),
          detail: 'Prompts or tips make the server-side assistant feel intentional instead of generic.',
        },
      ],
    }),
    createSlot({
      id: 'runtime-assets',
      area: 'runtime',
      title: 'Runtime And Asset Wiring',
      purpose: 'Point the generated study at checked-in datasets, replay assets, code references, and published result catalogs.',
      why: 'The website can only be honest if the runtime and published artifacts it points to actually exist and match the declared adapter.',
      targetPaths: runtimeTargetPaths.length > 0 ? runtimeTargetPaths : ['No local runtime paths declared'],
      dependsOn: ['generator-bundle'],
      inputs: ['artifact paths', 'published results config', 'simulation presets'],
      outputs: ['dataset wiring', 'published replay catalog', 'runtime presets'],
      entryCriteria: [
        {
          code: 'runtime-asset-paths',
          label: 'Local asset or result paths exist',
          severity: runnableRuntime || replayRuntime ? 'required' : 'recommended',
          satisfied: runtimeTargetPaths.length > 0 || study.runtime.adapter === 'none',
          detail: 'Executable or replay-oriented studies need local dataset, asset, or result paths.',
        },
        {
          code: 'runtime-presets',
          label: 'Simulation presets exist when runtime is executable',
          severity: runnableRuntime ? 'required' : 'recommended',
          satisfied: !runnableRuntime || Object.keys(study.runtime.simulationPresets).length > 0,
          detail: 'Exact or hybrid runtimes need at least one preset before exposing executable affordances.',
        },
        {
          code: 'runtime-published-results',
          label: 'Published results exist when replay output is expected',
          severity: replayRuntime ? 'recommended' : 'recommended',
          satisfied: !replayRuntime || Boolean(study.runtime.publishedResults?.catalogPath),
          detail: 'Static or hybrid studies benefit from a published results catalog for replayable surfaces.',
        },
      ],
    }),
  ] as const

  const enabledSurfaceCount = study.surfaces.filter(surface => surface.enabled).length
  const localAssetCount = countLocalArtifactPaths(study)

  return {
    studyId: study.id,
    classification: study.classification,
    runtimeAdapter: study.runtime.adapter,
    summary: [
      `The generator bundle is grounded by ${study.artifacts.length} artifacts and ${study.claims.claims.length} claims.`,
      `The explorer can inherit ${enabledSurfaceCount} enabled surfaces from the shared study frame without changing page code.`,
      `Runtime wiring references ${localAssetCount} local artifact path(s) and ${countRuntimeSourceRefs(study)} source ref(s).`,
      input.template
        ? `The current scaffold was shaped by the ${input.template.id} template.`
        : 'The current scaffold can be integrated without changing the active website runtime.',
    ],
    slots,
  }
}
