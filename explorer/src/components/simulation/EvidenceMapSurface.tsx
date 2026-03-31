import { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Layers, Radio, Zap } from 'lucide-react'
import { EvidenceMapSidebar } from './EvidenceMapSidebar'
import { DARK_SURFACE, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { WORLD_PATHS } from '../../data/world-paths'
import { LATENCY_MIN, LATENCY_MAX } from '../../data/gcp-latency'
import {
  totalSlotsFromPayload,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import { formatNumber } from './simulation-constants'
import {
  SVG_W,
  SVG_H,
  MAP_VISIBLE_H,
  GCP_REGION_MAP,
  PASTEL,
  latLonToMercator,
  latencyColor,
  latencyColorGlow,
  nodeRadius,
  nodeColor,
  getSlotRegionNodes,
  getSourceNodes,
  buildLatencyArcs,
  computeLabelPositions,
  spreadOverlappingNodes,
  type OverlayMode,
  type TooltipData,
} from './evidence-map-helpers'

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
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)

  // ── Zoom & Pan ──
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const viewBox = useMemo(() => {
    const vbW = SVG_W / zoom
    const vbH = MAP_VISIBLE_H / zoom
    const vbX = (SVG_W - vbW) / 2 - pan.x
    const vbY = (MAP_VISIBLE_H - vbH) / 2 - pan.y
    return `${vbX} ${vbY} ${vbW} ${vbH}`
  }, [zoom, pan])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom(prev => Math.max(1, Math.min(6, prev + delta * prev)))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [zoom, pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return
    const container = mapContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const scaleX = SVG_W / rect.width
    const scaleY = MAP_VISIBLE_H / rect.height
    const dx = (e.clientX - panStartRef.current.x) * scaleX / zoom
    const dy = (e.clientY - panStartRef.current.y) * scaleY / zoom
    setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy })
  }, [isPanning, zoom])

  const handlePointerUp = useCallback(() => setIsPanning(false), [])

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  // ── Playback — requestAnimationFrame for smooth 30fps updates ──
  const stepSize = Math.max(1, Math.ceil(totalSlots / 200))
  const frameInterval = 33 // ~30fps — balances smoothness vs render cost

  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    lastFrameRef.current = 0
    const tick = (timestamp: number) => {
      if (timestamp - lastFrameRef.current >= frameInterval) {
        lastFrameRef.current = timestamp
        setSlot(prev => {
          const next = prev + stepSize
          if (next >= lastSlot) {
            setPlaying(false)
            return lastSlot
          }
          return next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
  }, [playing, stepSize, lastSlot, frameInterval])

  const onPlay = useCallback(() => {
    if (slot >= lastSlot) setSlot(0)
    setPlaying(true)
  }, [slot, lastSlot])

  const onPause = useCallback(() => setPlaying(false), [])
  const onReset = useCallback(() => { setPlaying(false); setSlot(lastSlot) }, [lastSlot])

  // ── Data (fully memoized chain) ──
  const validatorNodes = useMemo(() => getSlotRegionNodes(payload, slot), [payload, slot])
  const sourceNodes = useMemo(() => getSourceNodes(payload), [payload])
  const rawDisplayNodes = useMemo(
    () => overlay === 'sources' ? sourceNodes : validatorNodes,
    [overlay, sourceNodes, validatorNodes],
  )
  const { maxCount, totalValidators } = useMemo(() => {
    let max = 1
    let total = 0
    for (const n of rawDisplayNodes) {
      if (n.count > max) max = n.count
      total += n.count
    }
    return { maxCount: max, totalValidators: total }
  }, [rawDisplayNodes])

  const displayNodes = useMemo(
    () => spreadOverlappingNodes(rawDisplayNodes, maxCount),
    [rawDisplayNodes, maxCount],
  )

  const latencyArcs = useMemo(
    () => overlay === 'latency' ? buildLatencyArcs(displayNodes) : [],
    [overlay, displayNodes],
  )

  const sorted = useMemo(
    () => [...displayNodes].toSorted((a, b) => b.count - a.count),
    [displayNodes],
  )

  const labelPositions = useMemo(
    () => computeLabelPositions(sorted, maxCount, 10),
    [sorted, maxCount],
  )

  const edges = useMemo(() => {
    if (displayNodes.length < 2) return []
    const result: Array<{ path: string; va: number; vb: number; color: string }> = []
    const N = Math.min(3, displayNodes.length - 1)
    const edgeColor = overlay === 'sources' ? PASTEL.mint! : PASTEL.sky!
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
          result.push({
            path: `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`,
            va: p.count, vb: q.count, color: edgeColor,
          })
        }
      }
    }
    return result
  }, [displayNodes, overlay])

  // ── Metrics at current slot ──
  const metrics = payload.metrics ?? {}
  const gini = metrics.gini?.[slot]
  const hhi = metrics.hhi?.[slot]
  const clusters = metrics.clusters?.[slot]
  const distance = metrics.total_distance?.[slot]
  const liveness = metrics.liveness?.[slot]

  // ── Macro-region (continental) breakdown ──
  const macroBreakdown = useMemo(() => {
    const totals = new Map<string, number>()
    for (const node of displayNodes) {
      const region = node.macroRegion ?? 'Unknown'
      totals.set(region, (totals.get(region) ?? 0) + node.count)
    }
    return [...totals.entries()]
      .map(([region, count]) => ({ region, count, share: totalValidators > 0 ? (count / totalValidators) * 100 : 0 }))
      .toSorted((a, b) => b.count - a.count)
  }, [displayNodes, totalValidators])

  // ── Tooltip position ──
  const tooltipStyle = useMemo(() => {
    if (!tooltip) return {}
    const xPct = (tooltip.x / SVG_W) * 100
    const yPct = (tooltip.y / MAP_VISIBLE_H) * 100
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
    <div className={cn('lab-stage overflow-hidden', className)}>
      {/* ── Hero header ── */}
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-accent dot-pulse" />
              <h3 className="text-base font-semibold tracking-tight text-text-primary">
                Validator Geography
              </h3>
            </div>
            <p className="mt-1 text-2xs text-muted pl-[22px]">
              {overlay === 'latency'
                ? `Inter-region latency arcs (${LATENCY_MIN.toFixed(0)}–${LATENCY_MAX.toFixed(0)} ms). Color = round-trip time.`
                : overlay === 'sources'
                  ? 'Information source placement across GCP regions.'
                  : 'Live geographic distribution of validator stake across GCP regions.'}
            </p>
            {/* Stat badges — animated on slot change */}
            {overlay === 'validators' && (
              <div className="mt-2 flex items-center gap-2 pl-[22px]">
                <motion.span
                  key={`regions-${displayNodes.length}`}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/8 border border-accent/15 px-2 py-0.5 text-[0.625rem] font-medium text-accent tabular-nums"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING_SNAPPY}
                  title="Distinct GCP regions with at least one validator at this slot"
                >
                  {displayNodes.length} regions
                </motion.span>
                <motion.span
                  key={`validators-${totalValidators}`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-active border border-rule px-2 py-0.5 text-[0.625rem] font-medium text-text-secondary tabular-nums"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.05 }}
                  title="Total validator agents distributed across regions"
                >
                  {totalValidators.toLocaleString()} validators
                </motion.span>
                <motion.span
                  key={`slot-${slot}`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-active border border-rule px-2 py-0.5 text-[0.625rem] font-mono text-muted tabular-nums"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
                  title="Current consensus round in the simulation timeline"
                >
                  slot {(slot + 1).toLocaleString()}
                </motion.span>
              </div>
            )}
          </div>

          {/* Overlay mode toggle */}
          <div className="flex items-center rounded-full border border-rule bg-surface-active p-0.5 gap-0.5">
            {([
              { mode: 'validators' as const, icon: Radio, label: 'Validators', detail: 'Show validator stake distribution across regions' },
              { mode: 'latency' as const, icon: Zap, label: 'Latency', detail: 'Show inter-region network latency arcs' },
              { mode: 'sources' as const, icon: Layers, label: 'Sources', detail: 'Show information source placement' },
            ]).map(({ mode, icon: Icon, label, detail }) => (
              <button
                key={mode}
                onClick={() => setOverlay(mode)}
                title={detail}
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
      <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
        {/* SVG Map */}
        <div
          ref={mapContainerRef}
          className="relative overflow-hidden"
          style={{ aspectRatio: `${SVG_W} / ${MAP_VISIBLE_H}`, backgroundColor: DARK_SURFACE.bg, cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Zoom controls overlay */}
          {zoom > 1 && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              <span className="rounded-md bg-black/60 px-2 py-0.5 text-[0.625rem] font-mono text-white/70 tabular-nums backdrop-blur-sm">
                {zoom.toFixed(1)}x
              </span>
              <button
                onClick={resetView}
                className="rounded-md bg-black/60 px-2 py-0.5 text-[0.625rem] font-medium text-white/70 backdrop-blur-sm hover:text-white transition-colors"
              >
                Reset
              </button>
            </div>
          )}
          <svg
            viewBox={viewBox}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Validator geography map — scroll to zoom, drag to pan"
          >
            <defs>
              {/* Ocean-depth background — subtle blue tint radiating from center */}
              <radialGradient id={`${idPrefix}-bg`} cx="42%" cy="35%" r="72%">
                <stop offset="0%" stopColor="#0D1926" />
                <stop offset="50%" stopColor="#0A1118" />
                <stop offset="100%" stopColor="#060A0F" />
              </radialGradient>
              {/* Edge vignette — stronger fade at corners for depth */}
              <radialGradient id={`${idPrefix}-atmos`} cx="50%" cy="42%" r="58%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="65%" stopColor="transparent" />
                <stop offset="88%" stopColor="#040810" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#020408" stopOpacity={0.85} />
              </radialGradient>
              {/* Subtle blue ocean wash behind land masses */}
              <radialGradient id={`${idPrefix}-ocean`} cx="50%" cy="45%" r="50%">
                <stop offset="0%" stopColor="#1E3A5F" stopOpacity={0.06} />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <filter id={`${idPrefix}-glow`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="20" />
              </filter>
              <filter id={`${idPrefix}-arc-glow`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
              </filter>
              <filter id={`${idPrefix}-node-glow`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
              </filter>
            </defs>

            {/* Background */}
            <rect width={SVG_W} height={MAP_VISIBLE_H} fill={`url(#${idPrefix}-bg)`} />
            <rect width={SVG_W} height={MAP_VISIBLE_H} fill={`url(#${idPrefix}-ocean)`} />

            {/* Graticule */}
            {[-30, 0, 30, 60].map(lat => {
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
              return <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={MAP_VISIBLE_H} stroke={DARK_SURFACE.graticule} strokeWidth={0.5} strokeDasharray="3 6" />
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

            {/* Ambient glow behind top 5 regions — layered for depth */}
            {sorted.slice(0, 5).map((node, i) => {
              const glowColors = [PASTEL.sky, PASTEL.lavender, PASTEL.peach, PASTEL.mint, PASTEL.rose]
              const color = glowColors[i] ?? PASTEL.sky
              const intensity = i < 3 ? 0.07 : 0.04
              return (
                <circle
                  key={`glow-${node.id}`}
                  cx={node.x} cy={node.y} r={55 - i * 5}
                  fill={color}
                  fillOpacity={intensity}
                  filter={`url(#${idPrefix}-glow)`}
                />
              )
            })}

            {/* Atmospheric vignette */}
            <rect width={SVG_W} height={MAP_VISIBLE_H} fill={`url(#${idPrefix}-atmos)`} />

            {/* ── Latency arcs layer ── */}
            {overlay === 'latency' && latencyArcs.map((arc, i) => {
              const color = latencyColor(arc.normalized)
              const glowColor = latencyColorGlow(arc.normalized)
              return (
                <g key={`arc-${arc.fromId}-${arc.toId}`}>
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
            {overlay !== 'latency' && edges.map((e, i) => {
              const opacity = 0.12 + ((e.va + e.vb) / (2 * maxCount)) * 0.18
              return playing ? (
                <path
                  key={`edge-${i}`}
                  d={e.path}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={0.7}
                  strokeLinecap="round"
                  opacity={opacity}
                />
              ) : (
                <motion.path
                  key={`edge-${i}`}
                  d={e.path}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={0.7}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity }}
                  transition={{ ...SPRING_SOFT, delay: 0.3 + i * 0.005 }}
                />
              )
            })}

            {/* ── Region nodes — plain SVG during playback for perf ── */}
            {displayNodes.map((node, index) => {
              const r = nodeRadius(node.count, maxCount)
              const color = overlay === 'sources' ? PASTEL.mint! : nodeColor(node.count, maxCount)
              const isTop = sorted.indexOf(node) < 6
              const isTop3 = sorted.indexOf(node) < 3
              const rank = sorted.findIndex(n => n.id === node.id)
              const isHovered = hoveredRegion === node.id

              const hoverProps = {
                style: { cursor: 'pointer' as const },
                onMouseEnter: () => handleHover({
                  x: node.x, y: node.y,
                  city: node.city, id: node.id,
                  count: node.count, rank,
                  total: displayNodes.length,
                  macroRegion: node.macroRegion,
                }),
                onMouseLeave: () => handleHover(null),
              }

              return (
                <g key={node.id}>
                  {/* Breathing halo — outer pulse ring for top nodes */}
                  {isTop && !playing && (
                    <circle cx={node.x} cy={node.y} r={r * 2.8} fill="none" stroke={color} strokeWidth={0.5} opacity={0.08}>
                      <animate attributeName="r" values={`${(r * 2.5).toFixed(1)};${(r * 3.8).toFixed(1)};${(r * 2.5).toFixed(1)}`} dur={isTop3 ? '3.5s' : '5s'} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.04;0.18;0.04" dur={isTop3 ? '3.5s' : '5s'} repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Inner ring — secondary halo for top 3 */}
                  {isTop3 && !playing && (
                    <circle cx={node.x} cy={node.y} r={r * 1.8} fill="none" stroke={color} strokeWidth={0.3} opacity={0.1}>
                      <animate attributeName="r" values={`${(r * 1.6).toFixed(1)};${(r * 2.2).toFixed(1)};${(r * 1.6).toFixed(1)}`} dur="3s" repeatCount="indefinite" begin="0.5s" />
                      <animate attributeName="opacity" values="0.06;0.14;0.06" dur="3s" repeatCount="indefinite" begin="0.5s" />
                    </circle>
                  )}

                  {/* Diffuse glow — soft color pool beneath node */}
                  <circle
                    cx={node.x} cy={node.y}
                    r={r * 2.4}
                    fill={color}
                    fillOpacity={isHovered ? 0.22 : isTop3 ? 0.1 : 0.06}
                    filter={isTop3 ? `url(#${idPrefix}-node-glow)` : undefined}
                  />

                  {/* Core node */}
                  {playing ? (
                    <circle
                      cx={node.x} cy={node.y}
                      r={r}
                      fill={color}
                      opacity={0.92}
                      stroke={isTop ? 'rgba(255,255,255,0.5)' : 'rgba(180,200,220,0.18)'}
                      strokeWidth={isTop3 ? 1 : isTop ? 0.7 : 0.4}
                      {...hoverProps}
                    />
                  ) : (
                    <motion.circle
                      cx={node.x} cy={node.y}
                      r={r}
                      fill={color}
                      stroke={isTop ? 'rgba(255,255,255,0.5)' : 'rgba(180,200,220,0.18)'}
                      strokeWidth={isTop3 ? 1 : isTop ? 0.7 : 0.4}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: isHovered ? 1.25 : 1, opacity: 0.92 }}
                      transition={{ ...SPRING_SNAPPY, delay: 0.1 + index * 0.008 }}
                      {...hoverProps}
                    />
                  )}

                </g>
              )
            })}

            {/* ── Labels — collision-aware placement layer ── */}
            {!playing && labelPositions.map(lp => (
              <motion.g
                key={`label-${lp.nodeId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.5 + lp.rank * 0.04 }}
              >
                {/* Leader line from node to displaced label */}
                {lp.needsLeader && (
                  <line
                    x1={lp.anchorX} y1={lp.anchorY}
                    x2={lp.lx} y2={lp.ly}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={0.5}
                    strokeDasharray="2,2"
                  />
                )}
                {/* Pill background */}
                <rect
                  x={lp.lx - lp.width / 2} y={lp.ly - lp.height / 2}
                  width={lp.width} height={lp.height}
                  rx={4}
                  fill={lp.rank < 3 ? 'rgba(8,14,22,0.88)' : 'rgba(8,14,22,0.72)'}
                  stroke={lp.rank < 3 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}
                  strokeWidth={0.5}
                />
                {/* Rank badge for top 3 */}
                {lp.rank < 3 && (
                  <>
                    <rect
                      x={lp.lx - lp.width / 2} y={lp.ly - lp.height / 2}
                      width={16} height={lp.height}
                      rx={4}
                      fill={lp.rank === 0 ? 'rgba(251,191,36,0.25)' : lp.rank === 1 ? 'rgba(148,163,184,0.2)' : 'rgba(180,120,80,0.18)'}
                    />
                    {/* Square off right side of badge rect */}
                    <rect
                      x={lp.lx - lp.width / 2 + 8} y={lp.ly - lp.height / 2}
                      width={8} height={lp.height}
                      fill={lp.rank === 0 ? 'rgba(251,191,36,0.25)' : lp.rank === 1 ? 'rgba(148,163,184,0.2)' : 'rgba(180,120,80,0.18)'}
                    />
                    <text
                      x={lp.lx - lp.width / 2 + 8} y={lp.ly + 3}
                      textAnchor="middle"
                      fill={lp.rank === 0 ? '#FBBF24' : lp.rank === 1 ? '#94A3B8' : '#B4886E'}
                      fontSize="7" fontWeight={700}
                      fontFamily="var(--font-mono)"
                    >
                      {lp.rank + 1}
                    </text>
                  </>
                )}
                {/* City name */}
                <text
                  x={lp.rank < 3 ? lp.lx + 4 : lp.lx}
                  y={lp.ly + 3}
                  textAnchor="middle"
                  fill={lp.rank < 3 ? 'rgba(255,255,255,0.88)' : DARK_SURFACE.subtleText}
                  fontSize={lp.rank < 3 ? '7.5' : '7'}
                  fontFamily="var(--font-mono)"
                  fontWeight={lp.rank < 3 ? 600 : 500}
                  letterSpacing="0.02em"
                >
                  {lp.city}
                </text>
              </motion.g>
            ))}
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
                      bottom: (tooltip.y / MAP_VISIBLE_H) * 100 < 15 ? 'auto' : '-5px',
                      top: (tooltip.y / MAP_VISIBLE_H) * 100 < 15 ? '-5px' : 'auto',
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
                  {/* Share bar */}
                  {totalValidators > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-[3px] rounded-full bg-white/10 overflow-hidden min-w-[60px]">
                        <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min((tooltip.count / totalValidators) * 100, 100)}%` }} />
                      </div>
                      <span className="text-[0.5625rem] font-mono text-white/50 tabular-nums">
                        {formatNumber((tooltip.count / totalValidators) * 100, 1)}%
                      </span>
                    </div>
                  )}
                  <div className="mt-0.5 text-[0.5625rem] font-mono text-white/30">
                    #{tooltip.rank + 1} of {tooltip.total}
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
        <EvidenceMapSidebar
          overlay={overlay}
          slot={slot}
          gini={gini}
          hhi={hhi}
          liveness={liveness}
          clusters={clusters}
          distance={distance}
          macroBreakdown={macroBreakdown}
          sorted={sorted}
          maxCount={maxCount}
          totalValidators={totalValidators}
          displayNodeCount={displayNodes.length}
          hoveredRegion={hoveredRegion}
          onHover={handleHover}
        />
      </div>

      {/* ── Playback controls ── */}
      <div className="border-t border-rule px-5 py-3 bg-surface-primary/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {playing ? (
              <button onClick={onPause} className="flex items-center justify-center rounded-lg border border-rule bg-surface-active px-3 py-1.5 text-xs font-medium text-text-primary hover:border-border-hover transition-colors gap-1.5">
                <Pause className="h-3 w-3" /> Pause
              </button>
            ) : (
              <button onClick={onPlay} className="flex items-center justify-center rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors gap-1.5">
                <Play className="h-3 w-3" /> {slot >= lastSlot ? 'Replay' : 'Play'}
              </button>
            )}
            <button onClick={onReset} className="flex items-center justify-center rounded-lg border border-rule bg-surface-active px-2 py-1.5 text-xs text-muted hover:text-text-primary hover:border-border-hover transition-colors" title="Jump to final slot">
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          {/* Scrubber with progress fill */}
          <div className="flex-1 min-w-[120px] relative">
            <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none" style={{ width: `${progress}%` }}>
              <div className="h-[5px] w-full rounded-l-full bg-accent/20" />
            </div>
            <input
              type="range"
              min={0}
              max={lastSlot}
              step={stepSize}
              value={slot}
              onChange={e => { setPlaying(false); setSlot(Number(e.target.value)) }}
              className="evidence-scrubber relative z-10"
            />
          </div>

          <div className="text-xs tabular-nums text-muted shrink-0 flex items-center gap-1.5">
            <span className="font-semibold text-text-primary">{(slot + 1).toLocaleString()}</span>
            <span className="text-text-faint text-2xs">/ {totalSlots.toLocaleString()}</span>
            {playing && (
              <span className="text-2xs text-accent/70 font-medium ml-0.5">{'\u00D7'}{stepSize}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
