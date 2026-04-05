import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDefaultSurfacePlan,
  buildStudyAssemblyPlan,
  getDashboardPatternDescriptor,
  getStudySpinupTemplate,
  getSurfaceDescriptor,
  listStudySpinupTemplates,
  type OmissionReason,
  type StudyArtifactKind,
  type StudyAssemblyLayer,
  type StudyAssemblyPlan,
  type StudyClaim,
  type StudyClassification,
  type StudyDashboardMetric,
  type StudyDashboardPattern,
  type StudyPackageFrame,
  type StudyRuntimeAdapterKind,
  type StudySpinupTemplate,
  type StudySurfaceId,
} from '../../packages/study-schema/src/index.ts'
import { buildExplorerAdapterFiles } from './explorer-adapter.ts'
import { buildStudyProjectSlotMap } from './project-slots.ts'

export interface ScaffoldOptions {
  readonly classification: StudyClassification
  readonly id: string
  readonly title: string
  readonly outDir: string
}

export interface ScaffoldResult {
  readonly outDir: string
  readonly files: readonly string[]
  readonly templateId: string
}

export interface GeneratedTextFile {
  readonly path: string
  readonly content: string
}

export const DEFAULT_SIMULATION_CONFIG = {
  paradigm: 'SSP',
  validators: 1000,
  slots: 1000,
  distribution: 'homogeneous',
  sourcePlacement: 'homogeneous',
  migrationCost: 0.002,
  attestationThreshold: 0.667,
  slotTime: 12,
  seed: 1,
} as const

const ARTIFACT_KIND_TITLES: Readonly<Record<StudyArtifactKind, string>> = {
  'paper-pdf': 'Primary paper PDF',
  'paper-html': 'Paper HTML export',
  figure: 'Key figure asset',
  table: 'Core table export',
  dataset: 'Primary dataset',
  code: 'Source repository',
  'runtime-output': 'Published runtime output',
  appendix: 'Appendix or supplementary note',
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'new-study'
}

