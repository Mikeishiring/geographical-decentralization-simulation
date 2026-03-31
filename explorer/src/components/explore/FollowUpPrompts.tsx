import { motion } from 'framer-motion'
import { SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'

interface FollowUpPromptsProps {
  readonly prompts: readonly string[]
  readonly title: string
  readonly onSelect: (query: string) => void
}

export function FollowUpPrompts({ prompts, title, onSelect }: FollowUpPromptsProps) {
  if (prompts.length === 0) return null

  return (
    <motion.div
      className="mt-6 pt-4 border-t border-rule"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <span className="text-xs text-muted mb-2 block">{title}</span>
      <motion.div
        className="flex flex-wrap gap-2"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="show"
      >
        {prompts.map((query, index) => (
          <motion.button
            key={`${query}-${index}`}
            variants={STAGGER_ITEM}
            onClick={() => onSelect(query)}
            className="follow-up-chip"
            title={`Ask: ${query}`}
          >
            {query}
            <span aria-hidden="true" className="follow-up-chip-arrow">→</span>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  )
}
