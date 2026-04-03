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

export function buildWorkflowLaunchContext(
  workflow: StudyAssistantWorkflow,
  selections: WorkflowSelectionValues,
): AskLaunchContext | undefined {
  const structuredQuery = resolveWorkflowStructuredQuery(workflow, selections)
  if (!workflow.routeHint && !workflow.id && !structuredQuery) return undefined

  return {
    source: 'workflow',
    workflowId: workflow.id,
    workflowValues: selections ? { ...selections } : undefined,
    routeHint: workflow.routeHint,
    structuredQuery,
  }
}
