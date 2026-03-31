import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { SPRING, PAGE_TRANSITION } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import { PAPER_NARRATIVE } from '../../data/paper-narrative'
import { type TopicCard } from '../../data/default-blocks'
import { createExploration, publishExploration } from '../../lib/api'
import { BlockCanvas } from '../explore/BlockCanvas'
import { PaperHero } from './PaperHero'
import { TopicCardGrid } from './TopicCardGrid'
import { CommunityPreview } from './CommunityPreview'
import { PaperSectionView, SourceRefPill } from './PaperSectionView'
import { NodeArc } from '../decorative/NodeArc'
import { Link2, Check, Quote, Sparkles } from 'lucide-react'
import type { TabId } from '../layout/TabNav'

interface EditorialViewProps {
  readonly isActive: boolean
  readonly focusMode: boolean
  readonly activeSectionId: string
  readonly onSectionClick: (id: string) => void
  readonly onOpenCommunityExploration?: (explorationId: string) => void
  readonly onTabChange?: (tab: TabId) => void
}

export function EditorialView({
  isActive,
  focusMode,
  activeSectionId,
  onSectionClick,
  onOpenCommunityExploration,
  onTabChange,
}: EditorialViewProps) {
  const queryClient = useQueryClient()
  const [activeTopic, setActiveTopic] = useState<TopicCard | null>(null)
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null)

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

  const handleCopySectionLink = async (sectionId: string) => {
    const url = new URL(window.location.href)
    url.hash = sectionId
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedSectionId(sectionId)
      window.setTimeout(() => {
        setCopiedSectionId(current => (current === sectionId ? null : current))
      }, 1600)
    } catch {
      // Ignore clipboard failures
    }
  }

  const activeSection = PAPER_SECTIONS.find(section => section.id === activeSectionId) ?? PAPER_SECTIONS[0]
  const showTopic = activeTopic !== null

  return (
    <motion.div key="editorial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE_TRANSITION}>
      {/* Compact hero with inline best-first-stops */}
      <PaperHero onSectionClick={onSectionClick} />

      {/* Topic card strip — compact, one section */}
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
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section-by-section reading — the main content */}
      <div className="mt-8">
        {focusMode ? (
          /* Focus mode: centered, distraction-free */
          <div className="space-y-12">
            {/* Focus mode section indicator */}
            <div className="sticky top-40 z-10 rounded-lg border border-rule bg-white/95 backdrop-blur-sm px-4 py-2.5 geo-accent-bar">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-xs font-mono text-accent shrink-0">{activeSection.number}</span>
                  <span className="text-text-primary truncate">{activeSection.title}</span>
                  <span className="hidden md:inline-flex items-center gap-1 shrink-0 rounded-full border border-amber-200/40 bg-amber-50/50 px-2 py-0.5 text-2xs text-amber-600/50 select-none" title="Hover narrative text to see source provenance">
                    <Sparkles className="h-2.5 w-2.5" />
                    Interpreted
                  </span>
                </div>
                <button
                  onClick={() => handleCopySectionLink(activeSection.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text-primary shrink-0"
                >
                  {copiedSectionId === activeSection.id ? <Check className="h-3 w-3 text-success" /> : <Link2 className="h-3 w-3" />}
                  {copiedSectionId === activeSection.id ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>

            {PAPER_SECTIONS.map((section, index) => {
              const narrative = PAPER_NARRATIVE[section.id]
              if (!narrative) return null
              const previousSection = PAPER_SECTIONS[index - 1]
              const nextSection = PAPER_SECTIONS[index + 1]

              return (
                <motion.section
                  key={section.id}
                  id={section.id}
                  data-section-id={section.id}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={SPRING}
                  className="group scroll-mt-40 mx-auto max-w-5xl rounded-lg border border-rule bg-white p-5 transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-6"
                >
                  <div className="mb-6 border-b border-rule pb-5">
                    <h2 className="mt-2 max-w-3xl text-2xl font-medium text-text-primary font-serif sm:text-3xl">
                      {section.title}
                    </h2>
                    <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
                      {section.description}
                    </p>
                  </div>

                  <div className="group/prose space-y-5">
                    <div>
                      <p className="max-w-3xl text-2xl leading-relaxed text-text-primary font-serif">
                        {narrative.lede}
                      </p>
                      {narrative.sourceRefs?.lede && (
                        <div className="mt-1.5"><SourceRefPill source={narrative.sourceRefs.lede} /></div>
                      )}
                    </div>
                    <div className="max-w-3xl space-y-4 text-base leading-9 text-text-body font-serif">
                      {narrative.paragraphs.map((paragraph, i) => {
                        const ref = narrative.sourceRefs?.paragraphs?.[i]
                        return (
                          <div key={paragraph}>
                            <p>{paragraph}</p>
                            {ref && <div className="mt-1.5"><SourceRefPill source={ref} /></div>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="border-l-2 border-l-accent/40 pl-5 py-2">
                      <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-2">
                        <Quote className="h-3 w-3" />
                        Pull quote
                        {narrative.sourceRefs?.pullQuote && (
                          <SourceRefPill source={narrative.sourceRefs.pullQuote} />
                        )}
                      </div>
                      <p className="max-w-3xl text-xl leading-relaxed text-text-primary font-serif italic text-balance">
                        {narrative.pullQuote}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="border border-rule rounded-md p-4 bg-surface-active">
                      <BlockCanvas blocks={section.blocks} showExport={false} />
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
                    {previousSection ? (
                      <a href={`#${previousSection.id}`} onClick={() => onSectionClick(previousSection.id)} className="group/nav inline-flex items-center gap-1.5 text-13 text-muted transition-colors hover:text-text-primary">
                        <span className="transition-transform group-hover/nav:-translate-x-0.5">←</span>
                        {previousSection.number} {previousSection.title}
                      </a>
                    ) : (
                      <span className="text-xs text-text-faint">Beginning of paper</span>
                    )}
                    {nextSection ? (
                      <a href={`#${nextSection.id}`} onClick={() => onSectionClick(nextSection.id)} className="group/nav inline-flex items-center gap-1.5 text-13 text-muted transition-colors hover:text-accent">
                        {nextSection.number} {nextSection.title}
                        <span className="transition-transform group-hover/nav:translate-x-0.5">→</span>
                      </a>
                    ) : (
                      <span className="text-xs text-text-faint">End of paper</span>
                    )}
                  </div>
                </motion.section>
              )
            })}
          </div>
        ) : (
          /* Editorial mode: uses PaperSectionView with sidebar */
          <PaperSectionView
            focusMode={false}
            onPublish={handleSectionPublish}
            isPublishing={publishMutation.isPending}
            publishError={(publishMutation.error as Error | null)?.message ?? null}
          />
        )}
      </div>

      {/* Navigation to other tabs — after the reading content */}
      {!showTopic && onTabChange && (
        <div className="mt-10 stagger-reveal grid gap-3 sm:grid-cols-3">
          {([
            { tab: 'results' as TabId, eyebrow: 'Simulation lab', title: 'Results', detail: 'Run scenarios, compare paradigms, export artifacts.' },
            { tab: 'agent' as TabId, eyebrow: 'Questions & experiments', title: 'Agent workspace', detail: 'Ask the paper, run simulations, export results.' },
            { tab: 'community' as TabId, eyebrow: 'Public responses', title: 'Community notes', detail: 'Human notes on readings and simulation runs.' },
          ] as const).map(item => (
            <button
              key={item.tab}
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
            </button>
          ))}
        </div>
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
      <section className="mt-8 rounded-xl border border-rule bg-white p-5 sm:p-6 geo-accent-bar">
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
    </motion.div>
  )
}
