import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ListTree, FileText, BookOpen, ScrollText, MousePointerClick, Users, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { getActiveStudy } from '../../studies'
import { Tooltip } from '../ui/Tooltip'
import type { TabId } from '../layout/TabNav'
import {
  AnimatedBookOpen,
  AnimatedListTree,
  AnimatedFileText,
  AnimatedScrollText,
  AnimatedMessageSquare,
  AnimatedChevronToggle,
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
  summaryClass: string
  dotClass: string
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
    summaryClass: 'border-[rgba(194,85,58,0.16)] bg-[rgba(194,85,58,0.055)]',
    dotClass: 'bg-accent-warm',
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
    summaryClass: 'border-slate-200/90 bg-slate-50/85',
    dotClass: 'bg-slate-500',
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
    summaryClass: 'border-accent/20 bg-accent/[0.05]',
    dotClass: 'bg-accent',
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
    summaryClass: 'border-slate-200/90 bg-[rgba(148,163,184,0.08)]',
    dotClass: 'bg-slate-700',
    badgeClass: 'border-slate-200/80 bg-white/82 text-slate-600',
  },
}

const MODES_ORDERED: readonly ReaderMode[] = ['editorial', 'arguments', 'html', 'paper'] as const

const COMMUNITY_NOTE_STEPS = [
  {
    title: 'Highlight any passage',
    detail: 'Select text in Editorial, Arguments, HTML, or the PDF to open the note composer.',
  },
  {
    title: 'Publish a human takeaway',
    detail: 'Add context in your own words. Public notes are interpretation layered on top of the cited evidence.',
  },
  {
    title: 'See it in two places',
    detail: 'Published notes appear inline in the paper and on the Community page for replies, votes, and linking.',
  },
] as const

interface PaperViewModeBarProps {
  readonly readerMode: ReaderMode
  readonly onModeChange: (mode: ReaderMode) => void
  readonly activeSectionIndex: number
  readonly guideOpen: boolean
  readonly onGuideToggle: () => void
  readonly onSectionClick: (id: string) => void
  readonly onTabChange?: (tab: TabId) => void
  /** Whether inline community notes are shown on sections */
  readonly notesVisible?: boolean
  readonly onNotesToggle?: () => void
  /** Total number of published notes across all sections */
  readonly noteCount?: number
}

