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

/** Visible portion of the SVG — crops Antarctica by clipping below ~55°S */
export const MAP_VISIBLE_H = 380

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
  return 3 + Math.pow(normalized, 0.4) * 14
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

// ── Node spreading (force-directed nudge for overlapping nodes) ─────────────

/**
 * Iteratively nudge nodes apart when they overlap on the projected SVG.
 * Preserves geographic truthfulness by capping displacement at `maxDisplace`.
 * Runs a fixed number of iterations — O(n²) per iteration but n ≤ 40 regions.
 */
export function spreadOverlappingNodes(
  nodes: readonly RegionNode[],
  maxCount: number,
  iterations = 8,
  maxDisplace = 16,
): readonly RegionNode[] {
  if (nodes.length < 2) return nodes

  // Work with mutable positions
  const positions = nodes.map(n => ({ x: n.x, y: n.y, origX: n.x, origY: n.y }))

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]!
        const b = positions[j]!
        const rA = nodeRadius(nodes[i]!.count, maxCount)
        const rB = nodeRadius(nodes[j]!.count, maxCount)
        const minDist = rA + rB + 2 // 2px minimum gap

        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)

        if (dist < minDist && dist > 0.01) {
          const overlap = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          // Push equally in opposite directions
          a.x -= nx * overlap * 0.5
          a.y -= ny * overlap * 0.5
          b.x += nx * overlap * 0.5
          b.y += ny * overlap * 0.5
        }
      }
    }
  }

  // Clamp displacement and rebuild immutable nodes
  return nodes.map((node, i) => {
    const p = positions[i]!
    const dx = Math.max(-maxDisplace, Math.min(maxDisplace, p.x - p.origX))
    const dy = Math.max(-maxDisplace, Math.min(maxDisplace, p.y - p.origY))
    const finalX = Math.max(4, Math.min(SVG_W - 4, p.origX + dx))
    const finalY = Math.max(4, Math.min(MAP_VISIBLE_H - 4, p.origY + dy))
    if (finalX === node.x && finalY === node.y) return node
    return { ...node, x: finalX, y: finalY }
  })
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

// ── Label collision avoidance ──────────────────────────────────────────────

export interface LabelPlacement {
  readonly nodeId: string
  readonly lx: number          // label center x
  readonly ly: number          // label center y
  readonly width: number       // pill width
  readonly height: number      // pill height (constant 14)
  readonly city: string        // display text
  readonly rank: number        // 0-indexed rank
  readonly anchorX: number     // node x for leader line
  readonly anchorY: number     // node y for leader line
  readonly needsLeader: boolean // true if label is displaced far from node
}

interface Rect {
  x: number   // center x
  y: number   // center y
  w: number   // half-width
  h: number   // half-height
}

function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.max(0, (a.w + b.w) - Math.abs(a.x - b.x))
  const oy = Math.max(0, (a.h + b.h) - Math.abs(a.y - b.y))
  return ox * oy
}

const LABEL_H = 14
const CHAR_WIDTH = 4.8
const LABEL_PAD = 14       // horizontal padding inside pill
const LABEL_GAP = 4        // gap between node edge and label edge
const RANK_BADGE_W = 14    // extra width for "#1" badge on top 3

function labelWidth(city: string, rank: number): number {
  const text = city.split(',')[0]!
  const base = text.length * CHAR_WIDTH + LABEL_PAD
  return rank < 3 ? base + RANK_BADGE_W : base
}

type Direction = 'above' | 'below' | 'left' | 'right' | 'above-left' | 'above-right'

function candidatePosition(
  nodeX: number, nodeY: number, nodeR: number,
  halfW: number, halfH: number,
  dir: Direction,
): { x: number; y: number } {
  const gap = LABEL_GAP + nodeR
  switch (dir) {
    case 'above':       return { x: nodeX, y: nodeY - gap - halfH }
    case 'below':       return { x: nodeX, y: nodeY + gap + halfH }
    case 'left':        return { x: nodeX - gap - halfW, y: nodeY - halfH }
    case 'right':       return { x: nodeX + gap + halfW, y: nodeY - halfH }
    case 'above-left':  return { x: nodeX - halfW * 0.6, y: nodeY - gap - halfH }
    case 'above-right': return { x: nodeX + halfW * 0.6, y: nodeY - gap - halfH }
  }
}

const DIRECTIONS: readonly Direction[] = ['above', 'above-left', 'above-right', 'right', 'left', 'below']

/**
 * Compute non-overlapping label positions for the top N nodes.
 * Uses greedy placement: for each node (highest rank first), try 6 candidate
 * positions and pick the one with minimum overlap against already-placed labels
 * and other node circles. Falls back to the least-bad option.
 */
export function computeLabelPositions(
  sortedNodes: readonly RegionNode[],
  maxCount: number,
  maxLabels = 10,
): readonly LabelPlacement[] {
  const candidates = sortedNodes.slice(0, maxLabels)
  const placed: Rect[] = []
  const result: LabelPlacement[] = []

  // Pre-compute node rects as obstacles (all nodes, not just labeled ones)
  const nodeObstacles: Rect[] = sortedNodes.map(n => {
    const r = nodeRadius(n.count, maxCount)
    return { x: n.x, y: n.y, w: r, h: r }
  })

  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i]!
    const rank = i
    const w = labelWidth(node.city, rank)
    const halfW = w / 2
    const halfH = LABEL_H / 2
    const r = nodeRadius(node.count, maxCount)

    let bestPos = { x: node.x, y: node.y - r - LABEL_GAP - halfH }
    let bestScore = Infinity

    for (const dir of DIRECTIONS) {
      const pos = candidatePosition(node.x, node.y, r, halfW, halfH, dir)

      // Penalize out-of-bounds
      const oobPenalty =
        (pos.x - halfW < 0 ? (halfW - pos.x) * 10 : 0) +
        (pos.x + halfW > SVG_W ? (pos.x + halfW - SVG_W) * 10 : 0) +
        (pos.y - halfH < 0 ? (halfH - pos.y) * 10 : 0) +
        (pos.y + halfH > MAP_VISIBLE_H ? (pos.y + halfH - MAP_VISIBLE_H) * 10 : 0)

      const rect: Rect = { x: pos.x, y: pos.y, w: halfW, h: halfH }

      // Score = total overlap with placed labels + node obstacles + out-of-bounds
      let score = oobPenalty
      for (const p of placed) {
        score += overlapArea(rect, p) * 3  // heavy penalty for label-label overlap
      }
      for (const obs of nodeObstacles) {
        if (obs.x === node.x && obs.y === node.y) continue // skip self
        score += overlapArea(rect, obs)
      }

      // Small preference for 'above' placement (most natural)
      if (dir !== 'above') score += 2

      if (score < bestScore) {
        bestScore = score
        bestPos = pos
      }
    }

    const finalRect: Rect = { x: bestPos.x, y: bestPos.y, w: halfW, h: halfH }
    placed.push(finalRect)

    const dist = Math.hypot(bestPos.x - node.x, bestPos.y - node.y)
    result.push({
      nodeId: node.id,
      lx: bestPos.x,
      ly: bestPos.y,
      width: w,
      height: LABEL_H,
      city: node.city.split(',')[0]!,
      rank,
      anchorX: node.x,
      anchorY: node.y,
      needsLeader: dist > r + LABEL_GAP + halfH + 8,
    })
  }

  return result
}
