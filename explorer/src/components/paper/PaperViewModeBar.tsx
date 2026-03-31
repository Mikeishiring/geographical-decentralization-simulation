import { motion, AnimatePresence } from 'framer-motion'
import { Eye, LayoutList, FileText, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SOFT, SPRING_SNAPPY } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import type { TabId } from '../layout/TabNav'

export type ReaderMode = 'editorial' | 'focus' | 'argument-map' | 'paper'

export const MODE_META: Record<ReaderMode, { icon: typeof Eye; label: string; detail: string }> = {
  editorial: {
    icon: BookOpen,
    label: 'Editorial',
    detail: 'Narrative walkthrough with side-by-side evidence blocks',
  },
  focus: {
    icon: Eye,
    label: 'Focus',
    detail: 'Distraction-free reading, centered layout',
  },
  'argument-map': {
    icon: LayoutList,
    label: 'Argument map',
    detail: 'Expandable claims organized by section',
  },
  paper: {
    icon: FileText,
    label: 'Full text',
    detail: 'Typeset paper — single column, inline figures, academic layout',
  },
}

interface PaperViewModeBarProps {
  readonly readerMode: ReaderMode
  readonly onModeChange: (mode: ReaderMode) => void
  readonly activeSectionIndex: number
  readonly guideOpen: boolean
  readonly onGuideToggle: () => void
  readonly onSectionClick: (id: string) => void
  readonly onTabChange?: (tab: TabId) => void
}

export function PaperViewModeBar({
  readerMode,
  onModeChange,
  activeSectionIndex,
  guideOpen,
  onGuideToggle,
  onSectionClick,
  onTabChange,
}: PaperViewModeBarProps) {
  const argumentMapMode = readerMode === 'argument-map'
  const paperMode = readerMode === 'paper'
  const progressPercent = ((activeSectionIndex + 1) / PAPER_SECTIONS.length) * 100

  return (
    <div className="sticky top-[4.5rem] z-20 -mx-4 px-4 py-3 bg-white/95 backdrop-blur-sm border-b border-rule sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-1">
          {(Object.keys(MODE_META) as ReaderMode[]).map(mode => {
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
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
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

        <div className="flex items-center gap-3">
          {!argumentMapMode && !paperMode && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted">
              <span>{activeSectionIndex + 1}/{PAPER_SECTIONS.length}</span>
              <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-active">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  animate={{ width: `${progressPercent}%` }}
                  transition={SPRING_SOFT}
                />
              </div>
            </div>
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
                <div className="text-xs font-medium text-text-primary">Current mode</div>
                <p className="mt-2 text-sm text-muted">{MODE_META[readerMode].detail}</p>
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
