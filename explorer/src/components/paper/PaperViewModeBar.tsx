import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ListTree, FileText, BookOpen, ScrollText, MousePointerClick, Users } from 'lucide-react'
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
  AnimatedSparkles,
} from './AnimatedViewIcons'

export type ReaderMode = 'editorial' | 'arguments' | 'html' | 'paper'

export const MODE_META: Record<ReaderMode, { icon: typeof ListTree; label: string; detail: string; fidelity: string; fidelityShort: string; provenanceHint: string }> = {
  editorial: {
    icon: BookOpen,
    label: 'Editorial',
    detail: 'Interpreted walkthrough with source pills',
    fidelity: 'LLM narrative',
    fidelityShort: 'Interpreted',
    provenanceHint: 'Narrative text is LLM-generated. Source pills show provenance.',
  },
  arguments: {
    icon: ListTree,
    label: 'Arguments',
    detail: 'Argument structure with citations',
    fidelity: 'Structured claims',
    fidelityShort: 'Arguments',
    provenanceHint: 'Claims and evidence extracted from the paper. Narrative is minimal; source pills show provenance.',
  },
  html: {
    icon: ScrollText,
    label: 'HTML View',
    detail: 'Source-oriented article with anchored sections, figures, and appendices',
    fidelity: 'HTML source',
    fidelityShort: 'HTML',
    provenanceHint: 'Article-style source view. Keeps section structure and source links without PDF-only navigation.',
  },
  paper: {
    icon: FileText,
    label: 'Original PDF',
    detail: 'Unmodified arXiv PDF',
    fidelity: 'Original arXiv',
    fidelityShort: 'Source',
    provenanceHint: 'Unmodified published document — no interpretation layer.',
  },
}

const MODES_ORDERED: readonly ReaderMode[] = ['editorial', 'arguments', 'html', 'paper'] as const

const SPECTRUM_POSITIONS: Record<ReaderMode, number> = {
  editorial: 0,
  arguments: 34,
  html: 70,
  paper: 100,
}

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
  const sections = study.sections
  const paperMode = readerMode === 'paper'
  const progressPercent = ((activeSectionIndex + 1) / sections.length) * 100

  const activeSection = !paperMode ? sections[activeSectionIndex] : null
  const [hoveredMode, setHoveredMode] = useState<ReaderMode | null>(null)
  const [notesHovered, setNotesHovered] = useState(false)
  const suggestedEntryIds = study.navigation.bestFirstStopIds
  const suggestedEntries = suggestedEntryIds
    .map(id => sections.find(section => section.id === id))
    .filter((section): section is (typeof sections)[number] => !!section)
  const referenceLinks = study.metadata.references.filter(
    (ref): ref is typeof ref & { readonly url: string } => typeof ref.url === 'string' && ref.url.length > 0,
  )

  return (
    <div
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
                  <Tooltip key={mode} label={meta.detail}>
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
                          ? 'text-text-primary font-medium'
                          : 'text-muted hover:text-text-primary',
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="mode-pill"
                          className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-black/[0.04]"
                          transition={SPRING_SNAPPY}
                        />
                      )}
                      <span className="relative flex items-center gap-1.5">
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
            <Tooltip label="Navigation, fidelity spectrum, and references">
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
                <span className="sm:hidden">Guide</span>
                <span className="hidden sm:inline">Reading guide</span>
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
              <div className="space-y-4 border-t border-rule/70 pt-4">
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

                <div className="rounded-lg border border-accent/12 bg-accent/[0.035] px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-text-primary">
                    <Users className="h-3.5 w-3.5 text-accent" />
                    Community notes workflow
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {COMMUNITY_NOTE_STEPS.map((item, index) => (
                      <div key={item.title} className="rounded-md border border-rule/60 bg-white/85 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent/70">
                          {index === 0 ? <MousePointerClick className="h-3 w-3" /> : <span>{`0${index + 1}`}</span>}
                          <span>{item.title}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-3">
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
                    <div className="text-xs font-medium text-text-primary">Fidelity spectrum</div>
                    {/* Animated spectrum visualization */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-2xs flex select-none items-center gap-1 whitespace-nowrap text-amber-500/50">
                        <AnimatedSparkles isActive={readerMode === 'editorial'} />
                        <span className="text-amber-600/50">Interpreted</span>
                      </span>
                      <div className="relative flex h-4 w-16 items-center">
                        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-300/30 via-rule to-accent/20" />
                        {MODES_ORDERED.map((mode, i) => (
                          <div
                            key={mode}
                            className={cn(
                              'absolute top-1/2 -translate-y-1/2 rounded-full',
                              readerMode === mode ? 'h-1.5 w-1.5 bg-accent' : 'h-1 w-1 bg-rule',
                            )}
                            style={{ left: `${(i / (MODES_ORDERED.length - 1)) * 100}%`, marginLeft: readerMode === mode ? -3 : -2 }}
                          />
                        ))}
                        <motion.div
                          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-accent"
                          animate={{ left: `${SPECTRUM_POSITIONS[readerMode]}%` }}
                          style={{ marginLeft: -5 }}
                          transition={SPRING_SNAPPY}
                        />
                      </div>
                      <span className="text-2xs select-none whitespace-nowrap text-accent/50">Source</span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {MODES_ORDERED.map(mode => {
                        const meta = MODE_META[mode]
                        const Icon = meta.icon
                        const isCurrent = readerMode === mode
                        return (
                          <button
                            key={mode}
                            onClick={() => onModeChange(mode)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
                              isCurrent
                                ? 'bg-accent/8 text-accent font-medium'
                                : 'text-muted hover:bg-surface-active hover:text-text-primary',
                            )}
                          >
                            <Icon className="h-3 w-3 shrink-0" />
                            <span>{meta.label}</span>
                            <span className={cn('ml-auto text-2xs', isCurrent ? 'text-accent/60' : 'text-text-faint')}>
                              {meta.fidelityShort}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-2xs leading-relaxed text-muted">{MODE_META[readerMode].detail}</p>
                    <p className="mt-1 text-2xs leading-relaxed text-text-faint italic">{MODE_META[readerMode].provenanceHint}</p>
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
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
