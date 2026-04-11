import { useDeferredValue, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown, Database, Filter, Loader2, SlidersHorizontal } from 'lucide-react'
import type { AskPlanData } from '../../lib/ask-artifact'
import type { AskLaunchContext } from '../../lib/ask-launch'
import { cn } from '../../lib/cn'
import { previewStructuredQuery } from '../../lib/api'
import type { StudyAssistantQueryView } from '../../studies/types'
import type { Block } from '../../types/blocks'

interface AskQueryWorkbenchProps {
  readonly queryViews: readonly StudyAssistantQueryView[]
  readonly onLaunch: (prompt: string, launch?: AskLaunchContext) => void
  readonly activeViewId?: string | null
  readonly activeRequest?: AskPlanData['queryRequest']
  readonly busy?: boolean
}

type QueryWorkbenchState = {
  readonly viewId: string
  readonly dimensions: readonly string[]
  readonly metrics: readonly string[]
  readonly slot: 'initial' | 'final'
  readonly orderBy: string
  readonly order: 'asc' | 'desc'
  readonly limit: number
  readonly evaluation?: string
  readonly paradigm?: string
  readonly result?: string
}

type QueryWorkbenchOptions = {
  readonly metrics: readonly string[]
  readonly dimensions: readonly string[]
  readonly orderBy: readonly string[]
  readonly slots: readonly ('initial' | 'final')[]
  readonly evaluations: readonly string[]
  readonly paradigms: readonly string[]
  readonly results: readonly string[]
}

function titleCaseWord(word: string): string {
  if (/^se\d+[a-z]?$/i.test(word)) return word.toUpperCase()
  if (/^\d/.test(word)) return word
  if (/^(gini|hhi|mev)$/i.test(word)) return word.toUpperCase() === 'GINI' ? 'Gini' : word.toUpperCase()
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function labelize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bssp\b/gi, 'External')
    .replace(/\bmsp\b/gi, 'Local')
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')
}

function resolveViewOptions(view: StudyAssistantQueryView | undefined | null): QueryWorkbenchOptions {
  return {
    metrics: view?.constraints?.metrics ?? view?.defaultMetrics ?? [],
    dimensions: view?.constraints?.dimensions ?? view?.defaultDimensions ?? [],
    orderBy: view?.constraints?.orderBy ?? [
      ...(view?.defaultMetrics ?? []),
      ...(view?.defaultDimensions ?? []),
    ],
    slots: view?.constraints?.slots ?? ['final', 'initial'],
    evaluations: view?.constraints?.filters?.evaluation ?? [],
    paradigms: view?.constraints?.filters?.paradigm ?? [],
    results: view?.constraints?.filters?.result ?? [],
  }
}

function coerceSelection(
  requested: readonly string[] | undefined,
  allowed: readonly string[],
  fallback: readonly string[],
  maxItems: number,
): readonly string[] {
  const fromRequest = requested?.filter(value => allowed.includes(value)) ?? []
  if (fromRequest.length > 0) return fromRequest.slice(0, maxItems)

  const fromFallback = fallback.filter(value => allowed.includes(value))
  if (fromFallback.length > 0) return fromFallback.slice(0, maxItems)

  return allowed.slice(0, maxItems)
}

function coerceFilterValue(
  requested: string | undefined,
  allowed: readonly string[],
  fallback: string | undefined,
): string | undefined {
  if (requested && allowed.includes(requested)) return requested
  if (fallback && allowed.includes(fallback)) return fallback
  return undefined
}

function buildStateFromView(
  view: StudyAssistantQueryView,
  request?: AskPlanData['queryRequest'],
): QueryWorkbenchState {
  const options = resolveViewOptions(view)
  const defaultDimensions = view.defaultDimensions ?? options.dimensions.slice(0, 3)
  const defaultMetrics = view.defaultMetrics ?? options.metrics.slice(0, 2)
  const requestedOrderBy = request?.orderBy ?? view.defaultOrderBy
  const orderBy = requestedOrderBy && options.orderBy.includes(requestedOrderBy)
    ? requestedOrderBy
    : options.orderBy[0] ?? options.metrics[0] ?? options.dimensions[0] ?? 'gini'
  const slot = request?.slot && options.slots.includes(request.slot)
    ? request.slot
    : options.slots.includes('final')
      ? 'final'
      : (options.slots[0] ?? 'final')

  return {
    viewId: view.id,
    dimensions: coerceSelection(request?.dimensions, options.dimensions, defaultDimensions, 4),
    metrics: coerceSelection(request?.metrics, options.metrics, defaultMetrics, 4),
    slot,
    orderBy,
    order: request?.order ?? view.defaultOrder ?? 'desc',
    limit: Math.max(1, Math.min(20, request?.limit ?? view.defaultLimit ?? 8)),
    evaluation: coerceFilterValue(request?.filters?.evaluation, options.evaluations, view.filterPreset?.evaluation),
    paradigm: coerceFilterValue(request?.filters?.paradigm, options.paradigms, view.filterPreset?.paradigm),
    result: coerceFilterValue(request?.filters?.result, options.results, view.filterPreset?.result),
  }
}

