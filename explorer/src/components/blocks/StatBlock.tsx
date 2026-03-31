import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { CHART, SPRING_CRISP } from '../../lib/theme'
import type { StatBlock as StatBlockType } from '../../types/blocks'

interface StatBlockProps {
  block: StatBlockType
}

export function StatBlock({ block }: StatBlockProps) {
  const isPositive = block.sentiment === 'positive'
  const isNegative = block.sentiment === 'negative'

  return (
    <motion.div
      className="bg-white border border-rule rounded-xl p-5 topo-bg relative overflow-hidden group geo-accent-bar card-hover"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_CRISP}
    >
      {/* Faint coordinate corner — reveals on hover */}
      <span aria-hidden="true" className="coord-label absolute top-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        §
      </span>

      {/* Momentum-driven accent glow — subtle background pulse for positive/negative */}
      {block.sentiment && block.sentiment !== 'neutral' && (
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at 50% 80%, ${
              isPositive ? CHART.momentumUp : CHART.momentumDown
            }08, transparent 70%)`,
          }}
        />
      )}

      <motion.div
        className="text-[1.75rem] font-semibold tabular-nums tracking-[-0.02em] text-text-primary leading-none"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_CRISP, delay: 0.08 }}
      >
        {block.value}
      </motion.div>
      {block.sentiment && <span className="sr-only">({block.sentiment})</span>}
      <motion.div
        className="text-13 font-medium text-text-primary mt-2.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.12 }}
      >
        {block.label}
      </motion.div>
      {block.sublabel && (
        <motion.div
          className="text-xs text-muted mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.16 }}
        >
          {block.sublabel}
        </motion.div>
      )}
      {block.delta && (
        <motion.div
          className={cn(
            'inline-flex items-center gap-1.5 mt-3 text-xs font-medium',
            isPositive && 'text-success',
            isNegative && 'text-danger',
            (!block.sentiment || block.sentiment === 'neutral') && 'text-muted',
          )}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING_CRISP, delay: 0.2 }}
        >
          {/* Momentum dot with pulse */}
          <span className={cn(
            'relative w-1.5 h-1.5 rounded-full',
            isPositive && 'bg-success',
            isNegative && 'bg-danger',
            (!block.sentiment || block.sentiment === 'neutral') && 'bg-muted',
          )}>
            {(isPositive || isNegative) && (
              <span
                className={cn(
                  'absolute inset-0 rounded-full dot-pulse',
                  isPositive && 'text-success',
                  isNegative && 'text-danger',
                )}
              />
            )}
          </span>

          {/* Direction chevron — liveline-style momentum arrow */}
          {isPositive && <span className="text-[0.625rem]">&#9650;</span>}
          {isNegative && <span className="text-[0.625rem]">&#9660;</span>}

          {block.delta}
        </motion.div>
      )}
    </motion.div>
  )
}
