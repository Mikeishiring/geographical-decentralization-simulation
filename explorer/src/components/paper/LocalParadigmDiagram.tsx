import { motion } from 'framer-motion'
import { STAGGER_CONTAINER, STAGGER_ITEM, SPRING_CRISP } from '../../lib/theme'

/*
 * Visual recreation of the "Local block-building" paradigm diagram from the paper.
 *
 * Phase 1 (left):  Signal sources in regions r1..r3 send value signals to the proposer in rk.
 * Phase 2 (right): Proposer propagates the assembled block to attesters across all regions.
 *
 * Pure SVG — no Canvas, no external assets. Matches the paper section card aesthetic.
 */

const WARM = '#C2553A'       // accent-warm — Local paradigm
const SIGNAL_GREEN = '#16A34A'
const ATTEST_BLUE = '#2563EB'

/* ── Region layout constants ── */
interface RegionDef {
  readonly label: string
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
}

/* Phase 1: Signal gathering — proposer is center, sources surround */
const P1_REGIONS: readonly RegionDef[] = [
  { label: 'r\u2081', cx: 70,  cy: 60,  rx: 55, ry: 38 },
  { label: 'r\u2082', cx: 70,  cy: 160, rx: 55, ry: 38 },
  { label: 'r\u2096', cx: 195, cy: 110, rx: 62, ry: 45 },
  { label: 'r\u2083', cx: 305, cy: 160, rx: 55, ry: 38 },
]

/* Phase 2: Block propagation — proposer broadcasts to attester clusters */
const P2_REGIONS: readonly RegionDef[] = [
  { label: 'r\u2081', cx: 70,  cy: 60,  rx: 55, ry: 38 },
  { label: 'r\u2082', cx: 70,  cy: 160, rx: 55, ry: 38 },
  { label: 'r\u2096', cx: 195, cy: 110, rx: 62, ry: 45 },
  { label: 'r\u2083', cx: 305, cy: 160, rx: 55, ry: 38 },
]

/* ── Signal source positions (Phase 1) ── */
interface NodePos {
  readonly x: number
  readonly y: number
}

const SIGNAL_SOURCES: readonly NodePos[] = [
  { x: 70,  y: 60 },   // r1
  { x: 70,  y: 160 },  // r2
  { x: 305, y: 160 },  // r3
]

const PROPOSER_P1: NodePos = { x: 195, y: 110 }

/* ── Attester cluster positions (Phase 2) ── */
interface AttesterCluster {
  readonly positions: readonly NodePos[]
}

const ATTESTER_CLUSTERS: readonly AttesterCluster[] = [
  { positions: [{ x: 52, y: 50 }, { x: 88, y: 50 }, { x: 60, y: 72 }, { x: 80, y: 72 }] },   // r1
  { positions: [{ x: 52, y: 150 }, { x: 88, y: 150 }, { x: 60, y: 172 }, { x: 80, y: 172 }] }, // r2
  { positions: [{ x: 285, y: 150 }, { x: 318, y: 150 }, { x: 296, y: 172 }, { x: 316, y: 172 }] }, // r3
]

const PROPOSER_P2: NodePos = { x: 195, y: 110 }
const PROPOSER_ATTESTERS: readonly NodePos[] = [
  { x: 175, y: 95 }, { x: 215, y: 95 }, { x: 180, y: 128 }, { x: 210, y: 128 },
]

/* ── SVG sub-components ── */

function DashedRegion({ region, id }: { readonly region: RegionDef; readonly id: string }) {
  return (
    <g>
      <ellipse
        cx={region.cx}
        cy={region.cy}
        rx={region.rx}
        ry={region.ry}
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.5"
      />
      <text
        x={region.cx}
        y={region.cy + region.ry + 14}
        textAnchor="middle"
        fill="#64748b"
        fontSize="11"
        fontFamily="'Inter', system-ui, sans-serif"
        fontStyle="italic"
      >
        Region {region.label}
      </text>
      {/* Small region id for defs reference */}
      <title>{id}</title>
    </g>
  )
}