function buildPrompt(view: StudyAssistantQueryView, state: QueryWorkbenchState): string {
  const filters = [
    state.evaluation ? `evaluation ${state.evaluation}` : null,
    state.paradigm ? `paradigm ${state.paradigm}` : null,
    state.result ? `result ${state.result}` : null,
  ].filter(Boolean)

  const filterClause = filters.length > 0
    ? ` Filter the rows to ${filters.join(', ')}.`
    : ''

  return `Use the structured query view "${view.title}" (${view.id}). Show me a table from the published Results catalog with columns ${state.dimensions.join(', ')} and metrics ${state.metrics.join(', ')} at the ${state.slot} snapshot, sorted by ${state.orderBy} ${state.order}, limited to ${state.limit} rows.${filterClause} Then summarize the ranking in plain language and point out the strongest comparison.`
}

function buildLaunchContext(
  view: StudyAssistantQueryView,
  state: QueryWorkbenchState,
): AskLaunchContext {
  return {
    source: 'query-workbench',
    routeHint: 'structured-results',
    structuredQuery: {
      viewId: view.id,
      dimensions: [...state.dimensions],
      metrics: [...state.metrics],
      filters: {
        evaluation: state.evaluation,
        paradigm: state.paradigm,
        result: state.result,
      },
      slot: state.slot,
      orderBy: state.orderBy,
      order: state.order,
      limit: state.limit,
    },
  }
}

function previewBlockTypeLabel(block: Block): string {
  switch (block.type) {
    case 'chart':
      return 'Chart'
    case 'table':
      return 'Table'
    case 'paperChart':
      return 'Paper figure'
    case 'insight':
      return 'Insight'
    case 'comparison':
      return 'Comparison'
    case 'stat':
      return 'Stat'
    case 'caveat':
      return 'Caveat'
    default:
      return labelize(block.type)
  }
}

function previewBlockLead(block: Block): string {
  switch (block.type) {
    case 'chart':
      return `${block.data.length} points · ${block.chartType ?? 'bar'}`
    case 'table':
      return `${block.rows.length} rows · ${block.headers.length} columns`
    case 'paperChart':
      return `Canonical figure ${labelize(block.dataKey)}`
    case 'insight':
      return block.text
    case 'comparison':
      return block.verdict ?? `${block.left.label} vs ${block.right.label}`
    case 'stat':
      return `${block.label}: ${block.value}`
    case 'caveat':
      return block.text
    default:
      return ''
  }
}

function matchesQueryState(
  state: QueryWorkbenchState | null,
  viewId: string | null | undefined,
  request: AskPlanData['queryRequest'] | undefined,
): boolean {
  if (!state || !viewId || !request) return false
  if (state.viewId !== viewId) return false

  const sameDimensions = state.dimensions.length === request.dimensions.length
    && state.dimensions.every((value, index) => value === request.dimensions[index])
  const sameMetrics = state.metrics.length === request.metrics.length
    && state.metrics.every((value, index) => value === request.metrics[index])

  return sameDimensions
    && sameMetrics
    && state.slot === request.slot
    && state.orderBy === (request.orderBy ?? state.orderBy)
    && state.order === request.order
    && state.limit === request.limit
    && (state.evaluation ?? '') === (request.filters?.evaluation ?? '')
    && (state.paradigm ?? '') === (request.filters?.paradigm ?? '')
    && (state.result ?? '') === (request.filters?.result ?? '')
}

