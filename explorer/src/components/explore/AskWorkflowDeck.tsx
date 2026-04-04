import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useQueries } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BarChart3, Compass, Database, FlaskConical, Loader2, Sparkles, Wand2 } from 'lucide-react'
import type { AskLaunchContext } from '../../lib/ask-launch'
import { cn } from '../../lib/cn'
import { previewAskLaunch, type AskLaunchPreview } from '../../lib/api'
import {
  buildWorkflowLaunchContext,
  buildWorkflowPresetSelections,
  composeWorkflowPrompt,
  resolveWorkflowSelections,
} from '../../lib/workflow-launch'
import { SPRING } from '../../lib/theme'
import type {
  StudyAssistantMode,
  StudyAssistantRouteHint,
  StudyAssistantWorkflow,
  StudyAssistantWorkflowField,
  StudyAssistantWorkflowSection,
  StudyAssistantWorkflowSectionPreviewMode,
  StudyAssistantWorkflowSectionSurface,
} from '../../studies/types'

interface AskWorkflowDeckProps {
  readonly workflows: readonly StudyAssistantWorkflow[]
  readonly sections?: readonly StudyAssistantWorkflowSection[]
  readonly mode: Exclude<StudyAssistantMode, 'both'>
  readonly activeRoute?: StudyAssistantRouteHint | null
  readonly activePrompt?: string | null
  readonly onPromptSelect: (prompt: string, launch?: AskLaunchContext) => void
  readonly busy?: boolean
}

type WorkflowSelections = Readonly<Record<string, Readonly<Record<string, string>>>>
type WorkflowCard = {
  readonly workflow: StudyAssistantWorkflow
  readonly activePresetId: string | undefined
  readonly resolvedPrompt: string
  readonly launchContext: AskLaunchContext | undefined
}
type WorkflowSectionGroup = {
  readonly section: {
    readonly id: string
    readonly title: string
    readonly description?: string
    readonly previewMode?: StudyAssistantWorkflowSectionPreviewMode
    readonly workflowIds: readonly string[]
    readonly surface?: StudyAssistantWorkflowSectionSurface
  }
  readonly cards: readonly WorkflowCard[]
}
type WorkflowPreviewState = {
  readonly preview?: AskLaunchPreview
  readonly isLoading: boolean
  readonly isFetching: boolean
  readonly error?: Error
}

interface WorkflowPanelProps {
  readonly card: WorkflowCard
  readonly index: number
  readonly layout: StudyAssistantWorkflowSectionSurface
  readonly mode: Exclude<StudyAssistantMode, 'both'>
  readonly activeRoute?: StudyAssistantRouteHint | null
  readonly activePrompt?: string | null
  readonly busy: boolean
  readonly selections: WorkflowSelections
  readonly setSelections: Dispatch<SetStateAction<WorkflowSelections>>
  readonly previewEnabled: boolean
  readonly previewState?: WorkflowPreviewState
  readonly onPromptSelect: (prompt: string, launch?: AskLaunchContext) => void
}

function routeIcon(routeHint: StudyAssistantWorkflow['routeHint']) {
  switch (routeHint) {
    case 'orientation':
      return Compass
    case 'results':
      return BarChart3
    case 'structured-results':
      return Database
    case 'simulation-config':
      return FlaskConical
    case 'hybrid':
    default:
      return Sparkles
  }
}

function routeLabel(routeHint: StudyAssistantWorkflow['routeHint']): string {
  switch (routeHint) {
    case 'orientation':
      return 'Reading route'
    case 'results':
      return 'Results route'
    case 'structured-results':
      return 'Structured query'
    case 'simulation-config':
      return 'Experiment plan'
    case 'hybrid':
    default:
      return 'Hybrid route'
  }
}

function labelizeWorkflowValue(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bssp\b/gi, 'External')
    .replace(/\bmsp\b/gi, 'Local')
    .replace(/\s+/g, ' ')
    .trim()
}

