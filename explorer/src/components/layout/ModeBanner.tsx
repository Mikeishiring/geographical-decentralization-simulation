import { cn } from '../../lib/cn'

type ModeTone = 'canonical' | 'editorial' | 'experimental' | 'interpretation'

interface ModeBannerProps {
  readonly eyebrow: string
  readonly title: string
  readonly detail: string
  readonly tone?: ModeTone
}

const toneClasses: Record<ModeTone, { dot: string; border: string; bg: string }> = {
  canonical: {
    dot: 'bg-success',
    border: 'border-success/30',
    bg: 'bg-success/5',
  },
  editorial: {
    dot: 'bg-warning',
    border: 'border-warning/30',
    bg: 'bg-warning/5',
  },
  experimental: {
    dot: 'bg-accent',
    border: 'border-accent/25',
    bg: 'bg-accent/5',
  },
  interpretation: {
    dot: 'bg-text-faint',
    border: 'border-border-subtle',
    bg: 'bg-white',
  },
}

export function ModeBanner({
  eyebrow,
  title,
  detail,
  tone = 'canonical',
}: ModeBannerProps) {
  const palette = toneClasses[tone]

  return (
    <div className={cn('rounded-xl border px-4 py-3', palette.border, palette.bg)}>
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', palette.dot)} />
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-faint">
          {eyebrow}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium text-text-primary">{title}</div>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  )
}
