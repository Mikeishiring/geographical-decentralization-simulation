import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { cn } from '../../lib/cn'
import { getApiHealth } from '../../lib/api'
import { askPublishedReplayCopilot } from '../../lib/published-replay-api'
import type { PublishedViewerSnapshot } from './PublishedDatasetViewer'

interface DatasetRef {
  readonly evaluation: string
  readonly paradigm: string
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
}

interface PublishedReplayCompanionPanelProps {
  readonly question: string
  readonly onQuestionChange: (value: string) => void
  readonly dataset: DatasetRef | null
  readonly comparisonDataset: DatasetRef | null
  readonly paperLens: 'evidence' | 'theory' | 'methods'
  readonly audienceMode: 'reader' | 'reviewer' | 'researcher'
  readonly currentViewSummary: string
  readonly viewerSnapshot: PublishedViewerSnapshot | null
}

function datasetLabel(dataset: DatasetRef | null): string {
  if (!dataset) return 'No published replay selected'
  return `${dataset.evaluation} / ${dataset.paradigm} / ${dataset.result}`
}

function sourceRoleLabel(sourceRole: string | undefined): string {
  if (sourceRole === 'signal') return 'Signal sources'
  if (sourceRole === 'supplier') return 'Supplier sources'
  return 'Info sources'
}

export function PublishedReplayCompanionPanel({
  question,
  onQuestionChange,
  dataset,
  comparisonDataset,
  paperLens,
  audienceMode,
  currentViewSummary,
  viewerSnapshot,
}: PublishedReplayCompanionPanelProps) {
  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    staleTime: 30_000,
  })
  const [answeredSlotNumber, setAnsweredSlotNumber] = useState<number | null>(null)

  const mutation = useMutation({
    mutationFn: (nextQuestion: string) => {
      if (!dataset) {
        throw new Error('Select a published replay before querying the companion.')
      }

      return askPublishedReplayCopilot({
        question: nextQuestion,
        datasetPath: dataset.path,
        datasetLabel: datasetLabel(dataset),
        sourceRole: dataset.sourceRole ?? null,
        comparePath: comparisonDataset?.path ?? null,
        compareLabel: datasetLabel(comparisonDataset),
        compareSourceRole: comparisonDataset?.sourceRole ?? null,
        focusSlot: viewerSnapshot?.slotIndex ?? null,
        paperLens,
        audienceMode,
        currentViewSummary,
      })
    },
    onSuccess: () => {
      setAnsweredSlotNumber(viewerSnapshot?.slotNumber ?? null)
    },
  })

  useEffect(() => {
    mutation.reset()
    setAnsweredSlotNumber(null)
  }, [comparisonDataset?.path, dataset?.path, mutation, paperLens, audienceMode])

  const isAnthropicEnabled = apiHealthQuery.data?.anthropicEnabled ?? false
  const disabledReason = !dataset
    ? 'Select a published replay first.'
    : apiHealthQuery.isLoading
      ? 'Checking replay-companion availability...'
      : apiHealthQuery.isError
        ? 'The API server is unreachable right now.'
        : !isAnthropicEnabled
          ? 'The replay companion is offline. Add ANTHROPIC_API_KEY to explorer/.env to enable replay-backed answers.'
          : ''
  const canAsk = Boolean(dataset) && Boolean(question.trim()) && !mutation.isPending && isAnthropicEnabled
  const response = mutation.data

  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-white px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Replay companion</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            Ask against the selected published replay, not against generic paper copy.
          </div>
          <div className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            The companion reads the frozen dataset, the active reading lens, and the optional comparison replay.
            {viewerSnapshot ? ` It can also anchor on slot ${viewerSnapshot.slotNumber.toLocaleString()} if your question is about what is on screen right now.` : ''}
          </div>
        </div>

        <button
          onClick={() => mutation.mutate(question.trim())}
          disabled={!canAsk}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
            canAsk
              ? 'bg-accent text-white hover:bg-accent/85'
              : 'cursor-not-allowed border border-border-subtle bg-surface-active text-muted',
          )}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {mutation.isPending ? 'Querying replay' : 'Ask replay companion'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Live context</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="lab-chip">{datasetLabel(dataset)}</span>
          <span className="lab-chip">{sourceRoleLabel(dataset?.sourceRole)}</span>
          <span className="lab-chip">{paperLens} lens</span>
          <span className="lab-chip">{audienceMode} mode</span>
          {viewerSnapshot ? <span className="lab-chip">slot {viewerSnapshot.slotNumber}</span> : null}
          {comparisonDataset ? <span className="lab-chip">compare {comparisonDataset.paradigm}</span> : null}
        </div>
        <div className="mt-3 text-xs leading-5 text-muted">{currentViewSummary}</div>
      </div>

      {disabledReason ? (
        <div className="mt-4 rounded-xl border border-border-subtle bg-white px-4 py-3 text-xs leading-5 text-muted">
          {disabledReason}
        </div>
      ) : null}

      {mutation.isError ? (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(mutation.error as Error).message}
        </div>
      ) : null}

      {mutation.isPending ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[1.1rem] border border-border-subtle bg-[#FAFAF8] p-4">
            <div className="lab-skeleton lab-skeleton-line w-1/3" />
            <div className="mt-3 space-y-3">
              <div className="lab-skeleton lab-skeleton-line w-full" />
              <div className="lab-skeleton lab-skeleton-line w-5/6" />
              <div className="lab-skeleton lab-skeleton-line w-4/6" />
            </div>
          </div>
          <div className="lab-skeleton lab-skeleton-block h-[280px]" />
        </div>
      ) : null}

      {response ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[1.1rem] border border-warning/25 bg-warning/7 px-4 py-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              {response.truthBoundary.label}
            </div>
            <div className="mt-2 text-xs leading-5 text-muted">
              {response.truthBoundary.detail}
            </div>
            <div className="mt-2 text-[11px] text-text-faint">
              {answeredSlotNumber != null
                ? `Answered against slot ${answeredSlotNumber.toLocaleString()} of the active replay posture.`
                : 'Answered against the active published replay selection.'}
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-border-subtle bg-white/90 px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Replay-backed answer</div>
            <div className="mt-2 text-sm leading-6 text-text-primary">{response.summary}</div>
            <div className="mt-3 text-xs text-muted">
              {response.cached ? 'Reused cached replay context' : 'Fresh replay-context answer'}
              {response.model ? ` · ${response.model}` : ''}
            </div>
          </div>

          <BlockCanvas blocks={response.blocks} />

          {response.followUps.length > 0 ? (
            <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Follow-up prompts</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {response.followUps.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => {
                      onQuestionChange(prompt)
                      mutation.mutate(prompt)
                    }}
                    className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
