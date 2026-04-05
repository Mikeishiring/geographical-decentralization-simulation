import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Quote, Check, Lightbulb, MessageSquare, Users } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { PaperChartBlock } from '../blocks/PaperChartBlock'
import { InlineSectionNotes } from '../community/InlineSectionNotes'
import { MacroRegionSnapshot } from './MacroRegionSnapshot'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_POPUP, SECTION_CATEGORY_STYLE } from '../../lib/theme'
import { getActiveStudy } from '../../studies'
import type { PaperNarrative, PaperSection } from '../../studies/types'
import type { Exploration } from '../../lib/api'
import type { Block } from '../../types/blocks'

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

const NOTE_PREVIEW_OPEN_DELAY_MS = 140
const NOTE_PREVIEW_CLOSE_DELAY_MS = 80

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
    timeoutRef.current = window.setTimeout(() => setHovered(true), NOTE_PREVIEW_OPEN_DELAY_MS)
  }
  const handleLeave = () => {
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setHovered(false), NOTE_PREVIEW_CLOSE_DELAY_MS)
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
      <nav className={cn('space-y-0.5', compact && 'max-h-[calc(100vh-12.5rem)] overflow-auto pr-1')}>
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

const NARROW_UNFRIENDLY_BLOCK_TYPES = new Set<Block['type']>([
  'table',
  'comparison',
  'equation',
])

function shouldInlineSupportingBlocks(blocks: readonly Block[]) {
  if (blocks.length === 0) return false
  const statCount = blocks.filter(block => block.type === 'stat').length
  if (blocks.length <= 2) return true
  if (statCount >= 2) return true
  if (blocks.some(block => NARROW_UNFRIENDLY_BLOCK_TYPES.has(block.type))) return true
  return blocks.every(block => block.type === 'stat' || block.type === 'insight' || block.type === 'caveat')
}

interface PaperSectionViewProps {
  readonly activeSectionId?: string
  readonly notesVisible?: boolean
  readonly notesBySection?: ReadonlyMap<string, Exploration[]>
  readonly onOpenNote?: (explorationId: string) => void
  readonly onSectionClick?: (sectionId: string) => void
}

