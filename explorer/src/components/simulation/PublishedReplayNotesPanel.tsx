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
  type PublishedReplayCommunityLane,
  type PublishedReplayContributionType,
  type PublishedReplayAnnotationScope,
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

function formatStatusLabel(status: PublishedReplayNoteStatus): string {
  if (status === 'open_question') return 'Open question'
  if (status === 'needs_evidence') return 'Needs evidence'
  if (status === 'challenged') return 'Challenged'
  if (status === 'author_addressed') return 'Author addressed'
  return 'Supported'
}

function statusBadgeClass(status: PublishedReplayNoteStatus): string {
  if (status === 'supported' || status === 'author_addressed') {
    return 'border-[#0F766E]/18 bg-[#ECFDF5] text-[#0F766E]'
  }
  if (status === 'challenged') {
    return 'border-[#BE123C]/18 bg-[#FFF1F2] text-[#BE123C]'
  }
  return 'border-[#C2410C]/18 bg-[#FFF7ED] text-[#9A3412]'
}

const FOLLOWED_NOTES_STORAGE_KEY = 'published_replay_followed_note_ids'

const COMMUNITY_LANES: ReadonlyArray<{
  readonly id: PublishedReplayCommunityLane
  readonly label: string
  readonly description: string
}> = [
  {
    id: 'author',
    label: 'Author lane',
    description: 'Use this for clarifications, revisions, or direct responses from the paper authors.',
  },
  {
    id: 'reviewer',
    label: 'Reviewer lane',
    description: 'Use this for critique, challenge, or requests for stronger evidence.',
  },
  {
    id: 'community',
    label: 'Community lane',
    description: 'Use this for reader notes, synthesis, and follow-on interpretation.',
  },
]

const CONTRIBUTION_TYPES: ReadonlyArray<{
  readonly id: PublishedReplayContributionType
  readonly label: string
  readonly description: string
}> = [
  {
    id: 'evidence',
    label: 'Evidence',
    description: 'State what the replay directly shows at this anchor.',
  },
  {
    id: 'claim',
    label: 'Claim',
    description: 'Make a bounded interpretation someone else can support or challenge.',
  },
  {
    id: 'question',
    label: 'Question',
    description: 'Open a concrete question tied to this exact replay posture.',
  },
  {
    id: 'counterpoint',
    label: 'Counterpoint',
    description: 'Challenge the current reading with a specific alternative interpretation.',
  },
  {
    id: 'method_concern',
    label: 'Method concern',
    description: 'Call out a modelling or measurement concern that affects interpretation.',
  },
]

const DISCUSSION_STATES: ReadonlyArray<{
  readonly id: PublishedReplayNoteStatus
  readonly label: string
}> = [
  { id: 'open_question', label: 'Open question' },
  { id: 'needs_evidence', label: 'Needs evidence' },
  { id: 'challenged', label: 'Challenged' },
  { id: 'supported', label: 'Supported' },
  { id: 'author_addressed', label: 'Author addressed' },
]

const ANNOTATION_SCOPES: ReadonlyArray<{
  readonly id: PublishedReplayAnnotationScope
  readonly label: string
  readonly description: string
}> = [
  {
    id: 'exact_slot',
    label: 'Exact slot',
    description: 'Anchor the note to the current slot posture only.',
  },
  {
    id: 'time_range',
    label: 'Time range',
    description: 'Anchor the note to a bounded slot window.',
  },
  {
    id: 'trend',
    label: 'Trend',
    description: 'Talk about a replay-wide directional pattern rather than one slot.',
  },
  {
    id: 'comparison_gap',
    label: 'Comparison gap',
    description: 'Anchor the note to the difference between the active and comparison replays.',
  },
  {
    id: 'paper_claim',
    label: 'Paper claim',
    description: 'Tie the note to the currently selected paper claim or section framing.',
  },
  {
    id: 'region_over_time',
    label: 'Region over time',
    description: 'Track how one region or dominant geography behaves over a slot window.',
  },
]