function SignalNode({ x, y, delay = 0 }: { readonly x: number; readonly y: number; readonly delay?: number }) {
  return (
    <g>
      {/* Glow */}
      <circle cx={x} cy={y} r="12" fill={SIGNAL_GREEN} opacity="0.08">
        <animate
          attributeName="r"
          values="12;15;12"
          dur="3s"
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.08;0.14;0.08"
          dur="3s"
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
      </circle>
      {/* Core */}
      <circle cx={x} cy={y} r="7" fill="white" stroke={SIGNAL_GREEN} strokeWidth="1.5" />
      {/* Dollar sign */}
      <text
        x={x}
        y={y + 3.5}
        textAnchor="middle"
        fill={SIGNAL_GREEN}
        fontSize="8"
        fontFamily="'SF Mono', Menlo, ui-monospace, monospace"
        fontWeight="600"
      >
        $
      </text>
    </g>
  )
}

function ProposerNode({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g>
      {/* Warm glow */}
      <circle cx={x} cy={y} r="16" fill={WARM} opacity="0.1">
        <animate attributeName="r" values="16;19;16" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.1;0.16;0.1" dur="4s" repeatCount="indefinite" />
      </circle>
      {/* Body */}
      <circle cx={x} cy={y} r="10" fill={WARM} opacity="0.15" />
      <circle cx={x} cy={y} r="10" fill="white" stroke={WARM} strokeWidth="1.5" />
      {/* Code brackets icon */}
      <text
        x={x}
        y={y + 3}
        textAnchor="middle"
        fill={WARM}
        fontSize="9"
        fontFamily="'SF Mono', Menlo, ui-monospace, monospace"
        fontWeight="700"
      >
        {'</>'}
      </text>
    </g>
  )
}

function AttesterNode({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="6" fill="white" stroke={ATTEST_BLUE} strokeWidth="1.2" />
      {/* Checkmark */}
      <path
        d={`M${x - 2.5} ${y + 0.5} l2 2 l3 -3.5`}
        fill="none"
        stroke={ATTEST_BLUE}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

function SignalArrow({ from, to, delay = 0 }: { readonly from: NodePos; readonly to: NodePos; readonly delay?: number }) {
  // Shorten arrow to not overlap nodes
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = dx / len
  const ny = dy / len
  const startX = from.x + nx * 10
  const startY = from.y + ny * 10
  const endX = to.x - nx * 14
  const endY = to.y - ny * 14

  return (
    <g>
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={SIGNAL_GREEN}
        strokeWidth="1.2"
        strokeDasharray="4 3"
        opacity="0.5"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-14"
          dur="1.5s"
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
      </line>
      {/* Arrowhead */}
      <polygon
        points={arrowHead(endX, endY, nx, ny, 5)}
        fill={SIGNAL_GREEN}
        opacity="0.6"
      />
    </g>
  )
}

function PropagationArrow({ from, to, delay = 0 }: { readonly from: NodePos; readonly to: NodePos; readonly delay?: number }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = dx / len
  const ny = dy / len
  const startX = from.x + nx * 14
  const startY = from.y + ny * 14
  // Point toward the center of the cluster (stop before the region boundary)
  const endX = to.x - nx * 18
  const endY = to.y - ny * 18

  // Curve outward for visual clarity
  const perpX = -ny
  const perpY = nx
  const curvature = len * 0.15
  const cpX = (startX + endX) / 2 + perpX * curvature
  const cpY = (startY + endY) / 2 + perpY * curvature

  // Direction at the end of the curve for the arrowhead
  const tNx = (endX - cpX)
  const tNy = (endY - cpY)
  const tLen = Math.sqrt(tNx * tNx + tNy * tNy)

  return (
    <g>
      <path
        d={`M${startX} ${startY} Q${cpX} ${cpY} ${endX} ${endY}`}
        fill="none"
        stroke={ATTEST_BLUE}
        strokeWidth="1.3"
        opacity="0.45"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-16"
          dur="2s"
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
      </path>
      <polygon
        points={arrowHead(endX, endY, tNx / tLen, tNy / tLen, 5)}
        fill={ATTEST_BLUE}
        opacity="0.55"
      />
    </g>
  )
}

function arrowHead(tipX: number, tipY: number, nx: number, ny: number, size: number): string {
  const bx1 = tipX - nx * size + ny * size * 0.4
  const by1 = tipY - ny * size - nx * size * 0.4
  const bx2 = tipX - nx * size - ny * size * 0.4
  const by2 = tipY - ny * size + nx * size * 0.4
  return `${tipX},${tipY} ${bx1},${by1} ${bx2},${by2}`
}

/* ── Label pill ── */
function PhasePill({ label, x, y }: { readonly label: string; readonly x: number; readonly y: number }) {
  const width = label.length * 5.5 + 16
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - 9}
        width={width}
        height={18}
        rx="9"
        fill="white"
        stroke="#e2e8f0"
        strokeWidth="1"
      />
      <text
        x={x}
        y={y + 3.5}
        textAnchor="middle"
        fill="#64748b"
        fontSize="9"
        fontFamily="'SF Mono', Menlo, ui-monospace, monospace"
        fontWeight="500"
        letterSpacing="0.03em"
      >
        {label}
      </text>
    </g>
  )
}

