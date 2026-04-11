import { useMemo } from 'react'
import { ArrowLeft, ExternalLink, FlaskConical, ScrollText } from 'lucide-react'
import { BlockCanvas } from '../components/explore/BlockCanvas'
import { PaperChartBlock } from '../components/blocks/PaperChartBlock'
import {
  getStudyHtmlUrl,
} from '../components/paper/paper-helpers'
import { cn } from '../lib/cn'
import { buildPublishedEvidenceUrl, type PublishedEvidenceSelection } from '../lib/published-evidence-url'
import { CONTENT_MAX_WIDTH } from '../lib/theme'
import { getActiveStudy } from '../studies'

function withoutPreviewParam(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('preview')
  return url.toString()
}

function buildResultsUrl(selection: PublishedEvidenceSelection): string {
  return buildPublishedEvidenceUrl(selection)
}

interface PaperHtmlPreviewPageProps {
  readonly embedded?: boolean
}

const EMBEDDED_PAPER_STACK_TOP = 'calc(var(--explorer-tab-nav-height, 3.75rem) + var(--explorer-paper-mode-bar-height, 4.75rem) + 1rem)'

export function PaperHtmlPreviewPage({ embedded = false }: PaperHtmlPreviewPageProps) {
  const study = getActiveStudy()
  const backHref = withoutPreviewParam()
  const htmlUrl = getStudyHtmlUrl()

  const uniqueReferences = useMemo(() => {
    const seen = new Set<string>()
    const refs = [...study.metadata.references, ...study.runtime.sourceBlockRefs]

    return refs.filter(reference => {
      const key = `${reference.label}|${reference.url ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [study.metadata.references, study.runtime.sourceBlockRefs])

  const interactiveFigures = useMemo(() => {
    return study.sections.flatMap(section => (
      section.blocks
        .filter(block => block.type === 'paperChart')
        .map(block => {
          const chart = study.paperCharts[block.dataKey]
          return {
            chart,
            section,
            sectionHref: `#${section.id}`,
            resultsLinks: (chart.publishedScenarioLinks ?? []).map(link => ({
              ...link,
              href: buildResultsUrl(link),
            })),
          }
        })
    ))
  }, [study.paperCharts, study.sections])

  return (
    <div className={embedded ? 'w-full' : 'min-h-screen bg-canvas'}>
      {!embedded && (
        <div className="border-b border-rule/70 bg-white/92 backdrop-blur-lg">
          <div className={cn('mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6', CONTENT_MAX_WIDTH)}>
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">
                Hidden Preview
              </div>
              <div className="mt-1 text-sm text-text-primary">
                HTML reading layer prototype. Not linked from the main explorer navigation.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={backHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-active"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Main explorer
              </a>
              <a
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.05] px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/[0.1]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                arXiv HTML
              </a>
            </div>
          </div>
        </div>
      )}

      <main
        className={cn(
          embedded ? 'w-full py-4 sm:py-6' : 'mx-auto px-4 sm:px-6 py-8',
          embedded ? '' : CONTENT_MAX_WIDTH,
        )}
      >
        <div className="grid gap-8 xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <div
              data-testid="paper-html-contents-rail"
              className="sticky rounded-2xl border border-rule/70 bg-white/95 p-4 shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
              style={{ top: embedded ? EMBEDDED_PAPER_STACK_TOP : '7rem' }}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Contents</div>
              <nav className="mt-3 space-y-1.5">
                {study.sections.map(section => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-active hover:text-text-primary"
                  >
                    <span className="mr-2 text-[11px] font-mono text-accent">{section.number}</span>
                    {section.title}
                  </a>
                ))}
              </nav>

              {interactiveFigures.length > 0 && (
                <div className="mt-5 border-t border-rule/70 pt-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Figures</div>
                  <div className="mt-2 space-y-2">
                    {interactiveFigures.map(entry => (
                      <a
                        key={entry.chart.data.id}
                        href={entry.sectionHref}
                        className="block rounded-lg border border-rule/60 bg-surface-active/35 px-3 py-2 transition-colors hover:border-accent/20 hover:bg-accent/[0.04]"
                      >
                        <div className="text-xs font-medium text-text-primary">{entry.section.number}</div>
                        <div className="mt-1 text-[11px] leading-5 text-muted">{entry.chart.description}</div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-rule/70 pt-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Appendices</div>
                <div className="mt-2 space-y-2">
                  {study.navigation.appendices.map(appendix => (
                    <a
                      key={appendix.id}
                      href={appendix.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-rule/60 bg-surface-active/35 px-3 py-2 transition-colors hover:border-accent/20 hover:bg-accent/[0.04]"
                    >
                      <div className="text-xs font-medium text-text-primary">{appendix.label}</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted">{appendix.summary}</div>
                    </a>
                  ))}
                </div>
              </div>

              <a
                href="#references"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80"
              >
                <ScrollText className="h-3.5 w-3.5" />
                Jump to references
              </a>
            </div>
          </aside>

          <article className="min-w-0">
            <header className="overflow-hidden rounded-[1.8rem] border border-rule/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)] sm:px-8 sm:py-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/[0.05] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-accent sm:px-3 sm:text-[11px]">
                <FlaskConical className="h-3.5 w-3.5" />
                {embedded ? 'HTML Source View' : 'Research HTML Preview'}
              </div>
              <h1 className="mt-3.5 max-w-4xl text-[1.9rem] font-medium leading-[1.06] text-text-primary font-serif sm:mt-4 sm:text-4xl sm:leading-tight">
                {study.metadata.title}
              </h1>
              <p className="mt-2.5 max-w-3xl text-[14px] leading-6.5 text-muted sm:mt-3 sm:text-base sm:leading-7">
                {embedded ? 'A source-oriented HTML reading layer over the paper, with section structure and cited artifacts preserved.' : study.metadata.subtitle}
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2">
                {study.metadata.references.map(reference => (
                  reference.url ? (
                    <a
                      key={reference.label}
                      href={reference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-active sm:px-3 sm:text-xs"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {reference.label}
                    </a>
                  ) : null
                ))}
                {embedded && (
                  <a
                    href={htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.05] px-2.5 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/[0.1] sm:px-3 sm:text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open arXiv HTML
                  </a>
                )}
              </div>

              <div className="mt-5 grid gap-4 border-t border-rule/70 pt-5 sm:mt-6 sm:gap-5 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Abstract</div>
                  <p className="mt-2 max-w-3xl text-[14px] leading-6.5 text-text-body sm:text-[15px] sm:leading-7">
                    {study.metadata.abstract}
                  </p>
                </div>
                <div className="rounded-2xl border border-rule/60 bg-surface-active/40 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Key claims</div>
                  <div className="mt-3 space-y-2.5">
                    {study.metadata.keyClaims.map(claim => (
                      <p key={claim} className="text-sm leading-6 text-text-primary">
                        {claim}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                {study.metadata.authors.map(author => (
                  <div key={author.name} className="rounded-2xl border border-rule/60 bg-white/75 px-3.5 py-3 sm:px-4">
                    <div className="text-sm font-medium text-text-primary">{author.name}</div>
                    {author.role && <div className="mt-1 text-xs text-muted">{author.role}</div>}
                    {author.focus && <div className="mt-2 text-[11px] leading-5 text-text-faint">{author.focus}</div>}
                  </div>
                ))}
              </div>
            </header>

            {interactiveFigures.length > 0 && (
              <section className="mt-8 overflow-hidden rounded-[1.6rem] border border-rule/70 bg-white/96 px-6 py-7 shadow-[0_4px_18px_rgba(0,0,0,0.04)] sm:px-8">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Interactive Figure Deck</div>
                <h2 className="mt-2 text-2xl font-medium text-text-primary font-serif">Published figures you can inspect here</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                  This preview keeps the article surface source-like, but upgrades the figures into interactive inspectors and replay launchers.
                </p>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {interactiveFigures.map(entry => (
                    <div
                      key={`${entry.section.id}-${entry.chart.data.id}`}
                      className="rounded-2xl border border-rule/60 bg-surface-active/35 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-rule/60 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-accent">
                          {entry.section.number}
                        </span>
                        <span className="text-sm font-medium text-text-primary">{entry.section.title}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted">{entry.chart.description}</p>
                      <p className="mt-2 text-sm leading-6 text-text-body">{entry.chart.takeaway}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a
                          href={entry.sectionHref}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-active"
                        >
                          <ScrollText className="h-3 w-3" />
                          Jump to section
                        </a>
                        <a
                          href={entry.chart.figureHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-active"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Original figure
                        </a>
                        {entry.resultsLinks.slice(0, 2).map(link => (
                          <a
                            key={`${entry.chart.data.id}-${link.evaluation}-${link.paradigm}-${link.result}`}
                            href={link.href}
                            className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.05] px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/[0.1]"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-8 space-y-8">
              {study.sections.map(section => {
                const narrative = study.narratives[section.id]
                const paperCharts = section.blocks.filter(block => block.type === 'paperChart')
                const supportingBlocks = section.blocks.filter(block => block.type !== 'paperChart')

                return (
                  <section
                    key={section.id}
                    id={section.id}
                    className="overflow-hidden rounded-[1.6rem] border border-rule/70 bg-white/96 px-6 py-7 shadow-[0_4px_18px_rgba(0,0,0,0.04)] sm:px-8"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
                          {section.number}
                        </div>
                        <h2 className="mt-2 text-2xl font-medium text-text-primary font-serif sm:text-[2rem]">
                          {section.title}
                        </h2>
                        <p className="mt-3 text-base leading-7 text-muted">
                          {section.description}
                        </p>
                      </div>
                    </div>

                    <div className={cn(
                      'mt-6 grid gap-6',
                      supportingBlocks.length > 0 ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '',
                    )}>
                      <div className="min-w-0">
                        <p className="max-w-3xl text-xl leading-9 text-text-primary font-serif">
                          {narrative.lede}
                        </p>
                        <div className="mt-5 space-y-5 text-[15px] leading-[1.95] text-text-body font-serif">
                          {narrative.paragraphs.map(paragraph => (
                            <p key={paragraph} className="max-w-3xl">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>

                      {supportingBlocks.length > 0 && (
                        <aside className="min-w-0">
                          <div className="rounded-2xl border border-rule/60 bg-surface-active/45 p-4">
                            <BlockCanvas blocks={supportingBlocks} showExport={false} />
                          </div>
                        </aside>
                      )}
                    </div>

                    {paperCharts.length > 0 && (
                      <div className="mt-7 space-y-4">
                        {paperCharts.map(chartBlock => (
                          <PaperChartBlock
                            key={`${section.id}-${chartBlock.title}`}
                            block={chartBlock}
                            caption={narrative.figureCaption}
                          />
                        ))}
                      </div>
                    )}

                    {paperCharts.length === 0 && narrative.figureCaption && (
                      <p className="mt-6 rounded-2xl border border-rule/60 bg-surface-active/35 px-4 py-3 text-sm leading-6 text-muted">
                        {narrative.figureCaption}
                      </p>
                    )}
                  </section>
                )
              })}
            </div>

            <section
              id="appendices"
              className="mt-8 overflow-hidden rounded-[1.6rem] border border-rule/70 bg-white/96 px-6 py-7 shadow-[0_4px_18px_rgba(0,0,0,0.04)] sm:px-8"
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">Appendices</div>
              <h2 className="mt-2 text-2xl font-medium text-text-primary font-serif">Source appendices and extra figures</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {study.navigation.appendices.map(appendix => (
                  <a
                    key={appendix.id}
                    href={appendix.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl border border-rule/60 bg-surface-active/35 px-4 py-3 transition-colors hover:border-accent/20 hover:bg-accent/[0.04]"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                      <ExternalLink className="h-3.5 w-3.5 text-accent" />
                      {appendix.label}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted">{appendix.summary}</div>
                  </a>
                ))}
              </div>
            </section>

            <section
              id="references"
              className="mt-8 overflow-hidden rounded-[1.6rem] border border-rule/70 bg-white/96 px-6 py-7 shadow-[0_4px_18px_rgba(0,0,0,0.04)] sm:px-8"
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">References</div>
              <h2 className="mt-2 text-2xl font-medium text-text-primary font-serif">Source links and reproducibility</h2>
              <div className="mt-5 space-y-3">
                {uniqueReferences.map(reference => {
                  const quickResultsLink = reference.label === 'Public dashboard'
                    ? buildResultsUrl({
                        evaluation: 'Baseline',
                        paradigm: 'External',
                        result: 'cost_0.002',
                      })
                    : null

                  return (
                    <div key={`${reference.label}-${reference.url ?? ''}`} className="rounded-2xl border border-rule/60 bg-surface-active/35 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{reference.label}</span>
                        {reference.section && (
                          <span className="rounded-full border border-rule/60 bg-white/80 px-2 py-0.5 text-[11px] text-text-faint">
                            {reference.section}
                          </span>
                        )}
                      </div>
                      {reference.url && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a
                            href={reference.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open source
                          </a>
                          {quickResultsLink && (
                            <a
                              href={quickResultsLink}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open replay in Results
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </article>
        </div>
      </main>
    </div>
  )
}
