import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { SPRING, SPRING_CRISP, PAGE_TRANSITION, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import { type TopicCard } from '../../data/default-blocks'
import { createExploration, publishExploration } from '../../lib/api'
import { BlockCanvas } from '../explore/BlockCanvas'
import { PaperHero } from './PaperHero'
import { TopicCardGrid } from './TopicCardGrid'
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
  /** Navigate to Agent tab with a pre-filled query */
  readonly onQueryAgent?: (query: string) => void
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
  onQueryAgent,
  notesVisible = false,
  notesBySection,
}: EditorialViewProps) {
  const queryClient = useQueryClient()
  const [activeTopic, setActiveTopic] = useState<TopicCard | null>(null)
  const publishMutation = useMutation({
    mutationFn: async (input: {
      sectionId: string
      title: string
      takeaway: string
      author: string
    }) => {
      const section = PAPER_SECTIONS.find(s => s.id === input.sectionId)
      if (!section) throw new Error('Section not found')

      const created = await createExploration({
        query: section.title,
        summary: section.description,
        blocks: [...section.blocks],
        followUps: [],
        model: '',
        cached: false,
        surface: 'reading',
        anchor: { sectionId: input.sectionId, excerpt: '' },
      })

      return await publishExploration(created.id, {
        title: input.title,
        takeaway: input.takeaway,
        author: input.author || undefined,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
    },
  })

  const handleTopicClick = (card: TopicCard) => {
    setActiveTopic(prev => (prev?.id === card.id ? null : card))
  }

  const handleBackToOverview = () => {
    setActiveTopic(null)
  }

  const handleSectionPublish = useCallback((sectionId: string, payload: { title: string; takeaway: string; author: string }) => {
    publishMutation.mutate({ sectionId, ...payload })
  }, [publishMutation])

  const openCommunityNote = useCallback((explorationId: string) => {
    onOpenCommunityExploration?.(explorationId)
  }, [onOpenCommunityExploration])

  const showTopic = activeTopic !== null

  return (
    <motion.div key="editorial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE_TRANSITION}>
      <PaperHero onSectionClick={onSectionClick} />

      <div className="mt-6">
        <TopicCardGrid
          activeTopic={activeTopic}
          showingAi={false}
          onTopicClick={handleTopicClick}
          onBackToOverview={handleBackToOverview}
        />
      </div>

      {/* Topic detail blocks (only when a topic is selected) */}
      <AnimatePresence mode="wait">
        {showTopic && (
          <motion.div
            key={activeTopic.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
            className="mt-6"
          >
            <div className="mb-4">
              <h2 className="text-base font-semibold text-text-primary font-serif">{activeTopic.title}</h2>
              <p className="mt-1 text-sm text-muted">{activeTopic.description}</p>
            </div>
            <BlockCanvas blocks={activeTopic.blocks} />
            {activeTopic.prompts.length > 0 && (onQueryAgent || onTabChange) && (
              <div className="mt-6 pt-4 border-t border-rule">
                <span className="text-xs text-muted mb-2 block">Ask the Agent about this topic</span>
                <motion.div
                  className="flex flex-wrap gap-2"
                  variants={STAGGER_CONTAINER}
                  initial="hidden"
                  animate="visible"
                >
                  {activeTopic.prompts.slice(0, 4).map((prompt, i) => (
                    <motion.button
                      key={`${prompt}-${i}`}
                      variants={STAGGER_ITEM}
                      onClick={() => onQueryAgent ? onQueryAgent(prompt) : onTabChange?.('agent')}
                      className="follow-up-chip"
                      title={`Ask Agent: ${prompt}`}
                    >
                      {prompt}
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section-by-section reading — the main content */}
      <div className="mt-8">
        <PaperSectionView
          activeSectionId={activeSectionId}
          onSectionClick={onSectionClick}
          onPublish={handleSectionPublish}
          isPublishing={publishMutation.isPending}
          publishError={(publishMutation.error as Error | null)?.message ?? null}
          notesVisible={notesVisible}
          notesBySection={notesBySection}
          onOpenNote={openCommunityNote}
        />
      </div>

      {/* Navigation to other tabs — after the reading content */}
      {!showTopic && onTabChange && (
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

      {/* References footer */}
      <motion.section
        className="mt-8 rounded-xl border border-rule bg-white p-5 sm:p-6 geo-accent-bar"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={SPRING}
      >
        <div className="lab-section-title">References and intent</div>
        <p className="mt-3 max-w-2xl text-13 leading-[1.65] text-text-body font-serif">
          This reader view makes the paper easier to absorb without replacing the canonical study. The best first stops are the gamma paradox, the starting-geography section, and the limitations — they define the paper's surprise, realism, and confidence boundary.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {[...PAPER_METADATA.references, { label: 'Original published demo', url: 'https://geo-decentralization.github.io/' }].map(ref => (
            <a
              key={ref.label}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="arrow-link"
            >
              {ref.label}
            </a>
          ))}
        </div>
      </motion.section>
    </motion.div>
  )
}
