import type { Block } from '../types/blocks'
import { parseBlocks } from '../types/blocks'
import type { AskPlanData } from './ask-artifact'
import type { AskLaunchContext } from './ask-launch'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

export type ExploreSource = 'curated' | 'history' | 'generated'
export type ExplorationSurface = 'reading' | 'simulation'

export interface ExploreProvenance {
  readonly source: ExploreSource
  readonly label: string
  readonly detail: string
  readonly canonical: boolean
  readonly topicId?: string
  readonly explorationId?: string
  readonly similarityScore?: number
}

export interface ExploreResponse {
  readonly summary: string
  readonly blocks: readonly Block[]
  readonly followUps: readonly string[]
  readonly model: string
  readonly cached: boolean
  readonly provenance: ExploreProvenance
}

export interface ExploreError {
  readonly error: string
  readonly status: number
}

export interface StructuredQueryPreview {
  readonly route: 'structured-results'
  readonly description: string
  readonly queryView?: AskPlanData['queryView']
  readonly queryRequest: NonNullable<AskPlanData['queryRequest']>
  readonly response: ExploreResponse
}

export interface ApiHealth {
  readonly status: 'ok'
  readonly tools: number
  readonly simulationCopilotTools: number
  readonly anthropicEnabled: boolean
  readonly anthropicModel: string | null
  readonly envFileLoaded: boolean
  readonly simulations: {
    readonly readyWorkers: number
    readonly busyWorkers: number
    readonly queuedJobs: number
    readonly cacheEntries: number
    readonly prewarm?: {
      readonly enabled: boolean
      readonly running: boolean
      readonly startedAt: string | null
      readonly finishedAt: string | null
      readonly completed: number
      readonly total: number
      readonly lastError: string | null
    }
  }
}

export type ExploreResult =
  | { ok: true; data: ExploreResponse }
  | { ok: false; error: ExploreError }

interface HistoryEntry {
  readonly query: string
  readonly summary: string
}

async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>
  return new Error(typeof body.error === 'string' ? body.error : fallback)
}

function parseExploreResponse(raw: Record<string, unknown>): ExploreResponse {
  const blocks = parseBlocks((raw.blocks as unknown[]) ?? [])

  return {
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    blocks,
    followUps: Array.isArray(raw.followUps)
      ? raw.followUps.filter((value): value is string => typeof value === 'string')
      : [],
    model: typeof raw.model === 'string' ? raw.model : '',
    cached: typeof raw.cached === 'boolean' ? raw.cached : false,
    provenance: {
      source: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).source === 'string'
        ? ((raw.provenance as Record<string, unknown>).source as ExploreSource)
        : 'generated',
      label: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).label === 'string'
        ? ((raw.provenance as Record<string, unknown>).label as string)
        : 'Fresh response',
      detail: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).detail === 'string'
        ? ((raw.provenance as Record<string, unknown>).detail as string)
        : '',
      canonical: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).canonical === 'boolean'
        ? ((raw.provenance as Record<string, unknown>).canonical as boolean)
        : false,
      topicId: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).topicId === 'string'
        ? ((raw.provenance as Record<string, unknown>).topicId as string)
        : undefined,
      explorationId: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).explorationId === 'string'
        ? ((raw.provenance as Record<string, unknown>).explorationId as string)
        : undefined,
      similarityScore: raw.provenance && typeof raw.provenance === 'object' && typeof (raw.provenance as Record<string, unknown>).similarityScore === 'number'
        ? ((raw.provenance as Record<string, unknown>).similarityScore as number)
        : undefined,
    },
  }
}

export async function explore(
  query: string,
  history: readonly HistoryEntry[] = [],
): Promise<ExploreResult> {
  try {
    const res = await fetch(`${API_BASE}/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, history }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>
      return {
        ok: false,
        error: { error: (body.error as string) ?? res.statusText, status: res.status },
      }
    }

    const raw = await res.json().catch(() => ({})) as Record<string, unknown>

    return {
      ok: true,
      data: parseExploreResponse(raw),
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        error: err instanceof Error ? err.message : 'Network error',
        status: 0,
      },
    }
  }
}

export async function previewStructuredQuery(
  query: string,
  launch: AskLaunchContext,
): Promise<StructuredQueryPreview> {
  const res = await fetch(`${API_BASE}/explore/query-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, launch }),
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Failed to preview structured study query')
  }

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  const queryRequest = raw.queryRequest && typeof raw.queryRequest === 'object'
    ? raw.queryRequest as NonNullable<AskPlanData['queryRequest']>
    : null
  if (!queryRequest) {
    throw new Error('Structured query preview did not return a resolved query request.')
  }

  return {
    route: 'structured-results',
    description: typeof raw.description === 'string' ? raw.description : '',
    queryView: raw.queryView && typeof raw.queryView === 'object'
      ? raw.queryView as AskPlanData['queryView']
      : undefined,
    queryRequest,
    response: parseExploreResponse(
      raw.response && typeof raw.response === 'object'
        ? raw.response as Record<string, unknown>
        : {},
    ),
  }
}

export async function getApiHealth(): Promise<ApiHealth> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) {
    throw new Error(`Failed to fetch API health: ${res.statusText}`)
  }

  return await res.json() as ApiHealth
}

export async function healthCheck(): Promise<boolean> {
  try {
    await getApiHealth()
    return true
  } catch {
    return false
  }
}

// --- Exploration history ---

