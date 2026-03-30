const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

export type PublishedReplayNoteIntent = 'observation' | 'question' | 'theory' | 'methods'
export type PublishedReplayNoteStatus = 'open' | 'resolved'
export type PublishedReplayPaperLens = 'evidence' | 'theory' | 'methods'
export type PublishedReplayAudienceMode = 'reader' | 'reviewer' | 'researcher'

export interface PublishedReplayNoteReply {
  readonly id: string
  readonly text: string
  readonly createdAt: string
}

export interface PublishedReplayNote {
  readonly id: string
  readonly datasetPath: string
  readonly datasetLabel?: string | null
  readonly comparePath?: string | null
  readonly compareLabel?: string | null
  readonly slotIndex: number
  readonly slotNumber: number
  readonly comparisonSlotIndex?: number | null
  readonly comparisonSlotNumber?: number | null
  readonly paperLens: PublishedReplayPaperLens
  readonly audienceMode: PublishedReplayAudienceMode
  readonly intent: PublishedReplayNoteIntent
  readonly status: PublishedReplayNoteStatus
  readonly anchorKind?: 'general' | 'region' | 'metric' | 'comparison' | null
  readonly anchorKey?: string | null
  readonly anchorLabel?: string | null
  readonly note: string
  readonly replies: readonly PublishedReplayNoteReply[]
  readonly contextLabel?: string | null
  readonly createdAt: string
}

export interface ListPublishedReplayNotesRequest {
  readonly datasetPath: string
  readonly comparePath?: string | null
  readonly slotIndex: number
  readonly comparisonSlotIndex?: number | null
  readonly paperLens: PublishedReplayPaperLens
  readonly audienceMode: PublishedReplayAudienceMode
}

export interface CreatePublishedReplayNoteRequest extends ListPublishedReplayNotesRequest {
  readonly datasetLabel?: string | null
  readonly compareLabel?: string | null
  readonly slotNumber: number
  readonly comparisonSlotNumber?: number | null
  readonly intent: PublishedReplayNoteIntent
  readonly anchorKind?: 'general' | 'region' | 'metric' | 'comparison' | null
  readonly anchorKey?: string | null
  readonly anchorLabel?: string | null
  readonly note: string
  readonly contextLabel?: string | null
}

interface AddPublishedReplayNoteReplyRequest {
  readonly reply: string
}

interface UpdatePublishedReplayNoteStatusRequest {
  readonly status: PublishedReplayNoteStatus
}

async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>
  return new Error(typeof body.error === 'string' ? body.error : fallback)
}

function normalizeNote(raw: Record<string, unknown>): PublishedReplayNote | null {
  if (
    typeof raw.id !== 'string'
    || typeof raw.datasetPath !== 'string'
    || typeof raw.slotIndex !== 'number'
    || typeof raw.slotNumber !== 'number'
    || typeof raw.note !== 'string'
    || typeof raw.createdAt !== 'string'
  ) {
    return null
  }

  const paperLens = raw.paperLens
  const audienceMode = raw.audienceMode
  const intent = raw.intent
  const status = raw.status
  if (paperLens !== 'evidence' && paperLens !== 'theory' && paperLens !== 'methods') return null
  if (audienceMode !== 'reader' && audienceMode !== 'reviewer' && audienceMode !== 'researcher') return null
  if (intent !== 'observation' && intent !== 'question' && intent !== 'theory' && intent !== 'methods') return null
  if (status !== 'open' && status !== 'resolved') return null

  const replies = Array.isArray(raw.replies)
    ? raw.replies.flatMap(reply => {
        if (!reply || typeof reply !== 'object') return []
        const candidate = reply as Record<string, unknown>
        if (
          typeof candidate.id !== 'string'
          || typeof candidate.text !== 'string'
          || typeof candidate.createdAt !== 'string'
        ) {
          return []
        }
        return [{
          id: candidate.id,
          text: candidate.text,
          createdAt: candidate.createdAt,
        }]
      })
    : []

  return {
    id: raw.id,
    datasetPath: raw.datasetPath,
    datasetLabel: typeof raw.datasetLabel === 'string' ? raw.datasetLabel : null,
    comparePath: typeof raw.comparePath === 'string' ? raw.comparePath : null,
    compareLabel: typeof raw.compareLabel === 'string' ? raw.compareLabel : null,
    slotIndex: raw.slotIndex,
    slotNumber: raw.slotNumber,
    comparisonSlotIndex: typeof raw.comparisonSlotIndex === 'number' ? raw.comparisonSlotIndex : null,
    comparisonSlotNumber: typeof raw.comparisonSlotNumber === 'number' ? raw.comparisonSlotNumber : null,
    paperLens,
    audienceMode,
    intent,
    status,
    anchorKind:
      raw.anchorKind === 'region' || raw.anchorKind === 'metric' || raw.anchorKind === 'comparison' || raw.anchorKind === 'general'
        ? raw.anchorKind
        : null,
    anchorKey: typeof raw.anchorKey === 'string' ? raw.anchorKey : null,
    anchorLabel: typeof raw.anchorLabel === 'string' ? raw.anchorLabel : null,
    note: raw.note,
    replies,
    contextLabel: typeof raw.contextLabel === 'string' ? raw.contextLabel : null,
    createdAt: raw.createdAt,
  }
}

