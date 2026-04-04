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
        'flex shrink-0 items-center gap-[2px] rounded-[12px] border border-black/[0.05] bg-[#FAF9F7] p-[2px]',
        className,
      )}
      style={{ boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.03)' }}
    >
      <button
        type="button"
        aria-pressed={value === 'evidence'}
        onClick={() => onChange('evidence')}
        className={cn(
          'rounded-[10px] px-3 py-1.5 text-[11px] font-medium transition-all duration-150',
          value === 'evidence'
            ? 'bg-white text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]'
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
          'rounded-[10px] px-3 py-1.5 text-[11px] font-medium transition-all duration-150',
          value === 'engine'
            ? 'bg-white text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]'
            : 'text-stone-400 hover:text-stone-600',
        )}
      >
        Engine
      </button>
    </div>
  )
}
