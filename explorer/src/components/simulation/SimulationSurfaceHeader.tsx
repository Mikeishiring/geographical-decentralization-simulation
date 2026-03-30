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
    eyebrow: 'Recommended first',
    detail: 'Read the checked-in replay, inspect the analytics desk, and use the guide against frozen evidence already tied to the paper.',
    chips: ['Immediate', 'Paper-backed', 'Shareable view'],
  },
  {
    id: 'lab' as const,
    title: 'Run exact experiment',
    eyebrow: 'When you need fresh evidence',
    detail: 'Launch a new bounded run with the exact engine, then inspect the manifest, artifacts, and optional guide before publishing anything.',
    chips: ['Slower', 'Exact engine', 'Fresh manifest'],
  },
] as const

export function SimulationSurfaceHeader({
  surfaceMode,
  onSurfaceModeChange,
}: SimulationSurfaceHeaderProps) {
  const pageTitle = surfaceMode === 'research' ? 'Published Paper Replay' : 'Simulation'
  const pageSubtitle = surfaceMode === 'research'
    ? 'The precomputed paper replay is already live. Read, compare, and annotate the published evidence directly on the page.'
    : 'Configure and inspect a bounded exact run.'

  return (
    <div className={cn('mb-6', surfaceMode === 'research' ? 'space-y-2' : 'space-y-4')}>
      <div className="flex min-w-0 items-start gap-2.5 lg:items-center">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent lg:mt-0" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
          <p className="mt-1 text-xs leading-5 text-muted">
            {pageSubtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SURFACE_OPTIONS.map(option => {
          const isActive = surfaceMode === option.id
          return (
            <button
              key={option.id}
              onClick={() => onSurfaceModeChange(option.id)}
              className={cn(
                'rounded-2xl border px-4 py-4 text-left transition-all',
                isActive
                  ? 'border-accent bg-white shadow-[0_18px_34px_rgba(15,23,42,0.06)]'
                  : 'border-rule bg-surface-active hover:border-border-hover hover:bg-white',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">{option.eyebrow}</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">{option.title}</div>
                </div>
                {isActive ? (
                  <span className="rounded-full bg-accent px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-white">
                    Active
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-xs leading-5 text-muted">{option.detail}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {option.chips.map(chip => (
                  <span key={chip} className="lab-chip">
                    {chip}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="text-xs leading-5 text-muted">
        Published scenarios keep the paper, analytics, and replay guide on one fixed evidence surface. The exact lab is for reproducing or extending the research with a fresh bounded run.
      </div>
    </div>
  )
}
