import { motion } from 'framer-motion'
import { PRESETS, paperScenarioLabels, paradigmLabel } from './simulation-constants'
import type { SimulationConfig } from '../../lib/simulation-api'
import { SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'

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
    <motion.div
      className="geo-accent-bar mb-4 rounded-2xl border border-rule bg-white/92 p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CRISP}
    >
      <motion.div
        className="flex flex-wrap gap-2 text-xs text-muted"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
      >
        <motion.span variants={STAGGER_ITEM} className="lab-chip bg-white/90">{paradigmLabel(config.paradigm)}</motion.span>
        <motion.span variants={STAGGER_ITEM} className="lab-chip bg-white/90">{config.validators.toLocaleString()} validators</motion.span>
        <motion.span variants={STAGGER_ITEM} className="lab-chip bg-white/90">{config.slots.toLocaleString()} slots</motion.span>
        <motion.span variants={STAGGER_ITEM} className="lab-chip bg-white/90">{comparabilityTitle}</motion.span>
        {paperScenarioLabels(config).map(label => (
          <motion.span key={label} variants={STAGGER_ITEM} className="lab-chip bg-surface-active">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {label}
          </motion.span>
        ))}
      </motion.div>

      <motion.div
        className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="visible"
      >
        {PRESETS.map(preset => (
          <motion.button
            key={preset.label}
            variants={STAGGER_ITEM}
            onClick={() => onApplyPreset(preset.config)}
            className="lab-option-card px-3 py-3 text-left card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                <div className="mt-1 text-xs leading-5 text-muted">{preset.description}</div>
              </div>
              <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-1 text-2xs font-medium uppercase tracking-[0.1em] text-accent">
                Load
              </span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  )
}
