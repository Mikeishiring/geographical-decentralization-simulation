import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  addPublishedReplayNoteReply,
  createPublishedReplayNote,
  listPublishedReplayNotes,
  updatePublishedReplayNoteStatus,
  type PublishedReplayAudienceMode,
  type PublishedReplayNoteIntent,
  type PublishedReplayPaperLens,
  type PublishedReplayNoteStatus,
} from '../../lib/published-replay-notes-api'
import type { PublishedViewerSnapshot } from './PublishedDatasetViewer'

interface DatasetRef {
  readonly evaluation: string
  readonly paradigm: string
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
}

interface PublishedReplayNotesPanelProps {
  readonly dataset: DatasetRef | null
  readonly comparisonDataset: DatasetRef | null
  readonly viewerSnapshot: PublishedViewerSnapshot | null
  readonly comparisonViewerSnapshot: PublishedViewerSnapshot | null
  readonly paperLens: PublishedReplayPaperLens
  readonly audienceMode: PublishedReplayAudienceMode
}

interface NoteAnchorOption {
  readonly kind: 'general' | 'region' | 'metric' | 'comparison'
  readonly key: string
  readonly label: string
}

interface PublishedReplayAnchorSelectionDetail {
  readonly kind: NoteAnchorOption['kind']
  readonly key: string
  readonly label: string
}

const NOTE_INTENTS: ReadonlyArray<{
  readonly id: PublishedReplayNoteIntent
  readonly label: string
  readonly description: string
}> = [
  { id: 'observation', label: 'Observation', description: 'Record what the replay is showing.' },
  { id: 'question', label: 'Question', description: 'Capture a reviewer or reader question.' },
  { id: 'theory', label: 'Theory', description: 'Tie the replay back to the paper’s mechanism.' },
  { id: 'methods', label: 'Methods', description: 'Pin a methods or provenance note to this slot.' },
]

function datasetLabel(dataset: DatasetRef | null): string {
  if (!dataset) return 'No published replay selected'
  return `${dataset.evaluation} / ${dataset.paradigm} / ${dataset.result}`
}

