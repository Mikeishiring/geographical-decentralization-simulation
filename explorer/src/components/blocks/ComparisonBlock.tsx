import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'
import type { ComparisonBlock as ComparisonBlockType } from '../../types/blocks'
import { BlockEmptyState } from './BlockEmptyState'
import { CiteBadge } from './CiteBadge'
import { InteractiveInspector } from '../ui/InteractiveInspector'

interface ComparisonBlockProps {
  block: ComparisonBlockType
}

function parseComparableNumber(raw: string): number | null {
  const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number.parseFloat(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function detectComparableUnit(raw: string): string {
  if (raw.includes('%')) return '%'
  if (raw.toLowerCase().includes('eth')) return ' ETH'
  if (raw.toLowerCase().includes('ms')) return ' ms'
  return ''
}

function formatComparableDelta(leftValue: string, rightValue: string): string {
  const leftNumber = parseComparableNumber(leftValue)
  const rightNumber = parseComparableNumber(rightValue)
  if (leftNumber == null || rightNumber == null) return 'Not directly numeric'
  const delta = leftNumber - rightNumber
  const unit = detectComparableUnit(leftValue) || detectComparableUnit(rightValue)
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${delta.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(delta) >= 10 ? 1 : 3,
  })}${unit}`
}

export function ComparisonBlock({ block }: ComparisonBlockProps) {
  const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null)
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null)

  if (block.left.items.length === 0 && block.right.items.length === 0) {
    return <BlockEmptyState title={block.title} message="Both sides of this comparison are empty in the current payload." />
  }

  const leftMap = new Map(block.left.items.map(item => [item.key, item] as const))
  const rightMap = new Map(block.right.items.map(item => [item.key, item] as const))
  const inspectedLeftItem = hoveredItemKey ? leftMap.get(hoveredItemKey) ?? null : null
  const inspectedRightItem = hoveredItemKey ? rightMap.get(hoveredItemKey) ?? null : null
  const comparisonWinner = inspectedLeftItem && inspectedRightItem
    ? (() => {
        const leftNumber = parseComparableNumber(inspectedLeftItem.value)
        const rightNumber = parseComparableNumber(inspectedRightItem.value)
        if (leftNumber == null || rightNumber == null || leftNumber === rightNumber) return 'Tie'
        return leftNumber > rightNumber ? block.left.label : block.right.label
      })()
    : null

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

      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:divide-x sm:divide-rule"
        onMouseLeave={() => { setHoveredSide(null); setHoveredItemKey(null) }}
      >
        {/* Left column */}
        <div
          onMouseEnter={() => setHoveredSide('left')}
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
              <div
                key={item.key}
                onMouseEnter={() => {
                  setHoveredSide('left')
                  setHoveredItemKey(item.key)
                }}
                className={cn(
                  'flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors',
                  hoveredItemKey === item.key && 'bg-accent/[0.05]',
                )}
              >
                <span className="text-xs text-muted">{item.key}</span>
                <span className="text-sm text-text-primary font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div
          onMouseEnter={() => setHoveredSide('right')}
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
              <div
                key={item.key}
                onMouseEnter={() => {
                  setHoveredSide('right')
                  setHoveredItemKey(item.key)
                }}
                className={cn(
                  'flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors',
                  hoveredItemKey === item.key && 'bg-accent-warm/[0.05]',
                )}
              >
                <span className="text-xs text-muted">{item.key}</span>
                <span className="text-sm text-text-primary font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hoveredItemKey && inspectedLeftItem && inspectedRightItem ? (
          <InteractiveInspector
            eyebrow="Metric comparison"
            title={hoveredItemKey}
            subtitle={`${block.left.label} versus ${block.right.label} on the same metric.`}
            hint={comparisonWinner === 'Tie' ? 'Tie' : `Lead: ${comparisonWinner}`}
            metrics={[
              {
                label: block.left.label,
                value: inspectedLeftItem.value,
                tone: hoveredSide === 'left' ? 'accent' : 'default',
              },
              {
                label: block.right.label,
                value: inspectedRightItem.value,
                tone: hoveredSide === 'right' ? 'accent' : 'default',
              },
              {
                label: `${block.left.label} - ${block.right.label}`,
                value: formatComparableDelta(inspectedLeftItem.value, inspectedRightItem.value),
              },
            ]}
            className="mt-4"
          />
        ) : hoveredSide ? (
          <motion.div
            key={`comparison-hint-${hoveredSide}`}
            className="mt-4 text-xs text-muted"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={SPRING_CRISP}
          >
            Hover a metric row to inspect the gap between {block.left.label} and {block.right.label}.
          </motion.div>
        ) : null}
      </AnimatePresence>

      {block.verdict && (
        <p className="text-sm text-muted italic mt-5 pt-4 border-t border-rule font-serif">
          {block.verdict}
        </p>
      )}
      {block.cite && (
        <div className={cn('mt-3 pt-2 border-t border-rule/50', !block.verdict && 'mt-5')}>
          <CiteBadge cite={block.cite} />
        </div>
      )}
    </motion.div>
  )
}
