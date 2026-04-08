import { motion } from 'framer-motion'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'

export function ParadigmPrimer() {
  return (
    <motion.section
      className="mt-8 rounded-xl border border-rule bg-white px-5 py-6 sm:px-8 sm:py-8"
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={STAGGER_ITEM}>
        <span className="text-2xs font-medium uppercase tracking-[0.14em] text-text-faint">
          Background
        </span>
        <h2 className="mt-2 text-base font-semibold text-text-primary sm:text-lg">
          Why geography matters in Ethereum
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-text-primary/80 sm:text-[15px] sm:leading-relaxed">
          Ethereum validators earn rewards by proposing blocks and attesting to others&rsquo; blocks.
          Both activities are latency-sensitive: being closer to key infrastructure means seeing information sooner,
          building more valuable blocks, and landing attestations on time.
          This creates economic pressure for validators to cluster in the same data-center regions &mdash;
          undermining the geographic decentralization that makes the network resilient.
        </p>
      </motion.div>

      <motion.div variants={STAGGER_ITEM} className="mt-6">
        <h3 className="text-sm font-semibold text-text-primary">
          Two paradigms, two pressure shapes
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-primary/80">
          The paper compares how two block-building paradigms create different geographic incentives:
        </p>
      </motion.div>

      <motion.div variants={STAGGER_ITEM} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* External */}
        <div className="rounded-xl border border-accent/20 bg-gradient-to-b from-accent/[0.04] to-white p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-xs font-semibold text-accent">External block building</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-body">
            Proposers outsource block construction to specialized <strong>suppliers</strong> (PBS/ePBS).
            The latency-critical path goes proposer &rarr; supplier &rarr; attesters &mdash; two hops.
            Centralization pressure is bounded by a single best supplier relationship.
          </p>
        </div>

        {/* Local */}
        <div className="rounded-xl border border-accent-warm/20 bg-gradient-to-b from-accent-warm/[0.04] to-white p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent-warm" />
            <span className="text-xs font-semibold text-accent-warm">Local block building</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-body">
            Proposers self-construct blocks from distributed <strong>signal sources</strong>.
            The path is direct: sources &rarr; proposer &rarr; attesters &mdash; one hop.
            But payoff scales linearly with source count, amplifying co-location incentives.
          </p>
        </div>
      </motion.div>

      <motion.div variants={STAGGER_ITEM} className="mt-5">
        <p className="text-[13px] leading-relaxed text-muted">
          The sections below walk through the paper&rsquo;s system model, formal results,
          and simulation experiments that measure how strongly each paradigm pushes validators
          toward geographic concentration under different conditions.
        </p>
      </motion.div>
    </motion.section>
  )
}
