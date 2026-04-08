import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { SPRING_CRISP, PAGE_TRANSITION, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { PaperHero } from './PaperHero'
import { CommunityPreview } from './CommunityPreview'
import { PaperSectionView } from './PaperSectionView'
import { NodeArc } from '../decorative/NodeArc'
import type { Exploration } from '../../lib/api'
import type { TabId } from '../layout/TabNav'

interface EditorialViewProps {
  readonly isActive: boolean
  readonly activeSectionId: string
  readonly onSectionClick: (id: string) => void
  readonly onOpenCommunityExploration?: (explorationId: string) => void
  readonly onTabChange?: (tab: TabId) => void
  /** Whether to show inline community notes on sections */
  readonly notesVisible?: boolean
  /** Notes grouped by sectionId */
  readonly notesBySection?: ReadonlyMap<string, Exploration[]>
}

export function EditorialView({
  isActive,
  activeSectionId,
  onSectionClick,
  onOpenCommunityExploration,
  onTabChange,
  notesVisible = false,
  notesBySection,
}: EditorialViewProps) {
  const openCommunityNote = useCallback((explorationId: string) => {
    onOpenCommunityExploration?.(explorationId)
  }, [onOpenCommunityExploration])

  return (
    <motion.div
      key="editorial"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={PAGE_TRANSITION}
      className="min-w-0 overflow-x-hidden"
    >
      <PaperHero />

      {/* Section-by-section reading — the main content */}
      <div className="mt-10">
        <PaperSectionView
          activeSectionId={activeSectionId}
          onSectionClick={onSectionClick}
          notesVisible={notesVisible}
          notesBySection={notesBySection}
          onOpenNote={openCommunityNote}
        />
      </div>

      {/* Navigation to other tabs — after the reading content */}
      {onTabChange && (
        <motion.div
          className="mt-10 grid gap-3 sm:grid-cols-3"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          {([
            { tab: 'results' as TabId, eyebrow: 'Simulation lab', title: 'Results', detail: 'Run scenarios, compare paradigms, export artifacts.' },
            { tab: 'agent' as TabId, eyebrow: 'Questions & experiments', title: 'Agent workspace', detail: 'Ask the paper, run simulations, export results.' },
            { tab: 'community' as TabId, eyebrow: 'Public responses', title: 'Community notes', detail: 'Human notes on readings and simulation runs.' },
          ] as const).map(item => (
            <motion.button
              key={item.tab}
              variants={STAGGER_ITEM}
              whileTap={{ scale: 0.98 }}
              transition={SPRING_CRISP}
              onClick={() => onTabChange(item.tab)}
              className="group relative overflow-hidden rounded-xl border border-rule bg-white p-4 text-left card-hover globe-grid"
            >
              <div className="absolute right-1 top-1 w-[80px] h-[40px] opacity-[0.35] pointer-events-none select-none" aria-hidden="true">
                <NodeArc className="w-full h-full text-muted" />
              </div>
              <div className="relative">
                <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{item.eyebrow}</span>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-13 font-medium text-text-primary group-hover:text-accent transition-colors">{item.title}</span>
                  <span className="text-xs text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">{item.detail}</div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Community preview — after nav cards */}
      <div className="mt-8">
        <CommunityPreview
          isActive={isActive}
          onOpenNote={openCommunityNote}
          onTabChange={onTabChange}
        />
      </div>

    </motion.div>
  )
}
