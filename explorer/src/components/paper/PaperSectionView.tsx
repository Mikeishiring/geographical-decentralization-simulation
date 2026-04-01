import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Quote, Check, Lightbulb, MousePointerClick, MessageSquare, Users } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { InlineSectionNotes } from '../community/InlineSectionNotes'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY, SPRING_POPUP, SECTION_CATEGORY_STYLE } from '../../lib/theme'
import { PAPER_SECTIONS, type PaperSection } from '../../data/paper-sections'
import { PAPER_NARRATIVE, type PaperNarrative } from '../../data/paper-narrative'
import type { Exploration } from '../../lib/api'

/* ── Highlight types ─────────────────────────────────────────────────────── */

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

/** Collect unique note excerpts from exploration data */
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

/* ── Rich note hover card (replaces plain Tooltip) ───────────────────────── */

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

/** Renders paragraph text with keyClaim highlight and note excerpt indicators */
function renderParagraph(
  text: string,
  keyClaim: string | undefined,
  highlights: readonly NoteHighlight[],
  onHighlightClick?: () => void,
  highlightsVisible = true,
): ReactNode {
  // First apply keyClaim highlight
  if (keyClaim) {
    const idx = text.indexOf(keyClaim)
    if (idx !== -1) {
      return (
        <>
          {renderWithNoteHighlights(text.slice(0, idx), highlights, onHighlightClick, highlightsVisible)}
          <span className="key-claim-highlight relative">
            <Lightbulb className="inline-block h-3 w-3 text-accent/40 mr-0.5 -mt-0.5" />
            {text.slice(idx, idx + keyClaim.length)}
          </span>
          {renderWithNoteHighlights(text.slice(idx + keyClaim.length), highlights, onHighlightClick, highlightsVisible)}
        </>
      )
    }
  }
  return renderWithNoteHighlights(text, highlights, onHighlightClick, highlightsVisible)
}

