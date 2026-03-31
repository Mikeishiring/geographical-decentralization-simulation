import type { Exploration } from './api'
import { MOCK_NOTE_EXTRAS } from '../data/mock-community-notes'

export function replyCount(exploration: Exploration): number {
  const mockReplies = MOCK_NOTE_EXTRAS[exploration.id]?.replies ?? []
  const realReplies = exploration.replies ?? []
  const realReplyIds = new Set(realReplies.map(r => r.id))
  return realReplies.length + mockReplies.filter(m => !realReplyIds.has(m.id)).length
}

/** Controversial = high engagement (replies + |votes|) but net votes near zero */
export function controversyScore(exploration: Exploration): number {
  const replies = replyCount(exploration)
  const engagement = replies + Math.abs(exploration.votes)
  const divisor = Math.abs(exploration.votes) + 1
  return (engagement * replies) / divisor
}

export function surfaceLabel(exploration: Exploration): string {
  return exploration.surface === 'simulation' ? 'Exact-run surface' : 'Paper-reading surface'
}

export function cardTitle(exploration: Exploration): string {
  return exploration.publication.published
    ? exploration.publication.title
    : exploration.query
}

export function cardSummary(exploration: Exploration): string {
  return exploration.publication.published
    ? exploration.publication.takeaway
    : `Saved interpretation: ${exploration.summary}`
}

export function cardTimestamp(exploration: Exploration): string {
  return exploration.publication.publishedAt ?? exploration.createdAt
}

export function formatTimeAgo(isoTimestamp: string): string {
  const deltaMs = Date.now() - new Date(isoTimestamp).getTime()
  const deltaMinutes = Math.floor(deltaMs / 60_000)

  if (deltaMinutes < 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays < 7) return `${deltaDays}d ago`

  const deltaWeeks = Math.floor(deltaDays / 7)
  if (deltaWeeks < 5) return `${deltaWeeks}w ago`

  const deltaMonths = Math.floor(deltaDays / 30)
  if (deltaMonths < 12) return `${deltaMonths}mo ago`

  const deltaYears = Math.floor(deltaDays / 365)
  return `${deltaYears}y ago`
}
