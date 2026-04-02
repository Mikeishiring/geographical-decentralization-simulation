import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import type { AskToolActivity } from '../../lib/ask-chat'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../../lib/theme'

type AskLoadingTone = 'active' | 'steady' | 'slow'
type AskLoadingStageState = 'done' | 'active' | 'pending'

interface AskLoadingStage {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly state: AskLoadingStageState
}

export interface AskLoadingDescriptor {
  readonly badge: string
  readonly headline: string
  readonly detail: string
  readonly freshnessLabel: string
  readonly elapsedLabel: string
  readonly progress: number
  readonly tone: AskLoadingTone
  readonly stages: readonly AskLoadingStage[]
}

interface BuildAskLoadingDescriptorInput {
  readonly anthropicEnabled: boolean
  readonly elapsedMs: number
  readonly quietMs: number
  readonly assistantText: string
  readonly toolActivities: readonly AskToolActivity[]
}

interface AskLoadingStateCardProps {
  readonly descriptor: AskLoadingDescriptor
  readonly assistantText?: string
  readonly toolActivities?: readonly AskToolActivity[]
  readonly compact?: boolean
}

const RENDER_TOOL_NAME = 'render_blocks'

function stageState(isDone: boolean, isActive: boolean): AskLoadingStageState {
  if (isDone) return 'done'
  if (isActive) return 'active'
  return 'pending'
}

