import { cn } from '../../lib/cn'

export type SimulationSurfaceMode = 'evidence' | 'engine'

interface SimulationModeToggleProps {
  readonly value: SimulationSurfaceMode
  readonly onChange: (next: SimulationSurfaceMode) => void
  readonly className?: string
}

export function SimulationModeToggle({ value, onChange, className }: SimulationModeToggleProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-[3px] rounded-[14px] border border-black/[0.06] bg-[#F6F5F4] p-[3px]',
        className,
      )}
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <button
        type="button"
        aria-pressed={value === 'evidence'}
        onClick={() => onChange('evidence')}
        className={cn(
          'rounded-[11px] px-3.5 py-1.5 text-[11px] font-medium transition-all duration-150',
          value === 'evidence'
            ? 'bg-white text-stone-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]'
            : 'text-stone-400 hover:text-stone-600',
        )}
      >
        Evidence
      </button>
      <button
        type="button"
        aria-pressed={value === 'engine'}
        onClick={() => onChange('engine')}
        className={cn(
          'rounded-[11px] px-3.5 py-1.5 text-[11px] font-medium transition-all duration-150',
          value === 'engine'
            ? 'bg-white text-stone-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]'
            : 'text-stone-400 hover:text-stone-600',
        )}
      >
        Engine
      </button>
    </div>
  )
}
