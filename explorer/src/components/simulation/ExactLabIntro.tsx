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
    <>
      <div className="lab-stage-hero mb-4 p-5">
        <div className="flex flex-col gap-4">
          <div>
            <div className="lab-section-title">Run your own simulation</div>
            <h2 className="mt-2 max-w-3xl text-[1.7rem] font-semibold tracking-tight text-text-primary sm:text-[1.95rem]">
              Run fresh exact simulations with the same engine used in the paper.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Configure a bounded exact run, watch the queue and execution state, then inspect the manifest and artifacts without leaving the page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {paperScenarioLabels(config).map(label => (
                <span key={label} className="lab-chip bg-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {config.paradigm} · {config.validators.toLocaleString()} validators · {config.slots.toLocaleString()} slots
            </span>
            <span className="text-border-subtle">|</span>
            <span>{comparabilityTitle}</span>
          </div>
        </div>
      </div>

      <div className="lab-stage-soft mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="lab-section-title">How to use this surface</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              Bound the run, read the artifacts, then decide whether it is worth publishing.
            </div>
          </div>
          <div className="max-w-2xl text-xs leading-5 text-muted">
            Keep the exact runner narrow. Start from a reference setup, inspect the manifest and overview bundles first, and treat sharing as the last step.
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {[
            {
              title: '1. Load a bounded run',
              detail: 'Use a preset or make one deliberate change.',
            },
            {
              title: '2. Read the run first',
              detail: 'Start with the manifest and overview bundles.',
            },
            {
              title: '3. Publish only with a takeaway',
              detail: 'Share only when the run changes the argument.',
            },
          ].map(item => (
            <div key={item.title} className="lab-option-card px-3 py-3">
              <div className="text-sm font-medium text-text-primary">{item.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lab-stage-soft mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="lab-section-title">Quick Presets</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              Load a reference scenario, then tune from there.
            </div>
          </div>
          <div className="max-w-2xl text-xs leading-5 text-muted">
            Presets jump to the paper-style scenario family. The default surface still opens smaller than the frozen 10,000-slot baseline so iteration remains fast.
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => onApplyPreset(preset.config)}
              className="lab-option-card px-3 py-3 text-left transition-all hover:border-border-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">{preset.description}</div>
                </div>
                <span className="rounded-full border border-rule bg-white/80 px-2 py-1 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                  Load
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
