import { parseBlocks, type Block } from '../types/blocks'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

export interface PublishedReplayCopilotRequest {
  readonly question: string
  readonly datasetPath: string
  readonly datasetLabel?: string | null
  readonly sourceRole?: string | null
  readonly comparePath?: string | null
  readonly compareLabel?: string | null
  readonly compareSourceRole?: string | null
  readonly focusSlot?: number | null
  readonly paperLens?: 'evidence' | 'theory' | 'methods' | null
  readonly paperSectionId?: string | null
  readonly paperSectionLabel?: string | null
  readonly paperSectionContext?: string | null
  readonly audienceMode?: 'reader' | 'reviewer' | 'researcher' | null
  readonly currentViewSummary?: string | null
  readonly viewerSnapshot?: PublishedReplayViewerSnapshotContext | null
  readonly comparisonViewerSnapshot?: PublishedReplayViewerSnapshotContext | null
}

export interface PublishedReplayViewerSnapshotContext {
  readonly slotIndex: number
  readonly slotNumber: number
  readonly totalSlots: number
  readonly stepSize: number
  readonly playing: boolean
  readonly activeRegions: number
  readonly totalValidators: number
  readonly dominantRegionId?: string | null
  readonly dominantRegionCity?: string | null
  readonly dominantRegionShare?: number | null
  readonly currentGini?: number | null
  readonly currentHhi?: number | null
  readonly currentLiveness?: number | null
  readonly currentMev?: number | null
  readonly currentProposalTime?: number | null
  readonly currentAttestation?: number | null
  readonly currentTotalDistance?: number | null
  readonly currentFailedBlockProposals?: number | null
  readonly currentClusters?: number | null
}

export interface PublishedReplayCopilotResponse {
  readonly summary: string
  readonly blocks: readonly Block[]
  readonly followUps: readonly string[]
  readonly truthBoundary: {
    readonly label: string
    readonly detail: string
  }
  readonly model: string
  readonly cached: boolean
  readonly provenance: {
    readonly source: 'generated'
    readonly label: string
    readonly detail: string
    readonly canonical: boolean
    readonly datasetPath: string
    readonly comparePath?: string
  }
}

async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>
  return new Error(typeof body.error === 'string' ? body.error : fallback)
}

export async function askPublishedReplayCopilot(
  request: PublishedReplayCopilotRequest,
): Promise<PublishedReplayCopilotResponse> {
  const res = await fetch(`${API_BASE}/published-replay-copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw await parseApiError(res, `Failed to query the published replay companion: ${res.statusText}`)
  }

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  return {
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    blocks: parseBlocks(Array.isArray(raw.blocks) ? raw.blocks : []),
    followUps: Array.isArray(raw.followUps)
      ? raw.followUps.filter((value): value is string => typeof value === 'string')
      : [],
    truthBoundary: raw.truthBoundary && typeof raw.truthBoundary === 'object'
      ? {
          label: typeof (raw.truthBoundary as Record<string, unknown>).label === 'string'
            ? (raw.truthBoundary as Record<string, unknown>).label as string
            : 'Published replay answer',
          detail: typeof (raw.truthBoundary as Record<string, unknown>).detail === 'string'
            ? (raw.truthBoundary as Record<string, unknown>).detail as string
            : '',
        }
      : {
          label: 'Published replay answer',
          detail: '',
        },
    model: typeof raw.model === 'string' ? raw.model : '',
    cached: typeof raw.cached === 'boolean' ? raw.cached : false,
    provenance: raw.provenance && typeof raw.provenance === 'object'
      ? {
          source: 'generated',
          label: typeof (raw.provenance as Record<string, unknown>).label === 'string'
            ? (raw.provenance as Record<string, unknown>).label as string
            : 'Published replay companion',
          detail: typeof (raw.provenance as Record<string, unknown>).detail === 'string'
            ? (raw.provenance as Record<string, unknown>).detail as string
            : '',
          canonical: typeof (raw.provenance as Record<string, unknown>).canonical === 'boolean'
            ? (raw.provenance as Record<string, unknown>).canonical as boolean
            : false,
          datasetPath: typeof (raw.provenance as Record<string, unknown>).datasetPath === 'string'
            ? (raw.provenance as Record<string, unknown>).datasetPath as string
            : request.datasetPath,
          comparePath: typeof (raw.provenance as Record<string, unknown>).comparePath === 'string'
            ? (raw.provenance as Record<string, unknown>).comparePath as string
            : undefined,
        }
      : {
          source: 'generated',
          label: 'Published replay companion',
          detail: '',
          canonical: false,
          datasetPath: request.datasetPath,
        },
  }
}
