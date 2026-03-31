import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
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
      className="text-2xs text-text-faint underline decoration-rule underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/40"
    >
      {author.name}
    </a>
  ) : (
    <span className="text-2xs text-text-faint">
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
                <span className="text-13 font-medium text-text-primary">
                  {author.name}
                </span>
                {author.url && (
                  <ExternalLink className="h-3 w-3 text-muted/50 shrink-0" />
                )}
              </div>
              {author.role && (
                <div className="mt-1 text-11 text-accent font-medium">
                  {author.role}
                </div>
              )}
              {author.focus && (
                <div className="mt-1 text-11 leading-relaxed text-muted">
                  {author.focus}
                </div>
              )}
              {author.url && (
                <div className="mt-1.5 text-2xs text-text-faint">
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
    <header className="border-b border-rule bg-white stripe-top-accent">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: edition badge + authors */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="shrink-0">
              <p className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
                Interactive paper edition
              </p>
              <p className="mt-0.5 text-13 font-semibold text-text-primary leading-snug truncate">
                Geographical Decentralization in Ethereum Block Building
              </p>
            </div>

            {/* Authors — hidden on mobile */}
            <div className="hidden lg:flex items-center gap-x-1.5 shrink-0">
              {AUTHORS.map((author, i) => (
                <span key={author.name} className="inline-flex items-center">
                  <AuthorChip author={author} />
                  {i < AUTHORS.length - 1 && (
                    <span className="text-rule ml-1.5">·</span>
                  )}
                </span>
              ))}
              <span className="text-rule">·</span>
              <span className="text-2xs text-text-faint">2025</span>
            </div>
          </div>

          {/* Right: links + coordinate */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-x-4">
              <a
                href="https://arxiv.org/abs/2509.21475"
                target="_blank"
                rel="noopener noreferrer"
                className="arrow-link text-xs"
              >
                Read the paper
              </a>
              <a
                href="https://github.com/syang-ng/geographical-decentralization-simulation"
                target="_blank"
                rel="noopener noreferrer"
                className="arrow-link text-xs"
              >
                View source
              </a>
            </div>
            <span className="hidden md:inline mono-xs text-meridian" aria-hidden="true">
              arXiv:2509.21475
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
