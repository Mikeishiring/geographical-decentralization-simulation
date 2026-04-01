import type {
  StudyPackageFrame,
  StudyValidationReport,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import { REQUIRED_GATES } from '../../../packages/study-schema/src/index.ts'
import { validateClaimsGrounded, validateRecommendationsLabeled } from './claims.ts'
import { validateChartsGrounded } from './dashboards.ts'
import { validateDuplicationCheck } from './duplication.ts'
import { validateSourcesAttached } from './metadata.ts'
import { validateRuntimeHonesty } from './runtime.ts'
import { validateComponentPruning, validateSurfacesJustified } from './surfaces.ts'

export function validateStudyPackage(
  study: StudyPackageFrame,
  generatedAt = new Date().toISOString(),
): StudyValidationReport {
  const gates: readonly ValidationGateResult[] = [
    validateSourcesAttached(study),
    validateClaimsGrounded(study),
    validateChartsGrounded(study),
    validateSurfacesJustified(study),
    validateRuntimeHonesty(study),
    validateRecommendationsLabeled(study),
    validateComponentPruning(study),
    validateDuplicationCheck(study),
  ]

  const missingGateIds = REQUIRED_GATES.filter(requiredGateId => !gates.some(gate => gate.id === requiredGateId))
  if (missingGateIds.length > 0) {
    throw new Error(`Validation is missing required gates: ${missingGateIds.join(', ')}`)
  }

  return {
    classification: study.classification,
    generatedAt,
    gates,
    findings: gates.flatMap(gate => gate.findings),
  }
}