/** Renders text with note excerpt highlights as inline marks */
function renderWithNoteHighlights(
  text: string,
  highlights: readonly NoteHighlight[],
  onHighlightClick?: () => void,
  visible = true,
): ReactNode {
  if (highlights.length === 0) return text

  // Find the first matching highlight in this text
  for (const highlight of highlights) {
    // Use a shorter excerpt prefix for matching (first 40 chars) to handle minor variations
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
              'relative rounded-sm px-px -mx-px transition-all duration-200',
              visible
                ? 'cursor-pointer bg-accent/[0.06] border-b border-dashed border-accent/25 hover:bg-accent/[0.12] hover:border-solid hover:border-accent/40 group/mark'
                : 'bg-transparent border-b-transparent cursor-default',
            )}
            onClick={visible ? () => onHighlightClick?.() : undefined}
          >
            {match}
            {visible && (
              <span className="absolute -top-0.5 -right-3 inline-flex items-center gap-0.5 text-[9px] font-semibold text-accent/60 opacity-0 group-hover/mark:opacity-100 transition-opacity duration-150 pointer-events-none select-none">
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
  return (
    <>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/60">Sections</div>
      <nav className={cn('space-y-0.5', compact && 'max-h-[calc(100vh-14rem)] overflow-auto pr-1')}>
        {PAPER_SECTIONS.map(section => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={() => onSectionClick?.(section.id)}
            className={cn(
              'flex items-baseline gap-2 rounded-md px-2 py-1.5 text-xs transition-all duration-150',
              activeSectionId === section.id
                ? 'bg-accent/[0.06] text-text-primary'
                : 'text-muted/70 hover:text-text-primary hover:bg-surface-active/60',
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

/* ── Floating TOC sidebar ─────────────────────────────────────────────── */

function FloatingTOC({
  activeSectionId,
  onSectionClick,
}: {
  readonly activeSectionId: string
  readonly onSectionClick?: (id: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Show TOC after scrolling past the hero area
  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const show = visible || hovered

  return (
    <aside
      className="hidden 2xl:block fixed z-30 top-[8rem]"
      style={{ left: 'max(1rem, calc((100vw - 1200px) / 2 - 220px))' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: show ? 1 : 0,
          x: show ? 0 : -8,
        }}
        transition={SPRING_SNAPPY}
        className="w-[190px] rounded-xl border border-rule/60 bg-white/95 p-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-sm"
        style={{ pointerEvents: show ? 'auto' : 'none' }}
      >
        <SectionNav activeSectionId={activeSectionId} onSectionClick={onSectionClick} compact />
      </motion.div>
    </aside>
  )
}

/* ── Main section view ───────────────────────────────────────────────────── */

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
  const activeSectionId = activeSectionIdProp ?? PAPER_SECTIONS[0].id
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null)

  const handleCopySectionLink = async (sectionId: string) => {
    const url = new URL(window.location.href)
    url.hash = sectionId
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedSectionId(sectionId)
      window.setTimeout(() => setCopiedSectionId(c => (c === sectionId ? null : c)), 1600)
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* Floating TOC — fixed position, outside document flow, no layout shift */}
      <FloatingTOC activeSectionId={activeSectionId} onSectionClick={onSectionClick} />

      {/* Laptop/Desktop TOC in flow; floating TOC takes over on very wide screens */}
      <div className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-1">
        <aside className="hidden xl:block 2xl:hidden xl:sticky xl:top-40 xl:self-start">
          <div className="rounded-xl border border-rule/60 bg-white/95 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <SectionNav activeSectionId={activeSectionId} onSectionClick={onSectionClick} compact />
          </div>
        </aside>

        <div className="space-y-10 xl:min-w-0">
          {PAPER_SECTIONS.map((section, index) => {
            const narrative = PAPER_NARRATIVE[section.id]
            const figuresFirst = index % 2 === 1
            const previousSection = PAPER_SECTIONS[index - 1]
            const nextSection = PAPER_SECTIONS[index + 1]

            return (
              <div key={section.id}>
                {index > 0 && (
                  <div className="section-journey-divider mb-10">
                    <div className="section-journey-node" />
                  </div>
                )}
                <SectionCard
                  section={section}
                  narrative={narrative}
                  figuresFirst={figuresFirst}
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
  figuresFirst,
  previousSection,
  nextSection,
  copiedSectionId,
  onCopyLink,
  onNavigate,
  notesVisible = false,
  sectionNotes = [],
  onOpenNote,
}: {
  section: PaperSection
  narrative: PaperNarrative
  figuresFirst: boolean
  previousSection?: PaperSection
  nextSection?: PaperSection
  copiedSectionId: string | null
  onCopyLink: (id: string) => void
  onNavigate: (id: string) => void
  notesVisible?: boolean
  sectionNotes?: readonly Exploration[]
  onOpenNote?: (explorationId: string) => void
}) {
  const noteHighlights = useMemo(
    () => collectNoteHighlights(sectionNotes),
    [sectionNotes],
  )
  const featuredChartBlocks = section.blocks.filter(block => block.type === 'paperChart')
  const supportingBlocks = section.blocks.filter(block => block.type !== 'paperChart')
  const hasFeaturedChart = featuredChartBlocks.length > 0
  const hasSupportingBlocks = supportingBlocks.length > 0

  const handleHighlightClick = () => {
    const sectionEl = document.getElementById(section.id)
    if (!sectionEl) return
    // Find the notes card within this section using data attribute
    const notesBtn = sectionEl.querySelector<HTMLButtonElement>('[data-notes-toggle]')
    if (notesBtn) {
      // Expand if collapsed
      if (notesBtn.getAttribute('aria-expanded') === 'false') notesBtn.click()
      // Scroll after a tick so the expanded content is rendered
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
      className="group scroll-mt-40 overflow-hidden rounded-2xl border border-rule bg-white p-6 card-hover geo-accent-bar sm:p-8 lg:p-10"
    >
      {/* Header */}
      <div className="mb-8 border-b border-rule pb-6">
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
        <h2 className="mt-3 text-2xl font-medium text-text-primary font-serif sm:text-3xl text-balance">
          {section.title}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
          {section.description}
        </p>
      </div>

      {hasFeaturedChart && (
        <div className="mb-8">
          <div className="overflow-hidden rounded-[1.35rem] border border-rule/70 bg-[linear-gradient(180deg,rgba(249,250,251,0.95),rgba(255,255,255,1))] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-4 lg:p-5">
            <BlockCanvas blocks={featuredChartBlocks} showExport={false} />
          </div>
          <p className="mt-3 max-w-4xl px-1 text-sm leading-6 text-muted">
            {narrative.figureCaption}
          </p>
        </div>
      )}

      {/* Content grid — wider prose column */}
      <div className={cn('grid min-w-0 gap-8', hasSupportingBlocks && 'xl:grid-cols-12')}>
        <div
          className={cn(
            'min-w-0 space-y-6',
            hasSupportingBlocks
              ? hasFeaturedChart
                ? 'xl:col-span-8'
                : 'xl:col-span-7'
              : 'max-w-4xl',
            !hasFeaturedChart && figuresFirst && hasSupportingBlocks && 'xl:order-2',
          )}
        >
          <p className="max-w-3xl text-xl leading-relaxed text-text-primary font-serif">
            {narrative.lede}
          </p>
          <div className="space-y-5 text-[15px] leading-[1.9] text-text-body font-serif">
            {narrative.paragraphs.map(paragraph => (
              <p key={paragraph} className="max-w-3xl">
                {renderParagraph(paragraph, narrative.keyClaim, noteHighlights, handleHighlightClick, notesVisible)}
              </p>
            ))}
          </div>
          <div className="border-l-[3px] border-l-accent/50 rounded-r-lg bg-accent/[0.03] pl-6 pr-5 py-4">
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.1em] text-accent/50 mb-2">
              <Quote className="h-3 w-3" />
              Pull quote
            </div>
            <p className="max-w-3xl text-lg leading-relaxed text-text-primary font-serif italic text-balance">
              {narrative.pullQuote}
            </p>
          </div>
        </div>

        {hasSupportingBlocks && (
          <div
            className={cn(
              'min-w-0 space-y-4',
              hasFeaturedChart ? 'xl:col-span-4' : 'xl:col-span-5',
              !hasFeaturedChart && figuresFirst && 'xl:order-1',
            )}
          >
            <div className="rounded-xl border border-rule/80 bg-surface-active/55 p-4">
              <BlockCanvas blocks={supportingBlocks} showExport={false} />
            </div>
            {!hasFeaturedChart && (
              <p className="px-1 text-xs leading-6 text-muted">
                {narrative.figureCaption}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Inline community notes + annotation hint (consolidated) */}
      {notesVisible && sectionNotes.length > 0 ? (
        <div className="mt-8">
          <InlineSectionNotes
            notes={sectionNotes}
            onOpenNote={onOpenNote}
            showAnnotationHint
          />
        </div>
      ) : notesVisible ? (
        <div className="mt-6 flex items-center gap-2 text-2xs text-text-faint">
          <MousePointerClick className="h-3 w-3 shrink-0" />
          <span>Select text to add your annotation</span>
        </div>
      ) : null}

      {/* Section navigation */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6">
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
