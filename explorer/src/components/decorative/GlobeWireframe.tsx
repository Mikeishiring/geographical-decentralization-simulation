import { useRef, useEffect, useCallback } from 'react'

/* ── Types ── */
type Vec3 = readonly [number, number, number]

interface GlobeNode {
  readonly lat: number
  readonly lon: number
  readonly color: string
  readonly colorDark: string
  readonly radius: number
}

interface ActiveConnection {
  readonly from: number
  readonly to: number
  birth: number
  readonly lifetime: number
}

/* ── 3D math ── */
function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
}

function latLonToVec3(lat: number, lon: number): Vec3 {
  const lr = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  return [Math.cos(lr) * Math.sin(lo), -Math.sin(lr), Math.cos(lr) * Math.cos(lo)]
}

function project(v: Vec3, cx: number, cy: number, scale: number) {
  return { x: cx + v[0] * scale, y: cy - v[1] * scale, z: v[2] }
}

/*
 * ── Node positions — aesthetic spread for visual balance ──
 * Evenly distributed across the sphere in latitude bands so every
 * rotation shows a clean mix of sizes and colors. Not geographically
 * accurate — optimized for no clumping and pleasant spacing.
 */
const NODES: readonly GlobeNode[] = [
  // Northern band (lat 55–65)
  { lat: 62, lon: -20, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.2 },
  { lat: 58, lon: 25, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 2.5 },
  { lat: 60, lon: 90, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 2 },
  { lat: 56, lon: 155, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.3 },
  { lat: 58, lon: -110, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 2 },
  // Upper-mid band (lat 38–50) — densest ring
  { lat: 48, lon: -5, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 3.5 },
  { lat: 45, lon: 30, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 3 },
  { lat: 42, lon: 70, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.8 },
  { lat: 40, lon: 120, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 3.2 },
  { lat: 44, lon: 170, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.5 },
  { lat: 42, lon: -75, color: '#a8e6cf', colorDark: '#b8f0db', radius: 3.2 },
  { lat: 38, lon: -120, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 3.8 },
  { lat: 46, lon: -160, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 2 },
  // Equatorial band (lat −10 to 20)
  { lat: 18, lon: -10, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.5 },
  { lat: 5, lon: 40, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 2.8 },
  { lat: 12, lon: 80, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 3 },
  { lat: -2, lon: 115, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 3 },
  { lat: 15, lon: 150, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.2 },
  { lat: 8, lon: -65, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.5 },
  { lat: -5, lon: -40, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.3 },
  // Southern band (lat −25 to −40) — sparser
  { lat: -30, lon: -50, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.5 },
  { lat: -35, lon: 20, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 2.2 },
  { lat: -28, lon: 80, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 2 },
  { lat: -33, lon: 150, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.5 },
  { lat: -25, lon: -100, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 2 },
  { lat: -38, lon: -170, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 2.2 },
]

/* ── Denser wireframe — 20° spacing instead of 30° ── */
function generateWireframe() {
  const arcs: Vec3[][] = []

  // Latitude lines — every 20°
  for (let lat = -60; lat <= 60; lat += 20) {
    const arc: Vec3[] = []
    for (let lon = 0; lon <= 360; lon += 5) {
      arc.push(latLonToVec3(lat, lon))
    }
    arcs.push(arc)
  }

  // Longitude lines — every 20°
  for (let lon = 0; lon < 360; lon += 20) {
    const arc: Vec3[] = []
    for (let lat = -90; lat <= 90; lat += 5) {
      arc.push(latLonToVec3(lat, lon))
    }
    arcs.push(arc)
  }

  return arcs
}

const WIREFRAME_ARCS = generateWireframe()

/* ── Connection config ── */
const CONNECTION_DIST_SQ = 260 * 260
const MAX_CONNECTIONS = 6
const CONNECTION_INTERVAL = 1600

