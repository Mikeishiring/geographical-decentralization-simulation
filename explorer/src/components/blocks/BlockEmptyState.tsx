interface BlockEmptyStateProps {
  readonly title: string
  readonly message: string
  readonly eyebrow?: string
}

export function BlockEmptyState({
  title,
  message,
  eyebrow = 'Evidence unavailable',
}: BlockEmptyStateProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-text-faint">
            {eyebrow}
          </span>
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="rounded-lg border border-rule/70 bg-surface-active/50 px-4 py-3">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Current payload
          </div>
          <p className="mt-1.5 text-13 leading-relaxed text-muted">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
