import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Auto-hides UI chrome after a period of inactivity within a container.
 * Returns `visible` (true while the user is active, false after idle timeout).
 * Mouse movement, scroll, or keyboard activity resets the timer.
 */
export function useFadeOnIdle(
  containerRef: React.RefObject<HTMLElement | null>,
  {
    idleMs = 2800,
    enabled = true,
  }: { idleMs?: number; enabled?: boolean } = {},
) {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetTimer = useCallback(() => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), idleMs)
  }, [idleMs])

  useEffect(() => {
    if (!enabled) {
      setVisible(true)
      return
    }

    const container = containerRef.current
    if (!container) return

    // Start the idle timer immediately
    resetTimer()

    const handleActivity = () => resetTimer()

    container.addEventListener('mousemove', handleActivity, { passive: true })
    container.addEventListener('scroll', handleActivity, { passive: true, capture: true })
    container.addEventListener('keydown', handleActivity, { passive: true })
    container.addEventListener('touchstart', handleActivity, { passive: true })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      container.removeEventListener('mousemove', handleActivity)
      container.removeEventListener('scroll', handleActivity, { capture: true })
      container.removeEventListener('keydown', handleActivity)
      container.removeEventListener('touchstart', handleActivity)
    }
  }, [containerRef, enabled, resetTimer])

  /** Force-show the chrome (e.g. when opening annotation form) */
  const show = useCallback(() => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { visible, show } as const
}
