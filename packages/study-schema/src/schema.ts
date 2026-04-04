import type {
  OmissionReason,
  StudyClassification,
  StudyGenerationDecision,
  StudySurfaceId,
} from './quality'

export interface StudySourceRef {
  readonly label: string
  readonly section?: string
  readonly url?: string
}

export interface StudyAuthor {
  readonly name: string
  readonly role?: string
  readonly url?: string
  readonly focus?: string
}

export interface StudyMetadata {
  readonly title: string
  readonly subtitle: string
  readonly citation: string
  readonly authors: readonly StudyAuthor[]
  readonly abstract: string
  readonly keyClaims: readonly string[]
  readonly references: readonly StudySourceRef[]
}

export type StudyArtifactKind =
  | 'paper-pdf'
  | 'paper-html'
  | 'figure'
  | 'table'
  | 'dataset'
  | 'code'
  | 'runtime-output'
  | 'appendix'

export interface StudyArtifactRef {
  readonly id: string
  readonly label: string
  readonly kind: StudyArtifactKind
  readonly summary?: string
  readonly url?: string
  readonly path?: string
}

export type StudyClaimPresentationMode = 'fact' | 'paraphrase' | 'interpretation' | 'caveat'

export type StudyClaimEvidenceType =
  | 'verbatim'
  | 'close-paraphrase'
  | 'derived-from-dataset'
  | 'figure-replay'
  | 'inference'

export type StudyClaimAnchorKind =
  | 'section'
  | 'figure'
  | 'table'
  | 'quote'
  | 'dataset'
  | 'appendix'

export interface StudyClaimAnchor {
  readonly kind: StudyClaimAnchorKind
  readonly label: string
  readonly page?: number
  readonly sectionId?: string
  readonly quote?: string
  readonly artifactId?: string
}

export interface StudyClaim {
  readonly id: string
  readonly text: string
  readonly sourceIds: readonly string[]
  readonly anchors: readonly StudyClaimAnchor[]
  readonly evidenceType: StudyClaimEvidenceType
  readonly presentationMode: StudyClaimPresentationMode
  readonly confidence: number
  readonly truthBoundary?: string
}

export interface StudyClaimRegistry {
  readonly claims: readonly StudyClaim[]
  readonly featuredClaimIds: readonly string[]
}

export interface StudyPublishedScenarioLink {
  readonly label: string
  readonly evaluation: string
  readonly paradigm: 'External' | 'Local'
  readonly result: string
}

export interface StudyAppendixLink {
  readonly id: string
  readonly label: string
  readonly summary: string
  readonly url: string
}

export type StudyDashboardPattern =
  | 'event-timeline'
  | 'pre-post-comparison'
  | 'timeseries-panel'
  | 'parameter-sweep'
  | 'benchmark-matrix'
  | 'geography-map'
  | 'evidence-board'
  | 'artifact-gallery'

export interface StudyDashboardMetric {
  readonly id: string
  readonly label: string
  readonly unit?: string
  readonly sourceArtifactIds: readonly string[]
}

export interface StudyDashboardSpec {
  readonly id: string
  readonly title: string
  readonly pattern: StudyDashboardPattern
  readonly questionAnswered: string
  readonly summary: string
  readonly askMetricKey?: string
  readonly metricIds: readonly string[]
  readonly sourceArtifactIds: readonly string[]
  readonly claimIds: readonly string[]
  readonly isFigureReplay?: boolean
}

export interface StudySurfaceSpec {
  readonly id: StudySurfaceId
  readonly title: string
  readonly purpose: string
  readonly enabled: boolean
  readonly componentIds: readonly string[]
  readonly requiredClaimIds: readonly string[]
  readonly requiredArtifactIds: readonly string[]
  readonly omissionReason?: OmissionReason
}

export interface StudySimulationConfig {
  readonly paradigm: 'SSP' | 'MSP'
  readonly validators: number
  readonly slots: number
  readonly distribution: 'homogeneous' | 'homogeneous-gcp' | 'heterogeneous' | 'random'
  readonly sourcePlacement: 'homogeneous' | 'latency-aligned' | 'latency-misaligned'
  readonly migrationCost: number
  readonly attestationThreshold: number
  readonly slotTime: 6 | 8 | 12
  readonly seed: number
}

export type StudyRuntimeAdapterKind = 'none' | 'static' | 'exact' | 'hybrid'

export interface StudyPublishedResultsConfig {
  readonly catalogPath: string
  readonly baseDir?: string
}

export interface StudyRuntimeConfig {
  readonly adapter: StudyRuntimeAdapterKind
  readonly defaultSimulationConfig: StudySimulationConfig
  readonly paperReferenceOverrides: Partial<StudySimulationConfig>
  readonly simulationPresets: Readonly<Record<string, Partial<StudySimulationConfig>>>
  readonly canonicalPrewarmConfigs: readonly StudySimulationConfig[]
  readonly sourceBlockRefs: readonly StudySourceRef[]
  readonly publishedResults?: StudyPublishedResultsConfig
}

export type StudyAssistantMode = 'ask' | 'experiment' | 'both'
export type StudyAssistantCapabilityState = 'live' | 'exact' | 'guided' | 'planned'
export type StudyAssistantRouteHint =
  | 'orientation'
  | 'results'
  | 'structured-results'
  | 'simulation-config'
  | 'hybrid'

export type StudyAssistantWorkflowSectionSurface =
  | 'cards'
  | 'compact-list'
  | 'preset-strip'

export type StudyAssistantWorkflowSectionPreviewMode =
  | 'all'
  | 'featured'

