import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Compass, MousePointerClick, X, MessageSquarePlus, Eye, Highlighter, BookOpen, ListTree, BarChart3 } from 'lucide-react'
import { cn } from '../../lib/cn'

const SESSION_KEY = 'paper-guide-dismissed'

const ORIENT_STEPS = [
  {
    icon: BookOpen,
    title: 'Start with the Abstract',
    detail: 'The Editorial view gives you an interpreted walkthrough. Switch to Arguments for a structured breakdown.',
  },
  {
    icon: ListTree,
    title: 'Four reading modes',
    detail: 'Editorial (narrative), Arguments (claims), HTML (source article), PDF (original). Each adds a different lens.',
  },
  {
    icon: BarChart3,
    title: 'Explore beyond the paper',
    detail: 'Results runs simulations, Agent answers questions, Community shows public notes.',
  },
] as const

const ANNOTATE_STEPS = [
  {
    icon: Highlighter,
    title: 'Highlight any passage',
    detail: 'Select text to open the note composer.',
  },
  {
    icon: MessageSquarePlus,
    title: 'Publish a human takeaway',
    detail: 'Add context in your own words — your interpretation layered on cited evidence.',
  },
  {
    icon: Eye,
    title: 'See it in two places',
    detail: 'Notes appear inline in the paper and on the Community page.',
  },
] as const

type GuideTab = 'orient' | 'annotate'

/**
 * Floating paper guide — bottom-right widget combining orientation
 * (how to use the app) and annotation instructions (how to add notes).
 * Collapsed pill, expandable card with two tabs.
 */
export function AnnotationGuide() {
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1',
  )
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [autoCollapsed, setAutoCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<GuideTab>('orient')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (dismissed) return
    const t = setTimeout(() => setVisible(true), 600)
    return () => clearTimeout(t)
  }, [dismissed])

  useEffect(() => {
    if (!visible || dismissed || autoCollapsed) return
    const t = setTimeout(() => setExpanded(true), 800)
    return () => clearTimeout(t)
  }, [visible, dismissed, autoCollapsed])

  useEffect(() => {
    if (!expanded || autoCollapsed) return
    const t = setTimeout(() => {
      setExpanded(false)
      setAutoCollapsed(true)
    }, 8000)
    return () => clearTimeout(t)
  }, [expanded, autoCollapsed])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* noop */ }
    const el = containerRef.current
    if (el) {
      const onEnd = () => { setDismissed(true); el.removeEventListener('transitionend', onEnd) }
      el.addEventListener('transitionend', onEnd)
    } else {
      setDismissed(true)
    }
  }, [])

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev)
    setAutoCollapsed(true)
  }, [])

  if (dismissed) return null

  const steps = activeTab === 'orient' ? ORIENT_STEPS : ANNOTATE_STEPS

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6 origin-bottom-right"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: visible
          ? 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.12s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {expanded ? (
        <motion.div
          key="card"
          initial={{ opacity: 0.6, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-[300px] origin-bottom-right rounded-2xl border border-black/[0.06] bg-white/[0.97] shadow-[0_16px_48px_rgba(15,23,42,0.12),0_0_0_1px_rgba(0,0,0,0.06)] backdrop-blur-lg sm:w-[320px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <div className="flex items-center gap-2">
              {activeTab === 'orient'
                ? <Compass className="h-3.5 w-3.5 text-accent" />
                : <MousePointerClick className="h-3.5 w-3.5 text-accent" />
              }
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                {activeTab === 'orient' ? 'Getting started' : 'How to annotate'}
              </span>
            </div>
            <button
              onClick={handleDismiss}
              className="flex h-5 w-5 items-center justify-center rounded-full text-stone-400 transition-[color,background-color] duration-100 hover:bg-stone-100 hover:text-stone-600 active:scale-[0.92] active:transition-transform active:duration-100"
              aria-label="Dismiss guide"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="mx-4 mb-2 flex gap-0.5 rounded-lg border border-rule bg-surface-active p-0.5">
            {([
              { id: 'orient' as GuideTab, label: 'Reading guide', icon: Compass },
              { id: 'annotate' as GuideTab, label: 'Annotating', icon: MousePointerClick },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-white text-text-primary shadow-sm'
                    : 'text-stone-400 hover:text-stone-600',
                )}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-0 px-4 pb-4">
            {steps.map((step, i) => {
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
            className="w-full border-t border-black/[0.04] px-4 py-2 text-[10px] font-medium text-stone-400 transition-[color] duration-100 hover:text-stone-600 active:scale-[0.97] active:transition-transform active:duration-100"
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
            'shadow-[0_4px_20px_rgba(15,23,42,0.1),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-lg',
            'text-[11px] font-medium text-stone-500 transition-[color,background-color] duration-150 hover:bg-white hover:text-stone-700',
            'origin-bottom-right active:scale-[0.92] active:transition-transform active:duration-100',
          )}
          aria-label="Open guide"
        >
          <Compass className="h-3.5 w-3.5 text-accent" />
          <span className="hidden sm:inline">Guide</span>
        </motion.button>
      )}
    </div>
  )
}
