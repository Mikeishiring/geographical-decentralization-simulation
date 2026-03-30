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

const EXACT_CHART_ARTIFACT_SPECS = [
  {
    artifactName: 'avg_mev.json',
    label: 'Average MEV',
    description: 'Cumulative average MEV earned per slot.',
    kind: 'timeseries' as const,
  },
  {
    artifactName: 'supermajority_success.json',
    label: 'Supermajority Success',
    description: 'Cumulative successful supermajority rate across slots.',
    kind: 'timeseries' as const,
  },
  {
    artifactName: 'failed_block_proposals.json',
    label: 'Failed Block Proposals',
    description: 'Cumulative failed proposal count.',
    kind: 'timeseries' as const,
  },
  {
    artifactName: 'utility_increase.json',
    label: 'Utility Increase',
    description: 'Per-slot proposer utility increase after migration.',
    kind: 'timeseries' as const,
  },
  {
    artifactName: 'proposal_time_avg.json',
    label: 'Average Proposal Time',
    description: 'Per-slot average proposal time derived from the raw slot traces.',
    kind: 'timeseries' as const,
  },
  {
    artifactName: 'attestation_sum.json',
    label: 'Attestation Sum',
    description: 'Per-slot aggregate attestation values derived from the raw slot traces.',
    kind: 'timeseries' as const,
  },
] as const

function parseNumericSeries(rawText: string): readonly number[] {
  const values = JSON.parse(rawText) as unknown
  if (!Array.isArray(values)) return []
  return values.map(value => (typeof value === 'number' && Number.isFinite(value) ? value : 0))
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

  const exactChartQueries = useQueries({
    queries: EXACT_CHART_ARTIFACT_SPECS.map(spec => {
      const artifact = manifest?.artifacts.find(candidate => candidate.name === spec.artifactName) ?? null
      return {
        queryKey: ['simulation-chart-artifact', currentJobId, spec.artifactName, artifact?.sha256 ?? ''],
        queryFn: async () => parseNumericSeries(await getSimulationArtifact(currentJobId!, spec.artifactName)),
        enabled: Boolean(currentJobId && artifact),
        staleTime: Infinity,
      }
    }),
  })

  const exactChartSeries = EXACT_CHART_ARTIFACT_SPECS.flatMap((spec, index) => {
    const values = exactChartQueries[index]?.data
    return values && values.length > 0
      ? [{
          artifactName: spec.artifactName,
          label: spec.label,
          description: spec.description,
          kind: spec.kind,
          values,
        }]
      : []
  })
  const isExactChartDeckLoading = exactChartQueries.some(query => query.isLoading || query.isFetching)

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
    exactChartSeries,
    isExactChartDeckLoading,
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
