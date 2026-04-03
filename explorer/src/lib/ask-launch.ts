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

export const askLaunchContextSchema = z.object({
  source: z.enum(['workflow', 'query-workbench']).optional(),
  workflowId: z.string().optional(),
  routeHint: askLaunchRouteSchema.optional(),
  structuredQuery: askLaunchStructuredQuerySchema.optional(),
})

export type AskLaunchContext = z.infer<typeof askLaunchContextSchema>
