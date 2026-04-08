import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, FileText, Lightbulb, MousePointerClick, Zap } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, SPRING_ACCORDION, SECTION_CATEGORY_STYLE, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { getActiveStudy } from '../../studies'
import type { PaperSection } from '../../studies/types'
import { summarizeSection, sectionEntryLine, sectionToPage } from './paper-helpers'
import { usePaperNav } from './PaperNavContext'
import { BlockCanvas } from '../explore/BlockCanvas'
import { InlineSectionNotes } from '../community/InlineSectionNotes'
import type { Block, Cite } from '../../types/blocks'
import type { Exploration } from '../../lib/api'

/* ── Named mechanisms from the paper's formal analysis (§4) ─────────────── */

const KEY_MECHANISMS = [
  {
    name: 'Timing slack',
    paradigm: 'Both',
    definition: 'How long a proposer can afford to wait for a more valuable block before attesters move on. Your position on the map determines your slack.',
    implication: 'Regions with lower latency to attesters have more slack, translating directly into higher expected rewards.',
  },
  {
    name: 'Scaling effect',
    paradigm: 'Local',
    definition: 'Value advantage scales linearly with the number of signal sources — 10ms closer to each of 40 sources yields 40 x 10ms x MEV growth rate.',
    implication: 'Produces aggressive centralization (Gini > 0.75) because advantages compound across all sources simultaneously.',
  },
  {
    name: 'Double penalty',
    paradigm: 'External',
    definition: 'Proposer-supplier latency enters the payoff twice: once in observing block value, once in the round-trip timing budget to attesters.',
    implication: 'Bounded advantage (single supplier, no scaling), but misaligned placement intensifies co-location pressure (HHI up to 0.97).',
  },
] as const

/* ── Block grouping by argument role ─────────────────────────────────────── */

function groupBlocksByRole(blocks: readonly Block[]) {
  const claims = blocks.filter(b => b.type === 'insight')
  const caveats = blocks.filter(b => b.type === 'caveat')
  const evidence = blocks.filter(b => b.type !== 'insight' && b.type !== 'caveat')
  return { claims, evidence, caveats } as const
}

/* ── Source pills row (deduped arXiv links) ──────────────────────────────── */

function SectionSourcesRow({ section }: { readonly section: PaperSection }) {
  const { goToPdfPage } = usePaperNav()

  const cites = section.blocks
    .map(b => ('cite' in b ? (b as { cite?: Cite }).cite : undefined))
    .filter((c): c is NonNullable<Cite> => !!c && !!c.paperSection)

  const seen = new Set<string>()
  const unique = cites.filter(c => {
    if (seen.has(c.paperSection!)) return false
    seen.add(c.paperSection!)
    return true
  })

  if (unique.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-2xs text-text-faint font-medium uppercase tracking-[0.06em]">Sources</span>
      {unique.map(cite => {
        const page = sectionToPage(cite.paperSection)
        return page != null ? (
          <button
            type="button"
            key={cite.paperSection}
            onClick={() => goToPdfPage(page)}
            className="inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/5 px-2 py-0.5 text-2xs text-accent/60 transition-all duration-200 hover:bg-accent/12 hover:text-accent hover:border-accent/30 select-none cursor-pointer"
          >
            <FileText className="h-2.5 w-2.5" />
            {cite.paperSection}
            <span className="text-accent/40">p.{page}</span>
          </button>
        ) : (
          <span
            key={cite.paperSection}
            className="inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/5 px-2 py-0.5 text-2xs text-accent/60 select-none"
          >
            <FileText className="h-2.5 w-2.5" />
            {cite.paperSection}
          </span>
        )
      })}
    </div>
  )
}

/* ── Block group renderer ────────────────────────────────────────────────── */

function BlockGroup({
  label,
  blocks,
}: {
  readonly label: string
  readonly blocks: readonly Block[]
}) {
  if (blocks.length === 0) return null
  return (
    <div className="mt-4">
      <div className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-text-faint">{label}</div>
      <BlockCanvas blocks={blocks} showExport={false} />
    </div>
  )
}

/* ── Props ────────────────────────────────────────────────────────────────── */

interface ArgumentsViewProps {
  readonly activeSectionId: string
  readonly onSectionClick: (id: string) => void
  readonly notesVisible?: boolean
  readonly notesBySection?: ReadonlyMap<string, Exploration[]>
  readonly onOpenNote?: (explorationId: string) => void
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function ArgumentsView({
  activeSectionId,
  onSectionClick,
  notesVisible = false,
  notesBySection,
  onOpenNote,
}: ArgumentsViewProps) {
  const study = getActiveStudy()
  const sections = study.sections
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(activeSectionId ? [activeSectionId] : sections.length > 0 ? [sections[0].id] : []),
  )

