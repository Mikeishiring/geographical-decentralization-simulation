import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Code, ExternalLink } from 'lucide-react'
import { PAPER_METADATA, type Author, type AuthorSocial } from '../../data/paper-sections'
import { CONTENT_MAX_WIDTH, SPRING_SNAPPY } from '../../lib/theme'
import { GlobeWireframe } from '../decorative/GlobeWireframe'

const SOCIAL_ICONS: Record<AuthorSocial['platform'], { label: string; path: string; viewBox?: string }> = {
  x: {
    label: 'X / Twitter',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  github: {
    label: 'GitHub',
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  scholar: {
    label: 'Google Scholar',
    path: 'M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
  },
}

function SocialIcon({ social }: { readonly social: AuthorSocial }) {
  const icon = SOCIAL_ICONS[social.platform]
  return (
    <a
      href={social.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={icon.label}
      className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-muted/60 transition-colors duration-150 hover:bg-accent/8 hover:text-accent"
    >
      <svg viewBox={icon.viewBox ?? '0 0 24 24'} className="h-3 w-3 fill-current">
        <path d={icon.path} />
      </svg>
    </a>
  )
}

const HEADER_TITLE = PAPER_METADATA.title
const AUTHORS = PAPER_METADATA.authors
const HEADER_ARXIV_URL =
  PAPER_METADATA.references.find((reference) => reference.label === 'arXiv paper')?.url
  ?? 'https://arxiv.org/abs/2509.21475'
const HEADER_REPOSITORY_URL =
  PAPER_METADATA.references.find((reference) => reference.label === 'Simulation repository')?.url
  ?? 'https://github.com/syang-ng/geographical-decentralization-simulation'

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
        {hovered && (author.role || author.focus || author.socials?.length) && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={SPRING_SNAPPY}
            className="absolute left-0 top-full mt-2 z-40"
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
              {author.socials && author.socials.length > 0 && (
                <div className="mt-2 flex items-center gap-0.5 border-t border-rule/50 pt-2">
                  {author.socials.map(social => (
                    <SocialIcon key={social.platform} social={social} />
                  ))}
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
    <header className="relative bg-white border-b border-rule stripe-top-accent">
      {/* Globe wireframe — decorative background, right side */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.52] sm:opacity-100">
        <GlobeWireframe className="origin-top-right scale-[0.8] translate-x-[12%] -translate-y-[3%] sm:scale-100 sm:translate-x-0 sm:translate-y-0" />
      </div>

      {/* Soft gradient overlay — text legibility on the left */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.87) 46%, rgba(255,255,255,0.34) 74%, transparent 100%)',
        }}
      />

      <div className={`relative ${CONTENT_MAX_WIDTH} mx-auto px-4 py-6 sm:px-6 sm:py-10`}>
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Top row: edition label + arXiv badge */}
          <div className="flex flex-wrap items-start justify-between gap-2 sm:items-center">
            <p className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
              Interactive paper edition
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={HEADER_ARXIV_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-accent/30 hover:text-accent active:scale-[0.95] transition-transform duration-100"
              >
                <span className="font-mono tracking-tight">arXiv:2509.21475</span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
              <a
                href={HEADER_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-accent/30 hover:text-accent active:scale-[0.95] transition-transform duration-100"
              >
                <Code className="h-3 w-3 opacity-60" />
                <span className="font-mono tracking-tight">Repository</span>
              </a>
            </div>
          </div>

          {/* Title */}
          <h1 className="max-w-3xl font-serif text-[clamp(1.15rem,4.7vw,1.75rem)] font-semibold leading-snug text-text-primary sm:text-[clamp(1.25rem,1rem+0.5vw,1.75rem)]">
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