function describeDirectLaunch(launch: AskLaunchContext | undefined): string | null {
  if (launch?.structuredQuery?.viewId) {
    return [
      labelizeWorkflowValue(launch.structuredQuery.viewId),
      launch.structuredQuery.metrics?.length
        ? launch.structuredQuery.metrics.map(labelizeWorkflowValue).join(', ')
        : null,
      launch.structuredQuery.slot ?? null,
    ].filter(Boolean).join(' · ')
  }

  if (launch?.simulationConfig) {
    return [
      launch.simulationConfig.paradigm === 'SSP'
        ? 'External'
        : launch.simulationConfig.paradigm === 'MSP'
          ? 'Local'
          : null,
      typeof launch.simulationConfig.slotTime === 'number'
        ? `${launch.simulationConfig.slotTime}s slots`
        : null,
      typeof launch.simulationConfig.sourcePlacement === 'string'
        ? labelizeWorkflowValue(launch.simulationConfig.sourcePlacement)
        : null,
      typeof launch.simulationConfig.distribution === 'string'
        ? labelizeWorkflowValue(launch.simulationConfig.distribution)
        : null,
    ].filter(Boolean).join(' · ')
  }

  return null
}

function matchesMode(
  workflow: StudyAssistantWorkflow,
  mode: Exclude<StudyAssistantMode, 'both'>,
): boolean {
  return workflow.mode == null || workflow.mode === 'both' || workflow.mode === mode
}

function matchesSectionMode(
  section: StudyAssistantWorkflowSection,
  mode: Exclude<StudyAssistantMode, 'both'>,
): boolean {
  return section.mode == null || section.mode === 'both' || section.mode === mode
}

function normalizePrompt(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function buildDefaultSelections(fields: readonly StudyAssistantWorkflowField[] | undefined): Record<string, string> {
  if (!fields?.length) return {}

  return Object.fromEntries(fields.map(field => {
    const defaultValue = field.defaultValue ?? field.options[0]?.value ?? ''
    return [field.id, defaultValue]
  }))
}

function syncWorkflowSelections(
  workflows: readonly StudyAssistantWorkflow[],
  current: WorkflowSelections,
): WorkflowSelections {
  const next: Record<string, Record<string, string>> = {}

  for (const workflow of workflows) {
    if (!workflow.fields?.length) continue
    const defaults = buildDefaultSelections(workflow.fields)
    const existing = current[workflow.id] ?? {}

    next[workflow.id] = Object.fromEntries(workflow.fields.map(field => {
      const selected = existing[field.id]
      const allowedValues = new Set(field.options.map(option => option.value))
      return [field.id, selected && allowedValues.has(selected) ? selected : defaults[field.id] ?? '']
    }))
  }

  return next
}

function detectActivePresetId(
  workflow: StudyAssistantWorkflow,
  selections: Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (!workflow.presets?.length) return undefined
  const resolvedSelections = resolveWorkflowSelections(workflow, selections)
  return workflow.presets.find(preset =>
    Object.entries(preset.values ?? {}).every(([key, value]) => resolvedSelections[key] === value),
  )?.id
}

function resolveSectionSurface(
  section: WorkflowSectionGroup['section'],
  mode: Exclude<StudyAssistantMode, 'both'>,
): StudyAssistantWorkflowSectionSurface {
  if (section.surface) return section.surface
  return mode === 'experiment' ? 'preset-strip' : 'cards'
}

function sectionSurfaceCopy(surface: StudyAssistantWorkflowSectionSurface): string {
  switch (surface) {
    case 'compact-list':
      return 'Compact guide'
    case 'preset-strip':
      return 'Launch rail'
    case 'cards':
    default:
      return 'Workflow deck'
  }
}

function resolveSectionPreviewMode(
  section: WorkflowSectionGroup['section'],
  surface: StudyAssistantWorkflowSectionSurface,
): StudyAssistantWorkflowSectionPreviewMode {
  if (section.previewMode) return section.previewMode
  return surface === 'cards' ? 'all' : 'featured'
}

function sectionPreviewCopy(previewMode: StudyAssistantWorkflowSectionPreviewMode): string {
  switch (previewMode) {
    case 'featured':
      return 'Featured preview'
    case 'all':
    default:
      return 'All previews'
  }
}

function renderOutputs(workflow: StudyAssistantWorkflow) {
  if (!workflow.outputs?.length) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {workflow.outputs.slice(0, 3).map((output: string) => (
        <span
          key={`${workflow.id}-${output}`}
          className="rounded-full border border-rule bg-white px-2 py-0.5 text-11 text-text-faint"
        >
          {output}
        </span>
      ))}
    </div>
  )
}

