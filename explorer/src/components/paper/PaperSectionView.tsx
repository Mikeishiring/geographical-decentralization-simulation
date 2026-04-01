import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Quote, Check, Lightbulb, MessageSquare, Users } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { PaperChartBlock } from '../blocks/PaperChartBlock'
import { InlineSectionNotes } from '../community/InlineSectionNotes'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_POPUP, SECTION_CATEGORY_STYLE } from '../../lib/theme'
import { getActiveStudy } from '../../studies'
import type { PaperNarrative, PaperSection } from '../../studies/types'
import type { Exploration } from '../../lib/api'

interface NoteHighlight {
  readonly excerpt: string
  readonly noteCount: number
  readonly noteTitle: string
  readonly takeaway: string
}

interface SectionNavProps {
  readonly activeSectionId: string
  readonly onSectionClick?: (id: string) => void
  readonly compact?: boolean
}

function collectNoteHighlights(notes: readonly Exploration[]): readonly NoteHighlight[] {
  const seen = new Map<string, NoteHighlight>()
  for (const note of notes) {
    const excerpt = note.anchor?.excerpt
    if (!excerpt || excerpt.length < 10) continue
    const existing = seen.get(excerpt)
    if (existing) {
      seen.set(excerpt, { ...existing, noteCount: existing.noteCount + 1 })
    } else {
      seen.set(excerpt, {
        excerpt,
        noteCount: 1,
        noteTitle: note.publication.title,
        takeaway: note.publication.takeaway,
      })
    }
  }
  return [...seen.values()]
}

