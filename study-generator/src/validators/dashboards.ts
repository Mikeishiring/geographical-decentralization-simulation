import type {
  StudyArtifactKind,
  StudyPackageFrame,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import {
  getDashboardPatternDescriptor,
  runtimeSupportsDashboardPattern,
} from '../../../packages/study-schema/src/index.ts'
import { buildFinding, buildGate, indexArtifacts, indexClaims } from './shared.ts'

const CHART_ARTIFACT_KINDS = new Set<StudyArtifactKind>(['dataset', 'figure', 'table', 'runtime-output'])

export function validateChartsGrounded(study: StudyPackageFrame): ValidationGateResult {
  const findings = []
  const artifacts = indexArtifacts(study)
  const claims = indexClaims(study)
  const metricIds = new Set(study.dashboardMetrics.map(metric => metric.id))

  for (const dashboard of study.dashboards) {
    if (!runtimeSupportsDashboardPattern(study.runtime.adapter, dashboard.pattern)) {
      findings.push(
        buildFinding(
          'error',
          'dashboards.runtime.unsupported',
          `Dashboard "${dashboard.id}" uses pattern "${dashboard.pattern}" which is not supported by runtime adapter "${study.runtime.adapter}".`,
          `dashboards.${dashboard.id}.pattern`,
        ),
      )
    }

    const descriptor = getDashboardPatternDescriptor(dashboard.pattern)
    for (const requiredKind of descriptor.minimumArtifactKinds) {
      const hasKind = dashboard.sourceArtifactIds.some(artifactId => artifacts.get(artifactId)?.kind === requiredKind)
      if (!hasKind) {
        findings.push(
          buildFinding(
            'error',
            'dashboards.artifacts.kind-missing',
            `Dashboard "${dashboard.id}" is missing required artifact kind "${requiredKind}" for pattern "${dashboard.pattern}".`,
            `dashboards.${dashboard.id}.sourceArtifactIds`,
          ),
        )
      }
    }

    for (const metricId of dashboard.metricIds) {
      if (!metricIds.has(metricId)) {
        findings.push(
          buildFinding(
            'error',
            'dashboards.metrics.unknown',
            `Dashboard "${dashboard.id}" references unknown metric "${metricId}".`,
            `dashboards.${dashboard.id}.metricIds`,
          ),
        )
      }
    }

    for (const artifactId of dashboard.sourceArtifactIds) {
      const artifact = artifacts.get(artifactId)
      if (!artifact) {
        findings.push(
          buildFinding(
            'error',
            'dashboards.artifacts.unknown',
            `Dashboard "${dashboard.id}" references unknown artifact "${artifactId}".`,
            `dashboards.${dashboard.id}.sourceArtifactIds`,
          ),
        )
        continue
      }

      if (!CHART_ARTIFACT_KINDS.has(artifact.kind)) {
        findings.push(
          buildFinding(
            'warning',
            'dashboards.artifacts.weak-kind',
            `Dashboard "${dashboard.id}" uses artifact "${artifactId}" of kind "${artifact.kind}", which is unusual for chart grounding.`,
            `dashboards.${dashboard.id}.sourceArtifactIds`,
          ),
        )
      }
    }

    for (const claimId of dashboard.claimIds) {
      if (!claims.has(claimId)) {
        findings.push(
          buildFinding(
            'error',
            'dashboards.claims.unknown',
            `Dashboard "${dashboard.id}" references unknown claim "${claimId}".`,
            `dashboards.${dashboard.id}.claimIds`,
          ),
        )
      }
    }
  }

  return buildGate('charts-grounded', findings)
}
