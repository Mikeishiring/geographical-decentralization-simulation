import { motion } from 'framer-motion'
import { Ban, ChevronRight, Clock, Play, RotateCcw, Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP } from '../../lib/theme'
import type { SimulationConfig } from '../../lib/simulation-api'
import {
  describeParadigm,
  estimateRuntime,
  hasNonDefaultProtocol,
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
  { label: '1', value: 1, hint: 'debug' },
  { label: '100', value: 100, hint: 'test' },
  { label: '250', value: 250 },
  { label: '500', value: 500 },
  { label: '1,000', value: 1000, hint: 'paper' },
]

const SLOT_ANCHORS: readonly NumericAnchor[] = [
  { label: '1', value: 1, hint: 'smoke' },
  { label: '100', value: 100, hint: 'fast' },
  { label: '1,000', value: 1000, hint: 'lab' },
  { label: '5,000', value: 5000 },
  { label: '10,000', value: 10000, hint: 'paper' },
]

const MIGRATION_COST_ANCHORS: readonly NumericAnchor[] = [
  { label: '0', value: 0, hint: 'none' },
  { label: '0.0001', value: 0.0001, hint: 'lab' },
  { label: '0.001', value: 0.001 },
  { label: '0.002', value: 0.002, hint: 'paper' },
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
}: SimConfigPanelProps) {
  const validatorsOnAnchor = isAnchorValue(config.validators, VALIDATOR_ANCHORS)
  const slotsOnAnchor = isAnchorValue(config.slots, SLOT_ANCHORS)
  const migrationCostOnAnchor = isAnchorValue(config.migrationCost, MIGRATION_COST_ANCHORS)
  const runtime = estimateRuntime(config.validators, config.slots)
  const protocolOpen = hasNonDefaultProtocol(config)

  const inputClassName = 'lab-input-shell w-full rounded-xl px-3 py-2 text-sm text-text-primary outline-none transition hover:border-border-hover focus:border-accent/50 focus:ring-2 focus:ring-accent/10'
  const anchorButtonClassName = 'lab-option-card min-w-0 rounded-xl px-2.5 py-1.5 text-center transition-all hover:border-border-hover'
  const segmentButtonClassName = 'lab-option-card min-w-0 rounded-xl px-3 py-2 text-left transition-all hover:border-border-hover'

  return (
    <div className="lab-stage mb-5 divide-y divide-rule">
      {/* ── Tier 1: Scenario ── */}
      <div className="p-4">
        <div className="mb-3 text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
          Scenario — what to simulate
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted mb-1.5 block">Paradigm</label>
            <div className="grid grid-cols-2 gap-2">
              {(['SSP', 'MSP'] as const).map(paradigm => (
                <button
                  key={paradigm}
                  onClick={() => onConfigChange('paradigm', paradigm)}
                  className={cn(
                    segmentButtonClassName,
                    config.paradigm === paradigm
                      ? paradigm === 'SSP'
                        ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent shadow-[0_16px_32px_rgba(37,99,235,0.1)]'
                        : 'border-accent-warm bg-gradient-to-b from-accent-warm/10 to-white/98 text-accent-warm shadow-[0_16px_32px_rgba(194,85,58,0.12)]'
                      : 'text-muted',
                  )}
                >
                  <div className="text-sm font-medium">{describeParadigm(paradigm)}</div>
                  <div className="mt-1 text-2xs font-medium uppercase tracking-[0.1em] opacity-75">{paradigm}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1.5 block">Validator Distribution</label>
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

          <div className="sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]">
            <label className="text-xs text-muted mb-1.5 block">Information Source Placement</label>
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
        </div>
      </div>

      {/* ── Tier 2: Scale + Runtime estimate ── */}
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Scale — how much to compute
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-11 font-medium',
              runtime.tier === 'quick' && 'border-success/30 bg-success/8 text-success',
              runtime.tier === 'moderate' && 'border-accent/30 bg-accent/8 text-accent',
              runtime.tier === 'long' && 'border-warning/30 bg-warning/8 text-warning',
              runtime.tier === 'very-long' && 'border-danger/30 bg-danger/8 text-danger',
            )}
          >
            <Clock className="h-3 w-3" />
            {runtime.label}
          </div>
        </div>

        {(runtime.tier === 'long' || runtime.tier === 'very-long') && (
          <motion.div
            className={cn(
              'mb-3 rounded-xl border px-3 py-2.5 text-xs leading-5',
              runtime.tier === 'very-long'
                ? 'border-danger/20 bg-danger/5 text-danger'
                : 'border-warning/20 bg-warning/5 text-warning',
            )}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={SPRING_CRISP}
          >
            {runtime.tier === 'very-long'
              ? 'This configuration will take several minutes. Consider reducing validators or slots for faster iteration, then scale up when the question merits the runtime.'
              : 'Moderate runtime. Results may take a couple of minutes to compute.'}
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label className="text-xs text-muted block">Validators</label>
              <div className="text-11 text-text-faint">{config.validators.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {VALIDATOR_ANCHORS.map(option => (
                <button
                  key={option.value}
                  onClick={() => onConfigChange('validators', option.value)}
                  className={cn(
                    anchorButtonClassName,
                    approximatelyEqual(config.validators, option.value)
                      ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                      : 'text-muted',
                  )}
                >
                  <div className="text-xs font-medium">{option.label}</div>
                  {option.hint && (
                    <div className="mt-1 text-2xs font-medium uppercase tracking-[0.1em]">{option.hint}</div>
                  )}
                </button>
              ))}
            </div>
            <details open={!validatorsOnAnchor} className="lab-option-card mt-2 rounded-xl px-3 py-2.5">
              <summary className="cursor-pointer list-none text-11 font-medium text-muted hover:text-text-primary">
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
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label className="text-xs text-muted block">Slots</label>
              <div className="text-11 text-text-faint">{config.slots.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {SLOT_ANCHORS.map(option => (
                <button
                  key={option.value}
                  onClick={() => onConfigChange('slots', option.value)}
                  className={cn(
                    anchorButtonClassName,
                    approximatelyEqual(config.slots, option.value)
                      ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                      : 'text-muted',
                  )}
                >
                  <div className="text-xs font-medium">{option.label}</div>
                  {option.hint && (
                    <div className="mt-1 text-2xs font-medium uppercase tracking-[0.1em]">{option.hint}</div>
                  )}
                </button>
              ))}
            </div>
            <details open={!slotsOnAnchor} className="lab-option-card mt-2 rounded-xl px-3 py-2.5">
              <summary className="cursor-pointer list-none text-11 font-medium text-muted hover:text-text-primary">
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
          </div>
        </div>
      </div>

      {/* ── Tier 3: Protocol Tuning (collapsible) ── */}
      <details open={protocolOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-2xs font-medium uppercase tracking-[0.1em] text-text-faint hover:text-text-primary transition-colors">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          Protocol tuning — consensus parameters
        </summary>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                        ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                        : 'text-muted',
                    )}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-2xs font-medium uppercase tracking-[0.1em] opacity-70">gamma</div>
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
                        ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                        : 'text-muted',
                    )}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-2xs font-medium uppercase tracking-[0.1em] opacity-70">slot time</div>
                  </button>
                ))}
              </div>
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
                        ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                        : 'text-muted',
                    )}
                  >
                    <div className="text-xs font-medium">{option.label}</div>
                    {option.hint && (
                      <div className="mt-1 text-2xs font-medium uppercase tracking-[0.1em]">{option.hint}</div>
                    )}
                  </button>
                ))}
              </div>
              {!migrationCostOnAnchor && (
                <div className="mt-1 text-11 text-text-faint">
                  Exact value: {config.migrationCost.toFixed(4)} ETH
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-muted mb-1.5 block">Seed</label>
              <input
                type="number"
                value={config.seed}
                min={0}
                max={2147483647}
                onChange={event => onConfigChange('seed', Number(event.target.value))}
                className={inputClassName}
              />
            </div>
          </div>
        </div>
      </details>

      {/* ── Footer: Research alignment + Run controls ── */}
      <div className="p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="lab-stage-soft rounded-2xl p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="lab-section-title">Research Alignment</div>
                <div className="mt-1 text-xs leading-5 text-muted">
                  {paperComparability.detail}
                </div>
              </div>
              <div
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-11 font-medium',
                  paperComparability.tone === 'canonical' && 'border-success/30 bg-success/8 text-text-primary',
                  paperComparability.tone === 'editorial' && 'border-warning/30 bg-warning/8 text-text-primary',
                  paperComparability.tone === 'experimental' && 'border-rule bg-white text-text-primary',
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

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="lab-option-card px-3 py-3">
                <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Exact-only note</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Exact mode only
                </div>
              </div>
              <div className="lab-option-card px-3 py-3">
                <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Slot cutoff</div>
                <div className="mt-1 text-sm font-medium text-text-primary">{attestationCutoffMs(config.slotTime)} ms</div>
              </div>
              <div className="lab-option-card px-3 py-3">
                <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Reference tags</div>
                <div className="mt-1 text-sm font-medium text-text-primary">{paperScenarioLabels[0] ?? 'Custom exact run'}</div>
                <div className="mt-1 text-xs text-muted">{paperScenarioLabels.join(' \u00B7 ')}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Run controls</div>
              <div className="mt-2 text-sm font-medium text-text-primary">
                {paperComparability.tone === 'canonical'
                  ? 'Run this, then compare against the published results surface.'
                  : paperComparability.tone === 'editorial'
                    ? 'Run as a paper-scale extension, not a one-to-one comparison.'
                    : 'Use this to learn fast, then promote to paper scale if it matters.'}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <motion.button
                onClick={onSubmit}
                whileTap={{ scale: 0.98 }}
                transition={SPRING}
                disabled={isSubmitting || canCancel}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                  'bg-text-primary text-white hover:bg-text-primary/85 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <Play className="h-4 w-4" />
                {isSubmitting ? 'Submitting\u2026' : canCancel ? 'Run In Progress\u2026' : 'Run Exact Simulation'}
              </motion.button>

              <div className="grid gap-3 sm:grid-cols-2">
                <motion.button
                  onClick={onReset}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_CRISP}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rule bg-white px-4 py-3 text-sm text-text-primary transition-colors hover:border-border-hover"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </motion.button>

                <motion.button
                  onClick={onCancel}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_CRISP}
                  disabled={!canCancel}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors',
                    canCancel
                      ? 'border-danger/30 bg-danger/5 text-danger hover:bg-danger/10'
                      : 'cursor-not-allowed border-rule bg-surface-active text-text-faint',
                  )}
                >
                  <Ban className="h-4 w-4" />
                  Cancel
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
