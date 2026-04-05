import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface TooltipProps {
  readonly children: ReactNode
  readonly label: string
  /** Optional secondary line rendered smaller below the label */
  readonly detail?: string
  /** @default 'below' */
  readonly placement?: 'above' | 'below'
  readonly className?: string
}

/**
 * CSS-only tooltip — dark frosted-glass pill with refined typography.
 * 850ms delay on first hover (per design rules), smooth entrance.
 */
export function Tooltip({ children, label, detail, placement = 'below', className }: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-normal',
          'max-w-[260px] rounded-xl border border-white/[0.08] bg-[#141414]/95 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(255,255,255,0.06)]',
          'backdrop-blur-xl',
          'opacity-0 transition-[opacity,transform] duration-200',
          'group-hover/tip:opacity-100 group-hover/tip:delay-[850ms]',
          placement === 'below'
            ? 'top-full mt-2.5 translate-y-1 group-hover/tip:translate-y-0'
            : 'bottom-full mb-2.5 -translate-y-1 group-hover/tip:-translate-y-0',
        )}
      >
        <span className="block text-[11px] font-medium leading-snug tracking-[-0.01em] text-white/90">
          {label}
        </span>
        {detail && (
          <span className="mt-1 block text-[10px] leading-relaxed text-white/50">
            {detail}
          </span>
        )}
        {/* Arrow */}
        <span
          className={cn(
            'absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent',
            placement === 'below'
              ? 'bottom-full border-b-[#141414]'
              : 'top-full border-t-[#141414]',
          )}
        />
      </span>
    </span>
  )
}

/**
 * Inline text tooltip — wraps a text span so hovering reveals a definition.
 * No visual indicator at rest; on hover the text subtly brightens and the
 * cursor changes to `help`. Use this instead of `title` attributes or `?` icons.
 */
export function InlineTooltip({ children, label, detail, placement = 'below', className }: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline cursor-help', className)}>
      <span className="transition-colors duration-150 group-hover/tip:text-text-primary">
        {children}
      </span>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-normal',
          'max-w-[260px] rounded-xl border border-white/[0.08] bg-[#141414]/95 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(255,255,255,0.06)]',
          'backdrop-blur-xl',
          'opacity-0 transition-[opacity,transform] duration-200',
          'group-hover/tip:opacity-100 group-hover/tip:delay-[850ms]',
          placement === 'below'
            ? 'top-full mt-2.5 translate-y-1 group-hover/tip:translate-y-0'
            : 'bottom-full mb-2.5 -translate-y-1 group-hover/tip:-translate-y-0',
        )}
      >
        <span className="block text-[11px] font-medium leading-snug tracking-[-0.01em] text-white/90">
          {label}
        </span>
        {detail && (
          <span className="mt-1 block text-[10px] leading-relaxed text-white/50">
            {detail}
          </span>
        )}
        <span
          className={cn(
            'absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent',
            placement === 'below'
              ? 'bottom-full border-b-[#141414]'
              : 'top-full border-t-[#141414]',
          )}
        />
      </span>
    </span>
  )
}
