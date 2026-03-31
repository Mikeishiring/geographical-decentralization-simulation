import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { GlobeWireframe } from '../decorative/GlobeWireframe'
import { PAPER_METADATA, type Author } from '../../data/paper-sections'
import { SPRING_SNAPPY } from '../../lib/theme'

const AUTHORS = PAPER_METADATA.authors

function AuthorChip({ author }: { readonly author: Author }) {
  const [hovered, setHovered] = useState(false)

  const nameElement = author.url ? (
    <a
      href={author.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[0.75rem] text-text-faint underline decoration-rule underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/40"
    >
      {author.name}
    </a>
  ) : (
    <span className="text-[0.75rem] text-text-faint">
      {author.name}
    </span>
  )

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {nameElement}

      <AnimatePresence>
        {hovered && (author.role || author.focus) && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={SPRING_SNAPPY}
            className="absolute left-0 top-full mt-2 z-40 pointer-events-none"
          >
            <div className="rounded-xl border border-rule bg-white/95 backdrop-blur-md shadow-lg px-3.5 py-2.5 min-w-[180px] max-w-[260px]">
              <div className="flex items-center gap-2">
                <span className="text-[0.8125rem] font-medium text-text-primary">
                  {author.name}
                </span>
                {author.url && (
                  <ExternalLink className="h-3 w-3 text-muted/50 shrink-0" />
                )}
              </div>
              {author.role && (
                <div className="mt-1 text-[0.6875rem] text-accent font-medium">
                  {author.role}
                </div>
              )}
              {author.focus && (
                <div className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
                  {author.focus}
                </div>
              )}
              {author.url && (
                <div className="mt-1.5 text-[0.625rem] text-text-faint">
                  Google Scholar profile
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

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
            <h1 className="mt-2 text-lg sm:text-xl font-semibold text-text-primary leading-snug tracking-[-0.015em] text-balance">
              Geographical Decentralization in Ethereum Block Building
            </h1>

            {/* Subtitle */}
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted max-w-lg">
              How validator geography and paradigm choice shape centralization pressure under SSP and MSP.
            </p>

            {/* Authors with hover pills + year */}
            <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {AUTHORS.map((author, i) => (
                <span key={author.name} className="inline-flex items-center">
                  <AuthorChip author={author} />
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