export function PaperViewModeBar({
  readerMode,
  onModeChange,
  activeSectionIndex,
  guideOpen,
  onGuideToggle,
  onSectionClick,
  onTabChange,
  notesVisible = false,
  onNotesToggle,
  noteCount = 0,
}: PaperViewModeBarProps) {
  const study = getActiveStudy()
  const barRef = useRef<HTMLDivElement | null>(null)
  const sections = study.sections
  const paperMode = readerMode === 'paper'
  const progressPercent = ((activeSectionIndex + 1) / sections.length) * 100
  const currentModeMeta = MODE_META[readerMode]

  const activeSection = !paperMode ? sections[activeSectionIndex] : null
  const [hoveredMode, setHoveredMode] = useState<ReaderMode | null>(null)
  const [notesHovered, setNotesHovered] = useState(false)
  const [lensToast, setLensToast] = useState<ReaderMode | null>(null)
  const prevModeRef = useRef(readerMode)

  /* Show toast only when user actively switches mode (not on mount) */
  useEffect(() => {
    if (prevModeRef.current === readerMode) return
    prevModeRef.current = readerMode
    setLensToast(readerMode)
    const timer = setTimeout(() => setLensToast(null), 3000)
    return () => clearTimeout(timer)
  }, [readerMode])
  const suggestedEntryIds = study.navigation.bestFirstStopIds
  const suggestedEntries = suggestedEntryIds
    .map(id => sections.find(section => section.id === id))
    .filter((section): section is (typeof sections)[number] => !!section)
  const mobileSuggestedEntries = suggestedEntries.slice(0, 3)
  const referenceLinks = study.metadata.references.filter(
    (ref): ref is typeof ref & { readonly url: string } => typeof ref.url === 'string' && ref.url.length > 0,
  )
  const mobileQuickLinks = [
    ...referenceLinks.slice(0, 2).map(ref => ({ label: ref.label, href: ref.url })),
    ...(onTabChange ? [{ label: 'Simulation results', href: '#results' }] : []),
  ]

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
  }, [guideOpen, noteCount, notesVisible, readerMode])

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

          <div className="grid w-full grid-cols-2 items-stretch gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:justify-end">
            {onNotesToggle && (
              <Tooltip label="Show inline public notes, note highlights, and section annotation prompts">
                <button
                  onClick={onNotesToggle}
                  onMouseEnter={() => setNotesHovered(true)}
                  onMouseLeave={() => setNotesHovered(false)}
                  className={cn(
                    'flex min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors sm:w-auto',
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
            <Tooltip label="Entry points, note workflow, and references">
              <button
                onClick={onGuideToggle}
                className={cn(
                  'flex min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors sm:w-auto',
                  guideOpen
                    ? 'border-accent/30 bg-accent/5 text-accent'
                    : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
                )}
              >
                <AnimatedChevronToggle isActive={guideOpen} />
                <span className="sm:hidden">Map</span>
                <span className="hidden sm:inline">Research map</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Collapsible reading guide panel */}
        <AnimatePresence>
          {guideOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING}
              className="overflow-hidden"
            >
              <div className="space-y-3.5 border-t border-rule/70 pt-3.5 sm:space-y-4 sm:pt-4">
                {/* Current position — section progress */}
                {activeSection && (
                  <div className="flex items-center gap-3 rounded-lg border border-rule bg-surface-active/50 px-3 py-2">
                    <span className="mono-xs text-accent shrink-0">{activeSection.number}</span>
                    <span className="text-xs text-text-primary truncate">{activeSection.title}</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0 text-xs text-muted">
                      <span className="tabular-nums">{activeSectionIndex + 1}/{sections.length}</span>
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-active">
                        <motion.div
                          className="h-full rounded-full bg-accent"
                          animate={{ width: `${progressPercent}%` }}
                          transition={SPRING_SOFT}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-accent/12 bg-accent/[0.035] px-3 py-2.5 sm:py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-text-primary">
                    <Users className="h-3.5 w-3.5 text-accent" />
                    Community notes workflow
                  </div>
                  <div className="mt-3 sm:hidden">
                    <p className="text-xs leading-relaxed text-muted">
                      Highlight text in any mode to attach a public note to the passage. Published notes also appear on the Community page for replies and voting.
                    </p>
                  </div>
                  <div className="mt-3 hidden gap-2 sm:grid sm:grid-cols-3">
                    {COMMUNITY_NOTE_STEPS.map((item, index) => (
                      <div key={item.title} className="rounded-md border border-rule/60 bg-white/85 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent/70">
                          {index === 0 ? <MousePointerClick className="h-3 w-3" /> : <span>{`0${index + 1}`}</span>}
                          <span>{item.title}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:hidden">
                  <div className="rounded-lg border border-rule/70 bg-white/85 px-3 py-2.5">
                    <div className="text-xs font-medium text-text-primary">Suggested entry points</div>
                    <div className="mt-1.5 space-y-1.5">
                      {mobileSuggestedEntries.map((entry, i) => (
                        <a key={entry.id} href={`#${entry.id}`} onClick={() => onSectionClick(entry.id)} className="block text-[13px] leading-5 text-muted transition-colors hover:text-accent">
                          <span className="mr-1 text-xs text-accent">{i + 1}.</span> {entry.title}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-rule/70 bg-white/85 px-3 py-2.5">
                    <div className="text-xs font-medium text-text-primary">Quick links</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {mobileQuickLinks.map(link => (
                        link.href === '#results' ? (
                          <button
                            key={link.label}
                            onClick={() => onTabChange?.('results')}
                            className="inline-flex items-center rounded-full border border-rule/60 bg-surface-active/60 px-2.5 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-accent/20 hover:text-accent"
                          >
                            {link.label}
                          </button>
                        ) : (
                          <a
                            key={link.label}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full border border-rule/60 bg-surface-active/60 px-2.5 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-accent/20 hover:text-accent"
                          >
                            {link.label}
                          </a>
                        )
                      ))}
                    </div>
                  </div>
                </div>

                <div className="hidden gap-6 sm:grid sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div>
                    <div className="text-xs font-medium text-text-primary">Suggested entry points</div>
                    <div className="mt-2 space-y-1.5">
                      {suggestedEntries.map((entry, i) => (
                        <a key={entry.id} href={`#${entry.id}`} onClick={() => onSectionClick(entry.id)} className="block text-sm text-muted transition-colors hover:text-accent">
                          <span className="mr-1 text-xs text-accent">{i + 1}.</span> {entry.title}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-text-primary">References & artifacts</div>
                    <div className="mt-2 space-y-1.5">
                      {referenceLinks.map(ref => (
                        <a key={ref.label} href={ref.url} target="_blank" rel="noopener noreferrer" className="arrow-link text-xs">
                          {ref.label}
                        </a>
                      ))}
                      {onTabChange && (
                        <button onClick={() => onTabChange('results')} className="arrow-link text-xs">
                          Simulation results
                        </button>
                      )}
                    </div>
                    <p className="mt-3 text-2xs leading-relaxed text-muted">{currentModeMeta.provenanceHint}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating lens toast — appears on mode switch */}
      <AnimatePresence>
        {lensToast && (() => {
          const meta = MODE_META[lensToast]
          return (
            <motion.div
              key={lensToast}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.8 }}
              className={cn(
                'absolute right-4 top-full z-50 mt-2 flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)] sm:right-6',
                meta.summaryClass,
              )}
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dotClass)} />
              <div className="min-w-0">
                <span className="text-xs font-medium text-text-primary">{meta.lensLabel}</span>
                <span className="mx-1.5 text-rule">·</span>
                <span className="text-[11px] text-muted">{meta.detail}</span>
              </div>
              <button
                onClick={() => setLensToast(null)}
                className="ml-1 shrink-0 rounded-md p-0.5 text-muted/60 transition-colors hover:bg-black/[0.04] hover:text-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
