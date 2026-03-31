import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
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

type ThreadFilterId =
  | 'all'
  | 'open_questions'
  | 'contested'
  | 'author_lane'
  | 'following'
  | 'range_notes'

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
    return 'border-[#D7F1E6] bg-[#F7FDF9] text-[#0F766E]'
  }
  if (status === 'challenged') {
    return 'border-[#F7D8E0] bg-[#FFF8FA] text-[#9F1239]'
  }
  return 'border-[#F4E0C2] bg-[#FFF9F2] text-[#9A3412]'
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

const THREAD_FILTERS: ReadonlyArray<{
  readonly id: ThreadFilterId
  readonly label: string
  readonly description: string
}> = [
  {
    id: 'all',
    label: 'All notes',
    description: 'Show every contribution attached to this replay posture.',
  },
  {
    id: 'open_questions',
    label: 'Open questions',
    description: 'Focus on notes that still need an answer or stronger evidence.',
  },
  {
    id: 'contested',
    label: 'Contested',
    description: 'Surface challenged interpretations and counterpoints first.',
  },
  {
    id: 'author_lane',
    label: 'Author lane',
    description: 'Review clarifications and direct responses from the authors.',
  },
  {
    id: 'following',
    label: 'Following',
    description: 'Show only notes you marked to revisit.',
  },
  {
    id: 'range_notes',
    label: 'Range notes',
    description: 'Focus on windows, trends, and region-over-time reasoning.',
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
  if (lane === 'author') return 'border-[#D9E7FF] bg-[#F8FBFF] text-[#1D4ED8]'
  if (lane === 'reviewer') return 'border-[#F7D8E0] bg-[#FFF8FA] text-[#9F1239]'
  return 'border-[#D7F1E6] bg-[#F7FDF9] text-[#0F766E]'
}

function contributionBadgeClass(
  contributionType: PublishedReplayContributionType,
): string {
  if (contributionType === 'question') return 'border-[#F4E0C2] bg-[#FFF9F2] text-[#9A3412]'
  if (contributionType === 'counterpoint') return 'border-[#F7D8E0] bg-[#FFF8FA] text-[#9F1239]'
  if (contributionType === 'method_concern') return 'border-[#E6DDFD] bg-[#FAF8FF] text-[#6D28D9]'
  if (contributionType === 'claim') return 'border-[#D9E7FF] bg-[#F8FBFF] text-[#1D4ED8]'
  return 'border-[#D7F1E6] bg-[#F7FDF9] text-[#0F766E]'
}

function formatAnnotationScopeLabel(scope: PublishedReplayAnnotationScope): string {
  if (scope === 'exact_slot') return 'exact slot'
  if (scope === 'time_range') return 'time range'
  if (scope === 'comparison_gap') return 'comparison gap'
  if (scope === 'paper_claim') return 'paper claim'
  if (scope === 'region_over_time') return 'region over time'
  return 'trend'
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
  const [activeThreadFilter, setActiveThreadFilter] = useState<ThreadFilterId>('all')
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
  const selectedAnchorLabel = selectedAnchor?.label ?? 'Whole slot'
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
      authorAddressed: threadNotes.filter(note => note.status === 'author_addressed' || note.communityLane === 'author').length,
      followed: threadNotes.filter(note => followedNoteSet.has(note.id)).length,
      topAnchors: [...anchors.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3),
    }
  }, [followedNoteSet, threadNotes])
  type ThreadNote = (typeof threadNotes)[number]
  const matchesThreadFilter = useCallback((note: ThreadNote, filterId: ThreadFilterId): boolean => {
    if (filterId === 'open_questions') {
      return note.status === 'open_question' || note.contributionType === 'question'
    }
    if (filterId === 'contested') {
      return note.status === 'challenged' || note.contributionType === 'counterpoint'
    }
    if (filterId === 'author_lane') {
      return note.communityLane === 'author' || note.status === 'author_addressed'
    }
    if (filterId === 'following') {
      return followedNoteSet.has(note.id)
    }
    if (filterId === 'range_notes') {
      return (
        note.annotationScope === 'time_range' ||
        note.annotationScope === 'region_over_time' ||
        note.annotationScope === 'trend'
      )
    }
    return true
  }, [followedNoteSet])
  const threadFilterCounts = useMemo<Record<ThreadFilterId, number>>(() => ({
    all: threadNotes.length,
    open_questions: threadNotes.filter(note => matchesThreadFilter(note, 'open_questions')).length,
    contested: threadNotes.filter(note => matchesThreadFilter(note, 'contested')).length,
    author_lane: threadNotes.filter(note => matchesThreadFilter(note, 'author_lane')).length,
    following: threadNotes.filter(note => matchesThreadFilter(note, 'following')).length,
    range_notes: threadNotes.filter(note => matchesThreadFilter(note, 'range_notes')).length,
  }), [matchesThreadFilter, threadNotes])
  const sortedNotes = useMemo(() => {
    const notes = [...threadNotes]
    notes.sort((left, right) => {
      const leftFollowed = followedNoteSet.has(left.id) ? 1 : 0
      const rightFollowed = followedNoteSet.has(right.id) ? 1 : 0
      if (leftFollowed !== rightFollowed) return rightFollowed - leftFollowed
      const leftAuthor = left.communityLane === 'author' ? 1 : 0
      const rightAuthor = right.communityLane === 'author' ? 1 : 0
      if (leftAuthor !== rightAuthor) return rightAuthor - leftAuthor
      const leftPriority =
        (left.status === 'open_question' ? 4 : 0) +
        (left.status === 'challenged' ? 3 : 0) +
        (left.contributionType === 'question' ? 2 : 0) +
        (left.contributionType === 'counterpoint' ? 2 : 0)
      const rightPriority =
        (right.status === 'open_question' ? 4 : 0) +
        (right.status === 'challenged' ? 3 : 0) +
        (right.contributionType === 'question' ? 2 : 0) +
        (right.contributionType === 'counterpoint' ? 2 : 0)
      if (leftPriority !== rightPriority) return rightPriority - leftPriority
      if (left.replies.length !== right.replies.length) return right.replies.length - left.replies.length
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
    return notes
  }, [followedNoteSet, threadNotes])
  const threadViewNotes = useMemo(
    () => sortedNotes.filter(note => matchesThreadFilter(note, activeThreadFilter)),
    [activeThreadFilter, matchesThreadFilter, sortedNotes],
  )
  const activeThreadFilterMeta = useMemo(
    () => THREAD_FILTERS.find(filter => filter.id === activeThreadFilter) ?? THREAD_FILTERS[0],
    [activeThreadFilter],
  )
  const discussionLead = useMemo(() => {
    const leadingAnchor = discovery.topAnchors[0]
    if (!leadingAnchor) {
      return 'No debate cluster has formed yet. The strongest first contribution is usually one bounded question or one falsifiable claim.'
    }

    const anchorMessage = `${leadingAnchor[0]} is carrying the thread with ${leadingAnchor[1]} note${leadingAnchor[1] === 1 ? '' : 's'}.`
    if (discovery.openQuestions > 0) {
      return `${anchorMessage} ${discovery.openQuestions} open question${discovery.openQuestions === 1 ? '' : 's'} still need a direct answer or stronger evidence.`
    }
    if (discovery.challenged > 0) {
      return `${anchorMessage} ${discovery.challenged} challenged read${discovery.challenged === 1 ? '' : 's'} are keeping interpretation unstable.`
    }
    if (discovery.authorAddressed > 0) {
      return `${anchorMessage} ${discovery.authorAddressed} author response${discovery.authorAddressed === 1 ? '' : 's'} already shape how this figure is being read.`
    }
    return `${anchorMessage} The next high-value note should either test the dominant interpretation or widen it to a time range.`
  }, [discovery])
  const composerGuidance = useMemo(() => {
    const moveGuidance =
      contributionType === 'question'
        ? 'Ask something another reader could answer from the figure, the paper, or the comparison run.'
        : contributionType === 'claim'
          ? 'State a bounded interpretation and make it vulnerable to challenge.'
          : contributionType === 'counterpoint'
            ? 'Name the current reading you disagree with, then offer a tighter alternative.'
            : contributionType === 'method_concern'
              ? 'Point to the assumption, metric, or modelling choice that could change the conclusion.'
              : 'Describe what the replay shows before you infer why it matters.'

    const scopeGuidance =
      annotationScope === 'time_range'
        ? 'Use the slot window to show when the pattern begins and where it stops holding.'
        : annotationScope === 'trend'
          ? 'Keep the note about direction over time, not one isolated frame.'
          : annotationScope === 'comparison_gap'
            ? 'Make the gap explicit: what differs between the primary and comparison run, and why should a reader care?'
            : annotationScope === 'paper_claim'
              ? 'Tie the note back to a claim the paper is making, not just the raw telemetry.'
              : annotationScope === 'region_over_time'
                ? 'Track one geography through a window and say whether the pattern persists.'
                : `Anchor the note to ${selectedAnchorLabel.toLowerCase()} so the next reader knows exactly what posture you mean.`

    const laneGuidance =
      communityLane === 'author'
        ? 'Author lane should clarify, qualify, or directly address pressure coming from the thread.'
        : communityLane === 'reviewer'
          ? 'Reviewer lane should apply pressure concretely, not with generic skepticism.'
          : 'Community lane works best when it converts observation into a sharper question or implication.'

    return `${moveGuidance} ${scopeGuidance} ${laneGuidance}`
  }, [annotationScope, communityLane, contributionType, selectedAnchorLabel])
  const draftPlaceholder = useMemo(() => {
    if (contributionType === 'question') {
      return `Ask a bounded question about ${selectedAnchorLabel.toLowerCase()} that another reader can answer from the replay or paper.`
    }
    if (contributionType === 'claim') {
      return `Make a concrete claim about ${selectedAnchorLabel.toLowerCase()} and say what evidence would weaken it.`
    }
    if (contributionType === 'counterpoint') {
      return `Challenge the current read of ${selectedAnchorLabel.toLowerCase()} with a more defensible alternative.`
    }
    if (contributionType === 'method_concern') {
      return `Name the modelling or measurement choice around ${selectedAnchorLabel.toLowerCase()} that could change the result.`
    }
    return `Describe exactly what the replay shows at ${selectedAnchorLabel.toLowerCase()} before interpreting it.`
  }, [contributionType, selectedAnchorLabel])

  const canSave = queryEnabled && draft.trim().length > 0 && !mutation.isPending && (!rangeRequired || normalizedRange != null)

  return (
    <motion.div
      className="mt-4 rounded-xl border border-rule bg-white px-4 py-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Figure annotations</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            Click a figure target first, then leave a short note with the context already attached.
          </div>
          <div className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            This follows the same interaction principle as Benji Taylor’s annotation work: pointing is the high-precision part, writing is the small follow-through. The figure target, slot, and replay posture carry the specificity for you.
          </div>
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={!canSave}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all',
            canSave
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'cursor-not-allowed border border-rule bg-surface-active text-muted',
          )}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mutation.isPending ? 'Saving note' : 'Add discussion note'}
        </button>
      </div>

      <motion.div
        className="mt-4 grid gap-3 xl:grid-cols-5"
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate="show"
      >
        {[
          { label: 'Notes here', value: discovery.total.toLocaleString(), detail: 'Structured contributions in this replay posture.' },
          { label: 'Open questions', value: discovery.openQuestions.toLocaleString(), detail: 'Questions still pulling thought forward.' },
          { label: 'Challenged reads', value: discovery.challenged.toLocaleString(), detail: 'Places where the interpretation is under pressure.' },
          { label: 'Author addressed', value: discovery.authorAddressed.toLocaleString(), detail: 'Author clarifications and direct responses.' },
          { label: 'Following', value: discovery.followed.toLocaleString(), detail: 'Notes you marked to come back to.' },
        ].map(card => (
          <motion.div key={card.label} variants={STAGGER_ITEM} className="rounded-xl border border-rule bg-surface-active px-4 py-3">
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold text-text-primary">{card.value}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{card.detail}</div>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">What people are debating here</div>
        <div className="mt-2 max-w-3xl text-xs leading-5 text-muted">{discussionLead}</div>
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
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Captured context</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#DBE4F0] bg-white px-3 py-1 text-11 font-medium text-text-primary">
            Selected target · {selectedAnchorLabel}
          </span>
          <span className="rounded-full border border-[#DBE4F0] bg-white px-3 py-1 text-11 font-medium text-text-primary">
            Scope · {ANNOTATION_SCOPES.find(option => option.id === annotationScope)?.label ?? annotationScope}
          </span>
        </div>
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
          <div>The target and replay posture are captured automatically, so the note can stay short and specific.</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Prompts to think with</div>
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
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Community lane</div>
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
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Reasoning move</div>
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
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Discussion state</div>
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
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Annotation unit</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ANNOTATION_SCOPES.filter(option => comparisonViewerSnapshot || option.id !== 'comparison_gap').map(option => (
              <button
                key={option.id}
                onClick={() => setAnnotationScope(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  annotationScope === option.id
                    ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
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
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Slot window</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-rule bg-white px-3 py-3">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Start slot</div>
              <input
                type="number"
                min={1}
                value={rangeStartSlotNumber}
                onChange={event => setRangeStartSlotNumber(event.target.value)}
                className="mt-2 w-full bg-transparent text-sm text-text-primary outline-none"
              />
            </label>
            <label className="rounded-xl border border-rule bg-white px-3 py-3">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">End slot</div>
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
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Note anchor</div>
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
                  ? 'border-accent bg-gradient-to-b from-accent/10 to-white/98 text-accent'
                  : 'border-rule bg-white text-text-primary hover:border-border-hover',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-white px-4 py-4">
        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Note draft</div>
        <div className="mt-2 rounded-xl border border-rule bg-surface-active px-3 py-3 text-xs leading-5 text-muted">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Composer guidance</div>
          <div className="mt-2">{composerGuidance}</div>
        </div>
        <div className="mt-3 text-11 leading-5 text-muted">
          Keep the note short. The selected target, slot posture, and replay context already carry most of the precision.
        </div>
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="mt-2 min-h-[120px] w-full resize-none bg-transparent text-sm leading-6 text-text-primary outline-none"
          placeholder={draftPlaceholder}
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
            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Figure thread</div>
            <div className="mt-1 text-xs text-muted">Notes stay attached to this replay posture, but they can still speak in ranges, comparisons, claims, and challenges.</div>
          </div>
          {notesQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {THREAD_FILTERS.map(filter => (
            <button
              key={filter.id}
              onClick={() => setActiveThreadFilter(filter.id)}
              title={filter.description}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                activeThreadFilter === filter.id
                  ? 'border-rule bg-gradient-to-b from-white to-slate-50 text-text-primary shadow-sm'
                  : 'border-rule bg-white text-text-primary hover:border-border-hover',
              )}
            >
              {filter.label} · {threadFilterCounts[filter.id]}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-rule bg-white px-3 py-3 text-xs leading-5 text-muted">
          <span className="font-medium text-text-primary">{activeThreadFilterMeta.label}:</span> {activeThreadFilterMeta.description}
        </div>

        <div className="mt-4 space-y-3">
          {threadViewNotes.map(note => (
            <div key={note.id} className={cn(
              'rounded-xl border bg-white px-4 py-4',
              followedNoteSet.has(note.id)
                ? 'border-[#D8E4F3] shadow-[0_18px_34px_rgba(15,23,42,0.07)]'
                : 'border-rule shadow-[0_8px_18px_rgba(15,23,42,0.03)]',
              note.communityLane === 'author'
                ? 'border-l-[3px] border-l-[#1D4ED8]'
                : note.communityLane === 'reviewer'
                  ? 'border-l-[3px] border-l-[#9F1239]'
                  : 'border-l-[3px] border-l-[#0F766E]',
            )}>
              <div className="flex flex-wrap items-center gap-2 text-11 text-text-faint">
                <span className={cn('rounded-full border px-2.5 py-0.5 text-2xs font-medium', laneBadgeClass(note.communityLane))}>{COMMUNITY_LANES.find(option => option.id === note.communityLane)?.label ?? note.communityLane}</span>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-2xs font-medium', contributionBadgeClass(note.contributionType))}>{CONTRIBUTION_TYPES.find(option => option.id === note.contributionType)?.label ?? note.contributionType.replace('_', ' ')}</span>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-2xs font-medium', statusBadgeClass(note.status))}>{formatStatusLabel(note.status)}</span>
                <span className="lab-chip">slot {note.slotNumber}</span>
                {(note.annotationScope === 'time_range' || note.annotationScope === 'region_over_time') && note.rangeStartSlotNumber != null && note.rangeEndSlotNumber != null ? (
                  <span className="lab-chip">window {note.rangeStartSlotNumber}-{note.rangeEndSlotNumber}</span>
                ) : (
                  <span className="lab-chip">{formatAnnotationScopeLabel(note.annotationScope)}</span>
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
                    'ml-auto rounded-full border px-2.5 py-0.5 text-2xs font-medium transition-colors',
                    followedNoteSet.has(note.id)
                      ? 'border-rule bg-gradient-to-b from-white to-slate-50 text-text-primary'
                      : 'border-rule bg-white text-text-primary hover:border-border-hover',
                  )}
                >
                  {followedNoteSet.has(note.id) ? 'Following' : 'Follow note'}
                </button>
              </div>
              {note.contextLabel ? (
                <div className="mt-2 text-11 leading-5 text-muted">{note.contextLabel}</div>
              ) : null}
              <div className="mt-3 text-sm leading-6 text-text-primary">{note.note}</div>
              {note.replies.length > 0 ? (
                <div className="mt-4 space-y-2 border-t border-rule pt-3">
                  {note.replies.map(reply => (
                    <div key={reply.id} className="rounded-xl border border-rule bg-surface-active px-3 py-3">
                      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{formatTimestamp(reply.createdAt)}</div>
                      <div className="mt-2 text-xs leading-5 text-text-primary">{reply.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 rounded-xl border border-rule bg-surface-active px-3 py-3">
                <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Reply</div>
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

          {threadViewNotes.length === 0 && !notesQuery.isLoading ? (
            <div className="rounded-xl border border-dashed border-rule bg-white px-4 py-5 text-xs leading-5 text-muted">
              {threadNotes.length === 0
                ? 'No discussion note is attached to this replay posture yet. Seed the thread with a concrete question or a claim someone else can challenge.'
                : `No notes match ${activeThreadFilterMeta.label.toLowerCase()} right now. Clear the filter or add the first note in that lane.`}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}
