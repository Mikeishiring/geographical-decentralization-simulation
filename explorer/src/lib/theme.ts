/** Shared animation + color constants. Import these instead of re-declaring per file. */

export const SPRING = { type: 'spring' as const, stiffness: 220, damping: 28, mass: 0.92 }
export const SPRING_SOFT = { type: 'spring' as const, stiffness: 170, damping: 24, mass: 0.96 }
export const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 360, damping: 30, mass: 0.88 }

/** Critically-damped spring — Stripe-style: fast settle, no overshoot */
export const SPRING_CRISP = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 }

/** Instant transition — used when prefers-reduced-motion is active */
export const INSTANT = { duration: 0 } as const

/** Stagger children preset for scroll-triggered reveals */
export const STAGGER_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.01 } },
} as const

export const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 10, scale: 0.995 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
} as const

/** Block visualization palette — SSP ocean, MSP earth, plus supporting colors */
export const BLOCK_COLORS = [
  '#2563EB', // ocean blue (SSP)
  '#C2553A', // terracotta (MSP)
  '#16A34A', // meridian green
  '#D97706', // amber
  '#DC2626', // signal red
] as const

/** GCP macro-region coordinate labels — decorative micro-detail */
export const REGION_COORDS = [
  { region: 'North America', coord: '37.4°N 122.1°W', short: 'NA' },
  { region: 'Europe', coord: '50.1°N 8.7°E', short: 'EU' },
  { region: 'Asia Pacific', coord: '35.7°N 139.8°E', short: 'AP' },
  { region: 'South America', coord: '23.5°S 46.6°W', short: 'SA' },
  { region: 'Middle East', coord: '25.3°N 55.3°E', short: 'ME' },
  { region: 'Africa', coord: '33.9°S 18.4°E', short: 'AF' },
  { region: 'Oceania', coord: '33.9°S 151.2°E', short: 'OC' },
] as const

/** Page-level transition — used for view switches (argument map ↔ full text, etc.) */
export const PAGE_TRANSITION = { type: 'spring' as const, stiffness: 260, damping: 28, mass: 0.9 }

/** Inline error banner styling tokens */
export const ERROR_BANNER = {
  border: 'border-red-200/60',
  bg: 'bg-red-50/60',
  text: 'text-red-700',
} as const

/** Reusable shadow tokens */
export const SHADOW = {
  card: '0 1px 3px rgba(0,0,0,0.04)',
  elevated: '0 4px 12px rgba(0,0,0,0.06)',
  deepLinked: '0 0 0 1px color-mix(in srgb, var(--color-accent) 6%, transparent)',
} as const

/** Primary CTA button — dark bg used across lab pages */
export const CTA_BUTTON = {
  base: 'bg-text-primary text-white',
  hover: 'hover:bg-text-primary/90',
} as const


/** Chart design tokens — Stripe-aligned defaults */
export const CHART = {
  gridOpacity: 0.05,
  gridWidth: 0.5,
  labelSize: 10,
  stagger: 0.03,
  crosshairOpacity: 0.12,
  areaTopOpacity: 0.14,
  areaBottomOpacity: 0.02,
  tooltipShadow: '0 4px 12px rgba(0,0,0,0.08)',
  tooltipRadius: 8,
} as const

/** Compact number formatter — 1.4K, 23.5M, 890B */
export function formatCompact(value: number, unit?: string): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const suffix = unit ? ` ${unit}` : ''
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B${suffix}`
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M${suffix}`
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(1)}K${suffix}`
  if (abs >= 100) return `${sign}${abs.toFixed(0)}${suffix}`
  if (abs >= 10) return `${sign}${abs.toFixed(1)}${suffix}`
  return `${sign}${abs.toFixed(2)}${suffix}`
}
