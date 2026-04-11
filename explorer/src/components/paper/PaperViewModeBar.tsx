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
      <div className="border-b border-rule/70 py-2.5">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* ── Left: View tabs + lens label ── */}
            <div className="flex min-w-0 items-center">
              <nav className="flex items-center" role="tablist" aria-label="Reading mode">
                {VIEW_MODES.map(mode => {
                  const meta = MODE_META[mode]
                  const isActive = readerMode === mode
                  const isHovered = hoveredMode === mode
                  return (
                    <Tooltip key={mode} label={`${meta.lensLabel} · ${meta.toneLabel}`} detail={meta.detail}>
                      <motion.button
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onModeChange(mode)}
                        onMouseEnter={() => setHoveredMode(mode)}
                        onMouseLeave={() => setHoveredMode(null)}
                        whileTap={{ scale: 0.96 }}
                        transition={SPRING_SNAPPY}
                        className={cn(
                          'relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] transition-colors first:pl-0',
                          isActive
                            ? meta.activeTextClass
                            : 'text-muted hover:text-text-primary',
                        )}
                      >
                        {mode === 'editorial' && <AnimatedBookOpen isActive={isActive} isHovered={isHovered} />}
                        {mode === 'arguments' && <AnimatedListTree isActive={isActive} isHovered={isHovered} />}
                        <span>{meta.label}</span>

                        {isActive && (
                          <motion.span
                            layoutId="view-indicator"
                            className="absolute bottom-0 left-0 right-0 h-[2px] first:left-0"
                            style={{
                              background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-warm))',
                            }}
                            transition={SPRING_SNAPPY}
                          />
                        )}
                      </motion.button>
                    </Tooltip>
                  )
                })}
              </nav>

              {isViewActive && (
                <span className="ml-1.5 hidden text-[11px] text-muted/50 sm:inline">
                  · {activeMeta.lensLabel}
                </span>
              )}
            </div>

            {/* ── Right: Format pills ── */}
            <div className="flex shrink-0 items-center gap-1.5">
              {FORMAT_MODES.map(mode => {
                const meta = MODE_META[mode]
                const isActive = readerMode === mode
                const isHovered = hoveredMode === mode
                return (
                  <Tooltip key={mode} label={`${meta.lensLabel} · ${meta.toneLabel}`} detail={meta.detail}>
                    <motion.button
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onModeChange(mode)}
                      onMouseEnter={() => setHoveredMode(mode)}
                      onMouseLeave={() => setHoveredMode(null)}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING_SNAPPY}
                      className={cn(
                        'relative flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors',
                        isActive
                          ? cn('font-medium shadow-sm ring-1', meta.activeTabClass)
                          : cn('text-muted', meta.hoverTabClass),
                      )}
                    >
                      {mode === 'html' && <AnimatedScrollText isActive={isActive} isHovered={isHovered} />}
                      {mode === 'paper' && <AnimatedFileText isActive={isActive} isHovered={isHovered} />}
                      <span className={cn(isActive && meta.activeTextClass)}>{meta.label}</span>
                    </motion.button>
                  </Tooltip>
                )
              })}
            </div>
          </div>

          <div className="hidden items-center justify-between gap-3 sm:flex">
            <div
              data-testid="paper-current-lens-summary-desktop"
              className="min-w-0 rounded-xl border border-black/[0.05] bg-[#fbfaf8]/90 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">
                {activeMeta.lensLabel}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-stone-600">
                {activeMeta.detail}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {onNotesToggle && onGuideOpen && <div className="mx-1 h-4 w-px bg-rule/60" />}
              {onNotesToggle && (
                <Tooltip label="Show inline public notes, note highlights, and section annotation prompts">
                  <button
                    onClick={onNotesToggle}
                    onMouseEnter={() => setNotesHovered(true)}
                    onMouseLeave={() => setNotesHovered(false)}
                    aria-label="Notes"
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors',
                      notesVisible
                        ? 'border-accent/30 bg-accent/5 text-accent'
                        : 'border-accent/20 bg-white text-accent/80 hover:border-accent/35 hover:bg-accent/[0.05] hover:text-accent',
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
              {onGuideOpen && (
                <Tooltip label="Open the reading guide and suggested entry points for this paper surface">
                  <button
                    onClick={onGuideOpen}
                    onMouseEnter={() => setGuideHovered(true)}
                    onMouseLeave={() => setGuideHovered(false)}
                    aria-label="Guide"
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] text-stone-600 transition-colors hover:border-accent/25 hover:bg-accent/[0.04] hover:text-accent',
                      guideHovered && 'shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
                    )}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>Guide</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 sm:hidden">
            {onNotesToggle && (
              <Tooltip label="Show inline public notes, note highlights, and section annotation prompts">
                <button
                  onClick={onNotesToggle}
                  onMouseEnter={() => setNotesHovered(true)}
                  onMouseLeave={() => setNotesHovered(false)}
                  aria-label="Notes"
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors',
                    notesVisible
                      ? 'border-accent/30 bg-accent/5 text-accent'
                      : 'border-accent/20 bg-white text-accent/80 hover:border-accent/35 hover:bg-accent/[0.05] hover:text-accent',
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
            {onGuideOpen && (
              <Tooltip label="Open the reading guide and suggested entry points for this paper surface">
                <button
                  onClick={onGuideOpen}
                  onMouseEnter={() => setGuideHovered(true)}
                  onMouseLeave={() => setGuideHovered(false)}
                  aria-label="Guide"
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] text-stone-600 transition-colors hover:border-accent/25 hover:bg-accent/[0.04] hover:text-accent',
                    guideHovered && 'shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
                  )}
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Guide</span>
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
