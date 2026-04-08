import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { SPRING_CRISP } from '../lib/theme'
import { summarizeSection, sectionEntryLine } from '../components/paper/paper-helpers'
import { getActiveStudy } from '../studies'

export function DeepDivePage() {
  const study = getActiveStudy()
  const sections = study.sections
  const paperUrl = study.metadata.references[0]?.url ?? '#'
  const repoUrl = study.metadata.references[1]?.url ?? '#'
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(sections.length > 0 ? [sections[0].id] : []),
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
    setExpandedIds(new Set(sections.map(section => section.id)))
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
              Arguments, contrasts, and caveats
            </h1>
            <p className="mt-1 text-13 text-muted">
              Eleven sections from model design through limitations — expand any to see the evidence blocks.
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
          href={paperUrl}
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
          href={repoUrl}
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
        {sections.map(section => {
          const isExpanded = expandedIds.has(section.id)
          const summaryTags = summarizeSection(section)
          return (
            <div key={section.id}>
              <button
                onClick={() => toggle(section.id)}
                className="w-full px-5 py-4 text-left transition-colors hover:bg-surface-active/50"
                aria-expanded={isExpanded}
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