/* ── Phase label tags ── */
function PhaseTag({ children, x, y, color }: { readonly children: string; readonly x: number; readonly y: number; readonly color: string }) {
  const width = children.length * 6.5 + 20
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - 10}
        width={width}
        height={20}
        rx="10"
        fill={color}
        opacity="0.1"
      />
      <rect
        x={x - width / 2}
        y={y - 10}
        width={width}
        height={20}
        rx="10"
        fill="none"
        stroke={color}
        strokeWidth="1"
        opacity="0.25"
      />
      <text
        x={x}
        y={y + 3.5}
        textAnchor="middle"
        fill={color}
        fontSize="10"
        fontFamily="'Inter', system-ui, sans-serif"
        fontWeight="600"
      >
        {children}
      </text>
    </g>
  )
}

/* ── Main component ── */

export function LocalParadigmDiagram() {
  const svgWidth = 800
  const svgHeight = 240
  const phaseGap = 410

  return (
    <motion.div
      className="rounded-xl border border-accent-warm/20 bg-gradient-to-b from-accent-warm/[0.03] to-white p-5 sm:p-6"
      variants={STAGGER_CONTAINER}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
    >
      {/* Header */}
      <motion.div variants={STAGGER_ITEM} className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent-warm" />
          <span className="text-xs font-semibold text-accent-warm">Local block building</span>
        </div>
        <span className="text-2xs text-muted">Signal gathering + block propagation</span>
      </motion.div>

      {/* Bullet points */}
      <motion.ul variants={STAGGER_ITEM} className="mb-5 space-y-1.5 text-[13px] leading-relaxed text-text-body">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-warm/50" />
          <span>Proposer aggregates block value from distributed signal sources (mempools)</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-warm/50" />
          <span>Value accrual depends on latency to <strong>all</strong> sources</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-warm/50" />
          <span>Proposer chooses the latest release time satisfying consensus deadlines</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-warm/50" />
          <span>Block is propagated from the proposer's region</span>
        </li>
      </motion.ul>

      {/* Diagram SVG */}
      <motion.div
        variants={STAGGER_ITEM}
        className="overflow-x-auto"
      >
        <motion.svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="mx-auto w-full max-w-[720px]"
          fill="none"
          aria-label="Local block-building paradigm: signal gathering (left) and block propagation (right)"
          role="img"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ ...SPRING_CRISP, delay: 0.15 }}
        >
          {/* ── Phase 1: Signal gathering ── */}
          <g>
            <PhaseTag x={185} y={14} color={SIGNAL_GREEN}>Signal gathering</PhaseTag>

            {/* Regions */}
            {P1_REGIONS.map((r, i) => (
              <DashedRegion key={`p1-${i}`} region={r} id={`p1-region-${i}`} />
            ))}

            {/* Signal arrows (sources → proposer) */}
            {SIGNAL_SOURCES.map((src, i) => (
              <SignalArrow key={`sig-${i}`} from={src} to={PROPOSER_P1} delay={i * 0.3} />
            ))}

            {/* Signal source nodes */}
            {SIGNAL_SOURCES.map((src, i) => (
              <SignalNode key={`sn-${i}`} x={src.x} y={src.y} delay={i * 0.5} />
            ))}

            {/* Signal in r3 */}
            <SignalNode x={305} y={160} delay={1.2} />
            <SignalArrow from={{ x: 305, y: 160 }} to={PROPOSER_P1} delay={0.9} />

            {/* Proposer */}
            <ProposerNode x={PROPOSER_P1.x} y={PROPOSER_P1.y} />

            {/* Labels */}
            <PhasePill label="signal" x={70} y={40} />
            <PhasePill label="signal" x={70} y={140} />
            <PhasePill label="proposer" x={195} y={82} />
            <PhasePill label="signal" x={305} y={140} />
          </g>

          {/* ── Divider ── */}
          <line
            x1={phaseGap - 15}
            y1={25}
            x2={phaseGap - 15}
            y2={svgHeight - 15}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity="0.6"
          />

          {/* ── Phase 2: Block propagation ── */}
          <g transform={`translate(${phaseGap}, 0)`}>
            <PhaseTag x={185} y={14} color={ATTEST_BLUE}>Block propagation</PhaseTag>

            {/* Regions */}
            {P2_REGIONS.map((r, i) => (
              <DashedRegion key={`p2-${i}`} region={r} id={`p2-region-${i}`} />
            ))}

            {/* Propagation arrows (proposer → attester clusters) */}
            {[
              { x: 70, y: 60 },
              { x: 70, y: 160 },
              { x: 305, y: 160 },
            ].map((target, i) => (
              <PropagationArrow key={`prop-${i}`} from={PROPOSER_P2} to={target} delay={i * 0.25} />
            ))}

            {/* Attester clusters */}
            {ATTESTER_CLUSTERS.map((cluster, ci) =>
              cluster.positions.map((pos, pi) => (
                <AttesterNode key={`att-${ci}-${pi}`} x={pos.x} y={pos.y} />
              )),
            )}

            {/* Attesters near proposer */}
            {PROPOSER_ATTESTERS.map((pos, i) => (
              <AttesterNode key={`prop-att-${i}`} x={pos.x} y={pos.y} />
            ))}

            {/* Proposer */}
            <ProposerNode x={PROPOSER_P2.x} y={PROPOSER_P2.y} />

            {/* Labels */}
            <PhasePill label="attesters" x={70} y={40} />
            <PhasePill label="attesters" x={70} y={140} />
            <PhasePill label="proposer" x={195} y={82} />
            <PhasePill label="attesters" x={305} y={140} />
          </g>
        </motion.svg>
      </motion.div>

      {/* Legend */}
      <motion.div variants={STAGGER_ITEM} className="mt-4 flex flex-wrap items-center justify-center gap-5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="white" stroke={SIGNAL_GREEN} strokeWidth="1.2" />
            <text x="7" y="10" textAnchor="middle" fill={SIGNAL_GREEN} fontSize="6" fontFamily="monospace" fontWeight="600">$</text>
          </svg>
          Signal source
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="white" stroke={WARM} strokeWidth="1.2" />
          </svg>
          Proposer
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="white" stroke={ATTEST_BLUE} strokeWidth="1.2" />
            <path d="M4.5 7.5 l2 2 l3 -3.5" fill="none" stroke={ATTEST_BLUE} strokeWidth="1" strokeLinecap="round" />
          </svg>
          Attester
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
            <line x1="2" y1="5" x2="18" y2="5" stroke={SIGNAL_GREEN} strokeWidth="1.2" strokeDasharray="3 2" opacity="0.6" />
          </svg>
          Value signal
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
            <line x1="2" y1="5" x2="18" y2="5" stroke={ATTEST_BLUE} strokeWidth="1.2" opacity="0.5" />
          </svg>
          Block propagation
        </span>
      </motion.div>
    </motion.div>
  )
}
