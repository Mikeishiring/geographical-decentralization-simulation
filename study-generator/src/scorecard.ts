import type {
  EditorialScoreEntry,
  EditorialScorecard,
  StudyPackageFrame,
  StudyValidationReport,
} from '../../packages/study-schema/src/index.ts'
import { countErrorFindings } from './validators/shared.ts'

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10))
}

export function buildEditorialScorecard(
  study: StudyPackageFrame,
  report: StudyValidationReport,
): EditorialScorecard {
  const errors = countErrorFindings(report.findings)
  const warnings = report.findings.filter(finding => finding.severity === 'warning').length
  const enabledSurfaces = study.surfaces.filter(surface => surface.enabled).length
  const groundedDashboards = study.dashboards.filter(dashboard => dashboard.sourceArtifactIds.length > 0).length

  const entries: readonly EditorialScoreEntry[] = [
    {
      dimension: 'truthfulness',
      score: clampScore(9.6 - errors * 1.6 - warnings * 0.3),
      notes: ['Penalizes unsupported claims, missing anchors, and runtime dishonesty.'],
    },
    {
      dimension: 'evidence-density',
      score: clampScore(6.8 + Math.min(3, study.claims.claims.length / 3) + Math.min(1, study.artifacts.length / 8)),
      notes: ['Rewards explicit claims, artifacts, and dashboard grounding.'],
    },
    {
      dimension: 'component-fit',
      score: clampScore(9.1 - (report.gates.find(gate => gate.id === 'surfaces-justified')?.passed ? 0 : 2)),
      notes: ['Drops when enabled surfaces are weakly justified or under-specified.'],
    },
    {
      dimension: 'narrative-clarity',
      score: clampScore(7.4 + Math.min(2, study.generationDecision.rationale.length * 0.4)),
      notes: ['Measures whether the package explains why this site shape exists.'],
    },
    {
      dimension: 'visual-usefulness',
      score: clampScore(6.5 + Math.min(3, groundedDashboards * 0.5)),
      notes: ['Rewards dashboards and visual surfaces that are grounded in real artifacts.'],
    },
    {
      dimension: 'pruning-discipline',
      score: clampScore(8.8 - Math.max(0, enabledSurfaces - study.generationDecision.includedSurfaces.length) * 0.5),
      notes: ['Penalizes extra enabled surfaces that the generation decision did not justify.'],
    },
    {
      dimension: 'terminology-accuracy',
      score: clampScore(9.2 - warnings * 0.2 - errors * 0.4),
      notes: ['Drops as claim labeling and truth boundaries degrade.'],
    },
    {
      dimension: 'interaction-usefulness',
      score: clampScore(
        6.8
        + (study.surfaces.some(surface => surface.id === 'agent' && surface.enabled) ? 1 : 0)
        + (study.surfaces.some(surface => surface.id === 'simulation-lab' && surface.enabled) ? 1 : 0),
      ),
      notes: ['Rewards grounded Q&A and bounded runtime interactivity when present.'],
    },
  ]

  const overallScore = clampScore(
    entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length,
  )

  return {
    classification: study.classification,
    overallScore,
    entries,
  }
}