/* ── Component ── */
export function GlobeWireframe({ className = '' }: { readonly className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const connectionsRef = useRef<ActiveConnection[]>([])
  const lastConnectionTimeRef = useRef(0)
  const isDarkRef = useRef(false)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Dark mode detection
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    isDarkRef.current = mql.matches
    const handleChange = (e: MediaQueryListEvent) => { isDarkRef.current = e.matches }
    mql.addEventListener('change', handleChange)

    // Resize handler
    function resize() {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    // Visibility-based pause
    let paused = false
    const handleVisibility = () => { paused = document.hidden }
    document.addEventListener('visibilitychange', handleVisibility)

    // Reduced motion
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Node 3D positions (cached)
    const nodeVecs = NODES.map(n => latLonToVec3(n.lat, n.lon))

    // Animation loop
    const startTime = performance.now()

    function draw(now: number) {
      if (paused) {
        frameRef.current = requestAnimationFrame(draw)
        return
      }

      const elapsed = (now - startTime) / 1000
      const rect = canvas!.getBoundingClientRect()
      const w = rect.width
      const h = rect.height

      ctx!.clearRect(0, 0, w, h)

      // Globe center: right-of-center, vertically centered
      const cx = w * 0.62
      const cy = h * 0.5
      const radius = Math.min(w * 0.35, h * 0.7)

      // Rotation: slow auto-rotate + subtle mouse parallax
      const autoAngle = reducedMotion ? 0 : elapsed * 0.07
      const mouseOffsetX = (mouseRef.current.x - 0.5) * 0.25
      const mouseOffsetY = (mouseRef.current.y - 0.5) * 0.12
      const rotY = autoAngle + mouseOffsetX
      const rotX = -0.18 + mouseOffsetY

      const dark = isDarkRef.current

      // ── Draw wireframe arcs ──
      const wireAlpha = dark ? 0.24 : 0.28
      const wireColor = dark
        ? `rgba(180, 200, 220, ${wireAlpha})`
        : `rgba(70, 100, 150, ${wireAlpha})`
      ctx!.strokeStyle = wireColor
      ctx!.lineWidth = 0.6

      for (const arc of WIREFRAME_ARCS) {
        ctx!.beginPath()
        let started = false
        for (const point of arc) {
          const rotated = rotateX(rotateY(point, rotY), rotX)
          const p = project(rotated, cx, cy, radius)
          if (p.z > -0.1) {
            if (!started) {
              ctx!.moveTo(p.x, p.y)
              started = true
            } else {
              ctx!.lineTo(p.x, p.y)
            }
          } else {
            started = false
          }
        }
        ctx!.stroke()
      }

      // ── Project nodes ──
      const projected = nodeVecs.map((v, i) => {
        const rotated = rotateX(rotateY(v, rotY), rotX)
        const p = project(rotated, cx, cy, radius)
        return { ...p, idx: i, visible: p.z > 0 }
      })

      // ── Manage connections ──
      const connections = connectionsRef.current

      if (now - lastConnectionTimeRef.current > CONNECTION_INTERVAL && connections.length < MAX_CONNECTIONS) {
        const visible = projected.filter(p => p.visible && p.y < h && p.y > 0 && p.x > 0 && p.x < w)
        if (visible.length >= 2) {
          let bestDist = Infinity
          let bestPair: [number, number] | null = null
          for (let i = 0; i < visible.length; i++) {
            for (let j = i + 1; j < visible.length; j++) {
              const dx = visible[i].x - visible[j].x
              const dy = visible[i].y - visible[j].y
              const d = dx * dx + dy * dy
              if (d < CONNECTION_DIST_SQ && d < bestDist) {
                const fi = visible[i].idx, ti = visible[j].idx
                const exists = connections.some(c => (c.from === fi && c.to === ti) || (c.from === ti && c.to === fi))
                if (!exists) {
                  bestDist = d
                  bestPair = [fi, ti]
                }
              }
            }
          }
          if (bestPair) {
            connections.push({
              from: bestPair[0],
              to: bestPair[1],
              birth: now,
              lifetime: 2500 + Math.random() * 2500,
            })
            lastConnectionTimeRef.current = now
          }
        }
      }

      // ── Draw atmosphere glow — visible halo at globe edge ──
      const atmosGrad = ctx!.createRadialGradient(cx, cy, radius * 0.88, cx, cy, radius * 1.2)
      atmosGrad.addColorStop(0, 'transparent')
      atmosGrad.addColorStop(0.4, dark ? 'rgba(150, 185, 220, 0.06)' : 'rgba(90, 130, 200, 0.06)')
      atmosGrad.addColorStop(0.7, dark ? 'rgba(150, 185, 220, 0.04)' : 'rgba(90, 130, 200, 0.04)')
      atmosGrad.addColorStop(1, 'transparent')
      ctx!.beginPath()
      ctx!.arc(cx, cy, radius * 1.2, 0, Math.PI * 2)
      ctx!.fillStyle = atmosGrad
      ctx!.fill()

      // ── Draw connections as inward-bowing arcs ──
      for (let i = connections.length - 1; i >= 0; i--) {
        const conn = connections[i]
        const age = now - conn.birth
        if (age > conn.lifetime) {
          connections.splice(i, 1)
          continue
        }

        const fromP = projected[conn.from]
        const toP = projected[conn.to]
        if (!fromP.visible || !toP.visible) continue

        // Fade envelope: smooth in/out
        const t = age / conn.lifetime
        let alpha: number
        if (t < 0.15) alpha = t / 0.15
        else if (t > 0.8) alpha = (1 - t) / 0.2
        else alpha = 1

        // Control point pulled inward toward globe center — geodesic sag
        const midX = (fromP.x + toP.x) / 2
        const midY = (fromP.y + toP.y) / 2
        const dx = midX - cx
        const dy = midY - cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const sagAmount = radius * 0.2
        const cpX = midX - (dx / dist) * sagAmount
        const cpY = midY - (dy / dist) * sagAmount

        const nodeColor = dark ? NODES[conn.from].colorDark : NODES[conn.from].color
        ctx!.beginPath()
        ctx!.moveTo(fromP.x, fromP.y)
        ctx!.quadraticCurveTo(cpX, cpY, toP.x, toP.y)
        ctx!.strokeStyle = nodeColor
        ctx!.globalAlpha = alpha * 0.5
        ctx!.lineWidth = 1
        ctx!.stroke()
        ctx!.globalAlpha = 1
      }

      // ── Draw nodes with subtle breathing pulse ──
      const breathe = 1 + Math.sin(elapsed * 1.8) * 0.08

      for (const p of projected) {
        if (!p.visible) continue
        if (p.y < -10 || p.y > h + 10 || p.x < -10 || p.x > w + 10) continue

        const node = NODES[p.idx]
        const color = dark ? node.colorDark : node.color
        const depthAlpha = 0.55 + p.z * 0.45
        const r = node.radius * (0.9 + p.z * 0.35) * breathe

        // Outer glow
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r * 4.5, 0, Math.PI * 2)
        ctx!.fillStyle = color
        ctx!.globalAlpha = depthAlpha * 0.12
        ctx!.fill()

        // Inner glow
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2)
        ctx!.fillStyle = color
        ctx!.globalAlpha = depthAlpha * 0.25
        ctx!.fill()

        // Core dot
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx!.fillStyle = color
        ctx!.globalAlpha = depthAlpha * 0.92
        ctx!.fill()

        ctx!.globalAlpha = 1
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frameRef.current)
      resizeObserver.disconnect()
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('visibilitychange', handleVisibility)
      mql.removeEventListener('change', handleChange)
    }
  }, [handleMouseMove])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width: '100%', height: '100%' }}
    />
  )
}
