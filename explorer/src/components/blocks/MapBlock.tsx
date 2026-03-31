import { useId, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { CHART, DARK_SURFACE, PASTEL_PALETTE, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { WORLD_PATHS } from '../../data/world-paths'
import type { MapBlock as MapBlockType } from '../../types/blocks'

interface MapBlockProps {
  block: MapBlockType
}

/* ── Pastel palette — shared from theme.ts ── */
const PASTEL = {
  lavender: PASTEL_PALETTE[0],
  sky: PASTEL_PALETTE[1],
  peach: PASTEL_PALETTE[2],
  mint: PASTEL_PALETTE[3],
  rose: PASTEL_PALETTE[4],
} as const

const PASTEL_SCALE = [PASTEL.sky, PASTEL.mint, PASTEL.lavender, PASTEL.peach, PASTEL.rose] as const

/* ── Projection ── */
function latLonToMercator(lat: number, lon: number, width: number, height: number) {
  const x = ((lon + 180) / 360) * width
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = height / 2 - (mercN / Math.PI) * (height / 2)
  return { x, y }
}

/* ── Dot sizing — sqrt scale for perceptually fair area encoding ── */
function getDotRadius(value: number, maxValue: number): number {
  const normalized = Math.max(value / Math.max(maxValue, 1), 0.04)
  return 3.5 + Math.sqrt(normalized) * 9
}

function getDotColor(value: number, maxValue: number, colorScale?: string): string {
  if (colorScale === 'binary') return value > 0 ? PASTEL.mint : DARK_SURFACE.grayscaleStroke
  if (colorScale === 'change') {
    if (value > 0) return PASTEL.mint
    if (value < 0) return PASTEL.rose
    return DARK_SURFACE.grayscaleFill
  }
  const t = Math.min(value / Math.max(maxValue, 1), 1)
  if (t < 0.1) return DARK_SURFACE.grayscaleStroke
  if (t < 0.3) return PASTEL.sky
  if (t < 0.6) return PASTEL.lavender
  return PASTEL.peach
}

function getEdgeOpacity(va: number, vb: number, maxValue: number): number {
  const combined = (va + vb) / (2 * Math.max(maxValue, 1))
  return 0.08 + combined * 0.22
}

/* ── Curved edge path (quadratic bezier with upward arc) ── */
function curvedEdgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dist = Math.hypot(x2 - x1, y2 - y1)
  const curvature = Math.min(dist * 0.15, 30)
  const angle = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2
  const cx = mx + Math.cos(angle) * curvature
  const cy = my + Math.sin(angle) * curvature
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
}

function finiteValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

interface TooltipData {
  x: number
  y: number
  label: string
  value: number
  color: string
  rank: number
}

const SVG_W = 800
const SVG_H = 450

export function MapBlock({ block }: MapBlockProps) {
  const bgId = useId()
  const regions = block.regions
  const glowId = `${bgId}-glow`
  const mapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)

  const handleRegionHover = useCallback((data: TooltipData | null) => {
    setTooltip(data)
    setHoveredRegion(data?.label ?? null)
  }, [])

  const maxValue = Math.max(...regions.map(region => finiteValue(region.value)), 1)

  const sorted = useMemo(
    () => [...regions].toSorted((a, b) => finiteValue(b.value) - finiteValue(a.value)),
    [regions],
  )
  const topRegions = sorted.slice(0, 6)

  const edges = useMemo(() => {
    const pts = regions.map(r => ({
      ...r,
      value: finiteValue(r.value),
      ...latLonToMercator(r.lat, r.lon, SVG_W, SVG_H),
    }))
    const result: { path: string; va: number; vb: number }[] = []
    const N = Math.min(3, pts.length - 1)
    for (const p of pts) {
      const distances = pts
        .filter(q => q.name !== p.name)
        .map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
        .toSorted((a, b) => a.d - b.d)
        .slice(0, N)
      for (const { q } of distances) {
        if (p.name < q.name) {
          result.push({
            path: curvedEdgePath(p.x, p.y, q.x, q.y),
            va: p.value,
            vb: q.value,
          })
        }
      }
    }
    return result
  }, [regions])

  const hasVariation = new Set(regions.map(region => finiteValue(region.value))).size > 1

  /* Tooltip edge-clamping: keep it inside the map container */
  const tooltipStyle = useMemo(() => {
    if (!tooltip) return {}
    const xPct = (tooltip.x / SVG_W) * 100
    const yPct = (tooltip.y / SVG_H) * 100
    const flipBelow = yPct < 18
    return {
      left: `clamp(5%, ${xPct}%, 95%)`,
      top: flipBelow ? `${yPct + 4}%` : `${yPct}%`,
      transform: flipBelow
        ? 'translate(-50%, 12px)'
        : 'translate(-50%, calc(-100% - 12px))',
    }
  }, [tooltip])

  if (regions.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-5 py-3">
          <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        </div>
        <div className="px-5 py-10 text-center text-xs text-muted">No region data available</div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white geo-accent-bar">
      {/* ── Header ── */}
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent dot-pulse" />
              <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
            </div>
            <p className="mt-0.5 text-2xs text-muted pl-[18px]">
              Geographic validator distribution. Hover nodes to inspect values. Size encodes stake share.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{regions.length} regions</span>
            <span className="font-mono text-2xs opacity-60">{edges.length} links</span>
          </div>
        </div>
      </div>

      {/* ── Map (full-width) + sidebar below on mobile, beside on lg ── */}
      <div className="grid gap-0 lg:grid-cols-[1fr_220px]">
        {/* ── Map canvas ── */}
        <div
          ref={mapRef}
          className="relative overflow-hidden"
          style={{ aspectRatio: `${SVG_W} / ${SVG_H}`, minHeight: 0, backgroundColor: DARK_SURFACE.bg }}
        >
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={block.title}
          >
            <defs>
              <radialGradient id={bgId} cx="42%" cy="38%" r="68%">
                <stop offset="0%" stopColor={DARK_SURFACE.gradientTop} />
                <stop offset="100%" stopColor={DARK_SURFACE.gradientMid} />
              </radialGradient>
              <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={PASTEL.lavender} stopOpacity={0.14} />
                <stop offset="100%" stopColor={PASTEL.lavender} stopOpacity={0} />
              </radialGradient>
              {/* Atmospheric vignette — matches globe edge glow */}
              <radialGradient id={`${bgId}-atmos`} cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="75%" stopColor="transparent" />
                <stop offset="100%" stopColor={DARK_SURFACE.gradientBot} stopOpacity={0.6} />
              </radialGradient>
              <filter id={`${bgId}-blur`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="22" />
              </filter>
            </defs>

            <rect x={0} y={0} width={SVG_W} height={SVG_H} fill={`url(#${bgId})`} />

            {/* Wireframe-style graticule — matches GlobeWireframe latitude/longitude lines */}
            {[-60, -30, 0, 30, 60].map(lat => {
              const { y } = latLonToMercator(lat, 0, SVG_W, SVG_H)
              return (
                <g key={`lat-${lat}`}>
                  <line x1={0} y1={y} x2={SVG_W} y2={y} stroke={DARK_SURFACE.graticule} strokeWidth={0.5} strokeDasharray={lat === 0 ? 'none' : '3 6'} />
                  <text x={8} y={y - 3} fill={DARK_SURFACE.labelText} fontSize="6" fontFamily="var(--font-mono)" opacity={0.7}>
                    {Math.abs(lat)}°{lat >= 0 ? 'N' : 'S'}
                  </text>
                </g>
              )
            })}
            {[-120, -60, 0, 60, 120].map(lon => {
              const { x } = latLonToMercator(0, lon, SVG_W, SVG_H)
              return <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={SVG_H} stroke={DARK_SURFACE.graticule} strokeWidth={0.5} strokeDasharray="3 6" />
            })}

            {/* Country outlines — real GeoJSON silhouettes, softer fill */}
            {WORLD_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={DARK_SURFACE.worldFill}
                stroke={DARK_SURFACE.worldStroke}
                strokeWidth={0.4}
                strokeLinejoin="round"
                opacity={0.85}
              />
            ))}

            {/* Ambient glow behind top clusters — pastel tones */}
            {topRegions.slice(0, 3).map((region, i) => {
              const { x, y } = latLonToMercator(region.lat, region.lon, SVG_W, SVG_H)
              const glowColor = PASTEL_SCALE[i % PASTEL_SCALE.length]
              return (
                <circle
                  key={`glow-${region.name}`}
                  cx={x} cy={y} r={45}
                  fill={glowColor}
                  fillOpacity={0.06}
                  filter={`url(#${bgId}-blur)`}
                />
              )
            })}

            {/* Atmospheric vignette overlay */}
            <rect x={0} y={0} width={SVG_W} height={SVG_H} fill={`url(#${bgId}-atmos)`} />

            {/* Network edges — atmospheric arcs matching globe connection style */}
            {edges.map((e, i) => (
              <motion.path
                key={`edge-${i}`}
                d={e.path}
                fill="none"
                stroke={PASTEL_SCALE[i % PASTEL_SCALE.length]}
                strokeWidth={0.8}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: getEdgeOpacity(e.va, e.vb, maxValue),
                }}
                transition={{ ...SPRING_SOFT, delay: 0.4 + i * 0.006 }}
              />
            ))}

            {/* Region nodes — back-to-front by value */}
            {[...regions]
              .toSorted((a, b) => a.value - b.value)
              .map((region, index) => {
                const { x, y } = latLonToMercator(region.lat, region.lon, SVG_W, SVG_H)
                const value = finiteValue(region.value)
                const radius = getDotRadius(value, maxValue)
                const color = getDotColor(value, maxValue, block.colorScale)
                const isTop = topRegions.some(t => t.name === region.name)
                const rank = sorted.findIndex(r => r.name === region.name)
                const isHovered = hoveredRegion === (region.label ?? region.name)

                return (
                  <g key={region.name}>
                    {/* Breathing halo for top regions — atmospheric pulse */}
                    {isTop && (
                      <motion.circle
                        cx={x} cy={y} r={radius * 2.5}
                        fill="none"
                        stroke={color}
                        strokeWidth={0.5}
                        initial={{ opacity: 0, r: radius * 2.5 }}
                        animate={{
                          opacity: [0.04, 0.12, 0.04],
                          r: [radius * 2.5, radius * 3.2, radius * 2.5],
                        }}
                        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.3 }}
                      />
                    )}

                    {/* Outer glow — depth-based like globe nodes */}
                    <motion.circle
                      cx={x} cy={y}
                      r={radius * 2.2}
                      fill={color}
                      fillOpacity={isHovered ? 0.18 : 0.08}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ ...SPRING_SOFT, delay: 0.15 + index * 0.012 }}
                    />

                    {/* Core dot — pastel with soft white stroke */}
                    <motion.circle
                      cx={x} cy={y}
                      r={radius}
                      fill={color}
                      stroke={isTop ? 'rgba(255,255,255,0.5)' : 'rgba(180,200,220,0.18)'}
                      strokeWidth={isTop ? 0.8 : 0.4}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: isHovered ? 1.3 : 1,
                        opacity: 0.85,
                      }}
                      transition={{ ...SPRING_SNAPPY, delay: 0.15 + index * 0.012 }}
                      style={{ cursor: 'pointer' }}
                      aria-label={`${region.label ?? region.name}: ${value}`}
                      onMouseEnter={() =>
                        handleRegionHover({ x, y, label: region.label ?? region.name, value, color, rank })
                      }
                      onMouseLeave={() => handleRegionHover(null)}
                    />

                    {/* Label for top 4 regions */}
                    {isTop && rank < 4 && (
                      <motion.text
                        x={x}
                        y={y - radius - 7}
                        textAnchor="middle"
                        fill={DARK_SURFACE.subtleText}
                        fontSize="7"
                        fontFamily="var(--font-mono)"
                        fontWeight={500}
                        letterSpacing="0.02em"
                        initial={{ opacity: 0, y: y - radius }}
                        animate={{ opacity: 0.85, y: y - radius - 7 }}
                        transition={{ ...SPRING_SOFT, delay: 0.6 + index * 0.04 }}
                      >
                        {region.label ?? region.name}
                      </motion.text>
                    )}
                  </g>
                )
              })}
          </svg>

          {/* ── Tooltip overlay ── */}
          <AnimatePresence>
            {tooltip && (
              <motion.div
                key="map-tooltip"
                role="tooltip"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={CHART.tooltipSpring}
                className="pointer-events-none absolute z-20"
                style={tooltipStyle}
              >
                <div className="relative rounded-lg border border-white/8 bg-[#0C1220]/92 px-3 py-2 shadow-2xl backdrop-blur-md">
                  {/* Arrow */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-white/8 bg-[#0C1220]/92"
                    style={{
                      bottom: (tooltip.y / SVG_H) * 100 < 18 ? 'auto' : '-5px',
                      top: (tooltip.y / SVG_H) * 100 < 18 ? '-5px' : 'auto',
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tooltip.color }} />
                    <span className="text-11 font-medium text-white/95">{tooltip.label}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5 pl-4">
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {tooltip.value.toLocaleString()}
                    </span>
                    {block.unit && (
                      <span className="text-2xs text-white/50">{block.unit}</span>
                    )}
                  </div>
                  {tooltip.rank < block.regions.length && (
                    <div className="mt-0.5 pl-4 text-[0.5625rem] font-mono text-white/35">
                      #{tooltip.rank + 1} of {block.regions.length}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Side panel ── */}
        <div className="border-t border-rule p-3 lg:border-l lg:border-t-0 space-y-3 overflow-hidden">
          {/* Top regions list */}
          <div>
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-2">
              Top regions
            </div>
            <div className="space-y-0.5">
              {topRegions.map((region, i) => {
                const value = finiteValue(region.value)
                const color = getDotColor(value, maxValue, block.colorScale)
                const pct = ((value / maxValue) * 100).toFixed(0)
                const label = region.label ?? region.name
                const isHovered = hoveredRegion === label
                return (
                  <motion.div
                    key={region.name}
                    className={cn(
                      'group rounded-md px-1.5 py-1 transition-colors',
                      isHovered && 'bg-surface-active',
                    )}
                    onMouseEnter={() => {
                      const { x, y } = latLonToMercator(region.lat, region.lon, SVG_W, SVG_H)
                      handleRegionHover({ x, y, label, value, color, rank: i })
                    }}
                    onMouseLeave={() => handleRegionHover(null)}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SPRING_SOFT, delay: 0.2 + i * 0.04 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0 ring-2 ring-transparent transition-shadow"
                          style={{
                            backgroundColor: color,
                            boxShadow: isHovered ? `0 0 0 3px ${color}22` : 'none',
                          }}
                        />
                        <span className="text-xs text-text-primary truncate">{label}</span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-text-primary shrink-0">
                        {value.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-[3px] rounded-full bg-surface-active mx-0.5 mt-1">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ ...SPRING_SOFT, delay: 0.35 + i * 0.05 }}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          {hasVariation && <MapLegend colorScale={block.colorScale} />}

          {/* External link */}
          <a
            href="https://geo-decentralization.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-rule bg-white px-3 py-2 text-xs text-accent',
              'transition-all hover:border-accent/30 hover:shadow-sm',
            )}
          >
            <ExternalLink className="h-3 w-3" />
            3D Viewer
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── Legend sub-component ── */
function MapLegend({ colorScale }: { readonly colorScale?: string }) {
  if (colorScale === 'binary') {
    return (
      <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">Presence</div>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PASTEL.mint }} /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-text-faint" /> Absent
          </span>
        </div>
      </div>
    )
  }

  if (colorScale === 'change') {
    return (
      <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">Change</div>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PASTEL.mint }} /> Increase
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PASTEL.rose }} /> Decrease
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-text-faint" /> No change
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">Stake concentration</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DARK_SURFACE.grayscaleStroke }} />
          <span className="text-2xs">Low</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PASTEL.sky }} />
          <span className="text-2xs">Moderate</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PASTEL.lavender }} />
          <span className="text-2xs">High</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PASTEL.peach }} />
          <span className="text-2xs">Dominant</span>
        </span>
      </div>
      <p className="text-[0.5625rem] text-text-faint mt-1.5 leading-tight">
        Node size and color reflect relative validator share. Paper metrics: Gini<sub>g</sub>, HHI<sub>g</sub>.
      </p>
    </div>
  )
}