const PAPER_STACK_STICKY_TOP = 'calc(var(--explorer-tab-nav-height, 3.75rem) + var(--explorer-paper-mode-bar-height, 4.75rem) + 1rem)'
const PAPER_STACK_SCROLL_MARGIN = 'calc(var(--explorer-tab-nav-height, 3.75rem) + var(--explorer-paper-mode-bar-height, 4.75rem) + 1.5rem)'

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
      <div className="grid gap-10 xl:grid-cols-[216px_minmax(0,1fr)] 2xl:grid-cols-[228px_minmax(0,1fr)]">
        <aside className="hidden xl:block xl:sticky xl:self-start xl:pr-3" style={{ top: PAPER_STACK_STICKY_TOP }}>
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
  const inlineSupportingBlocks = shouldInlineSupportingBlocks(supportingBlocks)
  const showInlineSupporting = hasSupportingBlocks && inlineSupportingBlocks
  const showSidebarSupporting = hasSupportingBlocks && !inlineSupportingBlocks
  const showMacroRegionSnapshot = section.id === 'se2-distribution'

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
      className="group overflow-hidden rounded-2xl border border-rule bg-white p-6 card-hover geo-accent-bar sm:p-7 lg:p-8"
      style={{ scrollMarginTop: PAPER_STACK_SCROLL_MARGIN }}
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

        <div className={cn('mt-4', showSidebarSupporting ? 'max-w-4xl' : 'max-w-[58rem]')}>
          <h2 className="text-2xl font-medium text-text-primary font-serif text-balance sm:text-3xl">
            {section.title}
          </h2>
          <p className={cn('mt-2.5 text-[15px] leading-relaxed text-muted font-serif', showSidebarSupporting ? 'max-w-3xl' : 'max-w-[52rem]')}>
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

      {showMacroRegionSnapshot && (
        <div className="mb-6">
          <MacroRegionSnapshot />
        </div>
      )}

      {showInlineSupporting && (
        <div className="mb-6 rounded-2xl border border-rule/70 bg-surface-active/25 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-text-primary">Supporting evidence</span>
            <span className="rounded-full border border-rule/50 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-text-faint tabular-nums">
              {supportingBlocks.length} block{supportingBlocks.length === 1 ? '' : 's'}
            </span>
          </div>
          <BlockCanvas blocks={supportingBlocks} showExport={false} />
          {!hasFeaturedChart && narrative.figureCaption && (
            <p className="mt-3 px-1 text-xs leading-relaxed text-muted italic font-serif">
              {narrative.figureCaption}
            </p>
          )}
        </div>
      )}

      <div className={cn('grid min-w-0 gap-8 xl:items-start', showSidebarSupporting && 'xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_336px]')}>
        <div className={cn('min-w-0', showSidebarSupporting ? 'max-w-4xl' : 'max-w-[56rem]')}>
          {/* Lede — the hook that draws you in */}
          <p className={cn('text-[22px] leading-[1.55] font-medium text-text-primary font-serif sm:text-[24px]', showSidebarSupporting ? 'max-w-3xl' : 'max-w-[50rem]')}>
            {narrative.lede}
          </p>

          {/* Body paragraphs — tighter vertical rhythm for reading flow */}
          <div className="mt-6 space-y-3.5 text-[15px] leading-[1.85] text-text-body font-serif">
            {narrative.paragraphs.map(paragraph => (
              <p key={paragraph} className={cn(showSidebarSupporting ? 'max-w-3xl' : 'max-w-[50rem]')}>
                {renderParagraph(paragraph, narrative.keyClaim, noteHighlights, handleHighlightClick, notesVisible)}
              </p>
            ))}
          </div>

          {/* Pull quote — no label, just the accent border and the words */}
          <div className={cn('mt-8 border-l-[3px] border-accent/40 pl-5 py-1', showSidebarSupporting ? 'max-w-3xl' : 'max-w-[50rem]')}>
            <p className="text-[18px] leading-[1.6] text-text-primary/90 font-serif italic text-balance">
              {narrative.pullQuote}
            </p>
          </div>
          <div className="mt-8" />
        </div>

        {showSidebarSupporting && (
          <aside className="min-w-0 xl:sticky" style={{ top: PAPER_STACK_STICKY_TOP }}>
            <div className="rounded-2xl border border-rule/70 bg-surface-active/25 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-text-primary">Supporting evidence</span>
                <span className="rounded-full border border-rule/50 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-text-faint tabular-nums">
                  {supportingBlocks.length}
                </span>
              </div>
              <BlockCanvas blocks={supportingBlocks} showExport={false} />
            </div>
            {!hasFeaturedChart && narrative.figureCaption && (
              <p className="mt-3 px-1 text-xs leading-relaxed text-muted italic font-serif">
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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule/50 pt-5">
        {previousSection ? (
          <a
            href={`#${previousSection.id}`}
            onClick={() => onNavigate(previousSection.id)}
            className="group/nav flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-xs text-muted transition-colors hover:text-accent hover:bg-accent/[0.04]"
          >
            <span className="transition-transform group-hover/nav:-translate-x-0.5">&larr;</span>
            <span><span className="mono-xs text-text-faint">{previousSection.number}</span> {previousSection.title}</span>
          </a>
        ) : (
          <span className="text-2xs text-text-faint uppercase tracking-wide">Beginning of paper</span>
        )}
        {nextSection ? (
          <a
            href={`#${nextSection.id}`}
            onClick={() => onNavigate(nextSection.id)}
            className="group/nav flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-xs text-muted transition-colors hover:text-accent hover:bg-accent/[0.04]"
          >
            <span><span className="mono-xs text-text-faint">{nextSection.number}</span> {nextSection.title}</span>
            <span className="transition-transform group-hover/nav:translate-x-0.5">&rarr;</span>
          </a>
        ) : (
          <span className="text-2xs text-text-faint uppercase tracking-wide">End of paper</span>
        )}
      </div>
    </motion.section>
  )
}
