import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'

const EXAMPLE_CHIPS = [
  'Why does a higher gamma centralize SSP more but MSP less?',
  'Does starting geography matter more than paradigm choice?',
  'Why do the same low-latency regions keep winning?',
  'What changes under shorter slots: geography or fairness?',
] as const

interface QueryBarProps {
  onSubmit?: (query: string) => void
  disabled?: boolean
  loading?: boolean
  disabledReason?: string
  helperText?: string
}

export function QueryBar({ onSubmit, disabled, loading, disabledReason, helperText }: QueryBarProps) {
  const [query, setQuery] = useState('')
  const isEnabled = !disabled && !loading
  const placeholder = disabled
    ? disabledReason ?? 'The reading guide is unavailable right now.'
    : 'Ask a sharp paper-backed question about a mechanism, paradox, or comparison...'

  const handleSubmit = () => {
    const trimmed = query.trim()
    if (!trimmed || !isEnabled) return
    onSubmit?.(trimmed)
    setQuery('')
  }

  const handleChip = (text: string) => {
    if (!isEnabled) return
    onSubmit?.(text)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-[#F4F4F2] px-5 py-6 sm:px-8 sm:py-8 shadow-sm">
      <div className={cn(
        'bg-white border border-border-subtle rounded-lg transition-all shadow-sm',
        isEnabled && 'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 focus-within:shadow-md',
      )}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          {loading ? (
            <Loader2 className="w-4 h-4 text-accent shrink-0 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-muted shrink-0" />
          )}
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={placeholder}
            disabled={!isEnabled}
            aria-label="Search the paper"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-muted outline-none disabled:opacity-50"
          />
          {query.trim() && isEnabled && (
            <button
              onClick={handleSubmit}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors"
            >
              Ask
            </button>
          )}
        </div>
      </div>

      {/* Example chips */}
      {!disabled && !loading && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-3 justify-center text-xs text-muted"
          >
            {EXAMPLE_CHIPS.map((chip, i) => (
              <motion.button
                key={chip}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...SPRING, delay: i * 0.04 }}
                onClick={() => handleChip(chip)}
                className="hover:text-accent transition-colors"
              >
                {chip}
              </motion.button>
            )).flatMap((el, i) =>
              i < EXAMPLE_CHIPS.length - 1
                ? [el, <span key={`sep-${i}`} className="text-text-faint">·</span>]
                : [el]
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <p className="text-[11px] text-text-faint text-center mt-2">
        {helperText ?? 'Ask about a mechanism, paradox, or comparison. The guide stays tied to the paper.'}
      </p>

      {disabled && disabledReason && (
        <p className="text-[11px] text-text-faint text-center mt-1.5">
          {disabledReason}
        </p>
      )}
    </div>
  )
}
