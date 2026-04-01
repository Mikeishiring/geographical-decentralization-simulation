import { useState, useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link2, Quote, Check, Lightbulb, MousePointerClick, MessageSquare } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { InlineSectionNotes } from '../community/InlineSectionNotes'
import { Tooltip } from '../ui/Tooltip'
import { cn } from '../../lib/cn'
import { SPRING, SECTION_CATEGORY_STYLE } from '../../lib/theme'
import { PAPER_SECTIONS, type PaperSection } from '../../data/paper-sections'
import { PAPER_NARRATIVE, type PaperNarrative } from '../../data/paper-narrative'
import type { Exploration } from '../../lib/api'

/* ── Highlight types ─────────────────────────────────────────────────────── */

interface NoteHighlight {
  readonly excerpt: string
  readonly noteCount: number
  readonly noteTitle: string
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
      seen.set(excerpt, { excerpt, noteCount: 1, noteTitle: note.publication.title })
    }
  }
  return [...seen.values()]
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

    const noteLabel = `${highlight.noteCount} note${highlight.noteCount !== 1 ? 's' : ''}: ${highlight.noteTitle}`

    return (
      <>
        {before}
        <Tooltip label={noteLabel} placement="above" className="inline">
          <mark
            className={cn(
              'relative rounded-sm px-px -mx-px transition-all duration-150',
              visible
                ? 'cursor-pointer bg-accent/[0.07] border-b border-accent/30 hover:bg-accent/[0.14] group/mark'
                : 'bg-transparent border-b-transparent cursor-default',
            )}
            onClick={visible ? () => onHighlightClick?.() : undefined}
          >
            {match}
            <span className={cn(
              'absolute -top-1 -right-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-0.5 text-[8px] font-bold text-white transition-opacity pointer-events-none',
              visible ? 'opacity-0 group-hover/mark:opacity-100' : 'opacity-0',
            )}>
              <MessageSquare className="h-2 w-2" />
            </span>
          </mark>
        </Tooltip>
        {after}
      </>
    )
  }

  return text
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
      {/* Sections grid */}
      <div className="grid gap-8 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* TOC sidebar */}
        <aside className="hidden xl:block xl:sticky xl:top-40 xl:self-start">
            <div className="lab-panel rounded-xl p-4">
              <div className="lab-section-title">Sections</div>
              <nav className="mt-3 space-y-1">
                {PAPER_SECTIONS.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={() => { onSectionClick?.(section.id) }}
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
      className="group scroll-mt-40 rounded-xl border border-rule bg-white p-5 card-hover geo-accent-bar sm:p-6"
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
        <h2 className="mt-2 text-2xl font-medium text-text-primary font-serif sm:text-3xl text-balance">
          {section.title}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {section.description}
        </p>
      </div>

      {/* Content grid */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Prose column */}
        <div className={cn('xl:col-span-7 space-y-5', figuresFirst && 'xl:order-2')}>
          <p className="max-w-2xl text-xl leading-relaxed text-text-primary font-serif">
            {narrative.lede}
          </p>
          <div className="space-y-4 text-base leading-8 text-text-body font-serif">
            {narrative.paragraphs.map(paragraph => (
              <p key={paragraph} className="max-w-2xl">
                {renderParagraph(paragraph, narrative.keyClaim, noteHighlights, handleHighlightClick, notesVisible)}
              </p>
            ))}
          </div>
          <div className="border-l-[3px] border-l-accent/50 rounded-r-lg bg-accent/[0.03] pl-5 pr-4 py-3">
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.1em] text-accent/50 mb-2">
              <Quote className="h-3 w-3" />
              Pull quote
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-text-primary font-serif italic text-balance">
              {narrative.pullQuote}
            </p>
          </div>
        </div>

        <div className={cn('xl:col-span-5 space-y-4', figuresFirst && 'xl:order-1')}>
          <div className="rounded-lg border border-rule bg-surface-active p-4">
            <BlockCanvas blocks={section.blocks} showExport={false} />
          </div>
          <p className="px-1 text-xs leading-6 text-muted">
            {narrative.figureCaption}
          </p>
        </div>
      </div>

      {/* Inline community notes + annotation hint (consolidated) */}
      {notesVisible && sectionNotes.length > 0 ? (
        <InlineSectionNotes
          notes={sectionNotes}
          onOpenNote={onOpenNote}
          showAnnotationHint
        />
      ) : notesVisible ? (
        <div className="mt-5 flex items-center gap-2 text-2xs text-text-faint">
          <MousePointerClick className="h-3 w-3 shrink-0" />
          <span>Select text to add your annotation</span>
        </div>
      ) : null}

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
