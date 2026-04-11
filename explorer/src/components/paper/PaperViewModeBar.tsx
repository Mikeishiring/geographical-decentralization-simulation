import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Compass } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_SNAPPY } from '../../lib/theme'
import { Tooltip } from '../ui/Tooltip'
import {
  AnimatedBookOpen,
  AnimatedListTree,
  AnimatedFileText,
  AnimatedScrollText,
  AnimatedMessageSquare,
} from './AnimatedViewIcons'

export type ReaderMode = 'editorial' | 'arguments' | 'html' | 'paper'

export const MODE_META: Record<ReaderMode, {
  label: string
  lensLabel: string
  toneLabel: string
  detail: string
  provenanceHint: string
  activeTextClass: string
  activeTabClass: string
  hoverTabClass: string
  badgeClass: string
}> = {
  editorial: {
    label: 'Editorial',
    lensLabel: 'Interpretive lens',
    toneLabel: 'Synthesized',
    detail: 'Interpreted walkthrough with source pills',
    provenanceHint: 'Narrative text is LLM-generated. Source pills show provenance.',
    activeTextClass: 'text-accent-warm',
    activeTabClass: 'bg-[rgba(194,85,58,0.10)] text-accent-warm ring-[rgba(194,85,58,0.16)]',
    hoverTabClass: 'hover:bg-[rgba(194,85,58,0.05)] hover:text-accent-warm',
    badgeClass: 'border-[rgba(194,85,58,0.14)] bg-white/80 text-accent-warm',
  },
  arguments: {
    label: 'Arguments',
    lensLabel: 'Claim lens',
    toneLabel: 'Structured',
    detail: 'Argument structure with citations',
    provenanceHint: 'Claims and evidence extracted from the paper. Narrative is minimal; source pills show provenance.',
    activeTextClass: 'text-slate-700',
    activeTabClass: 'bg-slate-100/95 text-slate-700 ring-slate-200/90',
    hoverTabClass: 'hover:bg-slate-100/70 hover:text-slate-700',
    badgeClass: 'border-slate-200/80 bg-white/80 text-slate-600',
  },
  html: {
    label: 'HTML',
    lensLabel: 'Source lens',
    toneLabel: 'Anchored',
    detail: 'Source-oriented article with anchored sections, figures, and appendices',
    provenanceHint: 'Article-style source view. Keeps section structure and source links without PDF-only navigation.',
    activeTextClass: 'text-accent',
    activeTabClass: 'bg-accent/[0.09] text-accent ring-accent/20',
    hoverTabClass: 'hover:bg-accent/[0.04] hover:text-accent',
    badgeClass: 'border-accent/18 bg-white/85 text-accent',
  },
  paper: {
    label: 'PDF',
    lensLabel: 'Record lens',
    toneLabel: 'Original',
    detail: 'Unmodified arXiv PDF',
    provenanceHint: 'Unmodified published document — no interpretation layer.',
    activeTextClass: 'text-slate-700',
    activeTabClass: 'bg-[rgba(148,163,184,0.12)] text-slate-700 ring-[rgba(148,163,184,0.22)]',
    hoverTabClass: 'hover:bg-[rgba(148,163,184,0.08)] hover:text-slate-700',
    badgeClass: 'border-slate-200/80 bg-white/82 text-slate-600',
  },
}

/** Views are interpretive lenses; formats are source renderings */
const VIEW_MODES: readonly ReaderMode[] = ['editorial', 'arguments'] as const
const FORMAT_MODES: readonly ReaderMode[] = ['html', 'paper'] as const
const ALL_MODES: readonly ReaderMode[] = [...VIEW_MODES, ...FORMAT_MODES] as const

interface PaperViewModeBarProps {
  readonly readerMode: ReaderMode
  readonly onModeChange: (mode: ReaderMode) => void
  readonly onGuideOpen?: () => void
  /** Whether inline community notes are shown on sections */
  readonly notesVisible?: boolean
  readonly onNotesToggle?: () => void
  /** Total number of published notes across all sections */
  readonly noteCount?: number
}

