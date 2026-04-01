import type {
  StudyPackageFrame,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import { buildFinding, buildGate } from './shared.ts'

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

export function validateDuplicationCheck(study: StudyPackageFrame): ValidationGateResult {
  const findings = []
  const seenQuestions = new Map<string, string>()
  const seenSummaries = new Map<string, string>()

  for (const dashboard of study.dashboards) {
    const normalizedQuestion = normalizeText(dashboard.questionAnswered)
    const normalizedSummary = normalizeText(dashboard.summary)

    const priorQuestionOwner = seenQuestions.get(normalizedQuestion)
    if (priorQuestionOwner) {
      findings.push(
        buildFinding(
          'warning',
          'duplication.dashboard.question',
          `Dashboard "${dashboard.id}" duplicates the question answered by "${priorQuestionOwner}".`,
          `dashboards.${dashboard.id}.questionAnswered`,
        ),
      )
    } else {
      seenQuestions.set(normalizedQuestion, dashboard.id)
    }

    const priorSummaryOwner = seenSummaries.get(normalizedSummary)
    if (priorSummaryOwner) {
      findings.push(
        buildFinding(
          'warning',
          'duplication.dashboard.summary',
          `Dashboard "${dashboard.id}" duplicates the summary used by "${priorSummaryOwner}".`,
          `dashboards.${dashboard.id}.summary`,
        ),
      )
    } else {
      seenSummaries.set(normalizedSummary, dashboard.id)
    }
  }

  return buildGate('duplication-check', findings)
}
