import { motion } from 'framer-motion'
import { BookOpen, GitBranch } from 'lucide-react'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'

export function Header() {
  return (
    <header className="border-b border-rule overflow-hidden relative">
      {/* Subtle geo accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 35%, #C2553A 65%, #D97706 100%)',
          opacity: 0.4,
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <motion.div
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
          className="flex items-start justify-between gap-4"
        >
          <motion.div variants={STAGGER_ITEM} className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-accent/60" />
              <h1 className="text-[0.9375rem] sm:text-base font-medium text-text-primary font-serif leading-tight tracking-[-0.005em]">
                Geographical Decentralization in Ethereum
              </h1>
            </div>
            <motion.p
              variants={STAGGER_ITEM}
              className="text-xs text-muted mt-1.5 ml-[18px]"
            >
              Yang, Oz, Wu, Zhang (2025)
              <span className="text-text-faint"> · </span>
              <span className="text-text-faint">arXiv:2509.21475</span>
            </motion.p>
          </motion.div>

          <motion.div variants={STAGGER_ITEM} className="flex items-center gap-2 shrink-0 pt-0.5">
            <a
              href="https://arxiv.org/abs/2509.21475"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white/80 px-2.5 py-1 text-[0.6875rem] text-muted transition-all hover:border-accent/25 hover:text-accent"
            >
              <BookOpen className="h-3 w-3" />
              <span className="hidden sm:inline">arXiv</span>
            </a>
            <a
              href="https://github.com/syang-ng/geographical-decentralization-simulation"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white/80 px-2.5 py-1 text-[0.6875rem] text-muted transition-all hover:border-accent/25 hover:text-accent"
            >
              <GitBranch className="h-3 w-3" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </motion.div>
        </motion.div>
      </div>
    </header>
  )
}
