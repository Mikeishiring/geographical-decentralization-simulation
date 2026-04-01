import { motion } from 'framer-motion'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { PAPER_METADATA } from '../../data/paper-sections'
import { GlobeNetwork } from '../decorative/GlobeNetwork'

export function PaperHero() {
  return (
    <motion.section
      className="relative overflow-hidden rounded-xl border border-rule px-5 py-6 sm:px-8 sm:py-8"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 10% 30%, rgba(37,99,235,0.06), transparent 60%), radial-gradient(ellipse 60% 50% at 90% 70%, rgba(194,85,58,0.04), transparent 50%), white',
      }}
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
    >
      {/* Background globe motif */}
      <div className="absolute -right-6 -top-4 w-[180px] h-[180px] opacity-[0.18] pointer-events-none select-none sm:w-[220px] sm:h-[220px]" aria-hidden="true">
        <GlobeNetwork className="w-full h-full text-muted" />
      </div>

      <div className="relative max-w-4xl">
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

      </div>
    </motion.section>
  )
}
