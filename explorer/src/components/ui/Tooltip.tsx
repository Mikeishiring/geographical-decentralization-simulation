import { type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'

interface TooltipProps {
  readonly children: ReactNode
  readonly label: string
  /** Optional eyebrow rendered above the label */
  readonly eyebrow?: string
  /** Optional secondary line rendered smaller below the label */
  readonly detail?: string
  /** @default 'below' */
  readonly placement?: 'above' | 'below'
  readonly className?: string
}

/**
 * Shared tooltip pill — dark frosted-glass with refined typography.
 * 850ms delay on first hover (per design rules), smooth entrance.
 * `variant` controls the wrapper style: 'icon' for icon/button triggers,
 * 'inline' for text spans with cursor-help and hover-brighten.
 */
function TooltipBase({
  children,
  label,
  eyebrow,
  detail,
  placement = 'below',
  className,
  variant,
}: TooltipProps & { readonly variant: 'icon' | 'inline' }) {
  const tipId = useId()

  return (
    <span
      className={cn(
        'group/tip relative',
        variant === 'inline' ? 'inline cursor-default' : 'inline-flex',
        className,
      )}
      aria-describedby={tipId}
    >
      {variant === 'inline' ? (
        <span className="decoration-stone-300/60 decoration-dotted underline-offset-[3px] group-hover/tip:underline transition-colors duration-150 group-hover/tip:text-text-primary">
          {children}
        </span>
      ) : (
        children
      )}
      <span
        id={tipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-normal',
          'min-w-[190px] max-w-[320px] rounded-2xl border border-white/[0.08] bg-[#141414]/96 px-3.5 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.06)]',
          'backdrop-blur-xl',
          'opacity-0 transition-[opacity,transform] duration-200',
          'group-hover/tip:opacity-100 group-hover/tip:delay-[350ms]',
          placement === 'below'
            ? 'top-full mt-3 translate-y-1.5 group-hover/tip:translate-y-0'
            : 'bottom-full mb-3 -translate-y-1.5 group-hover/tip:-translate-y-0',
        )}
      >
        {eyebrow && (
          <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-white/42">
            {eyebrow}
          </span>
        )}
        <span className={cn(
          'block text-[11.5px] font-medium leading-[1.45] tracking-[-0.01em] text-white/90',
          eyebrow ? 'mt-1' : '',
        )}>
          {label}
        </span>
        {detail && (
          <span className="mt-1.5 block text-[10.5px] leading-[1.55] text-white/56">
            {detail}
          </span>
        )}
        {/* Arrow */}
        <span
          className={cn(
            'absolute left-1/2 -translate-x-1/2 border-[6px] border-transparent',
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
 * CSS-only tooltip — dark frosted-glass pill with refined typography.
 * 850ms delay on first hover (per design rules), smooth entrance.
 */
export function Tooltip(props: TooltipProps) {
  return <TooltipBase {...props} variant="icon" />
}

/**
 * Inline text tooltip — wraps a text span so hovering reveals a definition.
 * No visual indicator at rest; on hover the text subtly brightens and the
 * cursor changes to `help`. Use this instead of `title` attributes or `?` icons.
 */
export function InlineTooltip(props: TooltipProps) {
  return <TooltipBase {...props} variant="inline" />
}
