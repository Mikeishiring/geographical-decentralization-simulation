import { cn } from '../../lib/cn'
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
    <div className="mb-5 flex flex-col gap-3 rounded-[24px] border border-rule bg-white/88 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <h1 className="text-base font-semibold text-text-primary">Results</h1>
      </div>

      <div className="inline-flex w-full rounded-2xl border border-rule bg-surface-active p-1 lg:w-auto">
        {SURFACE_OPTIONS.map(option => {
          const isActive = surfaceMode === option.id
          return (
            <button
              key={option.id}
              onClick={() => onSurfaceModeChange(option.id)}
              title={option.tooltip}
              className={cn(
                'flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-all lg:min-w-[200px]',
                isActive
                  ? 'bg-white text-text-primary shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
                  : 'text-muted hover:text-text-primary',
              )}
            >
              {option.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}
