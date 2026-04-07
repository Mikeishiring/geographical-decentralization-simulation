import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ListTree, FileText, BookOpen, ScrollText } from 'lucide-react'
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
  icon: typeof ListTree
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
    icon: BookOpen,
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
    icon: ListTree,
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
    icon: ScrollText,
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
    icon: FileText,
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

const MODES_ORDERED: readonly ReaderMode[] = ['editorial', 'arguments', 'html', 'paper'] as const

interface PaperViewModeBarProps {
  readonly readerMode: ReaderMode
  readonly onModeChange: (mode: ReaderMode) => void
  /** Whether inline community notes are shown on sections */
  readonly notesVisible?: boolean
  readonly onNotesToggle?: () => void
  /** Total number of published notes across all sections */
  readonly noteCount?: number
}

export function PaperViewModeBar({
  readerMode,
  onModeChange,
  notesVisible = false,
  onNotesToggle,
  noteCount = 0,
}: PaperViewModeBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [hoveredMode, setHoveredMode] = useState<ReaderMode | null>(null)
  const [notesHovered, setNotesHovered] = useState(false)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const updateHeight = () => {
      document.documentElement.style.setProperty('--explorer-paper-mode-bar-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`)
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
      className="sticky z-40 -mx-4 border-b border-rule/70 bg-canvas/92 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
      style={{ top: 'var(--explorer-tab-nav-height, 3.75rem)' }}
    >
      <div className="rounded-[1rem] border border-rule/80 bg-white/90 px-2.5 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:px-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {/* Mode switcher */}
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="grid w-full grid-cols-4 items-center gap-0.5 rounded-xl border border-rule bg-surface-active p-0.5 sm:inline-flex sm:w-auto sm:grid-cols-none"
              role="tablist"
              aria-label="Reading mode"
            >
              {MODES_ORDERED.map(mode => {
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
                        'relative flex min-h-[2.25rem] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors sm:justify-start',
                        isActive
                          ? 'font-medium'
                          : cn('text-muted hover:text-text-primary', meta.hoverTabClass),
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="mode-pill"
                          className={cn('absolute inset-0 rounded-lg shadow-sm ring-1', meta.activeTabClass)}
                          transition={SPRING_SNAPPY}
                        />
                      )}
                      <span className={cn('relative flex items-center gap-1.5', isActive ? meta.activeTextClass : null)}>
                        {mode === 'editorial' && <AnimatedBookOpen isActive={isActive} isHovered={isHovered} />}
                        {mode === 'arguments' && <AnimatedListTree isActive={isActive} isHovered={isHovered} />}
                        {mode === 'html' && <AnimatedScrollText isActive={isActive} isHovered={isHovered} />}
                        {mode === 'paper' && <AnimatedFileText isActive={isActive} isHovered={isHovered} />}
                        <span className="hidden sm:inline">{meta.label}</span>
                      </span>
                    </motion.button>
                  </Tooltip>
                )
              })}
            </div>

          </div>

          {onNotesToggle && (
            <Tooltip label="Show inline public notes, note highlights, and section annotation prompts">
              <button
                onClick={onNotesToggle}
                onMouseEnter={() => setNotesHovered(true)}
                onMouseLeave={() => setNotesHovered(false)}
                className={cn(
                  'flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  notesVisible
                    ? 'border-accent/30 bg-accent/5 text-accent'
                    : 'border-accent/20 bg-white text-accent/80 hover:border-accent/35 hover:bg-accent/[0.05] hover:text-accent',
                )}
              >
                <AnimatedMessageSquare isActive={notesVisible} isHovered={notesHovered} />
                <span className="sm:hidden">Notes</span>
                <span className="hidden sm:inline">Community notes</span>
                {noteCount > 0 && (
                  <motion.span
                    className={cn(
                      'ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
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
        </div>

      </div>
    </div>
  )
}
