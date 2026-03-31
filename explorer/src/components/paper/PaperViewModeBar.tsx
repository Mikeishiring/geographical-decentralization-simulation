import { motion, AnimatePresence } from 'framer-motion'
import { Eye, FileText, BookOpen, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import type { TabId } from '../layout/TabNav'

export type ReaderMode = 'editorial' | 'focus' | 'paper'

export const MODE_META: Record<ReaderMode, { icon: typeof Eye; label: string; detail: string; fidelity: string; fidelityShort: string }> = {
  editorial: {
    icon: BookOpen,
    label: 'Editorial',
    detail: 'LLM-generated narrative walkthrough with source provenance',
    fidelity: 'LLM narrative',
    fidelityShort: 'Interpreted',
  },
  focus: {
    icon: Eye,
    label: 'Focus',
    detail: 'Same editorial content, distraction-free centered layout',
    fidelity: 'Clean reading',
    fidelityShort: 'Interpreted',
  },
  paper: {
    icon: FileText,
    label: 'Original PDF',
    detail: 'Published arXiv PDF — unmodified source document',
    fidelity: 'Original arXiv',
    fidelityShort: 'Source',
  },
}

const MODES_ORDERED: readonly ReaderMode[] = ['editorial', 'focus', 'paper'] as const

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

  return (
    <div className="sticky top-[4.5rem] z-20 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur-sm border-b border-rule sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        {/* Mode switcher + active section */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-0.5 shrink-0">
            {MODES_ORDERED.map(mode => {
              const meta = MODE_META[mode]
              const Icon = meta.icon
              const isActive = readerMode === mode
              return (
                <motion.button
                  key={mode}
                  onClick={() => onModeChange(mode)}
                  title={meta.detail}
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
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{meta.label}</span>
                  </span>
                </motion.button>
              )
            })}
          </div>

          {/* Active section label + progress */}
          {activeSection && (
            <div className="hidden md:flex items-center gap-2.5 min-w-0">
              <span className="text-rule">·</span>
              <span className="mono-xs text-accent shrink-0">{activeSection.number}</span>
              <span className="text-xs text-text-primary truncate">{activeSection.title}</span>
              <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted">
                <span>{activeSectionIndex + 1}/{PAPER_SECTIONS.length}</span>
                <div className="h-1 w-14 overflow-hidden rounded-full bg-surface-active">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${progressPercent}%` }}
                    transition={SPRING_SOFT}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onNotesToggle && (
            <button
              onClick={onNotesToggle}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                notesVisible
                  ? 'border-accent/30 bg-accent/5 text-accent'
                  : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
              )}
            >
              <MessageSquare className="h-3 w-3" />
              Notes
              {noteCount > 0 && (
                <span className={cn(
                  'ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                  notesVisible ? 'bg-accent text-white' : 'bg-surface-active text-text-faint',
                )}>
                  {noteCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={onGuideToggle}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
              guideOpen
                ? 'border-accent/30 bg-accent/5 text-accent'
                : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
            )}
          >
            {guideOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Reading guide
          </button>
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
            <div className="grid gap-6 pt-4 sm:grid-cols-3">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
