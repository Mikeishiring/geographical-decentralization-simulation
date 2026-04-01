/**
 * Reads published simulation data.json files and generates a downsampled
 * TypeScript module for the paper chart blocks in the editorial view.
 *
 * Usage: node scripts/generate-paper-chart-data.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DASHBOARD = join(__dirname, '..', '..', 'dashboard', 'simulations')
const OUT = join(__dirname, '..', 'src', 'data', 'paper-chart-data.ts')
const STEP = 200 // downsample: every 200th slot → 50 points from 10K

// Colors matching the app theme
const EXTERNAL_COLOR = '#2563EB'  // accent blue
const LOCAL_COLOR = '#C2553A'     // terracotta warm

function load(relPath) {
  const raw = JSON.parse(readFileSync(join(DASHBOARD, relPath), 'utf-8'))
  return raw.metrics
}

function round(v, d = 6) {
  return Math.round(v * 10 ** d) / 10 ** d
}

function downsample(arr, step = STEP) {
  const out = []
  for (let i = 0; i < arr.length; i += step) {
    out.push({ x: i, y: round(arr[i]) })
  }
  // Always include last point
  if ((arr.length - 1) % step !== 0) {
    out.push({ x: arr.length - 1, y: round(arr[arr.length - 1]) })
  }
  return out
}

function makeDataset(label, color, metrics) {
  return {
    label,
    color,
    gini: downsample(metrics.gini),
    hhi: downsample(metrics.hhi),
    liveness: downsample(metrics.liveness),
    cv: downsample(metrics.profit_variance),
  }
}

// ── Figure 3: Baseline ──
const baselineExt = load('baseline/SSP/cost_0.002/data.json')
const baselineLoc = load('baseline/MSP/cost_0.002/data.json')

const baseline = {
  id: 'baseline-results',
  datasets: [
    makeDataset('External', EXTERNAL_COLOR, baselineExt),
    makeDataset('Local', LOCAL_COLOR, baselineLoc),
  ],
}

// ── Figure 4: SE1 — Information-source placement ──
const se1AlignedExt = load('heterogeneous_info/SSP/cost_0.002_latency_latency-aligned/data.json')
const se1MisalignedExt = load('heterogeneous_info/SSP/cost_0.002_latency_latency-misaligned/data.json')
const se1AlignedLoc = load('heterogeneous_info/MSP/cost_0.002_latency_latency-aligned/data.json')
const se1MisalignedLoc = load('heterogeneous_info/MSP/cost_0.002_latency_latency-misaligned/data.json')

const se1 = {
  id: 'se1-source-placement',
  datasets: [
    makeDataset('baseline (External)', EXTERNAL_COLOR, baselineExt),
    makeDataset('aligned (External)', '#60A5FA', se1AlignedExt),        // lighter blue
    makeDataset('misaligned (External)', '#1D4ED8', se1MisalignedExt),  // darker blue
    makeDataset('baseline (Local)', LOCAL_COLOR, baselineLoc),
    makeDataset('aligned (Local)', '#E8845C', se1AlignedLoc),           // lighter terracotta
    makeDataset('misaligned (Local)', '#9A3412', se1MisalignedLoc),     // darker terracotta
  ],
}

// ── Figure 5: SE2 — Heterogeneous validators ──
const se2Ext = load('heterogeneous_validators/SSP/cost_0.002_validators_heterogeneous/data.json')
const se2Loc = load('heterogeneous_validators/MSP/cost_0.002_validators_heterogeneous/data.json')

const se2 = {
  id: 'se2-distribution',
  datasets: [
    makeDataset('baseline (External)', EXTERNAL_COLOR, baselineExt),
    makeDataset('heterogeneous (External)', '#60A5FA', se2Ext),
    makeDataset('baseline (Local)', LOCAL_COLOR, baselineLoc),
    makeDataset('heterogeneous (Local)', '#E8845C', se2Loc),
  ],
}

// ── Figure 6: SE3 — Joint heterogeneity ──
const se3AlignedExt = load('heterogeneous_both/SSP/cost_0.002_latency_latency-aligned/data.json')
const se3MisalignedExt = load('heterogeneous_both/SSP/cost_0.002_latency_latency-misaligned/data.json')
const se3AlignedLoc = load('heterogeneous_both/MSP/cost_0.002_latency_latency-aligned/data.json')
const se3MisalignedLoc = load('heterogeneous_both/MSP/cost_0.002_latency_latency-misaligned/data.json')

const se3 = {
  id: 'se3-joint',
  datasets: [
    makeDataset('baseline (External)', EXTERNAL_COLOR, baselineExt),
    makeDataset('aligned (External)', '#60A5FA', se3AlignedExt),
    makeDataset('misaligned (External)', '#1D4ED8', se3MisalignedExt),
    makeDataset('baseline (Local)', LOCAL_COLOR, baselineLoc),
    makeDataset('aligned (Local)', '#E8845C', se3AlignedLoc),
    makeDataset('misaligned (Local)', '#9A3412', se3MisalignedLoc),
  ],
}

// ── Figure 7: SE4a — Attestation threshold gamma ──
const gammaValues = [
  { g: '0.3333', label: 'γ=1/3' },
  { g: '0.5', label: 'γ=1/2' },
  { g: '0.6667', label: 'γ=2/3' },
  { g: '0.8', label: 'γ=4/5' },
]
// Blue gradient for external, terracotta gradient for local
const extGammaColors = ['#93C5FD', '#60A5FA', '#2563EB', '#1D4ED8']
const locGammaColors = ['#FDBA74', '#E8845C', '#C2553A', '#9A3412']

const se4a = {
  id: 'se4a-attestation',
  datasets: gammaValues.flatMap(({ g, label }, i) => [
    makeDataset(`${label} (External)`, extGammaColors[i],
      load(`different_gammas/SSP/cost_0.002_gamma_${g}/data.json`)),
    makeDataset(`${label} (Local)`, locGammaColors[i],
      load(`different_gammas/MSP/cost_0.002_gamma_${g}/data.json`)),
  ]),
}

// ── Figure 8: SE4b — Shorter slot times ──
const se4bExt6s = load('eip7782/SSP/cost_0.002_delta_6000_cutoff_3000/data.json')
const se4bLoc6s = load('eip7782/MSP/cost_0.002_delta_6000_cutoff_3000/data.json')

const se4b = {
  id: 'se4b-slots',
  datasets: [
    makeDataset('Δ=12s (External)', EXTERNAL_COLOR, baselineExt),
    makeDataset('Δ=6s (External)', '#60A5FA', se4bExt6s),
    makeDataset('Δ=12s (Local)', LOCAL_COLOR, baselineLoc),
    makeDataset('Δ=6s (Local)', '#E8845C', se4bLoc6s),
  ],
}

// ── Emit ──
const allCharts = [baseline, se1, se2, se3, se4a, se4b]

const ts = `/**
 * Pre-processed paper chart data — generated by scripts/generate-paper-chart-data.mjs
 * DO NOT EDIT MANUALLY
 */

export interface PaperChartPoint {
  readonly x: number
  readonly y: number
}

export interface PaperChartDataset {
  readonly label: string
  readonly color: string
  readonly gini: readonly PaperChartPoint[]
  readonly hhi: readonly PaperChartPoint[]
  readonly liveness: readonly PaperChartPoint[]
  readonly cv: readonly PaperChartPoint[]
}

export interface PaperChartData {
  readonly id: string
  readonly datasets: readonly PaperChartDataset[]
}

export const PAPER_CHART_DATA: Record<string, PaperChartData> = ${JSON.stringify(
  Object.fromEntries(allCharts.map(c => [c.id, c])),
)}
`

writeFileSync(OUT, ts, 'utf-8')

const sizeKB = (Buffer.byteLength(ts, 'utf-8') / 1024).toFixed(1)
console.log(`Generated ${OUT}`)
console.log(`${allCharts.length} charts, ${sizeKB} KB`)
for (const chart of allCharts) {
  const totalPoints = chart.datasets.reduce((sum, d) =>
    sum + d.gini.length + d.hhi.length + d.liveness.length + d.cv.length, 0)
  console.log(`  ${chart.id}: ${chart.datasets.length} series, ${totalPoints} points`)
}