export function PaperViewModeBar({
  readerMode,
  onModeChange,
  onGuideOpen,
  notesVisible = false,
  onNotesToggle,
  noteCount = 0,
}: PaperViewModeBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [hoveredMode, setHoveredMode] = useState<ReaderMode | null>(null)
  const [notesHovered, setNotesHovered] = useState(false)
  const [guideHovered, setGuideHovered] = useState(false)

  const isViewActive = (VIEW_MODES as readonly string[]).includes(readerMode)
  const activeMeta = MODE_META[readerMode]
  const showNotesToggle = Boolean(onNotesToggle) && readerMode !== 'paper'

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--explorer-paper-mode-bar-height',
        `${Math.ceil(bar.getBoundingClientRect().height)}px`,
      )
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => window.removeEventListener('resize', updateHeight)
    }

    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(bar)
    window.addEventListener('resize', updateHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [noteCount, notesVisible, readerMode])

  return (
    <div
      ref={barRef}
      data-testid="paper-view-mode-bar"
      className="sticky z-40 bg-white/92 backdrop-blur-md"
      style={{ top: 'var(--explorer-tab-nav-height, 3.75rem)' }}
    >
      <div className="border-b border-rule/70 py-3">
        <div className="rounded-[22px] border border-black/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(250,248,244,0.92))] px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:px-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                <span>{isViewActive ? 'Interpretive reading' : 'Source record'}</span>
                <span className="h-1 w-1 rounded-full bg-stone-300" />
                <span>{activeMeta.toneLabel}</span>
              </div>

              <div className="rounded-[16px] border border-black/[0.05] bg-white/88 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <nav className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Reading mode">
                  {ALL_MODES.map(mode => {
                    const meta = MODE_META[mode]
                    const isActive = readerMode === mode
                    const isHovered = hoveredMode === mode
                    return (
                      <Tooltip key={mode} label={`${meta.lensLabel} · ${meta.toneLabel}`} detail={meta.detail}>
                        <div className="flex items-center gap-1">
                          {mode === 'html' && (
                            <span aria-hidden className="mx-1 hidden h-5 w-px bg-black/[0.08] sm:block" />
                          )}
                          <motion.button
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => onModeChange(mode)}
                            onMouseEnter={() => setHoveredMode(mode)}
                            onMouseLeave={() => setHoveredMode(null)}
                            whileTap={{ scale: 0.97 }}
                            transition={SPRING_SNAPPY}
                            className={cn(
                              'relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium uppercase tracking-[0.04em] transition-[background-color,color,box-shadow]',
                              isActive
                                ? cn('shadow-sm ring-1', meta.activeTabClass)
                                : 'text-stone-500 hover:bg-black/[0.035] hover:text-stone-800',
                            )}
                          >
                            {mode === 'editorial' && <AnimatedBookOpen isActive={isActive} isHovered={isHovered} />}
                            {mode === 'arguments' && <AnimatedListTree isActive={isActive} isHovered={isHovered} />}
                            {mode === 'html' && <AnimatedScrollText isActive={isActive} isHovered={isHovered} />}
                            {mode === 'paper' && <AnimatedFileText isActive={isActive} isHovered={isHovered} />}
                            <span className={cn(isActive && meta.activeTextClass)}>{meta.label}</span>
                          </motion.button>
                        </div>
                      </Tooltip>
                    )
                  })}
                </nav>
              </div>

              <div data-testid="paper-current-lens-summary-desktop" className="sr-only">
                {activeMeta.lensLabel} {activeMeta.detail}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 xl:pl-4">
              {(showNotesToggle || onGuideOpen) && (
                <div className="flex items-center gap-1.5 rounded-[14px] border border-black/[0.06] bg-white/84 p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  {showNotesToggle && (
                    <Tooltip label="Show inline public notes, note highlights, and section annotation prompts">
                      <button
                        onClick={onNotesToggle}
                        onMouseEnter={() => setNotesHovered(true)}
                        onMouseLeave={() => setNotesHovered(false)}
                        aria-label="Notes"
                        className={cn(
                          'flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] transition-[background-color,color,border-color,box-shadow]',
                          notesVisible
                            ? 'bg-accent/8 text-accent shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]'
                            : 'text-stone-500 hover:bg-black/[0.035] hover:text-stone-800',
                        )}
                      >
                        <AnimatedMessageSquare isActive={notesVisible} isHovered={notesHovered} />
                        <span>Notes</span>
                        {noteCount > 0 && (
                          <motion.span
                            className={cn(
                              'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                              notesVisible ? 'bg-accent text-white' : 'bg-surface-active text-text-faint',
                            )}
                            animate={notesVisible ? { scale: [1, 1.2, 1] } : {}}
                            transition={SPRING_SNAPPY}
                          >
                            {noteCount}
                          </motion.span>
                        )}
                      </button>
                    </Tooltip>
                  )}
                  {showNotesToggle && onGuideOpen && (
                    <span aria-hidden className="h-4 w-px bg-black/[0.06]" />
                  )}
                  {onGuideOpen && (
                    <Tooltip label="Open the reading guide and suggested entry points for this paper surface">
                      <button
                        onClick={onGuideOpen}
                        onMouseEnter={() => setGuideHovered(true)}
                        onMouseLeave={() => setGuideHovered(false)}
                        aria-label="Guide"
                        className={cn(
                          'flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] text-stone-500 transition-[background-color,color,box-shadow]',
                          guideHovered
                            ? 'bg-black/[0.035] text-stone-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                            : 'hover:bg-black/[0.035] hover:text-stone-800',
                        )}
                      >
                        <Compass className="h-3.5 w-3.5" />
                        <span>Guide</span>
                      </button>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
