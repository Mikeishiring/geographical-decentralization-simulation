import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Quote, Check, ChevronDown, ChevronUp, Sparkles, Lightbulb } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { ContributionComposer } from '../community/ContributionComposer'
import { InlineSectionNotes } from '../community/InlineSectionNotes'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SOFT, SECTION_CATEGORY_STYLE } from '../../lib/theme'
import { PAPER_SECTIONS, type PaperSection } from '../../data/paper-sections'
import { PAPER_NARRATIVE, type PaperNarrative } from '../../data/paper-narrative'
import type { Exploration } from '../../lib/api'

/** Renders paragraph text with an optional keyClaim substring highlighted */
function renderWithKeyClaim(text: string, keyClaim?: string): JSX.Element | string {
  if (!keyClaim) return text
  const idx = text.indexOf(keyClaim)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="key-claim-highlight relative">
        <Lightbulb className="inline-block h-3 w-3 text-accent/40 mr-0.5 -mt-0.5" />
        {text.slice(idx, idx + keyClaim.length)}
      </span>
      {text.slice(idx + keyClaim.length)}
    </>
  )
}

interface PaperSectionViewProps {
  readonly focusMode?: boolean
  readonly activeSectionId?: string
  readonly onPublish?: (sectionId: string, payload: { title: string; takeaway: string; author: string }) => void
  readonly isPublishing?: boolean
  readonly publishError?: string | null
  readonly notesVisible?: boolean
  readonly notesBySection?: ReadonlyMap<string, Exploration[]>
  readonly onOpenNote?: (explorationId: string) => void
}

