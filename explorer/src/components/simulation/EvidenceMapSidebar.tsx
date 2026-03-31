/**
 * Sidebar panel for the evidence map — metrics, continents, top regions, legends.
 * Extracted from EvidenceMapSurface.tsx to keep it under the 800-line limit.
 */
import { motion } from 'framer-motion'
import { MAP_NODE_COLORS, SPRING_SOFT } from '../../lib/theme'
import { cn } from '../../lib/cn'
import { LATENCY_MIN, LATENCY_MAX } from '../../data/gcp-latency'
import { formatNumber } from './simulation-constants'
import { THRESHOLDS, SENTIMENT_TEXT, sentimentLower, sentimentHigher } from './simulation-evidence-constants'
import { nodeColor, type RegionNode, type OverlayMode, type TooltipData } from './evidence-map-helpers'

interface MacroBreakdownEntry {
  readonly region: string
  readonly count: number
  readonly share: number
}

interface EvidenceMapSidebarProps {
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
  overlay, slot, gini, hhi, liveness, clusters, distance,
  macroBreakdown, sorted, maxCount, totalValidators, displayNodeCount,
  hoveredRegion, onHover,
}: EvidenceMapSidebarProps) {
  return (
    <div className="border-t border-rule p-3.5 lg:border-l lg:border-t-0 space-y-3.5 max-h-[360px] overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-y-visible">
      {/* Live metrics — sentiment-colored */}
      <div>
        <div className="lab-section-title flex items-baseline gap-1.5">
          <span>Metrics</span>
          <span className="text-[0.5625rem] font-mono text-text-faint tabular-nums">slot {(slot + 1).toLocaleString()}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {gini != null && (
            <div className="lab-option-card p-2" title="Gini coefficient (0 = perfectly equal, 1 = maximally concentrated). Measures geographic validator distribution.">
              <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Gini</div>
              <div className={cn('text-sm font-semibold tabular-nums', SENTIMENT_TEXT[sentimentLower(gini, THRESHOLDS.gini)])}>
                {formatNumber(gini, 3)}
              </div>
            </div>
          )}
          {hhi != null && (
            <div className="lab-option-card p-2" title="Herfindahl-Hirschman Index — sum of squared market shares. Higher = more concentrated.">
              <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">HHI</div>
              <div className={cn('text-sm font-semibold tabular-nums', SENTIMENT_TEXT[sentimentLower(hhi, THRESHOLDS.hhi)])}>
                {formatNumber(hhi, 4)}
              </div>
            </div>
          )}
          {liveness != null && (
            <div className="lab-option-card p-2" title="Percentage of GCP regions with active validators. Higher = broader geographic spread.">
              <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Liveness</div>
              <div className={cn('text-sm font-semibold tabular-nums', SENTIMENT_TEXT[sentimentHigher(liveness, THRESHOLDS.liveness)])}>
                {formatNumber(liveness, 1)}%
              </div>
            </div>
          )}
          {clusters != null && (
            <div className="lab-option-card p-2" title="Number of distinct geographic clusters identified by nearest-neighbor analysis.">
              <div className="text-[0.5625rem] uppercase tracking-wider text-text-faint">Clusters</div>
              <div className="text-sm font-semibold tabular-nums text-text-primary">{clusters}</div>
            </div>
          )}
          {distance != null && (
            <div className="lab-option-card p-2" title="Sum of pairwise distances between all active regions. Higher = more geographically spread out.">
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
            {macroBreakdown.map(({ region, share }, i) => (
              <div key={region} className="flex items-center gap-2">
                <span className="text-2xs text-text-faint w-[72px] truncate">{region}</span>
                <div className="flex-1 h-[4px] rounded-full bg-surface-active overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-accent/50"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(share, 100)}%` }}
                    transition={{ ...SPRING_SOFT, delay: 0.05 + i * 0.03 }}
                  />
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
                onMouseEnter={() => onHover({
                  x: node.x, y: node.y,
                  city: node.city, id: node.id,
                  count: node.count, rank: i,
                  total: displayNodeCount,
                  macroRegion: node.macroRegion,
                })}
                onMouseLeave={() => onHover(null)}
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
              { size: 'h-1.5 w-1.5', label: 'Low', color: overlay === 'sources' ? MAP_NODE_COLORS.sources : MAP_NODE_COLORS.inactive },
              { size: 'h-2 w-2', label: 'Med', color: overlay === 'sources' ? MAP_NODE_COLORS.sources : MAP_NODE_COLORS.low },
              { size: 'h-2 w-2', label: 'High', color: overlay === 'sources' ? MAP_NODE_COLORS.sources : MAP_NODE_COLORS.mid },
              { size: 'h-2.5 w-2.5', label: 'Top', color: overlay === 'sources' ? MAP_NODE_COLORS.sources : MAP_NODE_COLORS.high },
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
  )
}
