import type {
  StudyPackageFrame,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import { buildFinding, buildGate, indexArtifacts } from './shared.ts'

export function validateClaimsGrounded(study: StudyPackageFrame): ValidationGateResult {
  const findings = []
  const artifacts = indexArtifacts(study)

  if (study.claims.claims.length === 0) {
    findings.push(buildFinding('error', 'claims.missing', 'Study package has no claims.', 'claims.claims'))
  }

  for (const claim of study.claims.claims) {
    if (claim.sourceIds.length === 0) {
      findings.push(
        buildFinding(
          'error',
          'claims.sources.missing',
          `Claim "${claim.id}" has no source bindings.`,
          `claims.${claim.id}.sourceIds`,
        ),
      )
    }

    if (claim.anchors.length === 0) {
      findings.push(
        buildFinding(
          'error',
          'claims.anchors.missing',
          `Claim "${claim.id}" has no evidence anchors.`,
          `claims.${claim.id}.anchors`,
        ),
      )
    }

    if (claim.confidence < 0 || claim.confidence > 1) {
      findings.push(
        buildFinding(
          'error',
          'claims.confidence.range',
          `Claim "${claim.id}" uses confidence ${claim.confidence}, which is outside 0-1.`,
          `claims.${claim.id}.confidence`,
        ),
      )
    }

    for (const sourceId of claim.sourceIds) {
      if (!artifacts.has(sourceId)) {
        findings.push(
          buildFinding(
            'error',
            'claims.sources.unknown',
            `Claim "${claim.id}" references unknown source artifact "${sourceId}".`,
            `claims.${claim.id}.sourceIds`,
          ),
        )
      }
    }

    for (const [anchorIndex, anchor] of claim.anchors.entries()) {
      if (anchor.artifactId && !artifacts.has(anchor.artifactId)) {
        findings.push(
          buildFinding(
            'error',
            'claims.anchors.unknown-artifact',
            `Claim "${claim.id}" anchor ${anchorIndex + 1} references unknown artifact "${anchor.artifactId}".`,
            `claims.${claim.id}.anchors.${anchorIndex}`,
          ),
        )
      }
    }
  }

  for (const featuredClaimId of study.claims.featuredClaimIds) {
    if (!study.claims.claims.some(claim => claim.id === featuredClaimId)) {
      findings.push(
        buildFinding(
          'error',
          'claims.featured.unknown',
          `Featured claim "${featuredClaimId}" is missing from the claim registry.`,
          'claims.featuredClaimIds',
        ),
      )
    }
  }

  return buildGate('claims-grounded', findings)
}

export function validateRecommendationsLabeled(
  study: StudyPackageFrame,
): ValidationGateResult {
  const findings = []

  for (const claim of study.claims.claims) {
    const requiresBoundary = claim.presentationMode === 'interpretation' || claim.evidenceType === 'inference'
    if (requiresBoundary && !claim.truthBoundary) {
      findings.push(
        buildFinding(
          'error',
          'claims.truth-boundary.missing',
          `Interpretive claim "${claim.id}" is missing a truth boundary note.`,
          `claims.${claim.id}.truthBoundary`,
        ),
      )
    }
  }

  return buildGate('recommendations-labeled', findings)
}
