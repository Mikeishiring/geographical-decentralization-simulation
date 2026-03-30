import { useEffect, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { cn } from '../../lib/cn'

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
  const canSubmit = trimmedTitle.length > 0 && trimmedTakeaway.length > 0 && hasIntentionalEdit && !isPublishing

  return (
    <div className="mt-5 rounded-xl border border-rule bg-white px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
            Community contribution
          </div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            {sourceLabel}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            {helperText}
          </p>
          <p className="mt-2 max-w-2xl text-[0.6875rem] text-text-faint">
            Published notes are human-authored framing layers over paper-backed readings or exact-run artifacts. They are not raw model output dumps.
          </p>
          <p className="mt-1 max-w-2xl text-[0.6875rem] text-text-faint">
            To publish, edit the draft title or takeaway so the note reflects your own read of the evidence.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Observation first',
              'Interpretation labeled',
              'Human title + takeaway',
            ].map(item => (
              <span key={item} className="lab-chip">{item}</span>
            ))}
          </div>
        </div>

        {published ? (
          <div className="flex flex-wrap items-center gap-2">
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
        ) : (
          <button
            onClick={() => setOpen(previous => !previous)}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors',
              open
                ? 'border border-rule bg-white text-text-primary hover:border-border-hover'
                : 'bg-accent text-white hover:bg-accent/80',
            )}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {open ? 'Hide note editor' : 'Prepare community note'}
          </button>
        )}
      </div>

      {!published && open && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Title</label>
              <input
                type="text"
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted">Takeaway</label>
              <textarea
                value={takeaway}
                onChange={event => setTakeaway(event.target.value)}
                rows={3}
                className="min-h-[88px] w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-1 text-[0.6875rem] text-text-faint">
                Write this in your own words. Summarize what the source shows, not what an assistant guessed.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Name or handle (optional)</label>
              <input
                type="text"
                value={author}
                onChange={event => setAuthor(event.target.value)}
                placeholder="Anonymous is fine"
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
              {isPublishing ? 'Publishing…' : publishLabel}
            </button>

            {!hasIntentionalEdit && (
              <div className="rounded-lg border border-rule bg-surface-active px-3 py-2 text-[0.6875rem] leading-5 text-text-faint">
                Edit the title or takeaway before publishing. Default draft text is a starting point, not the public artifact.
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  )
}
