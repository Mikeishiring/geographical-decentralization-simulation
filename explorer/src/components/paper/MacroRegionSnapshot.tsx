import { useState } from 'react'
import { GCP_REGIONS, MACRO_REGION_COUNTS, type MacroRegion } from '../../data/gcp-regions'
import { VALIDATOR_COUNTS } from '../../data/validator-counts'

const MACRO_COLORS: Record<MacroRegion, string> = {
  'North America': '#2563EB',
  'Europe': '#4F46E5',
  'Asia Pacific': '#C2553A',
  'Middle East': '#D97706',
  'South America': '#16A34A',
  'Africa': '#64748B',
  'Oceania': '#0F766E',
}

interface MacroSlice {
  readonly region: MacroRegion
  readonly count: number
  readonly pct: number
  readonly color: string
  readonly cloudRegions: number
}

function computeMacroSlices(): readonly MacroSlice[] {
  const totals = new Map<MacroRegion, number>()

  for (const region of GCP_REGIONS) {
    const count = VALIDATOR_COUNTS[region.id] ?? 0
    totals.set(region.macroRegion, (totals.get(region.macroRegion) ?? 0) + count)
  }

  const total = [...totals.values()].reduce((sum, count) => sum + count, 0)

  return [...totals.entries()]
    .map(([region, count]) => ({
      region,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      color: MACRO_COLORS[region],
      cloudRegions: MACRO_REGION_COUNTS[region],
    }))
    .sort((left, right) => right.count - left.count)
}

const MACRO_SLICES = computeMacroSlices()
const TOTAL_VALIDATORS = MACRO_SLICES.reduce((sum, slice) => sum + slice.count, 0)

export function MacroRegionSnapshot() {
  const [hoveredRegion, setHoveredRegion] = useState<MacroRegion | null>(null)
  const activeSlice =
    MACRO_SLICES.find((slice) => slice.region === hoveredRegion)
    ?? MACRO_SLICES[0]

  if (!activeSlice) return null

  return (
    <section className="rounded-xl border border-rule bg-white px-5 py-5 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
              Validator starting geography
            </span>
            <span className="rounded-full border border-accent/10 bg-accent/5 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-accent/80">
              Baseline snapshot
            </span>
          </div>

          <p className="mt-1.5 max-w-3xl text-13 leading-relaxed text-muted">
            Before any migration step, the published validator population is already concentrated in a small
            set of macro-regions. This gives the editorial view the starting geography that later scenarios
            amplify, erode, or briefly reverse.
          </p>

          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-active ring-1 ring-rule/70">
            {MACRO_SLICES.map((slice) => (
              <button
                key={slice.region}
                type="button"
                aria-label={`${slice.region}: ${slice.count.toLocaleString()} validators across ${slice.cloudRegions} cloud regions (${slice.pct.toFixed(1)}%)`}
                className="relative h-full min-w-[6px] border-r border-white/60 transition-[opacity,filter] duration-150 last:border-r-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                style={{
                  width: `${Math.max(slice.pct, 0.75)}%`,
                  backgroundColor: slice.color,
                  opacity: hoveredRegion && hoveredRegion !== slice.region ? 0.35 : 1,
                  filter: hoveredRegion === slice.region ? 'saturate(1.05)' : 'none',
                }}
                onMouseEnter={() => setHoveredRegion(slice.region)}
                onMouseLeave={() => setHoveredRegion(null)}
                onFocus={() => setHoveredRegion(slice.region)}
                onBlur={() => setHoveredRegion(null)}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {MACRO_SLICES.map((slice) => {
              const isActive = slice.region === activeSlice.region

              return (
                <button
                  key={slice.region}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-11 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                    isActive
                      ? 'border-accent/20 bg-accent/5 text-text-primary'
                      : 'border-rule bg-white text-text-faint hover:border-border-hover hover:text-text-primary'
                  }`}
                  onMouseEnter={() => setHoveredRegion(slice.region)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  onFocus={() => setHoveredRegion(slice.region)}
                  onBlur={() => setHoveredRegion(null)}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  <span>{slice.region}</span>
                  <span className="font-mono text-2xs tabular-nums text-text-faint">
                    {slice.pct.toFixed(1)}%
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="min-w-[240px] rounded-xl border border-rule/80 bg-surface px-4 py-3.5">
          <div className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
            Active region
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: activeSlice.color }}
              aria-hidden="true"
            />
            <span className="text-13 font-medium text-text-primary">{activeSlice.region}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[1.1rem] font-semibold text-text-primary tabular-nums">
              {activeSlice.count.toLocaleString()}
            </span>
            <span className="text-11 text-muted">validators</span>
            <span className="text-11 text-text-faint tabular-nums">({activeSlice.pct.toFixed(1)}%)</span>
          </div>
          <p className="mt-2 text-11 leading-relaxed text-muted">
            Spread across {activeSlice.cloudRegions} of {GCP_REGIONS.length} measured cloud regions before
            any modeled migration.
          </p>
          <p className="mt-2 text-11 leading-relaxed text-text-faint">
            Hover the strip to inspect how concentrated the baseline is across the paper&apos;s geography.
          </p>
          <div className="mt-3 border-t border-rule/70 pt-3 text-11 text-muted">
            Total baseline: <span className="font-medium text-text-primary">{TOTAL_VALIDATORS.toLocaleString()}</span>{' '}
            validators
          </div>
        </aside>
      </div>
    </section>
  )
}
