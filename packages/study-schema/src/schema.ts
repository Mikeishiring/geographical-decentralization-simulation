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

export interface StudyRuntimeConfig {
  readonly adapter: StudyRuntimeAdapterKind
  readonly defaultSimulationConfig: StudySimulationConfig
  readonly paperReferenceOverrides: Partial<StudySimulationConfig>
  readonly simulationPresets: Readonly<Record<string, Partial<StudySimulationConfig>>>
  readonly canonicalPrewarmConfigs: readonly StudySimulationConfig[]
  readonly sourceBlockRefs: readonly StudySourceRef[]
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
}
