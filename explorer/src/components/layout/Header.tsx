import { GlobeWireframe } from '../decorative/GlobeWireframe'
import { PAPER_METADATA } from '../../data/paper-sections'

const AUTHORS = PAPER_METADATA.authors

export function Header() {
  return (
    <header className="border-b border-rule relative overflow-hidden stripe-top-accent">
      {/* Half-globe: canvas is taller than header, clipped by overflow-hidden.
          The globe's center sits at cy=92% of canvas height, so we see the top cap. */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        style={{ height: '220%', top: '-10%' }}
        aria-hidden="true"
      >
        <GlobeWireframe className="w-full h-full opacity-95" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="min-w-0 max-w-xl">
            {/* Eyebrow */}
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Interactive paper edition
            </p>

            {/* Title */}
            <h1 className="mt-2 text-lg sm:text-xl font-semibold text-text-primary leading-snug tracking-[-0.015em]">
              Geographical Decentralization in Ethereum Block Building
            </h1>

            {/* Subtitle */}
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted max-w-lg">
              How validator geography and paradigm choice shape centralization pressure under SSP and MSP.
            </p>

            {/* Authors with links + arXiv badge */}
            <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {AUTHORS.map((author, i) => (
                <span key={author.name} className="inline-flex items-center">
                  {author.url ? (
                    <a
                      href={author.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.75rem] text-text-faint underline decoration-rule underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/40"
                      title={author.role ?? author.name}
                    >
                      {author.name}
                    </a>
                  ) : (
                    <span
                      className="text-[0.75rem] text-text-faint"
                      title={author.role ?? undefined}
                    >
                      {author.name}
                    </span>
                  )}
                  {i < AUTHORS.length - 1 && (
                    <span className="text-rule ml-1.5">·</span>
                  )}
                </span>
              ))}
              <span className="text-rule">·</span>
              <span className="text-[0.6875rem] text-text-faint">2025</span>
            </div>

            {/* Arrow links — Stripe-style lightweight CTAs */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <a
                href="https://arxiv.org/abs/2509.21475"
                target="_blank"
                rel="noopener noreferrer"
                className="arrow-link"
              >
                Read the paper
              </a>
              <a
                href="https://github.com/syang-ng/geographical-decentralization-simulation"
                target="_blank"
                rel="noopener noreferrer"
                className="arrow-link"
              >
                View source
              </a>
            </div>
          </div>

          {/* Coordinate label — decorative geographic anchor */}
          <div className="hidden sm:flex flex-col items-end gap-1.5 pt-2 shrink-0">
            <span className="mono-xs text-meridian" aria-hidden="true">
              50.1°N 8.7°E
            </span>
            <span className="mono-xs text-meridian" aria-hidden="true">
              arXiv:2509.21475
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
