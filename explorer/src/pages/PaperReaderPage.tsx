import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowLeft, ArrowRight, Eye, ChevronDown, LayoutList, FileText, BookOpen, Check, Link2 } from 'lucide-react'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { cn } from '../lib/cn'
import { SPRING, SPRING_SOFT, SPRING_SNAPPY } from '../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS, type PaperSection, type Author } from '../data/paper-sections'
import type { TabId } from '../components/layout/TabNav'

/* ── Narrative content per section ── */

interface PaperNarrative {
  readonly lede: string
  readonly paragraphs: readonly string[]
  readonly pullQuote: string
  readonly figureCaption: string
}

const PAPER_NARRATIVE: Record<string, PaperNarrative> = {
  'system-model': {
    lede: 'The paper starts from a simple but consequential premise: geography is part of the protocol once latency affects value capture and consensus.',
    paragraphs: [
      'SSP and MSP expose different latency-critical paths, but both transform regional network position into economic advantage. In SSP, a proposer wants fast access to the best relay while also keeping relay-to-attester propagation tight enough to satisfy the attestation threshold. In MSP, the proposer wants to sit where value from many sources accumulates while still remaining close enough to attesters to finalize in time.',
      'That turns validator placement into a geographic game. The paper frames this as a tension between value capture and quorum reachability, and that framing matters because it explains why the same infrastructure change can help one paradigm and hurt the other.',
    ],
    pullQuote: 'The mechanism differs, but the pressure is the same: latency becomes an allocation rule for where validators want to live.',
    figureCaption: 'The core comparison is the latency path itself: SSP optimizes a best relay path, while MSP optimizes over many direct information inputs.',
  },
  'simulation-design': {
    lede: 'The simulation is deliberately simplified, but it is simplified in a way that makes the causal story easy to inspect.',
    paragraphs: [
      'Validators are agents that repeatedly compare expected rewards across measured cloud regions, then migrate if the gain exceeds switching cost. That design keeps the paper close to a geographic equilibrium story rather than a one-off optimization snapshot.',
      'The costs of that clarity are explicit. MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete. Those assumptions make the engine more interpretable, but the paper is careful to treat them as modeling limits rather than claims about production Ethereum.',
    ],
    pullQuote: 'This is a paper about structural pressure, not about reproducing every empirical detail of block production.',
    figureCaption: 'The simulation design is intentionally legible: 40 measured regions, 1,000 validators, and paper-facing runs commonly reported over 10,000 slots under bounded modeling assumptions.',
  },
  'baseline-results': {
    lede: 'Under the homogeneous starting baseline, both paradigms centralize. The interesting part is how differently they get there.',
    paragraphs: [
      'MSP moves faster and ends more concentrated in the baseline runs. The paper attributes that to the additive nature of local block building: value can accumulate from many distributed sources, so the optimization landscape rewards locations that sit at the overlap between source proximity and attester reachability.',
      'SSP still centralizes, but the locus is shaped by relay geography and the proposer-relay-attester chain. That makes the final map look different even when the underlying force is still latency-driven concentration.',
    ],
    pullQuote: 'Baseline results matter here because they show centralization without needing exotic assumptions.',
    figureCaption: 'The baseline comparison sets the tone for the rest of the paper: MSP is more aggressive in the default geography, SSP is more path-dependent.',
  },
  'se1-source-placement': {
    lede: 'Infrastructure placement is not a neutral background condition. It changes the shape of the optimization problem itself.',
    paragraphs: [
      'The striking result in SE1 is not just that source placement matters, but that aligned and misaligned placements invert the severity of centralization depending on the paradigm. MSP benefits from aligned source placement because value capture and consensus pressure pull in the same direction.',
      'SSP behaves differently because badly placed relays create a stronger co-location premium. When the relay path is the bottleneck, shaving proposer-relay latency becomes disproportionately valuable, so misalignment can make concentration worse instead of better.',
    ],
    pullQuote: 'The same geography can be stabilizing in one paradigm and destabilizing in the other.',
    figureCaption: 'SE1 is the cleanest demonstration that the paper is not merely comparing two labels; it is comparing two different latency geometries.',
  },
  'se2-distribution': {
    lede: 'The paper then asks a harder question: what if the system is already geographically unequal before agents start moving?',
    paragraphs: [
      'Using a more realistic validator distribution shifts the interpretation of the results. Once the starting state is already concentrated in the US and Europe, both paradigms converge quickly because the system begins near the eventual attractor.',
      'That result is important for the website because it keeps the narrative honest. Paradigm choice matters, but initial conditions can dominate. The model is not claiming a single mechanism explains all observed concentration on its own.',
    ],
    pullQuote: 'If the system starts centralized, the paradigm mostly changes how the imbalance amplifies, not whether it exists.',
    figureCaption: 'SE2 reframes the story from "which paradigm centralizes more?" to "how much of the outcome was already baked into the starting distribution?"',
  },
  'se3-joint': {
    lede: 'Joint heterogeneity is where the paper briefly finds something that looks like relief, then carefully refuses to overclaim it.',
    paragraphs: [
      'In the combined heterogeneous case, the temporary dip in concentration appears when SSP starts from today\'s concentrated validator geography and relay placement is poorly connected to that start. That makes the trajectory visually unusual because it is one of the only times the model briefly moves away from concentration rather than further into it.',
      'But the paper treats that as a temporary artifact of competing geographic pulls, not a recipe for decentralization. That caution is a good editorial anchor for the whole reader experience: the goal is to diagnose pressures, not to manufacture optimistic takeaways.',
    ],
    pullQuote: 'A temporary dip in Gini is not the same thing as a decentralization mechanism.',
    figureCaption: 'SE3 is best read as a warning against overinterpreting transient trajectories as stable system improvements.',
  },
  'se4a-attestation': {
    lede: 'SE4a is the paper\'s signature result because it shows the same protocol parameter producing opposite geographic effects across paradigms.',
    paragraphs: [
      'Raising the attestation threshold makes SSP centralize more because the relay path becomes more timing-sensitive. The proposer gains more by clustering tightly around the relay geography that minimizes end-to-end delay.',
      'In MSP, a higher threshold forces a harder compromise between being close to attesters and being close to information sources. Those geographic objectives do not perfectly coincide, so stronger timing pressure can actually disperse the equilibrium rather than compress it.',
    ],
    pullQuote: 'The most surprising result in the paper is also the most revealing: timing rules are not paradigm-neutral.',
    figureCaption: 'Attestation threshold is where the paper most clearly shows that "faster consensus" and "more centralization" do not move identically in SSP and MSP.',
  },
  'se4b-slots': {
    lede: 'Shorter slots do less to change where validators end up than to change how unevenly rewards are distributed on the way there.',
    paragraphs: [
      'The paper finds that moving to 6-second slots leaves the broad geographic equilibrium largely intact. The same regions remain attractive, and the same concentration tendencies persist.',
      'What changes is reward variance. When the slot is shorter, a fixed latency advantage consumes a bigger fraction of the available timing budget. That raises the penalty for being outside the favored corridors even if the final map does not change dramatically.',
    ],
    pullQuote: 'Shorter slots amplify inequality faster than they rewrite the geography.',
    figureCaption: 'The slot-time experiment is a reminder that not every protocol change moves the concentration map, but many still change who gets paid.',
  },
  discussion: {
    lede: 'The discussion section is diagnostic rather than prescriptive, and that is the right tone to preserve in the UI.',
    paragraphs: [
      'The paper sketches mitigation directions such as rewarding underrepresented regions, decentralizing relays and sources, or compensating for latency at the protocol layer. But none of these are presented as settled policy recommendations.',
      'That restraint matters. The contribution is to show that geographic concentration is endogenous to the timing structure of the system, not to claim the model has already solved how to counteract it.',
    ],
    pullQuote: 'The strongest claim here is about diagnosis: the protocol and infrastructure together create concentration pressure.',
    figureCaption: 'Mitigation ideas are included as design directions, not as recommendations validated by this model.',
  },
  limitations: {
    lede: 'The limitations section is one of the most important parts of the paper because it defines where confidence should stop.',
    paragraphs: [
      'Every simplification in the model trades realism for tractability: cloud-only latency, deterministic MEV, full information, fixed migration cost, and no strategic coalition behavior. Those assumptions make the simulations readable and comparable, but they also bound what can be claimed.',
      'For the website, this section should remain close to the end of the reading flow rather than hidden behind a footnote. It keeps the project aligned with the researchers\' intent: truth first, then interpretation.',
    ],
    pullQuote: 'A good research interface should make the caveats feel structural, not optional.',
    figureCaption: 'The limitations list is part of the paper\'s core meaning, not an appendix to ignore.',
  },
}

