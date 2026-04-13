import { motion } from 'framer-motion'
import { Database, Sparkles } from 'lucide-react'

import { DataLabSurface } from '../components/data/DataLabSurface'
import { cn } from '../lib/cn'
import { CONTENT_MAX_WIDTH, SPRING } from '../lib/theme'

export function DataLabPage() {
  return (
    <div className={cn(CONTENT_MAX_WIDTH, 'mx-auto')}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="space-y-6"
      >
        <div className="relative overflow-hidden rounded-[24px] border border-black/[0.08] bg-white/[0.96] px-6 py-6 shadow-[0_14px_40px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,249,251,0.96))]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-black/[0.08] bg-white/[0.84] shadow-[0_4px_14px_rgba(0,0,0,0.05)]">
                <Database className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/45">
                  Shared warehouse
                </div>
                <h1 className="mt-2 text-[clamp(1.6rem,1.25rem+1vw,2.2rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-text-primary">
                  Research-grade SQL over published simulations and live exact traces.
                </h1>
                <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted/65">
                  The Data Lab is now a product surface instead of a raw SQL box: reusable queries, shareable URLs,
                  inline warehouse state, and a faster preview path for large result sets.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-black/[0.08] bg-white/[0.82] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-primary/65">
                Server DuckDB
              </span>
              <span className="rounded-full border border-black/[0.08] bg-white/[0.82] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-primary/65">
                Catalog + exact
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/18 bg-accent/[0.08] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                <Sparkles className="h-3 w-3" />
                Product layer
              </span>
            </div>
          </div>
        </div>

        <DataLabSurface />
      </motion.div>
    </div>
  )
}