function snapshotContext(snapshot: PublishedViewerSnapshot | null): string | null {
  if (!snapshot) return null
  const dominantRegion = snapshot.dominantRegionCity ?? snapshot.dominantRegionId ?? 'N/A'
  return `slot ${snapshot.slotNumber.toLocaleString()} · ${snapshot.activeRegions.toLocaleString()} active regions · dominant ${dominantRegion}`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function defaultIntentForLens(paperLens: PublishedReplayPaperLens): PublishedReplayNoteIntent {
  if (paperLens === 'methods') return 'methods'
  if (paperLens === 'theory') return 'theory'
  return 'observation'
}

export function PublishedReplayNotesPanel({
  dataset,
  comparisonDataset,
  viewerSnapshot,
  comparisonViewerSnapshot,
  paperLens,
  audienceMode,
}: PublishedReplayNotesPanelProps) {
  const queryClient = useQueryClient()
  const [intent, setIntent] = useState<PublishedReplayNoteIntent>(defaultIntentForLens(paperLens))
  const [draft, setDraft] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [manualAnchor, setManualAnchor] = useState<NoteAnchorOption | null>(null)
  const anchorOptions = useMemo<readonly NoteAnchorOption[]>(() => {
    const dominantRegionLabel = viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId ?? null
    const options: NoteAnchorOption[] = [
      {
        kind: 'general',
        key: 'slot',
        label: 'Whole slot',
      },
    ]

    if (dominantRegionLabel) {
      options.push({
        kind: 'region',
        key: viewerSnapshot?.dominantRegionId ?? dominantRegionLabel,
        label: `Dominant region · ${dominantRegionLabel}`,
      })
    }

    options.push(
      { kind: 'metric', key: 'gini', label: 'Metric · Gini' },
      { kind: 'metric', key: 'liveness', label: 'Metric · Liveness' },
      { kind: 'metric', key: 'proposal_time', label: 'Metric · Proposal time' },
      { kind: 'metric', key: 'mev', label: 'Metric · MEV' },
    )

    if (comparisonViewerSnapshot) {
      options.push({
        kind: 'comparison',
        key: 'comparison',
        label: 'Comparison posture',
      })
    }

    if (manualAnchor && !options.some(option => option.kind === manualAnchor.kind && option.key === manualAnchor.key)) {
      options.push(manualAnchor)
    }

    return options
  }, [comparisonViewerSnapshot, manualAnchor, viewerSnapshot?.dominantRegionCity, viewerSnapshot?.dominantRegionId])
  const [selectedAnchorKey, setSelectedAnchorKey] = useState<string>('slot')

  useEffect(() => {
    setIntent(defaultIntentForLens(paperLens))
  }, [paperLens])

  useEffect(() => {
    if (!anchorOptions.some(option => option.key === selectedAnchorKey)) {
      setSelectedAnchorKey(anchorOptions[0]?.key ?? 'slot')
    }
  }, [anchorOptions, selectedAnchorKey])

  useEffect(() => {
    const handleAnchorSelection = (event: Event) => {
      const detail = (event as CustomEvent<PublishedReplayAnchorSelectionDetail>).detail
      if (!detail || typeof detail.key !== 'string' || typeof detail.label !== 'string') return
      const nextAnchor: NoteAnchorOption = {
        kind: detail.kind,
        key: detail.key,
        label: detail.label,
      }
      setManualAnchor(nextAnchor)
      setSelectedAnchorKey(detail.key)
    }

    window.addEventListener('published-replay-anchor-select', handleAnchorSelection as EventListener)
    return () => {
      window.removeEventListener('published-replay-anchor-select', handleAnchorSelection as EventListener)
    }
  }, [])

  const notesQueryKey = useMemo(() => ([
    'published-replay-notes',
    dataset?.path ?? '',
    comparisonDataset?.path ?? '',
    viewerSnapshot?.slotIndex ?? -1,
    comparisonViewerSnapshot?.slotIndex ?? -1,
    paperLens,
    audienceMode,
  ]), [
    audienceMode,
    comparisonDataset?.path,
    comparisonViewerSnapshot?.slotIndex,
    dataset?.path,
    paperLens,
    viewerSnapshot?.slotIndex,
  ])

  const queryEnabled = Boolean(dataset && viewerSnapshot)
  const liveContext = snapshotContext(viewerSnapshot)
  const comparisonContext = snapshotContext(comparisonViewerSnapshot)
  const selectedAnchor = anchorOptions.find(option => option.key === selectedAnchorKey) ?? anchorOptions[0] ?? null

  const notesQuery = useQuery({
    enabled: queryEnabled,
    queryKey: notesQueryKey,
    queryFn: () => listPublishedReplayNotes({
      datasetPath: dataset!.path,
      comparePath: comparisonDataset?.path ?? null,
      slotIndex: viewerSnapshot!.slotIndex,
      comparisonSlotIndex: comparisonViewerSnapshot?.slotIndex ?? null,
      paperLens,
      audienceMode,
    }),
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (!dataset || !viewerSnapshot) {
        throw new Error('Load a published replay before saving a paper note.')
      }

      const contexts = [
        liveContext ? `Primary ${liveContext}` : null,
        comparisonContext ? `Comparison ${comparisonContext}` : null,
      ].filter(Boolean)

      return createPublishedReplayNote({
        datasetPath: dataset.path,
        datasetLabel: datasetLabel(dataset),
        comparePath: comparisonDataset?.path ?? null,
        compareLabel: datasetLabel(comparisonDataset),
        slotIndex: viewerSnapshot.slotIndex,
        slotNumber: viewerSnapshot.slotNumber,
        comparisonSlotIndex: comparisonViewerSnapshot?.slotIndex ?? null,
        comparisonSlotNumber: comparisonViewerSnapshot?.slotNumber ?? null,
        paperLens,
        audienceMode,
        intent,
        anchorKind: selectedAnchor?.kind ?? 'general',
        anchorKey: selectedAnchor?.key ?? 'slot',
        anchorLabel: selectedAnchor?.label ?? 'Whole slot',
        note: draft.trim(),
        contextLabel: contexts.length > 0 ? contexts.join(' · ') : null,
      })
    },
    onSuccess: async () => {
      setDraft('')
      await queryClient.invalidateQueries({ queryKey: notesQueryKey })
    },
  })

  const replyMutation = useMutation({
    mutationFn: ({ noteId, reply }: { noteId: string; reply: string }) =>
      addPublishedReplayNoteReply(noteId, { reply }),
    onSuccess: async (_, variables) => {
      setReplyDrafts(current => ({ ...current, [variables.noteId]: '' }))
      await queryClient.invalidateQueries({ queryKey: notesQueryKey })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ noteId, status }: { noteId: string; status: PublishedReplayNoteStatus }) =>
      updatePublishedReplayNoteStatus(noteId, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notesQueryKey })
    },
  })

  const canSave = queryEnabled && draft.trim().length > 0 && !mutation.isPending

  return (
    <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Paper notes</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            Attach notes to the exact replay posture, not just the scenario in general.
          </div>
          <div className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            Notes are keyed to the active published dataset, the current slot, the reading lens, and the audience posture.
          </div>
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={!canSave}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
            canSave
              ? 'bg-[#0F172A] text-white hover:bg-[#111C31]'
              : 'cursor-not-allowed border border-rule bg-surface-active text-muted',
          )}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mutation.isPending ? 'Saving note' : 'Save paper note'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Pinned context</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="lab-chip">{datasetLabel(dataset)}</span>
          <span className="lab-chip">{paperLens} lens</span>
          <span className="lab-chip">{audienceMode} mode</span>
          {viewerSnapshot ? <span className="lab-chip">slot {viewerSnapshot.slotNumber}</span> : null}
          {comparisonViewerSnapshot ? <span className="lab-chip">compare slot {comparisonViewerSnapshot.slotNumber}</span> : null}
        </div>
        <div className="mt-3 space-y-2 text-xs leading-5 text-muted">
          <div>{liveContext ?? 'Load the replay to pin notes to a slot.'}</div>
          {comparisonContext ? <div>{comparisonContext}</div> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {NOTE_INTENTS.map(option => (
          <button
            key={option.id}
            onClick={() => setIntent(option.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              intent === option.id
                ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                : 'border-rule bg-white text-text-primary hover:border-border-hover',
            )}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Note anchor</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {anchorOptions.map(option => (
            <button
              key={`${option.kind}:${option.key}`}
              onClick={() => setSelectedAnchorKey(option.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedAnchorKey === option.key
                  ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                  : 'border-rule bg-white text-text-primary hover:border-border-hover',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Note draft</div>
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="mt-2 min-h-[120px] w-full resize-none bg-transparent text-sm leading-6 text-text-primary outline-none"
          placeholder="Record an observation, reviewer question, or theory note for this exact replay state..."
        />
      </div>

      {!queryEnabled ? (
        <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-3 text-xs leading-5 text-muted">
          Wait for the published replay to load before attaching notes to a slot.
        </div>
      ) : null}

      {notesQuery.isError ? (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(notesQuery.error as Error).message}
        </div>
      ) : null}

      {mutation.isError ? (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(mutation.error as Error).message}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Thread for this slot</div>
            <div className="mt-1 text-xs text-muted">Notes stay attached to this exact replay posture.</div>
          </div>
          {notesQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : null}
        </div>

        <div className="mt-4 space-y-3">
          {(notesQuery.data ?? []).map(note => (
            <div key={note.id} className="rounded-xl border border-rule bg-white px-4 py-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-faint">
                <span className="lab-chip">{note.intent}</span>
                <button
                  onClick={() => statusMutation.mutate({ noteId: note.id, status: note.status === 'open' ? 'resolved' : 'open' })}
                  disabled={statusMutation.isPending}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                    note.status === 'resolved'
                      ? 'border-[#0F766E]/18 bg-[#ECFDF5] text-[#0F766E]'
                      : 'border-[#C2410C]/18 bg-[#FFF7ED] text-[#9A3412]',
                  )}
                >
                  {note.status}
                </button>
                <span className="lab-chip">slot {note.slotNumber}</span>
                {note.anchorLabel ? <span className="lab-chip">{note.anchorLabel}</span> : null}
                {note.comparisonSlotNumber != null ? <span className="lab-chip">compare slot {note.comparisonSlotNumber}</span> : null}
                <span>{formatTimestamp(note.createdAt)}</span>
              </div>
              {note.contextLabel ? (
                <div className="mt-2 text-[11px] leading-5 text-muted">{note.contextLabel}</div>
              ) : null}
              <div className="mt-3 text-sm leading-6 text-text-primary">{note.note}</div>
              {note.replies.length > 0 ? (
                <div className="mt-4 space-y-2 border-t border-rule pt-3">
                  {note.replies.map(reply => (
                    <div key={reply.id} className="rounded-xl border border-rule bg-surface-active px-3 py-3">
                      <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">{formatTimestamp(reply.createdAt)}</div>
                      <div className="mt-2 text-xs leading-5 text-text-primary">{reply.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 rounded-xl border border-rule bg-surface-active px-3 py-3">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Reply</div>
                <textarea
                  value={replyDrafts[note.id] ?? ''}
                  onChange={event => setReplyDrafts(current => ({ ...current, [note.id]: event.target.value }))}
                  className="mt-2 min-h-[72px] w-full resize-none bg-transparent text-xs leading-5 text-text-primary outline-none"
                  placeholder="Add a lightweight thread reply..."
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => replyMutation.mutate({ noteId: note.id, reply: (replyDrafts[note.id] ?? '').trim() })}
                    disabled={!((replyDrafts[note.id] ?? '').trim()) || replyMutation.isPending}
                    className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:bg-surface-active disabled:text-muted"
                  >
                    {replyMutation.isPending ? 'Saving reply' : 'Add reply'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {notesQuery.data && notesQuery.data.length === 0 && !notesQuery.isLoading ? (
            <div className="rounded-xl border border-dashed border-rule bg-white px-4 py-5 text-xs leading-5 text-muted">
              No paper notes are attached to this replay posture yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