/* ── Mode definitions ── */

type ReaderMode = 'editorial' | 'focus' | 'argument-map' | 'paper'

const MODE_META: Record<ReaderMode, { icon: typeof Eye; label: string; detail: string }> = {
  editorial: {
    icon: BookOpen,
    label: 'Editorial',
    detail: 'Narrative walkthrough with side-by-side evidence blocks',
  },
  focus: {
    icon: Eye,
    label: 'Focus',
    detail: 'Distraction-free reading, centered layout',
  },
  'argument-map': {
    icon: LayoutList,
    label: 'Map',
    detail: 'Expandable claims organized by section',
  },
  paper: {
    icon: FileText,
    label: 'Paper',
    detail: 'Traditional academic format, single-column',
  },
}

/* ── Helpers ── */

function summarizeSection(section: PaperSection): string[] {
  const tags: string[] = []
  if (section.id === 'se4a-attestation') tags.push('key paradox')
  if (section.id === 'se2-distribution') tags.push('starting-state')
  if (section.id === 'limitations') tags.push('confidence boundary')
  if (section.id === 'discussion') tags.push('implications')
  const blockTypes = new Set(section.blocks.map(block => block.type))
  if (blockTypes.has('chart') || blockTypes.has('timeseries')) tags.push('charts')
  if (blockTypes.has('table')) tags.push('data')
  if (blockTypes.has('comparison')) tags.push('comparison')
  if (section.blocks.some(block => block.type === 'insight' && block.emphasis === 'surprising')) {
    tags.push('surprising')
  }
  if (section.blocks.some(block => block.type === 'caveat')) tags.push('caveat')
  return tags.slice(0, 3)
}

