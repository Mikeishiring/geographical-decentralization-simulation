import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

const EXAMPLE_PROMPTS = [
  'Why does gamma flip SSP vs MSP?',
  'Does geography matter more than paradigm?',
  'What does this mean for protocol design?',
] as const

const QUERY_DRAFT_STORAGE_KEY = 'findings-query-draft'

function readDraftQuery() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(QUERY_DRAFT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDraftQuery(query: string) {
  if (typeof window === 'undefined') return
  try {
    if (query.length === 0) {
      window.localStorage.removeItem(QUERY_DRAFT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(QUERY_DRAFT_STORAGE_KEY, query)
  } catch {
    // Ignore storage failures and keep the prompt box usable.
  }
}

interface QueryBarProps {
  onSubmit?: (query: string) => void
  disabled?: boolean
  loading?: boolean
  disabledReason?: string
}

export function QueryBar({ onSubmit, disabled, loading, disabledReason }: QueryBarProps) {
  const [query, setQuery] = useState(readDraftQuery)
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'sending' | 'receiving'>('idle')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isEnabled = !disabled && !loading
  const placeholder = disabled
    ? disabledReason ?? 'The reading guide is unavailable right now.'
    : 'Ask about the paper — a mechanism, finding, or implication...'

  useEffect(() => {
    if (!loading) {
      setLoadingPhase('idle')
      return
    }

    setLoadingPhase('sending')
    const timeoutId = window.setTimeout(() => {
      setLoadingPhase('receiving')
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [loading])

  useEffect(() => {
    writeDraftQuery(query)
  }, [query])

  const handleSubmit = () => {
    const trimmed = query.trim()
    if (!trimmed || !isEnabled) return
    setLoadingPhase('sending')
    onSubmit?.(trimmed)
  }

  const handleChip = (text: string) => {
    if (!isEnabled) return
    setQuery(text)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      const end = text.length
      inputRef.current?.setSelectionRange(end, end)
    })
  }

  return (
    <div className="rounded-xl border border-rule bg-canvas px-4 py-4 sm:px-6 sm:py-5">
      <div className={cn(
        'bg-white border border-rule rounded-xl transition-all',
        isEnabled && 'focus-within:border-accent/30 focus-within:ring-2 focus-within:ring-accent/10',
      )}>
        <div className="flex items-center gap-3 px-4 py-3">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
          ) : (
            <Search className="w-4 h-4 text-muted/60 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={placeholder}
            disabled={!isEnabled}
            aria-label="Search the paper"
            className="flex-1 bg-transparent text-[0.8125rem] text-text-primary placeholder:text-muted/70 outline-none disabled:opacity-50"
          />
          {query.trim() && isEnabled && (
            <button
              onClick={handleSubmit}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-[0.75rem] font-medium hover:bg-accent/90 transition-colors"
            >
              Ask guide
            </button>
          )}
        </div>
      </div>

      {/* Inline prompt hints */}
      {!disabled && !loading && (
        <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-text-faint">
          Try{' '}
          {EXAMPLE_PROMPTS.map((prompt, i) => (
            <span key={prompt}>
              <button
                onClick={() => handleChip(prompt)}
                className="text-muted hover:text-accent transition-colors underline underline-offset-2 decoration-rule hover:decoration-accent"
              >
                {prompt}
              </button>
              {i < EXAMPLE_PROMPTS.length - 1 ? <span className="text-rule"> · </span> : null}
            </span>
          ))}
        </p>
      )}

      {loading && (
        <div
          aria-live="polite"
          className="mt-2 flex items-center justify-center gap-1.5 text-[0.6875rem] text-text-faint"
        >
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          <span>
            {loadingPhase === 'sending'
              ? 'Sending question...'
              : 'Receiving answer...'}
          </span>
        </div>
      )}

      {disabled && disabledReason && (
        <p className="text-[0.6875rem] text-text-faint text-center mt-1.5">
          {disabledReason}
        </p>
      )}
    </div>
  )
}
