import { PRESETS, paperScenarioLabels } from './simulation-constants'
import type { SimulationConfig } from '../../lib/simulation-api'

interface ExactLabIntroProps {
  readonly config: SimulationConfig
  readonly comparabilityTitle: string
  readonly onApplyPreset: (preset: Partial<SimulationConfig>) => void
}

export function ExactLabIntro({
  config,
  comparabilityTitle,
  onApplyPreset,
}: ExactLabIntroProps) {
  return (
    <div className="geo-accent-bar mb-4 rounded-2xl border border-rule bg-white/92 p-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="lab-chip bg-white/90">{config.paradigm}</span>
        <span className="lab-chip bg-white/90">{config.validators.toLocaleString()} validators</span>
        <span className="lab-chip bg-white/90">{config.slots.toLocaleString()} slots</span>
        <span className="lab-chip bg-white/90">{comparabilityTitle}</span>
        {paperScenarioLabels(config).map(label => (
          <span key={label} className="lab-chip bg-surface-active">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {label}
          </span>
        ))}
      </div>

      <div className="stagger-reveal mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {PRESETS.map(preset => (
          <button
            key={preset.label}
            onClick={() => onApplyPreset(preset.config)}
            className="lab-option-card px-3 py-3 text-left transition-all hover:border-border-hover hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                <div className="mt-1 text-xs leading-5 text-muted">{preset.description}</div>
              </div>
              <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-1 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-accent">
                Load
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
