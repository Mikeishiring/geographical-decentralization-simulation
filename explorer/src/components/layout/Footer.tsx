import { motion } from 'framer-motion'
import { SPRING } from '../../lib/theme'
import { GlobeNetwork } from '../decorative/GlobeNetwork'

const FOOTER_LINKS = [
  { label: 'Read the paper', href: 'https://arxiv.org/abs/2509.21475' },
  { label: 'View source', href: 'https://github.com/Mikeishiring/geographical-decentralization-simulation' },
  { label: 'Published demo', href: 'https://geo-decentralization.github.io/' },
] as const

export function Footer() {
  return (
    <motion.footer
      className="mt-16 relative overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={SPRING}
    >
      <div className="section-divider" />

      {/* Bookend globe — bottom hemisphere, mirroring the header's top hemisphere */}
      <div
        className="absolute right-8 -bottom-12 w-[180px] h-[180px] sm:w-[220px] sm:h-[220px] opacity-[0.35] pointer-events-none select-none"
        aria-hidden="true"
      >
        <GlobeNetwork className="w-full h-full text-muted" flip />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-5">
          {/* Arrow links — Stripe-style lightweight CTAs */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="arrow-link"
              >
                {label}
              </a>
            ))}
          </div>

          {/* Attribution + coordinate */}
          <div className="flex items-center gap-3">
            <p className="text-11 text-text-faint">
              Yang, Oz, Wu, Zhang (2025) · arXiv:2509.21475 · MIT License
            </p>
            <span className="hidden sm:inline mono-xs text-meridian" aria-hidden="true">
              50.1°N 8.7°E
            </span>
          </div>
        </div>
      </div>
    </motion.footer>
  )
}
