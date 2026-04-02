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

export type AskArtifactStatus = z.infer<typeof askArtifactStatusSchema>
export type AskArtifactData = z.infer<typeof askArtifactDataSchema>

export type AskDataParts = {
  readonly artifact: AskArtifactData
}

export const ASK_DATA_PART_SCHEMAS = {
  artifact: askArtifactDataSchema,
} as const
