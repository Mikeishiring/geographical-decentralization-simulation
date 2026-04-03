import type { AskLaunchContext } from './ask-launch'
import type { StudyAssistantWorkflow } from '../studies/types'

export type WorkflowSelectionValues = Readonly<Record<string, string>> | undefined

function resolveFieldValue(
  workflow: StudyAssistantWorkflow,
  fieldId: string,
  selections: WorkflowSelectionValues,
): {
  readonly raw: string
  readonly prompt: string
} {
  const field = workflow.fields?.find(candidate => candidate.id === fieldId)
  if (!field) {
    const fallback = selections?.[fieldId] ?? ''
    return {
      raw: fallback,
      prompt: fallback,
    }
  }

  const raw = selections?.[field.id] ?? field.defaultValue ?? field.options[0]?.value ?? ''
  const option = field.options.find(candidate => candidate.value === raw)
  return {
    raw,
    prompt: option?.promptValue ?? option?.label ?? raw,
  }
}

function interpolateWorkflowTemplate(
  workflow: StudyAssistantWorkflow,
  template: string | undefined,
  selections: WorkflowSelectionValues,
  mode: 'raw' | 'prompt',
): string | undefined {
  const trimmed = template?.trim()
  if (!trimmed) return undefined

  return trimmed.replaceAll(/{{([^}]+)}}/g, (_, token: string) => {
    const resolved = resolveFieldValue(workflow, token.trim(), selections)
    return mode === 'raw' ? resolved.raw : resolved.prompt
  }).trim()
}

export function composeWorkflowPrompt(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
): string {
  const composed = interpolateWorkflowTemplate(workflow, workflow.promptTemplate, selections, 'prompt')
  return composed && composed.length > 0 ? composed : workflow.prompt
}

function resolveRawTemplateValue(
  workflow: StudyAssistantWorkflow,
  template: string | number | undefined,
  selections: WorkflowSelectionValues,
): string | number | undefined {
  if (typeof template === 'number') return template

  const resolved = interpolateWorkflowTemplate(workflow, template, selections, 'raw')?.trim()
  if (!resolved) return undefined
  if (/^-?\d+(\.\d+)?$/.test(resolved)) {
    const parsed = Number(resolved)
    if (Number.isFinite(parsed)) return parsed
  }
  return resolved
}

export function resolveWorkflowStructuredQuery(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
): AskLaunchContext['structuredQuery'] | undefined {
  const template = workflow.structuredQueryTemplate
  if (!template) return undefined

  const viewId = interpolateWorkflowTemplate(workflow, template.viewId, selections, 'raw')
  const dimensions = (template.dimensions ?? [])
    .map(value => interpolateWorkflowTemplate(workflow, value, selections, 'raw'))
    .filter((value): value is string => Boolean(value))
  const metrics = (template.metrics ?? [])
    .map(value => interpolateWorkflowTemplate(workflow, value, selections, 'raw'))
    .filter((value): value is string => Boolean(value))
  const slotValue = interpolateWorkflowTemplate(workflow, template.slot, selections, 'raw')
  const orderBy = interpolateWorkflowTemplate(workflow, template.orderBy, selections, 'raw')
  const filterEvaluation = interpolateWorkflowTemplate(workflow, template.filters?.evaluation, selections, 'raw')
  const filterParadigm = interpolateWorkflowTemplate(workflow, template.filters?.paradigm, selections, 'raw')
  const filterResult = interpolateWorkflowTemplate(workflow, template.filters?.result, selections, 'raw')

  return {
    viewId: viewId || undefined,
    dimensions: dimensions.length > 0 ? dimensions : undefined,
    metrics: metrics.length > 0 ? metrics : undefined,
    filters: filterEvaluation || filterParadigm || filterResult
      ? {
          evaluation: filterEvaluation || undefined,
          paradigm: filterParadigm || undefined,
          result: filterResult || undefined,
        }
      : undefined,
    slot: slotValue === 'initial' || slotValue === 'final' ? slotValue : undefined,
    orderBy: orderBy || undefined,
    order: template.order,
    limit: template.limit,
  }
}

export function resolveWorkflowSimulationConfig(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
): AskLaunchContext['simulationConfig'] | undefined {
  const template = workflow.simulationConfigTemplate
  if (!template) return undefined

  const pickString = (value: string | number | undefined): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined
  const pickNumber = (value: string | number | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  const resolvedBase = resolveRawTemplateValue(workflow, template.base, selections)
  const resolvedSlotTime = resolveRawTemplateValue(workflow, template.slotTime, selections)

  return {
    base: resolvedBase === 'default' || resolvedBase === 'paper-reference' ? resolvedBase : undefined,
    preset: pickString(resolveRawTemplateValue(workflow, template.preset, selections)),
    paradigm: resolveRawTemplateValue(workflow, template.paradigm, selections) === 'MSP' ? 'MSP'
      : resolveRawTemplateValue(workflow, template.paradigm, selections) === 'SSP' ? 'SSP'
      : undefined,
    distribution: (() => {
      const value = resolveRawTemplateValue(workflow, template.distribution, selections)
      return value === 'homogeneous'
        || value === 'homogeneous-gcp'
        || value === 'heterogeneous'
        || value === 'random'
        ? value
        : undefined
    })(),
    sourcePlacement: (() => {
      const value = resolveRawTemplateValue(workflow, template.sourcePlacement, selections)
      return value === 'homogeneous'
        || value === 'latency-aligned'
        || value === 'latency-misaligned'
        ? value
        : undefined
    })(),
    validators: pickNumber(resolveRawTemplateValue(workflow, template.validators, selections)),
    slots: pickNumber(resolveRawTemplateValue(workflow, template.slots, selections)),
    migrationCost: pickNumber(resolveRawTemplateValue(workflow, template.migrationCost, selections)),
    attestationThreshold: pickNumber(resolveRawTemplateValue(workflow, template.attestationThreshold, selections)),
    slotTime: resolvedSlotTime === 6 || resolvedSlotTime === 8 || resolvedSlotTime === 12 ? resolvedSlotTime : undefined,
    seed: pickNumber(resolveRawTemplateValue(workflow, template.seed, selections)),
  }
}

export function buildWorkflowLaunchContext(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
): AskLaunchContext | undefined {
  const structuredQuery = resolveWorkflowStructuredQuery(workflow, selections)
  const simulationConfig = resolveWorkflowSimulationConfig(workflow, selections)
  if (!workflow.routeHint && !workflow.id && !structuredQuery && !simulationConfig) return undefined

  return {
    source: 'workflow',
    workflowId: workflow.id,
    workflowValues: selections ? { ...selections } : undefined,
    routeHint: workflow.routeHint,
    structuredQuery,
    simulationConfig,
  }
}
