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

/* ── Pastel node data — loosely mapped to real validator regions ── */
const NODES: readonly GlobeNode[] = [
  { lat: 47, lon: 8, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 3.5 },      // Zurich
  { lat: 52, lon: 13, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 3 },        // Berlin
  { lat: 37, lon: -122, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 4 },      // SF
  { lat: 40, lon: -74, color: '#a8e6cf', colorDark: '#b8f0db', radius: 3 },       // NYC
  { lat: 35, lon: 139, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 3.5 },     // Tokyo
  { lat: 1, lon: 104, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 3 },        // Singapore
  { lat: 51, lon: 0, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 3.5 },       // London
  { lat: -34, lon: 151, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.5 },    // Sydney
  { lat: 55, lon: 37, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.5 },      // Moscow
  { lat: 19, lon: 73, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 3 },        // Mumbai
  { lat: -23, lon: -46, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2.5 },    // Sao Paulo
  { lat: 25, lon: 55, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 2.5 },      // Dubai
  { lat: 48, lon: 2, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 2.5 },       // Paris
  { lat: 43, lon: -79, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2.5 },     // Toronto
  { lat: 33, lon: -118, color: '#f6b8d1', colorDark: '#f8c8dc', radius: 2.5 },    // LA
  { lat: 60, lon: 25, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2 },        // Helsinki
  { lat: -1, lon: 37, color: '#ffd3b6', colorDark: '#ffe0c9', radius: 2 },        // Nairobi
  { lat: 22, lon: 114, color: '#a8d8ea', colorDark: '#b8e4f0', radius: 3 },       // Hong Kong
  { lat: 37, lon: 127, color: '#c3b1e1', colorDark: '#d4c5ed', radius: 2.5 },     // Seoul
  { lat: 64, lon: -22, color: '#a8e6cf', colorDark: '#b8f0db', radius: 2 },       // Reykjavik
]

/* ── Wireframe generation ── */
function generateWireframe() {
  const arcs: Vec3[][] = []

  // Latitude lines
  for (let lat = -60; lat <= 60; lat += 30) {
    const arc: Vec3[] = []
    for (let lon = 0; lon <= 360; lon += 6) {
      arc.push(latLonToVec3(lat, lon))
    }
    arcs.push(arc)
  }

  // Longitude lines
  for (let lon = 0; lon < 360; lon += 30) {
    const arc: Vec3[] = []
    for (let lat = -90; lat <= 90; lat += 6) {
      arc.push(latLonToVec3(lat, lon))
    }
    arcs.push(arc)
  }

  return arcs
}

const WIREFRAME_ARCS = generateWireframe()

/* ── Connection config ── */
const CONNECTION_DIST_SQ = 200 * 200
const MAX_CONNECTIONS = 4
const CONNECTION_INTERVAL = 2200

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
    let startTime = performance.now()

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

      // Globe center: right-of-center, below the visible header clip.
      // Canvas is 220% of header height; header clips at ~45% of canvas.
      // Place center at ~55% so we see the top hemisphere with nodes.
      const cx = w * 0.6
      const cy = h * 0.56
      const radius = Math.min(w, h) * 0.44

      // Rotation: slow auto-rotate + subtle mouse influence
      const autoAngle = reducedMotion ? 0 : elapsed * 0.08
      const mouseOffsetX = (mouseRef.current.x - 0.5) * 0.3
      const mouseOffsetY = (mouseRef.current.y - 0.5) * 0.15
      const rotY = autoAngle + mouseOffsetX
      const rotX = -0.2 + mouseOffsetY // slight tilt to show top hemisphere

      const dark = isDarkRef.current

      // ── Draw wireframe arcs ──
      const wireAlpha = dark ? 0.18 : 0.14
      const wireColor = dark ? `rgba(180, 200, 220, ${wireAlpha})` : `rgba(80, 100, 130, ${wireAlpha})`
      ctx!.strokeStyle = wireColor
      ctx!.lineWidth = 0.6

      for (const arc of WIREFRAME_ARCS) {
        ctx!.beginPath()
        let started = false
        for (const point of arc) {
          const rotated = rotateX(rotateY(point, rotY), rotX)
          const p = project(rotated, cx, cy, radius)
          // Only draw front-facing points
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

      // Spawn new connections periodically
      if (now - lastConnectionTimeRef.current > CONNECTION_INTERVAL && connections.length < MAX_CONNECTIONS) {
        const visible = projected.filter(p => p.visible && p.y < h && p.y > 0 && p.x > 0 && p.x < w)
        if (visible.length >= 2) {
          // Find a close pair
          let bestDist = Infinity
          let bestPair: [number, number] | null = null
          for (let i = 0; i < visible.length; i++) {
            for (let j = i + 1; j < visible.length; j++) {
              const dx = visible[i].x - visible[j].x
              const dy = visible[i].y - visible[j].y
              const d = dx * dx + dy * dy
              if (d < CONNECTION_DIST_SQ && d < bestDist) {
                // Avoid duplicates
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
              lifetime: 2000 + Math.random() * 2000,
            })
            lastConnectionTimeRef.current = now
          }
        }
      }

      // ── Draw atmosphere glow — faint halo at globe edge ──
      const atmosGrad = ctx!.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.15)
      atmosGrad.addColorStop(0, 'transparent')
      atmosGrad.addColorStop(0.5, dark ? 'rgba(160, 190, 220, 0.04)' : 'rgba(100, 140, 200, 0.03)')
      atmosGrad.addColorStop(1, 'transparent')
      ctx!.beginPath()
      ctx!.arc(cx, cy, radius * 1.15, 0, Math.PI * 2)
      ctx!.fillStyle = atmosGrad
      ctx!.fill()

      // ── Draw connections as atmospheric arcs ──
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

        // Fade envelope: 20% in, 60% hold, 20% out
        const t = age / conn.lifetime
        let alpha: number
        if (t < 0.2) alpha = t / 0.2
        else if (t > 0.8) alpha = (1 - t) / 0.2
        else alpha = 1

        // Arc control point: midpoint pushed outward from globe center
        const midX = (fromP.x + toP.x) / 2
        const midY = (fromP.y + toP.y) / 2
        const dx = midX - cx
        const dy = midY - cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        // Push the arc outward into the "atmosphere" above the surface
        const liftAmount = radius * 0.35
        const cpX = midX + (dx / dist) * liftAmount
        const cpY = midY + (dy / dist) * liftAmount

        const nodeColor = dark ? NODES[conn.from].colorDark : NODES[conn.from].color
        ctx!.beginPath()
        ctx!.moveTo(fromP.x, fromP.y)
        ctx!.quadraticCurveTo(cpX, cpY, toP.x, toP.y)
        ctx!.strokeStyle = nodeColor
        ctx!.globalAlpha = alpha * 0.55
        ctx!.lineWidth = 1.2
        ctx!.stroke()
        ctx!.globalAlpha = 1
      }

      // ── Draw nodes ──
      for (const p of projected) {
        if (!p.visible) continue
        if (p.y < -10 || p.y > h + 10 || p.x < -10 || p.x > w + 10) continue

        const node = NODES[p.idx]
        const color = dark ? node.colorDark : node.color
        const depthAlpha = 0.5 + p.z * 0.5 // Brighter when facing camera
        const r = node.radius * (0.85 + p.z * 0.35) // Larger when facing camera

        // Glow
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r * 3.5, 0, Math.PI * 2)
        ctx!.fillStyle = color
        ctx!.globalAlpha = depthAlpha * 0.15
        ctx!.fill()

        // Core dot
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx!.fillStyle = color
        ctx!.globalAlpha = depthAlpha * 0.85
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
