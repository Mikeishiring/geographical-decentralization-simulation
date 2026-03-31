/**
 * Geometry, projection, and data extraction helpers for the evidence map surface.
 * Extracted to keep EvidenceMapSurface.tsx under the 800-line limit.
 */
import { GCP_REGIONS, type MacroRegion } from '../../data/gcp-regions'
import { getLatency, getLatencyNormalized } from '../../data/gcp-latency'
import { PASTEL_PALETTE } from '../../lib/theme'
import type { PublishedAnalyticsPayload } from './simulation-analytics'

// ── Constants ───────────────────────────────────────────────────────────────

export const SVG_W = 960
export const SVG_H = 500

export const GCP_REGION_MAP = new Map(GCP_REGIONS.map(r => [r.id, r]))

export type OverlayMode = 'validators' | 'sources' | 'latency'

export const PASTEL = {
  lavender: PASTEL_PALETTE[0],
  sky: PASTEL_PALETTE[1],
  peach: PASTEL_PALETTE[2],
  mint: PASTEL_PALETTE[3],
  rose: PASTEL_PALETTE[4],
} as const

// ── Projection ──────────────────────────────────────────────────────────────

export function latLonToMercator(lat: number, lon: number, w: number, h: number) {
  const x = ((lon + 180) / 360) * w
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = h / 2 - (mercN / Math.PI) * (h / 2)
  return { x, y }
}

// ── Great-circle arc path ───────────────────────────────────────────────────

export function greatCircleArc(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  w: number, h: number,
  segments = 32,
): string {
  const toRad = Math.PI / 180
  const p1 = latLonToMercator(lat1, lon1, w, h)
  const p2 = latLonToMercator(lat2, lon2, w, h)

  const screenDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (screenDist < 60) {
    const mx = (p1.x + p2.x) / 2
    const my = (p1.y + p2.y) / 2
    const curvature = Math.min(screenDist * 0.2, 20)
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.PI / 2
    const cx = mx + Math.cos(angle) * curvature
    const cy = my + Math.sin(angle) * curvature
    return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }

  const lat1r = lat1 * toRad, lon1r = lon1 * toRad
  const lat2r = lat2 * toRad, lon2r = lon2 * toRad

  const d = Math.acos(
    Math.sin(lat1r) * Math.sin(lat2r) +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.cos(lon2r - lon1r),
  )

  const points: string[] = []
  for (let i = 0; i <= segments; i++) {
    const f = i / segments
    const A = d > 0.001 ? Math.sin((1 - f) * d) / Math.sin(d) : 1 - f
    const B = d > 0.001 ? Math.sin(f * d) / Math.sin(d) : f

    const x3d = A * Math.cos(lat1r) * Math.cos(lon1r) + B * Math.cos(lat2r) * Math.cos(lon2r)
    const y3d = A * Math.cos(lat1r) * Math.sin(lon1r) + B * Math.cos(lat2r) * Math.sin(lon2r)
    const z3d = A * Math.sin(lat1r) + B * Math.sin(lat2r)

    const lat = Math.atan2(z3d, Math.hypot(x3d, y3d)) / toRad
    const lon = Math.atan2(y3d, x3d) / toRad

    const proj = latLonToMercator(lat, lon, w, h)
    points.push(i === 0 ? `M${proj.x.toFixed(1)},${proj.y.toFixed(1)}` : `L${proj.x.toFixed(1)},${proj.y.toFixed(1)}`)
  }

  return points.join(' ')
}

// ── Latency color ───────────────────────────────────────────────────────────

export function latencyColor(normalized: number): string {
  if (normalized < 0.25) return '#10B981'
  if (normalized < 0.5) return '#FBBF24'
  if (normalized < 0.75) return '#F97316'
  return '#EF4444'
}

export function latencyColorGlow(normalized: number): string {
  if (normalized < 0.25) return '#10B98133'
  if (normalized < 0.5) return '#FBBF2433'
  if (normalized < 0.75) return '#F9731633'
  return '#EF444433'
}

