import type {
  ResultsWarehouseMetadata,
  ResultsWarehouseQueryResult,
  WarehouseTableMeta,
} from './results-warehouse'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

export type TableMeta = WarehouseTableMeta

export async function fetchResultsWarehouseMetadata(options: {
  readonly currentJobId?: string | null
} = {}): Promise<ResultsWarehouseMetadata> {
  const params = new URLSearchParams()
  if (options.currentJobId?.trim()) {
    params.set('currentJobId', options.currentJobId.trim())
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const response = await fetch(`${API_BASE}/results-warehouse/meta${suffix}`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as Record<string, unknown>
    throw new Error(typeof body.error === 'string' ? body.error : 'Failed to load results warehouse metadata.')
  }
  return await response.json() as ResultsWarehouseMetadata
}

export async function executeResultsWarehouseQuery(input: {
  readonly sql: string
  readonly currentJobId?: string | null
  readonly maxRows?: number
}): Promise<ResultsWarehouseQueryResult> {
  const response = await fetch(`${API_BASE}/results-warehouse/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: input.sql,
      currentJobId: input.currentJobId ?? null,
      maxRows: input.maxRows ?? null,
    }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as Record<string, unknown>
    throw new Error(typeof body.error === 'string' ? body.error : 'Failed to execute results warehouse query.')
  }
  return await response.json() as ResultsWarehouseQueryResult
}
