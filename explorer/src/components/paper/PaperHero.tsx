import { motion } from 'framer-motion'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../../data/paper-sections'
import { BEST_FIRST_STOP_IDS } from './paper-helpers'

const bestStops = PAPER_SECTIONS.filter(section =>
  BEST_FIRST_STOP_IDS.includes(section.id as (typeof BEST_FIRST_STOP_IDS)[number]),
)

interface PaperHeroProps {
  readonly onSectionClick?: (id: string) => void
}

export function PaperHero({ onSectionClick }: PaperHeroProps) {
  return (
    <motion.section
      className="max-w-4xl"
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="show"
    >
      <motion.h1
        variants={STAGGER_ITEM}
        className="text-2xl font-medium leading-snug text-text-primary font-serif sm:text-3xl text-balance"
      >
        {PAPER_METADATA.title}
      </motion.h1>
      <motion.p variants={STAGGER_ITEM} className="mt-1.5 text-sm text-muted">{PAPER_METADATA.citation}</motion.p>

      {/* Key claims as inline chips */}
      <motion.div variants={STAGGER_ITEM} className="mt-3 flex flex-wrap gap-1.5">
        {PAPER_METADATA.keyClaims.map(claim => (
          <span key={claim} className="lab-chip">
            {claim}
          </span>
        ))}
      </motion.div>

      {/* Best first stops — inline links */}
      {onSectionClick && (
        <motion.div variants={STAGGER_ITEM} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Start here</span>
          {bestStops.map((section, i) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() => onSectionClick(section.id)}
              className="text-xs text-muted hover:text-accent transition-colors"
            >
              <span className="text-accent mr-0.5">{i + 1}.</span>
              {section.title}
            </a>
          ))}
        </motion.div>
      )}
    </motion.section>
  )
}
