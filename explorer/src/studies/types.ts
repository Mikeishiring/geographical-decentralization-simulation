import type { PaperChartData } from '../data/paper-chart-data'
import type { PaperNarrative } from '../data/paper-narrative'
import type { Author, PaperSection } from '../data/paper-sections'
import type { TopicCard } from '../data/default-blocks'
import type {
  StudyAssistantConfig,
  StudyAssistantCapability,
  StudyAssistantCapabilityState,
  StudyAssistantMode,
  StudyAssistantPromptTip,
  StudyAssistantQueryView,
  StudyAssistantRouteHint,
  StudyAssistantSuggestedPrompt,
  StudyAssistantSimulationConfigTemplate,
  StudyAssistantStructuredQueryTemplate,
  StudyAssistantWorkflow,
  StudyAssistantWorkflowPreset,
  StudyAssistantWorkflowField,
  StudyAssistantWorkflowFieldOption,
  StudyArtifactRef,
  StudyAppendixLink,
  StudyClaimRegistry,
  StudyDashboardMetric,
  StudyDashboardSpec,
  StudyGenerationDecision,
  StudyMetadata,
  StudyNavigationConfig,
  StudyPackageFrame,
  StudyPublishedScenarioLink,
  StudyRuntimeConfig,
  StudySimulationConfig,
  StudySurfaceSpec,
  StudySourceRef,
} from '../../../packages/study-schema/src/index.ts'

export type { Author, PaperNarrative, PaperSection, TopicCard }
export type {
  StudyAssistantConfig,
  StudyAssistantCapability,
  StudyAssistantCapabilityState,
  StudyAssistantMode,
  StudyAssistantPromptTip,
  StudyAssistantQueryView,
  StudyAssistantRouteHint,
  StudyAssistantSuggestedPrompt,
  StudyAssistantSimulationConfigTemplate,
  StudyAssistantStructuredQueryTemplate,
  StudyAssistantWorkflow,
  StudyAssistantWorkflowPreset,
  StudyAssistantWorkflowField,
  StudyAssistantWorkflowFieldOption,
  StudyArtifactRef,
  StudyAppendixLink,
  StudyClaimRegistry,
  StudyDashboardMetric,
  StudyDashboardSpec,
  StudyGenerationDecision,
  StudyMetadata,
  StudyNavigationConfig,
  StudyPackageFrame,
  StudyPublishedScenarioLink,
  StudyRuntimeConfig,
  StudySimulationConfig,
  StudySurfaceSpec,
  StudySourceRef,
}

export interface StudyPaperChart {
  readonly data: PaperChartData
  readonly dashboardId?: string
  readonly askAliases?: readonly string[]
  readonly description: string
  readonly takeaway: string
  readonly metadata: readonly string[]
  readonly figureHref: string
  readonly figureLabel: string
  readonly datasetSummary: string
  readonly repoPaths: readonly string[]
  readonly publishedScenarioLinks?: readonly StudyPublishedScenarioLink[]
}

export interface StudyPackage extends StudyPackageFrame {
  readonly sections: readonly PaperSection[]
  readonly narratives: Readonly<Record<string, PaperNarrative>>
  readonly overviewCard: TopicCard
  readonly topicCards: readonly TopicCard[]
  readonly paperCharts: Readonly<Record<string, StudyPaperChart>>
}
