import { z } from 'zod/v4'
import { blockSchema } from '../types/blocks'

export const askArtifactStatusSchema = z.enum(['loading', 'streaming', 'ready'])

export const askArtifactProvenanceSchema = z.object({
  source: z.enum(['curated', 'history', 'generated']),
  label: z.string(),
  detail: z.string(),
  canonical: z.boolean(),
  topicId: z.string().optional(),
  explorationId: z.string().optional(),
  similarityScore: z.number().optional(),
})

export const askArtifactResponseSchema = z.object({
  summary: z.string(),
  blocks: z.array(blockSchema),
  followUps: z.array(z.string()),
  model: z.string(),
  cached: z.boolean(),
  provenance: askArtifactProvenanceSchema,
})

export const askArtifactDataSchema = z.object({
  status: askArtifactStatusSchema,
  stage: z.string(),
  response: askArtifactResponseSchema,
})

export const askPlanStatusSchema = z.enum(['planned', 'active', 'ready'])
export const askPlanRouteSchema = z.enum(['orientation', 'results', 'structured-results', 'simulation-config', 'hybrid'])

export const askPlanModuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  state: z.enum(['selected', 'available']),
})

export const askPlanTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  pattern: z.string(),
  questionAnswered: z.string(),
  state: z.enum(['target', 'loaded']),
})

const askPlanQueryFilterOptionsSchema = z.object({
  evaluation: z.array(z.string()).optional(),
  paradigm: z.array(z.string()).optional(),
  result: z.array(z.string()).optional(),
})

export const askPlanQueryViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  surface: z.string().optional(),
  bestFor: z.array(z.string()).optional(),
  allowedDimensions: z.array(z.string()).optional(),
  allowedMetrics: z.array(z.string()).optional(),
  allowedOrderBy: z.array(z.string()).optional(),
  supportedSlots: z.array(z.enum(['initial', 'final'])).optional(),
  filters: askPlanQueryFilterOptionsSchema.optional(),
  executionHints: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })).optional(),
})

export const askPlanQueryRequestSchema = z.object({
  viewId: z.string().optional(),
  dimensions: z.array(z.string()),
  metrics: z.array(z.string()),
  filters: z.object({
    evaluation: z.string().optional(),
    paradigm: z.string().optional(),
    result: z.string().optional(),
  }).optional(),
  slot: z.enum(['initial', 'final']),
  orderBy: z.string().nullable().optional(),
  order: z.enum(['asc', 'desc']),
  limit: z.number().int().min(1).max(20),
  notes: z.array(z.string()),
  coerced: z.boolean(),
})

export const askPlanLaunchSchema = z.object({
  source: z.enum(['workflow', 'query-workbench']),
  label: z.string(),
  detail: z.string(),
  workflowId: z.string().optional(),
  inputs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.string(),
  })).optional(),
})

export const askPlanDataSchema = z.object({
  status: askPlanStatusSchema,
  title: z.string(),
  route: askPlanRouteSchema,
  rationale: z.string(),
  launch: askPlanLaunchSchema.optional(),
  queryView: askPlanQueryViewSchema.optional(),
  queryRequest: askPlanQueryRequestSchema.optional(),
  modules: z.array(askPlanModuleSchema),
  templates: z.array(askPlanTemplateSchema),
  nextSteps: z.array(z.string()),
})

export const askStatusPhaseSchema = z.enum(['plan', 'evidence', 'compose', 'render'])
export const askStatusStateSchema = z.enum(['active', 'done', 'error'])

export const askStatusDataSchema = z.object({
  id: z.string(),
  phase: askStatusPhaseSchema,
  state: askStatusStateSchema,
  label: z.string(),
  detail: z.string(),
  timestamp: z.number(),
})

export type AskArtifactStatus = z.infer<typeof askArtifactStatusSchema>
export type AskArtifactData = z.infer<typeof askArtifactDataSchema>
export type AskPlanData = z.infer<typeof askPlanDataSchema>
export type AskStatusData = z.infer<typeof askStatusDataSchema>

export type AskDataParts = {
  readonly artifact: AskArtifactData
  readonly plan: AskPlanData
  readonly status: AskStatusData
}

export const ASK_DATA_PART_SCHEMAS = {
  artifact: askArtifactDataSchema,
  plan: askPlanDataSchema,
  status: askStatusDataSchema,
} as const
