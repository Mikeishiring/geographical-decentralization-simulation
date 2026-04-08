import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText } from 'lucide-react'
import { PAPER_METADATA, type Author, type AuthorSocial } from '../../data/paper-sections'
import { CONTENT_MAX_WIDTH } from '../../lib/theme'
import { GlobeWireframe } from '../decorative/GlobeWireframe'

const SOCIAL_ICON_PATHS: Record<AuthorSocial['platform'], { label: string; path: string; viewBox?: string }> = {
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
  const icon = SOCIAL_ICON_PATHS[social.platform]
  return (
    <a
      href={social.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={icon.label}
      className="flex h-[24px] w-[24px] items-center justify-center rounded-md text-muted/50 transition-all duration-150 hover:bg-accent/8 hover:text-accent hover:scale-110 active:scale-95"
    >
      <svg viewBox={icon.viewBox ?? '0 0 24 24'} className="h-[11px] w-[11px] fill-current">
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

function AuthorChip({ author, index, total }: { readonly author: Author; readonly index: number; readonly total: number }) {
  const [hovered, setHovered] = useState(false)
  const chipRef = useRef<HTMLSpanElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)

  // Dismiss tooltip on any scroll
  useEffect(() => {
    if (!hovered) return
    const dismiss = () => setHovered(false)
    window.addEventListener('scroll', dismiss, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', dismiss, { capture: true })
  }, [hovered])

  // Compute fixed viewport position for tooltip to avoid clipping
  useEffect(() => {
    if (!hovered || !chipRef.current) {
      setTooltipPos(null)
      return
    }
    const rect = chipRef.current.getBoundingClientRect()
    const tooltipWidth = 260
    const isRightHalf = index >= total / 2

    // Horizontal: anchor left or right depending on position in row
    let left = isRightHalf
      ? rect.right - tooltipWidth
      : rect.left

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8))

    setTooltipPos({ top: rect.bottom + 8, left })
  }, [hovered, index, total])

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

  const handleMouseEnter = useCallback(() => setHovered(true), [])
  const handleMouseLeave = useCallback(() => setHovered(false), [])

  const hasTooltipContent = author.role || author.focus || (author.socials && author.socials.length > 0)

  return (
    <span
      ref={chipRef}
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {nameElement}

      <AnimatePresence>
        {hovered && hasTooltipContent && tooltipPos && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22, mass: 0.7 }}
            className="fixed z-50"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div
              className="rounded-2xl bg-white/[0.97] backdrop-blur-xl min-w-[200px] max-w-[260px]"
              style={{
                boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.04)',
              }}
            >
              {/* Author identity */}
              <div className="px-4 pt-3.5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold tracking-[-0.01em] text-text-primary">
                    {author.name}
                  </span>
                </div>
                {author.role && (
                  <div className="mt-0.5 text-[11px] font-medium text-accent">
                    {author.role}
                  </div>
                )}
                {author.focus && (
                  <div className="mt-1 text-[11px] leading-relaxed text-muted">
                    {author.focus}
                  </div>
                )}
              </div>

              {/* Social row + paper link */}
              {(author.socials?.length || author.url) && (
                <div className="flex items-center gap-1 border-t border-black/[0.06] px-3 py-2">
                  {author.socials?.map(social => (
                    <SocialIcon key={social.platform} social={social} />
                  ))}
                  {author.url && (
                    <>
                      {author.socials?.length ? (
                        <div className="mx-1 h-3.5 w-px bg-black/[0.08]" />
                      ) : null}
                      <a
                        href={author.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View in paper"
                        className="flex h-[22px] items-center gap-1 rounded-full px-1.5 text-muted/50 transition-colors duration-150 hover:bg-accent/8 hover:text-accent"
                      >
                        <FileText className="h-3 w-3" />
                        <span className="text-[10px] font-medium tracking-wide uppercase">Paper</span>
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

/** arXiv logo — stylized "χ" mark */
function ArxivIcon({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 3l8 10M12 3L4 13" />
    </svg>
  )
}

const ICON_LINK_CLASS = 'flex h-[30px] w-[30px] items-center justify-center rounded-full border border-rule text-muted transition-all duration-150 hover:border-accent/30 hover:text-accent hover:scale-110 active:scale-95'

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
          {/* Top row: edition label + icon-only external links */}
          <div className="flex flex-wrap items-start justify-between gap-2 sm:items-center">
            <p className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
              Interactive paper edition
            </p>
            <div className="flex items-center gap-1.5">
              <a href={HEADER_ARXIV_URL} target="_blank" rel="noopener noreferrer" aria-label="arXiv paper" className={ICON_LINK_CLASS}>
                <ArxivIcon className="h-3.5 w-3.5" />
              </a>
              <a href={HEADER_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" className={ICON_LINK_CLASS}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d={SOCIAL_ICON_PATHS.github.path} /></svg>
              </a>
              <a href="https://x.com/syang2ng" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" className={ICON_LINK_CLASS}>
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current"><path d={SOCIAL_ICON_PATHS.x.path} /></svg>
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
                <AuthorChip author={author} index={i} total={AUTHORS.length} />
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
