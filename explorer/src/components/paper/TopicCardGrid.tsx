import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'
import { TOPIC_CARDS, type TopicCard } from '../../data/default-blocks'

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
  return (
    <div className="mb-6 rounded-xl border border-rule bg-white px-5 py-5 geo-accent-bar">
      <div className="mb-3 flex items-center justify-between">
        <div className="lab-section-title">
          {activeTopic || showingAi ? 'Paper topics' : 'Key findings'}
        </div>
        {(activeTopic || showingAi) && (
          <button
            onClick={onBackToOverview}
            className="flex items-center gap-1 text-xs text-muted hover:text-text-primary transition-colors"
          >
            ← Back to overview
          </button>
        )}
      </div>

      <div className="stagger-reveal grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Topic cards">
        {TOPIC_CARDS.map(card => {
          const isActive = activeTopic?.id === card.id && !showingAi
          const isDimmed = (activeTopic !== null || showingAi) && !isActive

          return (
            <motion.button
              key={card.id}
              onClick={() => onTopicClick(card)}
              whileTap={{ scale: 0.985 }}
              transition={SPRING}
              aria-label={card.title}
              aria-pressed={isActive}
              className={cn(
                'text-left rounded-lg border p-4 transition-colors group card-hover',
                isActive
                  ? 'border-accent bg-white'
                  : isDimmed
                    ? 'border-rule bg-surface-active opacity-40'
                    : 'border-rule bg-surface-active hover:border-border-hover',
              )}
            >
              <h4 className="text-xs font-medium text-text-primary leading-snug mb-1 line-clamp-2">
                {card.title}
              </h4>
              <p className="text-xs text-muted leading-relaxed line-clamp-2 mb-2">
                {card.description}
              </p>
              <span className={cn(
                'text-11',
                isActive ? 'text-accent' : 'text-text-faint',
              )}>
                {isActive ? 'Viewing' : 'Explore →'}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
