interface Node {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly color: string
  readonly opacity: number
}

/* Nodes placed on a rough hexagonal grid to evoke a distributed network topology */
const NODES: readonly Node[] = [
  { x: 50, y: 10, r: 2.5, color: 'var(--color-accent)', opacity: 0.5 },
  { x: 20, y: 30, r: 2, color: 'var(--color-accent-warm)', opacity: 0.4 },
  { x: 80, y: 30, r: 2, color: 'var(--color-accent)', opacity: 0.4 },
  { x: 35, y: 55, r: 2, color: 'var(--color-accent)', opacity: 0.35 },
  { x: 65, y: 55, r: 2, color: 'var(--color-success)', opacity: 0.35 },
  { x: 10, y: 75, r: 1.5, color: 'var(--color-accent)', opacity: 0.3 },
  { x: 50, y: 75, r: 2.5, color: 'var(--color-accent-warm)', opacity: 0.45 },
  { x: 90, y: 75, r: 1.5, color: 'var(--color-accent)', opacity: 0.3 },
]

/* Edges form a connected mesh — every node reachable from every other */
const EDGES: readonly [number, number][] = [
  [0, 1], [0, 2],
  [1, 3], [2, 4],
  [3, 4], [1, 4], [2, 3],
  [3, 5], [3, 6], [4, 6], [4, 7],
  [5, 6], [6, 7],
]

/** Faint dot-and-line network evoking validators spread across geography.
 *  Uses CSS animation instead of framer-motion so it works regardless of scroll position. */
export function NodeConstellation({ className = '' }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {EDGES.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={NODES[a].x}
          y1={NODES[a].y}
          x2={NODES[b].x}
          y2={NODES[b].y}
          stroke="var(--color-meridian)"
          strokeWidth="0.35"
          opacity="0.25"
        />
      ))}
      {NODES.map((node, i) => (
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
