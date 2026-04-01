/**
 * Reads published simulation data.json files and generates a full-resolution
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
const MAX_POINTS = 720
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

function sampledIndexes(length, maxPoints = MAX_POINTS) {
  if (length <= maxPoints) {
    return Array.from({ length }, (_, index) => index)
  }

  const step = (length - 1) / (maxPoints - 1)
  const indexes = new Set([0, length - 1])
  for (let i = 1; i < maxPoints - 1; i += 1) {
    indexes.add(Math.round(i * step))
  }
  return [...indexes].sort((a, b) => a - b)
}

function toSeries(arr) {
  return sampledIndexes(arr.length).map(index => ({ x: index, y: round(arr[index]) }))
}

function makeDataset(label, color, metrics, dashed = false) {
  return {
    label,
    color,
    dashed,
    gini: toSeries(metrics.gini),
    hhi: toSeries(metrics.hhi),
    liveness: toSeries(metrics.liveness),
    cv: toSeries(metrics.profit_variance),
  }
}

// ── Figure 3: Baseline ──
const baselineExt = load('baseline/SSP/cost_0.002/data.json')
const baselineLoc = load('baseline/MSP/cost_0.002/data.json')

const baseline = {
  id: 'baseline-results',
  datasets: [
    makeDataset('External', EXTERNAL_COLOR, baselineExt, false),
    makeDataset('Local', LOCAL_COLOR, baselineLoc, true),
  ],
}

// ── Figure 4: SE1 — Information-source placement ──
const se1AlignedColor = '#0F766E'
const se1MisalignedColor = '#D97706'

const se1 = {
  id: 'se1-source-placement',
  datasets: [
    makeDataset('Aligned (External)', se1AlignedColor,
      load('heterogeneous_info/SSP/cost_0.002_latency_latency-aligned/data.json'), false),
    makeDataset('Misaligned (External)', se1MisalignedColor,
      load('heterogeneous_info/SSP/cost_0.002_latency_latency-misaligned/data.json'), false),
    makeDataset('Aligned (Local)', se1AlignedColor,
      load('heterogeneous_info/MSP/cost_0.002_latency_latency-aligned/data.json'), true),
    makeDataset('Misaligned (Local)', se1MisalignedColor,
      load('heterogeneous_info/MSP/cost_0.002_latency_latency-misaligned/data.json'), true),
  ],
}

// ── Figure 5: SE2 — Heterogeneous validators ──
const se2 = {
  id: 'se2-distribution',
  datasets: [
    makeDataset('External', EXTERNAL_COLOR,
      load('heterogeneous_validators/SSP/cost_0.002_validators_heterogeneous/data.json'), false),
    makeDataset('Local', LOCAL_COLOR,
      load('heterogeneous_validators/MSP/cost_0.002_validators_heterogeneous/data.json'), true),
  ],
}

// ── Figure 6: SE3 — Joint heterogeneity ──
const se3AlignedColor = '#0891B2'
const se3MisalignedColor = '#B45309'

const se3 = {
  id: 'se3-joint',
  datasets: [
    makeDataset('Aligned (External)', se3AlignedColor,
      load('heterogeneous_both/SSP/cost_0.002_latency_latency-aligned/data.json'), false),
    makeDataset('Misaligned (External)', se3MisalignedColor,
      load('heterogeneous_both/SSP/cost_0.002_latency_latency-misaligned/data.json'), false),
    makeDataset('Aligned (Local)', se3AlignedColor,
      load('heterogeneous_both/MSP/cost_0.002_latency_latency-aligned/data.json'), true),
    makeDataset('Misaligned (Local)', se3MisalignedColor,
      load('heterogeneous_both/MSP/cost_0.002_latency_latency-misaligned/data.json'), true),
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
      load(`different_gammas/SSP/cost_0.002_gamma_${g}/data.json`), false),
    makeDataset(`${label} (Local)`, locGammaColors[i],
      load(`different_gammas/MSP/cost_0.002_gamma_${g}/data.json`), true),
  ]),
}

// ── Figure 8: SE4b — Shorter slots ──
const baselineDurationColor = '#64748B'
const shorterDurationColor = '#7C3AED'

const se4b = {
  id: 'se4b-slots',
  datasets: [
    makeDataset('12s (External)', baselineDurationColor,
      load('baseline/SSP/cost_0.002/data.json'), false),
    makeDataset('6s (External)', shorterDurationColor,
      load('eip7782/SSP/cost_0.002_delta_6000_cutoff_3000/data.json'), false),
    makeDataset('12s (Local)', baselineDurationColor,
      load('baseline/MSP/cost_0.002/data.json'), true),
    makeDataset('6s (Local)', shorterDurationColor,
      load('eip7782/MSP/cost_0.002_delta_6000_cutoff_3000/data.json'), true),
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
  readonly dashed: boolean
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
