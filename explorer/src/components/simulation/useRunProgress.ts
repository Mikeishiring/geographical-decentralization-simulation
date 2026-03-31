import { useEffect, useState } from 'react'
import type { RunnerStatus } from './simulation-lab-types'

export function useElapsedSeconds(startIso: string | undefined, active: boolean): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active || !startIso) {
      setElapsed(0)
      return
    }

    const startMs = new Date(startIso).getTime()
    if (Number.isNaN(startMs)) return

    const tick = () => setElapsed(Math.max(0, (Date.now() - startMs) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startIso, active])

  return elapsed
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`
}

export function estimateRunProgress(
  status: RunnerStatus,
  queuePosition: number | null,
  elapsedSeconds: number,
  estimatedSeconds: number,
): number {
  if (status === 'idle') return 0
  if (status === 'submitting') return 12
  if (status === 'queued') {
    if (queuePosition == null) return 26
    return Math.max(24, Math.min(46, 44 - Math.min(queuePosition, 6) * 3))
  }
  if (status === 'running') {
    if (estimatedSeconds <= 0) return 60
    const ratio = elapsedSeconds / estimatedSeconds
    return Math.max(50, Math.min(95, Math.round(50 + ratio * 45)))
  }
  return 100
}
