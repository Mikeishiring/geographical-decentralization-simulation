import { useEffect, useMemo, useState } from 'react'
import {
  defaultAnalyticsQueryMetricForView,
  type AnalyticsCompareMode,
  type AnalyticsDeckView,
  type AnalyticsQueryMetric,
} from './simulation-analytics'
import type { SurfaceMode } from './simulation-lab-types'
import { buildSimulationLabUrl } from './simulation-lab-comparison'
import { readInitialSimulationLabState, resolveAppBaseUrl } from './simulation-lab-helpers'

export function useSimulationLabRouteState() {
  const initialLabState = useMemo(() => readInitialSimulationLabState(), [])
  const appBaseUrl = resolveAppBaseUrl()
  const researchCatalogScriptUrl = `${appBaseUrl}/research-demo/assets/research-catalog.js`
  const researchViewerBaseUrl = `${appBaseUrl}/research-demo`

  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(initialLabState.surfaceMode)
  const [currentJobId, setCurrentJobId] = useState<string | null>(initialLabState.jobId ?? null)
  const [exactAnalyticsView, setExactAnalyticsView] = useState<AnalyticsDeckView>(initialLabState.analyticsView ?? 'concentration')
  const [exactAnalyticsMetric, setExactAnalyticsMetric] = useState<AnalyticsQueryMetric>(
    initialLabState.analyticsMetric ?? defaultAnalyticsQueryMetricForView(initialLabState.analyticsView ?? 'concentration'),
  )
  const [exactAnalyticsCompareMode, setExactAnalyticsCompareMode] = useState<AnalyticsCompareMode>(
    initialLabState.analyticsCompareMode ?? 'absolute',
  )
  const [exactAnalyticsRequestedSlot, setExactAnalyticsRequestedSlot] = useState<number | null>(initialLabState.analyticsSlot ?? null)
  const [exactComparisonPath, setExactComparisonPath] = useState<string | null>(initialLabState.comparisonPath ?? null)

  useEffect(() => {
    const nextUrl = buildSimulationLabUrl({
      surfaceMode,
      currentJobId,
      analyticsView: exactAnalyticsView,
      analyticsMetric: exactAnalyticsMetric,
      analyticsCompareMode: exactAnalyticsCompareMode,
      analyticsSlot: exactAnalyticsRequestedSlot,
      comparisonPath: exactComparisonPath,
    })
    if (!nextUrl) return
    window.history.replaceState({}, '', nextUrl)
  }, [
    currentJobId,
    exactAnalyticsCompareMode,
    exactAnalyticsMetric,
    exactAnalyticsRequestedSlot,
    exactAnalyticsView,
    exactComparisonPath,
    surfaceMode,
  ])

  const resetForSubmittedJob = (jobId: string) => {
    setSurfaceMode('lab')
    setCurrentJobId(jobId)
    setExactAnalyticsRequestedSlot(null)
    setExactComparisonPath(null)
  }

  return {
    appBaseUrl,
    currentJobId,
    exactAnalyticsCompareMode,
    exactAnalyticsMetric,
    exactAnalyticsRequestedSlot,
    exactAnalyticsView,
    exactComparisonPath,
    researchCatalogScriptUrl,
    researchViewerBaseUrl,
    resetForSubmittedJob,
    setCurrentJobId,
    setExactAnalyticsCompareMode,
    setExactAnalyticsMetric,
    setExactAnalyticsRequestedSlot,
    setExactAnalyticsView,
    setExactComparisonPath,
    setSurfaceMode,
    surfaceMode,
  }
}