export async function listPublishedReplayNotes(
  request: ListPublishedReplayNotesRequest,
): Promise<readonly PublishedReplayNote[]> {
  const params = new URLSearchParams({
    datasetPath: request.datasetPath,
    slotIndex: String(request.slotIndex),
    paperLens: request.paperLens,
    audienceMode: request.audienceMode,
  })

  if (request.comparePath) {
    params.set('comparePath', request.comparePath)
  }
  if (typeof request.comparisonSlotIndex === 'number') {
    params.set('comparisonSlotIndex', String(request.comparisonSlotIndex))
  }

  const res = await fetch(`${API_BASE}/published-replay-notes?${params.toString()}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to load replay notes: ${res.statusText}`)
  }

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  const notes = Array.isArray(raw.notes) ? raw.notes : []
  return notes.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const normalized = normalizeNote(item as Record<string, unknown>)
    return normalized ? [normalized] : []
  })
}

export async function createPublishedReplayNote(
  request: CreatePublishedReplayNoteRequest,
): Promise<PublishedReplayNote> {
  const res = await fetch(`${API_BASE}/published-replay-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw await parseApiError(res, `Failed to save replay note: ${res.statusText}`)
  }

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  const note = raw.note && typeof raw.note === 'object'
    ? normalizeNote(raw.note as Record<string, unknown>)
    : null

  if (!note) {
    throw new Error('The replay note API returned an invalid note payload.')
  }

  return note
}

export async function addPublishedReplayNoteReply(
  noteId: string,
  request: AddPublishedReplayNoteReplyRequest,
): Promise<PublishedReplayNote> {
  const res = await fetch(`${API_BASE}/published-replay-notes/${encodeURIComponent(noteId)}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw await parseApiError(res, `Failed to save replay note reply: ${res.statusText}`)
  }

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  const note = raw.note && typeof raw.note === 'object'
    ? normalizeNote(raw.note as Record<string, unknown>)
    : null

  if (!note) {
    throw new Error('The replay note reply API returned an invalid note payload.')
  }

  return note
}

export async function updatePublishedReplayNoteStatus(
  noteId: string,
  request: UpdatePublishedReplayNoteStatusRequest,
): Promise<PublishedReplayNote> {
  const res = await fetch(`${API_BASE}/published-replay-notes/${encodeURIComponent(noteId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw await parseApiError(res, `Failed to update replay note status: ${res.statusText}`)
  }

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  const note = raw.note && typeof raw.note === 'object'
    ? normalizeNote(raw.note as Record<string, unknown>)
    : null

  if (!note) {
    throw new Error('The replay note status API returned an invalid note payload.')
  }

  return note
}
