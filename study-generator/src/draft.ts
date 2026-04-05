import path from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  getStudySpinupTemplate,
  listStudySpinupTemplates,
  type StudyArtifactKind,
  type StudyClaim,
  type StudyClassification,
  type StudyDashboardMetric,
  type StudyDashboardPattern,
  type StudyIntakeClaim,
  type StudyIntakePacket,
  type StudyPackageFrame,
  type StudySimulationConfig,
  type StudySpinupTemplate,
} from '../../packages/study-schema/src/index.ts'
import { buildEditorialScorecard } from './scorecard.ts'
import {
  buildOmittedSurfaces,
  buildScaffoldStudyFrame,
  buildSourceBlockRefsFromArtifacts,
  buildSurfaceSpecs,
  deriveStudyId,
  type GeneratedTextFile,
  type ScaffoldResult,
  writeStudyBundle,
} from './scaffold.ts'
import { validateStudyPackage } from './validators/index.ts'

export interface DraftOptions {
  readonly intakePath: string
  readonly outDir: string
  readonly classificationOverride?: StudyClassification
}

export interface DraftResult extends ScaffoldResult {
  readonly intakePath: string
  readonly templateReason: string
}

function parseOption(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function normalizeId(value: string | undefined, fallback: string, index: number): string {
  return deriveStudyId(value?.trim() || `${fallback}-${index + 1}`)
}

function clampConfidence(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function readJson(value: string): unknown {
  return JSON.parse(value) as unknown
}

function assertStudyIntakePacket(value: unknown): asserts value is StudyIntakePacket {
  if (!value || typeof value !== 'object') {
    throw new Error('The intake file must contain a JSON object.')
  }

  const packet = value as Partial<StudyIntakePacket>
  if (!packet.title || typeof packet.title !== 'string') {
    throw new Error('The intake file must include a string title.')
  }
  if (!Array.isArray(packet.artifacts) || packet.artifacts.length === 0) {
    throw new Error('The intake file must include at least one artifact.')
  }
}

function buildArtifactKindSet(packet: StudyIntakePacket): ReadonlySet<StudyArtifactKind> {
  return new Set(packet.artifacts.map(artifact => artifact.kind))
}

function buildPatternSet(packet: StudyIntakePacket): ReadonlySet<StudyDashboardPattern> {
  return new Set((packet.dashboards ?? []).map(dashboard => dashboard.pattern))
}

function scoreTemplate(template: StudySpinupTemplate, packet: StudyIntakePacket): number {
  let score = 0
  const artifactKinds = buildArtifactKindSet(packet)
  const patterns = buildPatternSet(packet)
  const runtimeAdapter = packet.runtime?.adapter

  if (runtimeAdapter === template.runtimeAdapter) score += 6
  if (packet.classification === template.classification) score += 10

  if (patterns.has('event-timeline') || patterns.has('pre-post-comparison')) {
    if (template.id === 'empirical-event-study') score += 5
  }
  if (patterns.has('benchmark-matrix')) {
    if (template.id === 'benchmark-evaluation') score += 5
  }
  if (patterns.has('evidence-board') && !artifactKinds.has('dataset')) {
    if (template.id === 'theory-mechanism') score += 4
  }
  if (patterns.has('geography-map')) {
    if (template.id === 'empirical-observational' || template.id === 'mixed') score += 3
  }
  if (patterns.has('timeseries-panel')) {
    if (template.id === 'simulation' || template.id === 'empirical-observational' || template.id === 'mixed') score += 2
  }

  if (artifactKinds.has('dataset')) score += template.requiredArtifactKinds.includes('dataset') ? 2 : 0
  if (artifactKinds.has('table')) score += template.requiredArtifactKinds.includes('table') ? 2 : 0
  if (artifactKinds.has('figure')) score += template.requiredArtifactKinds.includes('figure') ? 1 : 0
  if (artifactKinds.has('code')) score += template.requiredArtifactKinds.includes('code') ? 2 : 0
  if (artifactKinds.has('appendix')) score += template.optionalArtifactKinds.includes('appendix') ? 1 : 0

  if ((runtimeAdapter === 'exact' || runtimeAdapter === 'hybrid') && artifactKinds.has('dataset') && artifactKinds.has('code')) {
    if (template.id === 'simulation') score += 4
    if (template.id === 'mixed') score += 3
  }
  if (runtimeAdapter === 'none' && !artifactKinds.has('dataset')) {
    if (template.id === 'theory-mechanism') score += 4
  }
  if (runtimeAdapter === 'static' && artifactKinds.has('table') && artifactKinds.has('dataset') && artifactKinds.has('code')) {
    if (template.id === 'benchmark-evaluation') score += 4
  }

  return score
}

function resolveTemplate(packet: StudyIntakePacket, override?: StudyClassification): {
  readonly template: StudySpinupTemplate
  readonly reason: string
} {
  if (override) {
    return {
      template: getStudySpinupTemplate(override),
      reason: `Template selected from --classification=${override}.`,
    }
  }

  if (packet.templateId) {
    return {
      template: getStudySpinupTemplate(packet.templateId),
      reason: `Template selected from intake.templateId=${packet.templateId}.`,
    }
  }

  if (packet.classification) {
    return {
      template: getStudySpinupTemplate(packet.classification),
      reason: `Template selected from intake.classification=${packet.classification}.`,
    }
  }

  const scored = listStudySpinupTemplates()
    .map(template => ({
      template,
      score: scoreTemplate(template, packet),
    }))
    .sort((left, right) => right.score - left.score)

  const winner = scored[0]?.template ?? getStudySpinupTemplate('simulation')
  const topScore = scored[0]?.score ?? 0
  return {
    template: winner,
    reason: `Template inferred from runtime/artifact/dashboard signals as ${winner.id} (score ${topScore}).`,
  }
}

function buildArtifactRefs(packet: StudyIntakePacket): StudyPackageFrame['artifacts'] {
  return packet.artifacts.map((artifact, index) => ({
    id: normalizeId(artifact.id, artifact.label || artifact.kind, index),
    label: artifact.label,
    kind: artifact.kind,
    summary: artifact.summary,
    url: artifact.url,
    path: artifact.path,
  }))
}

function buildClaimRegistry(
  packet: StudyIntakePacket,
  artifacts: StudyPackageFrame['artifacts'],
  studyId: string,
): StudyPackageFrame['claims'] {
  const primaryArtifactId = artifacts[0]?.id ?? 'paper-pdf-1'
  const artifactIdSet = new Set(artifacts.map(artifact => artifact.id))
  const claimInputs: readonly StudyIntakeClaim[] = packet.claims?.length
    ? packet.claims
    : (packet.keyClaims ?? []).map(text => ({ text }))

  const claims = claimInputs.map<StudyClaim>((claim, index) => {
    const sourceIds = claim.sourceIds?.filter((sourceId: string) => artifactIdSet.has(sourceId)) ?? []
    const normalizedSourceIds = sourceIds.length > 0 ? sourceIds : [primaryArtifactId]
    const anchors = claim.anchors?.length ? claim.anchors : [{ kind: 'section' as const, label: '§1' }]
    const presentationMode = claim.presentationMode
      ?? (claim.truthBoundary ? 'caveat' : 'fact')
    const evidenceType = claim.evidenceType
      ?? (artifacts.some(artifact => normalizedSourceIds.includes(artifact.id) && artifact.kind === 'dataset')
        ? 'derived-from-dataset'
        : 'close-paraphrase')

    return {
      id: normalizeId(claim.id, `${studyId}-claim`, index),
      text: claim.text,
      sourceIds: normalizedSourceIds,
      anchors,
      evidenceType,
      presentationMode,
      confidence: clampConfidence(claim.confidence, 0.75),
      truthBoundary: claim.truthBoundary,
    }
  })

  const featuredClaimIds = packet.claims?.some(claim => claim.featured)
    ? packet.claims
        .map((claim, index) => ({
          featured: claim.featured,
          id: claims[index]?.id,
        }))
        .filter(entry => entry.featured && entry.id)
        .map(entry => entry.id as string)
    : claims.slice(0, 3).map(claim => claim.id)

  return {
    claims,
    featuredClaimIds,
  }
}

function buildDashboardBundle(
  packet: StudyIntakePacket,
  artifacts: StudyPackageFrame['artifacts'],
  claims: StudyPackageFrame['claims'],
  fallbackDashboards: StudyPackageFrame['dashboards'],
  fallbackMetrics: readonly StudyDashboardMetric[],
): {
  readonly dashboards: StudyPackageFrame['dashboards']
  readonly metrics: readonly StudyDashboardMetric[]
} {
  if (!packet.dashboards?.length) {
    return {
      dashboards: fallbackDashboards,
      metrics: fallbackMetrics,
    }
  }

  const firstClaimId = claims.claims[0]?.id
  const firstArtifactIds = artifacts.slice(0, 3).map(artifact => artifact.id)
  const metricRecords: StudyDashboardMetric[] = []

  const dashboards = packet.dashboards.map((dashboard, dashboardIndex) => {
    const baseId = normalizeId(dashboard.id, dashboard.title, dashboardIndex)
    const metricLabels = dashboard.metricLabels?.length
      ? dashboard.metricLabels
      : [`${dashboard.title} metric`]
    const metricIds = metricLabels.map((_, metricIndex) => `${baseId}-metric-${metricIndex + 1}`)

    metricLabels.forEach((label, metricIndex) => {
      metricRecords.push({
        id: metricIds[metricIndex] ?? `${baseId}-metric-${metricIndex + 1}`,
        label,
        sourceArtifactIds: dashboard.sourceArtifactIds?.length ? dashboard.sourceArtifactIds : firstArtifactIds,
      })
    })

    return {
      id: baseId,
      title: dashboard.title,
      pattern: dashboard.pattern,
      questionAnswered: dashboard.questionAnswered,
      summary: dashboard.summary,
      askMetricKey: dashboard.askMetricKey ?? metricIds[0],
      metricIds,
      sourceArtifactIds: dashboard.sourceArtifactIds?.length ? dashboard.sourceArtifactIds : firstArtifactIds,
      claimIds: dashboard.claimIds?.length ? dashboard.claimIds : (firstClaimId ? [firstClaimId] : []),
      isFigureReplay: dashboard.isFigureReplay,
    }
  })

  return {
    dashboards,
    metrics: metricRecords,
  }
}

function mergeRuntime(
  baseFrame: StudyPackageFrame,
  packet: StudyIntakePacket,
  artifacts: StudyPackageFrame['artifacts'],
  template: StudySpinupTemplate,
): StudyPackageFrame['runtime'] {
  const runtimeAdapter = packet.runtime?.adapter ?? template.runtimeAdapter
  const scaffoldRuntime = baseFrame.runtime

  return {
    adapter: runtimeAdapter,
    defaultSimulationConfig: {
      ...scaffoldRuntime.defaultSimulationConfig,
      ...(packet.runtime?.defaultSimulationConfig ?? {}),
    } as StudySimulationConfig,
    paperReferenceOverrides: {
      ...scaffoldRuntime.paperReferenceOverrides,
      ...(packet.runtime?.paperReferenceOverrides ?? {}),
    },
    simulationPresets: packet.runtime?.simulationPresets
      ?? scaffoldRuntime.simulationPresets,
    canonicalPrewarmConfigs: packet.runtime?.canonicalPrewarmConfigs
      ?? scaffoldRuntime.canonicalPrewarmConfigs,
    sourceBlockRefs: packet.runtime?.sourceBlockRefs
      ?? buildSourceBlockRefsFromArtifacts(artifacts),
    publishedResults: packet.runtime?.publishedResults
      ?? scaffoldRuntime.publishedResults,
  }
}

function mergeAssistant(
  baseFrame: StudyPackageFrame,
  packet: StudyIntakePacket,
  template: StudySpinupTemplate,
): StudyPackageFrame['assistant'] {
  const suggestedPrompts = packet.assistant?.suggestedPrompts?.length
    ? packet.assistant.suggestedPrompts.map(prompt => ({
        label: prompt.slice(0, 48),
        prompt,
      }))
    : baseFrame.assistant.suggestedPrompts

  return {
    ...baseFrame.assistant,
    askHeading: packet.assistant?.askHeading ?? baseFrame.assistant.askHeading,
    askDescription: packet.assistant?.askDescription ?? baseFrame.assistant.askDescription ?? template.description,
    askPlaceholder: packet.assistant?.askPlaceholder ?? baseFrame.assistant.askPlaceholder,
    suggestedPrompts,
    promptTips: packet.assistant?.promptTips ?? baseFrame.assistant.promptTips,
    systemPromptSupplement: packet.assistant?.systemPromptSupplement ?? baseFrame.assistant.systemPromptSupplement,
  }
}

export function buildDraftStudyFrame(
  packet: StudyIntakePacket,
  resolution: {
    readonly template: StudySpinupTemplate
    readonly reason: string
  },
): StudyPackageFrame {
  const studyId = packet.id ? deriveStudyId(packet.id) : deriveStudyId(packet.title)
  const baseFrame = buildScaffoldStudyFrame(resolution.template, {
    id: studyId,
    title: packet.title,
  })
  const artifacts = buildArtifactRefs(packet)
  const draftClaims = buildClaimRegistry(packet, artifacts, studyId)
  const claims = draftClaims.claims.length > 0 ? draftClaims : baseFrame.claims
  const dashboardBundle = buildDashboardBundle(
    packet,
    artifacts,
    claims,
    baseFrame.dashboards,
    baseFrame.dashboardMetrics,
  )
  const includedSurfaces = packet.includedSurfaces ?? resolution.template.includedSurfaces
  const capabilities = packet.capabilities ?? resolution.template.capabilities
  const runtime = mergeRuntime(baseFrame, packet, artifacts, resolution.template)

  return {
    ...baseFrame,
    id: studyId,
    classification: packet.classification ?? resolution.template.classification,
    metadata: {
      title: packet.title,
      subtitle: packet.subtitle ?? baseFrame.metadata.subtitle,
      citation: packet.citation ?? baseFrame.metadata.citation,
      authors: packet.authors?.length ? packet.authors : baseFrame.metadata.authors,
      abstract: packet.abstract ?? baseFrame.metadata.abstract,
      keyClaims: packet.keyClaims?.length
        ? packet.keyClaims
        : claims.claims.map(claim => claim.text),
      references: artifacts
        .filter(artifact => artifact.url)
        .map(artifact => ({
          label: artifact.label,
          url: artifact.url,
        })),
    },
    artifacts,
    claims,
    generationDecision: {
      includedSurfaces,
      omittedSurfaces: buildOmittedSurfaces(includedSurfaces, packet.omissionOverrides ?? resolution.template.omissionOverrides),
      capabilities,
      rationale: packet.rationale?.length
        ? packet.rationale
        : [...resolution.template.rationale, resolution.reason],
    },
    surfaces: buildSurfaceSpecs(
      packet.classification ?? resolution.template.classification,
      runtime.adapter,
      includedSurfaces,
      claims.claims.map(claim => claim.id),
      artifacts.map(artifact => artifact.id),
      packet.omissionOverrides ?? resolution.template.omissionOverrides,
    ),
    dashboards: dashboardBundle.dashboards,
    dashboardMetrics: dashboardBundle.metrics,
    runtime,
    assistant: mergeAssistant(baseFrame, packet, resolution.template),
  }
}

export function parseDraftOptions(args: readonly string[], cwd: string): DraftOptions {
  const intake = parseOption(args, 'intake')
  if (!intake) {
    throw new Error('Missing required --intake=<path-to-json> option.')
  }

  const classification = parseOption(args, 'classification') as StudyClassification | undefined
  const titleOverride = parseOption(args, 'title')
  const packetId = parseOption(args, 'id')
  const outDir = parseOption(args, 'outDir')

  return {
    intakePath: path.resolve(cwd, intake),
    outDir: outDir
      ? path.resolve(cwd, outDir)
      : path.resolve(cwd, 'drafts', deriveStudyId(packetId ?? titleOverride ?? path.basename(intake, '.json'))),
    classificationOverride: classification,
  }
}

export async function readStudyIntakePacket(intakePath: string): Promise<StudyIntakePacket> {
  const raw = await readFile(intakePath, 'utf8')
  const parsed = readJson(raw)
  assertStudyIntakePacket(parsed)
  return parsed
}

export async function draftStudyFromIntake(options: DraftOptions): Promise<DraftResult> {
  const packet = await readStudyIntakePacket(options.intakePath)
  const resolution = resolveTemplate(packet, options.classificationOverride)
  const frame = buildDraftStudyFrame(packet, resolution)
  const validationReport = validateStudyPackage(frame)
  const editorialScorecard = buildEditorialScorecard(frame, validationReport)

  const extraFiles: readonly GeneratedTextFile[] = [
    {
      path: path.join(options.outDir, 'intake.json'),
      content: `${JSON.stringify(packet, null, 2)}\n`,
    },
    {
      path: path.join(options.outDir, 'validation-report.json'),
      content: `${JSON.stringify(validationReport, null, 2)}\n`,
    },
    {
      path: path.join(options.outDir, 'editorial-scorecard.json'),
      content: `${JSON.stringify(editorialScorecard, null, 2)}\n`,
    },
    {
      path: path.join(options.outDir, 'draft-summary.json'),
      content: `${JSON.stringify({
        templateId: resolution.template.id,
        templateReason: resolution.reason,
        studyId: frame.id,
        classification: frame.classification,
      }, null, 2)}\n`,
    },
  ]

  const result = await writeStudyBundle({
    frame,
    template: resolution.template,
    outDir: options.outDir,
    extraFiles,
  })

  return {
    ...result,
    intakePath: options.intakePath,
    templateReason: resolution.reason,
  }
}
