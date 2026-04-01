import type {
  StudyArtifactKind,
  StudyDashboardPattern,
  StudyRuntimeAdapterKind,
} from './schema'
import type { StudyClassification } from './quality'

export interface DashboardPatternDescriptor {
  readonly pattern: StudyDashboardPattern
  readonly title: string
  readonly description: string
  readonly minimumArtifactKinds: readonly StudyArtifactKind[]
  readonly recommendedFor: readonly StudyClassification[]
  readonly supportsFigureReplay: boolean
  readonly requiresRunnableRuntime: boolean
}

export const STUDY_DASHBOARD_PATTERN_REGISTRY: Readonly<
  Record<StudyDashboardPattern, DashboardPatternDescriptor>
> = {
  'event-timeline': {
    pattern: 'event-timeline',
    title: 'Event Timeline',
    description: 'Annotate a regime change or intervention window with supporting metrics and claims.',
    minimumArtifactKinds: ['dataset'],
    recommendedFor: ['empirical-event-study', 'mixed'],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'pre-post-comparison': {
    pattern: 'pre-post-comparison',
    title: 'Pre/Post Comparison',
    description: 'Compare two regimes, cohorts, or scenarios with a clear change narrative.',
    minimumArtifactKinds: ['dataset'],
    recommendedFor: ['empirical-event-study', 'empirical-observational', 'mixed'],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'timeseries-panel': {
    pattern: 'timeseries-panel',
    title: 'Timeseries Panel',
    description: 'Track one or more metrics over time, slots, rounds, or epochs.',
    minimumArtifactKinds: ['dataset'],
    recommendedFor: ['simulation', 'empirical-event-study', 'empirical-observational', 'mixed'],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'parameter-sweep': {
    pattern: 'parameter-sweep',
    title: 'Parameter Sweep',
    description: 'Show how results move across a bounded set of parameter changes or presets.',
    minimumArtifactKinds: ['dataset'],
    recommendedFor: ['simulation', 'benchmark-evaluation', 'mixed'],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'benchmark-matrix': {
    pattern: 'benchmark-matrix',
    title: 'Benchmark Matrix',
    description: 'Summarize performance or quality tradeoffs across several reported variants.',
    minimumArtifactKinds: ['dataset', 'table'],
    recommendedFor: ['benchmark-evaluation', 'simulation', 'mixed'],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'geography-map': {
    pattern: 'geography-map',
    title: 'Geography Map',
    description: 'Render geographically grounded evidence such as regions, flows, or concentration.',
    minimumArtifactKinds: ['dataset'],
    recommendedFor: ['simulation', 'empirical-observational', 'mixed'],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'evidence-board': {
    pattern: 'evidence-board',
    title: 'Evidence Board',
    description: 'Group claims, quotes, and artifacts around a single research question.',
    minimumArtifactKinds: ['figure', 'table'],
    recommendedFor: [
      'simulation',
      'empirical-event-study',
      'empirical-observational',
      'theory-mechanism',
      'benchmark-evaluation',
      'mixed',
    ],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
  'artifact-gallery': {
    pattern: 'artifact-gallery',
    title: 'Artifact Gallery',
    description: 'Provide a browsable layer for figures, appendices, notebooks, and reproducibility assets.',
    minimumArtifactKinds: ['figure'],
    recommendedFor: [
      'simulation',
      'empirical-event-study',
      'empirical-observational',
      'benchmark-evaluation',
      'mixed',
    ],
    supportsFigureReplay: true,
    requiresRunnableRuntime: false,
  },
} as const

export function getDashboardPatternDescriptor(
  pattern: StudyDashboardPattern,
): DashboardPatternDescriptor {
  return STUDY_DASHBOARD_PATTERN_REGISTRY[pattern]
}

export function runtimeSupportsDashboardPattern(
  runtimeAdapter: StudyRuntimeAdapterKind,
  pattern: StudyDashboardPattern,
): boolean {
  const descriptor = getDashboardPatternDescriptor(pattern)
  if (!descriptor.requiresRunnableRuntime) {
    return true
  }
  return runtimeAdapter === 'exact' || runtimeAdapter === 'hybrid'
}
