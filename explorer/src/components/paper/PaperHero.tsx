import { motion } from 'framer-motion'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { getActiveStudy } from '../../studies'
import { GlobeNetwork } from '../decorative/GlobeNetwork'

export function PaperHero() {
  const study = getActiveStudy()

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
      <div className="absolute -right-6 -top-4 w-[180px] h-[180px] opacity-[0.22] pointer-events-none select-none sm:w-[220px] sm:h-[220px]" aria-hidden="true">
        <GlobeNetwork className="w-full h-full text-muted" />
      </div>

      <div className="relative max-w-5xl">
        <motion.p
          variants={STAGGER_ITEM}
          className="text-lg leading-relaxed text-text-primary/80 font-serif sm:text-xl text-balance"
        >
          {study.metadata.subtitle}
        </motion.p>

        {/* Key claims — the paper's central findings */}
        <motion.div variants={STAGGER_ITEM} className="mt-5 flex flex-wrap gap-2">
          {study.metadata.keyClaims.map(claim => (
            <span key={claim} className="rounded-lg border border-accent/12 bg-accent/[0.04] px-3 py-1.5 text-[13px] font-medium leading-snug text-text-primary">
              {claim}
            </span>
          ))}
        </motion.div>

      </div>
    </motion.section>
  )
}
