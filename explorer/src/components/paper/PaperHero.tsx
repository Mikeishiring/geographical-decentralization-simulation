import { motion } from 'framer-motion'
import { SPRING_SOFT } from '../../lib/theme'
import { PAPER_METADATA } from '../../data/paper-sections'

export function PaperHero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="max-w-4xl reveal-up"
    >
      <h1 className="text-3xl font-medium leading-tight text-text-primary font-serif sm:text-4xl">
        {PAPER_METADATA.title}
      </h1>
      <p className="mt-1 text-sm text-muted">{PAPER_METADATA.subtitle}</p>
      <p className="mt-2 text-sm text-muted">{PAPER_METADATA.citation}</p>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted font-serif">
        {PAPER_METADATA.abstract}
      </p>
      <div className="mt-5 flex flex-wrap gap-2 stagger-reveal">
        {PAPER_METADATA.keyClaims.map(claim => (
          <span key={claim} className="lab-chip">
            {claim}
          </span>
        ))}
      </div>
    </motion.section>
  )
}
