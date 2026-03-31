import { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Layers, Radio, Zap } from 'lucide-react'
import { DARK_SURFACE, PASTEL_PALETTE, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { WORLD_PATHS } from '../../data/world-paths'
import { GCP_REGIONS, type MacroRegion } from '../../data/gcp-regions'
import { getLatency, getLatencyNormalized, LATENCY_MIN, LATENCY_MAX } from '../../data/gcp-latency'
import {
  totalSlotsFromPayload,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import { formatNumber } from './simulation-constants'

// ── Constants ───────────────────────────────────────────────────────────────

const SVG_W = 960
const SVG_H = 500
const GCP_REGION_MAP = new Map(GCP_REGIONS.map(r => [r.id, r]))

type OverlayMode = 'validators' | 'sources' | 'latency'

const PASTEL = {
  lavender: PASTEL_PALETTE[0],
  sky: PASTEL_PALETTE[1],
  peach: PASTEL_PALETTE[2],
  mint: PASTEL_PALETTE[3],
  rose: PASTEL_PALETTE[4],
} as const

// ── Projection ──────────────────────────────────────────────────────────────

function latLonToMercator(lat: number, lon: number, w: number, h: number) {
  const x = ((lon + 180) / 360) * w
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = h / 2 - (mercN / Math.PI) * (h / 2)
  return { x, y }
}

// ── Great-circle arc path ───────────────────────────────────────────────────

function greatCircleArc(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  w: number, h: number,
  segments = 32,
): string {
  const toRad = Math.PI / 180
  const p1 = latLonToMercator(lat1, lon1, w, h)
  const p2 = latLonToMercator(lat2, lon2, w, h)

  // If points are close, just use a curved bezier
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

  // Interpolate along great circle, project each point
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

function latencyColor(normalized: number): string {
  // Green (fast) → Yellow → Orange → Red (slow)
  if (normalized < 0.25) return '#10B981'
  if (normalized < 0.5) return '#FBBF24'
  if (normalized < 0.75) return '#F97316'
  return '#EF4444'
}

function latencyColorGlow(normalized: number): string {
  if (normalized < 0.25) return '#10B98133'
  if (normalized < 0.5) return '#FBBF2433'
  if (normalized < 0.75) return '#F9731633'
  return '#EF444433'
}

// ── Slot data extraction ────────────────────────────────────────────────────

interface RegionNode {
  readonly id: string
  readonly lat: number
  readonly lon: number
  readonly city: string
  readonly macroRegion: MacroRegion
  readonly count: number
  readonly x: number
  readonly y: number
}

function getSlotRegionNodes(payload: PublishedAnalyticsPayload, slot: number): readonly RegionNode[] {
  const raw = payload.slots?.[String(slot)] ?? []
  return raw
    .filter(([, count]) => Number(count) > 0)
    .map(([regionId, count]) => {
      const gcpRegion = GCP_REGION_MAP.get(regionId)
      if (!gcpRegion) return null
      const { x, y } = latLonToMercator(gcpRegion.lat, gcpRegion.lon, SVG_W, SVG_H)
      return {
        id: regionId,
        lat: gcpRegion.lat,
        lon: gcpRegion.lon,
        city: gcpRegion.city,
        macroRegion: gcpRegion.macroRegion,
        count: Number(count),
        x,
        y,
      }
    })
    .filter((r): r is RegionNode => r !== null)
    .toSorted((a, b) => a.count - b.count) // back-to-front rendering
}

function getSourceNodes(payload: PublishedAnalyticsPayload): readonly RegionNode[] {
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
      return {
        id: regionId,
        lat: gcpRegion.lat,
        lon: gcpRegion.lon,
        city: gcpRegion.city,
        macroRegion: gcpRegion.macroRegion,
        count,
        x,
        y,
      }
    })
    .filter((r): r is RegionNode => r !== null)
    .toSorted((a, b) => a.count - b.count)
}

// ── Latency arcs between active regions ─────────────────────────────────────

interface LatencyArc {
  readonly path: string
  readonly ms: number
  readonly normalized: number
  readonly fromId: string
  readonly toId: string
}

function buildLatencyArcs(nodes: readonly RegionNode[], maxArcs = 30): readonly LatencyArc[] {
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
    .toSorted((a, b) => b.ms - a.ms) // highest latency first (drawn behind)
    .slice(0, maxArcs)
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipData {
  readonly x: number
  readonly y: number
  readonly city: string
  readonly id: string
  readonly count: number
  readonly rank: number
  readonly total: number
  readonly macroRegion: MacroRegion
}

// ── Node sizing ─────────────────────────────────────────────────────────────

function nodeRadius(count: number, maxCount: number): number {
  const normalized = Math.max(count / Math.max(maxCount, 1), 0.03)
  return 4 + Math.sqrt(normalized) * 12
}

function nodeColor(count: number, maxCount: number): string {
  const t = Math.min(count / Math.max(maxCount, 1), 1)
  if (t < 0.1) return '#64748B'
  if (t < 0.3) return PASTEL.sky
  if (t < 0.6) return PASTEL.lavender
  return PASTEL.peach
}

// ── Main component ──────────────────────────────────────────────────────────

interface EvidenceMapSurfaceProps {
  readonly payload: PublishedAnalyticsPayload
  readonly className?: string
}

export function EvidenceMapSurface({ payload, className }: EvidenceMapSurfaceProps) {
  const idPrefix = useId()
  const totalSlots = totalSlotsFromPayload(payload)
  const lastSlot = Math.max(0, totalSlots - 1)

  // ── State ──
  const [slot, setSlot] = useState(lastSlot)
  const [playing, setPlaying] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('validators')
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Playback ──
  const stepSize = Math.max(1, Math.ceil(totalSlots / 200)) // ~200 frames max

  useEffect(() => {
    if (!playing) {
      if (playRef.current) clearInterval(playRef.current)
      playRef.current = null
      return
    }
    playRef.current = setInterval(() => {
      setSlot(prev => {
        const next = prev + stepSize
        if (next >= lastSlot) {
          setPlaying(false)
          return lastSlot
        }
        return next
      })
    }, 60)
    return () => { if (playRef.current) clearInterval(playRef.current) }
  }, [playing, stepSize, lastSlot])

  const onPlay = useCallback(() => {
    if (slot >= lastSlot) setSlot(0)
    setPlaying(true)
  }, [slot, lastSlot])

  const onPause = useCallback(() => setPlaying(false), [])
  const onReset = useCallback(() => { setPlaying(false); setSlot(lastSlot) }, [lastSlot])

  // ── Data ──
  const validatorNodes = useMemo(() => getSlotRegionNodes(payload, slot), [payload, slot])
  const sourceNodes = useMemo(() => getSourceNodes(payload), [payload])
  const displayNodes = overlay === 'sources' ? sourceNodes : validatorNodes
  const maxCount = Math.max(...displayNodes.map(n => n.count), 1)
  const totalValidators = displayNodes.reduce((sum, n) => sum + n.count, 0)

  const latencyArcs = useMemo(
    () => overlay === 'latency' ? buildLatencyArcs(validatorNodes) : [],
    [overlay, validatorNodes],
  )

  const sorted = useMemo(
    () => [...displayNodes].toSorted((a, b) => b.count - a.count),
    [displayNodes],
  )

  // ── Metrics at current slot ──
  const metrics = payload.metrics ?? {}
  const gini = metrics.gini?.[slot]
  const hhi = metrics.hhi?.[slot]
  const clusters = metrics.clusters?.[slot]
  const distance = metrics.total_distance?.[slot]

  // ── Tooltip position ──
  const tooltipStyle = useMemo(() => {
    if (!tooltip) return {}
    const xPct = (tooltip.x / SVG_W) * 100
    const yPct = (tooltip.y / SVG_H) * 100
    const flipBelow = yPct < 15
    return {
      left: `clamp(5%, ${xPct}%, 95%)`,
      top: flipBelow ? `${yPct + 3}%` : `${yPct}%`,
      transform: flipBelow ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))',
    }
  }, [tooltip])

  const handleHover = useCallback((data: TooltipData | null) => {
    setTooltip(data)
    setHoveredRegion(data?.id ?? null)
  }, [])

  const progress = lastSlot > 0 ? (slot / lastSlot) * 100 : 100

  return (
    <div className={cn('overflow-hidden rounded-xl border border-rule bg-white', className)}>
      {/* ── Header ── */}
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent dot-pulse" />
              <h3 className="text-sm font-medium text-text-primary">
                Validator geography
              </h3>
            </div>
            <p className="mt-0.5 text-2xs text-muted pl-[18px]">
              {overlay === 'latency'
                ? `Inter-region latency arcs (${LATENCY_MIN.toFixed(0)}–${LATENCY_MAX.toFixed(0)} ms). Color = round-trip time.`
                : overlay === 'sources'
                  ? 'Information source placement across GCP regions.'
                  : `${displayNodes.length} active regions · ${totalValidators.toLocaleString()} validators at slot ${(slot + 1).toLocaleString()}`}
            </p>
          </div>

          {/* Overlay mode toggle */}
          <div className="flex items-center rounded-full border border-rule bg-surface-active p-0.5 gap-0.5">
            {([
              { mode: 'validators' as const, icon: Radio, label: 'Validators' },
              { mode: 'latency' as const, icon: Zap, label: 'Latency' },
              { mode: 'sources' as const, icon: Layers, label: 'Sources' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setOverlay(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  overlay === mode
                    ? 'bg-white text-accent shadow-sm'
                    : 'text-muted hover:text-text-primary',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Map + Sidebar ── */}
      <div className="grid gap-0 lg:grid-cols-[1fr_240px]">
        {/* SVG Map */}
        <div className="relative overflow-hidden" style={{ aspectRatio: `${SVG_W} / ${SVG_H}`, backgroundColor: DARK_SURFACE.bg }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Validator geography map"
          >
            <defs>
              <radialGradient id={`${idPrefix}-bg`} cx="42%" cy="38%" r="68%">
                <stop offset="0%" stopColor={DARK_SURFACE.gradientTop} />
                <stop offset="100%" stopColor={DARK_SURFACE.gradientMid} />
              </radialGradient>
              <radialGradient id={`${idPrefix}-atmos`} cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="75%" stopColor="transparent" />
                <stop offset="100%" stopColor={DARK_SURFACE.gradientBot} stopOpacity={0.7} />
              </radialGradient>
              <filter id={`${idPrefix}-glow`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
              </filter>
              <filter id={`${idPrefix}-arc-glow`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
              </filter>
            </defs>

            {/* Background */}
            <rect width={SVG_W} height={SVG_H} fill={`url(#${idPrefix}-bg)`} />

            {/* Graticule */}
            {[-60, -30, 0, 30, 60].map(lat => {
              const { y } = latLonToMercator(lat, 0, SVG_W, SVG_H)
              return (
                <g key={`lat-${lat}`}>
                  <line x1={0} y1={y} x2={SVG_W} y2={y} stroke={DARK_SURFACE.graticule} strokeWidth={0.5} strokeDasharray={lat === 0 ? 'none' : '3 6'} />
                  <text x={10} y={y - 3} fill={DARK_SURFACE.labelText} fontSize="7" fontFamily="var(--font-mono)" opacity={0.6}>
                    {Math.abs(lat)}°{lat >= 0 ? 'N' : 'S'}
                  </text>
                </g>
              )
            })}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(lon => {
              const { x } = latLonToMercator(0, lon, SVG_W, SVG_H)
              return <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={SVG_H} stroke={DARK_SURFACE.graticule} strokeWidth={0.5} strokeDasharray="3 6" />
            })}

            {/* Country outlines */}
            {WORLD_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={DARK_SURFACE.worldFill}
                stroke={DARK_SURFACE.worldStroke}
                strokeWidth={0.4}
                strokeLinejoin="round"
                opacity={0.9}
              />
            ))}

            {/* Ambient glow behind top 3 regions */}
            {sorted.slice(0, 3).map((node, i) => (
              <circle
                key={`glow-${node.id}`}
                cx={node.x} cy={node.y} r={50}
                fill={[PASTEL.sky, PASTEL.lavender, PASTEL.peach][i] ?? PASTEL.sky}
                fillOpacity={0.05}
                filter={`url(#${idPrefix}-glow)`}
              />
            ))}

            {/* Atmospheric vignette */}
            <rect width={SVG_W} height={SVG_H} fill={`url(#${idPrefix}-atmos)`} />

            {/* ── Latency arcs layer ── */}
            {overlay === 'latency' && latencyArcs.map((arc, i) => {
              const color = latencyColor(arc.normalized)
              const glowColor = latencyColorGlow(arc.normalized)
              return (
                <g key={`arc-${arc.fromId}-${arc.toId}`}>
                  {/* Glow underneath */}
                  <motion.path
                    d={arc.path}
                    fill="none"
                    stroke={glowColor}
                    strokeWidth={3}
                    filter={`url(#${idPrefix}-arc-glow)`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ ...SPRING_SOFT, delay: i * 0.02 }}
                  />
                  {/* Main arc */}
                  <motion.path
                    d={arc.path}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.2 + (1 - arc.normalized) * 0.8}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.7 }}
                    transition={{ ...SPRING_SOFT, delay: i * 0.02 }}
                  />
                  {/* Latency label at midpoint */}
                  {i < 10 && (() => {
                    const fromRegion = GCP_REGION_MAP.get(arc.fromId)
                    const toRegion = GCP_REGION_MAP.get(arc.toId)
                    if (!fromRegion || !toRegion) return null
                    const mid = latLonToMercator(
                      (fromRegion.lat + toRegion.lat) / 2,
                      (fromRegion.lon + toRegion.lon) / 2,
                      SVG_W, SVG_H,
                    )
                    return (
                      <motion.text
                        x={mid.x} y={mid.y - 6}
                        textAnchor="middle"
                        fill={color}
                        fontSize="7"
                        fontFamily="var(--font-mono)"
                        fontWeight={600}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.8 }}
                        transition={{ delay: 0.3 + i * 0.02 }}
                      >
                        {arc.ms.toFixed(0)} ms
                      </motion.text>
                    )
                  })()}
                </g>
              )
            })}

            {/* ── Nearest-neighbor edges (validators/sources mode) ── */}
            {overlay !== 'latency' && displayNodes.length > 1 && (() => {
              const edges: Array<{ path: string; va: number; vb: number; color: string }> = []
              const N = Math.min(3, displayNodes.length - 1)
              for (const p of displayNodes) {
                const distances = displayNodes
                  .filter(q => q.id !== p.id)
                  .map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
                  .toSorted((a, b) => a.d - b.d)
                  .slice(0, N)
                for (const { q } of distances) {
                  if (p.id < q.id) {
                    const mx = (p.x + q.x) / 2
                    const my = (p.y + q.y) / 2
                    const dist = Math.hypot(q.x - p.x, q.y - p.y)
                    const curvature = Math.min(dist * 0.15, 30)
                    const angle = Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2
                    const cx = mx + Math.cos(angle) * curvature
                    const cy = my + Math.sin(angle) * curvature
                    const path = `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`
                    edges.push({
                      path,
                      va: p.count,
                      vb: q.count,
                      color: overlay === 'sources' ? PASTEL.mint : PASTEL.sky,
                    })
                  }
                }
              }
              return edges.map((e, i) => (
                <motion.path
                  key={`edge-${i}`}
                  d={e.path}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={0.7}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.12 + ((e.va + e.vb) / (2 * maxCount)) * 0.18 }}
                  transition={{ ...SPRING_SOFT, delay: 0.3 + i * 0.005 }}
                />
              ))
            })()}

            {/* ── Region nodes ── */}
            {displayNodes.map((node, index) => {
              const r = nodeRadius(node.count, maxCount)
              const color = overlay === 'sources' ? PASTEL.mint : nodeColor(node.count, maxCount)
              const isTop = sorted.indexOf(node) < 6
              const rank = sorted.findIndex(n => n.id === node.id)
              const isHovered = hoveredRegion === node.id

              return (
                <g key={node.id}>
                  {/* Breathing halo for top regions */}
                  {isTop && (
                    <circle cx={node.x} cy={node.y} r={r * 2.8} fill="none" stroke={color} strokeWidth={0.4} opacity={0.15}>
                      <animate
                        attributeName="r"
                        values={`${(r * 2.5).toFixed(1)};${(r * 3.5).toFixed(1)};${(r * 2.5).toFixed(1)}`}
                        dur={`${4 + index * 0.2}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.05;0.15;0.05"
                        dur={`${4 + index * 0.2}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Outer glow */}
                  <motion.circle
                    cx={node.x} cy={node.y}
                    r={r * 2.2}
                    fill={color}
                    fillOpacity={isHovered ? 0.2 : 0.08}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_SOFT, delay: 0.1 + index * 0.008 }}
                  />

                  {/* Core node */}
                  <motion.circle
                    cx={node.x} cy={node.y}
                    r={r}
                    fill={color}
                    stroke={isTop ? 'rgba(255,255,255,0.45)' : 'rgba(180,200,220,0.15)'}
                    strokeWidth={isTop ? 0.8 : 0.4}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: isHovered ? 1.25 : 1, opacity: 0.9 }}
                    transition={{ ...SPRING_SNAPPY, delay: 0.1 + index * 0.008 }}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => handleHover({
                      x: node.x, y: node.y,
                      city: node.city, id: node.id,
                      count: node.count, rank,
                      total: displayNodes.length,
                      macroRegion: node.macroRegion,
                    })}
                    onMouseLeave={() => handleHover(null)}
                  />

                  {/* Label for top 5 */}
                  {rank < 5 && (
                    <motion.text
                      x={node.x} y={node.y - r - 8}
                      textAnchor="middle"
                      fill={DARK_SURFACE.subtleText}
                      fontSize="7.5"
                      fontFamily="var(--font-mono)"
                      fontWeight={500}
                      letterSpacing="0.01em"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.85 }}
                      transition={{ ...SPRING_SOFT, delay: 0.5 + index * 0.03 }}
                    >
                      {node.city.split(',')[0]}
                    </motion.text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* ── Tooltip ── */}
          <AnimatePresence>
            {tooltip && (
              <motion.div
                key="map-tooltip"
                role="tooltip"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="pointer-events-none absolute z-20"
                style={tooltipStyle}
              >
                <div className="relative rounded-lg border border-white/10 bg-[#0C1220]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
                  <div className="absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-white/10 bg-[#0C1220]/95"
                    style={{
                      bottom: (tooltip.y / SVG_H) * 100 < 15 ? 'auto' : '-5px',
                      top: (tooltip.y / SVG_H) * 100 < 15 ? '-5px' : 'auto',
                    }}
                  />
                  <div className="text-11 font-medium text-white/90">{tooltip.city}</div>
                  <div className="mt-0.5 text-[0.5625rem] font-mono text-white/40">{tooltip.id} · {tooltip.macroRegion}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {tooltip.count.toLocaleString()}
                    </span>
                    <span className="text-2xs text-white/45">
                      {overlay === 'sources' ? 'sources' : 'validators'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[0.5625rem] font-mono text-white/30">
                    #{tooltip.rank + 1} of {tooltip.total}
                    {totalValidators > 0 && ` · ${formatNumber((tooltip.count / totalValidators) * 100, 1)}%`}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Slot progress bar (bottom of map) ── */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px]">
            <div className="h-full bg-accent/60 transition-all duration-100" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="border-t border-rule p-3.5 lg:border-l lg:border-t-0 space-y-4 overflow-y-auto" style={{ maxHeight: 500 }}>
          {/* Live metrics */}
          <div>
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-2">
              Slot {(slot + 1).toLocaleString()} metrics
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gini != null && (
                <div className="rounded-lg border border-rule bg-surface-active/40 p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Gini</div>
                  <div className="text-sm font-semibold tabular-nums text-text-primary">{formatNumber(gini, 3)}</div>
                </div>
              )}
              {hhi != null && (
                <div className="rounded-lg border border-rule bg-surface-active/40 p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">HHI</div>
                  <div className="text-sm font-semibold tabular-nums text-text-primary">{formatNumber(hhi, 4)}</div>
                </div>
              )}
              {clusters != null && (
                <div className="rounded-lg border border-rule bg-surface-active/40 p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Clusters</div>
                  <div className="text-sm font-semibold tabular-nums text-text-primary">{clusters}</div>
                </div>
              )}
              {distance != null && (
                <div className="rounded-lg border border-rule bg-surface-active/40 p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Distance</div>
                  <div className="text-sm font-semibold tabular-nums text-text-primary">{distance.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* Top regions list */}
          <div>
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-2">
              Top regions
            </div>
            <div className="space-y-0.5">
              {sorted.slice(0, 6).map((node, i) => {
                const color = overlay === 'sources' ? PASTEL.mint : nodeColor(node.count, maxCount)
                const pct = ((node.count / maxCount) * 100).toFixed(0)
                const sharePct = totalValidators > 0 ? ((node.count / totalValidators) * 100).toFixed(1) : '0'
                const isHovered = hoveredRegion === node.id
                return (
                  <motion.div
                    key={node.id}
                    className={cn('group rounded-md px-1.5 py-1 transition-colors', isHovered && 'bg-surface-active')}
                    onMouseEnter={() => handleHover({
                      x: node.x, y: node.y,
                      city: node.city, id: node.id,
                      count: node.count, rank: i,
                      total: displayNodes.length,
                      macroRegion: node.macroRegion,
                    })}
                    onMouseLeave={() => handleHover(null)}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SPRING_SOFT, delay: 0.15 + i * 0.04 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs text-text-primary truncate">{node.city.split(',')[0]}</span>
                      </div>
                      <div className="flex items-baseline gap-1 shrink-0">
                        <span className="text-xs font-semibold tabular-nums text-text-primary">{node.count.toLocaleString()}</span>
                        <span className="text-[0.5625rem] text-muted">{sharePct}%</span>
                      </div>
                    </div>
                    <div className="h-[3px] rounded-full bg-surface-active mx-0.5 mt-1">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ ...SPRING_SOFT, delay: 0.25 + i * 0.05 }}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Latency legend */}
          {overlay === 'latency' && (
            <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">Latency scale</div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-2 rounded-full" style={{
                  background: 'linear-gradient(to right, #10B981, #FBBF24, #F97316, #EF4444)',
                }} />
              </div>
              <div className="flex justify-between mt-1 text-[0.5625rem] font-mono text-text-faint">
                <span>{LATENCY_MIN.toFixed(0)} ms</span>
                <span>{LATENCY_MAX.toFixed(0)} ms</span>
              </div>
            </div>
          )}

          {/* Density legend */}
          {overlay !== 'latency' && (
            <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">
                {overlay === 'sources' ? 'Source density' : 'Stake concentration'}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#64748B]" />
                  <span className="text-2xs">Low</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: overlay === 'sources' ? PASTEL.mint : PASTEL.sky }} />
                  <span className="text-2xs">Moderate</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: overlay === 'sources' ? PASTEL.mint : PASTEL.lavender }} />
                  <span className="text-2xs">High</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: overlay === 'sources' ? PASTEL.mint : PASTEL.peach }} />
                  <span className="text-2xs">Dominant</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Playback controls ── */}
      <div className="border-t border-rule px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {playing ? (
              <button onClick={onPause} className="flex items-center gap-1.5 rounded-lg border border-rule bg-surface-active px-3 py-1.5 text-xs font-medium text-text-primary hover:border-border-hover transition-colors">
                <Pause className="h-3 w-3" /> Pause
              </button>
            ) : (
              <button onClick={onPlay} className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors">
                <Play className="h-3 w-3" /> {slot >= lastSlot ? 'Replay' : 'Play'}
              </button>
            )}
            <button onClick={onReset} className="flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-muted hover:text-text-primary transition-colors">
              <RotateCcw className="h-3 w-3" /> Final
            </button>
          </div>

          {/* Scrubber */}
          <div className="flex-1 min-w-[120px]">
            <input
              type="range"
              min={0}
              max={lastSlot}
              step={stepSize}
              value={slot}
              onChange={e => { setPlaying(false); setSlot(Number(e.target.value)) }}
              className="w-full accent-accent h-1.5 cursor-pointer"
            />
          </div>

          <div className="text-xs tabular-nums text-muted shrink-0">
            <span className="font-semibold text-text-primary">{(slot + 1).toLocaleString()}</span>
            <span className="text-text-faint"> / {totalSlots.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
