import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { SPRING } from '../../lib/theme'
import { PAPER_SECTIONS } from '../../data/paper-sections'
import { PAPER_NARRATIVE } from '../../data/paper-narrative'
import { summarizeSection, sectionEntryLine } from './paper-helpers'
import { BlockCanvas } from '../explore/BlockCanvas'

export function ArgumentMapView() {
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

  return (
    <div>
      <div className="flex items-center justify-end gap-3 px-5 py-2.5 border-b border-rule bg-surface-active/30">
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

      <div className="divide-y divide-rule">
        {PAPER_SECTIONS.map(section => {
          const isExpanded = expandedIds.has(section.id)
          const summaryTags = summarizeSection(section)
          const narrative = PAPER_NARRATIVE[section.id]
          return (
            <div key={section.id}>
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
                        <h3 className="text-13 font-medium text-text-primary">
                          {section.title}
                        </h3>
                        <p className="mt-0.5 text-xs leading-[1.5] text-muted">
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
                      <div className="mb-4 rounded-lg border border-rule bg-canvas px-3 py-2.5 text-13 text-muted">
                        <span className="font-medium text-text-primary">Start here if:</span> {sectionEntryLine(section)}
                      </div>
                      {narrative && (
                        <div className="mb-4 space-y-3 text-sm leading-relaxed text-text-body font-serif">
                          <p className="font-medium text-text-primary">{narrative.lede}</p>
                          {narrative.paragraphs.map(p => (
                            <p key={p}>{p}</p>
                          ))}
                        </div>
                      )}
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
