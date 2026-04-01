import type { PaperChartData } from '../data/paper-chart-data'
import type { PaperNarrative } from '../data/paper-narrative'
import type { Author, PaperSection } from '../data/paper-sections'
import type { TopicCard } from '../data/default-blocks'
import type {
  StudyAppendixLink,
  StudyMetadata,
  StudyNavigationConfig,
  StudyPublishedScenarioLink,
  StudyRuntimeConfig,
  StudySimulationConfig,
  StudySourceRef,
} from '../../../packages/study-schema/src/index.ts'

export type { Author, PaperNarrative, PaperSection, TopicCard }
export type {
  StudyAppendixLink,
  StudyMetadata,
  StudyNavigationConfig,
  StudyPublishedScenarioLink,
  StudyRuntimeConfig,
  StudySimulationConfig,
  StudySourceRef,
}

export interface StudyPaperChart {
  readonly data: PaperChartData
  readonly description: string
  readonly takeaway: string
  readonly metadata: readonly string[]
  readonly figureHref: string
  readonly figureLabel: string
  readonly datasetSummary: string
  readonly repoPaths: readonly string[]
  readonly publishedScenarioLinks?: readonly StudyPublishedScenarioLink[]
}

export interface StudyPackage {
  readonly id: string
  readonly metadata: StudyMetadata
  readonly sections: readonly PaperSection[]
  readonly narratives: Readonly<Record<string, PaperNarrative>>
  readonly overviewCard: TopicCard
  readonly topicCards: readonly TopicCard[]
  readonly paperCharts: Readonly<Record<string, StudyPaperChart>>
  readonly navigation: StudyNavigationConfig
  readonly runtime: StudyRuntimeConfig
}
