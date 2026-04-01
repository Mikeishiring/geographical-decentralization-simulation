import type {
  StudyPackageFrame,
  ValidationGateResult,
} from '../../../packages/study-schema/src/index.ts'
import { buildFinding, buildGate } from './shared.ts'

export function validateRuntimeHonesty(study: StudyPackageFrame): ValidationGateResult {
  const findings = []
  const simulationSurface = study.surfaces.find(surface => surface.id === 'simulation-lab')
  const hasRunnableRuntime = study.runtime.adapter === 'exact' || study.runtime.adapter === 'hybrid'
  const claimsExactRuntime = study.generationDecision.capabilities.includes('exact-runtime')

  if (simulationSurface?.enabled && !hasRunnableRuntime) {
    findings.push(
      buildFinding(
        'error',
        'runtime.surface.false-interactivity',
        `Simulation Lab is enabled but runtime adapter "${study.runtime.adapter}" is not runnable.`,
        'surfaces.simulation-lab',
      ),
    )
  }

  if (claimsExactRuntime && !hasRunnableRuntime) {
    findings.push(
      buildFinding(
        'error',
        'runtime.capability.false-exact',
        `Generation decision claims exact runtime capability but adapter is "${study.runtime.adapter}".`,
        'generationDecision.capabilities',
      ),
    )
  }

  if (hasRunnableRuntime) {
    if (Object.keys(study.runtime.simulationPresets).length === 0) {
      findings.push(
        buildFinding(
          'warning',
          'runtime.presets.missing',
          'Runnable runtime exposes no simulation presets.',
          'runtime.simulationPresets',
        ),
      )
    }

    if (study.runtime.canonicalPrewarmConfigs.length === 0) {
      findings.push(
        buildFinding(
          'warning',
          'runtime.prewarm.missing',
          'Runnable runtime exposes no canonical prewarm configs.',
          'runtime.canonicalPrewarmConfigs',
        ),
      )
    }
  }

  return buildGate('runtime-honest', findings)
}
