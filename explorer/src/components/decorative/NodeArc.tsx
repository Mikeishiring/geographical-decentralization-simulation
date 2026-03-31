/**
 * Small decorative node-and-arc motif — the "visual DNA" of the globe
 * without being literally a globe. Used in empty states to signal
 * "waiting for network activity" with the same pastel/wireframe language.
 */

import { PASTEL_PALETTE } from '../../lib/theme'

const PASTEL = PASTEL_PALETTE

export function NodeArc({ className = '' }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 60"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Faint wireframe grid lines */}
      <line x1="10" y1="30" x2="110" y2="30" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
      <line x1="35" y1="8" x2="35" y2="52" stroke="currentColor" strokeWidth="0.3" opacity="0.06" />
      <line x1="75" y1="8" x2="75" y2="52" stroke="currentColor" strokeWidth="0.3" opacity="0.06" />
      <path d="M10 18 Q60 6 110 18" stroke="currentColor" strokeWidth="0.3" opacity="0.06" fill="none" />
      <path d="M10 42 Q60 54 110 42" stroke="currentColor" strokeWidth="0.3" opacity="0.06" fill="none" />

      {/* Atmospheric arc connecting two nodes */}
      <path
        d="M28 34 Q58 8 92 28"
        stroke={PASTEL[0]}
        strokeWidth="0.8"
        opacity="0.35"
        fill="none"
      />

      {/* Second subtle arc */}
      <path
        d="M48 38 Q72 18 98 36"
        stroke={PASTEL[1]}
        strokeWidth="0.6"
        opacity="0.2"
        fill="none"
      />

      {/* Nodes — with breathing glow animation */}
      {[
        { cx: 28, cy: 34, color: PASTEL[0], r: 2.5 },
        { cx: 52, cy: 22, color: PASTEL[1], r: 2 },
        { cx: 75, cy: 30, color: PASTEL[2], r: 2.2 },
        { cx: 92, cy: 28, color: PASTEL[3], r: 2.5 },
        { cx: 48, cy: 38, color: PASTEL[4], r: 1.8 },
      ].map((node, i) => (
        <g key={i}>
          <circle cx={node.cx} cy={node.cy} r={node.r * 3} fill={node.color} opacity="0.1">
            <animate attributeName="opacity" values="0.1;0.2;0.1" dur={`${3.2 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={node.cx} cy={node.cy} r={node.r} fill={node.color} opacity="0.7">
            <animate attributeName="opacity" values="0.7;1;0.7" dur={`${3.2 + i * 0.4}s`} repeatCount="indefinite" />
            <animate attributeName="r" values={`${node.r};${node.r * 1.15};${node.r}`} dur={`${3.2 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </svg>
  )
}