function formatElapsedLabel(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function trimLiveText(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function buildAskLoadingDescriptor({
  anthropicEnabled,
  elapsedMs,
  quietMs,
  assistantText,
  toolActivities,
}: BuildAskLoadingDescriptorInput): AskLoadingDescriptor {
  const normalizedAssistantText = assistantText.trim()
  const evidenceActivities = toolActivities.filter(activity => activity.toolName !== RENDER_TOOL_NAME)
  const renderActivity = toolActivities.find(
    activity => activity.toolName === RENDER_TOOL_NAME,
  ) as AskToolActivity | undefined
  const renderActivityState = renderActivity?.state
  const activeTool = toolActivities.find(activity => activity.state === 'running') as AskToolActivity | undefined

  const evidenceStarted = evidenceActivities.length > 0 || normalizedAssistantText.length > 0 || elapsedMs >= (anthropicEnabled ? 1200 : 900)
  const composeStarted = normalizedAssistantText.length > 0 || renderActivity !== undefined || elapsedMs >= (anthropicEnabled ? 3400 : 2600)
  const renderStarted = renderActivity !== undefined || elapsedMs >= (anthropicEnabled ? 8000 : 6200)

  const evidenceDone = evidenceActivities.some(activity => activity.state === 'done') || composeStarted || renderStarted
  const composeDone = renderStarted || renderActivityState === 'done'
  const renderDone = renderActivityState === 'done'

  let progress = 14
  if (evidenceStarted) progress = Math.max(progress, 28)
  if (evidenceDone) progress = Math.max(progress, 44)
  if (composeStarted) progress = Math.max(progress, 58)
  if (composeDone) progress = Math.max(progress, 72)
  if (renderStarted) progress = Math.max(progress, 84)

  const timeNudge = quietMs >= 10_000
    ? Math.min(4, elapsedMs / 5000)
    : Math.min(10, elapsedMs / 1800)
  progress = Math.min(94, progress + timeNudge)

  const tone: AskLoadingTone =
    quietMs >= 12_000 ? 'slow' :
    quietMs >= 5_000 ? 'steady' :
    'active'

  let badge = 'Live answer generation'
  let headline = 'Sending your question into the reading guide'
  let detail = anthropicEnabled
    ? 'Preparing the paper context and deciding what evidence to pull in first.'
    : 'Looking through the cached paper-backed response layer.'

  if (renderStarted) {
    badge = tone === 'slow' ? 'Final page is taking longer' : 'Final page in progress'
    headline = 'Organizing the answer into a readable page'
    detail = renderActivityState === 'running'
      ? 'The evidence is in and the final blocks are being assembled now.'
      : renderActivityState === 'done'
        ? 'The response is in its last formatting pass.'
        : 'The answer should be nearing its final layout.'
  } else if (composeStarted) {
    badge = tone === 'slow' ? 'Still drafting' : 'Drafting from evidence'
    headline = 'Turning the gathered evidence into a direct answer'
    detail = normalizedAssistantText.length > 0
      ? 'The assistant has started writing and is tightening the explanation.'
      : 'The model is moving from retrieval into synthesis.'
  } else if (evidenceStarted) {
    badge = tone === 'slow' ? 'Checking more sources' : 'Gathering evidence'
    headline = 'Reviewing paper evidence and prior explorations'
    detail = activeTool
      ? `${activeTool.label}.`
      : 'Searching curated topic cards, cached results, and related notes.'
  }

  let freshnessLabel = 'Updated just now'
  if (quietMs >= 14_000) {
    freshnessLabel = `No fresh step for ${Math.round(quietMs / 1000)}s. This answer is taking longer than usual.`
  } else if (quietMs >= 8_000) {
    freshnessLabel = `No fresh step for ${Math.round(quietMs / 1000)}s. It is likely in a drafting pass.`
  } else if (quietMs >= 3_000) {
    freshnessLabel = `Last visible step ${Math.round(quietMs / 1000)}s ago.`
  }

  return {
    badge,
    headline,
    detail,
    freshnessLabel,
    elapsedLabel: formatElapsedLabel(elapsedMs),
    progress,
    tone,
    stages: [
      {
        id: 'received',
        label: 'Question received',
        detail: 'The request is queued with the current reading context.',
        state: 'done',
      },
      {
        id: 'evidence',
        label: 'Checking evidence',
        detail: activeTool?.toolName === RENDER_TOOL_NAME
          ? 'The evidence pass is complete.'
          : 'Searching topic cards, prior readings, and cached results.',
        state: stageState(evidenceDone, evidenceStarted),
      },
      {
        id: 'compose',
        label: 'Drafting answer',
        detail: 'Turning the evidence into a direct, paper-backed answer.',
        state: stageState(composeDone, composeStarted),
      },
      {
        id: 'render',
        label: 'Building page',
        detail: 'Laying out the final blocks and follow-up prompts.',
        state: stageState(renderDone, renderStarted),
      },
    ],
  }
}

export function AskLoadingStateCard({
  descriptor,
  assistantText = '',
  toolActivities = [],
  compact = false,
}: AskLoadingStateCardProps) {
  const liveText = assistantText.trim()
  const visibleToolActivities = compact
    ? toolActivities.slice(0, 2)
    : toolActivities.slice(0, 4)
  const trimmedLiveText = liveText
    ? trimLiveText(liveText, compact ? 140 : 240)
    : ''

  return (
    <div className={cn('ask-loading-card', compact ? 'px-4 py-4' : 'px-5 py-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/10 bg-white/90 px-2.5 py-1 text-11 font-medium text-accent shadow-sm">
            <span className="ask-loading-dot" data-tone={descriptor.tone} />
            <Loader2 className={cn('h-3.5 w-3.5', descriptor.tone !== 'slow' && 'animate-spin')} />
            {descriptor.badge}
          </div>
          <div className="mt-3 text-sm font-medium leading-6 text-text-primary">
            {descriptor.headline}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {descriptor.detail}
          </p>
        </div>

        <div className="shrink-0 rounded-full border border-rule bg-white/80 px-3 py-2 text-right shadow-sm">
          <div className="mono-sm text-text-primary">{descriptor.elapsedLabel}</div>
          <div className="text-2xs uppercase tracking-[0.08em] text-text-faint">elapsed</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="lab-progress-track">
          <motion.div
            className="lab-progress-fill"
            data-state="active"
            initial={{ width: '14%' }}
            animate={{ width: `${descriptor.progress}%` }}
            transition={SPRING_SNAPPY}
          />
        </div>
        <div className="mt-2 text-11 leading-5 text-muted">
          {descriptor.freshnessLabel}
        </div>
      </div>

      <div className={cn('mt-4 grid gap-2', compact ? 'sm:grid-cols-2' : 'md:grid-cols-4')}>
        {descriptor.stages.map((stage, index) => (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: index * 0.04 }}
            className="ask-loading-stage rounded-xl border px-3 py-3"
            data-state={stage.state}
          >
            <div className="flex items-center gap-2">
              <span className="ask-loading-stage-dot" data-state={stage.state} />
              <span className="text-2xs font-medium uppercase tracking-[0.08em] text-text-faint">
                {stage.label}
              </span>
            </div>
            {!compact && (
              <div className="mt-2 text-11 leading-5 text-muted">
                {stage.detail}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {(trimmedLiveText || visibleToolActivities.length > 0) && (
        <div className="mt-4 space-y-3">
          {trimmedLiveText && (
            <div className="rounded-xl border border-rule bg-white/85 px-3.5 py-3 shadow-sm">
              <div className="text-2xs font-medium uppercase tracking-[0.08em] text-text-faint">
                Live note
              </div>
              <p className="mt-1.5 text-sm leading-6 text-text-primary">
                {trimmedLiveText}
              </p>
            </div>
          )}

          {visibleToolActivities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {visibleToolActivities.map(activity => (
                <div
                  key={activity.id}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-11 font-medium shadow-sm',
                    activity.state === 'done' && 'border-success/20 bg-success/5 text-success',
                    activity.state === 'error' && 'border-danger/20 bg-danger/5 text-danger',
                    activity.state === 'running' && 'border-accent/20 bg-white text-accent',
                  )}
                >
                  <span
                    className="ask-loading-stage-dot"
                    data-state={
                      activity.state === 'done'
                        ? 'done'
                        : activity.state === 'error'
                          ? 'error'
                          : 'active'
                    }
                  />
                  {activity.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
