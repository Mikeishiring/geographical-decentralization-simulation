/**
 * Static and data-driven SVG layers for the evidence map.
 * Extracted from EvidenceMapSurface.tsx to keep each file under 800 lines.
 */
import { memo } from 'react'
import { motion } from 'framer-motion'
import { LIGHT_SURFACE, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { WORLD_PATHS } from '../../data/world-paths'
import {
  SVG_W,
  SVG_H,
  MAP_VISIBLE_H,
  latLonToMercator,
  nodeRadius,
  nodeColor,
  NODE_BLUE,
  type RegionNode,
  type OverlayMode,
  type LabelPlacement,
  type TooltipData,
} from './evidence-map-helpers'

// ── Graticule + country outlines (pure, memoized) ──────────────────────────

const LAT_LINES = [-30, 0, 30, 60] as const
const LON_LINES = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150] as const

export const MapBaseLayers = memo(function MapBaseLayers({ idPrefix }: { readonly idPrefix: string }) {
  return (
    <>
      {/* Background — warm paper canvas */}
      <rect width={SVG_W} height={MAP_VISIBLE_H} fill={`url(#${idPrefix}-bg)`} />

      {/* Latitude graticule — curved for Natural Earth */}
      {LAT_LINES.map(lat => {
        const pts = Array.from({ length: 37 }, (_, i) => latLonToMercator(lat, -180 + i * 10, SVG_W, SVG_H))
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
        const label = latLonToMercator(lat, -170, SVG_W, SVG_H)
        return (
          <g key={`lat-${lat}`}>
            <path d={d} fill="none" stroke={LIGHT_SURFACE.graticule} strokeWidth={0.4} strokeDasharray={lat === 0 ? 'none' : '2 5'} />
            <text x={label.x} y={label.y - 3} fill={LIGHT_SURFACE.labelText} fontSize="7" fontFamily="var(--font-mono)" opacity={0.5}>
              {Math.abs(lat)}&deg;{lat >= 0 ? 'N' : 'S'}
            </text>
          </g>
        )
      })}

      {/* Longitude graticule */}
      {LON_LINES.map(lon => {
        const pts = Array.from({ length: 19 }, (_, i) => latLonToMercator(-90 + i * 10, lon, SVG_W, SVG_H))
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
        return <path key={`lon-${lon}`} d={d} fill="none" stroke={LIGHT_SURFACE.graticule} strokeWidth={0.4} strokeDasharray="2 5" />
      })}

      {/* Country outlines */}
      {WORLD_PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={LIGHT_SURFACE.worldFill}
          stroke={LIGHT_SURFACE.worldStroke}
          strokeWidth={0.3}
          strokeLinejoin="round"
        />
      ))}
    </>
  )
})

// ── Region node rendering ──────────────────────────────────────────────────

interface MapNodeLayerProps {
  readonly displayNodes: readonly RegionNode[]
  readonly sorted: readonly RegionNode[]
  readonly maxCount: number
  readonly overlay: OverlayMode
  readonly hoveredRegion: string | null
  readonly playing: boolean
  readonly idPrefix: string
  readonly onHover: (data: TooltipData | null) => void
}

export const MapNodeLayer = memo(function MapNodeLayer({
  displayNodes, sorted, maxCount, overlay, hoveredRegion, playing, idPrefix, onHover,
}: MapNodeLayerProps) {
  return (
    <>
      {/* Ambient glow behind top 5 regions */}
      {sorted.slice(0, 5).map((node, i) => {
        const color = i === 0 ? NODE_BLUE.top : NODE_BLUE.high
        const intensity = i < 3 ? 0.08 : 0.05
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

      {/* Region nodes */}
      {displayNodes.map((node, index) => {
        const rank = sorted.findIndex(n => n.id === node.id)
        const r = nodeRadius(node.count, maxCount)
        const color = overlay === 'sources' ? NODE_BLUE.source : nodeColor(node.count, maxCount)
        const isTop = rank < 6
        const isTop3 = rank < 3
        const isHovered = hoveredRegion === node.id

        const hoverProps = {
          style: { cursor: 'pointer' as const },
          onMouseEnter: () => onHover({
            x: node.x, y: node.y,
            city: node.city, id: node.id,
            count: node.count, rank,
            total: displayNodes.length,
            macroRegion: node.macroRegion,
          }),
          onMouseLeave: () => onHover(null),
        }

        return (
          <g key={node.id} filter={isTop3 ? `url(#${idPrefix}-node-shadow)` : undefined}>
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
              fillOpacity={isHovered ? 0.25 : isTop3 ? 0.12 : 0.06}
              filter={isTop3 ? `url(#${idPrefix}-node-glow)` : undefined}
            />

            {/* Core node — base fill */}
            {playing ? (
              <circle
                cx={node.x} cy={node.y}
                r={r}
                fill={color}
                opacity={0.94}
                stroke={isTop ? LIGHT_SURFACE.haloStroke : 'rgba(0,0,0,0.03)'}
                strokeWidth={isTop3 ? 0.8 : isTop ? 0.5 : 0.3}
                {...hoverProps}
              />
            ) : (
              <motion.circle
                cx={node.x} cy={node.y}
                r={r}
                fill={color}
                stroke={isTop ? LIGHT_SURFACE.haloStroke : 'rgba(0,0,0,0.03)'}
                strokeWidth={isTop3 ? 0.8 : isTop ? 0.5 : 0.3}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: isHovered ? 1.2 : 1, opacity: 0.94 }}
                transition={{ ...SPRING_SNAPPY, delay: 0.1 + index * 0.008 }}
                {...hoverProps}
              />
            )}

            {/* Orb highlight — radial gradient overlay for 3D sphere feel */}
            <circle
              cx={node.x} cy={node.y}
              r={r}
              fill={`url(#${idPrefix}-orb)`}
              pointerEvents="none"
            />

            {/* Rim light — subtle inner ring for depth */}
            {isTop && (
              <circle
                cx={node.x} cy={node.y}
                r={r * 0.7}
                fill="none"
                stroke={LIGHT_SURFACE.rimLight}
                strokeWidth={0.4}
                pointerEvents="none"
              />
            )}
          </g>
        )
      })}
    </>
  )
})

// ── Label layer — collision-aware placement ────────────────────────────────

interface MapLabelLayerProps {
  readonly labelPositions: readonly LabelPlacement[]
  readonly playing: boolean
}

export const MapLabelLayer = memo(function MapLabelLayer({ labelPositions, playing }: MapLabelLayerProps) {
  if (playing) return null

  return (
    <>
      {labelPositions.map(lp => (
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
              stroke="rgba(0,0,0,0.15)"
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
            fill={lp.rank < 3 ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.65)'}
            fontSize={lp.rank < 3 ? '7.5' : '7'}
            fontFamily="var(--font-mono)"
            fontWeight={lp.rank < 3 ? 600 : 500}
            letterSpacing="0.02em"
          >
            {lp.city}
          </text>
        </motion.g>
      ))}
    </>
  )
})
