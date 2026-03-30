import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Code } from 'lucide-react'
import { SPRING_SOFT, SPRING_SNAPPY, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { VALIDATOR_COUNTS } from '../../data/validator-counts'
import { GCP_REGIONS, type MacroRegion } from '../../data/gcp-regions'

/* ── Macro-region color mapping ── */
const MACRO_COLORS: Record<MacroRegion, string> = {
  'Europe': '#3B82F6',
  'North America': '#2563EB',
  'Asia Pacific': '#C2553A',
  'Oceania': '#D97706',
  'Middle East': '#F59E0B',
  'South America': '#16A34A',
  'Africa': '#64748B',
}

/* ── Precompute region aggregates for density strip ── */
interface MacroSlice {
  readonly region: MacroRegion
  readonly count: number
  readonly pct: number
  readonly color: string
}

function computeMacroSlices(): readonly MacroSlice[] {
  const totals = new Map<MacroRegion, number>()
  for (const region of GCP_REGIONS) {
    const count = VALIDATOR_COUNTS[region.id] ?? 0
    totals.set(region.macroRegion, (totals.get(region.macroRegion) ?? 0) + count)
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0)
  return [...totals.entries()]
    .map(([region, count]) => ({
      region,
      count,
      pct: (count / Math.max(total, 1)) * 100,
      color: MACRO_COLORS[region],
    }))
    .toSorted((a, b) => b.count - a.count)
}

const MACRO_SLICES = computeMacroSlices()
const TOTAL_VALIDATORS = Object.values(VALIDATOR_COUNTS).reduce((a, b) => a + b, 0)

export function Header() {
  const topThree = useMemo(() => MACRO_SLICES.slice(0, 3), [])
  const [hoveredSlice, setHoveredSlice] = useState<MacroSlice | null>(null)

  return (
    <header className="border-b border-border-subtle overflow-hidden relative">
      {/* Geo accent gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${MACRO_SLICES.map((s, i) => `${s.color} ${i * (100 / MACRO_SLICES.length)}%`).join(', ')})`,
          opacity: 0.5,
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <motion.div
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-3 sm:gap-4"
        >
          {/* ── Row 1: Title + links ── */}
          <div className="flex items-start justify-between gap-4">
            <motion.div variants={STAGGER_ITEM} className="min-w-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-2 h-2 shrink-0 rounded-full bg-accent" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-accent animate-ping opacity-30" />
                </div>
                <h1 className="text-base sm:text-lg font-semibold text-text-primary font-serif leading-tight tracking-[-0.01em]">
                  Geographical Decentralization in Ethereum
                </h1>
              </div>
              <motion.p
                variants={STAGGER_ITEM}
                className="text-xs text-muted mt-1.5 ml-[18px]"
              >
                Yang, Oz, Wu, Zhang (2025)
                <span className="text-text-faint"> · </span>
                <span className="text-text-faint">Paper guide, simulation surface, and public-note archive</span>
              </motion.p>
            </motion.div>

            <motion.div variants={STAGGER_ITEM} className="flex items-center gap-2 shrink-0 pt-0.5">
              <a
                href="https://arxiv.org/abs/2509.21475"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs text-muted transition-all hover:border-accent/30 hover:text-accent hover:shadow-sm"
              >
                <BookOpen className="h-3 w-3" />
                <span className="hidden sm:inline">arXiv</span>
              </a>
              <a
                href="https://github.com/syang-ng/geographical-decentralization-simulation"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs text-muted transition-all hover:border-accent/30 hover:text-accent hover:shadow-sm"
              >
                <Code className="h-3 w-3" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </motion.div>
          </div>

          {/* ── Row 2: Live density strip + stats ── */}
          <motion.div
            variants={STAGGER_ITEM}
            className="flex items-center gap-3 ml-[18px]"
          >
            {/* Density bar */}
            <div className="flex-1 max-w-xs relative">
              <div className="flex h-[6px] rounded-full overflow-hidden bg-surface-active">
                {MACRO_SLICES.map((slice, i) => (
                  <motion.div
                    key={slice.region}
                    className="h-full first:rounded-l-full last:rounded-r-full cursor-pointer transition-opacity"
                    style={{
                      backgroundColor: slice.color,
                      opacity: hoveredSlice && hoveredSlice.region !== slice.region ? 0.35 : 1,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(slice.pct, 0.5)}%` }}
                    transition={{ ...SPRING_SOFT, delay: 0.4 + i * 0.04 }}
                    onMouseEnter={() => setHoveredSlice(slice)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                ))}
              </div>

              {/* Hover tooltip for bar segments */}
              <AnimatePresence>
                {hoveredSlice && (
                  <motion.div
                    key="density-tooltip"
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={SPRING_SNAPPY}
                    className="absolute -top-9 left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap"
                  >
                    <div className="relative rounded-md bg-[#111827]/90 backdrop-blur-md border border-white/10 px-2.5 py-1 text-[10px] text-white/90 shadow-lg flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: hoveredSlice.color }} />
                      <span className="font-medium">{hoveredSlice.region}</span>
                      <span className="text-white/50">·</span>
                      <span className="tabular-nums">{hoveredSlice.count.toLocaleString()}</span>
                      <span className="text-white/40">({hoveredSlice.pct.toFixed(1)}%)</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Micro-legend */}
              <div className="flex gap-2.5 mt-1.5">
                {topThree.map(slice => (
                  <span
                    key={slice.region}
                    className="flex items-center gap-1 cursor-pointer"
                    onMouseEnter={() => setHoveredSlice(slice)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 transition-transform"
                      style={{
                        backgroundColor: slice.color,
                        transform: hoveredSlice?.region === slice.region ? 'scale(1.5)' : 'scale(1)',
                      }}
                    />
                    <span className={`text-[9px] font-mono transition-colors ${hoveredSlice?.region === slice.region ? 'text-text-primary' : 'text-text-faint'}`}>
                      {slice.region === 'North America' ? 'N. America' : slice.region}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-text-faint tracking-wide">
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-accent/40" />
                {TOTAL_VALIDATORS.toLocaleString()} validators
              </span>
              <span className="text-border-subtle">|</span>
              <span>40 regions</span>
              <span className="text-border-subtle">|</span>
              <span>7 macro-regions</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </header>
  )
}
