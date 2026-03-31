import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, BookOpen } from 'lucide-react'
import { cn } from '../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../lib/theme'
import { DEFAULT_BLOCKS, type TopicCard } from '../data/default-blocks'
import { PAPER_METADATA, PAPER_SECTIONS } from '../data/paper-sections'
import { createExploration, publishExploration } from '../lib/api'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { NodeArc } from '../components/decorative/NodeArc'
import { PaperHero } from '../components/paper/PaperHero'
import { TopicCardGrid } from '../components/paper/TopicCardGrid'
import { CommunityPreview } from '../components/paper/CommunityPreview'
import { PaperSectionView } from '../components/paper/PaperSectionView'
import type { TabId } from '../components/layout/TabNav'

type ViewMode = 'editorial' | 'focus'

const VIEW_MODES: { id: ViewMode; icon: typeof Eye; label: string }[] = [
  { id: 'editorial', icon: BookOpen, label: 'Editorial' },
  { id: 'focus', icon: Eye, label: 'Focus' },
]

const BEST_FIRST_STOP_IDS = ['se4a-attestation', 'se2-distribution', 'discussion', 'limitations'] as const

function sectionEntryLine(sectionId: string): string {
  const lines: Record<string, string> = {
    'se4a-attestation': 'Start here for the paper\'s sharpest paradox: the same gamma change pushes SSP and MSP in opposite directions.',
    'se2-distribution': 'Start here if you want to ask whether starting geography matters more than paradigm choice.',
    discussion: 'Start here for design implications without overstating what the model has solved.',
    limitations: 'Start here for the confidence boundary of the model.',
  }
  return lines[sectionId] ?? ''
}

export function PaperLandingPage({
  isActive = true,
  onOpenCommunityExploration,
  onTabChange,
}: {
  isActive?: boolean
  onOpenCommunityExploration?: (explorationId: string) => void
  onTabChange?: (tab: TabId) => void
}) {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('editorial')
  const [activeTopic, setActiveTopic] = useState<TopicCard | null>(null)

  const bestFirstStops = PAPER_SECTIONS.filter(section =>
    BEST_FIRST_STOP_IDS.includes(section.id as (typeof BEST_FIRST_STOP_IDS)[number]),
  )

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
    <div className="space-y-10 overflow-x-hidden">
      {/* Hero */}
      <PaperHero />

      {/* Best first stops */}
      <section className="reveal-up rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="lab-section-title">Best first stops</div>
            <div className="mt-1.5 text-13 font-medium text-text-primary">Four strong entry points into the paper</div>
          </div>
          <div className="max-w-2xl text-13 leading-[1.6] text-muted">
            Start with the paradox, then check the realism question, the implications, and the limitations.
          </div>
        </div>
        <div className="mt-4 divide-y divide-rule stagger-reveal">
          {bestFirstStops.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="group flex items-baseline justify-between gap-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <span className="mono-xs text-accent uppercase">{section.number}</span>
                <div className="mt-0.5 text-13 font-medium text-text-primary group-hover:text-accent transition-colors">{section.title}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted">{sectionEntryLine(section.id)}</div>
              </div>
              <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
            </a>
          ))}
        </div>
      </section>

      {/* Topic cards + overview blocks */}
      <TopicCardGrid
        activeTopic={activeTopic}
        showingAi={false}
        onTopicClick={handleTopicClick}
        onBackToOverview={handleBackToOverview}
      />

      {/* Default/topic blocks */}
      <AnimatePresence mode="wait">
        {showTopic ? (
          <motion.div
            key={activeTopic.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <div className="mb-4">
              <h2 className="text-base font-semibold text-text-primary font-serif">{activeTopic.title}</h2>
              <p className="mt-1 text-sm text-muted">{activeTopic.description}</p>
            </div>
            <BlockCanvas blocks={activeTopic.blocks} />
            {activeTopic.prompts.length > 0 && onTabChange && (
              <div className="mt-6 pt-4 border-t border-rule">
                <span className="text-xs text-muted mb-2 block">Ask the Agent about this topic</span>
                <div className="flex flex-wrap gap-2 stagger-reveal">
                  {activeTopic.prompts.slice(0, 4).map((prompt, i) => (
                    <button
                      key={`${prompt}-${i}`}
                      onClick={() => onTabChange('agent')}
                      className="follow-up-chip"
                      title={`Ask Agent: ${prompt}`}
                    >
                      {prompt}
                      <span aria-hidden="true" className="follow-up-chip-arrow">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <BlockCanvas blocks={DEFAULT_BLOCKS} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation to other tabs */}
      {!showTopic && onTabChange && (<>
        <div className="section-divider" />
        <div className="stagger-reveal grid gap-3 sm:grid-cols-3">
          {([
            { tab: 'original' as TabId, eyebrow: 'Canonical source', title: 'Original PDF', detail: 'Dark mode, annotations, exact published paper.', accent: 'accent' },
            { tab: 'agent' as TabId, eyebrow: 'Questions & experiments', title: 'Agent workspace', detail: 'Ask the paper, run simulations, export results.', accent: 'accent-warm' },
            { tab: 'community' as TabId, eyebrow: 'Public responses', title: 'Community notes', detail: 'Human notes on readings and simulation runs.', accent: 'success' },
          ] as const).map(item => (
            <button
              key={item.tab}
              onClick={() => onTabChange(item.tab)}
              className="group relative overflow-hidden rounded-xl border border-rule bg-white p-4 text-left card-hover globe-grid"
            >
              {/* Node-arc motif — globe DNA */}
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
            </button>
          ))}
        </div>
      </>)}

      {/* Community preview */}
      <CommunityPreview
        isActive={isActive}
        onOpenNote={openCommunityNote}
        onTabChange={onTabChange}
      />

      {/* View mode toggle */}
      <div className="section-divider" />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="lab-section-title">Full paper sections</div>
          <div className="mt-1.5 text-13 font-medium text-text-primary">Section-by-section editorial reading</div>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-1">
          {VIEW_MODES.map(mode => {
            const Icon = mode.icon
            const isActive = viewMode === mode.id
            return (
              <motion.button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                  isActive ? 'text-text-primary font-medium' : 'text-muted hover:text-text-primary',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="view-mode-pill"
                    className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-rule"
                    transition={SPRING_SNAPPY}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{mode.label}</span>
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Full paper sections */}
      <PaperSectionView
        focusMode={viewMode === 'focus'}
        onPublish={handleSectionPublish}
        isPublishing={publishMutation.isPending}
        publishError={(publishMutation.error as Error | null)?.message ?? null}
      />

      {/* Section divider */}
      <div className="section-divider" />

      {/* References footer */}
      <section className="rounded-xl border border-rule bg-white p-5 sm:p-6 geo-accent-bar">
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
      </section>
    </div>
  )
}
