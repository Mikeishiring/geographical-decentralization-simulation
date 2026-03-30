import { motion } from 'framer-motion'
import { BookOpen, GitBranch } from 'lucide-react'
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'

export function Header() {
  return (
    <header className="border-b border-border-subtle overflow-hidden relative">
      {/* Subtle geo accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
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
              <div className="relative">
                <div className="w-2 h-2 shrink-0 rounded-full bg-accent" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-accent animate-ping opacity-30" />
              </div>
              <h1 className="text-base sm:text-lg font-semibold text-text-primary font-serif leading-tight tracking-[-0.01em]">
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
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs text-muted transition-all hover:border-accent/30 hover:text-accent hover:shadow-sm"
            >
              <BookOpen className="h-3 w-3" />
              <span className="hidden sm:inline">arXiv</span>
            </a>
            <a
              href="https://github.com/syang-ng/geographical-decentralization-simulation"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs text-muted transition-all hover:border-accent/30 hover:text-accent hover:shadow-sm"
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
