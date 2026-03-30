import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { SPRING } from '../../lib/theme'

interface WayfinderLink {
  readonly label: string
  readonly hint: string
  readonly onClick: () => void
}

interface WayfinderProps {
  readonly links: readonly WayfinderLink[]
}

export function Wayfinder({ links }: WayfinderProps) {
  if (links.length === 0) return null

  return (
    <div className="mt-10 border-t border-rule pt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-text-faint">
            Continue exploring
          </span>
          <div className="text-sm text-text-primary">
            The next best move should feel obvious from here.
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {links.map((link, index) => (
          <motion.button
            key={link.label}
            onClick={link.onClick}
            whileHover={{ y: -1 }}
            transition={SPRING}
            className="group flex items-start gap-3 rounded-xl border border-border-subtle bg-white px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle text-[11px] text-text-faint">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-text-primary">
                {link.label}
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-muted">
                {link.hint}
              </span>
            </div>
            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-faint transition-colors group-hover:text-accent" />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
