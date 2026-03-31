import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { SPRING_CRISP } from '../lib/theme'
import { PAPER_SECTIONS, type PaperSection } from '../data/paper-sections'

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
  switch (section.id) {
    case 'system-model':
      return 'Start here for the core mechanism: how latency turns geography into payoff.'
    case 'simulation-design':
      return 'Start here for the model boundary: what is simplified, fixed, and directly measured.'
    case 'baseline-results':
      return 'Start here for the baseline claim that both paradigms centralize without exotic assumptions.'
    case 'se1-source-placement':
      return 'Start here for the infrastructure-placement flip that helps one paradigm while hurting the other.'
    case 'se2-distribution':
      return 'Start here if you want to ask whether starting geography matters more than paradigm choice.'
    case 'se3-joint':
      return 'Start here for the transient dip and the warning against overreading it as mitigation.'
    case 'se4a-attestation':
      return 'Start here for the paper’s sharpest paradox: the same gamma change pushes SSP and MSP in opposite directions.'
    case 'se4b-slots':
      return 'Start here for the fairness-versus-geography distinction under shorter slots.'
    case 'discussion':
      return 'Start here for design implications without overstating what the model has solved.'
    case 'limitations':
      return 'Start here for the confidence boundary of the model.'
    default:
      return section.description
  }
}

export function DeepDivePage() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(PAPER_SECTIONS.length > 0 ? [PAPER_SECTIONS[0].id] : []),
  )

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    setExpandedIds(new Set(PAPER_SECTIONS.map(section => section.id)))
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  return (
    <div>
      {/* Page header */}
      <div className="reveal-up mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Paper deep dive</span>
            <h1 className="mt-1 text-lg font-semibold text-text-primary text-balance">
              Argument, paradoxes, and caveats
            </h1>
            <p className="mt-1 text-13 text-muted">
              Ten sections from model design through limitations — expand any to see the evidence blocks.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 pt-1">
            <button
              onClick={expandAll}
              className="text-13 text-muted transition-colors hover:text-text-primary"
            >
              Expand all
            </button>
            <span className="text-rule">·</span>
            <button
              onClick={collapseAll}
              className="text-13 text-muted transition-colors hover:text-text-primary"
            >
              Collapse all
            </button>
          </div>
        </div>
      </div>

      <div className="stagger-reveal mb-6 rounded-xl border border-rule bg-white divide-y divide-rule">
        <a
          href="https://arxiv.org/abs/2509.21475"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex w-full items-baseline justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-active/50"
        >
          <div className="min-w-0">
            <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Canonical paper</span>
            <div className="mt-1 text-13 font-medium leading-6 text-text-primary">Open arXiv source</div>
          </div>
          <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
        </a>
        <a
          href="?tab=results"
          className="group flex w-full items-baseline justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-active/50"
        >
          <div className="min-w-0">
            <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Canonical results</span>
            <div className="mt-1 text-13 font-medium leading-6 text-text-primary">Open published simulation selector</div>
          </div>
          <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
        </a>
        <a
          href="https://github.com/syang-ng/geographical-decentralization-simulation"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex w-full items-baseline justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-active/50"
        >
          <div className="min-w-0">
            <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Implementation source</span>
            <div className="mt-1 text-13 font-medium leading-6 text-text-primary">Open repository</div>
          </div>
          <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
        </a>
      </div>

      {/* Accordion sections — FAQ-style single container */}
      <div className="stagger-reveal rounded-xl border border-rule bg-white divide-y divide-rule">
        {PAPER_SECTIONS.map(section => {
          const isExpanded = expandedIds.has(section.id)
          const summaryTags = summarizeSection(section)
          return (
            <div key={section.id}>
              <button
                onClick={() => toggle(section.id)}
                className="w-full px-5 py-4 text-left transition-colors hover:bg-surface-active/50"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-8 shrink-0 text-11 font-mono text-accent">
                    {section.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-13 font-medium text-text-primary line-clamp-2">
                          {section.title}
                        </h3>
                        <p className="mt-1 text-xs text-muted">
                          {section.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">
                          {section.blocks.length} blocks
                        </span>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={SPRING_CRISP}
                        >
                          <ChevronDown className="h-4 w-4 shrink-0 text-text-faint" />
                        </motion.div>
                      </div>
                    </div>

                    {summaryTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {summaryTags.map(tag => (
                          <span key={`${section.id}-${tag}`} className="lab-chip">{tag}</span>
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
                    transition={SPRING_CRISP}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-rule px-5 pb-4 pt-3">
                      <div role="note" aria-label="Entry point guidance" className="mb-4 rounded-md border border-rule bg-surface-active px-3 py-3 text-xs text-muted text-balance">
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

    </div>
  )
}