function NoteHoverCard({
  highlight,
  onClickOpen,
  visible,
  children,
}: {
  readonly highlight: NoteHighlight
  readonly onClickOpen: () => void
  readonly visible: boolean
  readonly children: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const timeoutRef = useRef<number>(0)

  const handleEnter = () => {
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setHovered(true), 380)
  }
  const handleLeave = () => {
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setHovered(false), 120)
  }

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  return (
    <span
      className="relative inline"
      onMouseEnter={visible ? handleEnter : undefined}
      onMouseLeave={visible ? handleLeave : undefined}
    >
      {children}
      <AnimatePresence>
        {hovered && visible && (
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={SPRING_POPUP}
            onClick={(e) => { e.stopPropagation(); onClickOpen() }}
            className="absolute bottom-full left-0 z-50 mb-2.5 block w-[260px] cursor-pointer rounded-xl border border-rule bg-white/[0.97] px-3.5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
          >
            <span className="mb-1.5 flex items-center gap-1.5">
              <Users className="h-3 w-3 text-accent" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {highlight.noteCount} note{highlight.noteCount !== 1 ? 's' : ''}
              </span>
            </span>
            <span className="block text-[13px] font-medium leading-snug text-text-primary">
              {highlight.noteTitle.length > 70
                ? `${highlight.noteTitle.slice(0, 70)}\u2026`
                : highlight.noteTitle}
            </span>
            {highlight.takeaway && (
              <span className="mt-1 block text-xs leading-relaxed text-muted line-clamp-2">
                {highlight.takeaway}
              </span>
            )}
            <span className="mt-2 flex items-center gap-1 text-[10px] font-medium text-accent">
              Show notes <span className="transition-transform group-hover:translate-x-0.5">&darr;</span>
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

function renderParagraph(
  text: string,
  keyClaim: string | undefined,
  highlights: readonly NoteHighlight[],
  onHighlightClick?: () => void,
  highlightsVisible = true,
): ReactNode {
  if (keyClaim) {
    const idx = text.indexOf(keyClaim)
    if (idx !== -1) {
      return (
        <>
          {renderWithNoteHighlights(text.slice(0, idx), highlights, onHighlightClick, highlightsVisible)}
          <span className="key-claim-highlight relative">
            <Lightbulb className="mr-0.5 -mt-0.5 inline-block h-3 w-3 text-accent/40" />
            {text.slice(idx, idx + keyClaim.length)}
          </span>
          {renderWithNoteHighlights(text.slice(idx + keyClaim.length), highlights, onHighlightClick, highlightsVisible)}
        </>
      )
    }
  }
  return renderWithNoteHighlights(text, highlights, onHighlightClick, highlightsVisible)
}

function renderWithNoteHighlights(
  text: string,
  highlights: readonly NoteHighlight[],
  onHighlightClick?: () => void,
  visible = true,
): ReactNode {
  if (highlights.length === 0) return text

  for (const highlight of highlights) {
    const searchTerm = highlight.excerpt.length > 50
      ? highlight.excerpt.slice(0, 50)
      : highlight.excerpt
    const idx = text.indexOf(searchTerm)
    if (idx === -1) continue

    const matchEnd = Math.min(idx + highlight.excerpt.length, text.length)
    const before = text.slice(0, idx)
    const match = text.slice(idx, matchEnd)
    const after = text.slice(matchEnd)

    return (
      <>
        {before}
        <NoteHoverCard highlight={highlight} onClickOpen={() => onHighlightClick?.()} visible={visible}>
          <mark
            className={cn(
              'relative -mx-px rounded-sm px-px transition-all duration-200',
              visible
                ? 'group/mark cursor-pointer border-b border-dashed border-accent/25 bg-accent/[0.06] hover:border-solid hover:border-accent/40 hover:bg-accent/[0.12]'
                : 'cursor-default border-b-transparent bg-transparent',
            )}
            onClick={visible ? () => onHighlightClick?.() : undefined}
          >
            {match}
            {visible && (
              <span className="pointer-events-none absolute -right-3 -top-0.5 inline-flex select-none items-center gap-0.5 text-[9px] font-semibold text-accent/60 opacity-0 transition-opacity duration-150 group-hover/mark:opacity-100">
                <MessageSquare className="h-2.5 w-2.5" />
                {highlight.noteCount}
              </span>
            )}
          </mark>
        </NoteHoverCard>
        {after}
      </>
    )
  }

  return text
}

function SectionNav({ activeSectionId, onSectionClick, compact = false }: SectionNavProps) {
  const sections = getActiveStudy().sections

  return (
    <>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/60">Sections</div>
      <nav className={cn('space-y-0.5', compact && 'max-h-[calc(100vh-11rem)] overflow-auto pr-1')}>
        {sections.map(section => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={() => onSectionClick?.(section.id)}
            className={cn(
              'flex items-baseline gap-2 rounded-md px-2 py-1.5 text-xs transition-all duration-150',
              activeSectionId === section.id
                ? 'bg-accent/[0.06] text-text-primary'
                : 'text-muted/70 hover:bg-surface-active/60 hover:text-text-primary',
            )}
          >
            <span className={cn(
              'shrink-0 font-mono text-[10px] transition-colors duration-150',
              activeSectionId === section.id ? 'text-accent' : 'text-muted/40',
            )}>
              {section.number}
            </span>
            <span className="leading-snug">{section.title}</span>
          </a>
        ))}
      </nav>
    </>
  )
}

interface PaperSectionViewProps {
  readonly activeSectionId?: string
  readonly notesVisible?: boolean
  readonly notesBySection?: ReadonlyMap<string, Exploration[]>
  readonly onOpenNote?: (explorationId: string) => void
  readonly onSectionClick?: (sectionId: string) => void
}

export function PaperSectionView({
  activeSectionId: activeSectionIdProp,
  notesVisible = false,
  notesBySection,
  onOpenNote,
  onSectionClick,
}: PaperSectionViewProps) {
  const study = getActiveStudy()
  const sections = study.sections
  const narratives = study.narratives
  const activeSectionId = activeSectionIdProp ?? sections[0].id
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null)

  const handleCopySectionLink = async (sectionId: string) => {
    const url = new URL(window.location.href)
    url.hash = sectionId
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedSectionId(sectionId)
      window.setTimeout(() => setCopiedSectionId(current => (current === sectionId ? null : current)), 1600)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <>
      <div className="grid gap-8 xl:grid-cols-[208px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden xl:block xl:sticky xl:top-[7.75rem] xl:self-start xl:pr-2">
          <div className="rounded-xl border border-rule/60 bg-white/95 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <SectionNav activeSectionId={activeSectionId} onSectionClick={onSectionClick} compact />
          </div>
        </aside>

        <div className="space-y-10 xl:min-w-0">
          {sections.map((section, index) => {
            const narrative = narratives[section.id]
            const previousSection = sections[index - 1]
            const nextSection = sections[index + 1]

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
                  previousSection={previousSection}
                  nextSection={nextSection}
                  copiedSectionId={copiedSectionId}
                  onCopyLink={handleCopySectionLink}
                  onNavigate={(id: string) => {
                    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                  }}
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
  previousSection,
  nextSection,
  copiedSectionId,
  onCopyLink,
  onNavigate,
  notesVisible = false,
  sectionNotes = [],
  onOpenNote,
}: {
  readonly section: PaperSection
  readonly narrative: PaperNarrative
  readonly previousSection?: PaperSection
  readonly nextSection?: PaperSection
  readonly copiedSectionId: string | null
  readonly onCopyLink: (id: string) => void
  readonly onNavigate: (id: string) => void
  readonly notesVisible?: boolean
  readonly sectionNotes?: readonly Exploration[]
  readonly onOpenNote?: (explorationId: string) => void
}) {
  const noteHighlights = useMemo(() => collectNoteHighlights(sectionNotes), [sectionNotes])
  const featuredChartBlocks = section.blocks.filter(block => block.type === 'paperChart')
  const supportingBlocks = section.blocks.filter(block => block.type !== 'paperChart')
  const hasFeaturedChart = featuredChartBlocks.length > 0
  const hasSupportingBlocks = supportingBlocks.length > 0

  const handleHighlightClick = () => {
    const sectionEl = document.getElementById(section.id)
    if (!sectionEl) return
    const notesBtn = sectionEl.querySelector<HTMLButtonElement>('[data-notes-toggle]')
    if (notesBtn) {
      if (notesBtn.getAttribute('aria-expanded') === 'false') notesBtn.click()
      requestAnimationFrame(() => {
        notesBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }
  }

  return (
    <motion.section
      id={section.id}
      data-section-id={section.id}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={SPRING}
      className="group scroll-mt-[8.75rem] overflow-hidden rounded-2xl border border-rule bg-white p-6 card-hover geo-accent-bar sm:p-7 lg:p-8"
    >
      <div className="mb-6 border-b border-rule pb-5">
        <div className="flex flex-wrap items-start gap-3">
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
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => onCopyLink(section.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-active hover:text-text-primary"
            >
              {copiedSectionId === section.id ? <Check className="h-3 w-3 text-success" /> : <Link2 className="h-3 w-3" />}
              {copiedSectionId === section.id ? 'Copied' : 'Section link'}
            </button>
          </div>
        </div>

        <div className="mt-4 max-w-4xl">
          <h2 className="text-2xl font-medium text-text-primary font-serif text-balance sm:text-3xl">
            {section.title}
          </h2>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
            {section.description}
          </p>
        </div>
      </div>

      {hasFeaturedChart && (
        <div className="mb-6">
          <div className="space-y-4">
            {featuredChartBlocks.map(block => (
              <PaperChartBlock
                key={`${section.id}-${block.title}`}
                block={block}
                caption={narrative.figureCaption}
              />
            ))}
          </div>
        </div>
      )}

      <div className={cn('grid min-w-0 gap-7 xl:items-start', hasSupportingBlocks && 'xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_336px]')}>
        <div className="min-w-0 max-w-4xl space-y-6">
          <p className="max-w-3xl text-xl leading-relaxed text-text-primary font-serif">
            {narrative.lede}
          </p>
          <div className="space-y-4 text-[15px] leading-[1.85] text-text-body font-serif">
            {narrative.paragraphs.map(paragraph => (
              <p key={paragraph} className="max-w-3xl">
                {renderParagraph(paragraph, narrative.keyClaim, noteHighlights, handleHighlightClick, notesVisible)}
              </p>
            ))}
          </div>
          <div className="max-w-3xl rounded-xl border border-accent/10 bg-accent/[0.03] px-5 py-4">
            <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.1em] text-accent/50">
              <Quote className="h-3 w-3" />
              Pull quote
            </div>
            <p className="text-lg leading-relaxed text-text-primary font-serif italic text-balance">
              {narrative.pullQuote}
            </p>
          </div>
        </div>

        {hasSupportingBlocks && (
          <aside className="min-w-0 xl:sticky xl:top-[8.75rem]">
            <div className="rounded-2xl border border-rule/80 bg-surface-active/45 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-faint">Evidence</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">Tables, caveats, and source blocks</div>
                </div>
                <span className="rounded-full border border-rule/60 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-text-faint">
                  {supportingBlocks.length} block{supportingBlocks.length === 1 ? '' : 's'}
                </span>
              </div>
              <BlockCanvas blocks={supportingBlocks} showExport={false} />
            </div>
            {!hasFeaturedChart && narrative.figureCaption && (
              <p className="mt-3 px-1 text-xs leading-6 text-muted">
                {narrative.figureCaption}
              </p>
            )}
          </aside>
        )}
      </div>

      {notesVisible ? (
        <div className="mt-6">
          <InlineSectionNotes
            notes={sectionNotes}
            onOpenNote={onOpenNote}
            showAnnotationHint
          />
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
        {previousSection ? (
          <a
            href={`#${previousSection.id}`}
            onClick={() => onNavigate(previousSection.id)}
            className="arrow-link flex-row-reverse"
          >
            <span>&larr; {previousSection.number} {previousSection.title}</span>
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
