import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { SPRING, SHIMMER_COLOR } from '../../lib/theme'
import { breathingSineWave, breathingAlpha } from '../../lib/chart-animations'

/** Breathing chart skeleton — a living sine wave that indicates "chart incoming" */
function BreathingChartSkeleton() {
  const [pathD, setPathD] = useState('')
  const [alpha, setAlpha] = useState(0.22)
  const rafRef = useRef(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    function tick() {
      const elapsed = Date.now() - startRef.current
      setPathD(breathingSineWave(500, 140, elapsed))
      setAlpha(breathingAlpha(elapsed))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="rounded-lg border border-rule bg-surface-active p-3 overflow-hidden">
      <svg viewBox="0 0 500 140" className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="skeleton-grad" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor={SHIMMER_COLOR} stopOpacity={0.12} />
            <stop offset="100%" stopColor={SHIMMER_COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Faint grid lines */}
        {[0.25, 0.5, 0.75].map(frac => (
          <line
            key={frac}
            x1={0} y1={140 * frac} x2={500} y2={140 * frac}
            stroke="currentColor" strokeWidth={0.5} opacity={0.04}
          />
        ))}

        {/* Breathing wave line */}
        {pathD && (
          <>
            <path
              d={`${pathD} L 500 140 L 0 140 Z`}
              fill="url(#skeleton-grad)"
              opacity={alpha * 2}
            />
            <path
              d={pathD}
              fill="none"
              stroke={SHIMMER_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={alpha}
            />
          </>
        )}

        {/* Breathing dot at the end */}
        <circle
          cx={500}
          cy={70}
          r={3.5}
          fill={SHIMMER_COLOR}
          opacity={alpha + 0.1}
          className="chart-skeleton-breathe"
        />
      </svg>
    </div>
  )
}

/** Skeleton placeholder blocks shown while Sonnet generates a response */
interface ShimmerLoadingProps {
  readonly tone?: 'active' | 'steady' | 'slow'
}

export function ShimmerLoading({ tone = 'active' }: ShimmerLoadingProps) {
  return (
    <div className="relative space-y-3 overflow-hidden">
      <div className="lab-loading-orb" data-state={tone === 'active' ? 'active' : undefined} aria-hidden="true" />

      {/* Stat row skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(i => (
          <motion.div
            key={`stat-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: i * 0.06 }}
            className="bg-white border border-rule rounded-xl p-4 geo-accent-bar"
          >
            <div className="shimmer h-8 w-16 rounded bg-surface-active mb-2" />
            <div className="shimmer h-3 w-24 rounded bg-surface-active mb-1" />
            <div className="shimmer h-2 w-20 rounded bg-surface-active" />
          </motion.div>
        ))}
      </div>

      {/* Insight skeleton */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.18 }}
        className="bg-white border border-rule rounded-xl p-4 border-l-[3px] border-l-accent"
      >
        <div className="shimmer h-4 w-48 rounded bg-surface-active mb-3" />
        <div className="shimmer h-3 w-full rounded bg-surface-active mb-2" />
        <div className="shimmer h-3 w-4/5 rounded bg-surface-active mb-2" />
        <div className="shimmer h-3 w-3/5 rounded bg-surface-active" />
      </motion.div>

      {/* Chart skeleton — breathing sine wave instead of static bars */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.24 }}
        className="bg-white border border-rule rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="shimmer h-4 w-40 rounded bg-surface-active" />
          <div className="ml-auto flex gap-2">
            <div className="shimmer h-5 w-14 rounded-full bg-surface-active" />
            <div className="shimmer h-5 w-14 rounded-full bg-surface-active" />
          </div>
        </div>
        <BreathingChartSkeleton />
        <div className="mt-3 flex gap-3">
          <div className="shimmer h-3 w-20 rounded bg-surface-active" />
          <div className="shimmer h-3 w-16 rounded bg-surface-active" />
        </div>
      </motion.div>
    </div>
  )
}
