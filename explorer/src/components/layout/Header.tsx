import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Code, ExternalLink } from 'lucide-react'
import { GCP_REGIONS, type MacroRegion } from '../../data/gcp-regions'
import { PAPER_METADATA, type Author } from '../../data/paper-sections'
import { VALIDATOR_COUNTS } from '../../data/validator-counts'
import { CONTENT_MAX_WIDTH, SPRING_SNAPPY } from '../../lib/theme'
import { GlobeWireframe } from '../decorative/GlobeWireframe'

const HEADER_TITLE = PAPER_METADATA.title
const AUTHORS = PAPER_METADATA.authors
const HEADER_ARXIV_URL =
  PAPER_METADATA.references.find((reference) => reference.label === 'arXiv paper')?.url
  ?? 'https://arxiv.org/abs/2509.21475'
const HEADER_REPOSITORY_URL =
  PAPER_METADATA.references.find((reference) => reference.label === 'Simulation repository')?.url
  ?? 'https://github.com/syang-ng/geographical-decentralization-simulation'

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
    }))
    .sort((left, right) => right.count - left.count)
}

const MACRO_SLICES = computeMacroSlices()
const TOTAL_VALIDATORS = MACRO_SLICES.reduce((sum, slice) => sum + slice.count, 0)

function MacroDensityStrip() {
  const [hoveredRegion, setHoveredRegion] = useState<MacroRegion | null>(null)
  const activeSlice =
    MACRO_SLICES.find((slice) => slice.region === hoveredRegion)
    ?? MACRO_SLICES[0]

  if (!activeSlice) return null

  return (
    <div className="rounded-2xl border border-rule bg-white/82 px-4 py-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)] backdrop-blur-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
              Validator distribution
            </span>
            <span className="rounded-full border border-accent/10 bg-accent/5 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-accent/80">
              Macro-region snapshot
            </span>
          </div>

          <p className="mt-1 max-w-2xl text-13 leading-relaxed text-muted">
            Published validator counts are highly uneven across cloud regions. This strip surfaces that
            starting geography before the paper traces how migration incentives reinforce or soften it.
          </p>

          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-active ring-1 ring-rule/70">
            {MACRO_SLICES.map((slice) => (
              <button
                key={slice.region}
                type="button"
                aria-label={`${slice.region}: ${slice.count.toLocaleString()} validators (${slice.pct.toFixed(1)}%)`}
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
                      : 'border-rule bg-white/90 text-text-faint hover:border-border-hover hover:text-text-primary'
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

        <div className="min-w-[220px] rounded-xl border border-rule/80 bg-white/90 px-3.5 py-3">
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
            {TOTAL_VALIDATORS.toLocaleString()} validators mapped across {GCP_REGIONS.length} measured cloud
            regions.
          </p>
        </div>
      </div>
    </div>
  )
}

function AuthorChip({ author }: { readonly author: Author }) {
  const [hovered, setHovered] = useState(false)

  const nameElement = author.url ? (
    <a
      href={author.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-2xs text-text-faint underline decoration-rule underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/40"
    >
      {author.name}
    </a>
  ) : (
    <span className="text-2xs text-text-faint">
      {author.name}
    </span>
  )

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {nameElement}

      <AnimatePresence>
        {hovered && (author.role || author.focus) && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={SPRING_SNAPPY}
            className="absolute left-0 top-full mt-2 z-40 pointer-events-none"
          >
            <div className="rounded-xl border border-rule bg-white/95 backdrop-blur-md shadow-lg px-3.5 py-2.5 min-w-[180px] max-w-[260px]">
              <div className="flex items-center gap-2">
                <span className="text-13 font-medium text-text-primary">
                  {author.name}
                </span>
                {author.url && (
                  <ExternalLink className="h-3 w-3 text-muted/50 shrink-0" />
                )}
              </div>
              {author.role && (
                <div className="mt-1 text-11 text-accent font-medium">
                  {author.role}
                </div>
              )}
              {author.focus && (
                <div className="mt-1 text-11 leading-relaxed text-muted">
                  {author.focus}
                </div>
              )}
              {author.url && (
                <div className="mt-1.5 text-2xs text-text-faint">
                  Google Scholar profile
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

export function Header() {
  return (
    <header className="relative overflow-hidden bg-white border-b border-rule stripe-top-accent">
      {/* Globe wireframe — decorative background, right side */}
      <div className="absolute inset-0 pointer-events-none">
        <GlobeWireframe />
      </div>

      {/* Soft gradient overlay — text legibility on the left */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 40%, rgba(255,255,255,0.3) 70%, transparent 100%)',
        }}
      />

      <div className={`relative ${CONTENT_MAX_WIDTH} mx-auto px-4 sm:px-6 py-8 sm:py-10`}>
        <div className="flex flex-col gap-4">
          {/* Top row: edition label + arXiv badge */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
              Interactive paper edition
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={HEADER_ARXIV_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-accent/30 hover:text-accent"
              >
                <span className="font-mono tracking-tight">arXiv:2509.21475</span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
              <a
                href={HEADER_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-accent/30 hover:text-accent"
              >
                <Code className="h-3 w-3 opacity-60" />
                <span className="font-mono tracking-tight">Repository</span>
              </a>
            </div>
          </div>

          {/* Title */}
          <h1 className="max-w-3xl font-serif text-[clamp(1.25rem,1rem+0.5vw,1.75rem)] font-semibold leading-snug text-text-primary">
            {HEADER_TITLE}
          </h1>

          {/* Authors row */}
          <div className="flex items-center gap-x-1.5 flex-wrap">
            {AUTHORS.map((author, i) => (
              <span key={author.name} className="inline-flex items-center">
                <AuthorChip author={author} />
                {i < AUTHORS.length - 1 && (
                  <span className="text-rule ml-1.5">·</span>
                )}
              </span>
            ))}
            <span className="text-rule">·</span>
            <span className="text-2xs text-text-faint">2025</span>
          </div>

          <MacroDensityStrip />
        </div>
      </div>
    </header>
  )
}
