import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'

type InspectorTone = 'default' | 'accent' | 'positive' | 'negative' | 'muted'

interface InteractiveInspectorMetric {
  readonly label: string
  readonly value: string
  readonly tone?: InspectorTone
}

interface InteractiveInspectorProps {
  readonly eyebrow?: string
  readonly title: string
  readonly subtitle?: string
  readonly metrics?: readonly InteractiveInspectorMetric[]
  readonly hint?: string
  readonly className?: string
}

function metricToneClass(tone: InspectorTone | undefined): string {
  if (tone === 'accent') return 'text-accent'
  if (tone === 'positive') return 'text-success'
  if (tone === 'negative') return 'text-danger'
  if (tone === 'muted') return 'text-muted'
  return 'text-text-primary'
}

export function InteractiveInspector({
  eyebrow = 'Inspect',
  title,
  subtitle,
  metrics = [],
  hint,
  className,
}: InteractiveInspectorProps) {
  const columnCount = metrics.length >= 4 ? 4 : Math.max(metrics.length, 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={SPRING_CRISP}
      className={cn(
        'rounded-xl border border-rule/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-3.5 py-3 shadow-[0_14px_30px_rgba(15,23,42,0.06)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">{eyebrow}</div>
          <div className="mt-1 text-xs font-medium text-text-primary">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-11 leading-5 text-muted">{subtitle}</div>
          ) : null}
        </div>
        {hint ? (
          <div className="rounded-full border border-accent/15 bg-accent/[0.05] px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-accent">
            {hint}
          </div>
        ) : null}
      </div>

      {metrics.length > 0 ? (
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {metrics.map(metric => (
            <div key={`${metric.label}-${metric.value}`} className="rounded-lg border border-rule/70 bg-white/90 px-2.5 py-2">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-text-faint">{metric.label}</div>
              <div className={cn('mt-1 text-xs font-medium tabular-nums', metricToneClass(metric.tone))}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </motion.div>
  )
}
