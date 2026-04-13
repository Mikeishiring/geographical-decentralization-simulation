import { type ReactNode, useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, MousePointerClick, X, MessageSquarePlus, Eye, Highlighter, ListTree, BarChart3, MessagesSquare } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_POPUP, SPRING_CRISP } from '../../lib/theme'

const SESSION_KEY = 'paper-guide-dismissed'

interface GuideStep {
  icon: typeof ListTree
  title: string
  detail: ReactNode
}

const COMMUNITY_LINK = (
  <a
    href="/?tab=community"
    className="text-stone-500 underline decoration-stone-300/0 underline-offset-2 transition-[text-decoration-color] duration-150 hover:decoration-stone-400"
  >Community page</a>
)

const ORIENT_STEPS: GuideStep[] = [
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
]

const ANNOTATE_STEPS: GuideStep[] = [
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
    detail: <>Notes appear inline in the paper and on the {COMMUNITY_LINK}.</>,
  },
  {
    icon: MessagesSquare,
    title: 'Discuss in Community',
    detail: <>Browse, vote, and reply to notes from other readers on the {COMMUNITY_LINK}.</>,
  },
]

type GuideTab = 'orient' | 'annotate'

interface AnnotationGuideProps {
  readonly openRequestKey?: number
  readonly showFloatingTrigger?: boolean
  readonly paperMode?: boolean
}

/**
 * Three-stage guide widget — bottom-right corner.
 *
 *   hidden  → (hover corner)  → hinting  → (click)  → open
 *   open    → (close/got-it)  → hidden
 *   hinting → (mouse leaves)  → hidden
 *
 * First visit: auto-opens after a short delay, then collapses to hidden.
 * After that, the guide lives in the corner as an invisible hover zone.
 */
