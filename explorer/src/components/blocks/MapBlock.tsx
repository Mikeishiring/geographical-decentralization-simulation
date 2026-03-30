import { useId, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { SPRING, SPRING_SOFT } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { WORLD_PATHS } from '../../data/world-paths'
import type { MapBlock as MapBlockType } from '../../types/blocks'

interface MapBlockProps {
  block: MapBlockType
}

function latLonToMercator(lat: number, lon: number, width: number, height: number) {
  const x = ((lon + 180) / 360) * width
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = height / 2 - (mercN / Math.PI) * (height / 2)
  return { x, y }
}

function getDotRadius(value: number, maxValue: number): number {
  const normalized = Math.max(value / Math.max(maxValue, 1), 0.05)
  return 3 + normalized * 8
}

function getDotColor(value: number, maxValue: number, colorScale?: string): string {
  if (colorScale === 'binary') return value > 0 ? '#16A34A' : '#3B3B3B'
  if (colorScale === 'change') {
    if (value > 0) return '#16A34A'
    if (value < 0) return '#DC2626'
    return '#555'
  }
  const t = Math.min(value / Math.max(maxValue, 1), 1)
  if (t < 0.1) return '#64748B'
  if (t < 0.3) return '#2563EB'
  if (t < 0.6) return '#C2553A'
  return '#F59E0B'
}

function getEdgeOpacity(va: number, vb: number, maxValue: number): number {
  const combined = (va + vb) / (2 * Math.max(maxValue, 1))
  return 0.06 + combined * 0.18
}

export function MapBlock({ block }: MapBlockProps) {
  const bgId = useId()
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null)

  if (block.regions.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-white">
        <div className="border-b border-border-subtle px-5 py-3">
          <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
        </div>
        <div className="px-5 py-8 text-center text-xs text-muted">No region data available</div>
      </div>
    )
  }

  const maxValue = Math.max(...block.regions.map(r => r.value), 1)

  const sorted = useMemo(
    () => [...block.regions].toSorted((a, b) => b.value - a.value),
    [block.regions],
  )
  const topRegions = sorted.slice(0, 6)

  const svgW = 800
  const svgH = 420

  const edges = useMemo(() => {
    const pts = block.regions.map(r => ({
      ...r,
      ...latLonToMercator(r.lat, r.lon, svgW, svgH),
    }))
    const result: { x1: number; y1: number; x2: number; y2: number; va: number; vb: number }[] = []
    const N = Math.min(3, pts.length - 1)
    for (const p of pts) {
      const distances = pts
        .filter(q => q.name !== p.name)
        .map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
        .toSorted((a, b) => a.d - b.d)
        .slice(0, N)
      for (const { q } of distances) {
        if (p.name < q.name) {
          result.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, va: p.value, vb: q.value })
        }
      }
    }
    return result
  }, [block.regions])

  // Determine if data is meaningful (not all the same value)
  const hasVariation = new Set(block.regions.map(r => r.value)).size > 1

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-white">
      <div className="border-b border-border-subtle px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent dot-pulse" />
            <h3 className="text-sm font-medium text-text-primary">{block.title}</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{block.regions.length} regions</span>
            <span className="font-mono text-[10px]">{edges.length} links</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.5fr_minmax(0,0.55fr)]">
        {/* ── Map ── */}
        <div className="relative overflow-hidden rounded-lg bg-[#0D1117]" style={{ minHeight: 300 }}>
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="relative w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={block.title}
          >
            <defs>
              <radialGradient id={bgId} cx="45%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#131A24" />
                <stop offset="100%" stopColor="#0D1117" />
              </radialGradient>
            </defs>

            <rect x={0} y={0} width={svgW} height={svgH} fill={`url(#${bgId})`} />

            {/* Subtle graticule */}
            {[0.25, 0.5, 0.75].map(f => (
              <line key={`h-${f}`} x1={0} y1={svgH * f} x2={svgW} y2={svgH * f}
                stroke="#1E293B" strokeWidth={0.5} />
            ))}
            {[0.25, 0.5, 0.75].map(f => (
              <line key={`v-${f}`} x1={svgW * f} y1={0} x2={svgW * f} y2={svgH}
                stroke="#1E293B" strokeWidth={0.5} />
            ))}

            {/* Country outlines from real GeoJSON — faint geographic context */}
            {WORLD_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="#1A2332"
                stroke="#243044"
                strokeWidth={0.3}
                strokeLinejoin="round"
              />
            ))}

            {/* Network edges */}
            {edges.map((e, i) => (
              <motion.line
                key={`edge-${i}`}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke="#2563EB"
                strokeWidth={0.5}
                opacity={getEdgeOpacity(e.va, e.vb, maxValue)}
                initial={{ opacity: 0 }}
                animate={{ opacity: getEdgeOpacity(e.va, e.vb, maxValue) }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.008 }}
              />
            ))}

            {/* Region nodes — sorted back-to-front so large dots render on top */}
            {[...block.regions]
              .toSorted((a, b) => a.value - b.value)
              .map((region, index) => {
                const { x, y } = latLonToMercator(region.lat, region.lon, svgW, svgH)
                const radius = getDotRadius(region.value, maxValue)
                const color = getDotColor(region.value, maxValue, block.colorScale)
                const isTop = topRegions.some(t => t.name === region.name)

                return (
                  <g key={region.name}>
                    {isTop && (
                      <motion.circle
                        cx={x} cy={y} r={radius * 2.8}
                        fill={color} fillOpacity={0.04}
                        animate={{ r: [radius * 2.6, radius * 3, radius * 2.6], fillOpacity: [0.04, 0.08, 0.04] }}
                        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.2 }}
                      />
                    )}
                    <motion.circle
                      cx={x} cy={y} r={radius * 1.8}
                      fill={color} fillOpacity={0.08}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ ...SPRING_SOFT, delay: 0.2 + index * 0.015 }}
                    />
                    <motion.circle
                      cx={x} cy={y} r={radius}
                      fill={color}
                      stroke={isTop ? '#fff' : '#334155'}
                      strokeWidth={isTop ? 1.2 : 0.5}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...SPRING, delay: 0.2 + index * 0.015 }}
                      style={{ cursor: 'pointer' }}
                      aria-label={`${region.label ?? region.name}: ${region.value}`}
                      onMouseEnter={() => setTooltip({ x, y, label: region.label ?? region.name, value: region.value })}
                      onMouseLeave={() => setTooltip(null)}
                      whileHover={{ scale: 1.25 }}
                    />
                    {isTop && (
                      <text
                        x={x} y={y - radius - 5}
                        textAnchor="middle"
                        fill="#94A3B8"
                        fontSize="8"
                        fontFamily="var(--font-mono)"
                      >
                        {region.label ?? region.name}
                      </text>
                    )}
                  </g>
                )
              })}

            <text x={6} y={12} fill="#334155" fontSize="7" fontFamily="var(--font-mono)">90°N</text>
            <text x={6} y={svgH - 4} fill="#334155" fontSize="7" fontFamily="var(--font-mono)">90°S</text>
            <text x={svgW - 30} y={svgH - 4} fill="#334155" fontSize="7" fontFamily="var(--font-mono)">180°E</text>
          </svg>

          {tooltip && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute z-10 rounded-md border border-[#334155] bg-[#1A2332] px-2.5 py-1.5 text-xs shadow-lg"
              style={{
                left: `${(tooltip.x / svgW) * 100}%`,
                top: `${(tooltip.y / svgH) * 100}%`,
                transform: 'translate(-50%, -120%)',
              }}
            >
              <div className="text-white font-medium">{tooltip.label}</div>
              <div className="text-[#94A3B8] tabular-nums">
                {tooltip.value.toLocaleString()}{block.unit ? ` ${block.unit}` : ''}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Side panel ── */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border-subtle bg-white p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint mb-2">
              Top regions
            </div>
            <div className="space-y-1">
              {topRegions.map(region => {
                const color = getDotColor(region.value, maxValue, block.colorScale)
                const pct = ((region.value / maxValue) * 100).toFixed(0)
                return (
                  <div key={region.name} className="group">
                    <div className="flex items-center justify-between gap-2 px-1 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs text-text-primary truncate">
                          {region.label ?? region.name}
                        </span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-text-primary shrink-0">
                        {region.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-0.5 rounded-full bg-surface-active mx-1 mb-0.5">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend — conditional on colorScale */}
          {hasVariation && <MapLegend colorScale={block.colorScale} />}

          <a
            href="https://geo-decentralization.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-white px-3 py-2 text-xs text-accent transition-colors hover:border-accent/30',
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

function MapLegend({ colorScale }: { readonly colorScale?: string }) {
  if (colorScale === 'binary') {
    return (
      <div className="rounded-lg border border-border-subtle bg-white p-3 text-xs text-muted">
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint mb-2">Presence</div>
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#3B3B3B]" /> Absent
          </span>
        </div>
      </div>
    )
  }

  if (colorScale === 'change') {
    return (
      <div className="rounded-lg border border-border-subtle bg-white p-3 text-xs text-muted">
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint mb-2">Change</div>
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> Increase
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#DC2626]" /> Decrease
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#555]" /> No change
          </span>
        </div>
      </div>
    )
  }

  // Default: density gradient legend
  return (
    <div className="rounded-lg border border-border-subtle bg-white p-3 text-xs text-muted">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint mb-2">Concentration</div>
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#64748B]" /> Low (&lt;10% of max)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#2563EB]" /> Moderate (10–30%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#C2553A]" /> High (30–60%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#F59E0B]" /> Dominant (&gt;60%)
        </span>
      </div>
      <p className="text-[10px] text-text-faint mt-2">
        Node size and color reflect relative share of the maximum value.
      </p>
    </div>
  )
}