function sectionEntryLine(section: PaperSection): string {
  const lines: Record<string, string> = {
    'system-model': 'The core mechanism: how latency turns geography into payoff.',
    'simulation-design': 'The model boundary: what is simplified, fixed, and directly measured.',
    'baseline-results': 'Both paradigms centralize without exotic assumptions.',
    'se1-source-placement': 'The infrastructure-placement flip: helps one paradigm, hurts the other.',
    'se2-distribution': 'Whether starting geography matters more than paradigm choice.',
    'se3-joint': 'The transient dip and the warning against overreading it.',
    'se4a-attestation': 'The sharpest paradox: same gamma, opposite directions.',
    'se4b-slots': 'Fairness versus geography under shorter slots.',
    discussion: 'Design implications without overstating what the model solved.',
    limitations: 'The confidence boundary of the model.',
  }
  return lines[section.id] ?? section.description
}

const RECOMMENDED_SECTIONS = [
  { id: 'se4a-attestation', label: 'Attestation threshold', why: 'Same lever, opposite geographic effects' },
  { id: 'se2-distribution', label: 'Starting geography', why: 'How much is baked into the initial map?' },
  { id: 'limitations', label: 'Limitations', why: 'Where model confidence stops' },
] as const

/* ── Component ── */

export function PaperReaderPage({ onTabChange: _onTabChange }: { onTabChange?: (tab: TabId) => void } = {}) {
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    const stored = window.localStorage.getItem('paper-reader-mode')
    if (stored === 'focus' || stored === 'argument-map' || stored === 'paper') return stored
    return 'editorial'
  })
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    const initialHash = window.location.hash.replace('#', '')
    return PAPER_SECTIONS.some(s => s.id === initialHash) ? initialHash : PAPER_SECTIONS[0].id
  })
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(PAPER_SECTIONS.length > 0 ? [PAPER_SECTIONS[0].id] : []),
  )

  const focusMode = readerMode === 'focus'
  const argumentMapMode = readerMode === 'argument-map'
  const paperMode = readerMode === 'paper'

  const toggleSection = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const expandAll = () => setExpandedIds(new Set(PAPER_SECTIONS.map(s => s.id)))
  const collapseAll = () => setExpandedIds(new Set())

  useEffect(() => { window.localStorage.setItem('paper-reader-mode', readerMode) }, [readerMode])

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    const el = document.getElementById(hash)
    if (!el) return
    const raf = window.requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    return () => window.cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const els = PAPER_SECTIONS
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        const hit = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (hit?.target.id) setActiveSectionId(hit.target.id)
      },
      { rootMargin: '-22% 0px -55% 0px', threshold: [0.15, 0.35, 0.6] },
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!activeSectionId) return
    const url = new URL(window.location.href)
    url.hash = activeSectionId
    window.history.replaceState({}, '', url.toString())
  }, [activeSectionId])

  const activeSectionIndex = Math.max(0, PAPER_SECTIONS.findIndex(s => s.id === activeSectionId))
  const progressPercent = ((activeSectionIndex + 1) / PAPER_SECTIONS.length) * 100
  const activeSection = PAPER_SECTIONS[activeSectionIndex]

  const handleCopyLink = async (sectionId: string) => {
    const url = new URL(window.location.href)
    url.hash = sectionId
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedSectionId(sectionId)
      window.setTimeout(() => setCopiedSectionId(c => (c === sectionId ? null : c)), 1600)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="border-b border-border-subtle pb-8"
      >
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          Editorial reading guide
        </div>
        <h1 className="mt-4 text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-text-primary sm:text-[32px]">
          {PAPER_METADATA.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-muted">
          {PAPER_METADATA.authors.map((author: Author, i: number) => (
            <span key={author.name}>
              {author.url ? (
                <a
                  href={author.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-primary underline decoration-border-subtle underline-offset-2 transition-colors hover:decoration-accent"
                >
                  {author.name}
                </a>
              ) : (
                <span className="text-text-primary">{author.name}</span>
              )}
              {i < PAPER_METADATA.authors.length - 1 && <span className="text-text-faint">,</span>}
            </span>
          ))}
          <span className="text-text-faint ml-1">· 2025 · arXiv:2509.21475</span>
        </div>
        <p className="mt-4 max-w-[640px] text-[15px] leading-[1.7] text-text-body">
          {PAPER_METADATA.abstract}
        </p>
      </motion.header>

      {/* ── Two-column layout ── */}
      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_240px]">

        {/* ── Main content ── */}
        <div className="min-w-0">

          {/* Mode switcher — sticky */}
          <div className="sticky top-[4.5rem] z-20 -mx-4 mb-10 border-b border-border-subtle bg-white/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
            <div className="flex items-center gap-1 py-2">
              {(Object.keys(MODE_META) as ReaderMode[]).map(mode => {
                const meta = MODE_META[mode]
                const Icon = meta.icon
                const isActive = readerMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => setReaderMode(mode)}
                    title={meta.detail}
                    className={cn(
                      'relative flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] transition-colors',
                      isActive
                        ? 'text-text-primary'
                        : 'text-muted hover:text-text-primary',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="mode-underline"
                        className="absolute inset-x-1 -bottom-[9px] h-[2px] rounded-full bg-text-primary"
                        transition={SPRING_SNAPPY}
                      />
                    )}
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Argument Map ── */}
          {argumentMapMode ? (
            <motion.div key="argument-map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <div className="mb-8 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">
                    Claims and caveats
                  </h2>
                  <p className="mt-1 text-[13px] text-muted">
                    Expandable sections organized by paper structure
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={expandAll}
                    className="rounded-md px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-[#F5F5F3] hover:text-text-primary"
                  >
                    Expand all
                  </button>
                  <button
                    onClick={collapseAll}
                    className="rounded-md px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:bg-[#F5F5F3] hover:text-text-primary"
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              <div className="space-y-px rounded-lg border border-border-subtle overflow-hidden">
                {PAPER_SECTIONS.map(section => {
                  const isExpanded = expandedIds.has(section.id)
                  const summaryTags = summarizeSection(section)
                  return (
                    <div
                      key={section.id}
                      className={cn(
                        'bg-white transition-colors',
                        isExpanded && 'bg-[#FAFAF8]',
                      )}
                    >
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full px-5 py-4 text-left transition-colors hover:bg-[#F5F5F3]"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 w-10 shrink-0 text-[11px] font-mono text-muted tabular-nums">
                            {section.number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-[14px] font-medium text-text-primary leading-snug">
                                {section.title}
                              </h3>
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={SPRING_SNAPPY}
                                className="mt-0.5"
                              >
                                <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
                              </motion.div>
                            </div>
                            {summaryTags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {summaryTags.map(tag => (
                                  <span key={`${section.id}-${tag}`} className="text-[11px] text-muted">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={SPRING}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border-subtle px-5 pb-5 pt-4">
                              <p className="mb-4 text-[13px] leading-relaxed text-muted">
                                {sectionEntryLine(section)}
                              </p>
                              <BlockCanvas blocks={section.blocks} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </motion.div>

          ) : paperMode ? (
            /* ── Paper (Academic) View ── */
            <motion.div key="paper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="mx-auto max-w-[640px]">
              <div className="space-y-16">
                {PAPER_SECTIONS.map((section, index) => {
                  const narrative = PAPER_NARRATIVE[section.id]
                  return (
                    <motion.section
                      key={section.id}
                      id={section.id}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      transition={SPRING_SOFT}
                      className="scroll-mt-32"
                    >
                      <div className="mb-5 flex items-baseline gap-3">
                        <span className="text-[11px] font-mono text-muted tabular-nums">{section.number}</span>
                        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
                          {section.title}
                        </h2>
                      </div>
                      <div className="space-y-4 text-[15px] leading-[1.8] text-text-body">
                        <p className="text-[15px] leading-[1.8] text-text-primary font-medium">{narrative.lede}</p>
                        {narrative.paragraphs.map(p => (
                          <p key={p}>{p}</p>
                        ))}
                      </div>
                      {section.blocks.length > 0 && (
                        <div className="mt-8 rounded-lg border border-border-subtle p-5">
                          <BlockCanvas blocks={section.blocks} showExport={false} />
                        </div>
                      )}
                      {index < PAPER_SECTIONS.length - 1 && (
                        <div className="mt-16 border-b border-border-subtle" />
                      )}
                    </motion.section>
                  )
                })}
              </div>
            </motion.div>

          ) : (
            /* ── Editorial / Focus View ── */
            <motion.div key={focusMode ? 'focus' : 'editorial'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {/* Focus mode: current section indicator */}
              {focusMode && (
                <div className="mb-8 flex items-center gap-3 text-sm">
                  <span className="text-[11px] font-mono text-accent tabular-nums">{activeSection.number}</span>
                  <span className="text-text-primary font-medium">{activeSection.title}</span>
                </div>
              )}

              <div className="space-y-16">
                {PAPER_SECTIONS.map((section, index) => {
                  const narrative = PAPER_NARRATIVE[section.id]
                  const figuresFirst = index % 2 === 1
                  const previousSection = PAPER_SECTIONS[index - 1]
                  const nextSection = PAPER_SECTIONS[index + 1]

                  return (
                    <motion.section
                      key={section.id}
                      id={section.id}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      transition={SPRING_SOFT}
                      className={cn(
                        'group scroll-mt-32',
                        focusMode && 'mx-auto max-w-[640px]',
                      )}
                    >
                      {/* Section header */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-3">
                          <span className="text-[11px] font-mono text-accent tabular-nums">{section.number}</span>
                          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-text-primary sm:text-[24px]">
                            {section.title}
                          </h2>
                          <button
                            onClick={() => handleCopyLink(section.id)}
                            className="ml-auto shrink-0 rounded-md p-1.5 text-text-faint opacity-0 transition-all hover:bg-[#F5F5F3] hover:text-text-primary group-hover:opacity-100"
                            aria-label="Copy link"
                          >
                            {copiedSectionId === section.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Link2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <p className={cn('mt-2 text-[15px] leading-[1.7] text-muted', focusMode ? 'max-w-[640px]' : 'max-w-[540px]')}>
                          {section.description}
                        </p>
                      </div>

                      {/* Content */}
                      <div className={cn('grid gap-8', focusMode ? '' : 'xl:grid-cols-12')}>
                        <div className={cn(focusMode ? '' : 'xl:col-span-7', figuresFirst && !focusMode && 'xl:order-2')}>
                          <div className="space-y-5">
                            <p className={cn(
                              'text-[17px] leading-[1.65] text-text-primary',
                              focusMode ? 'text-[19px] leading-[1.75] max-w-[640px]' : 'max-w-[540px]',
                            )}>
                              {narrative.lede}
                            </p>
                            <div className={cn('space-y-4 text-[15px] leading-[1.75] text-text-body', focusMode && 'text-[16px] leading-[1.8]')}>
                              {narrative.paragraphs.map(paragraph => (
                                <p key={paragraph} className={cn(focusMode ? 'max-w-[640px]' : 'max-w-[540px]')}>
                                  {paragraph}
                                </p>
                              ))}
                            </div>
                            {/* Pull quote */}
                            <div className="border-l-2 border-accent/40 pl-5 py-1">
                              <p className={cn(
                                'text-[15px] leading-[1.7] text-text-primary italic',
                                focusMode ? 'text-[17px] max-w-[600px]' : 'max-w-[500px]',
                              )}>
                                {narrative.pullQuote}
                              </p>
                            </div>
                          </div>
                        </div>

                        {!focusMode && (
                          <div className={cn('xl:col-span-5', figuresFirst && 'xl:order-1')}>
                            <div className="rounded-lg border border-border-subtle p-4">
                              <BlockCanvas blocks={section.blocks} showExport={false} />
                            </div>
                            <p className="mt-2 px-1 text-[12px] leading-[1.6] text-muted">
                              {narrative.figureCaption}
                            </p>
                          </div>
                        )}
                        {focusMode && section.blocks.length > 0 && (
                          <div className="mt-2">
                            <div className="rounded-lg border border-border-subtle p-5">
                              <BlockCanvas blocks={section.blocks} showExport={false} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Section navigation */}
                      <div className="mt-10 flex items-center justify-between border-t border-border-subtle pt-5">
                        {previousSection ? (
                          <a
                            href={`#${previousSection.id}`}
                            onClick={() => setActiveSectionId(previousSection.id)}
                            className="group/nav inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-text-primary"
                          >
                            <ArrowLeft className="h-3 w-3 transition-transform group-hover/nav:-translate-x-0.5" />
                            <span>{previousSection.title}</span>
                          </a>
                        ) : <span />}
                        {nextSection ? (
                          <a
                            href={`#${nextSection.id}`}
                            onClick={() => setActiveSectionId(nextSection.id)}
                            className="group/nav inline-flex items-center gap-2 text-[13px] text-text-primary transition-colors hover:text-accent"
                          >
                            <span>{nextSection.title}</span>
                            <ArrowRight className="h-3 w-3 transition-transform group-hover/nav:translate-x-0.5" />
                          </a>
                        ) : <span />}
                      </div>
                    </motion.section>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="hidden xl:block">
          <div className="sticky top-[7.5rem] space-y-8">

            {/* Progress */}
            {!argumentMapMode && !paperMode && (
              <div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[#EBEBEA]">
                  <motion.div
                    className="h-full rounded-full bg-text-primary"
                    animate={{ width: `${progressPercent}%` }}
                    transition={SPRING_SOFT}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted tabular-nums">
                  {activeSectionIndex + 1} of {PAPER_SECTIONS.length}
                </p>
              </div>
            )}

            {/* Section TOC */}
            {!argumentMapMode && (
              <nav className="space-y-0.5">
                {PAPER_SECTIONS.map(section => {
                  const isActive = activeSectionId === section.id
                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      onClick={() => setActiveSectionId(section.id)}
                      className={cn(
                        'flex items-baseline gap-2.5 rounded-md px-2 py-1.5 text-[12px] leading-snug transition-colors',
                        isActive
                          ? 'bg-[#F5F5F3] text-text-primary font-medium'
                          : 'text-muted hover:text-text-primary',
                      )}
                    >
                      <span className={cn(
                        'shrink-0 font-mono text-[10px] tabular-nums w-8',
                        isActive ? 'text-text-primary' : 'text-text-faint',
                      )}>
                        {section.number}
                      </span>
                      <span>{section.title}</span>
                    </a>
                  )
                })}
              </nav>
            )}

            {/* Recommended starting points */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">Start with</p>
              <div className="mt-3 space-y-3">
                {RECOMMENDED_SECTIONS.map((entry, i) => (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    onClick={() => setActiveSectionId(entry.id)}
                    className="group/rec block"
                  >
                    <p className="text-[12px] font-medium text-text-primary transition-colors group-hover/rec:text-accent">
                      <span className="text-muted mr-1">{i + 1}.</span>
                      {entry.label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{entry.why}</p>
                  </a>
                ))}
              </div>
            </div>

            {/* Authors */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">Authors</p>
              <div className="mt-3 space-y-2">
                {PAPER_METADATA.authors.map((author: Author) => (
                  <div key={author.name}>
                    {author.url ? (
                      <a
                        href={author.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-text-primary underline decoration-border-subtle underline-offset-2 transition-colors hover:decoration-accent"
                      >
                        {author.name}
                      </a>
                    ) : (
                      <span className="text-[12px] text-text-primary">{author.name}</span>
                    )}
                    {author.role && (
                      <p className="text-[11px] text-muted">{author.role}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="space-y-1.5">
              {PAPER_METADATA.references.map(ref => (
                <a
                  key={ref.label}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-text-primary"
                >
                  {ref.label}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              ))}
              {_onTabChange && (
                <button
                  onClick={() => _onTabChange('results')}
                  className="flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-text-primary"
                >
                  Published results
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
            </div>

          </div>
        </aside>

      </div>
    </div>
  )
}
