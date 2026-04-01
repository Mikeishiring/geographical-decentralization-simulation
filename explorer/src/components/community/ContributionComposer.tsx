import { useEffect, useId, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquarePlus } from 'lucide-react'
import { SPRING_CRISP } from '../../lib/theme'


interface ContributionComposerProps {
  readonly sourceLabel: string
  readonly defaultTitle: string
  readonly defaultTakeaway: string
  readonly helperText: string
  readonly publishLabel?: string
  readonly successLabel?: string
  readonly viewPublishedLabel?: string
  readonly isPublishing?: boolean
  readonly published?: boolean
  readonly error?: string | null
  readonly onViewPublished?: () => void
  readonly onPublish: (payload: {
    title: string
    takeaway: string
    author: string
  }) => void
}

export function ContributionComposer({
  sourceLabel,
  defaultTitle,
  defaultTakeaway,
  helperText,
  publishLabel = 'Publish note',
  successLabel = 'Published',
  viewPublishedLabel = 'View published',
  isPublishing = false,
  published = false,
  error,
  onViewPublished,
  onPublish,
}: ContributionComposerProps) {
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [takeaway, setTakeaway] = useState(defaultTakeaway)
  const [author, setAuthor] = useState('')

  useEffect(() => {
    if (open) return
    setTitle(defaultTitle)
    setTakeaway(defaultTakeaway)
  }, [defaultTakeaway, defaultTitle, open])

  useEffect(() => {
    if (published) {
      setOpen(false)
    }
  }, [published])

  const trimmedDefaultTitle = defaultTitle.trim()
  const trimmedDefaultTakeaway = defaultTakeaway.trim()
  const trimmedTitle = title.trim()
  const trimmedTakeaway = takeaway.trim()
  const hasIntentionalEdit = trimmedTitle !== trimmedDefaultTitle || trimmedTakeaway !== trimmedDefaultTakeaway
  const canSubmit = trimmedTitle.length > 0 && trimmedTakeaway.length > 0 && !isPublishing

  if (published) {
    return (
      <div className="mt-4 flex items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/8 px-3 py-1.5 text-xs text-text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {successLabel}
        </div>
        {onViewPublished && (
          <button
            onClick={onViewPublished}
            className="inline-flex items-center rounded-full border border-rule bg-white px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-border-hover"
          >
            {viewPublishedLabel}
          </button>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={helperText}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/80"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        {sourceLabel}
      </button>
    )
  }

  return (
    <motion.div
      className="mt-4 rounded-xl border border-rule bg-white px-4 py-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-text-primary">{sourceLabel}</div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-3">
          <div>
            <label htmlFor={`${formId}-title`} className="mb-1 block text-xs text-muted">Title</label>
            <input
              id={`${formId}-title`}
              type="text"
              value={title}
              onChange={event => setTitle(event.target.value)}
              className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor={`${formId}-takeaway`} className="mb-1 block text-xs text-muted">Takeaway</label>
            <textarea
              id={`${formId}-takeaway`}
              value={takeaway}
              onChange={event => setTakeaway(event.target.value)}
              rows={3}
              placeholder="Summarize what you see in the evidence, in your own words."
              className="min-h-[88px] w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor={`${formId}-author`} className="mb-1 block text-xs text-muted">Name (optional)</label>
            <input
              id={`${formId}-author`}
              type="text"
              value={author}
              onChange={event => setAuthor(event.target.value)}
              placeholder="Anonymous"
              className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <button
            onClick={() => onPublish({
              title: trimmedTitle,
              takeaway: trimmedTakeaway,
              author: author.trim(),
            })}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPublishing ? 'Publishing...' : publishLabel}
          </button>

          {!hasIntentionalEdit && (
            <div className="rounded-lg border border-rule bg-surface-active px-3 py-2 text-11 leading-5 text-text-faint">
              Publishing as-is will use the suggested title and takeaway. Edit them if you want a more specific note.
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </motion.div>
  )
}
