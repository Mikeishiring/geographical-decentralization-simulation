import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react'
import { BlockCanvas } from '../explore/BlockCanvas'
import { SourceBlock } from '../blocks/SourceBlock'
import { cn } from '../../lib/cn'
import { getApiHealth } from '../../lib/api'
import {
  askPublishedReplayCopilot,
  type PublishedReplayCopilotResponse,
  type PublishedReplayViewerSnapshotContext,
} from '../../lib/published-replay-api'
import type { Block, SourceBlock as SourceBlockData } from '../../types/blocks'
import type { PublishedViewerSnapshot } from './PublishedDatasetViewer'

interface DatasetRef {
  readonly evaluation: string
  readonly paradigm: string
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
}

interface PaperSectionRef {
  readonly id: string
  readonly number: string
  readonly title: string
  readonly description: string
  readonly context: string
}

interface ReplayThreadEntry {
  readonly question: string
  readonly response: PublishedReplayCopilotResponse
  readonly answeredContext: string
}

interface PublishedReplayCompanionPanelProps {
  readonly question: string
  readonly onQuestionChange: (value: string) => void
  readonly dataset: DatasetRef | null
  readonly comparisonDataset: DatasetRef | null
  readonly paperSection: PaperSectionRef | null
  readonly paperLens: 'evidence' | 'theory' | 'methods'
  readonly audienceMode: 'reader' | 'reviewer' | 'researcher'
  readonly currentViewSummary: string
  readonly viewerSnapshot: PublishedViewerSnapshot | null
  readonly comparisonViewerSnapshot: PublishedViewerSnapshot | null
  readonly replayQueryUrl?: string | null
  readonly datasetArtifactUrl?: string | null
  readonly datasetSourceUrl?: string | null
  readonly comparisonArtifactUrl?: string | null
  readonly comparisonSourceUrl?: string | null
  readonly paperSectionUrl?: string | null
  readonly autoRunQuestion?: string | null
  readonly onAutoRunHandled?: () => void
  readonly onResponseChange?: (payload: {
    question: string
    response: PublishedReplayCopilotResponse
    answeredContext: string
  } | null) => void
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

function formatMetric(value: number | null | undefined, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      })
    : 'N/A'
}

function snapshotContextLabel(snapshot: PublishedViewerSnapshot | null): string | null {
  if (!snapshot) return null

  const dominantRegion = snapshot.dominantRegionCity ?? snapshot.dominantRegionId ?? 'N/A'
  return `slot ${snapshot.slotNumber.toLocaleString()} · ${snapshot.activeRegions.toLocaleString()} active regions · dominant ${dominantRegion}`
}

function buildAnsweredContext(
  viewerSnapshot: PublishedViewerSnapshot | null,
  comparisonViewerSnapshot: PublishedViewerSnapshot | null,
): string {
  const contexts = [
    snapshotContextLabel(viewerSnapshot) ? `primary ${snapshotContextLabel(viewerSnapshot)}` : null,
    snapshotContextLabel(comparisonViewerSnapshot) ? `comparison ${snapshotContextLabel(comparisonViewerSnapshot)}` : null,
  ].filter(Boolean)

  return contexts.length > 0
    ? `Answered against ${contexts.join(' · ')}.`
    : 'Answered against the active published replay posture.'
}

function toSnapshotContext(
  snapshot: PublishedViewerSnapshot | null,
): PublishedReplayViewerSnapshotContext | null {
  if (!snapshot) return null

  return {
    slotIndex: snapshot.slotIndex,
    slotNumber: snapshot.slotNumber,
    totalSlots: snapshot.totalSlots,
    stepSize: snapshot.stepSize,
    playing: snapshot.playing,
    activeRegions: snapshot.activeRegions,
    totalValidators: snapshot.totalValidators,
    dominantRegionId: snapshot.dominantRegionId ?? null,
    dominantRegionCity: snapshot.dominantRegionCity ?? null,
    dominantRegionShare: snapshot.dominantRegionShare ?? null,
    currentGini: snapshot.currentGini ?? null,
    currentHhi: snapshot.currentHhi ?? null,
    currentLiveness: snapshot.currentLiveness ?? null,
    currentMev: snapshot.currentMev ?? null,
    currentProposalTime: snapshot.currentProposalTime ?? null,
    currentAttestation: snapshot.currentAttestation ?? null,
    currentTotalDistance: snapshot.currentTotalDistance ?? null,
    currentFailedBlockProposals: snapshot.currentFailedBlockProposals ?? null,
    currentClusters: snapshot.currentClusters ?? null,
  }
}

