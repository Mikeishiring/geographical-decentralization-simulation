import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'
import type { ComparisonBlock as ComparisonBlockType } from '../../types/blocks'

interface ComparisonBlockProps {
  block: ComparisonBlockType
}

export function ComparisonBlock({ block }: ComparisonBlockProps) {
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null)

  if (block.left.items.length === 0 && block.right.items.length === 0) {
    return (
      <div className="bg-white border border-rule rounded-xl p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4 font-serif">{block.title}</h3>
        <div className="text-center text-xs text-muted py-4">No comparison data available</div>
      </div>
    )
  }

  return (
    <motion.div
      className="bg-white border border-rule rounded-xl p-5 topo-bg"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <h3 className="text-base font-semibold text-text-primary mb-4 font-serif">
        {block.title}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:divide-x sm:divide-rule">
        {/* Left column */}
        <div
          onMouseEnter={() => setHoveredSide('left')}
          onMouseLeave={() => setHoveredSide(null)}
          className={cn(
            'pb-4 sm:pb-0 sm:pr-5 border-b sm:border-b-0 border-rule rounded-md transition-colors',
            hoveredSide === 'left' && 'bg-accent/[0.03]',
            hoveredSide === 'right' && 'opacity-60',
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary mb-3">
            <span className={cn(
              'w-2.5 h-2.5 rounded-full bg-accent transition-shadow',
              hoveredSide === 'left' && 'shadow-[0_0_6px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]',
            )} />
            {block.left.label}
          </div>
          <div className="space-y-2.5">
            {block.left.items.map(item => (
              <div key={item.key} className="flex justify-between gap-2">
                <span className="text-xs text-muted">{item.key}</span>
                <span className="text-sm text-text-primary font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div
          onMouseEnter={() => setHoveredSide('right')}
          onMouseLeave={() => setHoveredSide(null)}
          className={cn(
            'pt-4 sm:pt-0 sm:pl-5 rounded-md transition-colors',
            hoveredSide === 'right' && 'bg-accent-warm/[0.03]',
            hoveredSide === 'left' && 'opacity-60',
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary mb-3">
            <span className={cn(
              'w-2.5 h-2.5 rounded-full bg-accent-warm transition-shadow',
              hoveredSide === 'right' && 'shadow-[0_0_6px_color-mix(in_srgb,var(--color-accent-warm)_30%,transparent)]',
            )} />
            {block.right.label}
          </div>
          <div className="space-y-2.5">
            {block.right.items.map(item => (
              <div key={item.key} className="flex justify-between gap-2">
                <span className="text-xs text-muted">{item.key}</span>
                <span className="text-sm text-text-primary font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {block.verdict && (
        <p className="text-sm text-muted italic mt-5 pt-4 border-t border-rule font-serif">
          {block.verdict}
        </p>
      )}
    </motion.div>
  )
}
