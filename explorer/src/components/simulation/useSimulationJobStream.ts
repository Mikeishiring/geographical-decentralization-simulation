import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SimulationJob } from '../../lib/simulation-api'

export function useSimulationJobStream(currentJobId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!currentJobId) return

    const stream = new EventSource(`/api/simulations/${currentJobId}/events`)
    const handleSnapshot = (event: MessageEvent<string>) => {
      const snapshot = JSON.parse(event.data) as SimulationJob
      queryClient.setQueryData(['simulation-job', currentJobId], snapshot)
      if (snapshot.manifest) {
        queryClient.setQueryData(['simulation-manifest', currentJobId], snapshot.manifest)
      }
    }

    stream.addEventListener('snapshot', handleSnapshot as EventListener)

    return () => {
      stream.removeEventListener('snapshot', handleSnapshot as EventListener)
      stream.close()
    }
  }, [currentJobId, queryClient])
}
