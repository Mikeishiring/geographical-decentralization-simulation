import type {
  StudyAuthor,
  StudyClaimAnchor,
  StudyClaimEvidenceType,
  StudyClaimPresentationMode,
  StudyArtifactKind,
  StudyRuntimeAdapterKind,
  StudySimulationConfig,
  StudySourceRef,
  StudyDashboardPattern,
} from './schema'
import type {
  OmissionReason,
  StudyCapability,
  StudyClassification,
  StudySurfaceId,
} from './quality'

export interface StudyIntakeArtifact {
  readonly id?: string
  readonly label: string
  readonly kind: StudyArtifactKind
  readonly summary?: string
  readonly url?: string
  readonly path?: string
}

export interface StudyIntakeClaim {
  readonly id?: string
  readonly text: string
  readonly sourceIds?: readonly string[]
  readonly anchors?: readonly StudyClaimAnchor[]
  readonly evidenceType?: StudyClaimEvidenceType
  readonly presentationMode?: StudyClaimPresentationMode
  readonly confidence?: number
  readonly truthBoundary?: string
  readonly featured?: boolean
}

export interface StudyIntakeDashboard {
  readonly id?: string
  readonly title: string
  readonly pattern: StudyDashboardPattern
  readonly questionAnswered: string
  readonly summary: string
  readonly metricLabels?: readonly string[]
  readonly sourceArtifactIds?: readonly string[]
  readonly claimIds?: readonly string[]
  readonly askMetricKey?: string
  readonly isFigureReplay?: boolean
}

export interface StudyIntakeRuntime {
  readonly adapter?: StudyRuntimeAdapterKind
  readonly defaultSimulationConfig?: Partial<StudySimulationConfig>
  readonly paperReferenceOverrides?: Partial<StudySimulationConfig>
  readonly simulationPresets?: Readonly<Record<string, Partial<StudySimulationConfig>>>
  readonly canonicalPrewarmConfigs?: readonly StudySimulationConfig[]
  readonly sourceBlockRefs?: readonly StudySourceRef[]
  readonly publishedResults?: Readonly<{
    catalogPath: string
    baseDir?: string
  }>
}

export interface StudyIntakeAssistant {
  readonly askHeading?: string
  readonly askDescription?: string
  readonly askPlaceholder?: string
  readonly suggestedPrompts?: readonly string[]
  readonly promptTips?: readonly Readonly<{
    id: string
    label: string
    description: string
    example?: string
  }>[]
  readonly systemPromptSupplement?: string
}

export interface StudyIntakePacket {
  readonly id?: string
  readonly templateId?: string
  readonly classification?: StudyClassification
  readonly title: string
  readonly subtitle?: string
  readonly citation?: string
  readonly authors?: readonly StudyAuthor[]
  readonly abstract?: string
  readonly keyClaims?: readonly string[]
  readonly artifacts: readonly StudyIntakeArtifact[]
  readonly claims?: readonly StudyIntakeClaim[]
  readonly dashboards?: readonly StudyIntakeDashboard[]
  readonly capabilities?: readonly StudyCapability[]
  readonly includedSurfaces?: readonly StudySurfaceId[]
  readonly omissionOverrides?: Readonly<Partial<Record<StudySurfaceId, OmissionReason>>>
  readonly rationale?: readonly string[]
  readonly runtime?: StudyIntakeRuntime
  readonly assistant?: StudyIntakeAssistant
}
