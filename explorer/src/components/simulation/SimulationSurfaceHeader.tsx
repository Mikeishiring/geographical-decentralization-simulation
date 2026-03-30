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
  const pageTitle = 'Results'
  const pageSubtitle = surfaceMode === 'research'
    ? 'Start with the paper-backed replay, then move into the exact lab only if the fixed evidence is not enough.'
    : 'Use the exact lab only after reading the published replay or when you already know which bounded variation you need.'
  const readingOrder = surfaceMode === 'research'
    ? [
        'Start with the published replay tied to the paper.',
        'Use the analytics desk and figure prompts before rerunning anything.',
        'Open the exact lab only if you need fresh evidence or a bounded variation.',
      ]
    : [
        'Use a reference setup or a single deliberate change.',
        'Read the manifest, bundles, and figures before opening the guide.',
        'Publish only if the run adds a real takeaway beyond the starter result.',
      ]

  return (
    <div className={cn('mb-5 rounded-[24px] border border-rule bg-white/88 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]', surfaceMode === 'research' ? 'space-y-3' : 'space-y-4')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2.5 lg:items-center">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent lg:mt-0" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
              <p className="mt-1 text-xs leading-5 text-muted">
                {pageSubtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="inline-flex w-full rounded-2xl border border-rule bg-surface-active p-1 lg:w-auto">
          {SURFACE_OPTIONS.map(option => {
            const isActive = surfaceMode === option.id
            return (
              <button
                key={option.id}
                onClick={() => onSurfaceModeChange(option.id)}
                className={cn(
                  'flex-1 rounded-xl px-4 py-2.5 text-left transition-all lg:min-w-[220px]',
                  isActive
                    ? 'bg-white text-text-primary shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
                    : 'text-muted hover:text-text-primary',
                )}
              >
                <div className="text-[0.625rem] uppercase tracking-[0.1em] text-text-faint">{option.eyebrow}</div>
                <div className="mt-1 text-sm font-medium">{option.title}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SURFACE_OPTIONS.map(option => {
          const isActive = surfaceMode === option.id
          return (
            <div
              key={option.id}
              className={cn(
                'rounded-2xl border px-4 py-3',
                isActive
                  ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.05),rgba(255,255,255,0.94))]'
                  : 'border-rule bg-surface-active/70',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{option.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">{option.detail}</div>
                </div>
                {isActive ? (
                  <span className="rounded-full bg-accent px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-white">
                    Active
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {option.chips.map(chip => (
                  <span key={chip} className="lab-chip">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {readingOrder.map((step, index) => (
          <div key={step} className="rounded-2xl border border-rule bg-surface-active/70 px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              {index + 1}. {index === 0 ? 'Start' : index === 1 ? 'Read' : 'Only then'}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">{step}</div>
          </div>
        ))}
      </div>

      <div className="text-xs leading-5 text-muted">
        Results is ordered on purpose: published evidence first, exact reruns second, guide framing third, community publishing last.
      </div>
    </div>
  )
}
