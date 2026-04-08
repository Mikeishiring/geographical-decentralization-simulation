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
        <motion.div variants={STAGGER_ITEM}>
          <span className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">Abstract</span>
          <p className="mt-2 text-sm leading-relaxed text-text-primary/80 sm:text-[15px] sm:leading-relaxed">
            {study.metadata.abstract}
          </p>
        </motion.div>

        <motion.div variants={STAGGER_ITEM} className="mt-6 border-t border-rule/60 pt-5">
          <span className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">Two paradigms compared</span>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-indigo-400/20 bg-gradient-to-b from-indigo-400/[0.04] to-transparent p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <span className="text-xs font-semibold text-indigo-700">External block building</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-text-body">
                Proposers outsource block construction to specialized <strong>suppliers</strong> (PBS/ePBS).
                Centralization pressure is bounded by a single best supplier relationship.
              </p>
            </div>
            <div className="rounded-xl border border-orange-400/20 bg-gradient-to-b from-orange-400/[0.04] to-transparent p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                <span className="text-xs font-semibold text-orange-700">Local block building</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-text-body">
                Proposers self-construct blocks from distributed <strong>signal sources</strong>.
                Payoff scales linearly with source count, amplifying co-location incentives.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.section>
  )
}