export function AskQueryWorkbench({
  queryViews,
  onLaunch,
  activeViewId = null,
  activeRequest,
  busy = false,
}: AskQueryWorkbenchProps) {
  const [state, setState] = useState<QueryWorkbenchState | null>(
    queryViews[0] ? buildStateFromView(queryViews[0]) : null,
  )

  const activeView = queryViews.find(view => view.id === state?.viewId) ?? queryViews[0] ?? null
  const options = resolveViewOptions(activeView)
  const liveViewMatch = activeViewId
    ? queryViews.find(view => view.id === activeViewId) ?? null
    : null
  const deferredState = useDeferredValue(state)

  useEffect(() => {
    if (!queryViews.length) {
      setState(null)
      return
    }

    if (!state) {
      setState(buildStateFromView(queryViews[0]!))
      return
    }

    if (!queryViews.some(view => view.id === state.viewId)) {
      setState(buildStateFromView(queryViews[0]!))
    }
  }, [queryViews, state])

  useEffect(() => {
    if (!liveViewMatch || !activeRequest) return
    if (matchesQueryState(state, liveViewMatch.id, activeRequest)) return
    setState(buildStateFromView(liveViewMatch, activeRequest))
  }, [activeRequest, liveViewMatch, state])

  const prompt = activeView && state ? buildPrompt(activeView, state) : ''
  const launchContext = activeView && state ? buildLaunchContext(activeView, state) : null
  const deferredView = deferredState
    ? queryViews.find(view => view.id === deferredState.viewId) ?? null
    : null
  const deferredPrompt = deferredView && deferredState
    ? buildPrompt(deferredView, deferredState)
    : ''
  const deferredLaunchContext = deferredView && deferredState
    ? buildLaunchContext(deferredView, deferredState)
    : null
  const previewQuery = useQuery({
    queryKey: ['ask-query-preview', JSON.stringify(deferredLaunchContext?.structuredQuery ?? null)],
    enabled: Boolean(deferredLaunchContext),
    staleTime: 30_000,
    placeholderData: previousData => previousData,
    queryFn: async () => previewStructuredQuery(deferredPrompt, deferredLaunchContext!),
  })
  if (!activeView || !state) return null

  const preview = previewQuery.data
  const previewBlocks = preview?.response.blocks.slice(0, 3) ?? []
  const previewSummary = preview?.response.summary ?? activeView.title
  const previewStatusLabel = previewQuery.isLoading && !preview
    ? 'Loading direct preview'
    : previewQuery.isFetching
      ? 'Refreshing adapter preview'
      : 'Adapter preview ready'

  const setView = (viewId: string) => {
    const nextView = queryViews.find(view => view.id === viewId)
    if (!nextView) return
    setState(buildStateFromView(nextView))
  }

  const toggleItem = (
    key: 'dimensions' | 'metrics',
    value: string,
    maxItems: number,
  ) => {
    setState(current => {
      if (!current) return current
      const currentValues = current[key]
      const nextValues = currentValues.includes(value)
        ? currentValues.filter(item => item !== value)
        : [...currentValues, value].slice(0, maxItems)

      if (nextValues.length === 0) return current

      return {
        ...current,
        [key]: nextValues,
      }
    })
  }

  const update = <K extends keyof QueryWorkbenchState>(key: K, value: QueryWorkbenchState[K]) => {
    setState(current => current ? { ...current, [key]: value } : current)
  }

  return (
    <div className="rounded-2xl border border-rule bg-white px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">
            Structured Query Workbench
          </div>
          <h2 className="mt-1 text-base font-semibold text-text-primary">
            Compose a bounded Results query
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Pick a study-owned Results surface, choose only the supported fields, and launch a typed query without hand-writing the whole request.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {liveViewMatch && activeRequest && (
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/[0.04] px-3 py-1.5 text-11 font-medium uppercase tracking-[0.08em] text-accent">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Synced to live plan
            </div>
          )}
          <div className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface-active px-3 py-1.5 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
            <Database className="h-3.5 w-3.5" />
            Safe by study design
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-rule bg-surface-active/60 px-4 py-4">
            <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
              Query surface
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {queryViews.map(view => (
                <button
                  key={view.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setView(view.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-11 font-medium transition-colors',
                    state.viewId === view.id
                      ? 'border-accent/20 bg-white text-accent'
                      : 'border-rule bg-white/70 text-text-faint hover:border-accent/20 hover:text-accent',
                  )}
                >
                  {view.title}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-rule bg-white px-3 py-3 text-xs leading-5 text-muted">
              <div className="font-medium text-text-primary">
                {activeView.description}
              </div>
              {activeView.bestFor?.length ? (
                <div className="mt-2">
                  Best for: {activeView.bestFor.slice(0, 3).join(' • ')}
                </div>
              ) : null}
              {activeView.dashboardIds?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeView.dashboardIds.map(dashboardId => (
                    <span
                      key={`${activeView.id}-dashboard-${dashboardId}`}
                      className="rounded-full border border-accent/15 bg-accent/[0.04] px-2 py-0.5 text-11 text-accent"
                    >
                      {labelize(dashboardId)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-rule bg-surface-active/60 px-4 py-4">
              <div className="inline-flex items-center gap-2 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Metrics
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {options.metrics.map(metric => (
                  <button
                    key={`${state.viewId}-metric-${metric}`}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleItem('metrics', metric, 4)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-11 font-medium transition-colors',
                      state.metrics.includes(metric)
                        ? 'border-accent/20 bg-white text-accent'
                        : 'border-rule bg-white/70 text-text-faint hover:border-accent/20 hover:text-accent',
                    )}
                  >
                    {labelize(metric)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-rule bg-surface-active/60 px-4 py-4">
              <div className="inline-flex items-center gap-2 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Columns
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {options.dimensions.map(dimension => (
                  <button
                    key={`${state.viewId}-dimension-${dimension}`}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleItem('dimensions', dimension, 6)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-11 font-medium transition-colors',
                      state.dimensions.includes(dimension)
                        ? 'border-accent/20 bg-white text-accent'
                        : 'border-rule bg-white/70 text-text-faint hover:border-accent/20 hover:text-accent',
                    )}
                  >
                    {labelize(dimension)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-surface-active/60 px-4 py-4">
            <div className="inline-flex items-center gap-2 text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
              <Filter className="h-3.5 w-3.5" />
              Query controls
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs text-muted">
                <div className="mb-1 font-medium text-text-primary">Snapshot</div>
                <select
                  value={state.slot}
                  onChange={event => update('slot', event.target.value as 'initial' | 'final')}
                  disabled={busy}
                  className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                >
                  {options.slots.map(slot => (
                    <option key={`${state.viewId}-slot-${slot}`} value={slot}>{labelize(slot)}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-muted">
                <div className="mb-1 font-medium text-text-primary">Sort by</div>
                <select
                  value={state.orderBy}
                  onChange={event => update('orderBy', event.target.value)}
                  disabled={busy}
                  className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                >
                  {options.orderBy.map(orderBy => (
                    <option key={`${state.viewId}-orderby-${orderBy}`} value={orderBy}>{labelize(orderBy)}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-muted">
                <div className="mb-1 font-medium text-text-primary">Order</div>
                <select
                  value={state.order}
                  onChange={event => update('order', event.target.value as 'asc' | 'desc')}
                  disabled={busy}
                  className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>

              <label className="text-xs text-muted">
                <div className="mb-1 font-medium text-text-primary">Limit</div>
                <select
                  value={state.limit}
                  onChange={event => update('limit', Number(event.target.value))}
                  disabled={busy}
                  className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                >
                  {[4, 6, 8, 10, 12].map(limit => (
                    <option key={`${state.viewId}-limit-${limit}`} value={limit}>{limit} rows</option>
                  ))}
                </select>
              </label>
            </div>

            {(options.evaluations.length > 0 || options.paradigms.length > 0 || options.results.length > 0) && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {options.evaluations.length > 0 && (
                  <label className="text-xs text-muted">
                    <div className="mb-1 font-medium text-text-primary">Evaluation</div>
                    <select
                      value={state.evaluation ?? ''}
                      onChange={event => update('evaluation', event.target.value || undefined)}
                      disabled={busy}
                      className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                    >
                      <option value="">Any supported evaluation</option>
                      {options.evaluations.map(value => (
                        <option key={`${state.viewId}-evaluation-${value}`} value={value}>{labelize(value)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {options.paradigms.length > 0 && (
                  <label className="text-xs text-muted">
                    <div className="mb-1 font-medium text-text-primary">Paradigm</div>
                    <select
                      value={state.paradigm ?? ''}
                      onChange={event => update('paradigm', event.target.value || undefined)}
                      disabled={busy}
                      className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                    >
                      <option value="">Any supported paradigm</option>
                      {options.paradigms.map(value => (
                        <option key={`${state.viewId}-paradigm-${value}`} value={value}>{labelize(value)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {options.results.length > 0 && (
                  <label className="text-xs text-muted">
                    <div className="mb-1 font-medium text-text-primary">Result</div>
                    <select
                      value={state.result ?? ''}
                      onChange={event => update('result', event.target.value || undefined)}
                      disabled={busy}
                      className="w-full rounded-xl border border-rule bg-white px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/25"
                    >
                      <option value="">Any supported result</option>
                      {options.results.map(value => (
                        <option key={`${state.viewId}-result-${value}`} value={value}>{labelize(value)}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-accent/15 bg-accent/[0.04] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-11 font-medium uppercase tracking-[0.08em] text-text-faint">
                Live adapter preview
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-accent">
                {previewQuery.isLoading && !preview ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                {previewStatusLabel}
              </div>
            </div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {preview?.queryView?.title ?? activeView.title}
            </div>
            <p className="mt-2 text-xs leading-6 text-muted">
              {preview?.description || prompt}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Direct study query
              </span>
              <span className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-text-faint">
                {labelize(state.slot)} snapshot
              </span>
              <span className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-text-faint">
                {state.limit} rows
              </span>
            </div>
            {preview?.queryRequest ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {preview.queryRequest.metrics.map(metric => (
                  <span key={`preview-metric-${metric}`} className="rounded-full border border-accent/15 bg-white/85 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-accent">
                    Metric · {labelize(metric)}
                  </span>
                ))}
                {preview.queryRequest.dimensions.map(dimension => (
                  <span key={`preview-dimension-${dimension}`} className="rounded-full border border-white/80 bg-white/85 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-faint">
                    Column · {labelize(dimension)}
                  </span>
                ))}
              </div>
            ) : null}
            {preview?.queryRequest.notes.length ? (
              <div className="mt-3 rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-xs leading-5 text-muted">
                <div className="font-medium text-text-primary">Adapter note</div>
                <div className="mt-1">{preview.queryRequest.notes.join(' ')}</div>
              </div>
            ) : activeView.executionHints?.length ? (
              <div className="mt-3 rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-xs leading-5 text-muted">
                <div className="font-medium text-text-primary">Execution hint</div>
                <div className="mt-1">{activeView.executionHints[0]?.description}</div>
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {previewQuery.isLoading && !preview ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(index => (
                    <div key={`preview-loading-${index}`} className="rounded-xl border border-white/70 bg-white/80 px-3 py-3">
                      <div className="h-2.5 w-20 animate-pulse rounded-full bg-accent/10" />
                      <div className="mt-2 h-3 w-3/4 animate-pulse rounded-full bg-accent/10" />
                      <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-accent/10" />
                    </div>
                  ))}
                </div>
              ) : previewBlocks.length > 0 ? (
                previewBlocks.map((block, index) => (
                  <div key={`${block.type}-${index}`} className="rounded-xl border border-white/70 bg-white/85 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full border border-accent/15 bg-accent/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-accent">
                        {previewBlockTypeLabel(block)}
                      </span>
                      {block.type === 'table' ? (
                        <span className="text-[10px] uppercase tracking-[0.08em] text-text-faint">
                          {block.rows.length} rows
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs font-medium text-text-primary">
                      {'title' in block && typeof block.title === 'string' && block.title.trim().length > 0
                        ? block.title
                        : previewSummary}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted">
                      {previewBlockLead(block)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-xs leading-5 text-muted">
                  The adapter preview is ready, but this surface did not return a compact block scaffold yet.
                </div>
              )}
            </div>
            {previewQuery.error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">
                {(previewQuery.error as Error).message}
              </div>
            ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => onLaunch(prompt, launchContext ?? undefined)}
                className={cn(
                'mt-4 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                busy
                  ? 'cursor-not-allowed border border-rule bg-white/70 text-muted'
                  : 'bg-accent text-white hover:bg-accent/90',
              )}
            >
              Launch structured query
            </button>
          </div>

          <div className="rounded-2xl border border-rule bg-surface-active/60 px-4 py-4 text-xs leading-6 text-muted">
            <div className="font-medium text-text-primary">
              Why this matters
            </div>
            <p className="mt-2">
              This launcher is bounded by the active paper package. It only exposes the dimensions, metrics, filters, and snapshots that the study declares as safe and meaningful.
            </p>
            <p className="mt-2">
              That is the modular pattern we want long term: each research package describes its own analysis surfaces, and the site renders the right control panel automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