export function deriveStudyId(value: string): string {
  return slugify(value)
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function parseOption(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function uniqueArtifactKinds(template: StudySpinupTemplate): readonly StudyArtifactKind[] {
  return [...new Set([...template.requiredArtifactKinds, ...template.optionalArtifactKinds])]
}

function buildArtifactRef(studyId: string, kind: StudyArtifactKind, index: number) {
  const id = `${kind.replace(/[^a-z]+/g, '-')}-${index + 1}`
  const label = ARTIFACT_KIND_TITLES[kind]
  const summary = `Placeholder ${label.toLowerCase()} for ${studyId}.`

  switch (kind) {
    case 'paper-pdf':
      return { id, label, kind, summary, url: `https://example.com/${studyId}/paper.pdf` } as const
    case 'paper-html':
      return { id, label, kind, summary, url: `https://example.com/${studyId}/paper` } as const
    case 'figure':
      return { id, label, kind, summary, path: 'assets/figure-1.png' } as const
    case 'table':
      return { id, label, kind, summary, path: 'data/table-1.csv' } as const
    case 'dataset':
      return { id, label, kind, summary, path: 'data/dataset-1.csv' } as const
    case 'code':
      return { id, label, kind, summary, url: `https://example.com/${studyId}/repo` } as const
    case 'runtime-output':
      return { id, label, kind, summary, path: 'results/published-output.json' } as const
    case 'appendix':
      return { id, label, kind, summary, url: `https://example.com/${studyId}/appendix` } as const
  }
}

function buildStarterClaims(
  studyId: string,
  template: StudySpinupTemplate,
  artifactIdsByKind: ReadonlyMap<StudyArtifactKind, readonly string[]>,
): readonly StudyClaim[] {
  const primaryArtifactId = artifactIdsByKind.get('paper-pdf')?.[0]
    ?? artifactIdsByKind.get('paper-html')?.[0]
    ?? artifactIdsByKind.get('dataset')?.[0]
    ?? 'paper-pdf-1'
  const evidenceArtifactId = artifactIdsByKind.get('dataset')?.[0]
    ?? artifactIdsByKind.get('figure')?.[0]
    ?? primaryArtifactId

  const mainClaim: StudyClaim = {
    id: `${studyId}-main-claim`,
    text: `Placeholder main claim for the ${template.classification} study. Replace this with the strongest paper-backed result.`,
    sourceIds: [primaryArtifactId, evidenceArtifactId].filter((value, index, array) => array.indexOf(value) === index),
    anchors: [
      { kind: 'section', label: '§1' },
      { kind: evidenceArtifactId === primaryArtifactId ? 'figure' : 'dataset', label: 'Primary evidence', artifactId: evidenceArtifactId },
    ],
    evidenceType: template.classification === 'theory-mechanism' ? 'close-paraphrase' : 'derived-from-dataset',
    presentationMode: 'fact',
    confidence: 0.75,
  }

  const boundaryArtifactId = artifactIdsByKind.get('appendix')?.[0] ?? primaryArtifactId
  const boundaryClaim: StudyClaim = {
    id: `${studyId}-truth-boundary`,
    text: 'Placeholder truth boundary. Replace this with the paper limitation or interpretation boundary that should govern the site.',
    sourceIds: [primaryArtifactId, boundaryArtifactId].filter((value, index, array) => array.indexOf(value) === index),
    anchors: [
      { kind: 'section', label: '§Limitations' },
      { kind: boundaryArtifactId === primaryArtifactId ? 'section' : 'appendix', label: 'Boundary reference', artifactId: boundaryArtifactId },
    ],
    evidenceType: 'close-paraphrase',
    presentationMode: 'caveat',
    confidence: 0.7,
    truthBoundary: 'Replace this with the exact boundary that keeps the site from overstating the paper.',
  }

  return [mainClaim, boundaryClaim]
}

function findArtifactIdsForPattern(
  pattern: StudyDashboardPattern,
  artifactIdsByKind: ReadonlyMap<StudyArtifactKind, readonly string[]>,
): readonly string[] {
  const descriptor = getDashboardPatternDescriptor(pattern)
  return descriptor.minimumArtifactKinds.flatMap(kind => artifactIdsByKind.get(kind) ?? []).slice(0, 3)
}

function buildDashboards(
  template: StudySpinupTemplate,
  artifactIdsByKind: ReadonlyMap<StudyArtifactKind, readonly string[]>,
  claimIds: readonly string[],
): {
  readonly dashboards: StudyPackageFrame['dashboards']
  readonly metrics: readonly StudyDashboardMetric[]
} {
  const dashboards = template.dashboardPatterns.map((pattern, index) => {
    const descriptor = getDashboardPatternDescriptor(pattern)
    const metricId = `${pattern}-metric-${index + 1}`
    return {
      id: `${pattern}-${index + 1}`,
      title: descriptor.title,
      pattern,
      questionAnswered: `How should the ${descriptor.title.toLowerCase()} help explain the main finding?`,
      summary: descriptor.description,
      askMetricKey: metricId,
      metricIds: [metricId],
      sourceArtifactIds: findArtifactIdsForPattern(pattern, artifactIdsByKind),
      claimIds: claimIds.slice(0, 1),
      isFigureReplay: descriptor.supportsFigureReplay,
    }
  })

  const metrics = dashboards.map((dashboard, index) => ({
    id: dashboard.metricIds[0] ?? `metric-${index + 1}`,
    label: `${dashboard.title} placeholder metric`,
    sourceArtifactIds: dashboard.sourceArtifactIds,
  }))

  return { dashboards, metrics }
}

export function buildOmittedSurfaces(
  includedSurfaces: readonly StudySurfaceId[],
  omissionOverrides?: Readonly<Partial<Record<StudySurfaceId, OmissionReason>>>,
): Readonly<Record<StudySurfaceId, OmissionReason | undefined>> {
  const included = new Set(includedSurfaces)
  return {
    paper: included.has('paper') ? undefined : omissionOverrides?.paper ?? 'weak-component-fit',
    'deep-dive': included.has('deep-dive') ? undefined : omissionOverrides?.['deep-dive'] ?? 'weak-component-fit',
    results: included.has('results') ? undefined : omissionOverrides?.results ?? 'weak-component-fit',
    dashboard: included.has('dashboard') ? undefined : omissionOverrides?.dashboard ?? 'weak-component-fit',
    'simulation-lab': included.has('simulation-lab') ? undefined : omissionOverrides?.['simulation-lab'] ?? 'implies-false-interactivity',
    agent: included.has('agent') ? undefined : omissionOverrides?.agent ?? 'weak-component-fit',
    community: included.has('community') ? undefined : omissionOverrides?.community ?? 'not-supported-by-sources',
  }
}

export function buildSurfaceSpecs(
  classification: StudyClassification,
  runtimeAdapter: StudyRuntimeAdapterKind,
  includedSurfaces: readonly StudySurfaceId[],
  claimIds: readonly string[],
  artifactIds: readonly string[],
  omissionOverrides: Readonly<Partial<Record<StudySurfaceId, OmissionReason>>> | undefined,
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
        : (omissionOverrides?.[entry.id] as StudyPackageFrame['surfaces'][number]['omissionReason'])
          ?? entry.omissionReason
          ?? 'weak-component-fit',
    }
  })
}

