import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  fetchResultsWarehouseMetadata,
  type TableMeta,
} from '../lib/results-warehouse-api'

export interface ResultsWarehouseState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
  readonly tables: readonly TableMeta[]
  readonly loadedRunLabels: readonly string[]
  readonly publishedRunCount: number
  readonly exactRunId: string | null
  readonly generatedAt: string | null
  readonly refresh: () => void
}

export interface UseResultsWarehouseOptions {
  readonly currentJobId?: string | null
}

export function useResultsWarehouse(options: UseResultsWarehouseOptions = {}): ResultsWarehouseState {
  const normalizedOptions = useMemo(() => ({
    currentJobId: options.currentJobId?.trim() || null,
  }), [options.currentJobId])
  const [reloadToken, setReloadToken] = useState(0)

  const [state, setState] = useState<ResultsWarehouseState>({
    status: 'idle',
    error: null,
    tables: [],
    loadedRunLabels: [],
    publishedRunCount: 0,
    exactRunId: null,
    generatedAt: null,
    refresh: () => undefined,
  })

  const refresh = useCallback(() => {
    setReloadToken(current => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    setState(previous => ({
      ...previous,
      status: 'loading',
      error: null,
    }))

    fetchResultsWarehouseMetadata({
      currentJobId: normalizedOptions.currentJobId,
    })
      .then(metadata => {
        if (cancelled) return
        setState({
          status: 'ready',
          error: null,
          tables: metadata.tables,
          loadedRunLabels: metadata.loaded_run_labels,
          publishedRunCount: metadata.published_run_count,
          exactRunId: metadata.exact_run_id,
          generatedAt: metadata.generated_at,
          refresh,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState(previous => ({
          ...previous,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }))
      })

    return () => {
      cancelled = true
    }
  }, [normalizedOptions.currentJobId, refresh, reloadToken])

  return {
    ...state,
    refresh,
  }
}
