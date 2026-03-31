import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'
import type { SurfaceMode } from './simulation-lab-types'

interface SimulationSurfaceHeaderProps {
  readonly surfaceMode: SurfaceMode
  readonly onSurfaceModeChange: (mode: SurfaceMode) => void
}

const SURFACE_OPTIONS = [
  {
    id: 'research' as const,
    title: 'Published scenarios',
    tooltip: 'Paper-backed replays with maps and charts. Immediate, no engine needed.',
  },
  {
    id: 'lab' as const,
    title: 'Run exact experiment',
    tooltip: 'Launch a fresh run with the exact engine. Slower but produces new evidence.',
  },
] as const

export function SimulationSurfaceHeader({
  surfaceMode,
  onSurfaceModeChange,
}: SimulationSurfaceHeaderProps) {
  return (
    <motion.div
      className="stripe-top-accent mb-5 flex flex-col gap-3 rounded-[24px] border border-rule bg-white/92 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] lg:flex-row lg:items-center lg:justify-between"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent dot-pulse" />
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Results</h1>
      </div>

      <div className="inline-flex w-full rounded-2xl border border-rule bg-surface-active/80 p-1 lg:w-auto">
        {SURFACE_OPTIONS.map(option => {
          const isActive = surfaceMode === option.id
          return (
            <button
              key={option.id}
              onClick={() => onSurfaceModeChange(option.id)}
              title={option.tooltip}
              className={cn(
                'flex-1 rounded-xl px-5 py-2.5 text-center text-sm font-medium transition-all lg:min-w-[210px]',
                isActive
                  ? 'bg-white text-text-primary shadow-[0_4px_16px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.06)]'
                  : 'text-muted hover:text-text-primary hover:bg-white/40',
              )}
            >
              {option.title}
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
