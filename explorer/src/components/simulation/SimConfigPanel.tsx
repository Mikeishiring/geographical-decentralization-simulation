import { motion } from 'framer-motion'
import { ArrowDown, Ban, LoaderCircle, Play, RotateCcw, Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING } from '../../lib/theme'
import type { SimulationConfig } from '../../lib/simulation-api'
import {
  describeParadigm,
  type PaperComparability,
} from './simulation-constants'

interface NumericAnchor {
  readonly label: string
  readonly value: number
  readonly hint?: string
}

const THRESHOLD_OPTIONS = [
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 1 / 2 },
  { label: '2/3', value: 2 / 3 },
  { label: '4/5', value: 4 / 5 },
] as const

const VALIDATOR_ANCHORS: readonly NumericAnchor[] = [
  { label: '1', value: 1, hint: 'minimal' },
  { label: '100', value: 100, hint: 'quick' },
  { label: '250', value: 250 },
  { label: '500', value: 500 },
  { label: '1,000', value: 1000, hint: 'paper scale' },
]

const SLOT_ANCHORS: readonly NumericAnchor[] = [
  { label: '1', value: 1, hint: 'minimal' },
  { label: '100', value: 100, hint: 'quick' },
  { label: '1,000', value: 1000, hint: 'moderate' },
  { label: '5,000', value: 5000 },
  { label: '10,000', value: 10000, hint: 'paper scale' },
]

const MIGRATION_COST_ANCHORS: readonly NumericAnchor[] = [
  { label: '0', value: 0, hint: 'free' },
  { label: '0.0001', value: 0.0001, hint: 'low' },
  { label: '0.001', value: 0.001 },
  { label: '0.002', value: 0.002, hint: 'paper default' },
  { label: '0.003', value: 0.003 },
] as const

const SLOT_OPTIONS = [
  { label: '6s', value: 6 },
  { label: '8s', value: 8 },
  { label: '12s', value: 12 },
] as const

function approximatelyEqual(left: number, right: number, epsilon = 0.00005): boolean {
  return Math.abs(left - right) <= epsilon
}

function isAnchorValue(value: number, anchors: readonly NumericAnchor[]): boolean {
  return anchors.some(anchor => approximatelyEqual(anchor.value, value))
}

function attestationCutoffMs(slotTime: number): number {
  if (slotTime === 6) return 3000
  if (slotTime === 8) return 4000
  return 4000
}

interface SimConfigPanelProps {
  readonly config: SimulationConfig
  readonly onConfigChange: <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => void
  readonly onSubmit: () => void
  readonly onReset: () => void
  readonly isSubmitting: boolean
  readonly canCancel: boolean
  readonly onCancel: () => void
  readonly paperScenarioLabels: readonly string[]
  readonly paperComparability: PaperComparability
  readonly runnerStatus: 'idle' | 'submitting' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  readonly onJumpToRunner?: () => void
}