function readFollowedNoteIds(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(FOLLOWED_NOTES_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function defaultContributionTypeForLens(lens: PublishedReplayPaperLens): PublishedReplayContributionType {
  if (lens === 'methods') return 'method_concern'
  if (lens === 'theory') return 'claim'
  return 'evidence'
}

function defaultStatusForContribution(
  contributionType: PublishedReplayContributionType,
): PublishedReplayNoteStatus {
  if (contributionType === 'question') return 'open_question'
  if (contributionType === 'counterpoint') return 'challenged'
  if (contributionType === 'evidence') return 'supported'
  return 'needs_evidence'
}

function defaultLaneForAudienceMode(
  audienceMode: PublishedReplayAudienceMode,
): PublishedReplayCommunityLane {
  if (audienceMode === 'reviewer') return 'reviewer'
  if (audienceMode === 'researcher') return 'author'
  return 'community'
}

function defaultAnnotationScopeForAnchor(
  anchorKind: NoteAnchorOption['kind'],
  anchorKey?: string,
): PublishedReplayAnnotationScope {
  if (anchorKey === 'paper_claim') return 'paper_claim'
  if (anchorKind === 'comparison') return 'comparison_gap'
  if (anchorKind === 'region') return 'region_over_time'
  return 'exact_slot'
}

function mapContributionTypeToIntent(
  contributionType: PublishedReplayContributionType,
  paperLens: PublishedReplayPaperLens,
): PublishedReplayNoteIntent {
  if (contributionType === 'question') return 'question'
  if (contributionType === 'method_concern' || paperLens === 'methods') return 'methods'
  if (paperLens === 'theory' && contributionType === 'claim') return 'theory'
  return 'observation'
}

function laneBadgeClass(lane: PublishedReplayCommunityLane): string {
  if (lane === 'author') return 'border-[#2563EB]/18 bg-[#EFF6FF] text-[#1D4ED8]'
  if (lane === 'reviewer') return 'border-[#BE123C]/18 bg-[#FFF1F2] text-[#BE123C]'
  return 'border-[#0F766E]/18 bg-[#ECFDF5] text-[#0F766E]'
}

function contributionBadgeClass(
  contributionType: PublishedReplayContributionType,
): string {
  if (contributionType === 'question') return 'border-[#C2410C]/18 bg-[#FFF7ED] text-[#9A3412]'
  if (contributionType === 'counterpoint') return 'border-[#BE123C]/18 bg-[#FFF1F2] text-[#BE123C]'
  if (contributionType === 'method_concern') return 'border-[#7C3AED]/18 bg-[#F5F3FF] text-[#6D28D9]'
  if (contributionType === 'claim') return 'border-[#2563EB]/18 bg-[#EFF6FF] text-[#1D4ED8]'
  return 'border-[#0F766E]/18 bg-[#ECFDF5] text-[#0F766E]'
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
  const [contributionType, setContributionType] = useState<PublishedReplayContributionType>(defaultContributionTypeForLens(paperLens))
  const [draftStatus, setDraftStatus] = useState<PublishedReplayNoteStatus>(defaultStatusForContribution(defaultContributionTypeForLens(paperLens)))
  const [communityLane, setCommunityLane] = useState<PublishedReplayCommunityLane>(defaultLaneForAudienceMode(audienceMode))
  const [annotationScope, setAnnotationScope] = useState<PublishedReplayAnnotationScope>('exact_slot')
  const [draft, setDraft] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [manualAnchor, setManualAnchor] = useState<NoteAnchorOption | null>(null)
  const [followedNoteIds, setFollowedNoteIds] = useState<string[]>(() => readFollowedNoteIds())
  const [rangeStartSlotNumber, setRangeStartSlotNumber] = useState<string>('')
  const [rangeEndSlotNumber, setRangeEndSlotNumber] = useState<string>('')
  const anchorOptions = useMemo<readonly NoteAnchorOption[]>(() => {
    const dominantRegionLabel = viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId ?? null
    const options: NoteAnchorOption[] = [
      {
        kind: 'general',
        key: 'slot',
        label: 'Whole slot',
      },
      {
        kind: 'general',
        key: 'paper_claim',
        label: 'Paper claim in this section',
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
    const nextContributionType = defaultContributionTypeForLens(paperLens)
    setContributionType(nextContributionType)
    setDraftStatus(defaultStatusForContribution(nextContributionType))
  }, [paperLens])

  useEffect(() => {
    setCommunityLane(defaultLaneForAudienceMode(audienceMode))
  }, [audienceMode])

  useEffect(() => {
    if (!anchorOptions.some(option => option.key === selectedAnchorKey)) {
      setSelectedAnchorKey(anchorOptions[0]?.key ?? 'slot')
    }
  }, [anchorOptions, selectedAnchorKey])

  useEffect(() => {
    if (!viewerSnapshot) return
    setRangeStartSlotNumber(current => current || String(viewerSnapshot.slotNumber))
    setRangeEndSlotNumber(current => current || String(Math.min(
      viewerSnapshot.totalSlots,
      viewerSnapshot.slotNumber + Math.max(4, viewerSnapshot.stepSize * 2),
    )))
  }, [viewerSnapshot])

  useEffect(() => {
    if (annotationScope === 'comparison_gap' && !comparisonViewerSnapshot) {
      setAnnotationScope('exact_slot')
    }
  }, [annotationScope, comparisonViewerSnapshot])

  useEffect(() => {
    try {
      window.localStorage.setItem(FOLLOWED_NOTES_STORAGE_KEY, JSON.stringify(followedNoteIds))
    } catch {
      // Ignore storage failures.
    }
  }, [followedNoteIds])

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
      if (annotationScope === 'exact_slot') {
        setAnnotationScope(defaultAnnotationScopeForAnchor(detail.kind, detail.key))
      }
    }

    window.addEventListener('published-replay-anchor-select', handleAnchorSelection as EventListener)
    return () => {
      window.removeEventListener('published-replay-anchor-select', handleAnchorSelection as EventListener)
    }
  }, [annotationScope])

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
  const rangeRequired = annotationScope === 'time_range' || annotationScope === 'region_over_time'
  const normalizedRange = useMemo(() => {
    if (!rangeRequired || !viewerSnapshot) return null
    const start = Number.parseInt(rangeStartSlotNumber, 10)
    const end = Number.parseInt(rangeEndSlotNumber, 10)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) return null
    const lower = Math.min(start, end)
    const upper = Math.max(start, end)
    return {
      startNumber: lower,
      startIndex: lower - 1,
      endNumber: upper,
      endIndex: upper - 1,
    }
  }, [rangeEndSlotNumber, rangeRequired, rangeStartSlotNumber, viewerSnapshot])
  const promptLaunchers = useMemo(() => {
    const anchorLabel = selectedAnchor?.label ?? 'this replay posture'
    const slotLabel = viewerSnapshot ? `around slot ${viewerSnapshot.slotNumber}` : 'at this posture'
    const prompts = [
      `What is the strongest unresolved question about ${anchorLabel.toLowerCase()} ${slotLabel}?`,
      `What evidence in the replay would strengthen or weaken the current reading of ${anchorLabel.toLowerCase()}?`,
    ]
    if (paperLens === 'theory') {
      prompts.push(`Which assumption in the theory section seems to do the most work for ${anchorLabel.toLowerCase()}?`)
    } else if (paperLens === 'methods') {
      prompts.push(`Which modelling choice might most strongly shape the pattern visible in ${anchorLabel.toLowerCase()}?`)
    } else {
      prompts.push(`State the strongest defensible claim you can make from ${anchorLabel.toLowerCase()} ${slotLabel}.`)
    }
    if (comparisonViewerSnapshot) {
      prompts.push(`Why do the two runs diverge on ${anchorLabel.toLowerCase()} ${slotLabel}, and which assumption best explains the gap?`)
    }
    return prompts.slice(0, 4)
  }, [comparisonViewerSnapshot, paperLens, selectedAnchor?.label, viewerSnapshot])

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
        throw new Error('Load a published replay before saving a discussion note.')
      }
      if (rangeRequired && !normalizedRange) {
        throw new Error('Choose a valid slot range before saving a range-based note.')
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
        intent: mapContributionTypeToIntent(contributionType, paperLens),
        status: draftStatus,
        contributionType,
        communityLane,
        annotationScope,
        rangeStartSlotIndex: normalizedRange?.startIndex ?? null,
        rangeStartSlotNumber: normalizedRange?.startNumber ?? null,
        rangeEndSlotIndex: normalizedRange?.endIndex ?? null,
        rangeEndSlotNumber: normalizedRange?.endNumber ?? null,
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

  const threadNotes = useMemo(() => notesQuery.data ?? [], [notesQuery.data])
  const followedNoteSet = useMemo(() => new Set(followedNoteIds), [followedNoteIds])
  const discovery = useMemo(() => {
    const anchors = new Map<string, number>()
    for (const note of threadNotes) {
      const key = note.anchorLabel ?? 'Whole slot'
      anchors.set(key, (anchors.get(key) ?? 0) + 1)
    }
    return {
      total: threadNotes.length,
      openQuestions: threadNotes.filter(note => note.status === 'open_question' || note.contributionType === 'question').length,
      challenged: threadNotes.filter(note => note.status === 'challenged' || note.contributionType === 'counterpoint').length,
      followed: threadNotes.filter(note => followedNoteSet.has(note.id)).length,
      topAnchors: [...anchors.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3),
    }
  }, [followedNoteSet, threadNotes])
  const sortedNotes = useMemo(() => {
    const notes = [...threadNotes]
    notes.sort((left, right) => {
      const leftFollowed = followedNoteSet.has(left.id) ? 1 : 0
      const rightFollowed = followedNoteSet.has(right.id) ? 1 : 0
      if (leftFollowed !== rightFollowed) return rightFollowed - leftFollowed
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
    return notes
  }, [followedNoteSet, threadNotes])

  const canSave = queryEnabled && draft.trim().length > 0 && !mutation.isPending && (!rangeRequired || normalizedRange != null)

  return (
    <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Research discussion</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            Turn the replay into a living figure with claims, questions, evidence, and counterpoints.
          </div>
          <div className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            The interface structures discussion and surfaces debate, but it does not think for the reader.
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
          {mutation.isPending ? 'Saving note' : 'Add discussion note'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {[
          { label: 'Notes here', value: discovery.total.toLocaleString(), detail: 'Structured contributions in this replay posture.' },
          { label: 'Open questions', value: discovery.openQuestions.toLocaleString(), detail: 'Questions still pulling thought forward.' },
          { label: 'Challenged reads', value: discovery.challenged.toLocaleString(), detail: 'Places where the interpretation is under pressure.' },
          { label: 'Following', value: discovery.followed.toLocaleString(), detail: 'Notes you marked to come back to.' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold text-text-primary">{card.value}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{card.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">What people are debating here</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {discovery.topAnchors.length > 0 ? discovery.topAnchors.map(([anchorLabel, count]) => (
            <button
              key={anchorLabel}
              onClick={() => {
                const matchingAnchor = anchorOptions.find(option => option.label === anchorLabel)
                if (matchingAnchor) setSelectedAnchorKey(matchingAnchor.key)
              }}
              className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
            >
              {anchorLabel} · {count}
            </button>
          )) : (
            <div className="text-xs leading-5 text-muted">No debate cluster yet. Seed one with a first question or claim.</div>
          )}
        </div>
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

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Prompts to think with</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {promptLaunchers.map(prompt => (
            <button
              key={prompt}
              onClick={() => {
                setDraft(prompt)
                setContributionType('question')
                setDraftStatus('open_question')
              }}
              className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Community lane</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMMUNITY_LANES.map(option => (
              <button
                key={option.id}
                onClick={() => setCommunityLane(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  communityLane === option.id
                    ? laneBadgeClass(option.id)
                    : 'border-rule bg-white text-text-primary hover:border-border-hover',
                )}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Reasoning move</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONTRIBUTION_TYPES.map(option => (
              <button
                key={option.id}
                onClick={() => {
                  setContributionType(option.id)
                  setDraftStatus(defaultStatusForContribution(option.id))
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  contributionType === option.id
                    ? contributionBadgeClass(option.id)
                    : 'border-rule bg-white text-text-primary hover:border-border-hover',
                )}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Discussion state</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DISCUSSION_STATES.map(option => (
              <button
                key={option.id}
                onClick={() => setDraftStatus(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  draftStatus === option.id
                    ? statusBadgeClass(option.id)
                    : 'border-rule bg-white text-text-primary hover:border-border-hover',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Annotation unit</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ANNOTATION_SCOPES.filter(option => comparisonViewerSnapshot || option.id !== 'comparison_gap').map(option => (
              <button
                key={option.id}
                onClick={() => setAnnotationScope(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  annotationScope === option.id
                    ? 'border-accent bg-[linear-gradient(180deg,rgba(37,99,235,0.1),rgba(255,255,255,0.98))] text-accent'
                    : 'border-rule bg-white text-text-primary hover:border-border-hover',
                )}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rangeRequired ? (
        <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Slot window</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-rule bg-white px-3 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Start slot</div>
              <input
                type="number"
                min={1}
                value={rangeStartSlotNumber}
                onChange={event => setRangeStartSlotNumber(event.target.value)}
                className="mt-2 w-full bg-transparent text-sm text-text-primary outline-none"
              />
            </label>
            <label className="rounded-xl border border-rule bg-white px-3 py-3">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">End slot</div>
              <input
                type="number"
                min={1}
                value={rangeEndSlotNumber}
                onChange={event => setRangeEndSlotNumber(event.target.value)}
                className="mt-2 w-full bg-transparent text-sm text-text-primary outline-none"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Note anchor</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {anchorOptions.map(option => (
            <button
              key={`${option.kind}:${option.key}`}
              onClick={() => {
                setSelectedAnchorKey(option.key)
                if (annotationScope === 'exact_slot') {
                  setAnnotationScope(defaultAnnotationScopeForAnchor(option.kind, option.key))
                }
              }}
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
          placeholder="Write a note that helps the next reader think harder about the figure."
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
            <div className="mt-1 text-xs text-muted">Notes stay attached to this exact replay posture, but they can talk about ranges, trends, claims, and comparison gaps.</div>
          </div>
          {notesQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : null}
        </div>

        <div className="mt-4 space-y-3">
          {sortedNotes.map(note => (
            <div key={note.id} className={cn(
              'rounded-xl border bg-white px-4 py-4',
              followedNoteSet.has(note.id) ? 'border-[#0F172A]/12 shadow-[0_16px_30px_rgba(15,23,42,0.08)]' : 'border-rule',
            )}>
              <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-faint">
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium', laneBadgeClass(note.communityLane))}>{COMMUNITY_LANES.find(option => option.id === note.communityLane)?.label ?? note.communityLane}</span>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium', contributionBadgeClass(note.contributionType))}>{CONTRIBUTION_TYPES.find(option => option.id === note.contributionType)?.label ?? note.contributionType.replace('_', ' ')}</span>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium', statusBadgeClass(note.status))}>{formatStatusLabel(note.status)}</span>
                <span className="lab-chip">slot {note.slotNumber}</span>
                {(note.annotationScope === 'time_range' || note.annotationScope === 'region_over_time') && note.rangeStartSlotNumber != null && note.rangeEndSlotNumber != null ? (
                  <span className="lab-chip">window {note.rangeStartSlotNumber}-{note.rangeEndSlotNumber}</span>
                ) : (
                  <span className="lab-chip">{note.annotationScope.replace('_', ' ')}</span>
                )}
                {note.anchorLabel ? <span className="lab-chip">{note.anchorLabel}</span> : null}
                {note.comparisonSlotNumber != null ? <span className="lab-chip">compare slot {note.comparisonSlotNumber}</span> : null}
                <span>{formatTimestamp(note.createdAt)}</span>
                <button
                  onClick={() => setFollowedNoteIds(current =>
                    current.includes(note.id)
                      ? current.filter(candidate => candidate !== note.id)
                      : [...current, note.id]
                  )}
                  className={cn(
                    'ml-auto rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium transition-colors',
                    followedNoteSet.has(note.id)
                      ? 'border-[#0F172A]/12 bg-[#0F172A] text-white'
                      : 'border-rule bg-white text-text-primary hover:border-border-hover',
                  )}
                >
                  {followedNoteSet.has(note.id) ? 'Following' : 'Follow note'}
                </button>
              </div>
              {note.contextLabel ? (
                <div className="mt-2 text-[0.6875rem] leading-5 text-muted">{note.contextLabel}</div>
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
                  placeholder="Add a reply that clarifies, challenges, or extends the note..."
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <select
                    value={note.status}
                    onChange={event => statusMutation.mutate({ noteId: note.id, status: event.target.value as PublishedReplayNoteStatus })}
                    disabled={statusMutation.isPending}
                    className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary outline-none"
                  >
                    {DISCUSSION_STATES.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
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

          {threadNotes.length === 0 && !notesQuery.isLoading ? (
            <div className="rounded-xl border border-dashed border-rule bg-white px-4 py-5 text-xs leading-5 text-muted">
              No discussion note is attached to this replay posture yet. Seed the thread with a concrete question or a claim someone else can challenge.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
