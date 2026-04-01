export type StudyClassification =
  | 'simulation'
  | 'empirical-event-study'
  | 'empirical-observational'
  | 'theory-mechanism'
  | 'benchmark-evaluation'
  | 'mixed'

export type StudySurfaceId =
  | 'paper'
  | 'deep-dive'
  | 'results'
  | 'dashboard'
  | 'simulation-lab'
  | 'agent'
  | 'community'

export type StudyCapability =
  | 'static-reading'
  | 'figure-replay'
  | 'dataset-dashboard'
  | 'exact-runtime'
  | 'preset-comparisons'
  | 'agent-grounded-qa'
  | 'community-annotations'

export type OmissionReason =
  | 'not-supported-by-sources'
  | 'no-usable-artifact'
  | 'duplicate-of-stronger-surface'
  | 'implies-false-interactivity'
  | 'weak-component-fit'
  | 'visual-noise'

export interface StudyGenerationDecision {
  readonly includedSurfaces: readonly StudySurfaceId[]
  readonly omittedSurfaces: Readonly<Record<StudySurfaceId, OmissionReason | undefined>>
  readonly capabilities: readonly StudyCapability[]
  readonly rationale: readonly string[]
}

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationFinding {
  readonly severity: ValidationSeverity
  readonly code: string
  readonly message: string
  readonly path?: string
}

export type ValidationGateId =
  | 'sources-attached'
  | 'claims-grounded'
  | 'charts-grounded'
  | 'surfaces-justified'
  | 'runtime-honest'
  | 'recommendations-labeled'
  | 'component-pruning'
  | 'duplication-check'

export interface ValidationGateResult {
  readonly id: ValidationGateId
  readonly passed: boolean
  readonly findings: readonly ValidationFinding[]
}

export interface StudyValidationReport {
  readonly classification: StudyClassification
  readonly generatedAt: string
  readonly gates: readonly ValidationGateResult[]
  readonly findings: readonly ValidationFinding[]
}

export type EditorialScoreDimension =
  | 'truthfulness'
  | 'evidence-density'
  | 'component-fit'
  | 'narrative-clarity'
  | 'visual-usefulness'
  | 'pruning-discipline'
  | 'terminology-accuracy'
  | 'interaction-usefulness'

export interface EditorialScoreEntry {
  readonly dimension: EditorialScoreDimension
  readonly score: number
  readonly notes: readonly string[]
}

export interface EditorialScorecard {
  readonly classification: StudyClassification
  readonly overallScore: number
  readonly entries: readonly EditorialScoreEntry[]
}

export interface ScoreThresholds {
  readonly minimumOverall: number
  readonly minimumPerDimension: number
  readonly preferredPerDimension: number
}

export const DEFAULT_SCORE_THRESHOLDS: Readonly<Record<StudyClassification, ScoreThresholds>> = {
  simulation: {
    minimumOverall: 8.2,
    minimumPerDimension: 7.5,
    preferredPerDimension: 8.5,
  },
  'empirical-event-study': {
    minimumOverall: 8.3,
    minimumPerDimension: 7.7,
    preferredPerDimension: 8.6,
  },
  'empirical-observational': {
    minimumOverall: 8.1,
    minimumPerDimension: 7.5,
    preferredPerDimension: 8.4,
  },
  'theory-mechanism': {
    minimumOverall: 8.0,
    minimumPerDimension: 7.4,
    preferredPerDimension: 8.3,
  },
  'benchmark-evaluation': {
    minimumOverall: 8.2,
    minimumPerDimension: 7.6,
    preferredPerDimension: 8.5,
  },
  mixed: {
    minimumOverall: 8.2,
    minimumPerDimension: 7.6,
    preferredPerDimension: 8.5,
  },
} as const

export const REQUIRED_GATES: readonly ValidationGateId[] = [
  'sources-attached',
  'claims-grounded',
  'charts-grounded',
  'surfaces-justified',
  'runtime-honest',
  'recommendations-labeled',
  'component-pruning',
  'duplication-check',
] as const

export function getRecommendedSurfaces(
  classification: StudyClassification,
): readonly StudySurfaceId[] {
  switch (classification) {
    case 'simulation':
      return ['paper', 'deep-dive', 'results', 'simulation-lab', 'agent']
    case 'empirical-event-study':
      return ['paper', 'deep-dive', 'dashboard', 'agent']
    case 'empirical-observational':
      return ['paper', 'deep-dive', 'dashboard', 'agent']
    case 'theory-mechanism':
      return ['paper', 'deep-dive', 'agent']
    case 'benchmark-evaluation':
      return ['paper', 'deep-dive', 'results', 'agent']
    case 'mixed':
      return ['paper', 'deep-dive', 'results', 'dashboard', 'agent']
  }
}

export function getDisallowedSurfacesWithoutRuntime(): readonly StudySurfaceId[] {
  return ['simulation-lab']
}

export function passesEditorialThresholds(
  scorecard: EditorialScorecard,
  thresholds = DEFAULT_SCORE_THRESHOLDS[scorecard.classification],
): boolean {
  if (scorecard.overallScore < thresholds.minimumOverall) return false
  return scorecard.entries.every(entry => entry.score >= thresholds.minimumPerDimension)
}

export function summarizeValidationFailures(
  report: StudyValidationReport,
): readonly ValidationFinding[] {
  return report.findings.filter(finding => finding.severity === 'error')
}
