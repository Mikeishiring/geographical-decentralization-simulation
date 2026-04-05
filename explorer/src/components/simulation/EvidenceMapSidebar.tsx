/**
 * Sidebar panel for the evidence map — metrics, continents, top regions, legends.
 * Extracted from EvidenceMapSurface.tsx to keep it under the 800-line limit.
 */
import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { SPRING_SOFT, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { InlineTooltip } from '../ui/Tooltip'
import { LATENCY_MIN, LATENCY_MAX } from '../../data/gcp-latency'
import { formatNumber } from './simulation-constants'
import { THRESHOLDS, SENTIMENT_TEXT, sentimentLower, sentimentHigher } from './simulation-evidence-constants'
import { regionColor, REGION_COLORS, NODE_BLUE, type RegionNode, type OverlayMode, type TooltipData } from './evidence-map-helpers'
import { LIVENESS_DESCRIPTION, LIVENESS_LABEL, formatLivenessCount } from './simulation-analytics'

interface MacroBreakdownEntry {
  readonly region: string
  readonly count: number
  readonly share: number
}

interface EvidenceMapSidebarProps {
  readonly className?: string
  readonly style?: CSSProperties
  readonly overlay: OverlayMode
  readonly slot: number
  readonly gini: number | undefined
  readonly hhi: number | undefined
  readonly liveness: number | undefined
  readonly clusters: number | undefined
  readonly distance: number | undefined
  readonly macroBreakdown: readonly MacroBreakdownEntry[]
  readonly sorted: readonly RegionNode[]
  readonly maxCount: number
  readonly totalValidators: number
  readonly displayNodeCount: number
  readonly hoveredRegion: string | null
  readonly onHover: (data: TooltipData | null) => void
}

export function EvidenceMapSidebar({
  className,
  style,
  overlay, slot, gini, hhi, liveness, clusters, distance,
  macroBreakdown, sorted, maxCount, totalValidators, displayNodeCount,
  hoveredRegion, onHover,
}: EvidenceMapSidebarProps) {
  return (
    <div
      className={cn(
        'border-t border-black/[0.06] bg-[#FAFAF8] p-3 lg:border-l lg:border-t-0',
        'space-y-3 max-h-[360px] overflow-y-auto overscroll-contain lg:overflow-y-auto',
        className,
      )}
      style={style}
    >
      {/* Live metrics — sentiment-colored */}
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium">Metrics</span>
          <span className="text-[9px] font-mono text-stone-400 tabular-nums">slot {(slot + 1).toLocaleString()}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {gini != null && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium">
                <InlineTooltip label="Gini coefficient" detail="0 = perfectly equal, 1 = maximally concentrated. Measures geographic validator distribution.">Gini</InlineTooltip>
              </div>
              <div className={cn('text-[13px] font-semibold tabular-nums', SENTIMENT_TEXT[sentimentLower(gini, THRESHOLDS.gini)])}>
                {formatNumber(gini, 3)}
              </div>
            </div>
          )}
          {hhi != null && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium">
                <InlineTooltip label="Herfindahl-Hirschman Index" detail="Sum of squared market shares. Higher = more concentrated.">HHI</InlineTooltip>
              </div>
              <div className={cn('text-[13px] font-semibold tabular-nums', SENTIMENT_TEXT[sentimentLower(hhi, THRESHOLDS.hhi)])}>
                {formatNumber(hhi, 4)}
              </div>
            </div>
          )}
          {liveness != null && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium">
                <InlineTooltip label={LIVENESS_LABEL} detail={LIVENESS_DESCRIPTION}>{LIVENESS_LABEL}</InlineTooltip>
              </div>
              <div className={cn('text-[13px] font-semibold tabular-nums', SENTIMENT_TEXT[sentimentHigher(liveness, THRESHOLDS.liveness)])}>
                {formatLivenessCount(liveness)}
              </div>
            </div>
          )}
          {clusters != null && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium">
                <InlineTooltip label="Distinct geographic clusters identified by nearest-neighbor analysis">Clusters</InlineTooltip>
              </div>
              <div className="text-[13px] font-semibold tabular-nums text-stone-800">{clusters}</div>
            </div>
          )}
          {distance != null && (
            <div className="rounded-lg border border-black/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium">
                <InlineTooltip label="Sum of pairwise distances between all active regions" detail="Higher = more geographically spread out.">Distance</InlineTooltip>
              </div>
              <div className="text-[13px] font-semibold tabular-nums text-stone-800">{distance.toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Macro-region breakdown */}
      {macroBreakdown.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium">Continents</div>
          <div className="space-y-1.5">
            {macroBreakdown.map(({ region, share }, i) => {
              const barColor = REGION_COLORS[region as keyof typeof REGION_COLORS] ?? '#94A3B8'
              return (
                <div key={region} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                  <span className="text-[10px] text-stone-500 w-[60px] truncate">{region}</span>
                  <div className="flex-1 h-[3px] rounded-full bg-stone-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: barColor, opacity: 0.7 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(share, 100)}%` }}
                      transition={{ ...SPRING_SOFT, delay: 0.05 + i * 0.03 }}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400 tabular-nums w-8 text-right font-medium">{formatNumber(share, 0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top regions list */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.08em] text-stone-400 font-medium">Top regions</div>
        <motion.div
          className="space-y-0.5"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
        >
          {sorted.slice(0, 5).map((node, i) => {
            const color = overlay === 'sources' ? NODE_BLUE.source : regionColor(node.macroRegion)
            const pct = ((node.count / maxCount) * 100).toFixed(0)
            const sharePct = totalValidators > 0 ? ((node.count / totalValidators) * 100).toFixed(1) : '0'
            const isHovered = hoveredRegion === node.id
            return (
              <motion.div
                key={node.id}
                variants={STAGGER_ITEM}
                className={cn(
                  'group rounded-lg px-2 py-1.5 transition-all duration-150 cursor-default',
                  isHovered ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-black/[0.06]' : 'border border-transparent',
                )}
                onMouseEnter={() => onHover({
                  x: node.x, y: node.y,
                  city: node.city, id: node.id,
                  count: node.count, rank: i,
                  total: displayNodeCount,
                  macroRegion: node.macroRegion,
                })}
                onMouseLeave={() => onHover(null)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-stone-700 font-medium truncate">{node.city.split(',')[0]}</span>
                  </div>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="text-[11px] font-semibold tabular-nums text-stone-800">{node.count.toLocaleString()}</span>
                    <span className="text-[9px] text-stone-400 font-medium">{sharePct}%</span>
                  </div>
                </div>
                <div className="h-[2px] rounded-full bg-stone-100 mx-0.5 mt-1.5">
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
        </motion.div>
      </div>

      {/* Latency legend */}
      {overlay === 'latency' && (
        <div className="rounded-lg border border-black/[0.06] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium mb-2">Latency scale</div>
          <InlineTooltip label="Green = low latency, Red = high latency between GCP regions">
            <span className="block h-1.5 w-full rounded-full" style={{ background: 'linear-gradient(to right, #10B981, #FBBF24, #F97316, #EF4444)' }} />
          </InlineTooltip>
          <div className="flex justify-between mt-1 text-[9px] font-mono text-stone-400">
            <InlineTooltip label="Minimum pairwise GCP latency"><span>{LATENCY_MIN.toFixed(0)} ms</span></InlineTooltip>
            <InlineTooltip label="Maximum pairwise GCP latency"><span>{LATENCY_MAX.toFixed(0)} ms</span></InlineTooltip>
          </div>
        </div>
      )}

      {/* Density / region legend */}
      {overlay !== 'latency' && (
        <div className="rounded-lg border border-black/[0.06] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="text-[9px] uppercase tracking-wider text-stone-400 font-medium mb-2">{overlay === 'sources' ? 'Source density' : 'Regions'}</div>
          {overlay === 'sources' ? (
            <div className="flex items-center gap-3">
              {([
                { size: 'h-1.5 w-1.5', label: 'Low', color: NODE_BLUE.source, tip: 'Few block sources in this region' },
                { size: 'h-2 w-2', label: 'Med', color: NODE_BLUE.source, tip: 'Moderate block source concentration' },
                { size: 'h-2 w-2', label: 'High', color: NODE_BLUE.source, tip: 'High block source concentration' },
                { size: 'h-2.5 w-2.5', label: 'Top', color: NODE_BLUE.source, tip: 'Maximum block source concentration' },
              ] as const).map(({ size, label, color, tip }) => (
                <InlineTooltip key={label} label={tip}>
                  <span className="flex items-center gap-1">
                    <span className={cn('rounded-full', size)} style={{ backgroundColor: color }} />
                    <span className="text-[10px] text-stone-500">{label}</span>
                  </span>
                </InlineTooltip>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {Object.entries(REGION_COLORS).map(([region, color]) => (
                <span key={region} className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-stone-500 truncate">{region}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