  const toggleSection = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    onSectionClick(id)
  }

  const expandAll = () => setExpandedIds(new Set(sections.map(s => s.id)))
  const collapseAll = () => setExpandedIds(new Set())

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={SPRING_CRISP}
    >
      {/* Top-level abstract claims banner */}
      <motion.div
        className="mt-6 rounded-xl border border-accent/10 bg-accent/[0.03] p-5"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
      >
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-accent/60 mb-3">
          Abstract-level claims
        </div>
        <div className="space-y-2">
          {study.metadata.keyClaims.map((claim, i) => (
            <motion.div
              key={claim}
              variants={STAGGER_ITEM}
              className="flex items-start gap-3 text-sm leading-relaxed text-text-primary"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-2xs font-semibold text-accent tabular-nums">
                {i + 1}
              </span>
              <span>{claim}</span>
            </motion.div>
          ))}
        </div>
        {notesVisible && (
          <div className="mt-4 flex items-center gap-1.5 text-2xs text-text-faint">
            <MousePointerClick className="h-3 w-3" />
            Select any text to add a community note
          </div>
        )}
      </motion.div>

      {/* Key mechanisms panel — the vocabulary readers need before diving into sections */}
      <motion.div
        className="mt-5 rounded-xl border border-accent/12 bg-gradient-to-br from-accent/[0.02] to-transparent overflow-hidden"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-accent/8">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-accent/60" />
            <span className="text-xs font-medium text-text-primary">Key mechanisms</span>
            <span className="text-2xs text-muted">from §4 formal analysis</span>
          </div>
        </div>
        <div className="grid gap-px bg-accent/[0.06] sm:grid-cols-3">
          {KEY_MECHANISMS.map(m => (
            <motion.div
              key={m.name}
              variants={STAGGER_ITEM}
              className="bg-white px-5 py-4 sm:px-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  m.paradigm === 'Both' ? 'bg-accent' : m.paradigm === 'Local' ? 'bg-amber-500' : 'bg-blue-500',
                )} />
                <span className="text-13 font-semibold text-text-primary">{m.name}</span>
                <span className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium',
                  m.paradigm === 'Both'
                    ? 'text-accent/60'
                    : m.paradigm === 'Local'
                      ? 'text-amber-600/60'
                      : 'text-blue-600/60',
                )}>
                  {m.paradigm}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted">{m.definition}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-text-primary/80 font-medium border-t border-rule/50 pt-2">{m.implication}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Transition hint */}
      <div className="mt-8 mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rule/60 to-transparent" />
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted/50 shrink-0">Section-by-section evidence</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-rule/60 to-transparent" />
      </div>

      {/* Section accordion */}
      <div className="rounded-xl border border-rule bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-rule bg-surface-active/30">
          <div className="text-xs font-medium text-text-primary">Arguments by section</div>
          <div className="flex items-center gap-3">
            <button
              onClick={expandAll}
              className="text-xs text-muted transition-colors hover:text-text-primary"
            >
              Expand all
            </button>
            <span className="text-rule">·</span>
            <button
              onClick={collapseAll}
              className="text-xs text-muted transition-colors hover:text-text-primary"
            >
              Collapse all
            </button>
          </div>
        </div>

        <div className="divide-y divide-rule">
          {sections.map(section => {
            const isExpanded = expandedIds.has(section.id)
            const summaryTags = summarizeSection(section)
            const narrative = study.narratives[section.id]
            const catStyle = SECTION_CATEGORY_STYLE[section.category]
            const { claims, evidence, caveats } = groupBlocksByRole(section.blocks)

            return (
              <div key={section.id} id={section.id} data-section-id={section.id}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full px-5 py-4 text-left transition-colors hover:bg-surface-active/50"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-8 shrink-0 text-11 font-mono text-accent">
                      {section.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-13 font-medium text-text-primary">
                              {section.title}
                            </h3>
                            {catStyle && (
                              <span className={cn(
                                'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium',
                                catStyle.bg, catStyle.text, catStyle.border,
                              )}>
                                {catStyle.label}
                              </span>
                            )}
                          </div>
                          <p className={cn('text-xs leading-[1.5] text-muted', !isExpanded && 'xl:line-clamp-1')}>
                            {section.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {summaryTags.length > 0 && (
                            <div className="hidden sm:flex flex-wrap gap-1.5">
                              {summaryTags.map(tag => (
                                <span key={`${section.id}-${tag}`} className="lab-chip">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={SPRING}
                          >
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: SPRING_ACCORDION,
                        opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-rule px-5 pb-5 pt-4 space-y-4">
                        {/* Entry context */}
                        <div className="rounded-lg border border-rule bg-canvas px-3 py-2.5 text-13 text-muted">
                          <span className="font-medium text-text-primary">Start here if:</span> {sectionEntryLine(section)}
                        </div>

                        {/* Key claim callout */}
                        {narrative?.keyClaim && (
                          <div className="rounded-lg border-l-[3px] border-l-accent bg-accent/[0.04] px-4 py-3">
                            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-accent/60 mb-1.5">
                              <Lightbulb className="h-3 w-3" />
                              Key claim
                            </div>
                            <p className="text-sm leading-relaxed text-text-primary font-medium">
                              {narrative.keyClaim}
                            </p>
                          </div>
                        )}

                        {/* Brief context — lede only, no full narrative */}
                        {narrative?.lede && (
                          <p className="text-sm leading-relaxed text-muted italic">
                            {narrative.lede}
                          </p>
                        )}

                        {/* Source pills — promoted above blocks */}
                        <SectionSourcesRow section={section} />

                        {/* Blocks grouped by argument role */}
                        <BlockGroup label="Claims" blocks={claims} />
                        <BlockGroup label="Evidence" blocks={evidence} />
                        <BlockGroup label="Caveats" blocks={caveats} />

                        {/* Inline community notes */}
                        {notesVisible && notesBySection?.get(section.id) && (
                          <InlineSectionNotes
                            notes={notesBySection.get(section.id) ?? []}
                            onOpenNote={onOpenNote}
                            showAnnotationHint
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
