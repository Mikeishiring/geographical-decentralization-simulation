import { motion } from 'framer-motion'
import { SPRING_SNAPPY, SPRING_SOFT } from '../../lib/theme'

interface AnimatedIconProps {
  readonly className?: string
  readonly isActive?: boolean
  readonly isHovered?: boolean
}

/**
 * BookOpen — Editorial icon. Pages gently flip when active/hovered.
 * The right page rotates slightly to simulate a page turn.
 */
export function AnimatedBookOpen({ className = 'h-3.5 w-3.5', isActive, isHovered }: AnimatedIconProps) {
  const animate = isActive || isHovered
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Spine */}
      <motion.path d="M12 7v14" />
      {/* Left page — stays still */}
      <motion.path d="M2 3h6a4 4 0 0 1 4 4" />
      {/* Right page — flips on activation */}
      <motion.path
        d="M22 3h-6a4 4 0 0 0-4 4"
        animate={animate ? {
          rotateY: [0, -25, 0],
          originX: '50%',
        } : { rotateY: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.22, 1, 0.36, 1],
          repeat: isActive ? Infinity : 0,
          repeatDelay: 2.5,
        }}
      />
      {/* Left page bottom */}
      <motion.path d="M2 3v14a1 1 0 0 0 1 1h8" />
      {/* Right page bottom — follows the flip */}
      <motion.path
        d="M22 3v14a1 1 0 0 1-1 1h-8"
        animate={animate ? {
          rotateY: [0, -20, 0],
          originX: '50%',
        } : { rotateY: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.22, 1, 0.36, 1],
          delay: 0.05,
          repeat: isActive ? Infinity : 0,
          repeatDelay: 2.5,
        }}
      />
    </motion.svg>
  )
}

/**
 * ListTree — Arguments icon. Branches stagger-pulse when active.
 * Each branch line fades in sequentially for a "loading tree" effect.
 */
export function AnimatedListTree({ className = 'h-3.5 w-3.5', isActive, isHovered }: AnimatedIconProps) {
  const animate = isActive || isHovered

  const branchLines = [
    { d: 'M21 12h-8', delay: 0 },
    { d: 'M21 6h-8', delay: 0.08 },
    { d: 'M21 18h-8', delay: 0.16 },
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
    >
      {/* Trunk */}
      <motion.path d="M3 3v18" />
      {/* Root connectors */}
      <motion.path d="M3 12h4" />
      <motion.path d="M3 6h4" />
      <motion.path d="M3 18h4" />
      {/* Node dots */}
      <motion.circle cx="7" cy="6" r="1" fill="currentColor" stroke="none" />
      <motion.circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
      <motion.circle cx="7" cy="18" r="1" fill="currentColor" stroke="none" />
      {/* Branch lines — stagger pulse */}
      {branchLines.map(({ d, delay }) => (
        <motion.path
          key={d}
          d={d}
          animate={animate ? {
            opacity: [0.4, 1, 0.4],
            pathLength: [0.3, 1, 0.3],
          } : { opacity: 1, pathLength: 1 }}
          transition={{
            duration: 1.8,
            delay,
            repeat: isActive ? Infinity : 0,
            repeatDelay: 1.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </motion.svg>
  )
}

/**
 * FileText — Original PDF icon. Internal lines animate like text
 * being written onto the page, with a subtle shimmer.
 */
export function AnimatedFileText({ className = 'h-3.5 w-3.5', isActive, isHovered }: AnimatedIconProps) {
  const animate = isActive || isHovered

  const textLines = [
    { x1: 9, x2: 15, y: 9, delay: 0 },
    { x1: 9, x2: 15, y: 13, delay: 0.12 },
    { x1: 9, x2: 13, y: 17, delay: 0.24 },
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
    >
      {/* Page outline with folded corner */}
      <motion.path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <motion.path d="M14 2v4a1 1 0 0 0 1 1h3" />
      {/* Text lines — write themselves in */}
      {textLines.map(({ x1, x2, y, delay }) => (
        <motion.line
          key={y}
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          animate={animate ? {
            pathLength: [0, 1, 1, 0],
            opacity: [0, 1, 1, 0.4],
          } : { pathLength: 1, opacity: 1 }}
          transition={{
            duration: 2.4,
            delay,
            repeat: isActive ? Infinity : 0,
            repeatDelay: 1,
            ease: 'easeInOut',
          }}
        />
      ))}
    </motion.svg>
  )
}

/**
 * MessageSquare — Notes icon. Fills up when active; the bubble
 * does a subtle "pop" scale on toggle.
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
      animate={isActive ? { scale: [1, 1.08, 1] } : {}}
      transition={SPRING_SNAPPY}
    >
      <motion.path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        animate={{
          fill: isActive ? 'currentColor' : 'transparent',
          fillOpacity: isActive ? 0.15 : 0,
        }}
        transition={SPRING_SOFT}
      />
      {/* Typing dots — appear when hovered */}
      {[8, 12, 16].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy={10}
          r={1}
          fill="currentColor"
          stroke="none"
          animate={isHovered && !isActive ? {
            opacity: [0, 1, 0],
            y: [0, -1, 0],
          } : { opacity: 1, y: 0 }}
          transition={{
            duration: 0.9,
            delay: i * 0.15,
            repeat: isHovered && !isActive ? Infinity : 0,
            repeatDelay: 0.3,
          }}
        />
      ))}
    </motion.svg>
  )
}

/**
 * ChevronDown — Reading guide toggle. Smoothly rotates between
 * down (closed) and up (open) with a spring bounce.
 */
export function AnimatedChevronToggle({ className = 'h-3 w-3', isActive }: AnimatedIconProps) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={{ rotate: isActive ? 180 : 0 }}
      transition={SPRING_SNAPPY}
    >
      <motion.path d="m6 9 6 6 6-6" />
    </motion.svg>
  )
}

/**
 * Sparkles — Interpreted indicator. Gently twinkles when spectrum
 * is toward the interpreted end.
 */
export function AnimatedSparkles({ className = 'h-2.5 w-2.5', isActive }: AnimatedIconProps) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={isActive ? {
        scale: [1, 1.15, 1],
        opacity: [0.5, 1, 0.5],
      } : {}}
      transition={{
        duration: 2,
        repeat: isActive ? Infinity : 0,
        ease: 'easeInOut',
      }}
    >
      {/* Main sparkle */}
      <motion.path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      {/* Small accent sparkle */}
      <motion.path
        d="M20 3v4"
        animate={isActive ? { opacity: [0.3, 1, 0.3] } : {}}
        transition={{ duration: 1.4, repeat: isActive ? Infinity : 0, delay: 0.3 }}
      />
      <motion.path
        d="M22 5h-4"
        animate={isActive ? { opacity: [0.3, 1, 0.3] } : {}}
        transition={{ duration: 1.4, repeat: isActive ? Infinity : 0, delay: 0.3 }}
      />
    </motion.svg>
  )
}