export interface TextAnchor {
  readonly sectionId?: string
  readonly blockId?: string
  readonly excerpt: string
  readonly viewMode?: string
}

export interface Exploration {
  readonly id: string
  readonly query: string
  readonly summary: string
  readonly blocks: readonly Block[]
  readonly followUps: readonly string[]
  readonly model: string
  readonly cached: boolean
  readonly source: 'generated'
  readonly votes: number
  readonly createdAt: string
  readonly paradigmTags: readonly string[]
  readonly experimentTags: readonly string[]
  readonly verified: boolean
  readonly surface: ExplorationSurface
  readonly anchor?: TextAnchor
  readonly replies?: readonly Reply[]
  readonly publication: {
    readonly published: boolean
    readonly title: string
    readonly takeaway: string
    readonly author: string
    readonly publishedAt: string | null
    readonly featured: boolean
    readonly editorNote: string
  }
}

interface RawExploration {
  readonly id: string
  readonly query: string
  readonly summary: string
  readonly blocks: unknown[]
  readonly followUps: string[]
  readonly model: string
  readonly cached: boolean
  readonly source: 'generated'
  readonly votes: number
  readonly createdAt: string
  readonly paradigmTags: string[]
  readonly experimentTags: string[]
  readonly verified: boolean
  readonly surface: ExplorationSurface
  readonly replies?: readonly Reply[]
  readonly publication: {
    readonly published: boolean
    readonly title: string
    readonly takeaway: string
    readonly author: string
    readonly publishedAt: string | null
    readonly featured: boolean
    readonly editorNote: string
  }
}

function parseExploration(raw: RawExploration): Exploration {
  return {
    ...raw,
    blocks: parseBlocks(raw.blocks ?? []),
    replies: Array.isArray(raw.replies)
      ? raw.replies.filter((reply): reply is Reply =>
        Boolean(reply)
        && typeof reply.id === 'string'
        && typeof reply.explorationId === 'string'
        && typeof reply.author === 'string'
        && typeof reply.body === 'string'
        && typeof reply.createdAt === 'string'
        && typeof reply.votes === 'number',
      )
      : [],
  }
}

export async function listExplorations(options?: {
  sort?: 'recent' | 'top' | 'discussed' | 'controversial'
  limit?: number
  search?: string
  publishedOnly?: boolean
  featuredOnly?: boolean
  surface?: ExplorationSurface
  verifiedOnly?: boolean
}): Promise<Exploration[]> {
  const params = new URLSearchParams()
  if (options?.sort) params.set('sort', options.sort)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.search) params.set('search', options.search)
  if (typeof options?.publishedOnly === 'boolean') params.set('published', String(options.publishedOnly))
  if (typeof options?.featuredOnly === 'boolean') params.set('featured', String(options.featuredOnly))
  if (options?.surface) params.set('surface', options.surface)
  if (typeof options?.verifiedOnly === 'boolean') params.set('verified', String(options.verifiedOnly))

  const qs = params.toString()
  const url = `${API_BASE}/explorations${qs ? `?${qs}` : ''}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Failed to list explorations: ${res.statusText}`)
  }

  const raw = (await res.json()) as RawExploration[]
  return raw.map(parseExploration)
}

export async function getExploration(id: string): Promise<Exploration> {
  const res = await fetch(`${API_BASE}/explorations/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch exploration: ${res.statusText}`)
  }
  const raw = (await res.json()) as RawExploration
  return parseExploration(raw)
}

export async function voteExploration(id: string, delta: 1 | -1): Promise<Exploration> {
  const res = await fetch(`${API_BASE}/explorations/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  })

  if (!res.ok) {
    throw new Error(`Failed to vote: ${res.statusText}`)
  }

  const raw = (await res.json()) as RawExploration
  return parseExploration(raw)
}

export async function createExploration(input: {
  query: string
  summary: string
  blocks: readonly Block[]
  followUps?: readonly string[]
  model?: string
  cached?: boolean
  surface?: ExplorationSurface
  anchor?: TextAnchor
}): Promise<Exploration> {
  const res = await fetch(`${API_BASE}/explorations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await parseApiError(res, `Failed to create exploration: ${res.statusText}`)
  }

  const raw = (await res.json()) as RawExploration
  return parseExploration(raw)
}

export async function publishExploration(
  id: string,
  input: {
    title: string
    takeaway: string
    author?: string
  },
): Promise<Exploration> {
  const res = await fetch(`${API_BASE}/explorations/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await parseApiError(res, `Failed to publish exploration: ${res.statusText}`)
  }

  const raw = (await res.json()) as RawExploration
  return parseExploration(raw)
}

export interface Reply {
  readonly id: string
  readonly explorationId: string
  readonly author: string
  readonly body: string
  readonly createdAt: string
  readonly votes: number
}

export async function addReply(explorationId: string, body: string, author?: string): Promise<Reply> {
  const res = await fetch(`${API_BASE}/explorations/${encodeURIComponent(explorationId)}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, author }),
  })
  if (!res.ok) throw await parseApiError(res, `Failed to add reply: ${res.statusText}`)
  return (await res.json()) as Reply
}

export async function voteReply(explorationId: string, replyId: string, delta: 1 | -1): Promise<Reply> {
  const res = await fetch(`${API_BASE}/explorations/${encodeURIComponent(explorationId)}/replies/${encodeURIComponent(replyId)}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  })
  if (!res.ok) throw await parseApiError(res, `Failed to vote on reply: ${res.statusText}`)
  return (await res.json()) as Reply
}
