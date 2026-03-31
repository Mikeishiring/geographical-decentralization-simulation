import { motion } from 'framer-motion'
import { SPRING, SPRING_SNAPPY, SPRING_SOFT } from '../../lib/theme'

interface AnimatedIconProps {
  readonly className?: string
  readonly isActive?: boolean
  readonly isHovered?: boolean
}

/* ── Shared constants matching NodeArc / GlobeNetwork breathing rhythm ── */

/** Base breathing cycle — staggered per element like decorative nodes */
const BREATHE_DUR = '3.2s'
const BREATHE_DUR_OFFSET = '3.6s'
const BREATHE_DUR_OFFSET_2 = '4.0s'

/**
 * BookOpen — Editorial icon.
 * Active: right page gently lifts (subtle skewY breathing, not a dramatic flip).
 * Hover: slight spring scale pop on the whole icon.
 */
export function AnimatedBookOpen({ className = 'h-3.5 w-3.5', isActive, isHovered }: AnimatedIconProps) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={{ scale: isHovered ? 1.1 : 1 }}
      transition={SPRING_SNAPPY}
    >
      {/* Spine */}
      <path d="M12 7v14" />
      {/* Left page — static */}
      <path d="M2 3h6a4 4 0 0 1 4 4" />
      <path d="M2 3v14a1 1 0 0 0 1 1h8" />
      {/* Right page top — breathes when active */}
      <motion.path
        d="M22 3h-6a4 4 0 0 0-4 4"
        animate={{ skewY: isActive ? [0, -2, 0] : 0 }}
        transition={isActive ? {
          ...SPRING_SOFT,
          repeat: Infinity,
          repeatDelay: 2.8,
        } : SPRING_SNAPPY}
        style={{ originX: '50%', originY: '100%' }}
      />
      {/* Right page bottom — follows with slight delay via offset spring */}
      <motion.path
        d="M22 3v14a1 1 0 0 1-1 1h-8"
        animate={{ skewY: isActive ? [0, -1.5, 0] : 0 }}
        transition={isActive ? {
          ...SPRING_SOFT,
          delay: 0.06,
          repeat: Infinity,
          repeatDelay: 2.8,
        } : SPRING_SNAPPY}
        style={{ originX: '50%', originY: '100%' }}
      />
    </motion.svg>
  )
}

/**
 * ListTree — Arguments icon.
 * Active: branch node dots breathe (scale + opacity) like NodeArc nodes,
 * staggered per row. SVG native <animate> for infinite loops.
 * Hover: spring scale pop.
 */
export function AnimatedListTree({ className = 'h-3.5 w-3.5', isActive, isHovered }: AnimatedIconProps) {
  const nodes = [
    { cy: 6, dur: BREATHE_DUR },
    { cy: 12, dur: BREATHE_DUR_OFFSET },
    { cy: 18, dur: BREATHE_DUR_OFFSET_2 },
  ]

  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={{ scale: isHovered ? 1.1 : 1 }}
      transition={SPRING_SNAPPY}
    >
      {/* Trunk + connectors — always static */}
      <path d="M3 3v18" />
      <path d="M3 6h5" />
      <path d="M3 12h5" />
      <path d="M3 18h5" />
      {/* Branch lines */}
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
      {/* Node dots — breathe when active (NodeArc pattern) */}
      {nodes.map(({ cy, dur }) => (
        <g key={cy}>
          {/* Outer halo — only visible when active */}
          {isActive && (
            <circle cx={9} cy={cy} r={3} fill="currentColor" opacity={0} stroke="none">
              <animate attributeName="opacity" values="0;0.12;0" dur={dur} repeatCount="indefinite" />
            </circle>
          )}
          {/* Core dot */}
          <circle cx={9} cy={cy} r={1.5} fill="currentColor" stroke="none" opacity={0.8}>
            {isActive && (
              <>
                <animate attributeName="opacity" values="0.8;1;0.8" dur={dur} repeatCount="indefinite" />
                <animate attributeName="r" values="1.5;1.7;1.5" dur={dur} repeatCount="indefinite" />
              </>
            )}
          </circle>
        </g>
      ))}
    </motion.svg>
  )
}

/**
 * FileText — Original PDF icon.
 * Active: text lines shimmer with a subtle opacity wave (staggered),
 * using SVG native animate like GlobeNetwork graticules.
 * Hover: spring scale pop.
 */
export function AnimatedFileText({ className = 'h-3.5 w-3.5', isActive, isHovered }: AnimatedIconProps) {
  const textLines = [
    { x2: 15, y: 9, dur: BREATHE_DUR },
    { x2: 15, y: 13, dur: BREATHE_DUR_OFFSET },
    { x2: 12, y: 17, dur: BREATHE_DUR_OFFSET_2 },
  ]

  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={{ scale: isHovered ? 1.1 : 1 }}
      transition={SPRING_SNAPPY}
    >
      {/* Page outline with folded corner */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a1 1 0 0 0 1 1h3" />
      {/* Text lines — shimmer opacity when active */}
      {textLines.map(({ x2, y, dur }) => (
        <line key={y} x1={9} y1={y} x2={x2} y2={y} opacity={isActive ? undefined : 1}>
          {isActive && (
            <animate attributeName="opacity" values="0.5;1;0.5" dur={dur} repeatCount="indefinite" />
          )}
        </line>
      ))}
    </motion.svg>
  )
}

/**
 * MessageSquare — Notes icon.
 * Active: fill fades in via spring, subtle breathing on the bubble.
 * Hover: spring scale pop + typing dots appear.
 */
export function AnimatedMessageSquare({ className = 'h-3 w-3', isActive, isHovered }: AnimatedIconProps) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={{ scale: isHovered && !isActive ? 1.1 : 1 }}
      transition={SPRING_SNAPPY}
    >
      {/* Bubble — fills when active */}
      <motion.path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        animate={{
          fill: isActive ? 'currentColor' : 'transparent',
          fillOpacity: isActive ? 0.12 : 0,
        }}
        transition={SPRING}
      />
      {/* Content dots — static when active, typing animation on hover */}
      {[8, 12, 16].map((cx, i) => (
        <circle key={cx} cx={cx} cy={10} r={1} fill="currentColor" stroke="none">
          {isHovered && !isActive && (
            <animate
              attributeName="opacity"
              values="0.3;1;0.3"
              dur="0.9s"
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
          )}
        </circle>
      ))}
    </motion.svg>
  )
}

/**
 * ChevronDown — Reading guide toggle.
 * Spring rotation 0→180° matching ArgumentsView chevron pattern.
 */
export function AnimatedChevronToggle({ className = 'h-3 w-3', isActive }: AnimatedIconProps) {
  return (
    <motion.div
      animate={{ rotate: isActive ? 180 : 0 }}
      transition={SPRING}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </motion.div>
  )
}

/**
 * Sparkles — Interpreted indicator.
 * Breathes when editorial mode is active (most interpreted end).
 * Uses SVG native <animate> for the gentle twinkle — matches
 * NodeArc/GlobeNetwork breathing convention.
 */
export function AnimatedSparkles({ className = 'h-2.5 w-2.5', isActive }: AnimatedIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Main sparkle body */}
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z">
        {isActive && (
          <animate attributeName="opacity" values="0.5;1;0.5" dur={BREATHE_DUR} repeatCount="indefinite" />
        )}
      </path>
      {/* Small accent cross — twinkles offset */}
      <g>
        {isActive && (
          <animate attributeName="opacity" values="0.3;0.9;0.3" dur={BREATHE_DUR_OFFSET} repeatCount="indefinite" />
        )}
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
      </g>
    </svg>
  )
}
