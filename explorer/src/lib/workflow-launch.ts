import type { AskLaunchContext } from './ask-launch'
import type {
  StudyAssistantWorkflow,
  StudyAssistantWorkflowField,
  StudyAssistantWorkflowPreset,
} from '../studies/types'

export type WorkflowSelectionValues = Readonly<Record<string, string>> | undefined

function buildDefaultSelections(fields: readonly StudyAssistantWorkflowField[] | undefined): Record<string, string> {
  if (!fields?.length) return {}

  return Object.fromEntries(fields.map(field => {
    const defaultValue = field.defaultValue ?? field.options[0]?.value ?? ''
    return [field.id, defaultValue]
  }))
}

export function findWorkflowPreset(
  workflow: StudyAssistantWorkflow,
  presetId: string | undefined,
): StudyAssistantWorkflowPreset | undefined {
  if (!presetId) return undefined
  return workflow.presets?.find(preset => preset.id === presetId)
}

export function resolveWorkflowSelections(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
  presetId?: string,
): Record<string, string> {
  const defaults = buildDefaultSelections(workflow.fields)
  const presetValues = findWorkflowPreset(workflow, presetId)?.values ?? {}
  return {
    ...defaults,
    ...presetValues,
    ...(selections ?? {}),
  }
}

export function buildWorkflowPresetSelections(
  workflow: StudyAssistantWorkflow,
  presetId: string | undefined,
): Record<string, string> {
  return resolveWorkflowSelections(workflow, undefined, presetId)
}

function resolveFieldValue(
  workflow: StudyAssistantWorkflow,
  fieldId: string,
  selections: WorkflowSelectionValues,
): {
  readonly raw: string
  readonly prompt: string
} {
  const field = workflow.fields?.find(candidate => candidate.id === fieldId)
  const resolveBinding = (): string | undefined => {
    for (const candidateField of workflow.fields ?? []) {
      const selected =
        selections?.[candidateField.id]
        ?? candidateField.defaultValue
        ?? candidateField.options[0]?.value
        ?? ''
      const option = candidateField.options.find(candidate => candidate.value === selected)
      const bound = option?.bindings?.[fieldId]
      if (typeof bound === 'string' && bound.trim().length > 0) {
        return bound
      }
    }
    return undefined
  }
  if (!field) {
    const bound = resolveBinding()
    if (bound) {
      return {
        raw: bound,
        prompt: bound,
      }
    }

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
  presetId?: string,
): string {
  const resolvedSelections = resolveWorkflowSelections(workflow, selections, presetId)
  const composed = interpolateWorkflowTemplate(workflow, workflow.promptTemplate, resolvedSelections, 'prompt')
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
  presetId?: string,
): AskLaunchContext['structuredQuery'] | undefined {
  const template = workflow.structuredQueryTemplate
  if (!template) return undefined
  const resolvedSelections = resolveWorkflowSelections(workflow, selections, presetId)

  const viewId = interpolateWorkflowTemplate(workflow, template.viewId, resolvedSelections, 'raw')
  const dimensions = (template.dimensions ?? [])
    .map(value => interpolateWorkflowTemplate(workflow, value, resolvedSelections, 'raw'))
    .filter((value): value is string => Boolean(value))
  const metrics = (template.metrics ?? [])
    .map(value => interpolateWorkflowTemplate(workflow, value, resolvedSelections, 'raw'))
    .filter((value): value is string => Boolean(value))
  const slotValue = interpolateWorkflowTemplate(workflow, template.slot, resolvedSelections, 'raw')
  const orderBy = interpolateWorkflowTemplate(workflow, template.orderBy, resolvedSelections, 'raw')
  const filterEvaluation = interpolateWorkflowTemplate(workflow, template.filters?.evaluation, resolvedSelections, 'raw')
  const filterParadigm = interpolateWorkflowTemplate(workflow, template.filters?.paradigm, resolvedSelections, 'raw')
  const filterResult = interpolateWorkflowTemplate(workflow, template.filters?.result, resolvedSelections, 'raw')

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
  presetId?: string,
): AskLaunchContext['simulationConfig'] | undefined {
  const template = workflow.simulationConfigTemplate
  if (!template) return undefined
  const resolvedSelections = resolveWorkflowSelections(workflow, selections, presetId)

  const pickString = (value: string | number | undefined): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined
  const pickNumber = (value: string | number | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  const resolvedBase = resolveRawTemplateValue(workflow, template.base, resolvedSelections)
  const resolvedSlotTime = resolveRawTemplateValue(workflow, template.slotTime, resolvedSelections)

  return {
    base: resolvedBase === 'default' || resolvedBase === 'paper-reference' ? resolvedBase : undefined,
    preset: pickString(resolveRawTemplateValue(workflow, template.preset, resolvedSelections)),
    paradigm: resolveRawTemplateValue(workflow, template.paradigm, resolvedSelections) === 'MSP' ? 'MSP'
      : resolveRawTemplateValue(workflow, template.paradigm, resolvedSelections) === 'SSP' ? 'SSP'
      : undefined,
    distribution: (() => {
      const value = resolveRawTemplateValue(workflow, template.distribution, resolvedSelections)
      return value === 'homogeneous'
        || value === 'homogeneous-gcp'
        || value === 'heterogeneous'
        || value === 'random'
        ? value
        : undefined
    })(),
    sourcePlacement: (() => {
      const value = resolveRawTemplateValue(workflow, template.sourcePlacement, resolvedSelections)
      return value === 'homogeneous'
        || value === 'latency-aligned'
        || value === 'latency-misaligned'
        ? value
        : undefined
    })(),
    validators: pickNumber(resolveRawTemplateValue(workflow, template.validators, resolvedSelections)),
    slots: pickNumber(resolveRawTemplateValue(workflow, template.slots, resolvedSelections)),
    migrationCost: pickNumber(resolveRawTemplateValue(workflow, template.migrationCost, resolvedSelections)),
    attestationThreshold: pickNumber(resolveRawTemplateValue(workflow, template.attestationThreshold, resolvedSelections)),
    slotTime: resolvedSlotTime === 6 || resolvedSlotTime === 8 || resolvedSlotTime === 12 ? resolvedSlotTime : undefined,
    seed: pickNumber(resolveRawTemplateValue(workflow, template.seed, resolvedSelections)),
  }
}

export function buildWorkflowLaunchContext(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
  presetId?: string,
): AskLaunchContext | undefined {
  const resolvedSelections = resolveWorkflowSelections(workflow, selections, presetId)
  const structuredQuery = resolveWorkflowStructuredQuery(workflow, resolvedSelections)
  const simulationConfig = resolveWorkflowSimulationConfig(workflow, resolvedSelections)
  if (!workflow.routeHint && !workflow.id && !structuredQuery && !simulationConfig) return undefined

  return {
    source: 'workflow',
    workflowId: workflow.id,
    workflowPresetId: presetId,
    workflowValues: Object.keys(resolvedSelections).length > 0 ? resolvedSelections : undefined,
    routeHint: workflow.routeHint,
    structuredQuery,
    simulationConfig,
  }
}