function isEvidenceBlock(block: Block): boolean {
  return (
    block.type === 'stat'
    || block.type === 'table'
    || block.type === 'comparison'
    || block.type === 'chart'
    || block.type === 'map'
    || block.type === 'timeseries'
  )
}

function isSourceBlock(block: Block): block is SourceBlockData {
  return block.type === 'source'
}

function isInterpretationBlock(block: Block): boolean {
  return block.type === 'insight'
}

export function PublishedReplayCompanionPanel({
  question,
  onQuestionChange,
  dataset,
  comparisonDataset,
  paperSection,
  paperLens,
  audienceMode,
  currentViewSummary,
  viewerSnapshot,
  comparisonViewerSnapshot,
  replayQueryUrl,
  datasetArtifactUrl,
  datasetSourceUrl,
  comparisonArtifactUrl,
  comparisonSourceUrl,
  paperSectionUrl,
  autoRunQuestion,
  onAutoRunHandled,
  onResponseChange,
}: PublishedReplayCompanionPanelProps) {
  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    staleTime: 30_000,
  })
  const [answeredContext, setAnsweredContext] = useState<string | null>(null)
  const [replayThread, setReplayThread] = useState<readonly ReplayThreadEntry[]>([])
  const [showInterpretation, setShowInterpretation] = useState(false)
  const autoRunSignatureRef = useRef<string | null>(null)

  const quickPrompts = useMemo(() => {
    const prompts: string[] = []
    const dominantRegion = viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId
    const primarySlot = viewerSnapshot?.slotNumber
    const comparisonSlot = comparisonViewerSnapshot?.slotNumber

    if (primarySlot != null) {
      prompts.push(`What changed by slot ${primarySlot.toLocaleString()} in this replay?`)
    }

    if (dominantRegion) {
      prompts.push(`Why is ${dominantRegion} dominant in the current replay state?`)
    }

    if (viewerSnapshot?.currentLiveness != null && viewerSnapshot.currentProposalTime != null) {
      prompts.push('Explain the relationship between liveness and proposal time at the current slot.')
    }

    if (comparisonDataset && primarySlot != null) {
      prompts.push(
        comparisonSlot != null
          ? `Compare the active replay at slot ${primarySlot.toLocaleString()} against the comparison replay at slot ${comparisonSlot.toLocaleString()}.`
          : `What is materially different between the active replay and ${comparisonDataset.paradigm}?`,
      )
    }

    if (paperLens === 'methods') {
      prompts.push('Which result here comes from the frozen published payload, and which parts are assistant interpretation?')
    }

    if (paperSection && (paperLens === 'theory' || paperLens === 'methods')) {
      prompts.push(`How should ${paperSection.number} ${paperSection.title} frame this replay?`)
    }

    return Array.from(new Set(prompts)).slice(0, 4)
  }, [comparisonDataset, comparisonViewerSnapshot?.slotNumber, paperLens, paperSection, viewerSnapshot])

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
        paperSectionId: paperSection?.id ?? null,
        paperSectionLabel: paperSection ? `${paperSection.number} ${paperSection.title}` : null,
        paperSectionContext: paperSection?.context ?? null,
        audienceMode,
        currentViewSummary,
        viewerSnapshot: toSnapshotContext(viewerSnapshot),
        comparisonViewerSnapshot: toSnapshotContext(comparisonViewerSnapshot),
      })
    },
    onSuccess: (nextResponse, nextQuestion) => {
      const nextAnsweredContext = buildAnsweredContext(viewerSnapshot, comparisonViewerSnapshot)

      setAnsweredContext(nextAnsweredContext)
      setReplayThread(previous => {
        const nextEntry: ReplayThreadEntry = {
          question: nextQuestion,
          response: nextResponse,
          answeredContext: nextAnsweredContext,
        }
        const filtered = previous.filter(entry =>
          !(entry.question === nextQuestion && entry.answeredContext === nextAnsweredContext)
        )
        return [...filtered, nextEntry].slice(-4)
      })
      onResponseChange?.({
        question: nextQuestion,
        response: nextResponse,
        answeredContext: nextAnsweredContext,
      })
    },
  })
  const resetReplayMutation = mutation.reset

  useEffect(() => {
    resetReplayMutation()
    setReplayThread([])
    setAnsweredContext(null)
    setShowInterpretation(false)
    autoRunSignatureRef.current = null
    onResponseChange?.(null)
  }, [audienceMode, comparisonDataset?.path, dataset?.path, onResponseChange, paperLens, paperSection?.id, resetReplayMutation])

  const isAnthropicEnabled = apiHealthQuery.data?.anthropicEnabled ?? false
  const submitQuestion = useCallback((nextQuestion: string) => {
    const normalizedQuestion = nextQuestion.trim()
    if (!normalizedQuestion || !dataset || mutation.isPending || !isAnthropicEnabled) return
    mutation.mutate(normalizedQuestion)
  }, [dataset, isAnthropicEnabled, mutation])

  useEffect(() => {
    const normalizedQuestion = autoRunQuestion?.trim() ?? ''
    if (!normalizedQuestion) {
      autoRunSignatureRef.current = null
      return
    }

    if (!dataset || mutation.isPending || !isAnthropicEnabled) return

    const signature = [
      dataset.path,
      comparisonDataset?.path ?? 'none',
      viewerSnapshot?.slotIndex ?? 'all',
      comparisonViewerSnapshot?.slotIndex ?? 'all',
      paperLens,
      paperSection?.id ?? 'none',
      audienceMode,
      normalizedQuestion,
    ].join(':')

    if (autoRunSignatureRef.current === signature) return

    autoRunSignatureRef.current = signature
    submitQuestion(normalizedQuestion)
    onAutoRunHandled?.()
  }, [
    audienceMode,
    autoRunQuestion,
    comparisonDataset?.path,
    comparisonViewerSnapshot?.slotIndex,
    dataset,
    isAnthropicEnabled,
    mutation,
    mutation.isPending,
    onAutoRunHandled,
    paperLens,
    paperSection?.id,
    submitQuestion,
    viewerSnapshot?.slotIndex,
  ])

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
  const latestThreadEntry = replayThread.length > 0 ? replayThread[replayThread.length - 1] ?? null : null
  const previousThreadEntries = replayThread.slice(0, -1).reverse()
  const activeQuestion = mutation.isPending
    ? typeof mutation.variables === 'string'
      ? mutation.variables
      : question.trim()
    : latestThreadEntry?.question ?? question.trim()

  useEffect(() => {
    if (!response) return
    setShowInterpretation(false)
  }, [latestThreadEntry?.question, response])

  const combinedSourceBlock = useMemo<SourceBlockData | null>(() => {
    if (!dataset && !response) return null

    const refs: SourceBlockData['refs'] = []
    const replaySlotLabel = viewerSnapshot ? `slot ${viewerSnapshot.slotNumber.toLocaleString()}` : 'active replay posture'

    if (replayQueryUrl) {
      refs.push({
        label: 'Replay query view',
        section: replaySlotLabel,
        url: replayQueryUrl,
      })
    }

    if (dataset?.path) {
      refs.push({
        label: 'Published dataset JSON',
        section: dataset.path,
        url: datasetArtifactUrl || datasetSourceUrl || undefined,
      })
    }

    if (dataset?.path && datasetSourceUrl && datasetArtifactUrl && datasetSourceUrl !== datasetArtifactUrl) {
      refs.push({
        label: 'Dataset source file',
        section: dataset.path,
        url: datasetSourceUrl,
      })
    }

    if (paperSection) {
      refs.push({
        label: 'Canonical paper section',
        section: `${paperSection.number} ${paperSection.title}`,
        url: paperSectionUrl || undefined,
      })
    }

    if (comparisonDataset?.path) {
      refs.push({
        label: 'Comparison dataset JSON',
        section: comparisonDataset.path,
        url: comparisonArtifactUrl || comparisonSourceUrl || undefined,
      })
    }

    if (comparisonDataset?.path && comparisonSourceUrl && comparisonArtifactUrl && comparisonSourceUrl !== comparisonArtifactUrl) {
      refs.push({
        label: 'Comparison source file',
        section: comparisonDataset.path,
        url: comparisonSourceUrl,
      })
    }

    for (const block of response?.blocks ?? []) {
      if (!isSourceBlock(block)) continue
      refs.push(...block.refs)
    }

    const dedupedRefs = refs.filter((ref, index, all) =>
      all.findIndex(candidate =>
        candidate.label === ref.label
        && candidate.section === ref.section
        && candidate.url === ref.url,
      ) === index,
    )

    return dedupedRefs.length > 0
      ? { type: 'source', refs: dedupedRefs }
      : null
  }, [
    comparisonArtifactUrl,
    comparisonDataset,
    comparisonSourceUrl,
    dataset,
    datasetArtifactUrl,
    datasetSourceUrl,
    paperSection,
    paperSectionUrl,
    replayQueryUrl,
    response,
    viewerSnapshot,
  ])
  const evidenceBlocks = useMemo(
    () => (response?.blocks ?? []).filter(isEvidenceBlock),
    [response],
  )
  const interpretationBlocks = useMemo(
    () => (response?.blocks ?? []).filter(isInterpretationBlock),
    [response],
  )
  const supportingBlocks = useMemo(
    () => (response?.blocks ?? []).filter(block => block.type === 'caveat'),
    [response],
  )

  return (
    <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Replay companion</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            Ask against the selected published replay, not against generic paper copy.
          </div>
          <div className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            The companion reads the frozen dataset, the active reading lens, and the optional comparison replay.
            {viewerSnapshot ? ` It can also anchor on slot ${viewerSnapshot.slotNumber.toLocaleString()} if your question is about what is on screen right now.` : ''}
          </div>
        </div>

        <button
          onClick={() => submitQuestion(question)}
          disabled={!canAsk}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
            canAsk
              ? 'bg-accent text-white hover:bg-accent/85'
              : 'cursor-not-allowed border border-rule bg-surface-active text-muted',
          )}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {mutation.isPending ? 'Querying replay' : 'Ask replay companion'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Live context</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="lab-chip">{datasetLabel(dataset)}</span>
          <span className="lab-chip">{sourceRoleLabel(dataset?.sourceRole)}</span>
          <span className="lab-chip">{paperLens} lens</span>
          {paperSection ? <span className="lab-chip">{paperSection.number} {paperSection.title}</span> : null}
          <span className="lab-chip">{audienceMode} mode</span>
          {viewerSnapshot ? <span className="lab-chip">slot {viewerSnapshot.slotNumber}</span> : null}
          {viewerSnapshot?.dominantRegionCity || viewerSnapshot?.dominantRegionId ? (
            <span className="lab-chip">
              dominant {viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId}
            </span>
          ) : null}
          {viewerSnapshot?.currentGini != null ? <span className="lab-chip">gini {formatMetric(viewerSnapshot.currentGini, 3)}</span> : null}
          {viewerSnapshot?.currentLiveness != null ? <span className="lab-chip">liveness {formatMetric(viewerSnapshot.currentLiveness, 1)}%</span> : null}
          {comparisonDataset ? <span className="lab-chip">compare {comparisonDataset.paradigm}</span> : null}
          {comparisonViewerSnapshot ? <span className="lab-chip">compare slot {comparisonViewerSnapshot.slotNumber}</span> : null}
        </div>
        <div className="mt-3 text-xs leading-5 text-muted">{currentViewSummary}</div>
        {paperSection ? (
          <div className="mt-2 text-11 leading-5 text-text-faint">
            Canonical paper anchor: {paperSection.description}
          </div>
        ) : null}
        {quickPrompts.length > 0 ? (
          <div className="mt-4">
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Prompt starters</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickPrompts.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => {
                    onQuestionChange(prompt)
                    submitQuestion(prompt)
                  }}
                  disabled={mutation.isPending || !isAnthropicEnabled}
                  className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:bg-surface-active disabled:text-muted"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {disabledReason ? (
        <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-3 text-xs leading-5 text-muted">
          {disabledReason}
        </div>
      ) : null}

      {autoRunQuestion?.trim() && !latestThreadEntry && !mutation.isPending ? (
        <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-3 text-xs leading-5 text-muted">
          Shared replay query detected. The companion will run it as soon as the replay context is ready.
        </div>
      ) : null}

      {mutation.isError ? (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(mutation.error as Error).message}
        </div>
      ) : null}

      {mutation.isPending ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-xl border border-rule bg-surface-active p-4">
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
          {activeQuestion ? (
            <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Latest replay question</div>
              <div className="mt-2 text-sm leading-6 text-text-primary">{activeQuestion}</div>
            </div>
          ) : null}

          <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Evidence used</div>
            <div className="mt-2 text-xs leading-5 text-muted">
              Start from the replay posture and the linked source material. The assistant interpretation stays secondary.
            </div>
            {combinedSourceBlock ? (
              <div className="mt-4">
                <SourceBlock block={combinedSourceBlock} />
              </div>
            ) : null}
            {evidenceBlocks.length > 0 ? (
              <div className="mt-4">
                <BlockCanvas blocks={evidenceBlocks} showExport={false} />
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-warning/25 bg-warning/7 px-4 py-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              {response.truthBoundary.label}
            </div>
            <div className="mt-2 text-xs leading-5 text-muted">
              {response.truthBoundary.detail}
            </div>
            <div className="mt-2 text-11 text-text-faint">
              {answeredContext ?? 'Answered against the active published replay selection.'}
            </div>
          </div>

          {supportingBlocks.length > 0 ? (
            <div className="rounded-xl border border-rule bg-white px-4 py-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Reading discipline</div>
              <div className="mt-4">
                <BlockCanvas blocks={supportingBlocks} showExport={false} />
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-rule bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Assistant interpretation</div>
                <div className="mt-2 text-xs leading-5 text-muted">
                  Collapsed by default so the replay evidence and source material lead the reading.
                </div>
              </div>
              <button
                onClick={() => setShowInterpretation(current => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface-active px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
              >
                {showInterpretation ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showInterpretation ? 'Hide interpretation' : 'Show interpretation'}
              </button>
            </div>
            <div className="mt-3 text-xs text-muted">
              {response.cached ? 'Reused cached replay context' : 'Fresh replay-context answer'}
              {response.model ? ` · ${response.model}` : ''}
            </div>
            {showInterpretation ? (
              <div className="mt-4 space-y-4">
                <div className="text-sm leading-6 text-text-primary">{response.summary}</div>
                {interpretationBlocks.length > 0 ? (
                  <BlockCanvas blocks={interpretationBlocks} showExport={false} />
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-3 text-xs leading-5 text-muted">
                Interpretation hidden. Expand only after checking the evidence and source links above.
              </div>
            )}
          </div>

          {response.followUps.length > 0 ? (
            <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Follow-up prompts</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {response.followUps.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => {
                      onQuestionChange(prompt)
                      submitQuestion(prompt)
                    }}
                    className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {previousThreadEntries.length > 0 ? (
            <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Replay thread</div>
              <div className="mt-3 space-y-3">
                {previousThreadEntries.map((entry, index) => (
                  <div key={`${entry.question}-${index}`} className="rounded-xl border border-rule bg-white px-4 py-4">
                    <div className="text-xs font-medium text-text-primary">{entry.question}</div>
                    <div className="mt-2 text-xs leading-5 text-muted">{entry.response.summary}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-11 text-text-faint">
                      <span>{entry.answeredContext}</span>
                      <button
                        onClick={() => onQuestionChange(entry.question)}
                        className="rounded-full border border-rule bg-surface-active px-3 py-1 text-11 font-medium text-text-primary transition-colors hover:border-border-hover"
                      >
                        Reuse question
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
