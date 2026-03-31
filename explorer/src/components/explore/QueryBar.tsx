import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'

const EXAMPLE_GROUPS = [
  {
    label: 'Mechanism',
    prompt: 'Why does a higher gamma centralize SSP more but MSP less?',
  },
  {
    label: 'Comparison',
    prompt: 'Does starting geography matter more than paradigm choice?',
  },
  {
    label: 'Geography',
    prompt: 'Why do the same low-latency regions keep winning?',
  },
  {
    label: 'Design',
    prompt: 'What does this imply for protocol design and relay policy?',
  },
  {
    label: 'Timing',
    prompt: 'What changes under shorter slots: geography or fairness?',
  },
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
  helperText?: string
}

export function QueryBar({ onSubmit, disabled, loading, disabledReason, helperText }: QueryBarProps) {
  const [query, setQuery] = useState(readDraftQuery)
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'sending' | 'receiving'>('idle')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isEnabled = !disabled && !loading
  const placeholder = disabled
    ? disabledReason ?? 'The reading guide is unavailable right now.'
    : 'Ask the reading guide about a claim, mechanism, comparison, or implication...'

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
    <div className="rounded-xl border border-rule bg-canvas px-5 py-6 sm:px-8 sm:py-8">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Question a claim</div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            Use one bounded paper question: claim, mechanism, implication, or comparison
          </div>
        </div>
        <div className="max-w-lg text-xs leading-5 text-muted">
          Best prompts mention the paradigm, metric, or foil you care about. The guide reports what the paper shows first, then offers a labeled interpretation.
        </div>
      </div>

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
              className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors"
            >
              Ask guide
            </button>
          )}
        </div>
      </div>

      {/* Suggested prompts */}
      {!disabled && !loading && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="mt-3"
          >
            <div className="mb-3">
              <span className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                Prompt starters
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {EXAMPLE_GROUPS.map((group, i) => (
                <motion.button
                  key={group.prompt}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...SPRING, delay: i * 0.04 }}
                  onClick={() => handleChip(group.prompt)}
                  className="group rounded-xl border border-rule bg-white px-3 py-2.5 text-left transition-all hover:border-border-hover"
                >
                  <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint transition-colors group-hover:text-muted">
                    {group.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-text-body transition-colors group-hover:text-text-primary">
                    {group.prompt}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      <div className="mt-2 min-h-[1.25rem]">
        {loading ? (
          <div
            aria-live="polite"
            className="flex items-center justify-center gap-1.5 text-[0.6875rem] text-text-faint"
          >
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            <span>
              {loadingPhase === 'sending'
                ? 'Sending question...'
                : 'Receiving answer...'}
            </span>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[0.6875rem] text-text-faint leading-relaxed">
              {helperText ?? 'Ask about a mechanism, paradox, comparison, or implication. The guide stays tied to the paper.'}
              <span className="text-rule"> · </span>
              This opens or reopens a private reading. Publishing to Community is a separate, intentional step.
            </p>
          </div>
        )}
      </div>

      {disabled && disabledReason && (
        <p className="text-[0.6875rem] text-text-faint text-center mt-1.5">
          {disabledReason}
        </p>
      )}
    </div>
  )
}