export function SimConfigPanel({
  config,
  onConfigChange,
  onSubmit,
  onReset,
  isSubmitting,
  canCancel,
  onCancel,
  paperScenarioLabels,
  paperComparability,
  runnerStatus,
  onJumpToRunner,
}: SimConfigPanelProps) {
  const validatorsOnAnchor = isAnchorValue(config.validators, VALIDATOR_ANCHORS)
  const slotsOnAnchor = isAnchorValue(config.slots, SLOT_ANCHORS)
  const migrationCostOnAnchor = isAnchorValue(config.migrationCost, MIGRATION_COST_ANCHORS)
  const inputClassName = 'lab-input-shell w-full rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/10'
  const anchorButtonClassName = 'lab-option-card min-w-0 rounded-xl px-2.5 py-2 text-center transition-all hover:-translate-y-0.5 hover:border-border-hover'
  const segmentButtonClassName = 'lab-option-card min-w-0 rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover'
  const runIsActive = runnerStatus === 'submitting' || runnerStatus === 'queued' || runnerStatus === 'running'
  const runButtonLabel = runnerStatus === 'submitting'
    ? 'Submitting exact run…'
    : runnerStatus === 'queued'
      ? 'Queued for execution'
      : runnerStatus === 'running'
        ? 'Running exact simulation'
        : 'Run Exact Simulation'
  const statusChipLabel = runnerStatus === 'submitting'
    ? 'Launching now'
    : runnerStatus === 'queued'
      ? 'Runner queued'
      : runnerStatus === 'running'
        ? 'Runner live'
        : runnerStatus === 'completed'
          ? 'Results ready'
          : runnerStatus === 'failed'
            ? 'Needs retry'
            : runnerStatus === 'cancelled'
              ? 'Run cancelled'
              : 'Ready'

  return (
    <div className="lab-stage p-0 mb-6">
      <div className="lab-stage-hero mx-3 mt-3 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="lab-section-title">Configuration</div>
            <div className="mt-3 text-xl font-semibold tracking-tight text-text-primary sm:text-[1.6rem]">
              Set up your simulation scenario.
            </div>
            <div className="mt-3 text-sm leading-6 text-muted">
              Choose a paradigm, network size, and timing parameters. Use the presets above for common paper scenarios,
              or customize each value below.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Mode</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{describeParadigm(config.paradigm)}</div>
              <div className="mt-1 text-xs text-muted">{config.paradigm} exact</div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Scale</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{config.validators.toLocaleString()} validators</div>
              <div className="mt-1 text-xs text-muted">{config.slots.toLocaleString()} slots</div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Timing</div>
              <div className="mt-2 text-sm font-medium text-text-primary">gamma {config.attestationThreshold.toFixed(2)}</div>
              <div className="mt-1 text-xs text-muted">{config.slotTime}s slots · cutoff {attestationCutoffMs(config.slotTime)} ms</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-3 pb-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Paradigm
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['SSP', 'MSP'] as const).map(paradigm => (
              <button
                key={paradigm}
                onClick={() => onConfigChange('paradigm', paradigm)}
                className={cn(
                  segmentButtonClassName,
                  config.paradigm === paradigm
                    ? paradigm === 'SSP'
                      ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent shadow-[0_16px_32px_rgba(37,99,235,0.1)]'
                      : 'border-accent-warm bg-[linear-gradient(180deg,rgba(194,85,58,0.1),rgba(255,255,255,0.98))] text-accent-warm shadow-[0_16px_32px_rgba(194,85,58,0.12)]'
                    : 'text-muted',
                )}
              >
                <div className="text-sm font-medium">{describeParadigm(paradigm)}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-75">{paradigm}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Validator Distribution
          </label>
          <select
            value={config.distribution}
            onChange={event => onConfigChange('distribution', event.target.value as SimulationConfig['distribution'])}
            className={inputClassName}
          >
            <option value="homogeneous">Homogeneous (upstream baseline default)</option>
            <option value="homogeneous-gcp">Homogeneous per GCP region</option>
            <option value="heterogeneous">Heterogeneous (real ETH data)</option>
            <option value="random">Random</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Information Source Placement
          </label>
          <select
            value={config.sourcePlacement}
            onChange={event => onConfigChange('sourcePlacement', event.target.value as SimulationConfig['sourcePlacement'])}
            className={inputClassName}
          >
            <option value="homogeneous">Homogeneous</option>
            <option value="latency-aligned">Latency-aligned</option>
            <option value="latency-misaligned">Latency-misaligned</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Seed
          </label>
          <input
            type="number"
            value={config.seed}
            min={0}
            max={2147483647}
            onChange={event => onConfigChange('seed', Number(event.target.value))}
            className={inputClassName}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label className="text-xs text-muted block">
              Validators
            </label>
            <div className="text-[11px] text-text-faint">
              {config.validators.toLocaleString()}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {VALIDATOR_ANCHORS.map(option => (
              <button
                key={option.value}
                onClick={() => onConfigChange('validators', option.value)}
                className={cn(
                  anchorButtonClassName,
                  approximatelyEqual(config.validators, option.value)
                    ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                    : 'text-muted',
                )}
              >
                <div className="text-xs font-medium">{option.label}</div>
                {option.hint && (
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em]">{option.hint}</div>
                )}
              </button>
            ))}
          </div>
          <details open={!validatorsOnAnchor} className="lab-option-card mt-3 rounded-xl px-3 py-3">
            <summary className="cursor-pointer list-none text-[11px] text-muted hover:text-text-primary">
              Fine edit exact validator count
            </summary>
            <input
              type="number"
              min={1}
              max={1000}
              step={1}
              value={config.validators}
              onChange={event => onConfigChange('validators', Number(event.target.value))}
              className={`${inputClassName} mt-3`}
            />
          </details>
          <div className="mt-1 text-xs text-muted">Anchor values favor the checked-in scales. Exact edits stay available for off-catalog runs.</div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label className="text-xs text-muted block">
              Slots
            </label>
            <div className="text-[11px] text-text-faint">
              {config.slots.toLocaleString()}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {SLOT_ANCHORS.map(option => (
              <button
                key={option.value}
                onClick={() => onConfigChange('slots', option.value)}
                className={cn(
                  anchorButtonClassName,
                  approximatelyEqual(config.slots, option.value)
                    ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                    : 'text-muted',
                )}
              >
                <div className="text-xs font-medium">{option.label}</div>
                {option.hint && (
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em]">{option.hint}</div>
                )}
              </button>
            ))}
          </div>
          <details open={!slotsOnAnchor} className="lab-option-card mt-3 rounded-xl px-3 py-3">
            <summary className="cursor-pointer list-none text-[11px] text-muted hover:text-text-primary">
              Fine edit exact slot count
            </summary>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={config.slots}
              onChange={event => onConfigChange('slots', Number(event.target.value))}
              className={`${inputClassName} mt-3`}
            />
          </details>
          <div className="mt-1 text-xs text-muted">Paper-scale published runs use 10,000 slots. The default exact surface stays at 1,000 for faster iteration.</div>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Migration Cost: {config.migrationCost.toFixed(4)} ETH
          </label>
          <div className="lab-input-shell rounded-[1rem] px-4 py-4">
            <input
              type="range"
              min={0}
              max={0.005}
              step={0.0001}
              value={config.migrationCost}
              onChange={event => onConfigChange('migrationCost', Number(event.target.value))}
              className="w-full accent-accent"
            />
            <div className="mt-1 flex justify-between text-xs text-text-faint">
              <span>0</span>
              <span>0.005</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {MIGRATION_COST_ANCHORS.map(option => (
              <button
                key={option.value}
                onClick={() => onConfigChange('migrationCost', option.value)}
                className={cn(
                  anchorButtonClassName,
                  approximatelyEqual(config.migrationCost, option.value)
                    ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                    : 'text-muted',
                )}
              >
                <div className="text-xs font-medium">{option.label}</div>
                {option.hint && (
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em]">{option.hint}</div>
                )}
              </button>
            ))}
          </div>
          {!migrationCostOnAnchor && (
            <div className="mt-1 text-[11px] text-text-faint">
              Exact value: {config.migrationCost.toFixed(4)} ETH
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Attestation Threshold (γ)
          </label>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {THRESHOLD_OPTIONS.map(option => (
              <button
                key={option.label}
                onClick={() => onConfigChange('attestationThreshold', option.value)}
                className={cn(
                  segmentButtonClassName,
                  Math.abs(config.attestationThreshold - option.value) < 0.01
                    ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                    : 'text-muted',
                )}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.08em] opacity-70">gamma</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">
            Slot Time (Δ)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SLOT_OPTIONS.map(option => (
              <button
                key={option.label}
                onClick={() => onConfigChange('slotTime', option.value)}
                className={cn(
                  segmentButtonClassName,
                  config.slotTime === option.value
                    ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                    : 'text-muted',
                )}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">slot time</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-3 mb-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="lab-stage-soft p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="lab-section-title">Timing &amp; Paper Alignment</div>
              <div className="mt-2 text-sm font-medium text-text-primary">
                How closely does this configuration match the published paper scenarios?
              </div>
            </div>
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium',
                paperComparability.tone === 'canonical' && 'border-success/30 bg-success/8 text-text-primary',
                paperComparability.tone === 'editorial' && 'border-warning/30 bg-warning/8 text-text-primary',
                paperComparability.tone === 'experimental' && 'border-border-subtle bg-white text-text-primary',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  paperComparability.tone === 'canonical' && 'bg-success',
                  paperComparability.tone === 'editorial' && 'bg-warning',
                  paperComparability.tone === 'experimental' && 'bg-accent',
                )}
              />
              {paperComparability.title}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Exact-only note</div>
              <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Exact mode only
              </div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Slot cutoff</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{attestationCutoffMs(config.slotTime)} ms</div>
            </div>
            <div className="lab-option-card px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Reference tags</div>
              <div className="mt-2 text-sm font-medium text-text-primary">{paperScenarioLabels[0] ?? 'Custom exact run'}</div>
              <div className="mt-1 text-xs text-muted">{paperScenarioLabels.join(' · ')}</div>
            </div>
          </div>

          <div className="mt-4 max-w-3xl text-[11px] leading-5 text-muted">
            {paperComparability.detail}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Reproducing paper results</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Start from a preset</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                Pick a paper-aligned preset above and compare your results against the published data.
              </div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Quick exploration</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Keep runs small first</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                Use fewer slots for faster iteration, then scale up when you find something interesting.
              </div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">Sharing findings</div>
              <div className="mt-2 text-sm font-medium text-text-primary">Add your interpretation</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                When publishing, summarize what the results show in your own words rather than just the raw data.
              </div>
            </div>
          </div>
        </div>

        <div className="lab-stage-dark p-5">
          <div className="lab-loading-orb" data-state={runIsActive ? 'active' : 'idle'} />
          <div className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-400">Run controls</div>
          <div className="mt-3 text-lg font-semibold text-white">Ready to launch when your scenario is set.</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            Reset restores default parameters. Cancel stops a running or queued simulation.
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-medium text-slate-100">
            <span className={cn('h-2 w-2 rounded-full', runIsActive ? 'bg-sky-300 animate-pulse' : runnerStatus === 'completed' ? 'bg-emerald-300' : 'bg-slate-400')} />
            {statusChipLabel}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/6 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Suggested approach</div>
            <div className="mt-2 text-sm font-medium text-white">
              {runIsActive
                ? 'The live runner is active below. Stay with the queue and execution surface until the manifest lands.'
                : paperComparability.tone === 'canonical'
                ? 'This matches a published scenario — compare your results directly.'
                : paperComparability.tone === 'editorial'
                  ? 'Similar to published scenarios but not an exact match — treat as an extension.'
                  : 'Exploratory configuration — useful for quick iteration before scaling up.'}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <motion.button
              onClick={onSubmit}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
              disabled={isSubmitting || runnerStatus === 'queued' || runnerStatus === 'running'}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                runIsActive && 'shadow-[0_0_0_1px_rgba(148,197,255,0.28),0_18px_40px_rgba(37,99,235,0.18)]',
                'bg-white text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {runIsActive ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {runButtonLabel}
            </motion.button>

            {onJumpToRunner && runIsActive && (
              <button
                onClick={onJumpToRunner}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/8 px-4 py-2.5 text-xs text-slate-100 transition-colors hover:bg-white/12"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Jump to live runner
              </button>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={onReset}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-slate-100 transition-colors hover:bg-white/12"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>

              <button
                onClick={onCancel}
                disabled={!canCancel}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors',
                  canCancel
                    ? 'border-red-300/24 bg-red-400/10 text-red-100 hover:bg-red-400/14'
                    : 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500',
                )}
              >
                <Ban className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