function buildAssistantPrompt(label: string) {
  return {
    label: label.slice(0, 48),
    prompt: label,
  }
}

export function buildSourceBlockRefsFromArtifacts(
  artifacts: readonly StudyPackageFrame['artifacts'][number][],
): StudyPackageFrame['runtime']['sourceBlockRefs'] {
  return artifacts
    .filter(artifact => artifact.url)
    .map(artifact => ({
      label: artifact.label,
      url: artifact.url,
    }))
}

export function buildScaffoldStudyFrame(
  template: StudySpinupTemplate,
  options: Pick<ScaffoldOptions, 'id' | 'title'>,
): StudyPackageFrame {
  const artifacts = uniqueArtifactKinds(template).map((kind, index) => buildArtifactRef(options.id, kind, index))
  const artifactIdsByKind = new Map<StudyArtifactKind, readonly string[]>(
    uniqueArtifactKinds(template).map(kind => [
      kind,
      artifacts.filter(artifact => artifact.kind === kind).map(artifact => artifact.id),
    ]),
  )
  const claims = buildStarterClaims(options.id, template, artifactIdsByKind)
  const claimIds = claims.map(claim => claim.id)
  const artifactIds = artifacts.map(artifact => artifact.id)
  const { dashboards, metrics } = buildDashboards(template, artifactIdsByKind, claimIds)

  return {
    id: options.id,
    classification: template.classification,
    metadata: {
      title: options.title,
      subtitle: `${template.title} scaffold generated by study-generator.`,
      citation: `${options.title} (replace with the canonical citation)`,
      authors: [{ name: 'Replace with author list' }],
      abstract: `Replace this abstract with the paper summary for ${options.title}.`,
      keyClaims: claims.map(claim => claim.text),
      references: artifacts
        .filter(artifact => artifact.url)
        .map(artifact => ({
          label: artifact.label,
          url: artifact.url,
        })),
    },
    artifacts,
    claims: {
      claims,
      featuredClaimIds: claimIds,
    },
    generationDecision: {
      includedSurfaces: template.includedSurfaces,
      omittedSurfaces: buildOmittedSurfaces(template.includedSurfaces, template.omissionOverrides),
      capabilities: template.capabilities,
      rationale: template.rationale,
    },
    surfaces: buildSurfaceSpecs(
      template.classification,
      template.runtimeAdapter,
      template.includedSurfaces,
      claimIds,
      artifactIds,
      template.omissionOverrides,
    ),
    dashboards,
    dashboardMetrics: metrics,
    navigation: {
      bestFirstStopIds: ['overview'],
      pdfUrl: 'https://example.com/paper.pdf',
      htmlUrl: 'https://example.com/paper',
      sectionPageMap: { '§1': 1 },
      sectionHtmlIdMap: { overview: 'S1' },
      appendices: [],
    },
    runtime: {
      adapter: template.runtimeAdapter,
      defaultSimulationConfig: DEFAULT_SIMULATION_CONFIG,
      paperReferenceOverrides: template.runtimeAdapter === 'exact' || template.runtimeAdapter === 'hybrid'
        ? {
            validators: 1000,
            slots: 10000,
            migrationCost: 0.002,
          }
        : {},
      simulationPresets: template.runtimeAdapter === 'exact' || template.runtimeAdapter === 'hybrid'
        ? {
            baseline: {
              validators: 1000,
              slots: 10000,
              migrationCost: 0.002,
            },
          }
        : {},
      canonicalPrewarmConfigs: template.runtimeAdapter === 'exact' || template.runtimeAdapter === 'hybrid'
        ? [{ ...DEFAULT_SIMULATION_CONFIG }]
        : [],
      sourceBlockRefs: buildSourceBlockRefsFromArtifacts(artifacts),
      publishedResults: template.runtimeAdapter === 'static' || template.runtimeAdapter === 'hybrid'
        ? {
            catalogPath: 'results/catalog.json',
            baseDir: 'results',
          }
        : undefined,
    },
    assistant: {
      askHeading: `Ask about ${options.title}`,
      askDescription: template.description,
      askPlaceholder: 'Replace with the strongest prompt for this study...',
      suggestedPrompts: template.starterQuestions.map(question => buildAssistantPrompt(question)),
      promptTips: [
        {
          id: 'name-evidence',
          label: 'Name the evidence',
          description: 'Prompt with the metric, scenario, figure, or claim you want to inspect.',
        },
      ],
      resultsStyleGuidance: 'Prefer evidence-first layouts that mirror the strongest study surface instead of generic chatbot prose.',
      systemPromptSupplement: template.rationale.join('\n'),
    },
  }
}

