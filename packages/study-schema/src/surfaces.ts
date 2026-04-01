import {
  getDisallowedSurfacesWithoutRuntime,
  getRecommendedSurfaces,
  type OmissionReason,
  type StudyCapability,
  type StudyClassification,
  type StudySurfaceId,
} from './quality'
import type { StudyRuntimeAdapterKind } from './schema'

export interface StudySurfaceDescriptor {
  readonly id: StudySurfaceId
  readonly title: string
  readonly purpose: string
  readonly defaultComponents: readonly string[]
  readonly requiredCapabilities: readonly StudyCapability[]
  readonly recommendedFor: readonly StudyClassification[]
  readonly requiresRuntime: boolean
}

export interface StudySurfacePlanEntry {
  readonly id: StudySurfaceId
  readonly enabled: boolean
  readonly omissionReason?: OmissionReason
}

export const STUDY_SURFACE_REGISTRY: Readonly<Record<StudySurfaceId, StudySurfaceDescriptor>> = {
  paper: {
    id: 'paper',
    title: 'Paper',
    purpose: 'Present the canonical reading flow, claims, figures, and citations.',
    defaultComponents: ['paper-hero', 'section-reader', 'citations'],
    requiredCapabilities: ['static-reading'],
    recommendedFor: [
      'simulation',
      'empirical-event-study',
      'empirical-observational',
      'theory-mechanism',
      'benchmark-evaluation',
      'mixed',
    ],
    requiresRuntime: false,
  },
  'deep-dive': {
    id: 'deep-dive',
    title: 'Deep Dive',
    purpose: 'Walk section by section through the paper with richer interpretation and evidence grouping.',
    defaultComponents: ['topic-cards', 'arguments-view', 'section-drilldown'],
    requiredCapabilities: ['static-reading'],
    recommendedFor: [
      'simulation',
      'empirical-event-study',
      'empirical-observational',
      'theory-mechanism',
      'benchmark-evaluation',
      'mixed',
    ],
    requiresRuntime: false,
  },
  results: {
    id: 'results',
    title: 'Results',
    purpose: 'Compare the main reported outcomes using curated figures, stats, and scenario comparisons.',
    defaultComponents: ['results-grid', 'paper-chart', 'comparison-cards'],
    requiredCapabilities: ['figure-replay'],
    recommendedFor: ['simulation', 'benchmark-evaluation', 'mixed'],
    requiresRuntime: false,
  },
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard',
    purpose: 'Expose dataset-driven views such as event studies, timeseries, and benchmark matrices.',
    defaultComponents: ['metric-board', 'timeline', 'dataset-chart'],
    requiredCapabilities: ['dataset-dashboard'],
    recommendedFor: ['empirical-event-study', 'empirical-observational', 'mixed'],
    requiresRuntime: false,
  },
  'simulation-lab': {
    id: 'simulation-lab',
    title: 'Simulation Lab',
    purpose: 'Let readers rerun or compare supported model presets without inventing extra interactivity.',
    defaultComponents: ['simulation-controls', 'preset-bar', 'runtime-results'],
    requiredCapabilities: ['exact-runtime', 'preset-comparisons'],
    recommendedFor: ['simulation', 'mixed'],
    requiresRuntime: true,
  },
  agent: {
    id: 'agent',
    title: 'Agent',
    purpose: 'Support grounded Q&A that stays inside the study package truth boundary.',
    defaultComponents: ['chat-panel', 'citation-stack', 'claim-registry'],
    requiredCapabilities: ['agent-grounded-qa'],
    recommendedFor: [
      'simulation',
      'empirical-event-study',
      'empirical-observational',
      'theory-mechanism',
      'benchmark-evaluation',
      'mixed',
    ],
    requiresRuntime: false,
  },
  community: {
    id: 'community',
    title: 'Community',
    purpose: 'Collect reader notes, follow-up questions, and external annotations when the study supports it.',
    defaultComponents: ['community-feed', 'note-composer', 'annotation-panel'],
    requiredCapabilities: ['community-annotations'],
    recommendedFor: ['mixed'],
    requiresRuntime: false,
  },
} as const

export function getSurfaceDescriptor(surfaceId: StudySurfaceId): StudySurfaceDescriptor {
  return STUDY_SURFACE_REGISTRY[surfaceId]
}

export function buildDefaultSurfacePlan(
  classification: StudyClassification,
  runtimeAdapter: StudyRuntimeAdapterKind,
): readonly StudySurfacePlanEntry[] {
  const recommended = new Set(getRecommendedSurfaces(classification))
  const disallowedWithoutRuntime = new Set(getDisallowedSurfacesWithoutRuntime())
  const hasRunnableRuntime = runtimeAdapter === 'exact' || runtimeAdapter === 'hybrid'

  return Object.keys(STUDY_SURFACE_REGISTRY).map(surfaceId => {
    const id = surfaceId as StudySurfaceId
    if (disallowedWithoutRuntime.has(id) && !hasRunnableRuntime) {
      return {
        id,
        enabled: false,
        omissionReason: 'implies-false-interactivity',
      }
    }

    return {
      id,
      enabled: recommended.has(id),
      omissionReason: recommended.has(id) ? undefined : 'weak-component-fit',
    }
  })
}
