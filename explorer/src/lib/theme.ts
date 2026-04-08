/** Shared animation + color constants. Import these instead of re-declaring per file. */

export const SPRING = { type: 'spring' as const, stiffness: 220, damping: 28, mass: 0.92 }
export const SPRING_SOFT = { type: 'spring' as const, stiffness: 170, damping: 24, mass: 0.96 }
export const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 360, damping: 30, mass: 0.88 }

/** Critically-damped spring — Stripe-style: fast settle, no overshoot */
export const SPRING_CRISP = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 }

/** Accordion expand/collapse — critically damped, no overshoot, fast settle */
export const SPRING_ACCORDION = { type: 'spring' as const, stiffness: 400, damping: 38, mass: 0.8 }

/** Agentation-style popup spring — slight overshoot for premium entry feel */
export const SPRING_POPUP = { type: 'spring' as const, stiffness: 380, damping: 22, mass: 0.7 }

/** Instant transition — used when prefers-reduced-motion is active */
export const INSTANT = { duration: 0 } as const

/** Stagger children preset for scroll-triggered reveals */
export const STAGGER_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.01 } },
} as const

export const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_CRISP },
} as const

/** Section category badge colors — maps SectionCategory to [bg, text, border] Tailwind classes */
export const SECTION_CATEGORY_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  methodology: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'Methodology' },
  finding: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', label: 'Finding' },
  caveat: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Caveat' },
  discussion: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Discussion' },
} as const

/** Section category left-border accent — 3px colored rail on collapsed section cards */
export const SECTION_CATEGORY_BORDER: Record<string, string> = {
  methodology: 'border-l-slate-400',
  finding: 'border-l-violet-400',
  caveat: 'border-l-amber-400',
  discussion: 'border-l-emerald-400',
} as const

/** Topic card theme colors — maps TopicTheme to accent color + subtle bg */
export const TOPIC_THEME_STYLE: Record<string, { dot: string; activeBorder: string; activeBg: string }> = {
  ssp: { dot: '#2563EB', activeBorder: 'border-blue-400', activeBg: 'bg-blue-50/50' },
  msp: { dot: '#C2553A', activeBorder: 'border-orange-400', activeBg: 'bg-orange-50/50' },
  finding: { dot: '#7C3AED', activeBorder: 'border-violet-400', activeBg: 'bg-violet-50/50' },
  mitigation: { dot: '#16A34A', activeBorder: 'border-emerald-400', activeBg: 'bg-emerald-50/50' },
  caveat: { dot: '#D97706', activeBorder: 'border-amber-400', activeBg: 'bg-amber-50/50' },
  methodology: { dot: '#6B7280', activeBorder: 'border-gray-400', activeBg: 'bg-gray-50/50' },
} as const

/** Block visualization palette — external block building ocean, local block building earth, plus supporting colors */
export const BLOCK_COLORS = [
  '#2563EB', // ocean blue (external block building)
  '#C2553A', // terracotta (local block building)
  '#16A34A', // meridian green
  '#D97706', // amber
  '#DC2626', // signal red
] as const

/** Pastel palette for decorative globe nodes and map region fills */
export const PASTEL_PALETTE = [
  '#c3b1e1', // lavender
  '#a8d8ea', // sky
  '#ffd3b6', // peach
  '#a8e6cf', // mint
  '#f6b8d1', // rose
] as const

/** Intent-aware colors for time-series and metric lines */
export const INTENT_COLORS: Record<string, string> = {
  warn: '#C2410C',
  info: '#1D4ED8',
  safe: '#0F766E',
  highlight: '#7C3AED',
} as const

/** Dark-mode map/globe surface palette */
export const DARK_SURFACE = {
  bg: '#0B0F14',
  gradientTop: '#0E1520',
  gradientMid: '#080C12',
  gradientBot: '#060A0F',
  graticule: '#1C2A3E',
  labelText: '#2A3D5A',
  worldFill: '#111B28',
  worldStroke: '#1E3048',
  tooltipBg: '#0C1220',
  subtleText: '#B0C4D8',
  grayscaleFill: '#667788',
  grayscaleStroke: '#556677',
} as const

/** Light-mode map surface palette — warm paper aesthetic */
export const LIGHT_SURFACE = {
  bg: '#FAFAF7',
  gradientCenter: '#F5F5F0',
  gradientEdge: '#EEEEE8',
  graticule: '#DDD9D0',
  labelText: '#8C8578',
  worldFill: '#ECEAE4',
  worldStroke: '#D6D2C8',
  /** Aliases used by MapBlock (country-prefixed naming) */
  countryFill: '#ECEAE4',
  countryStroke: '#D6D2C8',
  edgeStroke: '#D6D3CE',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E5E5E3',
  tooltipText: '#1C1917',
  subtleText: '#5C5650',
  grayscaleFill: '#C4BFB6',
  grayscaleStroke: '#B0AAA0',
  /** Mono-accent blue ramp — used by MapBlock node coloring */
  blue100: '#BFDBFE',
  blue400: '#60A5FA',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  /** Orb effects tuned for light bg — darker tints instead of white highlights */
  orbHighlight: 'rgba(255,255,255,0.55)',
  orbMid: 'rgba(255,255,255,0.18)',
  rimLight: 'rgba(0,0,0,0.04)',
  haloStroke: 'rgba(0,0,0,0.06)',
  nodeShadow: 'rgba(0,0,0,0.10)',
} as const

/** Map node color ramp — aligned with page's BLOCK_COLORS semantic system */
export const MAP_NODE_COLORS = {
  /** 4-tier concentration scale using the page accent (blue) */
  low: '#93C5FD',       // blue-300 — faint presence
  mid: '#60A5FA',       // blue-400 — moderate
  high: '#2563EB',      // blue-600 — matches accent / external block building
  top: '#1E40AF',       // blue-800 — dominant
  /** Overlay-specific */
  sources: '#16A34A',   // meridian green — matches page success color
  inactive: '#C4BFB6',  // warm gray — no validators
} as const

/** Shimmer loading placeholder color */
export const SHIMMER_COLOR = '#CBD5E1'

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
  border: 'border-danger/20',
  bg: 'bg-danger/5',
  text: 'text-danger',
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


/** Chart design tokens — Stripe-aligned defaults + liveline-inspired additions */
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

  /* ── Liveline-inspired tokens ── */
  /** Pulsing live dot — expanding ring at the latest data point */
  liveDotRadius: 3.5,
  liveDotPulseRadius: 9,
  liveDotPulseInterval: 1500,

  /** Crosshair fade distance (px) near the live data point */
  crosshairFadeDistance: 40,

  /** Edge fade width — CSS mask gradient for left chart edge */
  edgeFadeWidth: 40,

  /** Tooltip entrance spring — slight overshoot for premium feel */
  tooltipSpring: { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.7 },

  /** Staggered reveal thresholds — choreographed chart entrance */
  reveal: {
    grid: { start: 0, end: 0.3 },
    area: { start: 0.1, end: 0.5 },
    line: { start: 0.15, end: 0.6 },
    dot: { start: 0.3, end: 0.8 },
    label: { start: 0.5, end: 1.0 },
  },

  /** Momentum-driven colors — semantic, not derived from accent */
  momentumUp: '#22c55e',
  momentumDown: '#ef4444',

  /** Glow intensity on hovered chart elements */
  hoverGlow: '0 0 12px',
  hoverGlowOpacity: '30',
} as const

/** Fluid layout max-width — scales from ~1152px to ~1536px across viewports */
export const CONTENT_MAX_WIDTH = 'max-w-[clamp(72rem,62rem+12vw,96rem)]'

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
