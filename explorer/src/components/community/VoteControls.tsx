import { motion } from 'framer-motion'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '../../lib/cn'

export function VoteControls({
  votes,
  onVote,
}: {
  readonly votes: number
  readonly onVote: (delta: 1 | -1) => void
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <motion.button
        onClick={event => {
          event.stopPropagation()
          onVote(1)
        }}
        whileTap={{ scale: 0.88 }}
        className="flex items-center justify-center h-7 w-7 text-black/40 transition-colors hover:text-accent rounded-full hover:bg-accent/[0.06]"
        aria-label="Upvote"
      >
        <ThumbsUp className="h-3 w-3" />
      </motion.button>
      <span
        className={cn(
          'text-[11px] font-semibold tabular-nums',
          votes > 0 && 'text-accent',
          votes < 0 && 'text-danger',
          votes === 0 && 'text-black/30',
        )}
      >
        {votes}
      </span>
      <motion.button
        onClick={event => {
          event.stopPropagation()
          onVote(-1)
        }}
        whileTap={{ scale: 0.88 }}
        className="flex items-center justify-center h-7 w-7 text-black/40 transition-colors hover:text-danger rounded-full hover:bg-danger/[0.06]"
        aria-label="Downvote"
      >
        <ThumbsDown className="h-3 w-3" />
      </motion.button>
    </div>
  )
}

export function FollowUpList({
  followUps,
  onSelect,
}: {
  readonly followUps: readonly string[]
  readonly onSelect?: (query: string) => void
}) {
  return (
    <div className="mt-4 border-t border-black/[0.06] pt-3">
      <span className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-black/40">
        Follow-up questions
      </span>
      <div className="flex flex-wrap gap-1.5">
        {followUps.map(question => (
          <button
            key={question}
            onClick={() => onSelect?.(question)}
            disabled={!onSelect}
            className="follow-up-chip disabled:opacity-40 disabled:cursor-default"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
