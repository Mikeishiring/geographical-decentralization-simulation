import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { PAGE_TRANSITION } from '../../lib/theme'
import { PaperHero } from './PaperHero'
import { PaperSectionView } from './PaperSectionView'
import type { Exploration } from '../../lib/api'

interface EditorialViewProps {
  readonly activeSectionId: string
  readonly onSectionClick: (id: string) => void
  readonly onOpenCommunityExploration?: (explorationId: string) => void
  /** Whether to show inline community notes on sections */
  readonly notesVisible?: boolean
  /** Notes grouped by sectionId */
  readonly notesBySection?: ReadonlyMap<string, Exploration[]>
}

export function EditorialView({
  activeSectionId,
  onSectionClick,
  onOpenCommunityExploration,
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

      <div className="mt-6">
        <PaperSectionView
          activeSectionId={activeSectionId}
          onSectionClick={onSectionClick}
          notesVisible={notesVisible}
          notesBySection={notesBySection}
          onOpenNote={openCommunityNote}
        />
      </div>
    </motion.div>
  )
}
