import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, Link2, Quote, ChevronDown, ChevronUp, LayoutList, FileText, BookOpen, Check, Download } from 'lucide-react'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { cn } from '../lib/cn'
import { SPRING, SPRING_SOFT, SPRING_SNAPPY } from '../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS, type PaperSection } from '../data/paper-sections'
import type { TabId } from '../components/layout/TabNav'

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

type ReaderMode = 'editorial' | 'focus' | 'argument-map' | 'paper'

const ARXIV_PDF_URL = 'https://arxiv.org/pdf/2509.21475'

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
    label: 'Argument map',
    detail: 'Expandable claims organized by section',
  },
  paper: {
    icon: FileText,
    label: 'Full text',
    detail: 'Typeset paper — single column, inline figures, academic layout',
  },
}

const BEST_FIRST_STOP_IDS = ['se4a-attestation', 'se2-distribution', 'discussion', 'limitations'] as const

function summarizeSection(section: PaperSection): string[] {
  const tags: string[] = []
  if (section.id === 'se4a-attestation') tags.push('best paradox')
  if (section.id === 'se2-distribution') tags.push('starting-state effect')
  if (section.id === 'limitations') tags.push('confidence boundary')
  if (section.id === 'discussion') tags.push('design implications')
  const blockTypes = new Set(section.blocks.map(block => block.type))
  if (blockTypes.has('chart') || blockTypes.has('timeseries')) tags.push('charts')
  if (blockTypes.has('table')) tags.push('tables')
  if (blockTypes.has('comparison')) tags.push('comparisons')
  if (section.blocks.some(block => block.type === 'insight' && block.emphasis === 'surprising')) {
    tags.push('surprising result')
  }
  if (section.blocks.some(block => block.type === 'caveat')) tags.push('caveat')
  return tags.slice(0, 3)
}

function sectionEntryLine(section: PaperSection): string {
  const lines: Record<string, string> = {
    'system-model': 'Start here for the core mechanism: how latency turns geography into payoff.',
    'simulation-design': 'Start here for the model boundary: what is simplified, fixed, and directly measured.',
    'baseline-results': 'Start here for the baseline claim that both paradigms centralize without exotic assumptions.',
    'se1-source-placement': 'Start here for the infrastructure-placement flip that helps one paradigm while hurting the other.',
    'se2-distribution': 'Start here if you want to ask whether starting geography matters more than paradigm choice.',
    'se3-joint': 'Start here for the transient dip and the warning against overreading it as mitigation.',
    'se4a-attestation': 'Start here for the paper\'s sharpest paradox: the same gamma change pushes SSP and MSP in opposite directions.',
    'se4b-slots': 'Start here for the fairness-versus-geography distinction under shorter slots.',
    discussion: 'Start here for design implications without overstating what the model has solved.',
    limitations: 'Start here for the confidence boundary of the model.',
  }
  return lines[section.id] ?? section.description
}

