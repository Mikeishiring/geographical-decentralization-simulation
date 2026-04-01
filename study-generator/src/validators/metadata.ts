import type {
  StudyPackageFrame,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import { buildFinding, buildGate } from './shared.ts'

export function validateSourcesAttached(study: StudyPackageFrame): ValidationGateResult {
  const findings = []

  if (study.metadata.references.length === 0) {
    findings.push(buildFinding('error', 'metadata.references.missing', 'Study metadata has no source references.', 'metadata.references'))
  }

  if (study.artifacts.length === 0) {
    findings.push(buildFinding('error', 'artifacts.missing', 'Study package has no declared artifacts.', 'artifacts'))
  }

  for (const artifact of study.artifacts) {
    if (!artifact.url && !artifact.path) {
      findings.push(
        buildFinding(
          'warning',
          'artifacts.location.missing',
          `Artifact "${artifact.id}" has neither a URL nor a local path.`,
          `artifacts.${artifact.id}`,
        ),
      )
    }
  }

  return buildGate('sources-attached', findings)
}
