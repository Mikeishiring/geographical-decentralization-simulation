/**
 * Chart animation utilities — inspired by liveline's animation system.
 *
 * Frame-rate-independent lerp, momentum detection, and staggered reveal
 * helpers for coordinated chart entrance choreography.
 */

/**
 * Frame-rate-independent linear interpolation.
 * `speed` is the fraction approached per 60fps frame (0–1).
 * At lower frame rates, dt is larger so more distance is covered per frame,
 * producing consistent-feeling animations regardless of refresh rate.
 *
 * Usage with Framer Motion's useAnimationFrame:
 *   useAnimationFrame((_, delta) => {
 *     value.set(lerp(value.get(), target, 0.12, delta))
 *   })
 */
export function lerp(current: number, target: number, speed: number, dt = 16.67): number {
  const factor = 1 - Math.pow(1 - speed, dt / 16.67)
  return current + (target - current) * factor
}

/**
 * Momentum detection — analyzes recent values against a window range.
 * Returns a normalized momentum (-1 to 1) and a direction.
 *
 * Liveline uses the last 5 points against the range of the last 20,
 * with a 12% threshold to trigger directional indicators.
 */
export function detectMomentum(
  values: readonly number[],
  recentCount = 5,
  windowCount = 20,
  threshold = 0.12,
): { momentum: number; direction: 'up' | 'down' | 'neutral' } {
  if (values.length < 2) return { momentum: 0, direction: 'neutral' }

  const window = values.slice(-windowCount)
  const recent = values.slice(-recentCount)

  const windowMin = Math.min(...window)
  const windowMax = Math.max(...window)
  const windowRange = windowMax - windowMin

  if (windowRange === 0) return { momentum: 0, direction: 'neutral' }

  const recentDelta = recent[recent.length - 1] - recent[0]
  const normalized = recentDelta / windowRange

  if (Math.abs(normalized) < threshold) return { momentum: normalized, direction: 'neutral' }
  return {
    momentum: normalized,
    direction: normalized > 0 ? 'up' : 'down',
  }
}

/**
 * Smoothstep — Hermite interpolation with smooth start and end.
 * Used for staggered reveal timing where elements appear at different
 * percentages of a single reveal progress value.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Staggered reveal — maps a global progress (0–1) to element-specific
 * opacity/scale values based on threshold ranges.
 *
 * Example: revealAt(progress, 0.15, 0.7) means the element starts
 * appearing at 15% progress and is fully visible at 70%.
 */
export function revealAt(progress: number, start: number, end: number): number {
  return smoothstep(start, end, progress)
}

/**
 * Center-out reveal factor — elements at the center of a range
 * resolve first, edges last. Used for loading-to-data morphs.
 *
 * @param index - Element index in the sequence
 * @param total - Total number of elements
 * @param progress - Global reveal progress (0–1)
 */
export function centerOutReveal(index: number, total: number, progress: number): number {
  if (total <= 1) return progress
  const t = index / (total - 1) // 0 to 1 position in sequence
  const centerDist = Math.abs(t - 0.5) * 2 // 0 at center, 1 at edges
  return smoothstep(centerDist * 0.4, centerDist * 0.4 + 0.6, progress)
}

/**
 * Crosshair opacity that fades near the latest data point.
 * Prevents visual clutter at the chart's leading edge.
 *
 * @param crosshairX - Crosshair x position (in SVG coordinates)
 * @param latestX - Latest data point x position
 * @param fadeDistance - Distance (px) over which to fade
 */
export function crosshairFadeNearLive(
  crosshairX: number,
  latestX: number,
  fadeDistance = 40,
): number {
  const dist = Math.abs(crosshairX - latestX)
  if (dist >= fadeDistance) return 1
  return dist / fadeDistance
}

/**
 * Adaptive lerp speed — small changes interpolate fast (snappy ticks),
 * large jumps interpolate slowly (smooth transitions).
 *
 * @param baseSpeed - Base lerp speed (e.g. 0.08)
 * @param changeMagnitude - Size of the current change
 * @param visibleRange - Total visible range
 */
export function adaptiveSpeed(
  baseSpeed: number,
  changeMagnitude: number,
  visibleRange: number,
): number {
  if (visibleRange === 0) return baseSpeed
  const gapRatio = Math.min(1, Math.abs(changeMagnitude) / visibleRange)
  return baseSpeed + (1 - gapRatio) * 0.2
}

/**
 * Generate breathing sine wave points for skeleton loading states.
 * Creates an organic, living feel instead of static shimmer rectangles.
 *
 * @param width - Chart width in pixels
 * @param height - Chart height in pixels
 * @param time - Animation time (ms) for phase offset
 * @param pointCount - Number of points to generate
 */
export function breathingSineWave(
  width: number,
  height: number,
  time: number,
  pointCount = 60,
): string {
  const scroll = time / 800
  const midY = height / 2
  const amplitude = height * 0.25

  const points: string[] = []
  for (let i = 0; i <= pointCount; i++) {
    const t = i / pointCount
    const x = t * width
    const y =
      midY +
      amplitude * (
        Math.sin(t * 9.4 + scroll) * 0.55 +
        Math.sin(t * 15.7 + scroll * 1.3) * 0.3 +
        Math.sin(t * 4.2 + scroll * 0.7) * 0.15
      )
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return points.join(' ')
}

/**
 * Breathing alpha for loading animations — oscillates gently.
 * Liveline uses: 0.22 + 0.08 * sin(now / 1200 * PI)
 */
export function breathingAlpha(time: number, base = 0.22, range = 0.08): number {
  return base + range * Math.sin((time / 1200) * Math.PI)
}
