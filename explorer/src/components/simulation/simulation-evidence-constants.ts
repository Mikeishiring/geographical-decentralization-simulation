// ── Shared constants for evidence surface visualization ─────────────────────
// Single source of truth for chart colors and metric sentiment thresholds.
// Used by EvidenceSurfacePanels, EvidenceMapSurface, and PrecomputedEvidenceSurface.

export const CHART_COLORS = {
  gini: '#C2553A',
  hhi: '#2563EB',
  liveness: '#16A34A',
  totalDistance: '#C2553A',
  proposalTime: '#D97706',
  mev: '#2563EB',
  attestation: '#0F766E',
  failedProposals: '#BE123C',
  clusters: '#7C3AED',
  activeRegions: '#7C3AED',
  cv: '#9333EA',
  avgNnd: '#0891B2',
  nni: '#0D9488',
  relayDist: '#EA580C',
} as const

// ── Metric thresholds ──────────────────────────────────────────────────────
// Each defines two boundaries: [good, moderate]. Values beyond moderate are "bad".
// For "lower is better" metrics (gini, hhi), good < moderate < bad.
// For "higher is better" metrics (liveness, activeRegions), good > moderate > bad.

export const THRESHOLDS = {
  gini:          { good: 0.4,  moderate: 0.6 },
  hhi:           { good: 0.15, moderate: 0.25 },
  liveness:      { good: 95,   moderate: 80 },
  proposalTime:  { good: 200,  moderate: 500 },
  activeRegions: { good: 20,   moderate: 10 },
} as const

export type MetricSentiment = 'positive' | 'neutral' | 'negative'

/** Lower-is-better sentiment: below good = positive, below moderate = neutral, else negative. */
export function sentimentLower(value: number, thresholds: { good: number; moderate: number }): MetricSentiment {
  if (value < thresholds.good) return 'positive'
  if (value < thresholds.moderate) return 'neutral'
  return 'negative'
}

/** Higher-is-better sentiment: above good = positive, above moderate = neutral, else negative. */
export function sentimentHigher(value: number, thresholds: { good: number; moderate: number }): MetricSentiment {
  if (value > thresholds.good) return 'positive'
  if (value > thresholds.moderate) return 'neutral'
  return 'negative'
}

/** Tailwind text color class for a given sentiment. */
export const SENTIMENT_TEXT: Record<MetricSentiment, string> = {
  positive: 'text-emerald-600',
  neutral: 'text-amber-500',
  negative: 'text-rose-500',
}

// ── Analytical lens category descriptions ─────────────────────────────────

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  all: 'All metrics across the simulation run.',
  decentralization: 'Stake inequality and market concentration.',
  coverage: 'Geographic liveness \u2014 regional participation.',
  equity: 'Profit distribution fairness.',
  topology: 'Spatial clustering, spacing, and spread.',
  economics: 'MEV extraction and attestation health.',
  performance: 'Missed proposals and operational friction.',
  latency: 'Block proposal pipeline timing.',
  sources: 'Information relay origin and reach.',
}