function renderBestFor(workflow: StudyAssistantWorkflow, compact = false) {
  if (!workflow.bestFor?.length) return null

  return (
    <div
      className={cn(
        'rounded-xl border border-rule bg-white/90 text-muted',
        compact ? 'px-3 py-2 text-[11px] leading-5' : 'px-3 py-2 text-11 leading-5',
      )}
    >
      <span className="font-medium text-text-primary">Best for:</span>{' '}
      {workflow.bestFor.slice(0, compact ? 3 : 2).join(' • ')}
    </div>
  )
}

function renderLaunchSummary(
  resolvedPrompt: string,
  launchContext: AskLaunchContext | undefined,
  compact = false,
) {
  const directLaunch = describeDirectLaunch(launchContext)

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'rounded-xl border border-accent/10 bg-accent/[0.03] text-muted',
          compact ? 'px-3 py-2 text-[11px] leading-5' : 'px-3 py-2 text-11 leading-5',
        )}
      >
        <span className="font-medium text-text-primary">Launch preview:</span>{' '}
        {resolvedPrompt}
      </div>
      {directLaunch ? (
        <div
          className={cn(
            'rounded-xl border border-rule bg-white/90 text-muted',
            compact ? 'px-3 py-2 text-[11px] leading-5' : 'px-3 py-2 text-11 leading-5',
          )}
        >
          <span className="font-medium text-text-primary">
            {launchContext?.structuredQuery ? 'Direct query:' : 'Direct plan:'}
          </span>{' '}
          {directLaunch}
        </div>
      ) : null}
    </div>
  )
}

