import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  getSimulationArtifact,
  getSimulationOverviewBundle,
  type SimulationManifest,
} from '../../lib/simulation-api'
import type { Block } from '../../types/blocks'
import type { SimulationArtifactBundle } from '../../types/simulation-view'
import type { WorkerFailure, WorkerSuccess } from './simulation-lab-types'
import {
  OVERVIEW_BUNDLES,
  readSessionArtifactBlocks,
  writeSessionArtifactBlocks,
} from './simulation-constants'
import {
  isManifestOverviewBundle,
  selectDefaultArtifact,
} from './pending-run-helpers'

interface UseSimulationArtifactViewOptions {
  readonly currentJobId: string | null
  readonly manifest: SimulationManifest | null
}

export function useSimulationArtifactView({
  currentJobId,
  manifest,
}: UseSimulationArtifactViewOptions) {
  const [selectedArtifactName, setSelectedArtifactName] = useState<string | null>(null)
  const [selectedBundle, setSelectedBundle] = useState<SimulationArtifactBundle>('core-outcomes')
  const [parsedBlocks, setParsedBlocks] = useState<readonly Block[]>([])
  const [parsedArtifactCache, setParsedArtifactCache] = useState<Record<string, readonly Block[]>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  const workerRef = useRef<Worker | null>(null)
  const workerRequestIdRef = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/simulationArtifactWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const availableOverviewBundles = manifest?.overviewBundles ?? []
  const overviewBundleOptions = availableOverviewBundles.length > 0 ? availableOverviewBundles : OVERVIEW_BUNDLES

  const overviewBundleQueries = useQueries({
    queries: availableOverviewBundles.map(bundle => ({
      queryKey: ['simulation-overview-bundle', currentJobId, bundle.bundle, bundle.sha256],
      queryFn: () => getSimulationOverviewBundle(currentJobId!, bundle.bundle),
      enabled: Boolean(currentJobId),
      staleTime: Infinity,
    })),
  })

  const selectedOverviewBundleIndex = availableOverviewBundles.findIndex(bundle => bundle.bundle === selectedBundle)
  const selectedOverviewBundleInfo = overviewBundleOptions.find(bundle => bundle.bundle === selectedBundle) ?? null
  const selectedOverviewBundleMetrics = isManifestOverviewBundle(selectedOverviewBundleInfo)
    ? selectedOverviewBundleInfo
    : null
  const overviewBlocks = selectedOverviewBundleIndex >= 0
    ? overviewBundleQueries[selectedOverviewBundleIndex]?.data ?? []
    : []
  const isOverviewLoading = selectedOverviewBundleIndex >= 0
    ? (overviewBundleQueries[selectedOverviewBundleIndex]?.isFetching ?? false)
    : false

  useEffect(() => {
    if (!manifest) return
    if (selectedArtifactName) return
    const nextArtifact = selectDefaultArtifact(manifest.artifacts)
    if (nextArtifact) {
      setSelectedArtifactName(nextArtifact)
    }
  }, [manifest, selectedArtifactName])

  useEffect(() => {
    if (!manifest?.overviewBundles?.length) return
    if (manifest.overviewBundles.some(bundle => bundle.bundle === selectedBundle)) return
    startTransition(() => {
      setSelectedBundle(manifest.overviewBundles[0]!.bundle)
    })
  }, [manifest, selectedBundle])

  const selectedArtifact = useMemo(
    () => manifest?.artifacts.find(artifact => artifact.name === selectedArtifactName) ?? null,
    [manifest, selectedArtifactName],
  )

  const artifactQuery = useQuery({
    queryKey: ['simulation-artifact', currentJobId, selectedArtifactName],
    queryFn: () => getSimulationArtifact(currentJobId!, selectedArtifactName!),
    enabled: Boolean(currentJobId && selectedArtifactName && selectedArtifact?.renderable),
    staleTime: Infinity,
  })
  const selectedArtifactRawText = artifactQuery.data ?? null

  useEffect(() => {
    if (!selectedArtifact || !selectedArtifactRawText || !workerRef.current) {
      return
    }

    const cacheKey = selectedArtifact.sha256
    const cachedBlocks = parsedArtifactCache[cacheKey] ?? readSessionArtifactBlocks(cacheKey)
    if (cachedBlocks) {
      if (!parsedArtifactCache[cacheKey]) {
        setParsedArtifactCache(previous => ({
          ...previous,
          [cacheKey]: cachedBlocks,
        }))
      }
      setParsedBlocks(cachedBlocks)
      setParseError(null)
      setIsParsing(false)
      return
    }

    const worker = workerRef.current
    const requestId = ++workerRequestIdRef.current
    setIsParsing(true)
    setParseError(null)

    const handleMessage = (event: MessageEvent<WorkerSuccess | WorkerFailure>) => {
      if (event.data.id !== requestId) return
      worker.removeEventListener('message', handleMessage as EventListener)
      if (event.data.ok) {
        const nextBlocks = event.data.blocks
        setParsedBlocks(nextBlocks)
        setParsedArtifactCache(previous => ({
          ...previous,
          [cacheKey]: nextBlocks,
        }))
        writeSessionArtifactBlocks(cacheKey, nextBlocks)
        setParseError(null)
      } else {
        setParsedBlocks([])
        setParseError(event.data.error)
      }
      setIsParsing(false)
    }

    worker.addEventListener('message', handleMessage as EventListener)
    worker.postMessage({
      id: requestId,
      artifact: {
        name: selectedArtifact.name,
        label: selectedArtifact.label,
        kind: selectedArtifact.kind,
      },
      rawText: selectedArtifactRawText,
    })

    return () => {
      worker.removeEventListener('message', handleMessage as EventListener)
    }
  }, [parsedArtifactCache, selectedArtifact, selectedArtifactRawText])

  const onSelectArtifact = (artifactName: string) => {
    startTransition(() => {
      setSelectedArtifactName(artifactName)
      setParsedBlocks([])
      setParseError(null)
    })
  }

  const resetArtifactView = () => {
    setSelectedBundle('core-outcomes')
    setSelectedArtifactName(null)
    setParsedBlocks([])
    setParsedArtifactCache({})
    setParseError(null)
    setIsParsing(false)
  }

  return {
    artifactQuery,
    isOverviewLoading,
    isParsing,
    onSelectArtifact,
    overviewBlocks,
    overviewBundleOptions,
    parseError,
    parsedBlocks,
    resetArtifactView,
    selectedArtifact,
    selectedArtifactName,
    selectedBundle,
    selectedOverviewBundleMetrics,
    setSelectedBundle,
  }
}