export interface StudyAssistantSuggestedPrompt {
  readonly label: string
  readonly prompt: string
  readonly mode?: StudyAssistantMode
}

export interface StudyAssistantCapability {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly state?: StudyAssistantCapabilityState
  readonly prompts?: readonly string[]
}

export interface StudyAssistantPromptTip {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly example?: string
}

export interface StudyAssistantWorkflow {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly promptTemplate?: string
  readonly structuredQueryTemplate?: StudyAssistantStructuredQueryTemplate
  readonly simulationConfigTemplate?: StudyAssistantSimulationConfigTemplate
  readonly presets?: readonly StudyAssistantWorkflowPreset[]
  readonly mode?: StudyAssistantMode
  readonly routeHint?: StudyAssistantRouteHint
  readonly badge?: string
  readonly outputs?: readonly string[]
  readonly bestFor?: readonly string[]
  readonly fields?: readonly StudyAssistantWorkflowField[]
}

export interface StudyAssistantWorkflowPreset {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly badge?: string
  readonly values?: Readonly<Record<string, string>>
}

export interface StudyAssistantWorkflowSection {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly mode?: StudyAssistantMode
  readonly surface?: StudyAssistantWorkflowSectionSurface
  readonly previewMode?: StudyAssistantWorkflowSectionPreviewMode
  readonly workflowIds: readonly string[]
}

export interface StudyAssistantStructuredQueryTemplate {
  readonly viewId?: string
  readonly dimensions?: readonly string[]
  readonly metrics?: readonly string[]
  readonly filters?: Readonly<{
    evaluation?: string
    paradigm?: string
    result?: string
  }>
  readonly slot?: 'initial' | 'final' | string
  readonly orderBy?: string
  readonly order?: 'asc' | 'desc'
  readonly limit?: number
}

export interface StudyAssistantSimulationConfigTemplate {
  readonly base?: 'default' | 'paper-reference'
  readonly preset?: string
  readonly paradigm?: 'SSP' | 'MSP' | string
  readonly distribution?: StudySimulationConfig['distribution'] | string
  readonly sourcePlacement?: StudySimulationConfig['sourcePlacement'] | string
  readonly validators?: number | string
  readonly slots?: number | string
  readonly migrationCost?: number | string
  readonly attestationThreshold?: number | string
  readonly slotTime?: StudySimulationConfig['slotTime'] | string
  readonly seed?: number | string
}

export interface StudyAssistantWorkflowFieldOption {
  readonly value: string
  readonly label: string
  readonly promptValue?: string
  readonly bindings?: Readonly<Record<string, string>>
}

export interface StudyAssistantWorkflowField {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly type?: 'select'
  readonly defaultValue?: string
  readonly options: readonly StudyAssistantWorkflowFieldOption[]
}

export interface StudyAssistantQueryView {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly surface?: 'leaderboard' | 'comparison-table' | 'parameter-sweep' | 'results-catalog'
  readonly prompts?: readonly string[]
  readonly aliases?: readonly string[]
  readonly dashboardIds?: readonly string[]
  readonly bestFor?: readonly string[]
  readonly defaultDimensions?: readonly string[]
  readonly defaultMetrics?: readonly string[]
  readonly defaultOrderBy?: string
  readonly defaultOrder?: 'asc' | 'desc'
  readonly defaultLimit?: number
  readonly filterPreset?: Readonly<{
    evaluation?: string
    paradigm?: string
    result?: string
  }>
  readonly constraints?: Readonly<{
    dimensions?: readonly string[]
    metrics?: readonly string[]
    orderBy?: readonly string[]
    slots?: readonly ('initial' | 'final')[]
    filters?: Readonly<{
      evaluation?: readonly string[]
      paradigm?: readonly string[]
      result?: readonly string[]
    }>
  }>
  readonly executionHints?: readonly Readonly<{
    label: string
    description: string
  }>[]
}

export interface StudyAssistantConfig {
  readonly askHeading?: string
  readonly askDescription?: string
  readonly askPlaceholder?: string
  readonly suggestedPrompts: readonly StudyAssistantSuggestedPrompt[]
  readonly capabilities?: readonly StudyAssistantCapability[]
  readonly promptTips?: readonly StudyAssistantPromptTip[]
  readonly workflows?: readonly StudyAssistantWorkflow[]
  readonly workflowSections?: readonly StudyAssistantWorkflowSection[]
  readonly queryViews?: readonly StudyAssistantQueryView[]
  readonly resultsStyleGuidance?: string
  readonly systemPromptSupplement?: string
}

export interface StudyNavigationConfig {
  readonly bestFirstStopIds: readonly string[]
  readonly pdfUrl: string
  readonly htmlUrl: string
  readonly sectionPageMap: Readonly<Record<string, number>>
  readonly sectionHtmlIdMap: Readonly<Record<string, string>>
  readonly appendices: readonly StudyAppendixLink[]
}

export interface StudyPackageFrame {
  readonly id: string
  readonly classification: StudyClassification
  readonly metadata: StudyMetadata
  readonly artifacts: readonly StudyArtifactRef[]
  readonly claims: StudyClaimRegistry
  readonly generationDecision: StudyGenerationDecision
  readonly surfaces: readonly StudySurfaceSpec[]
  readonly dashboards: readonly StudyDashboardSpec[]
  readonly dashboardMetrics: readonly StudyDashboardMetric[]
  readonly navigation: StudyNavigationConfig
  readonly runtime: StudyRuntimeConfig
  readonly assistant: StudyAssistantConfig
}
