import {
  parseAnalyticsCompareMode,
  parseAnalyticsDeckView,
  parseAnalyticsQueryMetric,
} from './simulation-analytics'
import type { InitialSimulationLabState, SurfaceMode } from './simulation-lab-types'

export function resolveAppBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
  if (configuredBaseUrl) return configuredBaseUrl
  if (typeof window === 'undefined') return ''

  return window.location.origin
}

function parseSurfaceMode(value: string | null): SurfaceMode | undefined {
  return value === 'research' || value === 'lab' ? value : undefined
}

function parseOptionalSlotIndex(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function readInitialSimulationLabState(): InitialSimulationLabState {
  if (typeof window === 'undefined') return { surfaceMode: 'lab' }

  const params = new URLSearchParams(window.location.search)
  const jobId = params.get('simulationJob') ?? undefined
  const requestedSurfaceMode = parseSurfaceMode(params.get('simulationSurface'))
  return {
    surfaceMode: requestedSurfaceMode ?? 'research',
    jobId,
    analyticsView: parseAnalyticsDeckView(params.get('exactAnalytics')),
    analyticsMetric: parseAnalyticsQueryMetric(params.get('exactMetric')),
    analyticsCompareMode: parseAnalyticsCompareMode(params.get('exactCompareMode')),
    analyticsSlot: parseOptionalSlotIndex(params.get('exactSlot')),
    comparisonPath: params.get('exactCompare') ?? undefined,
  }
}
