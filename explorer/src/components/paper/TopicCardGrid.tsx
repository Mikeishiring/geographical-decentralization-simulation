import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { TOPIC_CARDS, type TopicCard } from '../../data/default-blocks'

const INITIAL_VISIBLE = 4

interface TopicCardGridProps {
  readonly activeTopic: TopicCard | null
  readonly showingAi: boolean
  readonly onTopicClick: (card: TopicCard) => void
  readonly onBackToOverview: () => void
}

export function TopicCardGrid({
  activeTopic,
  showingAi,
  onTopicClick,
  onBackToOverview,
}: TopicCardGridProps) {
  const [expanded, setExpanded] = useState(false)
  const visibleCards = expanded ? TOPIC_CARDS : TOPIC_CARDS.slice(0, INITIAL_VISIBLE)
  const hasMore = TOPIC_CARDS.length > INITIAL_VISIBLE

  return (
    <motion.div
      className="rounded-xl border border-rule bg-white px-4 py-4 geo-accent-bar"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={SPRING}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="lab-section-title">
          {activeTopic || showingAi ? 'Paper topics' : 'Explore by topic'}
        </div>
        <div className="flex items-center gap-3">
          {(activeTopic || showingAi) && (
            <button
              onClick={onBackToOverview}
              className="text-xs text-muted hover:text-text-primary transition-colors"
            >
              ← Back
            </button>
          )}
          {hasMore && !activeTopic && !showingAi && (
            <button
              onClick={() => setExpanded(prev => !prev)}
              className="text-xs text-muted hover:text-accent transition-colors"
            >
              {expanded ? 'Show less' : `+${TOPIC_CARDS.length - INITIAL_VISIBLE} more`}
            </button>
          )}
        </div>
      </div>

      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        role="group"
        aria-label="Topic cards"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {visibleCards.map(card => {
          const isActive = activeTopic?.id === card.id && !showingAi
          const isDimmed = (activeTopic !== null || showingAi) && !isActive

          return (
            <motion.button
              key={card.id}
              variants={STAGGER_ITEM}
              onClick={() => onTopicClick(card)}
              whileTap={{ scale: 0.985 }}
              transition={SPRING_CRISP}
              aria-label={card.title}
              aria-pressed={isActive}
              className={cn(
                'text-left rounded-lg border px-3 py-2.5 transition-colors group card-hover',
                isActive
                  ? 'border-accent bg-white'
                  : isDimmed
                    ? 'border-rule bg-surface-active opacity-40'
                    : 'border-rule bg-surface-active hover:border-border-hover',
              )}
            >
              <h4 className="text-xs font-medium text-text-primary leading-snug line-clamp-2">
                {card.title}
              </h4>
              <span className={cn(
                'mt-1 block text-11',
                isActive ? 'text-accent' : 'text-text-faint',
              )}>
                {isActive ? 'Viewing' : 'Explore →'}
              </span>
            </motion.button>
          )
        })}
      </motion.div>
    </motion.div>
  )
}
