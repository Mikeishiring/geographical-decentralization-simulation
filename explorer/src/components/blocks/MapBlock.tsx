import { useId, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { LIGHT_SURFACE, SPRING_SOFT, SPRING_SNAPPY, SPRING_POPUP } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { WORLD_PATHS } from '../../data/world-paths'
import type { MapBlock as MapBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'

interface MapBlockProps {
  block: MapBlockType
}

/* ── Light surface blue ramp ── */
const BLUE_RAMP = {
  low: LIGHT_SURFACE.blue100,
  mid: LIGHT_SURFACE.blue400,
  high: LIGHT_SURFACE.blue600,
  top: LIGHT_SURFACE.blue700,
  source: '#0D9488',
} as const

/* ── Region color map — keyed by GCP region prefix ── */
const REGION_PREFIX_COLORS: readonly [string, string][] = [
  ['us-',            '#C2553A'], // terracotta
  ['northamerica-',  '#C2553A'], // terracotta
  ['europe-',        '#2563EB'], // blue
  ['asia-',          '#16A34A'], // green
  ['me-',            '#D97706'], // amber
  ['southamerica-',  '#7C3AED'], // purple
  ['africa-',        '#0F766E'], // teal
  ['australia-',     '#DC2626'], // red
]
const REGION_COLOR_DEFAULT = '#94A3B8' // slate

function getRegionColor(regionName: string): string {
  for (const [prefix, color] of REGION_PREFIX_COLORS) {
    if (regionName.startsWith(prefix)) return color
  }
  return REGION_COLOR_DEFAULT
}

/* ── Projection — Natural Earth I (must match generate-map-data.mjs) ── */
const NE_A = [0.8707, -0.131979, -0.013791, 0.003971, -0.001529] as const
const NE_B = [1.007226, 0.015085, -0.044475, 0.028874, -0.005916] as const

function latLonToMercator(lat: number, lon: number, width: number, height: number) {
  const phi = (lat * Math.PI) / 180
  const lam = (lon * Math.PI) / 180
  const phi2 = phi * phi

  const xFactor = NE_A[0] + phi2 * (NE_A[1] + phi2 * (NE_A[2] + phi2 * (NE_A[3] + phi2 * NE_A[4])))
  const yFactor = NE_B[0] + phi2 * (NE_B[1] + phi2 * (NE_B[2] + phi2 * (NE_B[3] + phi2 * NE_B[4])))

  const rawX = lam * xFactor
  const rawY = phi * yFactor

  const xRange = Math.PI * NE_A[0]
  const yRange = (Math.PI / 2) * NE_B[0]
  const x = (rawX / xRange + 1) / 2 * width
  const y = (1 - rawY / yRange) / 2 * height

  return { x, y }
}

/* ── Dot sizing — sqrt scale for perceptually fair area encoding ── */
function getDotRadius(value: number, maxValue: number): number {
  const normalized = Math.max(value / Math.max(maxValue, 1), 0.04)
  return 3.5 + Math.sqrt(normalized) * 9
}

function getDotColor(value: number, maxValue: number, colorScale?: string, regionName?: string): string {
  if (colorScale === 'binary') return value > 0 ? BLUE_RAMP.source : '#D6D3D1'
  if (colorScale === 'change') {
    if (value > 0) return BLUE_RAMP.source
    if (value < 0) return '#EF4444'
    return '#D6D3D1'
  }
  // Default: use region prefix color instead of blue ramp
  if (regionName) return getRegionColor(regionName)
  const t = Math.min(value / Math.max(maxValue, 1), 1)
  if (t < 0.1) return '#94A3B8'
  if (t < 0.3) return BLUE_RAMP.low
  if (t < 0.6) return BLUE_RAMP.mid
  if (t < 0.85) return BLUE_RAMP.high
  return BLUE_RAMP.top
}

function getEdgeOpacity(va: number, vb: number, maxValue: number): number {
  const combined = (va + vb) / (2 * Math.max(maxValue, 1))
  return 0.12 + combined * 0.15
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
  const top3Names = useMemo(() => new Set(sorted.slice(0, 3).map(r => r.name)), [sorted])

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
    return <BlockEmptyState title={block.title} message="No region coordinates or values were attached to this map." />
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
          style={{ aspectRatio: `${SVG_W} / ${SVG_H}`, minHeight: 0, backgroundColor: LIGHT_SURFACE.bg }}
        >
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="block h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={block.title}
          >
            <defs>
              <filter id={`${bgId}-label-shadow`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
                <feOffset dy="0.5" />
                <feComponentTransfer><feFuncA type="linear" slope="0.08" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <rect x={0} y={0} width={SVG_W} height={SVG_H} fill={LIGHT_SURFACE.bg} />

            {/* Wireframe-style graticule — curved for Natural Earth projection */}
            {[-60, -30, 0, 30, 60].map(lat => {
              const pts = Array.from({ length: 37 }, (_, i) => latLonToMercator(lat, -180 + i * 10, SVG_W, SVG_H))
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
              const label = latLonToMercator(lat, -170, SVG_W, SVG_H)
              return (
                <g key={`lat-${lat}`}>
                  <path d={d} fill="none" stroke={LIGHT_SURFACE.graticule} strokeWidth={0.3} strokeDasharray={lat === 0 ? 'none' : '2 5'} />
                  <text x={label.x} y={label.y - 3} fill={LIGHT_SURFACE.labelText} fontSize="6" fontFamily="var(--font-mono)" opacity={0.5}>
                    {Math.abs(lat)}°{lat >= 0 ? 'N' : 'S'}
                  </text>
                </g>
              )
            })}
            {[-120, -60, 0, 60, 120].map(lon => {
              const pts = Array.from({ length: 19 }, (_, i) => latLonToMercator(-90 + i * 10, lon, SVG_W, SVG_H))
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
              return <path key={`lon-${lon}`} d={d} fill="none" stroke={LIGHT_SURFACE.graticule} strokeWidth={0.3} strokeDasharray="2 5" />
            })}

            {/* Country outlines — real GeoJSON silhouettes, softer fill */}
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

            {/* Network edges — light neutral arcs */}
            {edges.map((e, i) => (
              <motion.path
                key={`edge-${i}`}
                d={e.path}
                fill="none"
                stroke={LIGHT_SURFACE.edgeStroke}
                strokeWidth={0.4}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: getEdgeOpacity(e.va, e.vb, maxValue),
                }}
                transition={{ ...SPRING_SOFT, delay: 0.4 + i * 0.006 }}
              />
            ))}

            {/* Region nodes — flat circles, back-to-front by value */}
            {[...regions]
              .toSorted((a, b) => a.value - b.value)
              .map((region, index) => {
                const { x, y } = latLonToMercator(region.lat, region.lon, SVG_W, SVG_H)
                const value = finiteValue(region.value)
                const radius = getDotRadius(value, maxValue)
                const color = getDotColor(value, maxValue, block.colorScale, region.name)
                const isTop = topRegions.some(t => t.name === region.name)
                const isTop3 = top3Names.has(region.name)
                const rank = sorted.findIndex(r => r.name === region.name)
                const isHovered = hoveredRegion === (region.label ?? region.name)

                return (
                  <g key={region.name}>
                    {/* Breathing halo for top 3 nodes — light canvas, region color at 8% opacity */}
                    {isTop3 && (
                      <motion.circle
                        cx={x}
                        cy={y}
                        r={radius + 4}
                        fill={color}
                        fillOpacity={0.08}
                        stroke="none"
                        animate={{
                          r: [radius + 4, radius + 9, radius + 4],
                          fillOpacity: [0.08, 0.04, 0.08],
                        }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: index * 0.4,
                        }}
                      />
                    )}

                    {/* Flat circle — solid fill, white stroke */}
                    <motion.circle
                      cx={x} cy={y}
                      r={radius}
                      fill={color}
                      stroke="white"
                      strokeWidth={0.8}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: isHovered ? 1.15 : 1,
                        opacity: 1,
                      }}
                      transition={{ ...SPRING_SNAPPY, delay: 0.15 + index * 0.012 }}
                      style={{ cursor: 'pointer' }}
                      aria-label={`${region.label ?? region.name}: ${value}`}
                      onMouseEnter={() =>
                        handleRegionHover({ x, y, label: region.label ?? region.name, value, color, rank })
                      }
                      onMouseLeave={() => handleRegionHover(null)}
                    />

                    {/* Label for top 4 regions — dark text on white pill */}
                    {isTop && rank < 4 && (
                      <motion.g
                        filter={`url(#${bgId}-label-shadow)`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ ...SPRING_SOFT, delay: 0.6 + index * 0.04 }}
                      >
                        <rect
                          x={x - ((region.label ?? region.name).length * 2.4 + 7)}
                          y={y - radius - 16}
                          width={((region.label ?? region.name).length * 4.8 + 14)}
                          height={14}
                          rx={4}
                          fill="white"
                          stroke={LIGHT_SURFACE.tooltipBorder}
                          strokeWidth={0.5}
                        />
                        <text
                          x={x}
                          y={y - radius - 6}
                          textAnchor="middle"
                          fill={LIGHT_SURFACE.subtleText}
                          fontSize="7"
                          fontFamily="var(--font-mono)"
                          fontWeight={500}
                          letterSpacing="0.02em"
                        >
                          {region.label ?? region.name}
                        </text>
                      </motion.g>
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
                transition={SPRING_POPUP}
                className="pointer-events-none absolute z-20"
                style={tooltipStyle}
              >
                <div className="relative rounded-lg border border-stone-200 backdrop-blur-sm bg-white/95 px-3 py-2 shadow-lg">
                  {/* Arrow */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-stone-200 bg-white/95"
                    style={{
                      bottom: (tooltip.y / SVG_H) * 100 < 18 ? 'auto' : '-5px',
                      top: (tooltip.y / SVG_H) * 100 < 18 ? '-5px' : 'auto',
                    }}
                  />
                  <div className="flex items-center gap-2">
                    {/* Region color dot */}
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: tooltip.color }}
                    />
                    <span className="text-11 font-medium text-stone-900">{tooltip.label}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5 pl-[18px]">
                    <span className="text-sm font-semibold tabular-nums text-stone-900">
                      {tooltip.value.toLocaleString()}
                    </span>
                    {block.unit && (
                      <span className="text-2xs text-stone-400">{block.unit}</span>
                    )}
                  </div>
                  {tooltip.rank < block.regions.length && (
                    <div className="mt-0.5 pl-[18px] text-[0.5625rem] font-mono text-stone-300">
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
                const color = getDotColor(value, maxValue, block.colorScale, region.name)
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

/* ── Region color legend entries ── */
const REGION_LEGEND_ENTRIES: readonly { label: string; color: string }[] = [
  { label: 'North America', color: '#C2553A' },
  { label: 'Europe',        color: '#2563EB' },
  { label: 'Asia Pacific',  color: '#16A34A' },
  { label: 'Middle East',   color: '#D97706' },
  { label: 'S. America',    color: '#7C3AED' },
  { label: 'Africa',        color: '#0F766E' },
  { label: 'Australia',     color: '#DC2626' },
]

/* ── Legend sub-component ── */
function MapLegend({ colorScale }: { readonly colorScale?: string }) {
  if (colorScale === 'binary') {
    return (
      <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">Presence</div>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BLUE_RAMP.source }} /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-stone-300" /> Absent
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
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BLUE_RAMP.source }} /> Increase
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#EF4444' }} /> Decrease
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-stone-300" /> No change
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-rule bg-surface-active/40 p-2.5 text-xs text-muted">
      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-1.5">Region</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {REGION_LEGEND_ENTRIES.map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-2xs truncate">{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