function renderLayerGuide(layer: StudyAssemblyLayer, plan: StudyAssemblyPlan): string {
  const layerModules = plan.modules.filter(module => module.layer === layer)
  const title = layer.charAt(0).toUpperCase() + layer.slice(1)

  return [
    `# ${title}`,
    '',
    ...layerModules.flatMap(module => [
      `## ${module.title}`,
      '',
      `- Kind: ${module.kind}`,
      `- Status: ${module.status}`,
      `- Purpose: ${module.purpose}`,
      `- Why: ${module.whyIncluded}`,
      `- Depends on: ${module.dependsOn.length > 0 ? module.dependsOn.join(', ') : 'None'}`,
      `- Inputs: ${module.inputs.length > 0 ? module.inputs.join(', ') : 'None'}`,
      `- Outputs: ${module.outputs.length > 0 ? module.outputs.join(', ') : 'None'}`,
      `- Blockers: ${module.blockers.length > 0 ? module.blockers.map(blocker => `${blocker.level}:${blocker.message}`).join(' | ') : 'None'}`,
      '',
    ]),
  ].join('\n')
}

function renderScaffoldReadme(
  frame: StudyPackageFrame,
  template: StudySpinupTemplate,
  plan: StudyAssemblyPlan,
): string {
  return [
    `# ${frame.metadata.title}`,
    '',
    `Template: ${template.id}`,
    `Classification: ${frame.classification}`,
    `Runtime adapter: ${frame.runtime.adapter}`,
    '',
    '## What this scaffold contains',
    '',
    '- `study-package.json`: starter package data that follows the shared schema',
    '- `study-frame.ts`: typed TypeScript export for the same starter package',
    '- `assembly-plan.json`: layered dependency map, module criteria, blockers, and provenance coverage',
    '- `project-slot-map.json`: repo-aware map of where generated pieces slot into this project',
    '- `template.json`: the template blueprint used to produce this scaffold',
    '- `layers/`: one guide per assembly layer',
    '- `explorer-adapter/`: starter explorer-module wrappers for sections, narratives, cards, and charts',
    '',
    '## Provenance coverage',
    '',
    `Overall coverage: ${plan.provenanceCoverage.overallCoverage}`,
    ...plan.provenanceCoverage.dimensions.map(dimension =>
      `- ${dimension.label}: ${dimension.covered}/${dimension.total} (${dimension.coverage})`,
    ),
    '',
    '## Next steps',
    '',
    ...template.nextSteps.map(step => `- ${step}`),
    '',
    '## Current rationale',
    '',
    ...frame.generationDecision.rationale.map(line => `- ${line}`),
    '',
  ].join('\n')
}

function serializeTypeScriptValue(value: unknown, indent = 0): string {
  const spacing = '  '.repeat(indent)
  const childSpacing = '  '.repeat(indent + 1)

  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return [
      '[',
      ...value.map(item => `${childSpacing}${serializeTypeScriptValue(item, indent + 1)},`),
      `${spacing}]`,
    ].join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    return [
      '{',
      ...entries.map(([key, entryValue]) =>
        `${childSpacing}${JSON.stringify(key)}: ${serializeTypeScriptValue(entryValue, indent + 1)},`,
      ),
      `${spacing}}`,
    ].join('\n')
  }

  return 'undefined'
}