export function PaperSectionView({
  focusMode = false,
  activeSectionId: activeSectionIdProp,
  onPublish,
  isPublishing = false,
  publishError = null,
  notesVisible = false,
  notesBySection,
  onOpenNote,
}: PaperSectionViewProps) {
  const activeSectionId = activeSectionIdProp ?? PAPER_SECTIONS[0].id
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [publishedSections, setPublishedSections] = useState<Set<string>>(new Set())

  const activeSectionIndex = Math.max(0, PAPER_SECTIONS.findIndex(s => s.id === activeSectionId))
  const progressPercent = ((activeSectionIndex + 1) / PAPER_SECTIONS.length) * 100
  const activeSection = PAPER_SECTIONS.find(s => s.id === activeSectionId) ?? PAPER_SECTIONS[0]

  const handleCopySectionLink = async (sectionId: string) => {
    const url = new URL(window.location.href)
    url.hash = sectionId
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedSectionId(sectionId)
      window.setTimeout(() => setCopiedSectionId(c => (c === sectionId ? null : c)), 1600)
    } catch { /* ignore */ }
  }

  const handleSectionPublish = (sectionId: string, payload: { title: string; takeaway: string; author: string }) => {
    onPublish?.(sectionId, payload)
    setPublishedSections(prev => new Set([...prev, sectionId]))
  }

  return (
    <>
      {/* Reading progress bar */}
      <div className="sticky top-[4.5rem] z-10 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur-sm border-b border-rule sm:-mx-6 sm:px-6 geo-accent-bar">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted min-w-0">
            <span className="mono-xs text-accent shrink-0">{activeSection.number}</span>
            <span className="text-text-primary text-sm font-medium truncate">{activeSection.title}</span>
            <span className="hidden md:inline-flex items-center gap-1 shrink-0 rounded-full border border-amber-200/40 bg-amber-50/50 px-2 py-0.5 text-2xs text-amber-600/50 select-none" title="You are reading LLM-interpreted content. Hover text to see source provenance.">
              <Sparkles className="h-2.5 w-2.5" />
              Interpreted
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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
            <button
              onClick={() => setGuideOpen(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                guideOpen
                  ? 'border-accent/30 bg-accent/5 text-accent'
                  : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
              )}
            >
              {guideOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Sections
            </button>
          </div>
        </div>

        <AnimatePresence>
          {guideOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING}
              className="overflow-hidden"
            >
              <nav className="grid gap-1.5 pt-3 sm:grid-cols-2 lg:grid-cols-5">
                {PAPER_SECTIONS.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={() => { /* navigation handled by href hash */ }}
                    className={cn(
                      'block rounded-md px-3 py-2 text-xs transition-colors',
                      activeSectionId === section.id
                        ? 'bg-surface-active text-text-primary font-medium'
                        : 'text-muted hover:bg-surface-active hover:text-text-primary',
                    )}
                  >
                    <span className={cn('mono-xs', activeSectionId === section.id ? 'text-accent' : 'text-text-faint')}>
                      {section.number}
                    </span>{' '}
                    {section.title}
                  </a>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sections grid */}
      <div className={cn('grid gap-8 overflow-hidden', focusMode ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[220px_minmax(0,1fr)]')}>
        {/* TOC sidebar */}
        {!focusMode && (
          <aside className="hidden xl:block xl:sticky xl:top-40 xl:self-start">
            <div className="lab-panel rounded-xl p-4">
              <div className="lab-section-title">Sections</div>
              <nav className="mt-3 space-y-1">
                {PAPER_SECTIONS.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={() => { /* navigation handled by href hash */ }}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm transition-colors',
                      activeSectionId === section.id
                        ? 'bg-surface-active text-text-primary'
                        : 'text-muted hover:bg-surface-active hover:text-text-primary',
                    )}
                  >
                    <div className={cn('mono-xs', activeSectionId === section.id ? 'text-accent' : 'text-muted')}>
                      {section.number}
                    </div>
                    <div className="mt-0.5 leading-snug">{section.title}</div>
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

        {/* Paper sections */}
        <div className="space-y-8">
          {PAPER_SECTIONS.map((section, index) => {
            const narrative = PAPER_NARRATIVE[section.id]
            const figuresFirst = index % 2 === 1
            const previousSection = PAPER_SECTIONS[index - 1]
            const nextSection = PAPER_SECTIONS[index + 1]

            return (
              <div key={section.id}>
                {index > 0 && (
                  <div className="section-journey-divider mb-8">
                    <div className="section-journey-node" />
                  </div>
                )}
              <SectionCard
                section={section}
                narrative={narrative}
                figuresFirst={figuresFirst}
                focusMode={focusMode}
                previousSection={previousSection}
                nextSection={nextSection}
                copiedSectionId={copiedSectionId}
                onCopyLink={handleCopySectionLink}
                onNavigate={(id: string) => {
                  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }}
                onPublish={onPublish ? handleSectionPublish : undefined}
                isPublishing={isPublishing}
                publishError={publishError}
                isPublished={publishedSections.has(section.id)}
                notesVisible={notesVisible}
                sectionNotes={notesBySection?.get(section.id) ?? []}
                onOpenNote={onOpenNote}
              />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function SectionCard({
  section,
  narrative,
  figuresFirst,
  focusMode,
  previousSection,
  nextSection,
  copiedSectionId,
  onCopyLink,
  onNavigate,
  onPublish,
  isPublishing,
  publishError,
  isPublished,
  notesVisible = false,
  sectionNotes = [],
  onOpenNote,
}: {
  section: PaperSection
  narrative: PaperNarrative
  figuresFirst: boolean
  focusMode: boolean
  previousSection?: PaperSection
  nextSection?: PaperSection
  copiedSectionId: string | null
  onCopyLink: (id: string) => void
  onNavigate: (id: string) => void
  onPublish?: (sectionId: string, payload: { title: string; takeaway: string; author: string }) => void
  isPublishing: boolean
  publishError: string | null
  isPublished: boolean
  notesVisible?: boolean
  sectionNotes?: readonly Exploration[]
  onOpenNote?: (explorationId: string) => void
}) {
  return (
    <motion.section
      id={section.id}
      data-section-id={section.id}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={SPRING}
      className={cn(
        'group scroll-mt-40 rounded-xl border border-rule bg-white p-5 card-hover geo-accent-bar sm:p-6',
        focusMode && 'mx-auto max-w-5xl',
      )}
    >
      {/* Header */}
      <div className="mb-6 border-b border-rule pb-5">
        <div className="flex items-center gap-3">
          <span className="mono-xs text-accent">{section.number}</span>
          {(() => {
            const catStyle = SECTION_CATEGORY_STYLE[section.category]
            return catStyle ? (
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium', catStyle.bg, catStyle.text, catStyle.border)}>
                {catStyle.label}
              </span>
            ) : null
          })()}
          <button
            onClick={() => onCopyLink(section.id)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted opacity-40 transition-all group-hover:opacity-100 hover:bg-surface-active hover:text-text-primary"
          >
            {copiedSectionId === section.id ? <Check className="h-3 w-3 text-success" /> : <Link2 className="h-3 w-3" />}
            {copiedSectionId === section.id ? 'Copied!' : 'Link'}
          </button>
        </div>
        <h2 className={cn('mt-2 text-2xl font-medium text-text-primary font-serif sm:text-3xl text-balance', focusMode && 'max-w-3xl')}>
          {section.title}
        </h2>
        <p className={cn('mt-3 text-base leading-relaxed text-muted', focusMode ? 'max-w-3xl' : 'max-w-2xl')}>
          {section.description}
        </p>
      </div>

      {/* Content grid */}
      <div className={cn('grid gap-6', focusMode ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-12')}>
        {/* Prose column */}
        <div className={cn(focusMode ? 'space-y-5' : 'xl:col-span-7 space-y-5', figuresFirst && 'xl:order-2')}>
          <p className={cn('text-xl leading-relaxed text-text-primary font-serif', focusMode ? 'max-w-3xl text-2xl' : 'max-w-2xl')}>
            {narrative.lede}
          </p>
          <div className={cn('space-y-4 text-base text-text-body font-serif', focusMode ? 'max-w-3xl text-base leading-9' : 'leading-8')}>
            {narrative.paragraphs.map(paragraph => (
              <p key={paragraph} className={cn(focusMode ? 'max-w-3xl' : 'max-w-2xl')}>
                {renderWithKeyClaim(paragraph, narrative.keyClaim)}
              </p>
            ))}
          </div>
          <div className="border-l-[3px] border-l-accent/50 rounded-r-lg bg-accent/[0.03] pl-5 pr-4 py-3">
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.1em] text-accent/50 mb-2">
              <Quote className="h-3 w-3" />
              Pull quote
            </div>
            <p className={cn('leading-relaxed text-text-primary font-serif italic text-balance', focusMode ? 'max-w-3xl text-xl' : 'max-w-2xl text-lg')}>
              {narrative.pullQuote}
            </p>
          </div>
        </div>

        <div className={cn(focusMode ? 'space-y-4' : 'xl:col-span-5 space-y-4', figuresFirst && 'xl:order-1')}>
          <div className="rounded-lg border border-rule bg-surface-active p-4">
            <BlockCanvas blocks={section.blocks} showExport={false} />
          </div>
          <p className="px-1 text-xs leading-6 text-muted">
            {narrative.figureCaption}
          </p>
        </div>
      </div>

      {/* Inline community notes */}
      {notesVisible && sectionNotes.length > 0 && (
        <InlineSectionNotes
          notes={sectionNotes}
          onOpenNote={onOpenNote}
        />
      )}

      {/* Community note composer per section */}
      {onPublish && (
        <div className="mt-6 border-t border-rule pt-4">
          <ContributionComposer
            key={section.id}
            sourceLabel="Add a community note"
            defaultTitle={section.title}
            defaultTakeaway={section.description}
            helperText="Share your take on this section's evidence."
            publishLabel="Publish note"
            successLabel="Published"
            viewPublishedLabel="View in Community"
            published={isPublished}
            isPublishing={isPublishing}
            error={publishError}
            onPublish={payload => onPublish(section.id, payload)}
            onViewPublished={onOpenNote ? () => {
              // Navigate to the community tab — the note will be visible there
              const url = new URL(window.location.href)
              url.searchParams.set('tab', 'community')
              window.history.pushState({}, '', url.toString())
              window.dispatchEvent(new PopStateEvent('popstate'))
            } : undefined}
          />
        </div>
      )}

      {/* Section navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
        {previousSection ? (
          <a
            href={`#${previousSection.id}`}
            onClick={() => onNavigate(previousSection.id)}
            className="arrow-link flex-row-reverse"
          >
            <span>← {previousSection.number} {previousSection.title}</span>
          </a>
        ) : (
          <span className="text-xs text-text-faint">Beginning of paper</span>
        )}
        {nextSection ? (
          <a
            href={`#${nextSection.id}`}
            onClick={() => onNavigate(nextSection.id)}
            className="arrow-link"
          >
            {nextSection.number} {nextSection.title}
          </a>
        ) : (
          <span className="text-xs text-text-faint">End of paper</span>
        )}
      </div>
    </motion.section>
  )
}
