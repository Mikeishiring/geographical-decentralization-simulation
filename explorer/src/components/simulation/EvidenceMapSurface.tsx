import { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Layers, Radio, Zap } from 'lucide-react'
import { DARK_SURFACE, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { WORLD_PATHS } from '../../data/world-paths'
import { LATENCY_MIN, LATENCY_MAX } from '../../data/gcp-latency'
import {
  totalSlotsFromPayload,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import { formatNumber } from './simulation-constants'
import { THRESHOLDS, SENTIMENT_TEXT, sentimentLower, sentimentHigher } from './simulation-evidence-constants'
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
  const displayNodes = useMemo(
    () => overlay === 'sources' ? sourceNodes : validatorNodes,
    [overlay, sourceNodes, validatorNodes],
  )
  const { maxCount, totalValidators } = useMemo(() => {
    let max = 1
    let total = 0
    for (const n of displayNodes) {
      if (n.count > max) max = n.count
      total += n.count
    }
    return { maxCount: max, totalValidators: total }
  }, [displayNodes])

  const latencyArcs = useMemo(
    () => overlay === 'latency' ? buildLatencyArcs(validatorNodes) : [],
    [overlay, validatorNodes],
  )

  const sorted = useMemo(
    () => [...displayNodes].toSorted((a, b) => b.count - a.count),
    [displayNodes],
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
                >
                  {displayNodes.length} regions
                </motion.span>
                <motion.span
                  key={`validators-${totalValidators}`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-active border border-rule px-2 py-0.5 text-[0.625rem] font-medium text-text-secondary tabular-nums"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.05 }}
                >
                  {totalValidators.toLocaleString()} validators
                </motion.span>
                <motion.span
                  key={`slot-${slot}`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-active border border-rule px-2 py-0.5 text-[0.625rem] font-mono text-muted tabular-nums"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
                >
                  slot {(slot + 1).toLocaleString()}
                </motion.span>
              </div>
            )}
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
      <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
        {/* SVG Map */}
        <div className="relative overflow-hidden" style={{ aspectRatio: `${SVG_W} / ${MAP_VISIBLE_H}`, backgroundColor: DARK_SURFACE.bg }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${MAP_VISIBLE_H}`}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Validator geography map"
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

                  {/* Labels — pill-style with background for top 5 */}
                  {rank < 5 && !playing && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ ...SPRING_SOFT, delay: 0.5 + index * 0.03 }}
                    >
                      <rect
                        x={node.x - 28} y={node.y - r - 18}
                        width={56} height={13}
                        rx={3}
                        fill="rgba(8,14,22,0.75)"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={0.5}
                      />
                      <text
                        x={node.x} y={node.y - r - 9}
                        textAnchor="middle"
                        fill={DARK_SURFACE.subtleText}
                        fontSize="7.5"
                        fontFamily="var(--font-mono)"
                        fontWeight={500}
                        letterSpacing="0.02em"
                      >
                        {node.city.split(',')[0]}
                      </text>
                    </motion.g>
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
        <div className="border-t border-rule p-3.5 lg:border-l lg:border-t-0 space-y-3.5 overflow-y-auto" style={{ maxHeight: 420 }}>
          {/* Live metrics — sentiment-colored */}
          <div>
            <div className="lab-section-title flex items-baseline gap-1.5">
              <span>Metrics</span>
              <span className="text-[0.5625rem] font-mono text-text-faint tabular-nums">slot {(slot + 1).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gini != null && (
                <div className="lab-option-card p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Gini</div>
                  <div className={cn('text-sm font-semibold tabular-nums', SENTIMENT_TEXT[sentimentLower(gini, THRESHOLDS.gini)])}>
                    {formatNumber(gini, 3)}
                  </div>
                </div>
              )}
              {hhi != null && (
                <div className="lab-option-card p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">HHI</div>
                  <div className={cn('text-sm font-semibold tabular-nums', SENTIMENT_TEXT[sentimentLower(hhi, THRESHOLDS.hhi)])}>
                    {formatNumber(hhi, 4)}
                  </div>
                </div>
              )}
              {liveness != null && (
                <div className="lab-option-card p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Liveness</div>
                  <div className={cn('text-sm font-semibold tabular-nums', SENTIMENT_TEXT[sentimentHigher(liveness, THRESHOLDS.liveness)])}>
                    {formatNumber(liveness, 1)}%
                  </div>
                </div>
              )}
              {clusters != null && (
                <div className="lab-option-card p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Clusters</div>
                  <div className="text-sm font-semibold tabular-nums text-text-primary">{clusters}</div>
                </div>
              )}
              {distance != null && (
                <div className="lab-option-card p-2">
                  <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Distance</div>
                  <div className="text-sm font-semibold tabular-nums text-text-primary">{distance.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* Macro-region breakdown */}
          {macroBreakdown.length > 0 && (
            <div>
              <div className="lab-section-title">Continents</div>
              <div className="space-y-1">
                {macroBreakdown.map(({ region, share }) => (
                  <div key={region} className="flex items-center gap-2">
                    <span className="text-2xs text-text-faint w-[72px] truncate">{region}</span>
                    <div className="flex-1 h-[4px] rounded-full bg-surface-active overflow-hidden">
                      <div className="h-full rounded-full bg-accent/50" style={{ width: `${Math.min(share, 100)}%` }} />
                    </div>
                    <span className="text-2xs text-muted tabular-nums w-8 text-right">{formatNumber(share, 0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top regions list */}
          <div>
            <div className="lab-section-title">Top regions</div>
            <div className="space-y-0.5">
              {sorted.slice(0, 6).map((node, i) => {
                const color = overlay === 'sources' ? PASTEL.mint! : nodeColor(node.count, maxCount)
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
            <div className="lab-option-card p-2.5 text-xs text-muted">
              <div className="lab-section-title !mb-1.5">Latency scale</div>
              <div className="h-2 rounded-full" style={{ background: 'linear-gradient(to right, #10B981, #FBBF24, #F97316, #EF4444)' }} />
              <div className="flex justify-between mt-1 text-[0.5625rem] font-mono text-text-faint">
                <span>{LATENCY_MIN.toFixed(0)} ms</span><span>{LATENCY_MAX.toFixed(0)} ms</span>
              </div>
            </div>
          )}

          {/* Density legend */}
          {overlay !== 'latency' && (
            <div className="lab-option-card p-2.5 text-xs text-muted">
              <div className="lab-section-title !mb-1.5">{overlay === 'sources' ? 'Source density' : 'Stake concentration'}</div>
              <div className="flex items-center gap-3">
                {([
                  { size: 'h-1.5 w-1.5', label: 'Low', color: '#64748B' },
                  { size: 'h-2 w-2', label: 'Med', color: overlay === 'sources' ? PASTEL.mint : PASTEL.sky },
                  { size: 'h-2 w-2', label: 'High', color: overlay === 'sources' ? PASTEL.mint : PASTEL.lavender },
                  { size: 'h-2.5 w-2.5', label: 'Top', color: overlay === 'sources' ? PASTEL.mint : PASTEL.peach },
                ] as const).map(({ size, label, color }) => (
                  <span key={label} className="flex items-center gap-1">
                    <span className={cn('rounded-full', size)} style={{ backgroundColor: color }} />
                    <span className="text-2xs">{label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
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
