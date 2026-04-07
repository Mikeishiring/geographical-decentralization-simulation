/**
 * Static SVG globe wireframe with pastel nodes — lightweight echo of the
 * animated header GlobeWireframe. Used in empty states, footers, and
 * other secondary locations where a full Canvas animation would be excessive.
 *
 * Props control size via className. The SVG scales to fill its container.
 */

/* ── 3D math (mirrored from GlobeWireframe, kept minimal) ── */
type Vec3 = readonly [number, number, number]

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

/* ── Static projection at a fixed rotation ── */
const ROT_Y = 0.4 // Slight rotation so Europe/Africa faces forward
const ROT_X = -0.15 // Slight tilt to show northern hemisphere
const VIEWBOX = 200
const CX = VIEWBOX / 2
const CY = VIEWBOX / 2
const RADIUS = 85

function projectPoint(lat: number, lon: number) {
  const v = latLonToVec3(lat, lon)
  const ry = rotateY(v, ROT_Y)
  const rxry = rotateX(ry, ROT_X)
  return {
    x: CX + rxry[0] * RADIUS,
    y: CY - rxry[1] * RADIUS,
    z: rxry[2],
  }
}

/* ── Generate wireframe arc paths (front-face only) ── */
function generateArcPath(points: Array<{ x: number; y: number; z: number }>) {
  let d = ''
  let drawing = false
  for (const p of points) {
    if (p.z > -0.05) {
      d += drawing ? `L${p.x.toFixed(1)} ${p.y.toFixed(1)} ` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)} `
      drawing = true
    } else {
      drawing = false
    }
  }
  return d
}

function buildWireframePaths() {
  const paths: string[] = []

  // Latitude lines
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = []
    for (let lon = 0; lon <= 360; lon += 6) {
      points.push(projectPoint(lat, lon))
    }
    const d = generateArcPath(points)
    if (d) paths.push(d)
  }

  // Longitude lines
  for (let lon = 0; lon < 360; lon += 30) {
    const points = []
    for (let lat = -90; lat <= 90; lat += 6) {
      points.push(projectPoint(lat, lon))
    }
    const d = generateArcPath(points)
    if (d) paths.push(d)
  }

  return paths
}

const WIREFRAME_PATHS = buildWireframePaths()

/* ── Node positions + pastel colors ── */
const NODES = [
  { lat: 47, lon: 8, color: '#c3b1e1' },    // Zurich
  { lat: 52, lon: 13, color: '#a8d8ea' },    // Berlin
  { lat: 51, lon: 0, color: '#c3b1e1' },     // London
  { lat: 37, lon: -122, color: '#ffd3b6' },  // SF
  { lat: 40, lon: -74, color: '#a8e6cf' },   // NYC
  { lat: 35, lon: 139, color: '#f6b8d1' },   // Tokyo
  { lat: 1, lon: 104, color: '#a8d8ea' },    // Singapore
  { lat: 19, lon: 73, color: '#f6b8d1' },    // Mumbai
  { lat: 48, lon: 2, color: '#a8d8ea' },     // Paris
  { lat: 55, lon: 37, color: '#a8e6cf' },    // Moscow
  { lat: 22, lon: 114, color: '#a8d8ea' },   // Hong Kong
  { lat: 64, lon: -22, color: '#a8e6cf' },   // Reykjavik
].map(n => {
  const p = projectPoint(n.lat, n.lon)
  return { ...p, color: n.color, visible: p.z > 0.05 }
})

/* ── One atmospheric arc between two visible close nodes ── */
function buildConnectionArc() {
  const visible = NODES.filter(n => n.visible)
  let bestDist = Infinity
  let bestPair: [typeof visible[0], typeof visible[0]] | null = null

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const dx = visible[i].x - visible[j].x
      const dy = visible[i].y - visible[j].y
      const d = dx * dx + dy * dy
      if (d < 60 * 60 && d > 15 * 15 && d < bestDist) {
        bestDist = d
        bestPair = [visible[i], visible[j]]
      }
    }
  }

  if (!bestPair) return null

  const [a, b] = bestPair
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const dx = midX - CX
  const dy = midY - CY
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const lift = RADIUS * 0.3
  const cpX = midX + (dx / dist) * lift
  const cpY = midY + (dy / dist) * lift

  return { d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cpX.toFixed(1)} ${cpY.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, color: a.color }
}

const CONNECTION = buildConnectionArc()

/* ── Component ── */
interface GlobeNetworkProps {
  readonly className?: string
  /** Flip vertically — used for footer bookend effect */
  readonly flip?: boolean
}

export function GlobeNetwork({ className = '', flip = false }: GlobeNetworkProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
    >
      {/* Atmosphere glow */}
      <defs>
        <radialGradient id="globe-atmos" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r={RADIUS * 1.1} fill="url(#globe-atmos)" />

      {/* Wireframe */}
      {WIREFRAME_PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="currentColor"
          strokeWidth="0.4"
          opacity="0.15"
          fill="none"
        />
      ))}

      {/* Atmospheric connection arc */}
      {CONNECTION && (
        <path
          d={CONNECTION.d}
          stroke={CONNECTION.color}
          strokeWidth="0.8"
          opacity="0.4"
          fill="none"
        />
      )}

      {/* Nodes — with breathing glow animation */}
      {NODES.filter(n => n.visible).map((node, i) => {
        const alpha = 0.4 + node.z * 0.5
        const r = 1.8 + node.z * 1.2
        const dur = `${3.0 + i * 0.3}s`
        return (
          <g key={i}>
            {/* Glow */}
            <circle cx={node.x} cy={node.y} r={r * 3} fill={node.color} opacity={alpha * 0.12}>
              <animate attributeName="opacity" values={`${(alpha * 0.12).toFixed(3)};${(alpha * 0.24).toFixed(3)};${(alpha * 0.12).toFixed(3)}`} dur={dur} repeatCount="indefinite" />
            </circle>
            {/* Core */}
            <circle cx={node.x} cy={node.y} r={r} fill={node.color} opacity={alpha * 0.8}>
              <animate attributeName="opacity" values={`${(alpha * 0.8).toFixed(2)};${Math.min(1, alpha * 1.1).toFixed(2)};${(alpha * 0.8).toFixed(2)}`} dur={dur} repeatCount="indefinite" />
              <animate attributeName="r" values={`${r.toFixed(1)};${(r * 1.12).toFixed(1)};${r.toFixed(1)}`} dur={dur} repeatCount="indefinite" />
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