export function PaperReaderPage({ onTabChange: _onTabChange }: { onTabChange?: (tab: TabId) => void } = {}) {
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    const stored = window.localStorage.getItem('paper-reader-mode')
    if (stored === 'focus' || stored === 'argument-map' || stored === 'paper') return stored
    return 'editorial'
  })
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    const initialHash = window.location.hash.replace('#', '')
    return PAPER_SECTIONS.some(section => section.id === initialHash)
      ? initialHash
      : PAPER_SECTIONS[0].id
  })
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const focusMode = readerMode === 'focus'
  const argumentMapMode = readerMode === 'argument-map'
  const paperMode = readerMode === 'paper'
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(PAPER_SECTIONS.length > 0 ? [PAPER_SECTIONS[0].id] : []),
  )

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

  useEffect(() => {
    window.localStorage.setItem('paper-reader-mode', readerMode)
  }, [readerMode])

  useEffect(() => {
    const initialHash = window.location.hash.replace('#', '')
    if (!initialHash) return

    const target = document.getElementById(initialHash)
    if (!target) return

    const raf = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })

    return () => window.cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const sections = PAPER_SECTIONS
      .map(section => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

        if (visible[0]?.target.id) {
          setActiveSectionId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-22% 0px -55% 0px',
        threshold: [0.15, 0.35, 0.6],
      },
    )

    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!activeSectionId) return
    const url = new URL(window.location.href)
    url.hash = activeSectionId
    window.history.replaceState({}, '', url.toString())
  }, [activeSectionId])

  const activeSectionIndex = Math.max(
    0,
    PAPER_SECTIONS.findIndex(section => section.id === activeSectionId),
  )
  const progressPercent = ((activeSectionIndex + 1) / PAPER_SECTIONS.length) * 100
  const activeSection = PAPER_SECTIONS.find(section => section.id === activeSectionId) ?? PAPER_SECTIONS[0]
  const bestFirstStops = PAPER_SECTIONS.filter(section =>
    BEST_FIRST_STOP_IDS.includes(section.id as (typeof BEST_FIRST_STOP_IDS)[number]),
  )

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

  return (
    <div className="space-y-12 overflow-x-hidden">
      {/* Paper title hero */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SOFT}
        className="max-w-4xl"
      >
        <h1 className="text-3xl font-medium leading-tight text-text-primary font-serif sm:text-4xl">
          {PAPER_METADATA.title}
        </h1>
        <p className="mt-2 text-sm text-muted">{PAPER_METADATA.citation}</p>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted font-serif">
          {PAPER_METADATA.abstract}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {PAPER_METADATA.keyClaims.map(claim => (
            <span
              key={claim}
              className="lab-chip"
            >
              {claim}
            </span>
          ))}
        </div>
      </motion.section>

      <section className="rounded-xl border border-rule bg-white px-5 py-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Best first stops</span>
            <div className="mt-1 text-[0.8125rem] font-medium text-text-primary">Four strong entry points into the paper</div>
          </div>
          <div className="max-w-2xl text-[0.8125rem] leading-[1.6] text-muted">
            Start with the paradox, then check the realism question, the implications, and the limitations.
          </div>
        </div>

        <div className="mt-4 divide-y divide-rule">
          {bestFirstStops.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() => setActiveSectionId(section.id)}
              className="group flex items-baseline justify-between gap-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <span className="text-[0.625rem] font-mono text-accent uppercase">{section.number}</span>
                <div className="mt-0.5 text-[0.8125rem] font-medium text-text-primary group-hover:text-accent transition-colors">{section.title}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted">{sectionEntryLine(section)}</div>
              </div>
              <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Sticky reading-mode bar ── */}
      <div className="sticky top-[4.5rem] z-20 -mx-4 px-4 py-3 bg-white/95 backdrop-blur-sm border-b border-rule sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-1">
            {(Object.keys(MODE_META) as ReaderMode[]).map(mode => {
              const meta = MODE_META[mode]
              const Icon = meta.icon
              const isActive = readerMode === mode
              return (
                <motion.button
                  key={mode}
                  onClick={() => setReaderMode(mode)}
                  title={meta.detail}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_SNAPPY}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                    isActive
                      ? 'text-text-primary font-medium'
                      : 'text-muted hover:text-text-primary',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-black/[0.04]"
                      transition={SPRING_SNAPPY}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{meta.label}</span>
                  </span>
                </motion.button>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            {!argumentMapMode && !paperMode && (
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
            )}
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
              Reading guide
            </button>
          </div>
        </div>

        {/* Collapsible reading guide panel */}
        <AnimatePresence>
          {guideOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING}
              className="overflow-hidden"
            >
              <div className="grid gap-6 pt-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-medium text-text-primary">Best first stops</div>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { id: 'se4a-attestation', label: 'SE4a attestation threshold' },
                      { id: 'se2-distribution', label: 'SE2 starting geography' },
                      { id: 'discussion', label: 'Discussion and implications' },
                      { id: 'limitations', label: 'Limitations (truth boundary)' },
                    ].map((entry, i) => (
                      <a key={entry.id} href={`#${entry.id}`} onClick={() => setActiveSectionId(entry.id)} className="block text-sm text-muted hover:text-accent transition-colors">
                        <span className="text-xs text-accent mr-1">{i + 1}.</span> {entry.label}
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-text-primary">Current mode</div>
                  <p className="mt-2 text-sm text-muted">{MODE_META[readerMode].detail}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-text-primary">References & artifacts</div>
                  <div className="mt-2 space-y-1.5">
                    {PAPER_METADATA.references.map(ref => (
                      <a key={ref.label} href={ref.url} target="_blank" rel="noopener noreferrer" className="arrow-link text-xs">
                        {ref.label}
                      </a>
                    ))}
                    {_onTabChange && (
                      <button onClick={() => _onTabChange('results')} className="arrow-link text-xs">
                        Simulation results
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {argumentMapMode ? (
        /* ── Argument Map View ── */
        <motion.div key="argument-map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Argument map</span>
              <h2 className="mt-1 text-lg font-medium text-text-primary">
                Claims, paradoxes, and caveats
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={expandAll}
                className="text-[0.8125rem] text-muted transition-colors hover:text-text-primary"
              >
                Expand all
              </button>
              <span className="text-rule">·</span>
              <button
                onClick={collapseAll}
                className="text-[0.8125rem] text-muted transition-colors hover:text-text-primary"
              >
                Collapse all
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-white divide-y divide-rule">
            {PAPER_SECTIONS.map(section => {
              const isExpanded = expandedIds.has(section.id)
              const summaryTags = summarizeSection(section)
              return (
                <div key={section.id}>
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full px-5 py-4 text-left transition-colors hover:bg-surface-active/50"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-8 shrink-0 text-[0.6875rem] font-mono text-accent">
                        {section.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-[0.8125rem] font-medium text-text-primary">
                              {section.title}
                            </h3>
                            <p className="mt-0.5 text-[0.75rem] leading-[1.5] text-muted">
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
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-rule px-5 pb-5 pt-3">
                          <div className="mb-4 rounded-lg border border-rule bg-canvas px-3 py-2.5 text-[0.8125rem] text-muted">
                            <span className="font-medium text-text-primary">Start here if:</span> {sectionEntryLine(section)}
                          </div>
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
        /* ── Full Text View — typeset paper with inline figures ── */
        <motion.div key="paper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)]">
          {/* TOC sidebar */}
          <aside className="hidden xl:block xl:sticky xl:top-40 xl:self-start">
            <div className="border border-rule rounded-lg p-4">
              <span className="text-xs text-muted">Sections</span>
              <nav className="mt-3 space-y-1">
                {PAPER_SECTIONS.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={() => setActiveSectionId(section.id)}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm transition-colors',
                      activeSectionId === section.id
                        ? 'bg-surface-active text-text-primary'
                        : 'text-muted hover:bg-surface-active hover:text-text-primary',
                    )}
                  >
                    <div className={cn(
                      'text-xs',
                      activeSectionId === section.id ? 'text-accent' : 'text-muted',
                    )}>
                      {section.number}
                    </div>
                    <div className="mt-0.5 leading-snug">{section.title}</div>
                  </a>
                ))}
              </nav>
              <div className="mt-4 border-t border-rule pt-3">
                <a
                  href={ARXIV_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text-primary"
                >
                  <Download className="h-3 w-3" />
                  Download original PDF
                </a>
              </div>
            </div>
          </aside>

          <div className="mx-auto max-w-4xl space-y-0">
            {/* Mobile PDF link */}
            <div className="mb-6 xl:hidden">
              <a
                href={ARXIV_PDF_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-xs text-muted hover:text-text-primary hover:border-border-hover transition-colors"
              >
                <Download className="h-3 w-3" />
                Download original PDF
              </a>
            </div>

            {PAPER_SECTIONS.map((section, index) => {
              const narrative = PAPER_NARRATIVE[section.id]
              const figureNumber = index + 1

              return (
                <motion.section
                  key={section.id}
                  id={section.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={SPRING_SOFT}
                  className="scroll-mt-40 pb-10"
                >
                  {/* Section heading */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-3">
                      <span className="text-sm font-mono text-accent tabular-nums">{section.number}</span>
                      <h2 className="text-2xl font-semibold text-text-primary font-serif">
                        {section.title}
                      </h2>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
                      {section.description}
                    </p>
                  </div>

                  {/* Body text — lede paragraph */}
                  <div className="space-y-5 text-[15.5px] leading-[1.9] text-text-body font-serif">
                    <p className="text-[1.0625rem] leading-[1.85] text-text-primary">
                      {narrative.lede}
                    </p>

                    {/* First paragraph */}
                    {narrative.paragraphs[0] && (
                      <p>{narrative.paragraphs[0]}</p>
                    )}
                  </div>

                  {/* Inline figure — between paragraphs */}
                  {section.blocks.length > 0 && (
                    <figure className="my-8">
                      <div className="rounded-xl border border-rule bg-white p-5">
                        <BlockCanvas blocks={section.blocks} showExport={false} />
                      </div>
                      <figcaption className="mt-3 px-1 text-[0.8125rem] leading-relaxed text-muted font-serif">
                        <span className="font-semibold text-text-primary">Figure {figureNumber}.</span>{' '}
                        {narrative.figureCaption}
                      </figcaption>
                    </figure>
                  )}

                  {/* Remaining paragraphs */}
                  {narrative.paragraphs.length > 1 && (
                    <div className="space-y-5 text-[15.5px] leading-[1.9] text-text-body font-serif">
                      {narrative.paragraphs.slice(1).map(p => (
                        <p key={p}>{p}</p>
                      ))}
                    </div>
                  )}

                  {/* Pull quote as blockquote */}
                  <blockquote className="my-8 border-l-[3px] border-l-accent/40 pl-6 py-1">
                    <p className="text-[1.0625rem] leading-[1.85] text-text-primary/80 font-serif italic">
                      {narrative.pullQuote}
                    </p>
                  </blockquote>

                  {/* Section divider */}
                  {index < PAPER_SECTIONS.length - 1 && (
                    <div className="flex items-center gap-4 pt-4">
                      <hr className="flex-1 border-rule" />
                      <span className="text-[0.625rem] font-mono text-text-faint tracking-widest uppercase">
                        {PAPER_SECTIONS[index + 1]?.number}
                      </span>
                      <hr className="flex-1 border-rule" />
                    </div>
                  )}
                </motion.section>
              )
            })}

            {/* References */}
            <section className="border-t border-rule pt-8 pb-4">
              <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">References</span>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {PAPER_METADATA.references.map(ref => (
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
        </motion.div>
      ) : (

      <motion.div key={focusMode ? 'focus' : 'editorial'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className={cn('grid gap-8 overflow-hidden', focusMode ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[220px_minmax(0,1fr)]')}>
        {/* TOC sidebar */}
        {!focusMode && (
          <aside className="hidden xl:block xl:sticky xl:top-40 xl:self-start">
          <div className="border border-rule rounded-lg p-4">
            <span className="text-xs text-muted">Sections</span>
            <nav className="mt-3 space-y-1">
              {PAPER_SECTIONS.map(section => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setActiveSectionId(section.id)}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm transition-colors',
                    activeSectionId === section.id
                      ? 'bg-surface-active text-text-primary'
                      : 'text-muted hover:bg-surface-active hover:text-text-primary',
                  )}
                >
                  <div className={cn(
                    'text-xs',
                    activeSectionId === section.id ? 'text-accent' : 'text-muted',
                  )}>
                    {section.number}
                  </div>
                  <div className="mt-0.5 leading-snug">{section.title}</div>
                </a>
              ))}
            </nav>
          </div>
          </aside>
        )}

        <div className="space-y-12">
          {/* Focus mode section indicator */}
          {focusMode && (
            <div className="sticky top-40 z-10 rounded-lg border border-rule bg-white/95 backdrop-blur-sm px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-mono text-accent">{activeSection.number}</span>
                  <span className="text-text-primary">{activeSection.title}</span>
                </div>
                <button
                  onClick={() => handleCopySectionLink(activeSection.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text-primary"
                >
                  {copiedSectionId === activeSection.id ? <Check className="h-3 w-3 text-success" /> : <Link2 className="h-3 w-3" />}
                  {copiedSectionId === activeSection.id ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>
          )}

          {/* Paper sections */}
          {PAPER_SECTIONS.map((section, index) => {
            const narrative = PAPER_NARRATIVE[section.id]
            const figuresFirst = index % 2 === 1
            const previousSection = PAPER_SECTIONS[index - 1]
            const nextSection = PAPER_SECTIONS[index + 1]

            return (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={SPRING}
                className={cn(
                  'group scroll-mt-40 rounded-lg border border-rule bg-white p-5 transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-6',
                  focusMode && 'mx-auto max-w-5xl',
                )}
              >
                {/* Section header */}
                <div className="mb-6 border-b border-rule pb-5">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs font-mono text-accent tabular-nums">{section.number}</span>
                    <button
                      onClick={() => handleCopySectionLink(section.id)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-surface-active hover:text-text-primary"
                    >
                      {copiedSectionId === section.id ? <Check className="h-3 w-3 text-success" /> : <Link2 className="h-3 w-3" />}
                      {copiedSectionId === section.id ? 'Copied!' : 'Link'}
                    </button>
                  </div>
                  <h2 className={cn('mt-2 text-2xl font-medium text-text-primary font-serif sm:text-3xl', focusMode && 'max-w-3xl')}>
                    {section.title}
                  </h2>
                  <p className={cn('mt-3 text-base leading-relaxed text-muted', focusMode ? 'max-w-3xl' : 'max-w-2xl')}>
                    {section.description}
                  </p>
                  <p className={cn('mt-3 text-sm leading-relaxed text-text-body italic', focusMode ? 'max-w-3xl' : 'max-w-2xl')}>
                    {narrative.figureCaption}
                  </p>
                </div>

                {/* Content grid */}
                <div className={cn('grid gap-6', focusMode ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-12')}>
                  <div className={cn(focusMode ? 'space-y-5' : 'xl:col-span-7 space-y-5', figuresFirst && 'xl:order-2')}>
                    <p className={cn('text-xl leading-relaxed text-text-primary font-serif', focusMode ? 'max-w-3xl text-[1.65rem]' : 'max-w-2xl')}>
                      {narrative.lede}
                    </p>

                    <div className={cn('space-y-4 text-[15px] text-text-body font-serif', focusMode ? 'max-w-3xl text-base leading-9' : 'leading-8')}>
                      {narrative.paragraphs.map(paragraph => (
                        <p key={paragraph} className={cn(focusMode ? 'max-w-3xl' : 'max-w-2xl')}>
                          {paragraph}
                        </p>
                      ))}
                    </div>

                    {/* Pull quote */}
                    <div className="border-l-[3px] border-l-accent pl-5 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted mb-2">
                        <Quote className="h-3 w-3" />
                        Pull quote
                      </div>
                      <p className={cn('leading-relaxed text-text-primary font-serif italic', focusMode ? 'max-w-3xl text-xl' : 'max-w-2xl text-lg')}>
                        {narrative.pullQuote}
                      </p>
                    </div>
                  </div>

                  <div className={cn(focusMode ? 'space-y-4' : 'xl:col-span-5 space-y-4', figuresFirst && 'xl:order-1')}>
                    <div className="border border-rule rounded-md p-4 bg-surface-active">
                      <BlockCanvas blocks={section.blocks} showExport={false} />
                    </div>
                    <p className="px-1 text-xs leading-6 text-muted">
                      {narrative.figureCaption}
                    </p>
                  </div>
                </div>

                {/* Section navigation */}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
                  {previousSection ? (
                    <a
                      href={`#${previousSection.id}`}
                      onClick={() => setActiveSectionId(previousSection.id)}
                      className="group/nav inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-text-primary"
                    >
                      <span className="transition-transform group-hover/nav:-translate-x-0.5">←</span>
                      {previousSection.number} {previousSection.title}
                    </a>
                  ) : (
                    <span className="text-xs text-text-faint">Beginning of paper</span>
                  )}

                  {nextSection ? (
                    <a
                      href={`#${nextSection.id}`}
                      onClick={() => setActiveSectionId(nextSection.id)}
                      className="group/nav inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-accent"
                    >
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

          {/* References footer */}
          <section className="rounded-lg border border-rule bg-white p-5 sm:p-6">
            <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">References and intent</span>
            <p className="mt-3 max-w-2xl text-[0.8125rem] leading-[1.65] text-text-body font-serif">
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
      </motion.div>

      )}

    </div>
  )
}
