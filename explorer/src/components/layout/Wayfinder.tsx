import { motion } from 'framer-motion'
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
    <div className="mt-12 border-t border-rule pt-6">
      <span className="mb-4 block text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-text-faint">
        Continue exploring
      </span>
      <div className="divide-y divide-rule">
        {links.map((link) => (
          <motion.button
            key={link.label}
            onClick={link.onClick}
            whileHover={{ x: 2 }}
            transition={SPRING}
            className="group flex w-full items-baseline justify-between gap-4 py-3 text-left"
          >
            <div className="min-w-0">
              <span className="text-[0.8125rem] font-medium text-text-primary group-hover:text-accent transition-colors">
                {link.label}
              </span>
              <span className="mt-0.5 block text-[0.75rem] leading-5 text-muted">
                {link.hint}
              </span>
            </div>
            <span className="shrink-0 text-sm text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">
              →
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
