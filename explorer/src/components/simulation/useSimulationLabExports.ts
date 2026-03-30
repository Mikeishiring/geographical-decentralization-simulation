import { useEffect, useRef, useState } from 'react'
import { downloadBlobFile, downloadSimulationExportArchive } from '../../lib/simulation-export'
import {
  getSimulationArtifact,
  type SimulationManifest,
} from '../../lib/simulation-api'
import { COPY_RESET_DELAY_MS } from './simulation-constants'
import type {
  AnalyticsCompareMode,
  AnalyticsDeckView,
  AnalyticsQueryMetric,
} from './simulation-analytics'

interface UseSimulationLabExportsOptions {
  readonly currentJobId: string | null
  readonly manifest: SimulationManifest | null
  readonly analyticsView: AnalyticsDeckView
  readonly analyticsMetric: AnalyticsQueryMetric
  readonly analyticsCompareMode: AnalyticsCompareMode
  readonly exactAnalyticsShareUrl: string | null
  readonly exactAnalyticsExportJson: string | null
  readonly exactAnalyticsExportCsv: string | null
}

export function useSimulationLabExports({
  currentJobId,
  manifest,
  analyticsView,
  analyticsMetric,
  analyticsCompareMode,
  exactAnalyticsShareUrl,
  exactAnalyticsExportJson,
  exactAnalyticsExportCsv,
}: UseSimulationLabExportsOptions) {
  const [copyState, setCopyState] = useState<'config' | 'run' | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'done'>('idle')
  const [exportError, setExportError] = useState<string | null>(null)
  const exportResetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (exportResetTimeoutRef.current != null) {
        window.clearTimeout(exportResetTimeoutRef.current)
      }
    }
  }, [])

  const resetExportState = () => {
    if (exportResetTimeoutRef.current != null) {
      window.clearTimeout(exportResetTimeoutRef.current)
      exportResetTimeoutRef.current = null
    }
    setExportState('idle')
    setExportError(null)
  }

  const copyToClipboard = async (text: string, kind: 'config' | 'run') => {
    await navigator.clipboard.writeText(text)
    setCopyState(kind)
    window.setTimeout(() => {
      setCopyState(previous => (previous === kind ? null : previous))
    }, COPY_RESET_DELAY_MS)
  }

  const copyExactAnalyticsUrl = async (targetUrl = exactAnalyticsShareUrl) => {
    if (!targetUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(targetUrl)
  }

  const copyExactAnalyticsJson = async () => {
    if (!exactAnalyticsExportJson || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(exactAnalyticsExportJson)
  }

  const downloadExactAnalyticsExport = (format: 'json' | 'csv') => {
    const content = format === 'json' ? exactAnalyticsExportJson : exactAnalyticsExportCsv
    if (!content) return

    const filename = `${currentJobId ? `exact-${currentJobId.slice(0, 8)}` : 'exact-run'}-${analyticsView}-${analyticsMetric}-${analyticsCompareMode}.${format}`
    downloadBlobFile(
      filename,
      new Blob([content], {
        type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
      }),
    )
  }

  const exportRunData = async () => {
    if (!manifest) return

    if (exportResetTimeoutRef.current != null) {
      window.clearTimeout(exportResetTimeoutRef.current)
      exportResetTimeoutRef.current = null
    }

    setExportState('exporting')
    setExportError(null)

    try {
      const loadedArtifacts = await Promise.all(
        manifest.artifacts.map(async artifact => ({
          artifact,
          content: await getSimulationArtifact(manifest.jobId, artifact.name),
        })),
      )

      const filename = [
        'simulation',
        manifest.config.paradigm.toLowerCase(),
        `${manifest.config.validators}v`,
        `${manifest.config.slots}s`,
        manifest.jobId,
      ].join('-') + '.zip'

      await downloadSimulationExportArchive(filename, manifest, loadedArtifacts)
      setExportState('done')
      exportResetTimeoutRef.current = window.setTimeout(() => {
        setExportState('idle')
        exportResetTimeoutRef.current = null
      }, COPY_RESET_DELAY_MS)
    } catch (error) {
      setExportState('idle')
      setExportError(
        error instanceof Error
          ? error.message
          : 'Unable to prepare the export package for this exact run.',
      )
    }
  }

  return {
    copyExactAnalyticsJson,
    copyExactAnalyticsUrl,
    copyState,
    copyToClipboard,
    downloadExactAnalyticsExport,
    exportError,
    exportRunData,
    exportState,
    resetExportState,
  }
}
