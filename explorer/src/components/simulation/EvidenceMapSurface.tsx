import { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Layers, Radio, Zap, Plus, Minus, Maximize2, Download, Link2 } from 'lucide-react'
import { EvidenceMapSidebar } from './EvidenceMapSidebar'
import { LIGHT_SURFACE, SPRING_SOFT, SPRING_SNAPPY, SPRING_POPUP } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { InlineTooltip, Tooltip } from '../ui/Tooltip'
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
  NODE_BLUE,
  regionColor,
  latLonToMercator,
  greatCircleArc,
  latencyColor,
  nodeRadius,
  getSlotRegionNodes,
  getSourceNodes,
  buildLatencyArcs,
  computeFlowData,
  computeLabelPositions,
  spreadOverlappingNodes,
  type OverlayMode,
  type TooltipData,
} from './evidence-map-helpers'
import { WORLD_PATHS } from '../../data/world-paths'

// ── Main component ──────────────────────────────────────────────────────────

export type MapLayout = 'full' | 'split' | 'charts'

interface EvidenceMapSurfaceProps {
  readonly payload: PublishedAnalyticsPayload
  readonly className?: string
  readonly scenarioLabel?: string
  readonly embedded?: boolean
}

export function EvidenceMapSurface({ payload, className, scenarioLabel, embedded = false }: EvidenceMapSurfaceProps) {
  const idPrefix = useId()
  const totalSlots = totalSlotsFromPayload(payload)
  const lastSlot = Math.max(0, totalSlots - 1)

  // ── State ──
  const [slot, setSlot] = useState(lastSlot)
  const [playing, setPlaying] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('validators')
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [mapViewportHeight, setMapViewportHeight] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const prevNodeIdsRef = useRef<Set<string>>(new Set())

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
  const zoomIn = useCallback(() => setZoom(prev => Math.min(6, prev * 1.4)), [])
  const zoomOut = useCallback(() => {
    setZoom(prev => {
      const next = prev / 1.4
      if (next <= 1.05) { setPan({ x: 0, y: 0 }); return 1 }
      return next
    })
  }, [])

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
    setZoom(1)
    setPan({ x: 0, y: 0 })
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

  // Ghost nodes — nodes that just disappeared get a fade-out instead of instant removal
  const ghostNodes = useMemo(() => {
    const currentIds = new Set(displayNodes.map(n => n.id))
    const ghosts: Array<{ id: string; x: number; y: number; color: string }> = []
    // Only track ghosts during playback
    if (playing) {
      for (const prevId of prevNodeIdsRef.current) {
        if (!currentIds.has(prevId)) {
          // Find this node's last known position from the GCP region data
          const region = GCP_REGION_MAP.get(prevId)
          if (region) {
            const { x, y } = latLonToMercator(region.lat, region.lon, SVG_W, SVG_H)
            ghosts.push({ id: prevId, x, y, color: regionColor(region.macroRegion) })
          }
        }
      }
    }
    prevNodeIdsRef.current = currentIds
    return ghosts
  }, [displayNodes, playing])

  const latencyResult = useMemo(
    () => overlay === 'latency' ? buildLatencyArcs(displayNodes) : { arcs: [], truncatedCount: 0 },
    [overlay, displayNodes],
  )
  const latencyArcs = latencyResult.arcs
  const latencyTruncatedCount = latencyResult.truncatedCount

  // Flow data — net sender/receiver classification for directional visualization
  const flowData = useMemo(
    () => computeFlowData(validatorNodes, sourceNodes),
    [validatorNodes, sourceNodes],
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
    const seen = new Set<string>()
    const result: Array<{ path: string; va: number; vb: number; colorA: string; colorB: string; gradId: string; x1: number; y1: number; x2: number; y2: number }> = []
    const N = Math.min(3, displayNodes.length - 1)
    for (const p of displayNodes) {
      const distances = displayNodes
        .filter(q => q.id !== p.id)
        .map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
        .toSorted((a, b) => a.d - b.d)
        .slice(0, N)
      for (const { q } of distances) {
        const key = p.id < q.id ? `${p.id}-${q.id}` : `${q.id}-${p.id}`
        if (!seen.has(key)) {
          seen.add(key)
          // Orient path from lower-count node → higher-count node so arrow points toward hub
          const [from, to] = p.count <= q.count ? [p, q] : [q, p]
          result.push({
            path: greatCircleArc(from.lat, from.lon, to.lat, to.lon, SVG_W, SVG_H),
            va: from.count, vb: to.count,
            colorA: regionColor(from.macroRegion),
            colorB: regionColor(to.macroRegion),
            gradId: `${idPrefix}-eg-${result.length}`,
            x1: from.x, y1: from.y, x2: to.x, y2: to.y,
          })
        }
      }
    }
    return result
  }, [displayNodes])

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

  const handleNodeClick = useCallback((node: { x: number; y: number }) => {
    if (playing) return
    const targetZoom = 3
    const panX = (node.x - SVG_W / 2) * (1 - 1 / targetZoom)
    const panY = (node.y - MAP_VISIBLE_H / 2) * (1 - 1 / targetZoom)
    setZoom(targetZoom)
    setPan({ x: panX, y: panY })
  }, [playing])

  const progress = lastSlot > 0 ? (slot / lastSlot) * 100 : 100
  const overlayDescription = overlay === 'latency'
    ? `Latency arcs ${LATENCY_MIN.toFixed(0)}–${LATENCY_MAX.toFixed(0)} ms`
      + (latencyTruncatedCount > 0 ? ` · showing ${latencyArcs.length} of ${latencyArcs.length + latencyTruncatedCount} corridors` : '')
    : overlay === 'sources'
      ? 'Source placement across regions'
      : 'Live validator distribution'

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    const updateHeight = () => {
      const next = container.getBoundingClientRect().height
      setMapViewportHeight(current => (Math.abs((current ?? 0) - next) < 1 ? current : next))
    }

    updateHeight()

    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={cn(embedded ? 'overflow-hidden' : 'lab-stage overflow-hidden', className)}>
      {/* ── Hero header ── */}
      <div className={cn(
        'border-b border-black/[0.06] px-4 py-3 sm:px-5',
        embedded && 'px-0 py-0',
      )}>
        <div className={cn(embedded && 'px-4 py-3 sm:px-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-accent dot-pulse" />
              <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">
                Validator Geography
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
              {overlay === 'validators' ? (
                <>
                  <InlineTooltip label="Distinct GCP regions with at least one validator at this slot">
                    <motion.span
                      key={`regions-${displayNodes.length}`}
                      className="tabular-nums"
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING_SNAPPY}
                    >
                      {displayNodes.length} regions
                    </motion.span>
                  </InlineTooltip>
                  <span className="text-black/20">·</span>
                  <InlineTooltip label="Total validator agents distributed across regions">
                    <motion.span
                      key={`validators-${totalValidators}`}
                      className="tabular-nums"
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SNAPPY, delay: 0.05 }}
                    >
                      {totalValidators.toLocaleString()} validators
                    </motion.span>
                  </InlineTooltip>
                  <span className="text-black/20">·</span>
                </>
              ) : null}
              <InlineTooltip label="Current consensus round in the simulation timeline">
                <motion.span
                  key={`slot-${slot}`}
                  className="font-mono tabular-nums text-text-faint"
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
                >
                  slot {(slot + 1).toLocaleString()}
                </motion.span>
              </InlineTooltip>
              <span className="text-black/20">·</span>
              <span>{overlayDescription}</span>
            </div>
          </div>

          <div className="rounded-[12px] border border-black/[0.05] bg-[#FAF9F7] p-[2px] shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-[3px]">
              {([
                { mode: 'validators' as const, icon: Radio, label: 'Validators', detail: 'Show validator stake distribution across regions' },
                { mode: 'latency' as const, icon: Zap, label: 'Latency', detail: 'Show inter-region network latency arcs' },
                { mode: 'sources' as const, icon: Layers, label: 'Sources', detail: 'Show information source placement' },
              ]).map(({ mode, icon: Icon, label, detail }) => (
                <Tooltip key={mode} label={detail}>
                <button
                  onClick={() => setOverlay(mode)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.25 text-[11px] font-medium transition-all duration-150',
                    overlay === mode
                      ? 'bg-white text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]'
                      : 'text-stone-400 hover:text-stone-600',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
                </Tooltip>
              ))}
              <div className="mx-0.5 h-5 w-px bg-black/[0.06]" />
              <button
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('slot', String(slot + 1))
                  params.set('overlay', overlay)
                  if (scenarioLabel) params.set('scenario', scenarioLabel)
                  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
                  navigator.clipboard.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="flex items-center justify-center h-7 w-7 rounded-[10px] border border-black/[0.05] bg-white text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all duration-150"
                title={copied ? 'Copied!' : 'Copy share link with current slot and overlay'}
              >
                <Link2 className={cn('h-3 w-3 transition-colors', copied && 'text-emerald-500')} />
              </button>
              <button
                onClick={() => {
                  const data = {
                    slot: slot + 1, totalSlots, overlay,
                    metrics: { gini, hhi, liveness, clusters, distance },
                    regions: sorted.slice(0, 10).map(n => ({ id: n.id, city: n.city, count: n.count, macroRegion: n.macroRegion })),
                  }
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `map-snapshot-slot-${slot + 1}.json`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                className="flex items-center justify-center h-7 w-7 rounded-[10px] border border-black/[0.05] bg-white text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all duration-150"
                title="Download snapshot data as JSON"
              >
                <Download className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* ── Map + Sidebar ── */}
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_248px] lg:items-start">
        {/* SVG Map */}
        <div
          ref={mapContainerRef}
          className="relative overflow-hidden lg:self-start"
          style={{ aspectRatio: `${SVG_W} / ${MAP_VISIBLE_H}`, backgroundColor: LIGHT_SURFACE.bg, cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Zoom controls — Agentation-style floating controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-[10px] border border-black/[0.06] bg-white/90 backdrop-blur-md p-1 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <button
              onClick={zoomIn}
              className="flex items-center justify-center h-6 w-6 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              aria-label={`Zoom in (current: ${zoom.toFixed(1)}x)`}
              title="Zoom in"
            >
              <Plus className="h-3 w-3" />
            </button>
            <div className="h-px bg-black/[0.06] mx-0.5" />
            <button
              onClick={zoomOut}
              className="flex items-center justify-center h-6 w-6 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              aria-label={`Zoom out (current: ${zoom.toFixed(1)}x)`}
              title="Zoom out"
            >
              <Minus className="h-3 w-3" />
            </button>
            {zoom > 1.05 && (
              <>
                <div className="h-px bg-black/[0.06] mx-0.5" />
                <button
                  onClick={resetView}
                  className="flex items-center justify-center h-6 w-6 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                  aria-label="Reset map zoom and pan to default view"
                  title="Reset zoom"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
                <span className="text-center text-[9px] font-mono text-stone-400 tabular-nums">
                  {zoom.toFixed(1)}x
                </span>
              </>
            )}
          </div>
          <svg
            viewBox={viewBox}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid slice"
            role="region"
            aria-label="Validator geography map — scroll to zoom, drag to pan"
          >
            <defs>
              {/* Minimal label text shadow for readability on light canvas */}
              <filter id={`${idPrefix}-label-shadow`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
                <feOffset dy="0.5" />
                <feComponentTransfer><feFuncA type="linear" slope="0.1" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Directional flow arrowhead */}
              <marker id={`${idPrefix}-flow-arrow`} viewBox="0 0 8 6" refX="7" refY="3" markerWidth="6" markerHeight="4.5" orient="auto">
                <path d="M0,0.5 L7,3 L0,5.5 Z" fill="currentColor" opacity="0.5" />
              </marker>
              {/* Glow filter for hub nodes */}
              <filter id={`${idPrefix}-hub-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feComponentTransfer in="blur"><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Edge gradients — each connection blends from one region color to the other */}
              {overlay !== 'latency' && edges.map(e => (
                <linearGradient key={e.gradId} id={e.gradId} gradientUnits="userSpaceOnUse" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}>
                  <stop offset="0%" stopColor={e.colorA} />
                  <stop offset="100%" stopColor={e.colorB} />
                </linearGradient>
              ))}
            </defs>

            {/* Background — warm off-white canvas */}
            <rect width={SVG_W} height={MAP_VISIBLE_H} fill={LIGHT_SURFACE.bg} />

            {/* Graticule — curved lines for Natural Earth projection */}
            {[-30, 0, 30, 60].map(lat => {
              const pts = Array.from({ length: 37 }, (_, i) => {
                const lon = -180 + i * 10
                return latLonToMercator(lat, lon, SVG_W, SVG_H)
              })
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
              const label = latLonToMercator(lat, -170, SVG_W, SVG_H)
              return (
                <g key={`lat-${lat}`}>
                  <path d={d} fill="none" stroke={LIGHT_SURFACE.graticule} strokeWidth={0.3} strokeDasharray={lat === 0 ? 'none' : '2 5'} />
                  <text x={label.x} y={label.y - 3} fill={LIGHT_SURFACE.labelText} fontSize="7" fontFamily="var(--font-mono)" opacity={0.5}>
                    {Math.abs(lat)}°{lat >= 0 ? 'N' : 'S'}
                  </text>
                </g>
              )
            })}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(lon => {
              const pts = Array.from({ length: 19 }, (_, i) => {
                const lat = -90 + i * 10
                return latLonToMercator(lat, lon, SVG_W, SVG_H)
              })
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
              return <path key={`lon-${lon}`} d={d} fill="none" stroke={LIGHT_SURFACE.graticule} strokeWidth={0.3} strokeDasharray="2 5" />
            })}

            {/* Country outlines */}
            {WORLD_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={LIGHT_SURFACE.countryFill}
                stroke={LIGHT_SURFACE.countryStroke}
                strokeWidth={0.3}
                strokeLinejoin="round"
              />
            ))}


            {/* ── Latency arcs layer ── */}
            {overlay === 'latency' && latencyArcs.map((arc, i) => {
              const color = latencyColor(arc.normalized)
              const isRelatedToHover = hoveredRegion == null || arc.fromId === hoveredRegion || arc.toId === hoveredRegion
              const showLabel = hoveredRegion == null ? i < 6 : isRelatedToHover
              return (
                <g key={`arc-${arc.fromId}-${arc.toId}`}>
                  <motion.path
                    d={arc.path}
                    fill="none"
                    stroke={color}
                    strokeWidth={(isRelatedToHover ? 1.2 : 0.8) + (1 - arc.normalized) * (isRelatedToHover ? 0.9 : 0.45)}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: hoveredRegion == null ? 0.58 : isRelatedToHover ? 0.82 : 0.16 }}
                    transition={{ ...SPRING_SOFT, delay: i * 0.02 }}
                  />
                  {showLabel && (() => {
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
                        animate={{ opacity: hoveredRegion == null ? 0.72 : 0.92 }}
                        transition={{ delay: 0.3 + i * 0.02 }}
                      >
                        {arc.ms.toFixed(0)} ms
                      </motion.text>
                    )
                  })()}
                </g>
              )
            })}

            {/* ── Network connections (validators/sources mode) — great-circle arcs with flow ── */}
            {overlay !== 'latency' && edges.map((e, i) => {
              const strength = (e.va + e.vb) / (2 * maxCount)
              const opacity = 0.18 + strength * 0.32
              const sw = 0.5 + strength * 0.8
              const gradStroke = e.colorA === e.colorB ? e.colorA : `url(#${e.gradId})`
              // Particle color: use the higher-count node's color for visibility
              const particleColor = e.va >= e.vb ? e.colorA : e.colorB
              // Show arrow on top 12 edges when paused to indicate flow direction
              const showArrow = !playing && i < 12
              // Particle speed: faster for stronger connections, slower (larger dur) for weaker
              const dur = 2.2 + i * 0.4

              return (
                <g key={`edge-${i}`} style={{ color: particleColor }}>
                  {playing ? (
                    <path
                      d={e.path}
                      fill="none"
                      stroke={gradStroke}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      opacity={opacity}
                    />
                  ) : (
                    <motion.path
                      d={e.path}
                      fill="none"
                      stroke={gradStroke}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity }}
                      transition={{ ...SPRING_SOFT, delay: 0.3 + i * 0.005 }}
                      markerEnd={showArrow ? `url(#${idPrefix}-flow-arrow)` : undefined}
                    />
                  )}
                  {/* Traveling flow particles — visible during both play and pause */}
                  {i < 10 && (
                    <>
                      <circle r={1.4 + strength * 1.6} fill={particleColor} opacity={0}>
                        <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={e.path} />
                        <animate attributeName="opacity" values="0;0.6;0.6;0" dur={`${dur}s`} repeatCount="indefinite" />
                        <animate attributeName="r" values={`${(1 + strength).toFixed(1)};${(1.8 + strength * 2).toFixed(1)};${(1 + strength).toFixed(1)}`} dur={`${dur}s`} repeatCount="indefinite" />
                      </circle>
                      {/* Second trailing particle on top 4 edges — convoy effect */}
                      {i < 4 && (
                        <circle r={0.8 + strength * 0.8} fill={particleColor} opacity={0}>
                          <animateMotion dur={`${dur}s`} begin={`${dur * 0.4}s`} repeatCount="indefinite" path={e.path} />
                          <animate attributeName="opacity" values="0;0.4;0.4;0" dur={`${dur}s`} begin={`${dur * 0.4}s`} repeatCount="indefinite" />
                        </circle>
                      )}
                    </>
                  )}
                </g>
              )
            })}

            {/* ── Ghost nodes — fade out during playback when a region loses all validators ── */}
            {ghostNodes.map(ghost => (
              <circle
                key={`ghost-${ghost.id}`}
                cx={ghost.x} cy={ghost.y}
                r={3}
                fill={ghost.color}
                stroke="white"
                strokeWidth={0.4}
              >
                <animate attributeName="r" from="3" to="0" dur="0.4s" fill="freeze" />
                <animate attributeName="opacity" from="0.6" to="0" dur="0.4s" fill="freeze" />
              </circle>
            ))}

            {/* ── Region nodes — colored by macro-region with flow-aware styling ── */}
            {displayNodes.map((node, index) => {
              const r = nodeRadius(node.count, maxCount)
              const color = overlay === 'sources' ? NODE_BLUE.source : regionColor(node.macroRegion)
              const rank = sorted.findIndex(n => n.id === node.id)
              const isTop3 = rank >= 0 && rank < 3
              const isTop6 = rank >= 0 && rank < 6
              const isHovered = hoveredRegion === node.id
              const flow = flowData.get(node.id)
              const isNetReceiver = flow ? flow.flowRatio > 0.15 : false

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
                onClick: () => handleNodeClick(node),
              }

              return (
                <g key={node.id}>
                  {/* Hub glow — major hubs that are net receivers get a diffuse glow */}
                  {isTop6 && isNetReceiver && !playing && (
                    <circle cx={node.x} cy={node.y} r={r * 3} fill={color} fillOpacity={0} filter={`url(#${idPrefix}-hub-glow)`}>
                      <animate attributeName="fill-opacity" values="0.06;0.14;0.06" dur="3.5s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Breathing halo for top 3 — outer ring with inner pulse */}
                  {isTop3 && !playing && (
                    <>
                      <circle cx={node.x} cy={node.y} r={r * 2.5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.08}>
                        <animate attributeName="r" values={`${(r * 2.2).toFixed(1)};${(r * 3.4).toFixed(1)};${(r * 2.2).toFixed(1)}`} dur="3.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.04;0.14;0.04" dur="3.5s" repeatCount="indefinite" />
                      </circle>
                      {/* Inner ring — faster offset pulse for depth */}
                      <circle cx={node.x} cy={node.y} r={r * 1.6} fill="none" stroke={color} strokeWidth={0.4} opacity={0.05}>
                        <animate attributeName="r" values={`${(r * 1.5).toFixed(1)};${(r * 2.1).toFixed(1)};${(r * 1.5).toFixed(1)}`} dur="2.8s" begin="0.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.03;0.10;0.03" dur="2.8s" begin="0.5s" repeatCount="indefinite" />
                      </circle>
                    </>
                  )}

                  {/* Hover glow — soft radial highlight */}
                  {isHovered && (
                    <circle cx={node.x} cy={node.y} r={r * 2.2} fill={color} fillOpacity={0.14} />
                  )}

                  {/* Core node — top nodes get thicker stroke for prominence */}
                  {playing ? (
                    <circle
                      cx={node.x} cy={node.y}
                      r={isHovered ? r * 1.2 : r}
                      fill={color}
                      stroke="white"
                      strokeWidth={isTop3 ? 1.4 : isTop6 ? 1 : 0.6}
                      {...hoverProps}
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease-out, cx 0.1s ease-out, cy 0.1s ease-out' }}
                    />
                  ) : (
                    <motion.circle
                      cx={node.x} cy={node.y}
                      r={r}
                      fill={color}
                      stroke="white"
                      strokeWidth={isTop3 ? 1.4 : isTop6 ? 1 : 0.6}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: isHovered ? 1.2 : 1, opacity: 1 }}
                      transition={{ ...SPRING_SNAPPY, delay: 0.1 + index * 0.008 }}
                      {...hoverProps}
                    />
                  )}
                </g>
              )
            })}

            {/* ── Labels — collision-aware placement, light theme pills ── */}
            {!playing && labelPositions.map(lp => (
              <motion.g
                key={`label-${lp.nodeId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.5 + lp.rank * 0.04 }}
                filter={`url(#${idPrefix}-label-shadow)`}
              >
                {/* Leader line from node to displaced label */}
                {lp.needsLeader && (
                  <line
                    x1={lp.anchorX} y1={lp.anchorY}
                    x2={lp.lx} y2={lp.ly}
                    stroke={LIGHT_SURFACE.countryStroke}
                    strokeWidth={0.5}
                    strokeDasharray="2,2"
                  />
                )}
                {/* White pill background with subtle border */}
                <rect
                  x={lp.lx - lp.width / 2} y={lp.ly - lp.height / 2}
                  width={lp.width} height={lp.height}
                  rx={4}
                  fill="white"
                  stroke={LIGHT_SURFACE.tooltipBorder}
                  strokeWidth={0.5}
                />
                {/* Rank badge for top 3 */}
                {lp.rank < 3 && (
                  <>
                    <rect
                      x={lp.lx - lp.width / 2} y={lp.ly - lp.height / 2}
                      width={16} height={lp.height}
                      rx={4}
                      fill={lp.rank === 0 ? '#EFF6FF' : lp.rank === 1 ? '#F1F5F9' : '#F5F5F4'}
                    />
                    <rect
                      x={lp.lx - lp.width / 2 + 8} y={lp.ly - lp.height / 2}
                      width={8} height={lp.height}
                      fill={lp.rank === 0 ? '#EFF6FF' : lp.rank === 1 ? '#F1F5F9' : '#F5F5F4'}
                    />
                    <text
                      x={lp.lx - lp.width / 2 + 8} y={lp.ly + 3}
                      textAnchor="middle"
                      fill={lp.rank === 0 ? LIGHT_SURFACE.blue700 : lp.rank === 1 ? LIGHT_SURFACE.blue600 : '#78716C'}
                      fontSize="7" fontWeight={700}
                      fontFamily="var(--font-mono)"
                    >
                      {lp.rank + 1}
                    </text>
                  </>
                )}
                {/* City name — dark text on white pill */}
                <text
                  x={lp.rank < 3 ? lp.lx + 4 : lp.lx}
                  y={lp.ly + 3}
                  textAnchor="middle"
                  fill={lp.rank < 3 ? LIGHT_SURFACE.tooltipText : LIGHT_SURFACE.subtleText}
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
                initial={{ opacity: 0, scale: 0.92, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={SPRING_POPUP}
                className="pointer-events-none absolute z-20"
                style={tooltipStyle}
              >
                <div className="relative rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 backdrop-blur-sm" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-black/[0.06] bg-white"
                    style={{
                      bottom: (tooltip.y / MAP_VISIBLE_H) * 100 < 15 ? 'auto' : '-5px',
                      top: (tooltip.y / MAP_VISIBLE_H) * 100 < 15 ? '-5px' : 'auto',
                    }}
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: regionColor(tooltip.macroRegion) }} />
                    <span className="text-11 font-medium text-stone-900">{tooltip.city}</span>
                  </div>
                  <div className="mt-0.5 text-[0.5625rem] font-mono text-stone-400">{tooltip.id} · {tooltip.macroRegion}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-stone-900">
                      {tooltip.count.toLocaleString()}
                    </span>
                    <span className="text-2xs text-stone-400">
                      {overlay === 'sources' ? 'sources' : 'validators'}
                    </span>
                  </div>
                  {/* Share bar */}
                  {totalValidators > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-[3px] rounded-full bg-stone-100 overflow-hidden min-w-[60px]">
                        <div className="h-full rounded-full" style={{ width: `${Math.min((tooltip.count / totalValidators) * 100, 100)}%`, backgroundColor: regionColor(tooltip.macroRegion) }} />
                      </div>
                      <span className="text-[0.5625rem] font-mono text-stone-500 tabular-nums">
                        {formatNumber((tooltip.count / totalValidators) * 100, 1)}%
                      </span>
                    </div>
                  )}
                  {/* Flow direction indicator */}
                  {(() => {
                    const flow = flowData.get(tooltip.id)
                    if (!flow || (flow.sourceCount === 0 && overlay !== 'sources')) return null
                    const isReceiver = flow.flowRatio > 0.15
                    const isSender = flow.flowRatio < -0.15
                    return (
                      <div className="mt-1 flex items-center gap-1 text-[0.5625rem] font-mono">
                        <span className={isReceiver ? 'text-blue-500' : isSender ? 'text-amber-500' : 'text-stone-400'}>
                          {isReceiver ? 'Net receiver' : isSender ? 'Net sender' : 'Balanced'}
                        </span>
                        <span className="text-stone-300">
                          ({flow.sourceCount}s / {flow.validatorCount}v)
                        </span>
                      </div>
                    )
                  })()}
                  <div className="mt-0.5 text-[0.5625rem] font-mono text-stone-300">
                    #{tooltip.rank + 1} of {tooltip.total}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Slot progress bar (bottom of map) ── */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/[0.04]">
            <div className="h-full transition-all duration-100" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #1c1917, #57534e)' }} />
          </div>
        </div>

        {/* ── Sidebar ── */}
        <EvidenceMapSidebar
          className="lg:self-start"
          style={mapViewportHeight != null ? { maxHeight: `${mapViewportHeight}px` } : undefined}
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

      {/* ── Playback controls — Stripe-style transport bar ── */}
      <div className="border-t border-black/[0.06] px-5 py-3 bg-[#FAFAF8]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {playing ? (
              <button onClick={onPause} aria-label="Pause simulation playback" className="flex items-center justify-center rounded-[10px] border border-black/[0.06] bg-white px-3 py-1.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50 transition-all duration-150 gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <Pause className="h-3 w-3" /> Pause
              </button>
            ) : (
              <button onClick={onPlay} aria-label={slot >= lastSlot ? 'Replay simulation from start' : 'Play simulation timeline'} className="flex items-center justify-center rounded-[10px] bg-stone-900 px-3.5 py-1.5 text-[11px] font-medium text-white hover:bg-stone-800 transition-all duration-150 gap-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
                <Play className="h-3 w-3" /> {slot >= lastSlot ? 'Replay' : 'Play'}
              </button>
            )}
            <button onClick={onReset} aria-label="Jump to final slot" className="flex items-center justify-center rounded-[10px] border border-black/[0.06] bg-white h-[30px] w-[30px] text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.04)]" title="Jump to final slot">
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          {/* Scrubber with progress fill */}
          <div className="flex-1 min-w-[120px] relative">
            <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none" style={{ width: `${progress}%` }}>
              <div className="h-[4px] w-full rounded-l-full bg-stone-900/15" />
            </div>
            <input
              type="range"
              min={0}
              max={lastSlot}
              step={stepSize}
              value={slot}
              onChange={e => { setPlaying(false); setSlot(Number(e.target.value)) }}
              className="evidence-scrubber relative z-10"
              aria-label={`Simulation timeline — slot ${slot + 1} of ${totalSlots}`}
            />
          </div>

          <div className="tabular-nums shrink-0 flex items-center gap-1 rounded-md border border-black/[0.06] bg-white px-2 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <input
              type="text"
              inputMode="numeric"
              value={playing ? (slot + 1).toLocaleString() : undefined}
              defaultValue={playing ? undefined : (slot + 1).toLocaleString()}
              key={playing ? 'playing' : `paused-${slot}`}
              readOnly={playing}
              onFocus={e => { if (!playing) e.target.select() }}
              onBlur={e => {
                const v = parseInt(e.target.value.replace(/,/g, ''), 10)
                if (!isNaN(v)) {
                  const clamped = Math.max(0, Math.min(lastSlot, v - 1))
                  setPlaying(false)
                  setSlot(clamped)
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className={cn(
                'text-[11px] font-semibold text-stone-800 tabular-nums bg-transparent outline-none text-right',
                playing ? 'w-[3.5ch]' : 'w-[4.5ch] hover:bg-stone-50 focus:bg-stone-50 rounded px-0.5 -mx-0.5',
              )}
              aria-label="Jump to slot number"
              title="Type a slot number to jump directly"
            />
            <span className="text-[10px] text-stone-300">/ {totalSlots.toLocaleString()}</span>
            {playing && (
              <span className="text-[10px] text-stone-400 font-mono ml-0.5">{'\u00D7'}{stepSize}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