// ── Node sizing + color ─────────────────────────────────────────────────────

export function nodeRadius(count: number, maxCount: number): number {
  const normalized = Math.max(count / Math.max(maxCount, 1), 0.03)
  return 4 + Math.sqrt(normalized) * 12
}

export function nodeColor(count: number, maxCount: number): string {
  const t = Math.min(count / Math.max(maxCount, 1), 1)
  if (t < 0.1) return '#64748B'
  if (t < 0.3) return PASTEL.sky!
  if (t < 0.6) return PASTEL.lavender!
  return PASTEL.peach!
}

// ── Slot data extraction ────────────────────────────────────────────────────

export interface RegionNode {
  readonly id: string
  readonly lat: number
  readonly lon: number
  readonly city: string
  readonly macroRegion: MacroRegion
  readonly count: number
  readonly x: number
  readonly y: number
}

export function getSlotRegionNodes(payload: PublishedAnalyticsPayload, slot: number): readonly RegionNode[] {
  const raw = payload.slots?.[String(slot)] ?? []
  return raw
    .filter(([, count]) => Number(count) > 0)
    .map(([regionId, count]) => {
      const gcpRegion = GCP_REGION_MAP.get(regionId)
      if (!gcpRegion) return null
      const { x, y } = latLonToMercator(gcpRegion.lat, gcpRegion.lon, SVG_W, SVG_H)
      return { id: regionId, lat: gcpRegion.lat, lon: gcpRegion.lon, city: gcpRegion.city, macroRegion: gcpRegion.macroRegion, count: Number(count), x, y }
    })
    .filter((r): r is RegionNode => r !== null)
    .toSorted((a, b) => a.count - b.count)
}

export function getSourceNodes(payload: PublishedAnalyticsPayload): readonly RegionNode[] {
  const sources = (payload as { sources?: readonly (readonly [string, string])[] }).sources
  if (!sources) return []

  const counts = new Map<string, number>()
  for (const [, regionId] of sources) {
    counts.set(regionId, (counts.get(regionId) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([regionId, count]) => {
      const gcpRegion = GCP_REGION_MAP.get(regionId)
      if (!gcpRegion) return null
      const { x, y } = latLonToMercator(gcpRegion.lat, gcpRegion.lon, SVG_W, SVG_H)
      return { id: regionId, lat: gcpRegion.lat, lon: gcpRegion.lon, city: gcpRegion.city, macroRegion: gcpRegion.macroRegion, count, x, y }
    })
    .filter((r): r is RegionNode => r !== null)
    .toSorted((a, b) => a.count - b.count)
}

// ── Latency arcs ────────────────────────────────────────────────────────────

export interface LatencyArc {
  readonly path: string
  readonly ms: number
  readonly normalized: number
  readonly fromId: string
  readonly toId: string
}

export function buildLatencyArcs(nodes: readonly RegionNode[], maxArcs = 30): readonly LatencyArc[] {
  if (nodes.length < 2) return []

  const topNodes = [...nodes].toSorted((a, b) => b.count - a.count).slice(0, 12)
  const arcs: LatencyArc[] = []

  for (let i = 0; i < topNodes.length; i++) {
    for (let j = i + 1; j < topNodes.length; j++) {
      const a = topNodes[i]!
      const b = topNodes[j]!
      const ms = getLatency(a.id, b.id)
      const norm = getLatencyNormalized(a.id, b.id)
      if (ms == null || norm == null) continue

      arcs.push({
        path: greatCircleArc(a.lat, a.lon, b.lat, b.lon, SVG_W, SVG_H),
        ms,
        normalized: norm,
        fromId: a.id,
        toId: b.id,
      })
    }
  }

  return arcs
    .toSorted((a, b) => b.ms - a.ms)
    .slice(0, maxArcs)
}

// ── Tooltip type ────────────────────────────────────────────────────────────

export interface TooltipData {
  readonly x: number
  readonly y: number
  readonly city: string
  readonly id: string
  readonly count: number
  readonly rank: number
  readonly total: number
  readonly macroRegion: MacroRegion
}