function renderStudyFrameSource(frame: StudyPackageFrame): string {
  const constName = `${toPascalCase(frame.id)}StudyFrame`
  const literal = serializeTypeScriptValue(frame)
  return [
    "import type { StudyPackageFrame } from '@geo-dec/study-schema'",
    '',
    `export const ${constName}: StudyPackageFrame = ${literal}`,
    '',
  ].join('\n')
}

export function listScaffoldTemplates(): readonly StudySpinupTemplate[] {
  return listStudySpinupTemplates()
}

export function parseScaffoldOptions(args: readonly string[], cwd: string): ScaffoldOptions {
  const templateId = parseOption(args, 'template')
  const classification = (parseOption(args, 'classification') ?? templateId ?? 'simulation') as StudyClassification
  const template = getStudySpinupTemplate(classification)
  const title = parseOption(args, 'title') ?? `New ${template.title}`
  const id = deriveStudyId(parseOption(args, 'id') ?? title)
  const outDir = path.resolve(cwd, parseOption(args, 'outDir') ?? path.join('scaffolds', id))

  return {
    classification: template.classification,
    id,
    title,
    outDir,
  }
}

export async function writeStudyBundle(input: {
  readonly frame: StudyPackageFrame
  readonly template: StudySpinupTemplate
  readonly outDir: string
  readonly extraFiles?: readonly GeneratedTextFile[]
}): Promise<ScaffoldResult> {
  const plan = buildStudyAssemblyPlan(input.frame)
  const slotMap = buildStudyProjectSlotMap(input.frame, {
    bundleOutDir: input.outDir,
    template: input.template,
  })
  const layersDir = path.join(input.outDir, 'layers')
  const explorerAdapterFiles = buildExplorerAdapterFiles({
    study: input.frame,
    template: input.template,
    outDir: input.outDir,
    slotMap,
  })

  const baseFiles: readonly GeneratedTextFile[] = [
    {
      path: path.join(input.outDir, 'README.md'),
      content: renderScaffoldReadme(input.frame, input.template, plan),
    },
    {
      path: path.join(input.outDir, 'study-package.json'),
      content: `${JSON.stringify(input.frame, null, 2)}\n`,
    },
    {
      path: path.join(input.outDir, 'study-frame.ts'),
      content: renderStudyFrameSource(input.frame),
    },
    {
      path: path.join(input.outDir, 'assembly-plan.json'),
      content: `${JSON.stringify(plan, null, 2)}\n`,
    },
    {
      path: path.join(input.outDir, 'project-slot-map.json'),
      content: `${JSON.stringify(slotMap, null, 2)}\n`,
    },
    {
      path: path.join(input.outDir, 'template.json'),
      content: `${JSON.stringify(input.template, null, 2)}\n`,
    },
    {
      path: path.join(layersDir, 'inputs.md'),
      content: renderLayerGuide('inputs', plan),
    },
    {
      path: path.join(layersDir, 'evidence.md'),
      content: renderLayerGuide('evidence', plan),
    },
    {
      path: path.join(layersDir, 'orchestration.md'),
      content: renderLayerGuide('orchestration', plan),
    },
    {
      path: path.join(layersDir, 'experience.md'),
      content: renderLayerGuide('experience', plan),
    },
  ]

  const allFiles = [...baseFiles, ...explorerAdapterFiles, ...(input.extraFiles ?? [])]

  await Promise.all(
    [...new Set(allFiles.map(file => path.dirname(file.path)))]
      .map(dir => mkdir(dir, { recursive: true })),
  )

  await Promise.all(
    allFiles.map(file => writeFile(file.path, file.content, 'utf8')),
  )

  return {
    outDir: input.outDir,
    files: allFiles.map(file => file.path),
    templateId: input.template.id,
  }
}

export async function scaffoldStudy(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const template = getStudySpinupTemplate(options.classification)
  const frame = buildScaffoldStudyFrame(template, options)
  return writeStudyBundle({
    frame,
    template,
    outDir: options.outDir,
  })
}
