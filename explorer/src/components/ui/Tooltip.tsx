import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface TooltipProps {
  readonly children: ReactNode
  readonly label: string
  /** @default 'below' */
  readonly placement?: 'above' | 'below'
  readonly className?: string
}

/**
 * CSS-only tooltip with BenjiStripe dark-pill styling.
 * 850ms delay on first hover (per design rules), overshoot entrance.
 */
export function Tooltip({ children, label, placement = 'below', className }: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2',
          'max-w-[220px] rounded-lg bg-[#1a1a1a] px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg',
          'opacity-0 transition-[opacity,transform] duration-200',
          'group-hover/tip:opacity-100 group-hover/tip:delay-[850ms]',
          placement === 'below'
            ? 'top-full mt-2 translate-y-1 group-hover/tip:translate-y-0'
            : 'bottom-full mb-2 -translate-y-1 group-hover/tip:-translate-y-0',
        )}
      >
        {label}
        {/* Arrow */}
        <span
          className={cn(
            'absolute left-1/2 -translate-x-1/2 border-4 border-transparent',
            placement === 'below'
              ? 'bottom-full border-b-[#1a1a1a]'
              : 'top-full border-t-[#1a1a1a]',
          )}
        />
      </span>
    </span>
  )
}
