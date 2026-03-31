import { z } from 'zod/v4'

// --- Shared citation schema ---

export const citeSchema = z.object({
  paperSection: z.string().optional(),
  figure: z.string().optional(),
  experiment: z.enum(['baseline', 'SE1', 'SE2', 'SE3', 'SE4a', 'SE4b']).optional(),
  table: z.string().optional(),
}).optional()

// --- Individual block schemas ---

export const statBlockSchema = z.object({
  type: z.literal('stat'),
  value: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  delta: z.string().optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  cite: citeSchema,
})

export const insightBlockSchema = z.object({
  type: z.literal('insight'),
  title: z.string().optional(),
  text: z.string(),
  emphasis: z.enum(['normal', 'key-finding', 'surprising']).optional(),
  cite: citeSchema,
})

export const chartBlockSchema = z.object({
  type: z.literal('chart'),
  title: z.string(),
  data: z.array(z.object({
    label: z.string(),
    value: z.number(),
    category: z.string().optional(),
  })),
  unit: z.string().optional(),
  chartType: z.enum(['bar', 'line']).optional(),
  cite: citeSchema,
})

export const comparisonBlockSchema = z.object({
  type: z.literal('comparison'),
  title: z.string(),
  left: z.object({
    label: z.string(),
    items: z.array(z.object({ key: z.string(), value: z.string() })),
  }),
  right: z.object({
    label: z.string(),
    items: z.array(z.object({ key: z.string(), value: z.string() })),
  }),
  verdict: z.string().optional(),
  cite: citeSchema,
})

export const tableBlockSchema = z.object({
  type: z.literal('table'),
  title: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  highlight: z.array(z.number()).optional(),
  cite: citeSchema,
})

export const caveatBlockSchema = z.object({
  type: z.literal('caveat'),
  text: z.string(),
})

export const sourceBlockSchema = z.object({
  type: z.literal('source'),
  refs: z.array(z.object({
    label: z.string(),
    section: z.string().optional(),
    url: z.string().optional(),
  })),
})

export const mapBlockSchema = z.object({
  type: z.literal('map'),
  title: z.string(),
  regions: z.array(z.object({
    name: z.string(),
    lat: z.number(),
    lon: z.number(),
    value: z.number(),
    label: z.string().optional(),
  })),
  colorScale: z.enum(['density', 'change', 'binary']).optional(),
  unit: z.string().optional(),
  cite: citeSchema,
})

export const timeSeriesBlockSchema = z.object({
  type: z.literal('timeseries'),
  title: z.string(),
  series: z.array(z.object({
    label: z.string(),
    data: z.array(z.object({ x: z.number(), y: z.number() })),
    color: z.string().optional(),
  })),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  annotations: z.array(z.object({
    x: z.number(),
    label: z.string(),
  })).optional(),
  cite: citeSchema,
})

export const scatterBlockSchema = z.object({
  type: z.literal('scatter'),
  title: z.string(),
  points: z.array(z.object({
    x: z.number(),
    y: z.number(),
    label: z.string().optional(),
    category: z.string().optional(),
  })),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  unit: z.string().optional(),
  cite: citeSchema,
})

export const histogramBlockSchema = z.object({
  type: z.literal('histogram'),
  title: z.string(),
  bins: z.array(z.object({
    range: z.string(),
    count: z.number(),
    category: z.string().optional(),
  })),
  unit: z.string().optional(),
  cite: citeSchema,
})

export const heatmapBlockSchema = z.object({
  type: z.literal('heatmap'),
  title: z.string(),
  rows: z.array(z.string()),
  columns: z.array(z.string()),
  values: z.array(z.array(z.number())),
  colorScale: z.enum(['sequential', 'diverging']).optional(),
  unit: z.string().optional(),
  cite: citeSchema,
})

export const stackedBarBlockSchema = z.object({
  type: z.literal('stacked_bar'),
  title: z.string(),
  categories: z.array(z.string()),
  series: z.array(z.object({
    label: z.string(),
    values: z.array(z.number()),
    color: z.string().optional(),
  })),
  unit: z.string().optional(),
  cite: citeSchema,
})

export const equationBlockSchema = z.object({
  type: z.literal('equation'),
  latex: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  cite: citeSchema,
})

// --- Cite type export ---

export type Cite = z.infer<typeof citeSchema>

// --- Discriminated union ---

export const blockSchema = z.discriminatedUnion('type', [
  statBlockSchema,
  insightBlockSchema,
  chartBlockSchema,
  comparisonBlockSchema,
  tableBlockSchema,
  caveatBlockSchema,
  sourceBlockSchema,
  mapBlockSchema,
  timeSeriesBlockSchema,
  scatterBlockSchema,
  histogramBlockSchema,
  heatmapBlockSchema,
  stackedBarBlockSchema,
  equationBlockSchema,
])

// --- TypeScript types (inferred from schemas) ---

export type StatBlock = z.infer<typeof statBlockSchema>
export type InsightBlock = z.infer<typeof insightBlockSchema>
export type ChartBlock = z.infer<typeof chartBlockSchema>
export type ComparisonBlock = z.infer<typeof comparisonBlockSchema>
export type TableBlock = z.infer<typeof tableBlockSchema>
export type CaveatBlock = z.infer<typeof caveatBlockSchema>
export type SourceBlock = z.infer<typeof sourceBlockSchema>
export type MapBlock = z.infer<typeof mapBlockSchema>
export type TimeSeriesBlock = z.infer<typeof timeSeriesBlockSchema>
export type ScatterBlock = z.infer<typeof scatterBlockSchema>
export type HistogramBlock = z.infer<typeof histogramBlockSchema>
export type HeatmapBlock = z.infer<typeof heatmapBlockSchema>
export type StackedBarBlock = z.infer<typeof stackedBarBlockSchema>
export type EquationBlock = z.infer<typeof equationBlockSchema>
export type Block = z.infer<typeof blockSchema>

// --- Validation helper ---

export function parseBlocks(raw: unknown[]): Block[] {
  return raw.flatMap(item => {
    const result = blockSchema.safeParse(item)
    return result.success ? [result.data] : []
  })
}
