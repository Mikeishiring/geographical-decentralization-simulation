import { z } from 'zod/v4'

export const askLaunchRouteSchema = z.enum(['orientation', 'results', 'structured-results', 'simulation-config', 'hybrid'])

export const askLaunchStructuredQuerySchema = z.object({
  viewId: z.string().optional(),
  dimensions: z.array(z.string()).max(6).optional(),
  metrics: z.array(z.string()).max(4).optional(),
  filters: z.object({
    evaluation: z.string().optional(),
    paradigm: z.string().optional(),
    result: z.string().optional(),
  }).optional(),
  slot: z.enum(['initial', 'final']).optional(),
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(20).optional(),
})

export const askLaunchSimulationConfigSchema = z.object({
  base: z.enum(['default', 'paper-reference']).optional(),
  preset: z.string().optional(),
  paradigm: z.enum(['SSP', 'MSP']).optional(),
  distribution: z.enum(['homogeneous', 'homogeneous-gcp', 'heterogeneous', 'random']).optional(),
  sourcePlacement: z.enum(['homogeneous', 'latency-aligned', 'latency-misaligned']).optional(),
  validators: z.number().int().min(1).max(1000).optional(),
  slots: z.number().int().min(1).max(10000).optional(),
  migrationCost: z.number().min(0).max(0.02).optional(),
  attestationThreshold: z.number().gt(0).lt(1).optional(),
  slotTime: z.union([z.literal(6), z.literal(8), z.literal(12)]).optional(),
  seed: z.number().int().nonnegative().optional(),
})

export const askLaunchContextSchema = z.object({
  source: z.enum(['workflow', 'query-workbench']).optional(),
  workflowId: z.string().optional(),
  workflowPresetId: z.string().optional(),
  workflowValues: z.record(z.string(), z.string()).optional(),
  routeHint: askLaunchRouteSchema.optional(),
  structuredQuery: askLaunchStructuredQuerySchema.optional(),
  simulationConfig: askLaunchSimulationConfigSchema.optional(),
})

export type AskLaunchContext = z.infer<typeof askLaunchContextSchema>
