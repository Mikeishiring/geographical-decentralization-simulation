import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ListTree, FileText, BookOpen } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import { Tooltip } from '../ui/Tooltip'
import type { TabId } from '../layout/TabNav'
import {
  AnimatedBookOpen,
  AnimatedListTree,
  AnimatedFileText,
  AnimatedMessageSquare,
  AnimatedChevronToggle,
  AnimatedSparkles,
} from './AnimatedViewIcons'

export type ReaderMode = 'editorial' | 'arguments' | 'paper'

export const MODE_META: Record<ReaderMode, { icon: typeof ListTree; label: string; detail: string; fidelity: string; fidelityShort: string; provenanceHint: string }> = {
  editorial: {
    icon: BookOpen,
    label: 'Editorial',
    detail: 'LLM-generated narrative walkthrough with source provenance',
    fidelity: 'LLM narrative',
    fidelityShort: 'Interpreted',
    provenanceHint: 'Narrative text is LLM-generated. Source pills show provenance.',
  },
  arguments: {
    icon: ListTree,
    label: 'Arguments',
    detail: 'Core claims organized by argument structure with cited evidence',
    fidelity: 'Structured claims',
    fidelityShort: 'Arguments',
    provenanceHint: 'Claims and evidence extracted from the paper. Narrative is minimal; source pills show provenance.',
  },
  paper: {
    icon: FileText,
    label: 'Original PDF',
    detail: 'Published arXiv PDF — unmodified source document',
    fidelity: 'Original arXiv',
    fidelityShort: 'Source',
    provenanceHint: 'Unmodified published document — no interpretation layer.',
  },
}

const MODES_ORDERED: readonly ReaderMode[] = ['editorial', 'arguments', 'paper'] as const

const SPECTRUM_POSITIONS: Record<ReaderMode, number> = {
  editorial: 0,
  arguments: 50,
  paper: 100,
}

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
  const paperMode = readerMode === 'paper'
  const progressPercent = ((activeSectionIndex + 1) / PAPER_SECTIONS.length) * 100

  const activeSection = !paperMode ? PAPER_SECTIONS[activeSectionIndex] : null
  const [hoveredMode, setHoveredMode] = useState<ReaderMode | null>(null)
  const [notesHovered, setNotesHovered] = useState(false)

  return (
    <div className="sticky top-[4.5rem] z-20 -mx-4 px-4 py-2 bg-white/95 backdrop-blur-sm border-b border-rule sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-x-3">
        {/* Mode switcher */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-0.5 shrink-0" role="tablist" aria-label="Reading mode">
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
                      'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                      isActive
                        ? 'text-text-primary font-medium'
                        : 'text-muted hover:text-text-primary',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="mode-pill"
                        className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-black/[0.04]"
                        transition={SPRING_SNAPPY}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      {mode === 'editorial' && <AnimatedBookOpen isActive={isActive} isHovered={isHovered} />}
                      {mode === 'arguments' && <AnimatedListTree isActive={isActive} isHovered={isHovered} />}
                      {mode === 'paper' && <AnimatedFileText isActive={isActive} isHovered={isHovered} />}
                      <span className="hidden sm:inline">{meta.label}</span>
                    </span>
                  </motion.button>
                </Tooltip>
              )
            })}
          </div>

        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onNotesToggle && (
            <Tooltip label="Toggle inline community annotations">
              <button
                onClick={onNotesToggle}
                onMouseEnter={() => setNotesHovered(true)}
                onMouseLeave={() => setNotesHovered(false)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                  notesVisible
                    ? 'border-accent/30 bg-accent/5 text-accent'
                    : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
                )}
              >
                <AnimatedMessageSquare isActive={notesVisible} isHovered={notesHovered} />
                Notes
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
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                guideOpen
                  ? 'border-accent/30 bg-accent/5 text-accent'
                  : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
              )}
            >
              <AnimatedChevronToggle isActive={guideOpen} />
              Reading guide
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
            <div className="space-y-4 pt-4">
              {/* Current position — section progress */}
              {activeSection && (
                <div className="flex items-center gap-3 rounded-lg border border-rule bg-surface-active/50 px-3 py-2">
                  <span className="mono-xs text-accent shrink-0">{activeSection.number}</span>
                  <span className="text-xs text-text-primary truncate">{activeSection.title}</span>
                  <div className="ml-auto flex items-center gap-2 shrink-0 text-xs text-muted">
                    <span className="tabular-nums">{activeSectionIndex + 1}/{PAPER_SECTIONS.length}</span>
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

              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-medium text-text-primary">Best first stops</div>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { id: 'se4a-attestation', label: 'SE4a attestation threshold' },
                      { id: 'se2-distribution', label: 'SE2 starting geography' },
                      { id: 'discussion', label: 'Discussion and implications' },
                      { id: 'limitations', label: 'Limitations (truth boundary)' },
                    ].map((entry, i) => (
                      <a key={entry.id} href={`#${entry.id}`} onClick={() => onSectionClick(entry.id)} className="block text-sm text-muted hover:text-accent transition-colors">
                        <span className="text-xs text-accent mr-1">{i + 1}.</span> {entry.label}
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-text-primary">Fidelity spectrum</div>
                  {/* Animated spectrum visualization */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-2xs select-none whitespace-nowrap flex items-center gap-1 text-amber-500/50">
                      <AnimatedSparkles isActive={readerMode === 'editorial'} />
                      <span className="text-amber-600/50">Interpreted</span>
                    </span>
                    <div className="relative w-16 h-4 flex items-center">
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
                        className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-accent"
                        animate={{ left: `${SPECTRUM_POSITIONS[readerMode]}%` }}
                        style={{ marginLeft: -5 }}
                        transition={SPRING_SNAPPY}
                      />
                    </div>
                    <span className="text-2xs text-accent/50 select-none whitespace-nowrap">Source</span>
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
                            'flex items-center gap-2 w-full rounded-md px-2 py-1 text-xs transition-colors text-left',
                            isCurrent
                              ? 'bg-accent/8 text-accent font-medium'
                              : 'text-muted hover:text-text-primary hover:bg-surface-active',
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
                  <p className="mt-2 text-2xs text-muted leading-relaxed">{MODE_META[readerMode].detail}</p>
                  <p className="mt-1 text-2xs text-text-faint leading-relaxed italic">{MODE_META[readerMode].provenanceHint}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-text-primary">References & artifacts</div>
                  <div className="mt-2 space-y-1.5">
                    {PAPER_METADATA.references.map(ref => (
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
  )
}