export function AnnotationGuide({
  openRequestKey = 0,
  showFloatingTrigger = true,
  paperMode = false,
}: AnnotationGuideProps) {
  const [stage, setStage] = useState<'hidden' | 'hinting' | 'open'>('hidden')
  const stageRef = useRef(stage)
  const [hasAutoShown, setHasAutoShown] = useState(() =>
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1',
  )
  const [activeTab, setActiveTab] = useState<GuideTab>('orient')
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync with state
  const updateStage = useCallback((next: 'hidden' | 'hinting' | 'open') => {
    stageRef.current = next
    setStage(next)
  }, [])

  // First visit: auto-open after delay, then auto-collapse
  useEffect(() => {
    if (hasAutoShown) return
    const showTimer = setTimeout(() => {
      updateStage('open')
      setHasAutoShown(true)
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* noop */ }

      autoCollapseTimerRef.current = setTimeout(() => {
        updateStage('hidden')
      }, 8000)
    }, 1200)

    return () => {
      clearTimeout(showTimer)
      if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current)
    }
  }, [hasAutoShown, updateStage])

  const handleZoneEnter = useCallback(() => {
    if (!showFloatingTrigger) return
    if (stageRef.current !== 'hidden') return
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    updateStage('hinting')
  }, [showFloatingTrigger, updateStage])

  const handleZoneLeave = useCallback(() => {
    if (!showFloatingTrigger) return
    if (stageRef.current === 'open') return
    // Short delay before hiding — prevents flicker on accidental mouse drift
    leaveTimerRef.current = setTimeout(() => {
      if (stageRef.current === 'open') return
      updateStage('hidden')
    }, 300)
  }, [showFloatingTrigger, updateStage])

  const handleHintClick = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current)
      autoCollapseTimerRef.current = null
    }
    updateStage('open')
  }, [updateStage])

  const handleClose = useCallback(() => {
    updateStage('hidden')
  }, [updateStage])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
      if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (openRequestKey <= 0) return
    handleHintClick()
  }, [handleHintClick, openRequestKey])

  const steps = activeTab === 'orient' ? ORIENT_STEPS : ANNOTATE_STEPS

  return (
    <div
      className="fixed bottom-0 right-0 z-40"
      onMouseEnter={handleZoneEnter}
      onMouseLeave={handleZoneLeave}
    >
      {/* Invisible hover zone — always present, large enough to discover */}
      {(showFloatingTrigger || stage === 'open') && (
        <div
          className={cn(
            'absolute bottom-0 right-0 transition-[width,height]',
            paperMode
              ? stage === 'open'
                ? 'h-[380px] w-[300px]'
                : 'h-16 w-16'
              : stage === 'open'
                ? 'h-[420px] w-[340px]'
                : 'h-24 w-24',
          )}
          style={{ transitionDuration: '200ms', transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      )}

      <AnimatePresence>
        {showFloatingTrigger && stage === 'hinting' && (
          <motion.button
            key="hint"
            initial={{ opacity: 0, scale: 0.4, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)' }}
            transition={SPRING_POPUP}
            onClick={handleHintClick}
            className={cn(
              'absolute',
              paperMode ? 'bottom-4 right-4 sm:bottom-5 sm:right-5' : 'bottom-5 right-5 sm:bottom-6 sm:right-6',
              'flex items-center gap-2 rounded-full',
              'border border-black/[0.06] bg-white/[0.95] backdrop-blur-lg',
              'shadow-[0_4px_20px_rgba(15,23,42,0.1),0_0_0_1px_rgba(0,0,0,0.04)]',
              'origin-bottom-right cursor-pointer',
              'active:scale-[0.92] active:transition-transform active:duration-100',
            )}
            aria-label="Open guide"
          >
            {/* Breathing ring behind the icon */}
            <span className="absolute inset-0 rounded-full animate-[guidePulse_2.4s_ease-in-out_infinite] bg-accent/[0.06]" />

            <span className={cn('relative flex items-center gap-2', paperMode ? 'px-3 py-1.5' : 'px-3.5 py-2')}>
              <Compass className="h-3.5 w-3.5 text-accent" />
              <span className="hidden text-[11px] font-medium text-stone-500 sm:inline">Guide</span>
            </span>
          </motion.button>
        )}

        {stage === 'open' && (
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.88, y: 12, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.92, y: 8, filter: 'blur(6px)' }}
            transition={{
              ...SPRING_POPUP,
              filter: { duration: 0.2 },
            }}
            className={cn(
              'absolute origin-bottom-right rounded-2xl border border-black/[0.06] bg-white/[0.97] shadow-[0_16px_48px_rgba(15,23,42,0.12),0_0_0_1px_rgba(0,0,0,0.06)] backdrop-blur-lg',
              paperMode ? 'bottom-4 right-4 w-[286px] sm:bottom-5 sm:right-5 sm:w-[306px]' : 'bottom-5 right-5 w-[300px] sm:bottom-6 sm:right-6 sm:w-[320px]',
            )}
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
                onClick={handleClose}
                className="flex h-5 w-5 items-center justify-center rounded-full text-stone-400 transition-[color,background-color] duration-100 hover:bg-stone-100 hover:text-stone-600 active:scale-[0.92] active:transition-transform active:duration-100"
                aria-label="Close guide"
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
            <div className="px-4 pb-1">
              {activeTab === 'orient' && (
                <div className="rounded-xl border border-black/[0.05] bg-[#fbfaf8] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                    Suggested entry points
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-stone-500">
                    Start with the lens that matches your task, then branch into Results, Agent, or Community.
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-0 px-4 pb-4">
              {steps.map((step, i) => {
                const Icon = step.icon
                return (
                  <motion.div
                    key={step.title}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SPRING_CRISP, delay: i * 0.05 }}
                    className="flex gap-3 py-2.5"
                  >
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
                  </motion.div>
                )
              })}
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="w-full border-t border-black/[0.04] px-4 py-2 text-[10px] font-medium text-stone-400 transition-[color] duration-100 hover:text-stone-600 active:scale-[0.97] active:transition-transform active:duration-100"
            >
              Got it
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
