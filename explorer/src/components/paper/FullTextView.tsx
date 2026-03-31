import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_SOFT, PAGE_TRANSITION } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import { PAPER_NARRATIVE } from '../../data/paper-narrative'
import { ARXIV_PDF_URL } from './paper-helpers'
import { BlockCanvas } from '../explore/BlockCanvas'

interface FullTextViewProps {
  readonly activeSectionId: string
  readonly onSectionClick: (id: string) => void
}

export function FullTextView({ activeSectionId, onSectionClick }: FullTextViewProps) {
  return (
    <motion.div key="paper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE_TRANSITION} className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)]">
      {/* TOC sidebar */}
      <aside className="hidden xl:block xl:sticky xl:top-40 xl:self-start">
        <div className="border border-rule rounded-lg p-4">
          <span className="text-xs text-muted">Sections</span>
          <nav className="mt-3 space-y-1">
            {PAPER_SECTIONS.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => onSectionClick(section.id)}
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
          if (!narrative) return null
          const figureNumber = index + 1

          return (
            <motion.section
              key={section.id}
              id={section.id}
              data-section-id={section.id}
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
              <div className="space-y-5 text-base leading-[1.9] text-text-body font-serif">
                <p className="text-lg leading-[1.85] text-text-primary">
                  {narrative.lede}
                </p>
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
                <div className="space-y-5 text-base leading-[1.9] text-text-body font-serif">
                  {narrative.paragraphs.slice(1).map(p => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              )}

              {/* Pull quote as blockquote */}
              <blockquote className="my-8 border-l-[3px] border-l-accent/40 pl-6 py-1">
                <p className="text-lg leading-[1.85] text-text-primary/80 font-serif italic">
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
  )
}
