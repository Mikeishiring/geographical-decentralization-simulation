interface Node {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly color: string
  readonly opacity: number
}

/* ── Full network — header hero ── */
const NODES_FULL: readonly Node[] = [
  { x: 50, y: 10, r: 2.5, color: 'var(--color-accent)', opacity: 0.5 },
  { x: 20, y: 30, r: 2, color: 'var(--color-accent-warm)', opacity: 0.4 },
  { x: 80, y: 30, r: 2, color: 'var(--color-accent)', opacity: 0.4 },
  { x: 35, y: 55, r: 2, color: 'var(--color-accent)', opacity: 0.35 },
  { x: 65, y: 55, r: 2, color: 'var(--color-success)', opacity: 0.35 },
  { x: 10, y: 75, r: 1.5, color: 'var(--color-accent)', opacity: 0.3 },
  { x: 50, y: 75, r: 2.5, color: 'var(--color-accent-warm)', opacity: 0.45 },
  { x: 90, y: 75, r: 1.5, color: 'var(--color-accent)', opacity: 0.3 },
]

const EDGES_FULL: readonly [number, number][] = [
  [0, 1], [0, 2],
  [1, 3], [2, 4],
  [3, 4], [1, 4], [2, 3],
  [3, 5], [3, 6], [4, 6], [4, 7],
  [5, 6], [6, 7],
]

/* ── Compact network — section backgrounds + empty states ── */
const NODES_COMPACT: readonly Node[] = [
  { x: 25, y: 20, r: 2, color: 'var(--color-accent)', opacity: 0.35 },
  { x: 75, y: 15, r: 1.5, color: 'var(--color-accent-warm)', opacity: 0.3 },
  { x: 50, y: 50, r: 2.5, color: 'var(--color-accent)', opacity: 0.4 },
  { x: 15, y: 80, r: 1.5, color: 'var(--color-success)', opacity: 0.25 },
  { x: 85, y: 75, r: 2, color: 'var(--color-accent-warm)', opacity: 0.3 },
]

const EDGES_COMPACT: readonly [number, number][] = [
  [0, 2], [1, 2], [2, 3], [2, 4], [0, 3], [1, 4],
]

/* ── Sparse dots — decorative scatter for wide backgrounds ── */
const NODES_SPARSE: readonly Node[] = [
  { x: 12, y: 35, r: 1.5, color: 'var(--color-accent)', opacity: 0.2 },
  { x: 38, y: 18, r: 1, color: 'var(--color-accent-warm)', opacity: 0.18 },
  { x: 62, y: 72, r: 1.5, color: 'var(--color-success)', opacity: 0.15 },
  { x: 88, y: 42, r: 1, color: 'var(--color-accent)', opacity: 0.18 },
]

const EDGES_SPARSE: readonly [number, number][] = [
  [0, 1], [1, 3], [2, 3],
]

type Variant = 'full' | 'compact' | 'sparse'

const VARIANT_DATA: Record<Variant, { nodes: readonly Node[]; edges: readonly [number, number][] }> = {
  full: { nodes: NODES_FULL, edges: EDGES_FULL },
  compact: { nodes: NODES_COMPACT, edges: EDGES_COMPACT },
  sparse: { nodes: NODES_SPARSE, edges: EDGES_SPARSE },
}

interface ConstellationProps {
  readonly className?: string
  /** Network density: full (header), compact (sections), sparse (wide bgs) */
  readonly variant?: Variant
  /** Base edge stroke width — scales with variant */
  readonly strokeWidth?: number
}

/** Faint dot-and-line network evoking validators spread across geography.
 *  Uses CSS animation instead of framer-motion so it works regardless of scroll position. */
export function NodeConstellation({
  className = '',
  variant = 'full',
  strokeWidth,
}: ConstellationProps) {
  const { nodes, edges } = VARIANT_DATA[variant]
  const sw = strokeWidth ?? (variant === 'sparse' ? 0.25 : 0.35)

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {edges.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="var(--color-meridian)"
          strokeWidth={sw}
          opacity="0.25"
        />
      ))}
      {nodes.map((node, i) => (
        <circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill={node.color}
          opacity={node.opacity}
        >
          {/* Gentle pulse on each node — staggered by index */}
          <animate
            attributeName="r"
            values={`${node.r};${node.r * 1.3};${node.r}`}
            dur={`${3 + i * 0.4}s`}
            repeatCount="indefinite"
            begin={`${i * 0.3}s`}
          />
          <animate
            attributeName="opacity"
            values={`${node.opacity};${node.opacity * 0.6};${node.opacity}`}
            dur={`${3 + i * 0.4}s`}
            repeatCount="indefinite"
            begin={`${i * 0.3}s`}
          />
        </circle>
      ))}
    </svg>
  )
}
