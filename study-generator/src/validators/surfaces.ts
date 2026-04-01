import type {
  StudyPackageFrame,
  StudySurfaceId,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import { getRecommendedSurfaces } from '../../../packages/study-schema/src/index.ts'
import { buildFinding, buildGate, indexArtifacts, indexClaims } from './shared.ts'

const ALL_SURFACES: readonly StudySurfaceId[] = [
  'paper',
  'deep-dive',
  'results',
  'dashboard',
  'simulation-lab',
  'agent',
  'community',
]

export function validateSurfacesJustified(study: StudyPackageFrame): ValidationGateResult {
  const findings = []
  const claims = indexClaims(study)
  const artifacts = indexArtifacts(study)
  const enabledSurfaceIds = new Set(study.surfaces.filter(surface => surface.enabled).map(surface => surface.id))

  for (const surface of study.surfaces) {
    if (!surface.purpose.trim()) {
      findings.push(
        buildFinding(
          'error',
          'surfaces.purpose.missing',
          `Surface "${surface.id}" is missing a purpose.`,
          `surfaces.${surface.id}.purpose`,
        ),
      )
    }

    if (surface.enabled && surface.componentIds.length === 0) {
      findings.push(
        buildFinding(
          'error',
          'surfaces.components.missing',
          `Enabled surface "${surface.id}" has no declared components.`,
          `surfaces.${surface.id}.componentIds`,
        ),
      )
    }

    for (const claimId of surface.requiredClaimIds) {
      if (!claims.has(claimId)) {
        findings.push(
          buildFinding(
            'error',
            'surfaces.claims.unknown',
            `Surface "${surface.id}" requires unknown claim "${claimId}".`,
            `surfaces.${surface.id}.requiredClaimIds`,
          ),
        )
      }
    }

    for (const artifactId of surface.requiredArtifactIds) {
      if (!artifacts.has(artifactId)) {
        findings.push(
          buildFinding(
            'error',
            'surfaces.artifacts.unknown',
            `Surface "${surface.id}" requires unknown artifact "${artifactId}".`,
            `surfaces.${surface.id}.requiredArtifactIds`,
          ),
        )
      }
    }
  }

  for (const includedSurface of study.generationDecision.includedSurfaces) {
    if (!enabledSurfaceIds.has(includedSurface)) {
      findings.push(
        buildFinding(
          'error',
          'surfaces.decision.mismatch',
          `Generation decision includes surface "${includedSurface}" but no enabled surface spec exists for it.`,
          'generationDecision.includedSurfaces',
        ),
      )
    }
  }

  return buildGate('surfaces-justified', findings)
}

export function validateComponentPruning(study: StudyPackageFrame): ValidationGateResult {
  const findings = []
  const recommended = new Set(getRecommendedSurfaces(study.classification))
  const enabled = study.surfaces.filter(surface => surface.enabled)

  for (const surface of study.surfaces) {
    const omission = study.generationDecision.omittedSurfaces[surface.id]
    if (!surface.enabled && !surface.omissionReason && !omission) {
      findings.push(
        buildFinding(
          'error',
          'surfaces.omission.missing',
          `Disabled surface "${surface.id}" is missing an omission reason.`,
          `surfaces.${surface.id}.omissionReason`,
        ),
      )
    }

    if (surface.enabled && surface.omissionReason) {
      findings.push(
        buildFinding(
          'error',
          'surfaces.enabled.has-omission',
          `Enabled surface "${surface.id}" should not declare an omission reason.`,
          `surfaces.${surface.id}.omissionReason`,
        ),
      )
    }
  }

  for (const surfaceId of ALL_SURFACES) {
    if (!study.surfaces.some(surface => surface.id === surfaceId)) {
      findings.push(
        buildFinding(
          'warning',
          'surfaces.registry.incomplete',
          `Surface "${surfaceId}" is not represented in the study surface specs.`,
          'surfaces',
        ),
      )
    }
  }

  const offTemplateEnabled = enabled.filter(surface => !recommended.has(surface.id))
  if (offTemplateEnabled.length > 1) {
    findings.push(
      buildFinding(
        'warning',
        'surfaces.pruning.off-template',
        `Study enables ${offTemplateEnabled.length} non-recommended surfaces for classification "${study.classification}".`,
        'surfaces',
      ),
    )
  }

  return buildGate('component-pruning', findings)
}
