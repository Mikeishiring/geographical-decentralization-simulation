import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { PAPER_METADATA, type Author } from '../../data/paper-sections'

const HEADER_TITLE = 'Geographical Centralization Resilience in Ethereum Block Building'
import { SPRING_SNAPPY, contentMaxWidth } from '../../lib/theme'
import { GlobeWireframe } from '../decorative/GlobeWireframe'

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
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
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

interface HeaderProps {
  readonly activeTab?: string
}

export function Header({ activeTab = 'paper' }: HeaderProps) {
  return (
    <header className="relative overflow-hidden bg-white border-b border-rule stripe-top-accent">
      {/* Globe wireframe — decorative background, right side */}
      <div className="absolute inset-0 pointer-events-none">
        <GlobeWireframe />
      </div>

      {/* Soft gradient overlay — text legibility on the left */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 40%, rgba(255,255,255,0.3) 70%, transparent 100%)',
        }}
      />

      <div className={`relative ${contentMaxWidth(activeTab)} mx-auto px-4 sm:px-6 py-8 sm:py-10 transition-[max-width] duration-300`}>
        <div className="flex flex-col gap-3">
          {/* Top row: edition label + arXiv badge */}
          <div className="flex items-center justify-between">
            <p className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
              Interactive paper edition
            </p>
            <a
              href="https://arxiv.org/abs/2509.21475"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-accent/30 hover:text-accent"
            >
              <span className="font-mono tracking-tight">arXiv:2509.21475</span>
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          </div>

          {/* Title */}
          <h1 className="text-[clamp(1.25rem,1rem+0.5vw,1.75rem)] font-semibold text-text-primary leading-snug max-w-2xl font-serif">
            {HEADER_TITLE}
          </h1>

          {/* Authors row */}
          <div className="flex items-center gap-x-1.5 flex-wrap">
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
      </div>
    </header>
  )
}
