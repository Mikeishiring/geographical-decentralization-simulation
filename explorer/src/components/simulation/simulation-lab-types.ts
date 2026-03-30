import type { Block } from '../../types/blocks'
import type { AnalyticsDeckView } from './simulation-analytics'

export interface WorkerSuccess {
  readonly id: number
  readonly ok: true
  readonly blocks: readonly Block[]
}

export interface WorkerFailure {
  readonly id: number
  readonly ok: false
  readonly error: string
}

export interface ResearchMetadata {
  readonly v?: number
  readonly cost?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly gamma?: number
  readonly description?: string
}

export interface ResearchDatasetEntry {
  readonly evaluation: string
  readonly paradigm: 'Local' | 'External'
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
  readonly metadata?: ResearchMetadata
}

export interface ResearchCatalog {
  readonly introBlurb: string
  readonly defaultSelection: {
    readonly evaluation: string
    readonly paradigm: string
    readonly result: string
    readonly path: string
  } | null
  readonly datasets: readonly ResearchDatasetEntry[]
}

export interface PublishedDatasetRecommendation {
  readonly dataset: ResearchDatasetEntry
  readonly reason: string
}

export interface NumericCatalogOption {
  readonly value: number
  readonly label: string
}

export type RunnerStatus = 'idle' | 'submitting' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type SurfaceMode = 'research' | 'lab'

export interface InitialSimulationLabState {
  readonly surfaceMode: SurfaceMode
  readonly jobId?: string
  readonly analyticsView?: AnalyticsDeckView
  readonly analyticsSlot?: number
  readonly comparisonPath?: string
}
