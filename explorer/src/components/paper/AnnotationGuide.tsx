import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { MousePointerClick, X, MessageSquarePlus, Eye, Highlighter } from 'lucide-react'
import { cn } from '../../lib/cn'

const SESSION_KEY = 'annotation-guide-dismissed'

const STEPS = [
  {
    icon: Highlighter,
    title: 'Highlight any passage',
    detail: 'Select text in Editorial, Arguments, or HTML view to open the note composer.',
  },
  {
    icon: MessageSquarePlus,
    title: 'Publish a human takeaway',
    detail: 'Add context in your own words. Public notes are your interpretation layered on cited evidence.',
  },
  {
    icon: Eye,
    title: 'See it in two places',
    detail: 'Published notes appear inline in the paper and on the Community page for replies and voting.',
  },
] as const

/**
 * Floating annotation guide — bottom-right widget with collapsed pill
 * and expandable 3-step card. Dismissed state persists for the session.
 */
export function AnnotationGuide() {
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1',
  )
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [autoCollapsed, setAutoCollapsed] = useState(false)

  // Entrance: fade in after a short delay
  useEffect(() => {
    if (dismissed) return
    const t = setTimeout(() => setVisible(true), 600)
    return () => clearTimeout(t)
  }, [dismissed])

  // Auto-expand shortly after appearing
  useEffect(() => {
    if (!visible || dismissed || autoCollapsed) return
    const t = setTimeout(() => setExpanded(true), 800)
    return () => clearTimeout(t)
  }, [visible, dismissed, autoCollapsed])

  // Auto-collapse after showing the expanded card
  useEffect(() => {
    if (!expanded || autoCollapsed) return
    const t = setTimeout(() => {
      setExpanded(false)
      setAutoCollapsed(true)
    }, 6000)
    return () => clearTimeout(t)
  }, [expanded, autoCollapsed])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* noop */ }
    // Remove from DOM after fade-out completes
    setTimeout(() => setDismissed(true), 300)
  }, [])

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev)
    setAutoCollapsed(true) // prevent auto-collapse on manual interaction
  }, [])

  if (dismissed) return null

  return (
    <div
      className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6 origin-bottom-right transition-all duration-200 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {expanded ? (
        <motion.div
          key="card"
          initial={{ opacity: 0.6, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-[300px] origin-bottom-right rounded-2xl border border-black/[0.06] bg-white/[0.97] shadow-[0_16px_48px_rgba(15,23,42,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] backdrop-blur-lg sm:w-[320px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-3.5 w-3.5 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                How to annotate
              </span>
            </div>
            <button
              onClick={handleDismiss}
              className="flex h-5 w-5 items-center justify-center rounded-md text-stone-400 transition-colors duration-100 hover:bg-stone-100 hover:text-stone-600"
              aria-label="Dismiss annotation guide"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-0 px-4 pb-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="flex gap-3 py-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/8 text-accent">
                    <Icon className="h-2.5 w-2.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold leading-tight text-stone-800">
                      <span className="mr-1.5 text-accent/50">{i + 1}.</span>
                      {step.title}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-stone-500">
                      {step.detail}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Collapse button */}
          <button
            onClick={() => { setExpanded(false); setAutoCollapsed(true) }}
            className="w-full border-t border-black/[0.04] px-4 py-2 text-[10px] font-medium text-stone-400 transition-colors hover:text-stone-600"
          >
            Got it
          </button>
        </motion.div>
      ) : (
        <motion.button
          key="pill"
          initial={{ opacity: 0.6, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          onClick={handleToggle}
          className={cn(
            'flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/[0.95] px-3.5 py-2',
            'shadow-[0_4px_20px_rgba(15,23,42,0.1),0_0_0_0.5px_rgba(0,0,0,0.03)] backdrop-blur-lg',
            'text-[11px] font-medium text-stone-500 transition-colors duration-150 hover:bg-white hover:text-stone-700',
            'origin-bottom-right',
          )}
          aria-label="Open annotation guide"
        >
          <MousePointerClick className="h-3.5 w-3.5 text-accent" />
          <span className="hidden sm:inline">How to annotate</span>
        </motion.button>
      )}
    </div>
  )
}