function renderAdapterPreview(
  workflow: StudyAssistantWorkflow,
  launchContext: AskLaunchContext | undefined,
  previewEnabled: boolean,
  previewState: WorkflowPreviewState | undefined,
  compact = false,
) {
  if (!launchContext?.structuredQuery?.viewId && !launchContext?.simulationConfig) return null

  if (!previewEnabled) {
    return (
      <div className="rounded-xl border border-rule bg-white/90 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
            Adapter preview
          </div>
          <div className="rounded-full border border-rule bg-surface-active px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-faint">
            Focus to preview
          </div>
        </div>
        <div className="mt-2 text-11 leading-5 text-muted">
          This section only preloads the featured workflow. Focus or launch this item to load its study-owned surface.
        </div>
      </div>
    )
  }

  const previewLabel = previewState?.isLoading && !previewState.preview
    ? 'Loading preview'
    : previewState?.isFetching
      ? 'Refreshing preview'
      : 'Direct preview ready'

  return (
    <div
      className={cn(
        'rounded-xl border border-rule bg-white/90',
        compact ? 'px-3 py-3' : 'px-3 py-3',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
          Adapter preview
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface-active px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-faint">
          {previewState?.isLoading && !previewState.preview ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Database className="h-3 w-3" />
          )}
          {previewLabel}
        </div>
      </div>
      {previewState?.isLoading && !previewState.preview ? (
        <div className="mt-2 space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-accent/10" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-accent/10" />
        </div>
      ) : previewState?.preview ? (
        <>
          <div className="mt-2 text-xs font-medium text-text-primary">
            {previewState.preview.queryView?.title
              ?? describeDirectLaunch(launchContext)
              ?? workflow.title}
          </div>
          <div className="mt-1 text-11 leading-5 text-muted">
            {previewState.preview.response.summary}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {previewState.preview.response.blocks.slice(0, 3).map((block, blockIndex) => (
              <span
                key={`${workflow.id}-preview-${block.type}-${blockIndex}`}
                className="rounded-full border border-accent/15 bg-accent/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-accent"
              >
                {'title' in block && typeof block.title === 'string' && block.title.trim().length > 0
                  ? block.title
                  : block.type}
              </span>
            ))}
          </div>
          {previewState.preview.queryRequest?.notes?.length ? (
            <div className="mt-2 text-11 leading-5 text-text-faint">
              {previewState.preview.queryRequest.notes.join(' ')}
            </div>
          ) : null}
        </>
      ) : previewState?.error ? (
        <div className="mt-2 text-11 leading-5 text-rose-700">
          {previewState.error.message}
        </div>
      ) : (
        <div className="mt-2 text-11 leading-5 text-muted">
          Launch this workflow to load the study-owned surface directly.
        </div>
      )}
    </div>
  )
}

function renderWorkflowControls(
  workflow: StudyAssistantWorkflow,
  activePresetId: string | undefined,
  busy: boolean,
  selections: WorkflowSelections,
  setSelections: Dispatch<SetStateAction<WorkflowSelections>>,
  layout: StudyAssistantWorkflowSectionSurface,
) {
  if (!workflow.fields?.length) return null

  const compact = layout !== 'cards'

  return (
    <div className={cn(
      'rounded-xl border border-rule bg-white/90',
      compact ? 'px-3 py-3' : 'px-3 py-3',
    )}>
      <div className="mb-2 inline-flex items-center gap-1.5 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
        <Wand2 className="h-3.5 w-3.5" />
        Typed launch
      </div>
      {workflow.presets?.length ? (
        <div className="mb-3 rounded-xl border border-accent/10 bg-accent/[0.03] px-3 py-3">
          <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
            Quick presets
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {workflow.presets.map((preset) => (
              <button
                key={`${workflow.id}-${preset.id}`}
                type="button"
                disabled={busy}
                onClick={() => {
                  const presetSelections = buildWorkflowPresetSelections(workflow, preset.id)
                  setSelections(current => ({
                    ...current,
                    [workflow.id]: presetSelections,
                  }))
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-11 font-medium transition-colors',
                  activePresetId === preset.id
                    ? 'border-accent/20 bg-white text-accent'
                    : 'border-rule bg-white/70 text-text-faint hover:border-accent/20 hover:text-accent',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {workflow.presets.find((preset) => preset.id === activePresetId)?.description ? (
            <div className="mt-2 text-11 leading-5 text-muted">
              {workflow.presets.find((preset) => preset.id === activePresetId)?.description}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn(
        'grid gap-2',
        layout === 'preset-strip'
          ? 'xl:grid-cols-3 md:grid-cols-2'
          : compact
            ? 'md:grid-cols-2'
            : '',
      )}>
        {workflow.fields.map((field) => {
          const selectedValue = selections[workflow.id]?.[field.id] ?? field.defaultValue ?? field.options[0]?.value ?? ''
          return (
            <label key={`${workflow.id}-${field.id}`} className="text-xs text-muted">
              <div className="mb-1 font-medium text-text-primary">{field.label}</div>
              <select
                value={selectedValue}
                disabled={busy}
                onChange={event => {
                  const nextValue = event.target.value
                  setSelections(current => ({
                    ...current,
                    [workflow.id]: {
                      ...(current[workflow.id] ?? buildDefaultSelections(workflow.fields)),
                      [field.id]: nextValue,
                    },
                  }))
                }}
                className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
              >
                {field.options.map((option) => (
                  <option key={`${workflow.id}-${field.id}-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.description ? (
                <div className="mt-1 text-11 leading-5 text-text-faint">
                  {field.description}
                </div>
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function renderActionButton(
  workflow: StudyAssistantWorkflow,
  mode: Exclude<StudyAssistantMode, 'both'>,
  busy: boolean,
  isActive: boolean,
  resolvedPrompt: string,
  launchContext: AskLaunchContext | undefined,
  onPromptSelect: (prompt: string, launch?: AskLaunchContext) => void,
) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPromptSelect(resolvedPrompt, launchContext)}
      className={cn(
        'rounded-full border px-3 py-1.5 text-11 font-medium transition-colors',
        busy
          ? 'cursor-not-allowed border-rule bg-white/60 text-muted'
          : isActive
            ? 'border-accent/25 bg-white text-accent hover:border-accent/35'
            : 'border-accent/20 bg-white text-accent hover:border-accent/30 hover:bg-accent/[0.04]',
      )}
    >
      {workflow.fields?.length
        ? (mode === 'experiment' ? 'Compose run plan' : 'Compose workflow')
        : (mode === 'experiment' ? 'Use this run plan' : 'Launch workflow')}
    </button>
  )
}

function WorkflowPanel({
  card,
  index,
  layout,
  mode,
  activeRoute,
  activePrompt,
  busy,
  selections,
  setSelections,
  previewState,
  previewEnabled,
  onPromptSelect,
}: WorkflowPanelProps) {
  const { workflow, activePresetId, resolvedPrompt, launchContext } = card
  const Icon = routeIcon(workflow.routeHint)
  const isPromptActive = normalizePrompt(activePrompt) === normalizePrompt(resolvedPrompt)
  const isRouteActive = !isPromptActive && workflow.routeHint != null && workflow.routeHint === activeRoute
  const isActive = isPromptActive || isRouteActive
  const showSecondaryRail = layout === 'compact-list'
    && Boolean(workflow.fields?.length || launchContext?.structuredQuery?.viewId || launchContext?.simulationConfig)

  return (
    <motion.div
      key={workflow.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: index * 0.03 }}
      className={cn(
        'border transition-colors',
        layout === 'preset-strip'
          ? cn(
            'rounded-[28px] px-4 py-4 shadow-[0_14px_32px_rgba(37,99,235,0.08)]',
            isActive
              ? 'border-accent/25 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(255,255,255,0.96))]'
              : 'border-accent/15 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]',
          )
          : layout === 'compact-list'
            ? cn(
              'rounded-2xl px-4 py-4 shadow-sm',
              isActive ? 'border-accent/25 bg-accent/[0.04]' : 'border-rule bg-white',
            )
            : cn(
              'rounded-2xl px-4 py-4 shadow-sm',
              isActive ? 'border-accent/25 bg-accent/[0.04]' : 'border-rule bg-surface-active/60',
            ),
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rule bg-white text-text-primary shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary">
              {workflow.title}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              {workflow.description}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {workflow.badge ? (
            <span className="rounded-full border border-accent/15 bg-white px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-accent">
              {workflow.badge}
            </span>
          ) : null}
          {(launchContext?.structuredQuery?.viewId || launchContext?.simulationConfig) ? (
            <span className="rounded-full border border-accent/15 bg-white px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-accent">
              Direct surface
            </span>
          ) : null}
          <span className="rounded-full border border-rule bg-white px-2 py-0.5 text-11 uppercase tracking-[0.08em] text-text-faint">
            {routeLabel(workflow.routeHint)}
          </span>
        </div>
      </div>

      <div className={cn(
        'mt-3 gap-3',
        showSecondaryRail ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.95fr)]' : '',
      )}>
        <div className="space-y-3">
          {renderOutputs(workflow)}
          {renderBestFor(workflow, layout !== 'cards')}
          {!showSecondaryRail ? renderWorkflowControls(
            workflow,
            activePresetId,
            busy,
            selections,
            setSelections,
            layout,
          ) : null}
          {!showSecondaryRail ? renderLaunchSummary(resolvedPrompt, launchContext, layout !== 'cards') : null}
        </div>

        {showSecondaryRail ? (
          <div className="mt-3 space-y-3 lg:mt-0">
            {renderWorkflowControls(
              workflow,
              activePresetId,
              busy,
              selections,
              setSelections,
              layout,
            )}
            {renderLaunchSummary(resolvedPrompt, launchContext, true)}
            {renderAdapterPreview(workflow, launchContext, previewEnabled, previewState, true)}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {renderAdapterPreview(workflow, launchContext, previewEnabled, previewState, layout !== 'cards')}
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-start">
        {renderActionButton(
          workflow,
          mode,
          busy,
          isActive,
          resolvedPrompt,
          launchContext,
          onPromptSelect,
        )}
      </div>
    </motion.div>
  )
}

function isCardActive(
  card: WorkflowCard,
  activePrompt?: string | null,
  activeRoute?: StudyAssistantRouteHint | null,
): boolean {
  const isPromptActive = normalizePrompt(activePrompt) === normalizePrompt(card.resolvedPrompt)
  const isRouteActive = !isPromptActive && card.workflow.routeHint != null && card.workflow.routeHint === activeRoute
  return isPromptActive || isRouteActive
}

export function AskWorkflowDeck({
  workflows,
  sections = [],
  mode,
  activeRoute,
  activePrompt,
  onPromptSelect,
  busy = false,
}: AskWorkflowDeckProps) {
  const visibleWorkflows = workflows.filter(workflow => matchesMode(workflow, mode))
  const [selections, setSelections] = useState<WorkflowSelections>(() => syncWorkflowSelections(visibleWorkflows, {}))

  useEffect(() => {
    setSelections(current => syncWorkflowSelections(workflows.filter(workflow => matchesMode(workflow, mode)), current))
  }, [mode, workflows])

  if (visibleWorkflows.length === 0) return null

  const workflowCards = visibleWorkflows.map(workflow => {
    const activePresetId = detectActivePresetId(workflow, selections[workflow.id])
    const resolvedPrompt = composeWorkflowPrompt(workflow, selections[workflow.id], activePresetId)
    const launchContext = buildWorkflowLaunchContext(workflow, selections[workflow.id], activePresetId)
    return {
      workflow,
      activePresetId,
      resolvedPrompt,
      launchContext,
    } satisfies WorkflowCard
  })

  const workflowCardById = new Map<string, WorkflowCard>(workflowCards.map(card => [card.workflow.id, card]))
  const workflowCardIndexById = new Map<string, number>(workflowCards.map((card, index) => [card.workflow.id, index]))
  const explicitSections: WorkflowSectionGroup[] = sections
    .filter(section => matchesSectionMode(section, mode))
    .map(section => ({
      section,
      cards: section.workflowIds.reduce<WorkflowCard[]>((acc, workflowId) => {
        const card = workflowCardById.get(workflowId)
        if (card) acc.push(card)
        return acc
      }, []),
    }))
    .filter(group => group.cards.length > 0)
  const explicitlyAssignedIds = new Set(explicitSections.flatMap(group => group.cards.map(card => card.workflow.id)))
  const remainingCards = workflowCards.filter(card => !explicitlyAssignedIds.has(card.workflow.id))
  const groupedSections: WorkflowSectionGroup[] = explicitSections.length > 0
    ? [
        ...explicitSections,
        ...(remainingCards.length > 0 ? [{
          section: {
            id: 'more-workflows',
            title: 'More Flows',
            description: 'Additional study-owned launches that are still available for this mode.',
            workflowIds: remainingCards.map(card => card.workflow.id),
            surface: 'cards' as const,
          },
          cards: remainingCards,
        }] : []),
      ]
    : [{
        section: {
          id: 'all-workflows',
          title: 'All Flows',
          workflowIds: workflowCards.map(card => card.workflow.id),
          surface: mode === 'experiment' ? 'preset-strip' : 'cards',
        },
        cards: workflowCards,
      }]

  const previewEnabledWorkflowIds = groupedSections.reduce<Set<string>>((acc, group) => {
    const surface = resolveSectionSurface(group.section, mode)
    const previewMode = resolveSectionPreviewMode(group.section, surface)
    const previewableCards = group.cards.filter(card =>
      Boolean(card.launchContext?.structuredQuery || card.launchContext?.simulationConfig),
    )

    if (previewMode === 'all') {
      for (const card of previewableCards) acc.add(card.workflow.id)
      return acc
    }

    const featuredCard = previewableCards.find(card => isCardActive(card, activePrompt, activeRoute))
      ?? previewableCards[0]
    if (featuredCard) acc.add(featuredCard.workflow.id)
    return acc
  }, new Set<string>())

  const workflowPreviewQueries = useQueries({
    queries: workflowCards.map(card => ({
      queryKey: [
        'ask-workflow-preview',
        card.workflow.id,
        card.launchContext?.structuredQuery ?? null,
        card.launchContext?.simulationConfig ?? null,
      ],
      enabled: previewEnabledWorkflowIds.has(card.workflow.id),
      staleTime: 30_000,
      placeholderData: (previousData: AskLaunchPreview | undefined) => previousData,
      queryFn: async () => previewAskLaunch(card.resolvedPrompt, card.launchContext!),
    })),
  })
  const workflowPreviewStates: WorkflowPreviewState[] = workflowPreviewQueries.map(query => ({
    preview: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error : undefined,
  }))

  return (
    <div className="rounded-2xl border border-rule bg-white px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Workspace Flows
          </div>
          <h2 className="mt-1 text-base font-semibold text-text-primary">
            Start from a concrete research action
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            These are study-owned workflows, not generic prompt chips. Papers can define fixed launches or typed forms, then group them into different section surfaces depending on what the reader should do next.
          </p>
        </div>
        <div className="rounded-full border border-rule bg-surface-active px-3 py-1.5 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
          {visibleWorkflows.length} launchable flows
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {groupedSections.map(({ section, cards }) => {
          const surface = resolveSectionSurface(section, mode)
          const previewMode = resolveSectionPreviewMode(section, surface)

          return (
            <section key={section.id} className="space-y-3">
              {explicitSections.length > 0 ? (
                <div
                  className={cn(
                    'rounded-2xl border px-4 py-3',
                    surface === 'preset-strip'
                      ? 'border-accent/10 bg-[linear-gradient(180deg,rgba(239,246,255,0.6),rgba(255,255,255,0.95))]'
                      : surface === 'compact-list'
                        ? 'border-rule bg-white'
                        : 'border-rule bg-surface-active/60',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
                        {section.title}
                      </div>
                      <div className="rounded-full border border-rule bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                        {sectionPreviewCopy(previewMode)}
                      </div>
                    </div>
                    <div className="rounded-full border border-rule bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                      {sectionSurfaceCopy(surface)}
                    </div>
                  </div>
                  {section.description ? (
                    <div className="mt-1 text-xs leading-5 text-muted">
                      {section.description}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                className={cn(
                  surface === 'cards'
                    ? 'grid gap-3 xl:grid-cols-3 md:grid-cols-2'
                    : 'space-y-3',
                )}
              >
                {cards.map(card => {
                  const index = workflowCardIndexById.get(card.workflow.id) ?? 0
                  return (
                    <WorkflowPanel
                      key={card.workflow.id}
                      card={card}
                      index={index}
                      layout={surface}
                      mode={mode}
                      activeRoute={activeRoute}
                      activePrompt={activePrompt}
                      busy={busy}
                      selections={selections}
                      setSelections={setSelections}
                      previewEnabled={previewEnabledWorkflowIds.has(card.workflow.id)}
                      previewState={workflowPreviewStates[index]}
                      onPromptSelect={onPromptSelect}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
