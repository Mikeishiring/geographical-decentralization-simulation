import type {
  StudyArtifactRef,
  StudyClaim,
  StudyPackageFrame,
  ValidationFinding,
  ValidationGateId,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'

export function buildFinding(
  severity: ValidationFinding['severity'],
  code: string,
  message: string,
  path?: string,
): ValidationFinding {
  return { severity, code, message, path }
}

export function buildGate(
  id: ValidationGateId,
  findings: readonly ValidationFinding[],
): ValidationGateResult {
  return {
    id,
    passed: findings.every(finding => finding.severity !== 'error'),
    findings,
  }
}

export function indexArtifacts(
  study: StudyPackageFrame,
): ReadonlyMap<string, StudyArtifactRef> {
  return new Map(study.artifacts.map(artifact => [artifact.id, artifact]))
}

export function indexClaims(
  study: StudyPackageFrame,
): ReadonlyMap<string, StudyClaim> {
  return new Map(study.claims.claims.map(claim => [claim.id, claim]))
}

export function countErrorFindings(findings: readonly ValidationFinding[]): number {
  return findings.filter(finding => finding.severity === 'error').length
}
