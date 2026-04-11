/**
 * Express API proxy for Claude calls.
 * Keeps the API key server-side. Frontend calls /api/explore -> curated/history routing -> Claude -> Block[].
 *
 * Start: npx tsx server/index.ts
 * Env:   ANTHROPIC_API_KEY=your_anthropic_api_key_here
 */

import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { createAnthropic } from '@ai-sdk/anthropic'
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  hasToolCall,
  streamText,
  tool as createTool,
  type UIMessage,
} from 'ai'
import { z } from 'zod/v4'
import {
  buildPublishedReplayCopilotContext as buildPublishedReplayCopilotPrompt,
  buildSimulationCopilotContext as buildSimulationCopilotPrompt,
} from './study-context.ts'
import { buildStudyContext } from './study-context-builder.ts'
import { buildTools } from './catalog.ts'
import { SimulationRuntime, parseSimulationRequest, type SimulationRequest } from './simulation-runtime.ts'
import { ExplorationStore, normalizeQuery, type ExplorationSurface, type ListOptions } from './exploration-store.ts'
import { AgentLoopStore } from './agent-loop-store.ts'
import { AgentLoopOrchestrator } from './agent-loop-orchestrator.ts'
import { AGENT_LOOP_DEFAULTS } from './agent-loop-types.ts'
import { GCP_REGIONS } from '../src/data/gcp-regions.ts'
import {
  buildSimulationArtifactBundle,
  buildSimulationSummaryChart,
  parseSimulationArtifactToBlocks,
  parseSimulationBlockBundle,
  type SimulationRenderableArtifact,
} from '../src/lib/simulation-artifact-blocks.ts'
import { parseBlocks, type Block, type Cite } from '../src/types/blocks.ts'
import {
  type SimulationArtifactBundle,
  type SimulationChartMetricKey,
  simulationViewSpecSchema,
  type SimulationViewSection,
  type SimulationViewSpec,
} from '../src/types/simulation-view.ts'
import type { StudyAssistantQueryView, StudyAssistantWorkflow, StudyDashboardSpec, TopicCard } from '../src/studies/types.ts'
import type { AskArtifactData, AskPlanData, AskStatusData } from '../src/lib/ask-artifact.ts'
import type { AskUIMessage } from '../src/lib/ask-chat.ts'
import { askLaunchContextSchema, type AskLaunchContext } from '../src/lib/ask-launch.ts'
import {
  findWorkflowPreset,
  resolveWorkflowSelections,
  resolveWorkflowSimulationConfig,
  resolveWorkflowStructuredQuery,
} from '../src/lib/workflow-launch.ts'
import { getStudyPackage } from '../src/studies/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPLORER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(EXPLORER_ROOT, '..')
const DASHBOARD_DIR = path.resolve(EXPLORER_ROOT, '..', 'dashboard')
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
const MISSING_ANTHROPIC_CONFIG_MESSAGE = 'Anthropic API is not configured on this server. Add ANTHROPIC_API_KEY to explorer/.env or your shell environment.'

const envFile = path.join(EXPLORER_ROOT, '.env')
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'does',
  'do',
  'for',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'to',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
])

const ACTIVE_STUDY = getStudyPackage(process.env.STUDY_ID?.trim() || undefined)
const STUDY_CONTEXT = buildStudyContext(ACTIVE_STUDY)
const SIMULATION_COPILOT_CONTEXT = buildSimulationCopilotPrompt(ACTIVE_STUDY)
const PUBLISHED_REPLAY_COPILOT_CONTEXT = buildPublishedReplayCopilotPrompt(ACTIVE_STUDY)
const ACTIVE_STUDY_QUERY_VIEWS = ACTIVE_STUDY.assistant.queryViews ?? []
const OVERVIEW_CARD = ACTIVE_STUDY.overviewCard
const TOPIC_CARDS = ACTIVE_STUDY.topicCards
const CURATED_CARDS = [OVERVIEW_CARD, ...TOPIC_CARDS]
const ALL_EXPLORATION_TOPICS = TOPIC_CARDS
const MAX_GENERATED_BLOCKS = 6
const MAX_GENERATED_FOLLOW_UPS = 3
const DEFAULT_GENERATED_FALLBACK_TEXT =
  'The explorer is falling back to a conservative paper-backed note because the model did not return a safe structured visualization.'
const DEFAULT_GENERATED_SOURCE_BLOCK: Block = {
  type: 'source',
  refs: ACTIVE_STUDY.runtime.sourceBlockRefs,
}
const DEFAULT_GENERATED_CAVEAT_BLOCK: Block = {
  type: 'caveat',
  text: 'Assistant framing is secondary to the cited paper context and any exact simulation outputs shown alongside it.',
}

const DEFAULT_SIMULATION_CONFIG: SimulationRequest = {
  ...ACTIVE_STUDY.runtime.defaultSimulationConfig,
}

function resolveRepoRelativePath(rawPath: string | undefined | null): string | null {
  const trimmed = rawPath?.trim()
  if (!trimmed) return null
  return path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(REPO_ROOT, trimmed)
}

const ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH = resolveRepoRelativePath(
  ACTIVE_STUDY.runtime.publishedResults?.catalogPath,
)
const ACTIVE_PUBLISHED_RESULTS_BASE_DIR = resolveRepoRelativePath(
  ACTIVE_STUDY.runtime.publishedResults?.baseDir,
) ?? (
  ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH
    ? path.resolve(path.dirname(ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH), '..')
    : null
)

const PAPER_REFERENCE_OVERRIDES = {
  ...ACTIVE_STUDY.runtime.paperReferenceOverrides,
} satisfies Partial<SimulationRequest>

const SIMULATION_PRESETS = {
  ...ACTIVE_STUDY.runtime.simulationPresets,
} satisfies Record<string, Partial<SimulationRequest>>

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropicModel = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3200,http://localhost:5180').split(',')
const MAX_EXPLORE_QUERY_LENGTH = Math.max(120, Number(process.env.MAX_EXPLORE_QUERY_LENGTH ?? 600))
const MAX_SIMULATION_QUESTION_LENGTH = Math.max(160, Number(process.env.MAX_SIMULATION_QUESTION_LENGTH ?? 900))
const MAX_SESSION_HISTORY_ENTRIES = Math.max(1, Number(process.env.MAX_SESSION_HISTORY_ENTRIES ?? 6))
const MAX_SESSION_SUMMARY_LENGTH = Math.max(80, Number(process.env.MAX_SESSION_SUMMARY_LENGTH ?? 280))
const MAX_CLIENT_ID_LENGTH = Math.max(16, Number(process.env.MAX_CLIENT_ID_LENGTH ?? 128))
const MAX_PUBLISHED_TITLE_LENGTH = Math.max(48, Number(process.env.MAX_PUBLISHED_TITLE_LENGTH ?? 120))
const MAX_PUBLISHED_TAKEAWAY_LENGTH = Math.max(80, Number(process.env.MAX_PUBLISHED_TAKEAWAY_LENGTH ?? 240))
const MAX_PUBLISHED_AUTHOR_LENGTH = Math.max(24, Number(process.env.MAX_PUBLISHED_AUTHOR_LENGTH ?? 80))
const MAX_EXPLORATION_MODEL_LENGTH = Math.max(32, Number(process.env.MAX_EXPLORATION_MODEL_LENGTH ?? 120))
const MAX_EDITOR_NOTE_LENGTH = Math.max(40, Number(process.env.MAX_EDITOR_NOTE_LENGTH ?? 240))
const MAX_REPLY_AUTHOR_LENGTH = Math.max(12, Number(process.env.MAX_REPLY_AUTHOR_LENGTH ?? 80))
const MAX_REPLY_BODY_LENGTH = Math.max(40, Number(process.env.MAX_REPLY_BODY_LENGTH ?? 500))

function getRequesterId(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim()
  }
  return req.ip || 'unknown'
}

function createRateLimitMiddleware(
  label: string,
  windowMs: number,
  maxRequests: number,
): express.RequestHandler {
  const buckets = new Map<string, RateLimitBucket>()

  return (req, res, next) => {
    const now = Date.now()

    for (const [bucketId, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketId)
      }
    }

    const requesterId = `${label}:${getRequesterId(req)}`
    const bucket = buckets.get(requesterId)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(requesterId, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    if (bucket.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSeconds))
      res.status(429).json({
        error: `Too many ${label} requests from this client. Retry in about ${retryAfterSeconds} seconds.`,
      })
      return
    }

    bucket.count += 1
    next()
  }
}

const exploreRateLimit = createRateLimitMiddleware('explore', 60_000, 24)
const simulationCopilotRateLimit = createRateLimitMiddleware('simulation-copilot', 60_000, 18)
const publishedReplayCopilotRateLimit = createRateLimitMiddleware('published-replay-copilot', 60_000, 18)
const simulationSubmitRateLimit = createRateLimitMiddleware('simulations', 60_000, 10)
const agentLoopRateLimit = createRateLimitMiddleware('agent-loop', 60_000, 8)

const app = express()
app.set('trust proxy', true)
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '1mb' }))

const client = apiKey ? new Anthropic({ apiKey }) : null
const aiSdkAnthropicProvider = apiKey ? createAnthropic({ apiKey }) : null
const allTools = buildTools()
const exploreTools = allTools.filter(tool => tool.name !== 'render_simulation_view_spec')
const simulationCopilotTools = allTools.filter(
  tool => tool.name !== 'render_blocks' && tool.name !== 'verify_exploration',
)
const renderBlocksTool = allTools.find(tool => tool.name === 'render_blocks') ?? null
const simulationRuntime = new SimulationRuntime()
const explorationStore = new ExplorationStore()
const agentLoopStore = new AgentLoopStore()
const agentLoopOrchestrator = client
  ? new AgentLoopOrchestrator(
      client,
      agentLoopStore,
      simulationRuntime,
      anthropicModel,
      SIMULATION_COPILOT_CONTEXT,
    )
  : null
const publishedReplayDatasetCache = new Map<string, PublishedReplayPayload>()
let publishedResearchCatalogCache: PublishedResearchCatalog | null = null
const publishedRegionLookup = new Map(GCP_REGIONS.map(region => [region.id, region] as const))

interface ExploreRequest {
  query: string
  history?: Array<{ query: string; summary: string }>
}

type ExploreSource = 'curated' | 'history' | 'generated'

interface ExploreProvenance {
  source: ExploreSource
  label: string
  detail: string
  canonical: boolean
  topicId?: string
  explorationId?: string
  similarityScore?: number
}

interface ExploreResponse {
  summary: string
  blocks: Block[]
  followUps: string[]
  model: string
  cached: boolean
  provenance: ExploreProvenance
}

interface SimulationCopilotRequest {
  question: string
  currentJobId?: string | null
  currentConfig?: SimulationRequest | null
}

interface SimulationCopilotResponse {
  summary: string
  mode: SimulationViewSpec['mode']
  guidance?: string
  truthBoundary: {
    label: string
    detail: string
  }
  suggestedPrompts: string[]
  proposedConfig?: SimulationRequest
  viewSpec: SimulationViewSpec
  blocks: readonly Block[]
  model: string
  cached: boolean
}

interface PublishedReplayCopilotRequest {
  question: string
  datasetPath?: string | null
  datasetLabel?: string | null
  sourceRole?: string | null
  comparePath?: string | null
  compareLabel?: string | null
  compareSourceRole?: string | null
  focusSlot?: number | null
  paperLens?: 'evidence' | 'theory' | 'methods' | null
  paperSectionId?: string | null
  paperSectionLabel?: string | null
  paperSectionContext?: string | null
  audienceMode?: 'reader' | 'reviewer' | 'researcher' | null
  currentViewSummary?: string | null
  viewerSnapshot?: PublishedReplayViewerSnapshotContext | null
  comparisonViewerSnapshot?: PublishedReplayViewerSnapshotContext | null
}

interface PublishedReplayViewerSnapshotContext {
  slotIndex: number
  slotNumber: number
  totalSlots: number
  stepSize: number
  playing: boolean
  activeRegions: number
  totalValidators: number
  dominantRegionId?: string | null
  dominantRegionCity?: string | null
  dominantRegionShare?: number | null
  currentGini?: number | null
  currentHhi?: number | null
  currentLiveness?: number | null
  currentMev?: number | null
  currentProposalTime?: number | null
  currentAttestation?: number | null
  currentTotalDistance?: number | null
  currentFailedBlockProposals?: number | null
  currentClusters?: number | null
}

type PublishedReplayNoteIntent = 'observation' | 'question' | 'theory' | 'methods'
type PublishedReplayNoteStatus =
  | 'open_question'
  | 'needs_evidence'
  | 'challenged'
  | 'supported'
  | 'author_addressed'
type PublishedReplayContributionType = 'claim' | 'question' | 'evidence' | 'counterpoint' | 'method_concern'
type PublishedReplayCommunityLane = 'author' | 'reviewer' | 'community'
type PublishedReplayAnnotationScope =
  | 'exact_slot'
  | 'time_range'
  | 'trend'
  | 'comparison_gap'
  | 'paper_claim'
  | 'region_over_time'

interface PublishedReplayNoteReply {
  id: string
  text: string
  createdAt: string
}

interface PublishedReplayNote {
  id: string
  datasetPath: string
  datasetLabel?: string | null
  comparePath?: string | null
  compareLabel?: string | null
  slotIndex: number
  slotNumber: number
  comparisonSlotIndex?: number | null
  comparisonSlotNumber?: number | null
  paperLens: 'evidence' | 'theory' | 'methods'
  audienceMode: 'reader' | 'reviewer' | 'researcher'
  intent: PublishedReplayNoteIntent
  status: PublishedReplayNoteStatus
  contributionType?: PublishedReplayContributionType | null
  communityLane?: PublishedReplayCommunityLane | null
  annotationScope?: PublishedReplayAnnotationScope | null
  rangeStartSlotIndex?: number | null
  rangeStartSlotNumber?: number | null
  rangeEndSlotIndex?: number | null
  rangeEndSlotNumber?: number | null
  anchorKind?: 'general' | 'region' | 'metric' | 'comparison' | null
  anchorKey?: string | null
  anchorLabel?: string | null
  note: string
  replies: PublishedReplayNoteReply[]
  contextLabel?: string | null
  createdAt: string
}

interface CreatePublishedReplayNoteRequest {
  datasetPath?: string | null
  datasetLabel?: string | null
  comparePath?: string | null
  compareLabel?: string | null
  slotIndex?: number | null
  slotNumber?: number | null
  comparisonSlotIndex?: number | null
  comparisonSlotNumber?: number | null
  paperLens?: 'evidence' | 'theory' | 'methods' | null
  audienceMode?: 'reader' | 'reviewer' | 'researcher' | null
  intent?: PublishedReplayNoteIntent | null
  status?: PublishedReplayNoteStatus | null
  contributionType?: PublishedReplayContributionType | null
  communityLane?: PublishedReplayCommunityLane | null
  annotationScope?: PublishedReplayAnnotationScope | null
  rangeStartSlotIndex?: number | null
  rangeStartSlotNumber?: number | null
  rangeEndSlotIndex?: number | null
  rangeEndSlotNumber?: number | null
  anchorKind?: 'general' | 'region' | 'metric' | 'comparison' | null
  anchorKey?: string | null
  anchorLabel?: string | null
  note?: string | null
  contextLabel?: string | null
}

interface AddPublishedReplayNoteReplyRequest {
  reply?: string | null
}

interface UpdatePublishedReplayNoteStatusRequest {
  status?: PublishedReplayNoteStatus | null
}

interface PublishedReplayCopilotResponse {
  summary: string
  blocks: readonly Block[]
  followUps: string[]
  truthBoundary: {
    label: string
    detail: string
  }
  model: string
  cached: boolean
  provenance: {
    source: 'generated'
    label: string
    detail: string
    canonical: boolean
    datasetPath: string
    comparePath?: string
  }
}

const PUBLISHED_REPLAY_NOTE_INTENTS = new Set<PublishedReplayNoteIntent>([
  'observation',
  'question',
  'theory',
  'methods',
])
const PUBLISHED_REPLAY_NOTE_STATUSES = new Set<PublishedReplayNoteStatus>([
  'open_question',
  'needs_evidence',
  'challenged',
  'supported',
  'author_addressed',
])
const PUBLISHED_REPLAY_CONTRIBUTION_TYPES = new Set<PublishedReplayContributionType>([
  'claim',
  'question',
  'evidence',
  'counterpoint',
  'method_concern',
])
const PUBLISHED_REPLAY_COMMUNITY_LANES = new Set<PublishedReplayCommunityLane>([
  'author',
  'reviewer',
  'community',
])
const PUBLISHED_REPLAY_ANNOTATION_SCOPES = new Set<PublishedReplayAnnotationScope>([
  'exact_slot',
  'time_range',
  'trend',
  'comparison_gap',
  'paper_claim',
  'region_over_time',
])
const PUBLISHED_REPLAY_NOTE_ANCHOR_KINDS = new Set([
  'general',
  'region',
  'metric',
  'comparison',
])
const publishedReplayNotesStore = new Map<string, PublishedReplayNote[]>()
const PERSISTENT_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data')
const PUBLISHED_REPLAY_NOTES_FILE = path.join(PERSISTENT_DATA_DIR, 'published-replay-notes.json')
let publishedReplayNotesPersistPromise: Promise<void> = Promise.resolve()

function defaultPublishedReplayNoteStatus(
  contributionType: PublishedReplayContributionType,
): PublishedReplayNoteStatus {
  if (contributionType === 'question') return 'open_question'
  if (contributionType === 'counterpoint') return 'challenged'
  if (contributionType === 'method_concern') return 'needs_evidence'
  if (contributionType === 'evidence') return 'supported'
  return 'open_question'
}

function defaultPublishedReplayContributionType(
  intent: PublishedReplayNoteIntent,
): PublishedReplayContributionType {
  if (intent === 'question') return 'question'
  if (intent === 'methods') return 'method_concern'
  if (intent === 'theory') return 'claim'
  return 'evidence'
}

function defaultPublishedReplayCommunityLane(
  audienceMode: PublishedReplayNote['audienceMode'],
): PublishedReplayCommunityLane {
  return audienceMode === 'reviewer' ? 'reviewer' : 'community'
}

interface PublishedReplayMetrics {
  readonly clusters?: readonly number[]
  readonly total_distance?: readonly number[]
  readonly avg_nnd?: readonly number[]
  readonly nni?: readonly number[]
  readonly mev?: readonly number[]
  readonly attestations?: readonly number[]
  readonly proposal_times?: readonly number[]
  readonly gini?: readonly number[]
  readonly hhi?: readonly number[]
  readonly liveness?: readonly number[]
  readonly failed_block_proposals?: readonly number[]
}

interface PublishedReplayPayload {
  readonly v?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly cost?: number
  readonly gamma?: number
  readonly description?: string
  readonly n_slots?: number
  readonly metrics?: PublishedReplayMetrics
  readonly sources?: ReadonlyArray<readonly [string, string]>
  readonly slots?: Record<string, ReadonlyArray<readonly [string, number]>>
}

interface PublishedResearchMetadata {
  readonly v?: number
  readonly cost?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly gamma?: number
  readonly description?: string
}

interface PublishedResearchDatasetEntry {
  readonly evaluation: string
  readonly paradigm: 'Local' | 'External'
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
  readonly metadata?: PublishedResearchMetadata
}

interface PublishedResearchCatalog {
  readonly defaultSelection?: {
    readonly evaluation: string
    readonly paradigm: string
    readonly result: string
    readonly path: string
  } | null
  readonly datasets: readonly PublishedResearchDatasetEntry[]
}

interface CreateExplorationRequest {
  query: string
  summary: string
  blocks: unknown[]
  followUps?: unknown[]
  model?: string
  cached?: boolean
  surface?: ExplorationSurface
  anchor?: {
    sectionId?: string
    blockId?: string
    excerpt: string
    viewMode?: string
  }
}

interface PublishExplorationRequest {
  title?: string
  takeaway?: string
  author?: string
}

interface CreateExplorationReplyRequest {
  author?: string
  body?: string
}

interface VoteExplorationReplyRequest {
  delta?: number
}

interface EditorialExplorationRequest {
  verified?: boolean
  featured?: boolean
  editorNote?: string
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

interface CuratedMatch {
  card: TopicCard
  score: number
}

const TOPIC_HINTS: Partial<Record<TopicCard['id'], readonly string[]>> = {
  'ssp-vs-msp': ['ssp', 'msp', 'external', 'local', 'compare', 'comparison', 'paradigm'],
  'geographic-convergence': ['where', 'geographic', 'geography', 'concentrate', 'concentration', 'convergence', 'regions'],
  'source-placement': ['source', 'sources', 'placement', 'relay', 'aligned', 'misaligned', 'latency aligned', 'latency misaligned'],
  'initial-distribution': ['start', 'starting', 'initial', 'begin', 'begins', 'heterogeneous', 'distribution', 'real ethereum'],
  'attestation-threshold': ['attestation', 'threshold', 'gamma'],
  'shorter-slots': ['shorter', 'slot', 'slots', '6s', '6 second', '6-second', 'eip-7782'],
  'metrics-explained': ['metric', 'metrics', 'gini', 'hhi', 'cv', 'lc'],
  limitations: ['limitation', 'limitations', 'caveat', 'caveats', 'assumption', 'assumptions', 'next', 'future'],
}

function tokenize(text: string): string[] {
  const normalized = normalizeQuery(text)
  if (!normalized) return []
  return normalized
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

function overlapScore(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0
  const rightSet = new Set(right)
  let intersection = 0
  for (const token of left) {
    if (rightSet.has(token)) intersection += 1
  }
  return intersection / Math.max(left.length, right.length)
}

function hintScore(query: string, card: TopicCard): number {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return 0

  const hints = TOPIC_HINTS[card.id]
  if (!hints?.length) return 0

  let matches = 0
  for (const hint of hints) {
    const normalizedHint = normalizeQuery(hint)
    if (!normalizedHint) continue
    if (normalizedQuery.includes(normalizedHint)) {
      matches += 1
    }
  }

  if (matches === 0) return 0
  return Math.min(0.36, 0.18 + (matches - 1) * 0.08)
}

function scoreTopicCard(query: string, card: TopicCard): number {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return 0

  const candidates = [card.title, card.description, ...card.prompts]
  const queryTokens = tokenize(query)
  let best = hintScore(query, card)

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeQuery(candidate)
    if (!normalizedCandidate) continue
    if (normalizedCandidate === normalizedQuery) return 1
    if (
      normalizedCandidate.includes(normalizedQuery)
      || normalizedQuery.includes(normalizedCandidate)
    ) {
      best = Math.max(best, 0.9)
    }
    best = Math.max(best, overlapScore(queryTokens, tokenize(candidate)))
  }

  return best
}

function findCuratedMatch(query: string): CuratedMatch | null {
  let best: CuratedMatch | null = null

  for (const card of CURATED_CARDS) {
    const score = scoreTopicCard(query, card)
    const minimumScore = hintScore(query, card) > 0 ? 0.54 : 0.62
    if (score < minimumScore) continue
    if (!best || score > best.score) {
      best = { card, score }
    }
  }

  return best
}

function buildCuratedFollowUps(cardId: string): string[] {
  return TOPIC_CARDS
    .filter(card => card.id !== cardId)
    .slice(0, 3)
    .map(card => card.prompts[0] ?? card.title)
}

function buildCuratedResponse(match: CuratedMatch): ExploreResponse {
  const isOverview = match.card.id === OVERVIEW_CARD.id
  return {
    summary: match.card.title,
    blocks: match.card.blocks,
    followUps: buildCuratedFollowUps(match.card.id),
    model: '',
    cached: false,
    provenance: {
      source: 'curated',
      label: isOverview ? 'Curated overview' : 'Curated topic card',
      detail: isOverview
        ? 'Matched a canonical editorial overview of the paper.'
        : 'Matched a curated paper finding without needing a fresh model call.',
      canonical: true,
      topicId: match.card.id,
      similarityScore: Number(match.score.toFixed(2)),
    },
  }
}

function buildHistoryResponse(match: ReturnType<ExplorationStore['findBestMatch']>): ExploreResponse | null {
  if (!match) return null
  const exact = match.reason === 'exact'
  const publicationLabel = match.exploration.publication.published ? 'Community contribution' : 'Saved reading'
  return {
    summary: match.exploration.summary,
    blocks: match.exploration.blocks,
    followUps: match.exploration.followUps,
    model: match.exploration.model,
    cached: match.exploration.cached,
    provenance: {
      source: 'history',
      label: exact ? publicationLabel : `Matched ${publicationLabel.toLowerCase()}`,
      detail: exact
        ? match.exploration.publication.published
          ? 'Reused an exact published community contribution.'
          : 'Reused an exact saved reading.'
        : match.exploration.publication.published
          ? 'Reused a closely related published community contribution.'
          : 'Reused a closely related saved reading.',
      canonical: false,
      explorationId: match.exploration.id,
      similarityScore: Number(match.score.toFixed(2)),
    },
  }
}

function parseBooleanQueryValue(value: unknown): boolean | undefined {
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function collapseWhitespace(value: string | undefined | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function limitText(value: string | undefined | null, maxChars: number): string {
  const normalized = collapseWhitespace(value)
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.?!:;,]+$/g, '').trim()
}

function normalizeInterpretiveTitle(rawTitle: string | undefined): string {
  const title = limitText(rawTitle, 72)
  if (!title) return 'Guide interpretation'
  if (/^(guide interpretation|interpretation|assistant framing|reading note|direct answer|overview|orientation|what this means|what this |what the |why |why it matters|how to read this|core contrast|start here)/i.test(title)) {
    return title
  }
  return limitText(`Guide interpretation: ${title}`, 72)
}

function qualifyPaperSummary(rawSummary: string | undefined, fallback = ''): string {
  const summary = limitText(rawSummary, 140)
  const safeFallback = limitText(fallback, 140)
  if (!summary) return safeFallback ?? ''
  if (
    /^(paper-backed reading:|from the paper\b|based on the paper\b|what the paper suggests:|answer:|this (paper|project|study|explorer)\b|the (paper|project|study|explorer)\b)/i.test(summary)
    || /\b(shows|suggests|indicates|points to)\b/i.test(summary)
  ) {
    return summary
  }
  return limitText(`Paper-backed reading: ${summary}`, 140) || safeFallback || 'Paper-backed exploration'
}

function isOrientationExploreQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false

  return [
    /\b(project|paper|study|explorer|website|site|app)\b/,
    /\b(what is this|what should i know|tell me more|overview|start here|walk me through|how do i use|how should i use)\b/,
  ].some(pattern => pattern.test(normalized))
}

function buildExploreQueryModeContext(query: string): string {
  if (!isOrientationExploreQuery(query)) return ''
  return '\n\n## Query Mode\nThis is an orientation or onboarding question. Answer directly in plain language. Organize the page around: (1) what the study is about, (2) the main contrast or mechanism, (3) why it matters, and (4) a few concrete next questions or next surfaces. Lead with an insight or comparison block, not raw stats, unless a number materially sharpens the explanation. Do not call query_cached_results for a generic overview prompt unless the user explicitly asks for a figure, metric, scenario, or comparison.'
}

function isPrecomputedResultsExploreQuery(query: string): boolean {
  return /(compare|comparison|versus| vs\b|difference|gini|hhi|liveness|mev|proposal|attestation|gamma|slot|latency|validator|region|geograph|distribution|baseline|local|external|source placement|misaligned|aligned)/i.test(query)
}

function isStructuredResultsQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized || !isPrecomputedResultsExploreQuery(query)) return false

  return [
    /\b(table|tabulate|rows?|dataset|datasets|catalog|leaderboard|rank|ranking|ranked|sorted|sort(?:ed)?(?: by)?|list|sql|query)\b/,
    /\b(top|bottom)\s+\d+\b/,
    /\b(show|give|return)\b.*\b(table|list|rows?)\b/,
  ].some(pattern => pattern.test(normalized))
}

function isSimulationPlanningExploreQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  if (isOrientationExploreQuery(query) || isStructuredResultsQuery(query)) return false

  return [
    /\b(what should i run|what to run|what experiment should i run|how should i test|how do i test)\b/,
    /\b(set up|setup|configure|configuration|preset)\b.*\b(run|experiment|simulation)\b/,
    /\b(run|experiment|simulation)\b.*\b(with|for|to test)\b/,
  ].some(pattern => pattern.test(normalized))
}

function buildExploreResultsModeContext(query: string): string {
  if (!isPrecomputedResultsExploreQuery(query)) return ''
  return '\n\n## Quantitative Mode\nThis question should lean on pre-computed results when possible. Prefer query_cached_results before relying on generic summaries. Use compact stat, comparison, paperChart, chart, table, or map blocks that feel like the study\'s Results surface. When a study-owned paperChart matches the retrieved dataset family, reuse it instead of inventing a bespoke figure. If the retrieved data spans multiple scenarios or parameter settings, summarize the pattern across those variants before zooming into any one case. Treat those study-owned blocks as the skeleton of the answer and add only the minimum interpretation needed to explain them. When the cached data covers only part of the ask, answer that supported slice clearly and mark the rest as interpretation or open follow-up.'
}

function buildExploreStructuredResultsModeContext(query: string): string {
  if (!isStructuredResultsQuery(query)) return ''
  return '\n\n## Structured Results Query Mode\nThis question is asking for a ranked, listed, tabulated, or SQL-style view over the study-owned published Results catalog. Use query_results_table first. Prefer returning a compact chart + table + brief insight block over a prose-only answer. Treat the structured query result as grounded evidence, then call render_blocks to finalize the page if needed.'
}

function buildExploreSimulationPlanningModeContext(query: string): string {
  if (!isSimulationPlanningExploreQuery(query)) return ''
  return '\n\n## Experiment Planning Mode\nThis question is asking what to run, how to encode a bounded test, or which preset to use. Use build_simulation_config first. Return the recommended exact-mode configuration as a compact plan with the proposed config, why it matches the question, and what the user would learn by running it. Do not pretend the simulation has already been executed.'
}

function findStudyWorkflow(workflowId: string | undefined): StudyAssistantWorkflow | null {
  if (!workflowId) return null
  return ACTIVE_STUDY.assistant.workflows?.find(workflow => workflow.id === workflowId) ?? null
}

function resolveWorkflowLaunchContext(
  launch: AskLaunchContext | null | undefined,
): AskLaunchContext | null | undefined {
  if (!launch?.workflowId) return launch
  const workflow = findStudyWorkflow(launch.workflowId)
  if (!workflow) return launch
  const resolvedSelections = resolveWorkflowSelections(workflow, launch.workflowValues, launch.workflowPresetId)
  const structuredQuery = launch.structuredQuery ?? resolveWorkflowStructuredQuery(workflow, resolvedSelections)
  const simulationConfig = launch.simulationConfig ?? resolveWorkflowSimulationConfig(workflow, resolvedSelections)
  if (!launch.routeHint && !structuredQuery && !simulationConfig) return launch

  return {
    ...launch,
    workflowValues: Object.keys(resolvedSelections).length > 0 ? resolvedSelections : launch.workflowValues,
    routeHint: launch.routeHint ?? workflow.routeHint,
    structuredQuery,
    simulationConfig,
  }
}

function buildWorkflowLaunchInputs(
  workflow: StudyAssistantWorkflow | null,
  launch: AskLaunchContext | null | undefined,
): NonNullable<AskPlanData['launch']>['inputs'] | undefined {
  if (!workflow) return undefined

  const inputs: NonNullable<AskPlanData['launch']>['inputs'] = []
  const preset = findWorkflowPreset(workflow, launch?.workflowPresetId)
  if (preset) {
    inputs.push({
      id: 'preset',
      label: 'Preset',
      value: preset.label,
    })
  }

  if (!workflow.fields?.length || !launch?.workflowValues) {
    return inputs.length > 0 ? inputs : undefined
  }

  inputs.push(...workflow.fields.flatMap(field => {
    const rawValue = launch.workflowValues?.[field.id]
    if (!rawValue) return []
    const option = field.options.find(candidate => candidate.value === rawValue)
    return [{
      id: field.id,
      label: field.label,
      value: option?.label ?? rawValue,
    }]
  }))

  return inputs.length > 0 ? inputs : undefined
}

function buildAskLaunchPromptContext(launch: AskLaunchContext | null | undefined): string {
  if (!launch) return ''

  const parts: string[] = ['\n\n## Explicit Launch Context']
  const workflow = findStudyWorkflow(launch.workflowId)

  if (launch.source === 'workflow') {
    parts.push(`This request was launched from the study workflow "${workflow?.title ?? launch.workflowId ?? 'workflow'}".`)
    if (workflow?.description) {
      parts.push(`Workflow intent: ${workflow.description}`)
    }
    const preset = workflow ? findWorkflowPreset(workflow, launch.workflowPresetId) : undefined
    if (preset) {
      parts.push(`Selected preset: ${preset.label}.${preset.description ? ` ${preset.description}` : ''}`)
    }
    const launchInputs = buildWorkflowLaunchInputs(workflow, launch)
    if (launchInputs?.length) {
      parts.push(`Selected workflow inputs: ${launchInputs.map(input => `${input.label} = ${input.value}`).join('; ')}.`)
    }
  } else if (launch.source === 'query-workbench') {
    parts.push('This request was launched from the typed structured-query workbench, not from free-form text alone.')
  }

  if (launch.routeHint) {
    parts.push(`Treat the preferred route as "${launch.routeHint}".`)
  }

  if (launch.structuredQuery) {
    const queryBits = [
      launch.structuredQuery.viewId ? `view ${launch.structuredQuery.viewId}` : '',
      launch.structuredQuery.metrics?.length ? `metrics ${launch.structuredQuery.metrics.join(', ')}` : '',
      launch.structuredQuery.dimensions?.length ? `dimensions ${launch.structuredQuery.dimensions.join(', ')}` : '',
      launch.structuredQuery.slot ? `${launch.structuredQuery.slot} snapshot` : '',
      launch.structuredQuery.orderBy ? `sort by ${launch.structuredQuery.orderBy} ${launch.structuredQuery.order ?? 'desc'}` : '',
      launch.structuredQuery.limit ? `limit ${launch.structuredQuery.limit}` : '',
    ].filter(Boolean)

    if (queryBits.length > 0) {
      parts.push(`Use this structured launch shape unless the user explicitly narrows further: ${queryBits.join('; ')}.`)
    }
  }

  if (launch.simulationConfig) {
    const configBits = [
      launch.simulationConfig.base ? `base ${launch.simulationConfig.base}` : '',
      launch.simulationConfig.preset ? `preset ${launch.simulationConfig.preset}` : '',
      launch.simulationConfig.paradigm ? `paradigm ${launch.simulationConfig.paradigm}` : '',
      launch.simulationConfig.distribution ? `distribution ${launch.simulationConfig.distribution}` : '',
      launch.simulationConfig.sourcePlacement ? `source placement ${launch.simulationConfig.sourcePlacement}` : '',
      typeof launch.simulationConfig.slotTime === 'number' ? `slot time ${launch.simulationConfig.slotTime}s` : '',
      typeof launch.simulationConfig.validators === 'number' ? `validators ${launch.simulationConfig.validators}` : '',
      typeof launch.simulationConfig.slots === 'number' ? `slots ${launch.simulationConfig.slots}` : '',
      typeof launch.simulationConfig.migrationCost === 'number' ? `migration cost ${launch.simulationConfig.migrationCost}` : '',
      typeof launch.simulationConfig.attestationThreshold === 'number' ? `gamma ${launch.simulationConfig.attestationThreshold}` : '',
    ].filter(Boolean)

    if (configBits.length > 0) {
      parts.push(`Use this bounded experiment launch shape unless the user explicitly asks to change it: ${configBits.join('; ')}.`)
    }
  }

  return parts.join('\n')
}

function buildExploreChatSystemPrompt(query: string, sessionContext: string, launch?: AskLaunchContext | null): string {
  return STUDY_CONTEXT
    + sessionContext
    + buildExploreQueryModeContext(query)
    + buildExploreResultsModeContext(query)
    + buildExploreStructuredResultsModeContext(query)
    + buildExploreSimulationPlanningModeContext(query)
    + buildAskLaunchPromptContext(launch)
}

function shouldForceExploreRenderStep(stepNumber: number, toolCalls: readonly { toolName: string }[]): boolean {
  const hasTerminalRender = toolCalls.some(toolCall => toolCall.toolName === 'render_blocks')
  if (hasTerminalRender) return false

  const evidenceCalls = toolCalls.filter(toolCall => toolCall.toolName !== 'search_topic_cards')
  if (stepNumber >= 1 && toolCalls.some(toolCall => toolCall.toolName === 'query_results_table')) return true
  if (stepNumber >= 4) return true
  if (stepNumber >= 3 && evidenceCalls.length > 0) return true
  if (stepNumber >= 2 && toolCalls.some(toolCall => toolCall.toolName === 'query_cached_results')) return true

  return false
}

function stablePriority(type: Block['type']): number {
  switch (type) {
    case 'stat':
      return 0
    case 'comparison':
    case 'chart':
    case 'paperChart':
    case 'timeseries':
    case 'map':
    case 'table':
      return 1
    case 'insight':
      return 2
    case 'caveat':
      return 3
    case 'source':
      return 4
    default:
      return 5
  }
}

function blockSignature(block: Block): string {
  return JSON.stringify(block)
}

function orderBlocksEvidenceFirst(
  blocks: readonly Block[],
  options?: { preserveLeadBlock?: boolean },
): Block[] {
  const normalized = blocks.map((block, index) => ({
    block: block.type === 'insight'
      ? { ...block, title: normalizeInterpretiveTitle(block.title) }
      : block,
    index,
  }))

  const sortEntries = (entries: typeof normalized) =>
    entries
      .toSorted((left, right) => {
        const priorityGap = stablePriority(left.block.type) - stablePriority(right.block.type)
        return priorityGap !== 0 ? priorityGap : left.index - right.index
      })
      .map(entry => entry.block)

  if (
    options?.preserveLeadBlock
    && normalized.length > 0
    && (normalized[0]!.block.type === 'insight' || normalized[0]!.block.type === 'comparison')
  ) {
    const [lead, ...rest] = normalized
    return [lead.block, ...sortEntries(rest)]
  }

  return sortEntries(normalized)
}

function normalizeGeneratedBlock(block: Block): Block | null {
  switch (block.type) {
    case 'stat': {
      const value = limitText(block.value, 24)
      const label = limitText(block.label, 54)
      if (!value || !label) return null
      return {
        ...block,
        value,
        label,
        sublabel: limitText(block.sublabel, 96) || undefined,
        delta: limitText(block.delta, 56) || undefined,
      }
    }
    case 'insight': {
      const text = limitText(block.text, 380)
      if (!text) return null
      return {
        ...block,
        title: normalizeInterpretiveTitle(block.title),
        text,
      }
    }
    case 'comparison': {
      const leftItems = block.left.items
        .map(item => ({
          key: limitText(item.key, 32),
          value: limitText(item.value, 52),
        }))
        .filter(item => item.key && item.value)
        .slice(0, 6)
      const rightItems = block.right.items
        .map(item => ({
          key: limitText(item.key, 32),
          value: limitText(item.value, 52),
        }))
        .filter(item => item.key && item.value)
        .slice(0, 6)
      if (leftItems.length === 0 || rightItems.length === 0) return null
      return {
        ...block,
        title: limitText(block.title, 72),
        left: {
          ...block.left,
          label: limitText(block.left.label, 36),
          items: leftItems,
        },
        right: {
          ...block.right,
          label: limitText(block.right.label, 36),
          items: rightItems,
        },
        verdict: limitText(block.verdict, 180) || undefined,
      }
    }
    case 'chart': {
      const data = block.data
        .map(entry => ({
          ...entry,
          label: limitText(entry.label, 30),
          category: limitText(entry.category, 24) || undefined,
        }))
        .filter(entry => entry.label)
        .slice(0, 8)
      if (data.length === 0) return null
      return {
        ...block,
        title: limitText(block.title, 72),
        data,
        unit: limitText(block.unit, 12) || undefined,
      }
    }
    case 'paperChart': {
      const title = limitText(block.title, 72)
      const dataKey = limitText(block.dataKey, 64)
      if (!title || !dataKey || !ACTIVE_STUDY.paperCharts[dataKey]) return null
      return {
        ...block,
        title,
        dataKey,
      }
    }
    case 'table': {
      const headers = block.headers.map(header => limitText(header, 28)).filter(Boolean).slice(0, 6)
      const rows = block.rows
        .slice(0, 8)
        .map(row => row.slice(0, headers.length || 6).map(cell => limitText(cell, 42)))
        .filter(row => row.length > 0)
      if (headers.length === 0 || rows.length === 0) return null
      return {
        ...block,
        title: limitText(block.title, 72),
        headers,
        rows,
        highlight: block.highlight?.filter(index => index >= 0 && index < rows.length).slice(0, 3),
      }
    }
    case 'caveat': {
      const text = limitText(block.text, 240)
      return text ? { ...block, text } : null
    }
    case 'source': {
      const refs = block.refs
        .map(ref => ({
          label: limitText(ref.label, 64),
          section: limitText(ref.section, 40) || undefined,
          url: limitText(ref.url, 200) || undefined,
        }))
        .filter(ref => ref.label)
        .filter((ref, index, all) =>
          all.findIndex(candidate =>
            candidate.label === ref.label
            && candidate.section === ref.section
            && candidate.url === ref.url,
          ) === index,
        )
        .slice(0, 4)
      return refs.length > 0 ? { ...block, refs } : null
    }
    case 'map': {
      const regions = block.regions
        .map(region => ({
          ...region,
          name: limitText(region.name, 32),
          label: limitText(region.label, 28) || undefined,
        }))
        .filter(region => region.name)
        .toSorted((left, right) => right.value - left.value)
        .slice(0, 12)
      return regions.length >= 2
        ? {
            ...block,
            title: limitText(block.title, 72),
            regions,
          }
        : null
    }
    case 'timeseries': {
      const series = block.series
        .map(item => ({
          ...item,
          label: limitText(item.label, 32),
          data: item.data.slice(0, 16),
          color: limitText(item.color, 16) || undefined,
        }))
        .filter(item => item.label && item.data.length > 0)
        .slice(0, 4)
      if (series.length === 0) return null
      return {
        ...block,
        title: limitText(block.title, 72),
        series,
        xLabel: limitText(block.xLabel, 24) || undefined,
        yLabel: limitText(block.yLabel, 24) || undefined,
        annotations: block.annotations
          ?.map(annotation => ({
            ...annotation,
            label: limitText(annotation.label, 28),
          }))
          .filter(annotation => annotation.label)
          .slice(0, 4),
      }
    }
    default:
      return block
  }
}

function normalizeGeneratedSummary(
  rawSummary: string | undefined,
  query: string,
  blocks: readonly Block[],
): string {
  const summary = qualifyPaperSummary(rawSummary, '')
  if (summary) return summary

  const firstInsight = blocks.find((block): block is Extract<Block, { type: 'insight' }> => block.type === 'insight')
  if (firstInsight?.title) {
    return qualifyPaperSummary(firstInsight.title, '')
  }

  return qualifyPaperSummary(undefined, trimTrailingPunctuation(query))
}

function fallbackFollowUps(query: string): string[] {
  const fromTopics = findTopicMatches(query, 4)
    .flatMap(match => match.prompts)
    .filter(prompt => normalizeQuery(prompt) !== normalizeQuery(query))

  const fromCoverage = suggestUnderexploredTopics(query, 3).map(topic => topic.suggestedQuery)
  const combined = [...fromTopics, ...fromCoverage]
  const unique: string[] = []

  for (const prompt of combined) {
    const cleaned = limitText(prompt, 110)
    if (!cleaned) continue
    if (unique.some(existing => normalizeQuery(existing) === normalizeQuery(cleaned))) continue
    unique.push(cleaned)
    if (unique.length >= MAX_GENERATED_FOLLOW_UPS) break
  }

  return unique
}

function normalizeGeneratedFollowUps(
  query: string,
  rawFollowUps: readonly string[] | undefined,
): string[] {
  const normalized: string[] = []
  for (const followUp of rawFollowUps ?? []) {
    const cleaned = limitText(followUp, 110)
    if (!cleaned) continue
    if (normalizeQuery(cleaned) === normalizeQuery(query)) continue
    if (normalized.some(existing => normalizeQuery(existing) === normalizeQuery(cleaned))) continue
    normalized.push(cleaned)
    if (normalized.length >= MAX_GENERATED_FOLLOW_UPS) break
  }

  if (normalized.length >= 2) return normalized

  for (const fallback of fallbackFollowUps(query)) {
    if (normalized.some(existing => normalizeQuery(existing) === normalizeQuery(fallback))) continue
    normalized.push(fallback)
    if (normalized.length >= MAX_GENERATED_FOLLOW_UPS) break
  }

  return normalized
}

function coerceGeneratedText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function coerceGeneratedStringRow(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => coerceGeneratedText(entry)?.trim() ?? '')
    .filter(Boolean)
}

function coerceGeneratedBlockShape(rawBlock: unknown): unknown {
  if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return rawBlock

  const block = rawBlock as Record<string, unknown>
  switch (block.type) {
    case 'stat':
      return {
        type: 'stat',
        value: coerceGeneratedText(block.value),
        label: coerceGeneratedText(block.label ?? block.title),
        sublabel: coerceGeneratedText(block.sublabel ?? block.subtitle),
        delta: coerceGeneratedText(block.delta),
        sentiment: block.sentiment,
      }
    case 'insight':
      return {
        type: 'insight',
        title: coerceGeneratedText(block.title),
        text: coerceGeneratedText(block.text ?? block.content),
        emphasis: block.emphasis,
      }
    case 'paperChart':
      return {
        type: 'paperChart',
        title: coerceGeneratedText(block.title),
        dataKey: coerceGeneratedText(block.dataKey ?? block.data_key ?? block.key),
        cite: block.cite,
      }
    case 'caveat': {
      const title = coerceGeneratedText(block.title)?.trim()
      const text = coerceGeneratedText(block.text ?? block.content ?? block.detail)?.trim()
      return {
        type: 'caveat',
        text: title && text ? `${title}: ${text}` : title ?? text,
      }
    }
    case 'comparison': {
      const rows = Array.isArray(block.data)
        ? block.data.map(row => coerceGeneratedStringRow(row)).filter(row => row.length > 0)
        : []
      const comparisonItems = Array.isArray(block.items)
        ? block.items
          .map(item => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null
            const entry = item as Record<string, unknown>
            const objectValues = entry.values && typeof entry.values === 'object' && !Array.isArray(entry.values)
              ? Object.entries(entry.values as Record<string, unknown>)
                  .map(([key, value]) => ({
                    key,
                    value: coerceGeneratedText(value),
                  }))
                  .filter((value): value is { key: string; value: string } => Boolean(value.value))
              : []
            const description = coerceGeneratedText(entry.description)
            const summaryValue = coerceGeneratedText(entry.value)
            const values = objectValues.length > 0
              ? objectValues
              : [
                  description ? { key: 'Mechanism', value: description } : null,
                  summaryValue ? { key: 'Takeaway', value: summaryValue } : null,
                ].filter((value): value is { key: string; value: string } => value !== null)
            if (values.length === 0) return null
            return {
              label: coerceGeneratedText(entry.label) ?? 'Comparison',
              items: values,
            }
          })
          .filter((item): item is { label: string; items: Array<{ key: string; value: string }> } => item !== null)
        : []

      if (rows.length >= 2) {
        const [headers, ...bodyRows] = rows
        if (headers.length >= 2 && bodyRows.length > 0) {
          return {
            type: 'table',
            title: coerceGeneratedText(block.title) ?? 'Comparison',
            headers,
            rows: bodyRows,
          }
        }
      }

      if (comparisonItems.length >= 2) {
        return {
          type: 'comparison',
          title: coerceGeneratedText(block.title),
          left: comparisonItems[0],
          right: comparisonItems[1],
          verdict: coerceGeneratedText(block.verdict ?? block.summary),
        }
      }

      return {
        type: 'comparison',
        title: coerceGeneratedText(block.title),
        left: block.left,
        right: block.right,
        verdict: coerceGeneratedText(block.verdict),
      }
    }
    default:
      return rawBlock
  }
}

function normalizeGeneratedBlocks(
  rawBlocks: unknown[] | undefined,
  options?: { preserveLeadBlock?: boolean },
): Block[] {
  const normalized = parseBlocks((rawBlocks ?? []).map(coerceGeneratedBlockShape))
    .map(normalizeGeneratedBlock)
    .filter((block): block is Block => block !== null)

  const deduped = normalized.filter((block, index, all) =>
    all.findIndex(candidate => blockSignature(candidate) === blockSignature(block)) === index,
  )

  const ordered = orderBlocksEvidenceFirst(deduped, options)

  const hasInsight = ordered.some(block => block.type === 'insight' || block.type === 'comparison')
  const hasSource = ordered.some(block => block.type === 'source')
  const hasCaveat = ordered.some(block => block.type === 'caveat')
  const polished = [...ordered]

  if (polished.length === 0) {
    return [
      {
        type: 'insight',
        emphasis: 'normal',
        title: 'Paper-backed note',
        text: DEFAULT_GENERATED_FALLBACK_TEXT,
      },
      DEFAULT_GENERATED_CAVEAT_BLOCK,
      DEFAULT_GENERATED_SOURCE_BLOCK,
    ]
  }

  if (!hasInsight && polished.length > 0 && polished.length < MAX_GENERATED_BLOCKS) {
    polished.splice(Math.min(1, polished.length), 0, {
      type: 'insight',
      emphasis: 'normal',
      title: 'Assistant framing',
      text: 'This composition is a compact guide to the supplied evidence. Treat the underlying paper context, artifact labels, and exact outputs as primary.',
    })
  }

  if (!hasCaveat && polished.length < MAX_GENERATED_BLOCKS) {
    polished.push(DEFAULT_GENERATED_CAVEAT_BLOCK)
  }

  if (!hasSource && polished.length < MAX_GENERATED_BLOCKS) {
    polished.push(DEFAULT_GENERATED_SOURCE_BLOCK)
  }

  return polished.slice(0, MAX_GENERATED_BLOCKS)
}

function buildGeneratedExploreResponse(
  query: string,
  input: {
    summary?: string
    blocks?: unknown[]
    follow_ups?: readonly string[]
  },
  options?: {
    model?: string
    cached?: boolean
    preserveLeadBlock?: boolean
    canonicalBlocks?: readonly Block[]
  },
): ExploreResponse {
  const canonicalBlocks = [...(options?.canonicalBlocks ?? [])]
  const seededBlocks = [
    ...canonicalBlocks,
    ...(input.blocks ?? []),
  ]
  const hasPaperChartSeed = seededBlocks.some(block =>
    Boolean(block)
    && typeof block === 'object'
    && !Array.isArray(block)
    && (block as { type?: unknown }).type === 'paperChart',
  )
  const normalizedBlocks = normalizeGeneratedBlocks([
    ...(hasPaperChartSeed ? [] : buildQueryPaperChartFallbackBlocks(query)),
    ...seededBlocks,
  ], {
    preserveLeadBlock: options?.preserveLeadBlock ?? isOrientationExploreQuery(query),
  })
  const finalizedBlocks = canonicalBlocks.length > 0 && isPrecomputedResultsExploreQuery(query)
    ? mergeCanonicalExploreBlocks(query, input.summary, canonicalBlocks, normalizedBlocks)
    : ensurePaperChartBlock(
        normalizedBlocks,
        resolvePreferredPaperChartBlock(query, canonicalBlocks),
      )
  const normalizedSummary = normalizeGeneratedSummary(input.summary, query, finalizedBlocks)
  const normalizedFollowUps = normalizeGeneratedFollowUps(query, input.follow_ups)

  const result: ExploreResponse = {
    summary: normalizedSummary,
    blocks: finalizedBlocks,
    followUps: normalizedFollowUps,
    model: options?.model ?? anthropicModel,
    cached: options?.cached ?? false,
    provenance: {
      source: 'generated',
      label: 'Fresh interpretation',
      detail: 'Generated a new structured reading from the study context and the current question.',
      canonical: false,
    },
  }

  const savedExploration = explorationStore.save({
    query,
    summary: result.summary,
    blocks: result.blocks,
    followUps: result.followUps,
    model: result.model,
    cached: result.cached,
  })

  result.provenance.explorationId = savedExploration.id
  return result
}

function buildLiveArtifactSummary(
  query: string,
  canonicalBlocks: readonly Block[],
): string {
  const templates = resolveStudyResultsTemplatesForBlocks(query, canonicalBlocks)
  if (templates.length > 1 && isPrecomputedResultsExploreQuery(query)) {
    return `Cross-family Results comparison: ${templates.map(template => template.title).join(' + ')}`
  }

  const [template] = templates
  if (template && isPrecomputedResultsExploreQuery(query)) {
    return `${template.title}: ${template.summary}`
  }

  if (canonicalBlocks.some(block => block.type === 'paperChart' || block.type === 'chart')) {
    return isPrecomputedResultsExploreQuery(query)
      ? 'Pre-computed results loaded. Organizing the page around the retrieved scenarios and figures.'
      : 'Grounded evidence loaded. Organizing the page.'
  }

  if (canonicalBlocks.some(block => block.type === 'comparison' || block.type === 'table')) {
    return 'Grounded comparison evidence loaded. Organizing the answer around the retrieved material.'
  }

  return 'Grounded evidence loaded. Organizing the page.'
}

function buildExploreArtifactData(
  status: AskArtifactData['status'],
  stage: string,
  response: ExploreResponse,
): AskArtifactData {
  return {
    status,
    stage,
    response: {
      summary: response.summary,
      blocks: response.blocks,
      followUps: response.followUps,
      model: response.model,
      cached: response.cached,
      provenance: response.provenance,
    },
  }
}

function buildLiveExploreArtifact(
  query: string,
  canonicalBlocks: readonly Block[],
  stage: string,
): AskArtifactData | null {
  if (canonicalBlocks.length === 0) return null

  return buildExploreArtifactData(
    'streaming',
    stage,
    {
      summary: buildLiveArtifactSummary(query, canonicalBlocks),
      blocks: [...canonicalBlocks],
      followUps: [],
      model: anthropicModel,
      cached: false,
      provenance: {
        source: 'generated',
        label: 'Live artifact',
        detail: 'Streaming a provisional page scaffold from retrieved evidence.',
        canonical: false,
      },
    },
  )
}

function normalizeSimulationPrompts(
  question: string,
  rawPrompts: readonly string[] | undefined,
  fallbacks: readonly string[],
): string[] {
  const normalized: string[] = []

  for (const prompt of rawPrompts ?? []) {
    const cleaned = limitText(prompt, 110)
    if (!cleaned) continue
    if (normalizeQuery(cleaned) === normalizeQuery(question)) continue
    if (normalized.some(existing => normalizeQuery(existing) === normalizeQuery(cleaned))) continue
    normalized.push(cleaned)
    if (normalized.length >= 4) break
  }

  for (const prompt of fallbacks) {
    const cleaned = limitText(prompt, 110)
    if (!cleaned) continue
    if (normalized.some(existing => normalizeQuery(existing) === normalizeQuery(cleaned))) continue
    normalized.push(cleaned)
    if (normalized.length >= 4) break
  }

  return normalized
}

function findTopicMatches(query: string, limit = 5): Array<{
  id: string
  title: string
  description: string
  prompts: readonly string[]
  score: number
}> {
  const normalizedQuery = normalizeQuery(query)
  const pool = normalizedQuery ? CURATED_CARDS : ALL_EXPLORATION_TOPICS

  return pool
    .map(card => ({
      id: card.id,
      title: card.title,
      description: card.description,
      prompts: card.prompts,
      score: normalizedQuery ? scoreTopicCard(query, card) : 1,
    }))
    .filter(entry => !normalizedQuery || entry.score >= 0.22)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
}

function getTopicCardById(id: string): TopicCard | null {
  return CURATED_CARDS.find(card => card.id === id) ?? null
}

function explorationCoverageForCard(card: TopicCard): number {
  const cardTokens = tokenize(`${card.title} ${card.description} ${card.prompts.join(' ')}`)
  if (cardTokens.length === 0) return 0

  let matches = 0
  for (const exploration of explorationStore.list({ limit: 500, surface: 'reading' })) {
    const explorationTokens = tokenize(`${exploration.query} ${exploration.summary}`)
    if (overlapScore(cardTokens, explorationTokens) >= 0.22) {
      matches += 1
    }
  }
  return matches
}

function suggestUnderexploredTopics(query: string | undefined, limit = 3) {
  const queryTokens = query ? tokenize(query) : []

  return ALL_EXPLORATION_TOPICS
    .map(card => {
      const coverage = explorationCoverageForCard(card)
      const relevance = queryTokens.length === 0
        ? 0
        : overlapScore(queryTokens, tokenize(`${card.title} ${card.description} ${card.prompts.join(' ')}`))
      return {
        id: card.id,
        title: card.title,
        description: card.description,
        suggestedQuery: card.prompts[0] ?? card.title,
        explorationCount: coverage,
        relevance,
      }
    })
    .toSorted((left, right) => {
      if (right.relevance !== left.relevance) return right.relevance - left.relevance
      if (left.explorationCount !== right.explorationCount) return left.explorationCount - right.explorationCount
      return left.title.localeCompare(right.title)
    })
    .slice(0, Math.max(1, limit))
    .map(entry => ({
      ...entry,
      reason: entry.explorationCount === 0
        ? 'No closely matching public explorations yet.'
        : `${entry.explorationCount} closely matching public exploration${entry.explorationCount === 1 ? '' : 's'} so far.`,
    }))
}

function attestationCutoffMs(slotTime: number): number {
  if (slotTime === 6) return 3000
  if (slotTime === 8) return 4000
  return 4000
}

function paperScenarioLabels(config: SimulationRequest): string[] {
  const labels: string[] = []

  if (config.distribution === 'heterogeneous' && config.sourcePlacement !== 'homogeneous') {
    labels.push('Reference: EXP 3 joint heterogeneity')
  } else if (config.distribution === 'heterogeneous') {
    labels.push('Reference: EXP 2 heterogeneous validators')
  } else if (config.distribution === 'homogeneous-gcp') {
    labels.push('Equal per-GCP validator start')
  } else if (config.sourcePlacement === 'latency-aligned') {
    labels.push('Reference: EXP 1 latency-aligned sources')
  } else if (config.sourcePlacement === 'latency-misaligned') {
    labels.push('Reference: EXP 1 latency-misaligned sources')
  } else {
    labels.push('Reference: baseline geography/source setup')
  }

  if (config.slotTime === 6) {
    labels.push('Reference: EXP 4b shorter slots')
  } else if (Math.abs(config.attestationThreshold - 2 / 3) > 0.01) {
    labels.push('Reference: EXP 4a gamma variation')
  }

  labels.push(config.paradigm === 'SSP' ? 'External exact mode' : 'Local exact mode')
  return labels
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function buildSimulationConfig(input: Record<string, unknown>) {
  const presetName = typeof input.preset === 'string' ? input.preset : null
  const preset = presetName ? SIMULATION_PRESETS[presetName as keyof typeof SIMULATION_PRESETS] : undefined
  const base = input.base === 'paper-reference' || input.paperReference === true
    ? 'paper-reference'
    : 'default'

  const candidate = {
    ...DEFAULT_SIMULATION_CONFIG,
    ...(base === 'paper-reference' ? PAPER_REFERENCE_OVERRIDES : {}),
    ...(preset ?? {}),
  } satisfies SimulationRequest

  const paradigm = input.paradigm
  if (paradigm === 'SSP' || paradigm === 'MSP') {
    candidate.paradigm = paradigm
  }

  const distribution = input.distribution
  if (
    distribution === 'homogeneous'
    || distribution === 'homogeneous-gcp'
    || distribution === 'heterogeneous'
    || distribution === 'random'
  ) {
    candidate.distribution = distribution
  } else if (distribution === 'uniform') {
    candidate.distribution = 'homogeneous-gcp'
  }

  const sourcePlacement = input.sourcePlacement
  if (
    sourcePlacement === 'homogeneous'
    || sourcePlacement === 'latency-aligned'
    || sourcePlacement === 'latency-misaligned'
  ) {
    candidate.sourcePlacement = sourcePlacement
  }

  const validators = coerceNumber(input.validators)
  if (validators !== undefined) candidate.validators = validators

  const slots = coerceNumber(input.slots)
  if (slots !== undefined) candidate.slots = slots

  const migrationCost = coerceNumber(input.migrationCost)
  if (migrationCost !== undefined) candidate.migrationCost = migrationCost

  const attestationThreshold = coerceNumber(input.attestationThreshold)
  if (attestationThreshold !== undefined) candidate.attestationThreshold = attestationThreshold

  const slotTime = coerceNumber(input.slotTime)
  if (slotTime !== undefined) candidate.slotTime = slotTime

  const seed = coerceNumber(input.seed)
  if (seed !== undefined) candidate.seed = seed

  const parsed = parseSimulationRequest(candidate)
  if (!parsed) {
    return {
      valid: false,
      error: 'The requested config is outside the exact-mode bounds.',
      defaults: DEFAULT_SIMULATION_CONFIG,
      presets: Object.keys(SIMULATION_PRESETS),
      bounds: {
        validators: '1-1000',
        slots: '1-10000',
        migrationCost: '0-0.02 ETH',
        attestationThreshold: '0 < gamma < 1',
        slotTime: [6, 8, 12],
      },
    }
  }

  return {
    valid: true,
    exactMode: true,
    base,
    config: parsed,
    preset: presetName,
    attestationCutoffMs: attestationCutoffMs(parsed.slotTime),
    scenarioLabels: paperScenarioLabels(parsed),
    notes: [
      base === 'paper-reference'
        ? "This plan starts from the study's paper-reference defaults before applying your selected overrides."
        : 'This plan starts from the exact-mode defaults before applying your selected overrides.',
      'Named study presets use the paper-style 10,000-slot and 0.002 ETH reference setup unless you override fields.',
      'It composes a run configuration only; it does not execute the simulation.',
      'Scenario labels are paper references for orientation, not standalone evidence.',
    ],
  }
}

function buildSimulationConfigArtifact(
  result: unknown,
): {
  readonly summary: string
  readonly description: string
  readonly blocks: readonly Block[]
  readonly followUps: readonly string[]
} | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const candidate = result as Record<string, unknown>

  if (candidate.valid !== true || !candidate.config || typeof candidate.config !== 'object' || Array.isArray(candidate.config)) {
    const error = typeof candidate.error === 'string'
      ? candidate.error
      : 'The requested configuration is outside the exact-mode bounds.'
    return {
      summary: 'Suggested run is outside exact bounds',
      description: error,
      blocks: [{
        type: 'caveat',
        text: error,
      }],
      followUps: [
        'Ask for a smaller or more paper-like variant of this run.',
        'Ask which single parameter to change first and why.',
      ],
    }
  }

  const config = candidate.config as Record<string, unknown>
  const configRows = [
    ['Paradigm', String(config.paradigm ?? 'N/A')],
    ['Validators', typeof config.validators === 'number' ? formatMetricNumber(config.validators, 0) : 'N/A'],
    ['Slots', typeof config.slots === 'number' ? formatMetricNumber(config.slots, 0) : 'N/A'],
    ['Distribution', typeof config.distribution === 'string' ? config.distribution : 'N/A'],
    ['Source placement', typeof config.sourcePlacement === 'string' ? config.sourcePlacement : 'N/A'],
    ['Migration cost', typeof config.migrationCost === 'number' ? formatMetricNumber(config.migrationCost, 4) : 'N/A'],
    ['Gamma', typeof config.attestationThreshold === 'number' ? formatMetricNumber(config.attestationThreshold, 4) : 'N/A'],
    ['Slot time', typeof config.slotTime === 'number' ? `${formatMetricNumber(config.slotTime, 0)}s` : 'N/A'],
    ['Seed', typeof config.seed === 'number' ? formatMetricNumber(config.seed, 0) : 'N/A'],
  ]
  const scenarioLabels = Array.isArray(candidate.scenarioLabels)
    ? candidate.scenarioLabels.filter((label): label is string => typeof label === 'string')
    : []
  const notes = Array.isArray(candidate.notes)
    ? candidate.notes.filter((note): note is string => typeof note === 'string')
    : []
  const configSummary = [
    typeof config.paradigm === 'string'
      ? `${config.paradigm === 'SSP' ? 'External' : 'Local'} block building`
      : null,
    typeof config.slotTime === 'number' ? `${formatMetricNumber(config.slotTime, 0)}s slots` : null,
    typeof config.sourcePlacement === 'string' ? `${config.sourcePlacement} sources` : null,
  ].filter((part): part is string => part !== null)

  return {
    summary: configSummary.length > 0
      ? `Suggested exact run: ${configSummary.join(' · ')}`
      : 'Suggested exact run',
    description: 'A bounded exact-mode configuration is ready to inspect or run next.',
    blocks: [
      {
        type: 'insight',
        title: 'Recommended bounded run',
        text: scenarioLabels.length > 0
          ? `This config is closest to ${scenarioLabels.join(', ')} and stays inside the paper-style exact-mode bounds.`
          : 'This config stays inside the paper-style exact-mode bounds and is ready for an exact run.',
      },
      {
        type: 'table',
        title: 'Exact simulation config',
        headers: ['Field', 'Value'],
        rows: configRows,
      },
      ...(notes.length > 0 ? [{
        type: 'caveat' as const,
        text: notes.join(' '),
      }] : []),
    ],
    followUps: [
      'Explain what this run would test before I execute it.',
      'Tighten this to the smallest single-parameter change from the paper baseline.',
    ],
  }
}

function formatMetricNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)
}

function defaultSimulationPrompts(manifest: { config: SimulationRequest } | null): string[] {
  if (!manifest) {
    return [
      'Set up the paper baseline external run (10,000 slots, 0.002 ETH).',
      'Mirror that paper baseline for local block building so I can compare paradigms.',
      'Hold the paradigm fixed and switch from latency-aligned to latency-misaligned sources.',
      'Load the real Ethereum validator start and explain what should change.',
    ]
  }

  return [
    'Build a core outcomes overview from this exact run.',
    'Explain which regions dominate in this run and why.',
    'What is the nearest paper-backed follow-up to run next?',
  ]
}

function buildTruthBoundary(
  mode: SimulationViewSpec['mode'],
  hasManifest: boolean,
): { label: string; detail: string } {
  if (mode === 'proposed-run') {
    return {
      label: 'Proposal, not a result',
      detail: 'This response suggests a bounded exact run configuration. It is not simulation evidence until the exact engine executes it.',
    }
  }

  if (mode === 'guidance' || !hasManifest) {
    return {
      label: 'Guide interpretation, not evidence',
      detail: 'This response is guidance about the supported model surface. It should not be read as an exact simulation result.',
    }
  }

  return {
    label: 'Assistant framing over exact outputs',
    detail: 'The numbers and charts come from the exact manifest and artifacts for the loaded run. The ordering, emphasis, and narrative are secondary model framing.',
  }
}

function isWithinDirectory(directoryPath: string, candidatePath: string): boolean {
  const relative = path.relative(directoryPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function sourceRoleLabel(sourceRole: string | null | undefined): string {
  if (sourceRole === 'signal') return 'signal sources'
  if (sourceRole === 'supplier') return 'supplier sources'
  return 'information sources'
}

function toPublishedResultsRelativePath(candidatePath: string): string {
  if (!ACTIVE_PUBLISHED_RESULTS_BASE_DIR) {
    return candidatePath.replace(/\\/g, '/')
  }
  return path.relative(ACTIVE_PUBLISHED_RESULTS_BASE_DIR, candidatePath).replace(/\\/g, '/')
}

function normalizePublishedDatasetPath(rawPath: string | null | undefined): string | null {
  const trimmed = rawPath?.trim().replace(/\\/g, '/')
  if (!trimmed || !ACTIVE_PUBLISHED_RESULTS_BASE_DIR) return null
  const resolved = path.resolve(ACTIVE_PUBLISHED_RESULTS_BASE_DIR, trimmed)
  if (!isWithinDirectory(ACTIVE_PUBLISHED_RESULTS_BASE_DIR, resolved)) return null
  return existsSync(resolved) ? resolved : null
}

async function loadPublishedResearchCatalog(): Promise<PublishedResearchCatalog | null> {
  if (publishedResearchCatalogCache) {
    return publishedResearchCatalogCache
  }
  if (!ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH || !existsSync(ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH)) {
    return null
  }

  const raw = await fs.readFile(ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH, 'utf8')
  const sandbox = { window: {} as { RESEARCH_CATALOG?: PublishedResearchCatalog } }
  runInNewContext(raw, sandbox, { filename: ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH })
  publishedResearchCatalogCache = sandbox.window.RESEARCH_CATALOG ?? null
  return publishedResearchCatalogCache
}

async function loadPublishedReplayPayload(datasetPath: string): Promise<PublishedReplayPayload> {
  const cacheKey = path.resolve(datasetPath)
  const cached = publishedReplayDatasetCache.get(cacheKey)
  if (cached) return cached

  const raw = await fs.readFile(cacheKey, 'utf8')
  const parsed = JSON.parse(raw) as PublishedReplayPayload
  publishedReplayDatasetCache.set(cacheKey, parsed)
  return parsed
}

function totalPublishedSlots(payload: PublishedReplayPayload): number {
  return Math.max(
    1,
    payload.n_slots ?? 0,
    payload.metrics?.gini?.length ?? 0,
    payload.metrics?.hhi?.length ?? 0,
    payload.metrics?.liveness?.length ?? 0,
    payload.metrics?.mev?.length ?? 0,
    payload.metrics?.proposal_times?.length ?? 0,
    payload.metrics?.failed_block_proposals?.length ?? 0,
    Object.keys(payload.slots ?? {}).length,
  )
}

function clampPublishedSlot(slot: number | null | undefined, payload: PublishedReplayPayload): number {
  const lastSlot = Math.max(0, totalPublishedSlots(payload) - 1)
  if (typeof slot !== 'number' || !Number.isFinite(slot)) return lastSlot
  return Math.max(0, Math.min(Math.trunc(slot), lastSlot))
}

function readPublishedMetricValue(
  series: readonly number[] | undefined,
  slot: number,
): number | null {
  if (!series?.length) return null
  const clampedIndex = Math.max(0, Math.min(slot, series.length - 1))
  const value = series[clampedIndex]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatPublishedMetricValue(
  key: keyof PublishedReplayMetrics,
  value: number | null,
): string {
  if (value == null) return 'N/A'

  switch (key) {
    case 'mev':
      return `${formatMetricNumber(value, 4)} ETH`
    case 'proposal_times':
      return `${formatMetricNumber(value, 1)} ms`
    case 'gini':
    case 'hhi':
    case 'nni':
    case 'avg_nnd':
      return formatMetricNumber(value, 4)
    case 'attestations':
    case 'liveness':
    case 'clusters':
    case 'failed_block_proposals':
      return formatMetricNumber(value, 0)
    case 'total_distance':
      return formatMetricNumber(value, 2)
    default:
      return formatMetricNumber(value, 4)
  }
}

function publishedMetricLabel(key: keyof PublishedReplayMetrics): string {
  switch (key) {
    case 'clusters':
      return 'clusters'
    case 'total_distance':
      return 'total distance'
    case 'avg_nnd':
      return 'average nearest-neighbor distance'
    case 'nni':
      return 'nearest-neighbor index'
    case 'mev':
      return 'average MEV'
    case 'attestations':
      return 'attestations'
    case 'proposal_times':
      return 'proposal time'
    case 'gini':
      return 'gini'
    case 'hhi':
      return 'HHI'
    case 'liveness':
      return 'liveness'
    case 'failed_block_proposals':
      return 'failed block proposals'
    default:
      return key
  }
}

function summarizePublishedSeries(
  key: keyof PublishedReplayMetrics,
  series: readonly number[] | undefined,
): string | null {
  if (!series?.length) return null

  const numeric = series.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) return null

  const first = numeric[0] ?? null
  const mid = numeric[Math.floor((numeric.length - 1) / 2)] ?? null
  const last = numeric[numeric.length - 1] ?? null
  const min = Math.min(...numeric)
  const max = Math.max(...numeric)

  return `- ${publishedMetricLabel(key)}: start=${formatPublishedMetricValue(key, first)}, mid=${formatPublishedMetricValue(key, mid)}, final=${formatPublishedMetricValue(key, last)}, min=${formatPublishedMetricValue(key, min)}, max=${formatPublishedMetricValue(key, max)}`
}

function readPublishedSlotRegions(
  payload: PublishedReplayPayload,
  slot: number,
): Array<{
  readonly regionId: string
  readonly count: number
  readonly city: string | null
  readonly macroRegion: string
}> {
  const entries = payload.slots?.[String(slot)] ?? []
  return entries
    .map(([regionId, count]) => {
      const region = publishedRegionLookup.get(regionId)
      return {
        regionId,
        count: Number(count) || 0,
        city: region?.city ?? null,
        macroRegion: region?.macroRegion ?? 'Unknown',
      }
    })
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count)
}

function summarizePublishedRegions(
  regions: ReadonlyArray<{
    readonly regionId: string
    readonly count: number
    readonly city: string | null
  }>,
): string {
  if (regions.length === 0) return 'no active regions'
  return regions
    .slice(0, 5)
    .map(region => `${region.city ?? region.regionId} (${region.regionId})=${region.count}`)
    .join(', ')
}

function summarizePublishedSourceFootprint(
  payload: PublishedReplayPayload,
): string | null {
  const counts = new Map<string, number>()
  for (const source of payload.sources ?? []) {
    const regionId = source[1]
    const macroRegion = publishedRegionLookup.get(regionId)?.macroRegion ?? 'Unknown'
    counts.set(macroRegion, (counts.get(macroRegion) ?? 0) + 1)
  }

  if (counts.size === 0) return null

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([region, count]) => `${region}=${count}`)
    .join(', ')
}

function buildPublishedSlotSummary(
  payload: PublishedReplayPayload,
  slot: number,
): {
  readonly slotIndex: number
  readonly slotNumber: number
  readonly totalSlots: number
  readonly activeRegions: number
  readonly totalValidators: number
  readonly dominantRegion:
    | {
        readonly regionId: string
        readonly city: string | null
        readonly count: number
        readonly share: number
      }
    | null
  readonly metrics: Record<string, number | null>
  readonly topRegions: string
} {
  const totalSlots = totalPublishedSlots(payload)
  const regions = readPublishedSlotRegions(payload, slot)
  const totalValidators = regions.reduce((sum, region) => sum + region.count, 0)
  const dominantRegion = regions[0]
    ? {
        regionId: regions[0].regionId,
        city: regions[0].city,
        count: regions[0].count,
        share: totalValidators > 0 ? (regions[0].count / totalValidators) * 100 : 0,
      }
    : null

  return {
    slotIndex: slot,
    slotNumber: slot + 1,
    totalSlots,
    activeRegions: regions.length,
    totalValidators,
    dominantRegion,
    metrics: {
      gini: readPublishedMetricValue(payload.metrics?.gini, slot),
      hhi: readPublishedMetricValue(payload.metrics?.hhi, slot),
      liveness: readPublishedMetricValue(payload.metrics?.liveness, slot),
      total_distance: readPublishedMetricValue(payload.metrics?.total_distance, slot),
      proposal_times: readPublishedMetricValue(payload.metrics?.proposal_times, slot),
      mev: readPublishedMetricValue(payload.metrics?.mev, slot),
      failed_block_proposals: readPublishedMetricValue(payload.metrics?.failed_block_proposals, slot),
      clusters: readPublishedMetricValue(payload.metrics?.clusters, slot),
      attestations: readPublishedMetricValue(payload.metrics?.attestations, slot),
    },
    topRegions: summarizePublishedRegions(regions),
  }
}

function summarizePublishedSlotSnapshot(
  label: string,
  snapshot: ReturnType<typeof buildPublishedSlotSummary>,
): string[] {
  const lines = [
    `## ${label}`,
    `- slot: ${snapshot.slotNumber} / ${snapshot.totalSlots}`,
    `- activeRegions: ${snapshot.activeRegions}`,
    `- validatorsVisible: ${snapshot.totalValidators}`,
  ]

  if (snapshot.dominantRegion) {
    lines.push(
      `- dominantRegion: ${(snapshot.dominantRegion.city ?? snapshot.dominantRegion.regionId)} (${snapshot.dominantRegion.regionId}) with ${snapshot.dominantRegion.count} validators (${formatMetricNumber(snapshot.dominantRegion.share, 1)}%)`,
    )
  }

  for (const [key, value] of Object.entries(snapshot.metrics)) {
    lines.push(`- ${publishedMetricLabel(key as keyof PublishedReplayMetrics)}: ${formatPublishedMetricValue(key as keyof PublishedReplayMetrics, value)}`)
  }

  lines.push(`- topRegions: ${snapshot.topRegions}`)
  return lines
}

function formatReplayContextMetric(
  value: number | null | undefined,
  suffix = '',
  fractionDigits = 3,
): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return `${formatMetricNumber(value, fractionDigits)}${suffix}`
}

function summarizeViewerSnapshotContext(
  label: string,
  snapshot: PublishedReplayViewerSnapshotContext | null | undefined,
): string[] {
  if (!snapshot) return []

  const dominantRegion = snapshot.dominantRegionCity ?? snapshot.dominantRegionId ?? 'N/A'
  const lines = [
    `## ${label}`,
    `- slot: ${snapshot.slotNumber} / ${snapshot.totalSlots}`,
    `- slotIndex: ${snapshot.slotIndex}`,
    `- stepSize: ${snapshot.stepSize}`,
    `- playing: ${snapshot.playing ? 'yes' : 'no'}`,
    `- activeRegions: ${snapshot.activeRegions}`,
    `- validatorsVisible: ${snapshot.totalValidators}`,
    `- dominantRegion: ${dominantRegion}`,
    `- dominantRegionShare: ${formatReplayContextMetric(snapshot.dominantRegionShare, '%', 1)}`,
    `- gini: ${formatReplayContextMetric(snapshot.currentGini, '', 3)}`,
    `- hhi: ${formatReplayContextMetric(snapshot.currentHhi, '', 3)}`,
    `- liveness: ${formatReplayContextMetric(snapshot.currentLiveness, '%', 1)}`,
    `- mev: ${formatReplayContextMetric(snapshot.currentMev, ' ETH', 4)}`,
    `- proposalTime: ${formatReplayContextMetric(snapshot.currentProposalTime, ' ms', 1)}`,
    `- attestations: ${formatReplayContextMetric(snapshot.currentAttestation, '%', 1)}`,
    `- totalDistance: ${formatReplayContextMetric(snapshot.currentTotalDistance, '', 1)}`,
    `- failedBlockProposals: ${formatReplayContextMetric(snapshot.currentFailedBlockProposals, '', 1)}`,
    `- clusters: ${formatReplayContextMetric(snapshot.currentClusters, '', 1)}`,
  ]

  return lines
}

type ExploreCachedResultFilters = {
  readonly paradigm?: string
  readonly distribution?: string
  readonly sourcePlacement?: string
  readonly evaluation?: string
  readonly result?: string
}

type PublishedExploreMetricKey = Extract<
  keyof PublishedReplayMetrics,
  | 'gini'
  | 'hhi'
  | 'liveness'
  | 'proposal_times'
  | 'mev'
  | 'attestations'
  | 'clusters'
  | 'failed_block_proposals'
  | 'total_distance'
>

const publishedExploreMetricValues = [
  'gini',
  'hhi',
  'liveness',
  'proposal_times',
  'mev',
  'attestations',
  'clusters',
  'failed_block_proposals',
  'total_distance',
] as const satisfies readonly PublishedExploreMetricKey[]

type PublishedResultsQueryDimension =
  | 'evaluation'
  | 'paradigm'
  | 'result'
  | 'validators'
  | 'migrationCost'
  | 'gamma'
  | 'activeRegions'
  | 'dominantRegion'
  | 'sourceRole'
  | 'totalSlots'

const publishedResultsQueryDimensionValues = [
  'evaluation',
  'paradigm',
  'result',
  'validators',
  'migrationCost',
  'gamma',
  'activeRegions',
  'dominantRegion',
  'sourceRole',
  'totalSlots',
] as const satisfies readonly PublishedResultsQueryDimension[]

type PublishedResultsQueryFilterKey = 'evaluation' | 'paradigm' | 'result'
type PublishedCatalogParadigm = 'External' | 'Local'

interface StructuredResultsQueryFilters {
  readonly evaluation?: string
  readonly paradigm?: PublishedCatalogParadigm
  readonly result?: string
}

interface StructuredResultsQueryPlan {
  readonly view: StudyAssistantQueryView | null
  readonly dimensions: readonly PublishedResultsQueryDimension[]
  readonly metrics: readonly PublishedExploreMetricKey[]
  readonly filters: StructuredResultsQueryFilters
  readonly slot: 'initial' | 'final'
  readonly orderBy: string | null
  readonly order: 'asc' | 'desc'
  readonly limit: number
  readonly notes: readonly string[]
  readonly coerced: boolean
}

interface PublishedExploreDominantRegion {
  readonly regionId: string
  readonly city: string | null
  readonly share: number
  readonly count: number
}

interface PublishedExploreResultEntry {
  readonly label: string
  readonly evaluation: string
  readonly paradigm: 'SSP' | 'MSP'
  readonly result: string
  readonly datasetPath: string
  readonly sourceRole: string
  readonly description: string | null
  readonly validators: number | null
  readonly migrationCost: number | null
  readonly gamma: number | null
  readonly totalSlots: number
  readonly initialMetrics: Readonly<Record<string, number | null>>
  readonly finalMetrics: Readonly<Record<string, number | null>>
  readonly activeRegions: number
  readonly dominantRegion: PublishedExploreDominantRegion | null
  readonly topRegions: string
  readonly metricDigest: readonly string[]
}

interface PublishedExploreCompanionEntry {
  readonly label: string
  readonly evaluation: string
  readonly paradigm: 'SSP' | 'MSP'
  readonly result: string
  readonly datasetPath: string
  readonly totalSlots: number
  readonly finalMetrics: Readonly<Record<string, number | null>>
  readonly activeRegions: number
  readonly dominantRegion: PublishedExploreDominantRegion | null
}

interface PublishedResultsToolResponse {
  readonly source: 'published-replay'
  readonly query: {
    readonly evaluation: string | null
    readonly paradigm: 'SSP' | 'MSP' | null
    readonly result: string | null
  }
  readonly results: readonly PublishedExploreResultEntry[]
  readonly pairedComparison: PublishedExploreCompanionEntry | null
}

interface StructuredResultsExecution {
  readonly queryPlan: StructuredResultsQueryPlan
  readonly result: Awaited<ReturnType<typeof queryPublishedResultsTable>>
}

function normalizePublishedCatalogParadigm(
  rawParadigm: string | undefined,
): PublishedResearchDatasetEntry['paradigm'] | undefined {
  if (!rawParadigm) return undefined
  const normalized = rawParadigm.trim().toLowerCase()
  if (normalized === 'ssp' || normalized === 'external') return 'External'
  if (normalized === 'msp' || normalized === 'local') return 'Local'
  return undefined
}

function inferPublishedEvaluation(filters: ExploreCachedResultFilters): string | undefined {
  const normalizedEvaluation = normalizePublishedEvaluationFilter(filters.evaluation)
  if (normalizedEvaluation) return normalizedEvaluation
  if (filters.sourcePlacement === 'latency-aligned' || filters.sourcePlacement === 'latency-misaligned') {
    return 'SE1-Information-Source-Placement-Effect'
  }
  if (filters.distribution === 'heterogeneous') {
    return 'SE2-Validator-Distribution-Effect'
  }
  if (!filters.distribution || filters.distribution === 'homogeneous' || filters.distribution === 'homogeneous-gcp') {
    return 'Baseline'
  }
  return undefined
}

function inferPublishedResult(filters: ExploreCachedResultFilters): string | undefined {
  const normalizedEvaluation = normalizePublishedEvaluationFilter(filters.evaluation)
  const normalizedResult = filters.result?.trim().toLowerCase()
  if (
    normalizedResult
    && ![
      'baseline',
      'data',
      'gini',
      'gini_g',
      'hhi',
      'hhi_g',
      'cv',
      'cv_g',
      'lc',
      'lc_g',
      'liveness',
      'mev',
      'proposal',
      'proposal_times',
      'attestations',
      'clusters',
      'failed_block_proposals',
    ].includes(normalizedResult)
  ) {
    return filters.result?.trim()
  }
  if (filters.sourcePlacement === 'latency-aligned' || filters.sourcePlacement === 'latency-misaligned') {
    return filters.sourcePlacement
  }
  if (
    normalizedEvaluation === 'SE1-Information-Source-Placement-Effect'
    || normalizedEvaluation === 'SE3-Joint-Heterogeneity'
    || normalizedEvaluation === 'SE4-Attestation-Threshold'
    || normalizedEvaluation === 'SE4-EIP7782'
  ) {
    return undefined
  }
  return 'cost_0.002'
}

function normalizePublishedEvaluationFilter(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'test') return 'Test'
  if (normalized === 'baseline') return 'Baseline'
  if (normalized.includes('source') || normalized.includes('se1')) {
    return 'SE1-Information-Source-Placement-Effect'
  }
  if ((normalized.includes('distribution') && normalized.includes('validator')) || normalized.includes('se2')) {
    return 'SE2-Validator-Distribution-Effect'
  }
  if (normalized.includes('joint') || normalized.includes('heterogeneity') || normalized.includes('se3')) {
    return 'SE3-Joint-Heterogeneity'
  }
  if (normalized.includes('attestation') || normalized.includes('gamma') || normalized.includes('gamma_sweep') || normalized.includes('sweep') || normalized.includes('se4a')) {
    return 'SE4-Attestation-Threshold'
  }
  if (normalized.includes('eip7782') || normalized.includes('eip-7782') || normalized.includes('shorter slot') || normalized.includes('se4b')) {
    return 'SE4-EIP7782'
  }
  return value.trim()
}

function findStudyPaperChartMatch(
  value: string | undefined,
): { key: string; chart: typeof ACTIVE_STUDY.paperCharts[string] } | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null

  for (const [dataKey, chart] of Object.entries(ACTIVE_STUDY.paperCharts)) {
    if (dataKey.toLowerCase() === normalized) {
      return { key: dataKey, chart }
    }
  }

  return null
}

function sanitizeExploreCachedResultFilters(
  filters: ExploreCachedResultFilters,
): ExploreCachedResultFilters {
  const normalizedParadigm = filters.paradigm?.trim().toLowerCase()
  const evaluation = normalizePublishedEvaluationFilter(filters.evaluation)
  const normalizedResult = filters.result?.trim().toLowerCase()
  const shouldDropResultHint = Boolean(
    normalizedResult
    && evaluation !== 'Test'
    && [
      'baseline',
      'data',
      'gini',
      'gini_g',
      'hhi',
      'hhi_g',
      'cv',
      'cv_g',
      'lc',
      'lc_g',
      'liveness',
      'mev',
      'proposal',
      'proposal_times',
      'attestations',
      'clusters',
      'failed_block_proposals',
    ].includes(normalizedResult),
  )

  return {
    paradigm: normalizedParadigm && ['both', 'either', 'comparison', 'compare'].includes(normalizedParadigm)
      ? undefined
      : (filters.paradigm?.trim() || undefined),
    distribution: filters.distribution?.trim() || undefined,
    sourcePlacement: filters.sourcePlacement?.trim() || undefined,
    evaluation,
    result: shouldDropResultHint ? undefined : (filters.result?.trim() || undefined),
  }
}

async function loadExplorePublishedResults(filters: ExploreCachedResultFilters): Promise<unknown> {
  const catalog = await loadPublishedResearchCatalog()
  if (!catalog) {
    return {
      source: 'published-replay',
      message: 'The published Results catalog is unavailable on this server.',
    }
  }

  const paradigm = normalizePublishedCatalogParadigm(filters.paradigm)
  const evaluation = inferPublishedEvaluation(filters)
  const result = inferPublishedResult(filters)
  const chartMatch = findStudyPaperChartMatch(filters.result) ?? findStudyPaperChartMatch(filters.evaluation)

  const matchedEntries = chartMatch?.chart.publishedScenarioLinks?.length
    ? chartMatch.chart.publishedScenarioLinks.flatMap(link => {
        if (paradigm && link.paradigm !== paradigm) return []
        const matchingEntry = catalog.datasets.find(entry =>
          entry.evaluation === link.evaluation
          && entry.paradigm === link.paradigm
          && entry.result === link.result,
        )
        return matchingEntry ? [matchingEntry] : []
      })
    : catalog.datasets.filter(entry => {
        if (paradigm && entry.paradigm !== paradigm) return false
        if (evaluation && entry.evaluation !== evaluation) return false
        if (result && entry.result !== result) return false
        return true
      })

  if (matchedEntries.length === 0) {
    return {
      source: 'published-replay',
      message: 'No published Results datasets match those filters.',
      availableSelections: {
        evaluations: [...new Set(catalog.datasets.map(entry => entry.evaluation))],
        paradigms: ['SSP', 'MSP'],
        results: [...new Set(catalog.datasets.map(entry => entry.result))],
      },
    }
  }

  const results = await Promise.all(matchedEntries.map(async entry => {
    const datasetPath = normalizePublishedDatasetPath(entry.path)
    if (!datasetPath) return null

    const payload = await loadPublishedReplayPayload(datasetPath)
    const initialSnapshot = buildPublishedSlotSummary(payload, 0)
    const finalSnapshot = buildPublishedSlotSummary(payload, Math.max(0, totalPublishedSlots(payload) - 1))
    const metricDigest = ([
      'gini',
      'hhi',
      'liveness',
      'proposal_times',
      'mev',
      'failed_block_proposals',
      'clusters',
      'attestations',
    ] as const)
      .map(key => summarizePublishedSeries(key, payload.metrics?.[key]))
      .filter((line): line is string => Boolean(line))

    return {
      label: `${entry.evaluation} / ${entry.paradigm} / ${entry.result}`,
      evaluation: entry.evaluation,
      paradigm: entry.paradigm === 'External' ? 'SSP' : 'MSP',
      result: entry.result,
      datasetPath: toPublishedResultsRelativePath(datasetPath),
      sourceRole: sourceRoleLabel(entry.sourceRole),
      description: payload.description ?? entry.metadata?.description ?? null,
      validators: payload.v ?? entry.metadata?.v ?? null,
      migrationCost: payload.cost ?? entry.metadata?.cost ?? null,
      gamma: payload.gamma ?? entry.metadata?.gamma ?? null,
      totalSlots: finalSnapshot.totalSlots,
      initialMetrics: initialSnapshot.metrics,
      finalMetrics: finalSnapshot.metrics,
      activeRegions: finalSnapshot.activeRegions,
      dominantRegion: finalSnapshot.dominantRegion
        ? {
            regionId: finalSnapshot.dominantRegion.regionId,
            city: finalSnapshot.dominantRegion.city,
            share: finalSnapshot.dominantRegion.share,
            count: finalSnapshot.dominantRegion.count,
          }
        : null,
      topRegions: finalSnapshot.topRegions,
      metricDigest,
    }
  }))

  const compactResults = results.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (compactResults.length === 0) {
    return {
      source: 'published-replay',
      message: 'The matching published Results datasets could not be loaded.',
    }
  }

  const companion = compactResults.length === 1
    ? compactResults[0]
    : null

  let pairedComparison: unknown = null
  if (companion && paradigm) {
    const oppositeParadigm = paradigm === 'External' ? 'Local' : 'External'
    const companionEntry = catalog.datasets.find(entry =>
      entry.evaluation === companion.evaluation
      && entry.result === companion.result
      && entry.paradigm === oppositeParadigm,
    )
    if (companionEntry) {
      const datasetPath = normalizePublishedDatasetPath(companionEntry.path)
      if (datasetPath) {
        const payload = await loadPublishedReplayPayload(datasetPath)
        const finalSnapshot = buildPublishedSlotSummary(payload, Math.max(0, totalPublishedSlots(payload) - 1))
        pairedComparison = {
          label: `${companionEntry.evaluation} / ${companionEntry.paradigm} / ${companionEntry.result}`,
          evaluation: companionEntry.evaluation,
          paradigm: companionEntry.paradigm === 'External' ? 'SSP' : 'MSP',
          result: companionEntry.result,
          datasetPath: toPublishedResultsRelativePath(datasetPath),
          totalSlots: finalSnapshot.totalSlots,
          finalMetrics: finalSnapshot.metrics,
          activeRegions: finalSnapshot.activeRegions,
          dominantRegion: finalSnapshot.dominantRegion
            ? {
                regionId: finalSnapshot.dominantRegion.regionId,
                city: finalSnapshot.dominantRegion.city,
                share: finalSnapshot.dominantRegion.share,
                count: finalSnapshot.dominantRegion.count,
              }
            : null,
        }
      }
    }
  }

  return {
    source: 'published-replay',
    query: {
      evaluation: evaluation ?? null,
      paradigm: paradigm ? (paradigm === 'External' ? 'SSP' : 'MSP') : null,
      result: result ?? null,
    },
    results: compactResults,
    pairedComparison,
  }
}

type PublishedExploreComparableEntry = PublishedExploreResultEntry | PublishedExploreCompanionEntry

function normalizePublishedExploreParadigm(
  value: unknown,
): 'SSP' | 'MSP' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ssp' || normalized === 'external') return 'SSP'
  if (normalized === 'msp' || normalized === 'local') return 'MSP'
  return null
}

function coercePublishedExploreMetrics(
  value: unknown,
): Readonly<Record<string, number | null>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, metricValue]) => [
      key,
      typeof metricValue === 'number' && Number.isFinite(metricValue) ? metricValue : null,
    ]),
  )
}

function coercePublishedDominantRegion(
  value: unknown,
): PublishedExploreDominantRegion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.regionId !== 'string') return null
  return {
    regionId: candidate.regionId,
    city: typeof candidate.city === 'string' ? candidate.city : null,
    share: typeof candidate.share === 'number' && Number.isFinite(candidate.share) ? candidate.share : 0,
    count: typeof candidate.count === 'number' && Number.isFinite(candidate.count) ? candidate.count : 0,
  }
}

function coercePublishedExploreResultEntry(
  value: unknown,
): PublishedExploreResultEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const evaluation = typeof candidate.evaluation === 'string' ? candidate.evaluation : null
  const result = typeof candidate.result === 'string' ? candidate.result : null
  const datasetPath = typeof candidate.datasetPath === 'string' ? candidate.datasetPath : null
  const paradigm = normalizePublishedExploreParadigm(candidate.paradigm)
  if (!evaluation || !result || !datasetPath || !paradigm) return null
  return {
    label: typeof candidate.label === 'string' ? candidate.label : `${evaluation} / ${publishedParadigmDisplayLabel(paradigm)} / ${result}`,
    evaluation,
    paradigm,
    result,
    datasetPath,
    sourceRole: typeof candidate.sourceRole === 'string' ? candidate.sourceRole : 'published results',
    description: typeof candidate.description === 'string' ? candidate.description : null,
    validators: typeof candidate.validators === 'number' && Number.isFinite(candidate.validators) ? candidate.validators : null,
    migrationCost: typeof candidate.migrationCost === 'number' && Number.isFinite(candidate.migrationCost) ? candidate.migrationCost : null,
    gamma: typeof candidate.gamma === 'number' && Number.isFinite(candidate.gamma) ? candidate.gamma : null,
    totalSlots: typeof candidate.totalSlots === 'number' && Number.isFinite(candidate.totalSlots) ? candidate.totalSlots : 0,
    initialMetrics: coercePublishedExploreMetrics(candidate.initialMetrics),
    finalMetrics: coercePublishedExploreMetrics(candidate.finalMetrics),
    activeRegions: typeof candidate.activeRegions === 'number' && Number.isFinite(candidate.activeRegions) ? candidate.activeRegions : 0,
    dominantRegion: coercePublishedDominantRegion(candidate.dominantRegion),
    topRegions: typeof candidate.topRegions === 'string' ? candidate.topRegions : '',
    metricDigest: Array.isArray(candidate.metricDigest)
      ? candidate.metricDigest.filter((entry): entry is string => typeof entry === 'string')
      : [],
  }
}

function coercePublishedExploreCompanionEntry(
  value: unknown,
  fallback: PublishedExploreResultEntry | null,
): PublishedExploreCompanionEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const datasetPath = typeof candidate.datasetPath === 'string' ? candidate.datasetPath : null
  const paradigm = normalizePublishedExploreParadigm(candidate.paradigm)
  const evaluation = typeof candidate.evaluation === 'string'
    ? candidate.evaluation
    : fallback?.evaluation ?? null
  const result = typeof candidate.result === 'string'
    ? candidate.result
    : fallback?.result ?? null
  if (!datasetPath || !paradigm || !evaluation || !result) return null
  return {
    label: typeof candidate.label === 'string' ? candidate.label : `${evaluation} / ${publishedParadigmDisplayLabel(paradigm)} / ${result}`,
    evaluation,
    paradigm,
    result,
    datasetPath,
    totalSlots: typeof candidate.totalSlots === 'number' && Number.isFinite(candidate.totalSlots) ? candidate.totalSlots : 0,
    finalMetrics: coercePublishedExploreMetrics(candidate.finalMetrics),
    activeRegions: typeof candidate.activeRegions === 'number' && Number.isFinite(candidate.activeRegions) ? candidate.activeRegions : 0,
    dominantRegion: coercePublishedDominantRegion(candidate.dominantRegion),
  }
}

function formatPublishedTotalSlots(totalSlots: number | null | undefined): string {
  return typeof totalSlots === 'number' && Number.isFinite(totalSlots) && totalSlots > 0
    ? totalSlots.toLocaleString()
    : 'N/A'
}

function resultsQueryDimensionLabel(
  dimension: PublishedResultsQueryDimension,
): string {
  switch (dimension) {
    case 'evaluation':
      return 'Evaluation'
    case 'paradigm':
      return 'Paradigm'
    case 'result':
      return 'Result'
    case 'validators':
      return 'Validators'
    case 'migrationCost':
      return 'Migration cost'
    case 'gamma':
      return 'Gamma'
    case 'activeRegions':
      return 'Active regions'
    case 'dominantRegion':
      return 'Top region'
    case 'sourceRole':
      return 'Source role'
    case 'totalSlots':
      return 'Slots'
    default:
      return dimension
  }
}

function formatResultsQueryDimension(
  entry: PublishedExploreResultEntry,
  dimension: PublishedResultsQueryDimension,
): string {
  switch (dimension) {
    case 'evaluation':
      return formatPublishedEvaluationLabel(entry.evaluation)
    case 'paradigm':
      return publishedParadigmDisplayLabel(entry.paradigm)
    case 'result':
      return formatPublishedResultLabel(entry.result)
    case 'validators':
      return entry.validators != null ? formatMetricNumber(entry.validators, 0) : 'N/A'
    case 'migrationCost':
      return entry.migrationCost != null ? formatMetricNumber(entry.migrationCost, 4) : 'N/A'
    case 'gamma':
      return entry.gamma != null ? formatMetricNumber(entry.gamma, 4) : 'N/A'
    case 'activeRegions':
      return formatMetricNumber(entry.activeRegions, 0)
    case 'dominantRegion':
      return entry.dominantRegion?.city
        ? `${entry.dominantRegion.city} (${formatMetricNumber(entry.dominantRegion.share, 1)}%)`
        : 'N/A'
    case 'sourceRole':
      return entry.sourceRole
    case 'totalSlots':
      return formatPublishedTotalSlots(entry.totalSlots)
    default:
      return 'N/A'
  }
}

function readResultsQueryDimensionSortValue(
  entry: PublishedExploreResultEntry,
  dimension: PublishedResultsQueryDimension,
): string | number {
  switch (dimension) {
    case 'evaluation':
      return formatPublishedEvaluationLabel(entry.evaluation)
    case 'paradigm':
      return publishedParadigmSortValue(entry.paradigm)
    case 'result':
      return entry.result
    case 'validators':
      return entry.validators ?? Number.NEGATIVE_INFINITY
    case 'migrationCost':
      return entry.migrationCost ?? Number.NEGATIVE_INFINITY
    case 'gamma':
      return entry.gamma ?? Number.NEGATIVE_INFINITY
    case 'activeRegions':
      return entry.activeRegions
    case 'dominantRegion':
      return entry.dominantRegion?.share ?? Number.NEGATIVE_INFINITY
    case 'sourceRole':
      return entry.sourceRole
    case 'totalSlots':
      return entry.totalSlots
    default:
      return ''
  }
}

function buildResultsQueryLabel(
  entry: PublishedExploreResultEntry,
  dimensions: readonly PublishedResultsQueryDimension[],
): string {
  const selected = dimensions.length > 0
    ? dimensions
    : ['evaluation', 'paradigm', 'result'] satisfies readonly PublishedResultsQueryDimension[]
  return selected
    .map(dimension => formatResultsQueryDimension(entry, dimension))
    .join(' · ')
}

function buildPublishedResultsQueryCite(
  entries: readonly PublishedExploreResultEntry[],
): Cite | undefined {
  const evaluations = [...new Set(entries.map(entry => entry.evaluation))]
  if (evaluations.length !== 1) return undefined
  const experiment = inferPublishedExperiment(evaluations[0])
  return experiment ? { experiment } : undefined
}

async function queryPublishedResultsTable(input: {
  readonly queryHint?: string
  readonly viewId?: string
  readonly dimensions?: readonly PublishedResultsQueryDimension[]
  readonly metrics?: readonly PublishedExploreMetricKey[]
  readonly filters?: {
    readonly evaluation?: string
    readonly paradigm?: string
    readonly result?: string
  }
  readonly slot?: 'initial' | 'final'
  readonly orderBy?: string
  readonly order?: 'asc' | 'desc'
  readonly limit?: number
  readonly title?: string
  readonly queryPlan?: StructuredResultsQueryPlan
}): Promise<{
  readonly summary: string
  readonly description: string
  readonly blocks: readonly Block[]
  readonly followUps: readonly string[]
}> {
  const catalog = await loadPublishedResearchCatalog()
  if (!catalog) {
    return {
      summary: 'Structured results query unavailable',
      description: 'The published Results catalog is unavailable on this server.',
      blocks: [{
        type: 'caveat',
        text: 'The published Results catalog is unavailable on this server.',
      }],
      followUps: [],
    }
  }

  const queryPlan = input.queryPlan ?? resolveStructuredResultsQueryPlan(input)
  const queryView = queryPlan.view
  const dimensions = queryPlan.dimensions
  const metrics = queryPlan.metrics
  const normalizedParadigm = queryPlan.filters.paradigm
  const normalizedEvaluation = queryPlan.filters.evaluation
  const normalizedResult = queryPlan.filters.result
  const queryViewChartKeys = resolveQueryViewChartKeys(queryView)
  const chartMatch = findStudyPaperChartMatch(normalizedResult)
    ?? findStudyPaperChartMatch(input.filters?.evaluation)
    ?? (queryViewChartKeys.length === 1
      ? findStudyPaperChartMatch(queryViewChartKeys[0])
      : null)

  const queryViewEntries = queryViewChartKeys.length > 0
    ? queryViewChartKeys.flatMap(chartKey => {
        const chart = ACTIVE_STUDY.paperCharts[chartKey]
        if (!chart?.publishedScenarioLinks?.length) return []
        return chart.publishedScenarioLinks.flatMap(link => {
          if (normalizedParadigm && link.paradigm !== normalizedParadigm) return []
          if (normalizedEvaluation && link.evaluation !== normalizedEvaluation) return []
          if (normalizedResult && link.result !== normalizedResult) return []
          const matchingEntry = catalog.datasets.find(entry =>
            entry.evaluation === link.evaluation
            && entry.paradigm === link.paradigm
            && entry.result === link.result,
          )
          return matchingEntry ? [matchingEntry] : []
        })
      })
    : []

  const matchedEntries = queryViewEntries.length > 0
    ? queryViewEntries
    : chartMatch?.chart.publishedScenarioLinks?.length
      ? chartMatch.chart.publishedScenarioLinks.flatMap(link => {
        if (normalizedParadigm && link.paradigm !== normalizedParadigm) return []
        const matchingEntry = catalog.datasets.find(entry =>
          entry.evaluation === link.evaluation
          && entry.paradigm === link.paradigm
          && entry.result === link.result,
        )
        return matchingEntry ? [matchingEntry] : []
      })
      : catalog.datasets.filter(entry => {
        if (normalizedParadigm && entry.paradigm !== normalizedParadigm) return false
        if (normalizedEvaluation && entry.evaluation !== normalizedEvaluation) return false
        if (normalizedResult && entry.result !== normalizedResult) return false
        return true
      })
  const dedupedMatchedEntries = matchedEntries.filter((entry, index, all) =>
    all.findIndex(candidate => candidate.path === entry.path) === index,
  )

  if (dedupedMatchedEntries.length === 0) {
    return {
      summary: 'No matching published result rows',
      description: 'The structured query did not match any published Results datasets.',
      blocks: [{
        type: 'caveat',
        text: 'No published Results datasets match that structured query.',
      }],
      followUps: [],
    }
  }

  const slotMode = queryPlan.slot
  const hydratedEntries = await Promise.all(dedupedMatchedEntries.map(async entry => {
    const datasetPath = normalizePublishedDatasetPath(entry.path)
    if (!datasetPath) return null
    const payload = await loadPublishedReplayPayload(datasetPath)
    const initialSnapshot = buildPublishedSlotSummary(payload, 0)
    const finalSnapshot = buildPublishedSlotSummary(payload, Math.max(0, totalPublishedSlots(payload) - 1))
    const focusSnapshot = slotMode === 'initial' ? initialSnapshot : finalSnapshot
    return {
      label: `${entry.evaluation} / ${entry.paradigm} / ${entry.result}`,
      evaluation: entry.evaluation,
      paradigm: entry.paradigm === 'External' ? 'SSP' : 'MSP',
      result: entry.result,
      datasetPath: toPublishedResultsRelativePath(datasetPath),
      sourceRole: sourceRoleLabel(entry.sourceRole),
      description: payload.description ?? entry.metadata?.description ?? null,
      validators: payload.v ?? entry.metadata?.v ?? null,
      migrationCost: payload.cost ?? entry.metadata?.cost ?? null,
      gamma: payload.gamma ?? entry.metadata?.gamma ?? null,
      totalSlots: focusSnapshot.totalSlots,
      initialMetrics: initialSnapshot.metrics,
      finalMetrics: finalSnapshot.metrics,
      activeRegions: focusSnapshot.activeRegions,
      dominantRegion: focusSnapshot.dominantRegion
        ? {
            regionId: focusSnapshot.dominantRegion.regionId,
            city: focusSnapshot.dominantRegion.city,
            share: focusSnapshot.dominantRegion.share,
            count: focusSnapshot.dominantRegion.count,
          }
        : null,
      topRegions: focusSnapshot.topRegions,
      metricDigest: [],
    } satisfies PublishedExploreResultEntry
  }))

  const results = hydratedEntries.filter((entry): entry is PublishedExploreResultEntry => entry !== null)
  if (results.length === 0) {
    return {
      summary: 'Structured results rows could not be loaded',
      description: 'The matching published Results datasets were found in the catalog but could not be read from disk.',
      blocks: [{
        type: 'caveat',
        text: 'The matching published Results datasets could not be loaded for this structured query.',
      }],
      followUps: [],
    }
  }

  const orderByValue = queryPlan.orderBy
  const orderByMetric = normalizePublishedMetricKey(orderByValue)
  const orderByDimension = publishedResultsQueryDimensionValues.includes((orderByValue ?? '') as PublishedResultsQueryDimension)
    ? orderByValue as PublishedResultsQueryDimension
    : null
  const orderDirection = queryPlan.order === 'asc' ? 1 : -1
  const sorted = results
    .slice()
    .sort((left, right) => {
      if (orderByMetric) {
        const leftValue = (slotMode === 'initial' ? left.initialMetrics : left.finalMetrics)[orderByMetric] ?? Number.NEGATIVE_INFINITY
        const rightValue = (slotMode === 'initial' ? right.initialMetrics : right.finalMetrics)[orderByMetric] ?? Number.NEGATIVE_INFINITY
        return (leftValue - rightValue) * orderDirection
      }
      if (orderByDimension) {
        const leftValue = readResultsQueryDimensionSortValue(left, orderByDimension)
        const rightValue = readResultsQueryDimensionSortValue(right, orderByDimension)
        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          return (leftValue - rightValue) * orderDirection
        }
        return String(leftValue).localeCompare(String(rightValue)) * orderDirection
      }
      return left.label.localeCompare(right.label)
    })

  const visibleRows = sorted.slice(0, queryPlan.limit)
  const cite = buildPublishedResultsQueryCite(visibleRows)
  const headers = [
    ...dimensions.map(resultsQueryDimensionLabel),
    ...metrics.map(metric => `${publishedMetricTitle(metric)} (${slotMode})`),
  ]
  const rows = visibleRows.map(entry => [
    ...dimensions.map(dimension => formatResultsQueryDimension(entry, dimension)),
    ...metrics.map(metric => {
      const metricValue = (slotMode === 'initial' ? entry.initialMetrics : entry.finalMetrics)[metric] ?? null
      return formatPublishedMetricValue(metric, metricValue)
    }),
  ])

  const blocks: Block[] = []
  if (metrics.length === 1 && visibleRows.length >= 2 && visibleRows.length <= 10) {
    const metric = metrics[0]!
    blocks.push({
      type: 'chart',
      title: input.title ?? queryView?.title ?? `${publishedMetricTitle(metric)} across published results`,
      chartType: 'bar',
      unit: publishedMetricUnit(metric),
      data: visibleRows.map(entry => ({
        label: buildResultsQueryLabel(entry, dimensions),
        value: (slotMode === 'initial' ? entry.initialMetrics : entry.finalMetrics)[metric] ?? 0,
        category: publishedParadigmDisplayLabel(entry.paradigm),
      })),
      cite,
    })
  }

  const topEntry = visibleRows[0]!
  blocks.push({
    type: 'insight',
    title: 'Structured query result',
    text: orderByMetric
      ? `${buildResultsQueryLabel(topEntry, dimensions)} is currently ${queryPlan.order === 'asc' ? 'lowest' : 'highest'} on ${publishedMetricTitle(orderByMetric)} in the returned published rows.`
      : `Showing ${visibleRows.length} published result row${visibleRows.length === 1 ? '' : 's'} from the study-owned Results catalog at the ${slotMode} snapshot.`,
    cite,
  })
  if (queryPlan.notes.length > 0) {
    blocks.push({
      type: 'caveat',
      text: `Structured query interpretation: ${queryPlan.notes.join(' ')}`,
      cite,
    })
  }
  blocks.push({
    type: 'table',
    title: input.title ?? queryView?.title ?? 'Published results query',
    headers,
    rows,
    cite,
  })

  if (chartMatch?.key) {
    const chartBlock = findStudyPaperChartBlock(chartMatch.key)
    blocks.push({
      type: 'paperChart',
      title: chartBlock?.title ?? formatPublishedEvaluationLabel(chartMatch.key),
      dataKey: chartMatch.key,
      cite: chartBlock?.cite,
    })
  }

  return {
    summary: queryView
      ? `${queryView.title}: ${visibleRows.length} published row${visibleRows.length === 1 ? '' : 's'}`
      : `Structured query over ${visibleRows.length} published row${visibleRows.length === 1 ? '' : 's'}`,
    description: queryView
      ? `${queryView.description} Returned ${visibleRows.length} of ${results.length} published Results row${results.length === 1 ? '' : 's'} from the ${slotMode} snapshot.${queryPlan.notes.length > 0 ? ` ${queryPlan.notes.join(' ')}` : ''}`
      : `Returned ${visibleRows.length} of ${results.length} published Results row${results.length === 1 ? '' : 's'} from the ${slotMode} snapshot.${queryPlan.notes.length > 0 ? ` ${queryPlan.notes.join(' ')}` : ''}`,
    blocks,
    followUps: [
      ...(queryView?.prompts?.filter(prompt => prompt.trim().toLowerCase() !== (input.queryHint ?? '').trim().toLowerCase()).slice(0, 1) ?? []),
      `Rank the same rows by ${publishedMetricTitle(metrics[0]!)} in the opposite direction.`,
      'Narrow this to one evaluation or paradigm and compare the remaining rows.',
    ].slice(0, 3),
  }
}

async function executeStructuredResultsQuery(input: {
  readonly queryHint?: string
  readonly viewId?: string
  readonly dimensions?: readonly PublishedResultsQueryDimension[]
  readonly metrics?: readonly PublishedExploreMetricKey[]
  readonly filters?: {
    readonly evaluation?: string
    readonly paradigm?: string
    readonly result?: string
  }
  readonly slot?: 'initial' | 'final'
  readonly orderBy?: string
  readonly order?: 'asc' | 'desc'
  readonly limit?: number
  readonly title?: string
  readonly queryPlan?: StructuredResultsQueryPlan
}): Promise<StructuredResultsExecution> {
  const queryPlan = input.queryPlan ?? resolveStructuredResultsQueryPlan(input)
  const result = await queryPublishedResultsTable({
    queryHint: input.queryHint,
    viewId: queryPlan.view?.id,
    dimensions: queryPlan.dimensions,
    metrics: queryPlan.metrics,
    filters: queryPlan.filters,
    slot: queryPlan.slot,
    orderBy: queryPlan.orderBy ?? undefined,
    order: queryPlan.order,
    limit: queryPlan.limit,
    title: input.title,
    queryPlan,
  })
  return { queryPlan, result }
}

function normalizePublishedResultsToolResponse(
  value: unknown,
): PublishedResultsToolResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (candidate.source !== 'published-replay' || !Array.isArray(candidate.results)) return null
  const results = candidate.results
    .map(coercePublishedExploreResultEntry)
    .filter((entry): entry is PublishedExploreResultEntry => entry !== null)
  if (results.length === 0) return null
  const query = candidate.query && typeof candidate.query === 'object' && !Array.isArray(candidate.query)
    ? candidate.query as Record<string, unknown>
    : {}
  return {
    source: 'published-replay',
    query: {
      evaluation: typeof query.evaluation === 'string' ? query.evaluation : null,
      paradigm: normalizePublishedExploreParadigm(query.paradigm),
      result: typeof query.result === 'string' ? query.result : null,
    },
    results,
    pairedComparison: coercePublishedExploreCompanionEntry(candidate.pairedComparison, results[0] ?? null),
  }
}

function publishedParadigmDisplayLabel(paradigm: 'SSP' | 'MSP' | 'External' | 'Local'): 'External' | 'Local' {
  return paradigm === 'SSP' || paradigm === 'External' ? 'External' : 'Local'
}

function publishedParadigmSortValue(paradigm: 'SSP' | 'MSP'): number {
  return paradigm === 'SSP' ? 0 : 1
}

function formatPublishedEvaluationLabel(evaluation: string): string {
  return evaluation
    .replace(/-Effect$/i, '')
    .replace(/EIP7782/g, 'EIP-7782')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatPublishedResultLabel(result: string): string {
  return result
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPublishedSelectionKey(entry: {
  readonly evaluation: string
  readonly paradigm: 'SSP' | 'MSP' | 'External' | 'Local'
  readonly result: string
}): string {
  return `${entry.evaluation}::${publishedParadigmDisplayLabel(entry.paradigm)}::${entry.result}`
}

function buildPublishedScenarioGroupKey(entry: {
  readonly evaluation: string
  readonly result: string
}): string {
  return `${entry.evaluation}::${entry.result}`
}

function normalizePublishedMetricKey(
  value: string | undefined,
): PublishedExploreMetricKey | null {
  if (!value) return null
  switch (value.trim().toLowerCase()) {
    case 'gini':
      return 'gini'
    case 'hhi':
      return 'hhi'
    case 'liveness':
      return 'liveness'
    case 'proposal_times':
    case 'proposal-times':
    case 'proposal':
    case 'latency':
      return 'proposal_times'
    case 'mev':
      return 'mev'
    case 'attestations':
    case 'attestation':
      return 'attestations'
    case 'clusters':
    case 'cluster':
      return 'clusters'
    case 'failed_block_proposals':
    case 'failed-proposals':
    case 'failed proposals':
      return 'failed_block_proposals'
    case 'total_distance':
    case 'distance':
      return 'total_distance'
    default:
      return null
  }
}

function publishedMetricUnit(
  key: PublishedExploreMetricKey,
): string | undefined {
  switch (key) {
    case 'proposal_times':
      return ' ms'
    case 'mev':
      return ' ETH'
    case 'liveness':
    case 'attestations':
      return '%'
    default:
      return undefined
  }
}

function readPublishedEntryGamma(
  entry: PublishedExploreComparableEntry,
): number | null {
  if (!('gamma' in entry)) return null
  return typeof entry.gamma === 'number' && Number.isFinite(entry.gamma) ? entry.gamma : null
}

function parsePublishedResultSortValue(
  entry: PublishedExploreComparableEntry,
): number | null {
  const gamma = readPublishedEntryGamma(entry)
  if (gamma != null) {
    return gamma
  }

  const normalized = entry.result.trim().toLowerCase()
  const gammaMatch = normalized.match(/gamma[_-]?([0-9.]+)/)
  if (gammaMatch) {
    const value = Number(gammaMatch[1])
    return Number.isFinite(value) ? value : null
  }

  const costMatch = normalized.match(/cost[_-]?([0-9.]+)/)
  if (costMatch) {
    const value = Number(costMatch[1])
    return Number.isFinite(value) ? value : null
  }

  const slotMatch = normalized.match(/(?:slot|time|seconds?)[_-]?([0-9.]+)/)
  if (slotMatch) {
    const value = Number(slotMatch[1])
    return Number.isFinite(value) ? value : null
  }

  return null
}

function publishedEvaluationSortValue(
  evaluation: string,
): number {
  switch (inferPublishedExperiment(evaluation)) {
    case 'baseline':
      return 0
    case 'EXP 1':
      return 1
    case 'EXP 2':
      return 2
    case 'EXP 3':
      return 3
    case 'EXP 4a':
      return 4
    case 'EXP 4b':
      return 5
    default:
      return 99
  }
}

function formatPublishedScenarioCompactLabel(
  entry: PublishedExploreComparableEntry,
): string {
  if (entry.evaluation === 'Baseline') return 'Baseline'
  const gamma = readPublishedEntryGamma(entry)
  if (gamma != null) {
    return `γ ${formatMetricNumber(gamma, 2)}`
  }

  if (entry.result && entry.result !== 'cost_0.002') {
    return formatPublishedResultLabel(entry.result)
  }

  return formatPublishedEvaluationLabel(entry.evaluation)
}

function collectPublishedScenarioEntries(
  responses: readonly PublishedResultsToolResponse[],
): PublishedExploreComparableEntry[] {
  const seen = new Set<string>()
  const collected: PublishedExploreComparableEntry[] = []

  for (const response of responses) {
    for (const entry of [
      ...response.results,
      ...(response.pairedComparison ? [response.pairedComparison] : []),
    ]) {
      if (seen.has(entry.datasetPath)) continue
      seen.add(entry.datasetPath)
      collected.push(entry)
    }
  }

  return collected
}

function countPublishedScenarioGroups(
  entries: readonly PublishedExploreComparableEntry[],
): number {
  return new Set(entries.map(buildPublishedScenarioGroupKey)).size
}

function buildPublishedScenarioMetricChartBlock(
  query: string,
  entries: readonly PublishedExploreComparableEntry[],
  templates?: readonly StudyDashboardSpec[],
): Block | null {
  const metricKey = selectPublishedScenarioMetricKey(query, templates)
  if (!metricKey) return null
  if (countPublishedScenarioGroups(entries) < 2) return null

  const scenarioGroups = new Map<string, PublishedExploreComparableEntry[]>()
  for (const entry of entries) {
    const groupKey = buildPublishedScenarioGroupKey(entry)
    const group = scenarioGroups.get(groupKey) ?? []
    group.push(entry)
    scenarioGroups.set(groupKey, group)
  }

  const orderedGroups = [...scenarioGroups.values()]
    .map(group => group.toSorted(
      (left, right) => publishedParadigmSortValue(left.paradigm) - publishedParadigmSortValue(right.paradigm),
    ))
    .toSorted((left, right) => {
      const leftRepresentative = left[0]!
      const rightRepresentative = right[0]!
      const evaluationDelta =
        publishedEvaluationSortValue(leftRepresentative.evaluation)
        - publishedEvaluationSortValue(rightRepresentative.evaluation)
      if (evaluationDelta !== 0) return evaluationDelta

      const leftSortValue = parsePublishedResultSortValue(leftRepresentative)
      const rightSortValue = parsePublishedResultSortValue(rightRepresentative)
      if (leftSortValue != null && rightSortValue != null && leftSortValue !== rightSortValue) {
        return leftSortValue - rightSortValue
      }

      return leftRepresentative.result.localeCompare(rightRepresentative.result)
    })

  const baseLabels = orderedGroups.map(group => formatPublishedScenarioCompactLabel(group[0]!))
  const labelCounts = new Map<string, number>()
  for (const label of baseLabels) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
  }

  const data = orderedGroups.flatMap((group, index) => {
    const representative = group[0]!
    const baseLabel = baseLabels[index]!
    const label = (labelCounts.get(baseLabel) ?? 0) > 1
      ? `${formatPublishedEvaluationLabel(representative.evaluation)} / ${baseLabel}`
      : baseLabel

    return group.flatMap(entry => {
      const metricValue = entry.finalMetrics[metricKey] ?? null
      if (metricValue == null) return []
      return [{
        label,
        value: metricValue,
        category: publishedParadigmDisplayLabel(entry.paradigm),
      }]
    })
  })

  if (data.length < 2) return null

  const representativeEntries = orderedGroups.map(group => group[0]!)
  const sameEvaluation = representativeEntries.every(entry => entry.evaluation === representativeEntries[0]?.evaluation)
    ? representativeEntries[0]?.evaluation ?? null
    : null

  return {
    type: 'chart',
    title: sameEvaluation
      ? `${publishedMetricTitle(metricKey)} across ${formatPublishedEvaluationLabel(sameEvaluation)} scenarios`
      : `${publishedMetricTitle(metricKey)} across retrieved scenarios`,
    chartType: 'bar',
    data,
    unit: publishedMetricUnit(metricKey),
    cite: sameEvaluation
      ? buildPublishedExploreCite(representativeEntries, null)
      : undefined,
  }
}

function selectPublishedMetricKey(
  query: string,
  templates?: readonly StudyDashboardSpec[],
): PublishedExploreMetricKey | null {
  const matchers: ReadonlyArray<{
    readonly key: PublishedExploreMetricKey
    readonly pattern: RegExp
  }> = [
    { key: 'proposal_times', pattern: /\b(proposal|latency|response time|block time)\b/i },
    { key: 'failed_block_proposals', pattern: /\bfailed block|missed block|failed proposal\b/i },
    { key: 'gini', pattern: /\bgini|inequality|centrali[sz]ation|concentration\b/i },
    { key: 'hhi', pattern: /\bhhi|herfindahl\b/i },
    { key: 'attestations', pattern: /\battestations\b|\battestation (?:count|rate|share|level)\b/i },
    { key: 'liveness', pattern: /\bliveness|uptime|availability\b/i },
    { key: 'mev', pattern: /\bmev\b/i },
    { key: 'clusters', pattern: /\bcluster\b/i },
    { key: 'total_distance', pattern: /\bdistance|dispersion\b/i },
  ]

  const match = matchers.find(candidate => candidate.pattern.test(query))
  return match?.key ?? resolveTemplateMetricKeys(templates ?? [])
}

function selectPublishedScenarioMetricKey(
  query: string,
  templates?: readonly StudyDashboardSpec[],
): PublishedExploreMetricKey | null {
  const explicitMetric = selectPublishedMetricKey(query, templates)
  if (explicitMetric) return explicitMetric

  const templateMetric = resolveTemplateMetricKeys(templates ?? [])
  if (templateMetric) return templateMetric

  return /\b(compare|comparison|versus|vs\b|difference|gap|change|changes|higher|lower)\b/i.test(query)
    ? 'gini'
    : null
}

function publishedMetricTitle(key: PublishedExploreMetricKey): string {
  switch (key) {
    case 'gini':
      return 'Gini'
    case 'hhi':
      return 'HHI'
    case 'liveness':
      return 'Liveness'
    case 'proposal_times':
      return 'Proposal latency'
    case 'mev':
      return 'Average MEV'
    case 'attestations':
      return 'Attestations'
    case 'clusters':
      return 'Clusters'
    case 'failed_block_proposals':
      return 'Failed proposals'
    case 'total_distance':
      return 'Total distance'
    default:
      return publishedMetricLabel(key)
  }
}

function publishedMetricSemantics(
  key: PublishedExploreMetricKey,
): 'lower-is-better' | 'higher-is-better' | null {
  switch (key) {
    case 'gini':
    case 'hhi':
    case 'proposal_times':
    case 'failed_block_proposals':
    case 'total_distance':
      return 'lower-is-better'
    case 'liveness':
    case 'attestations':
      return 'higher-is-better'
    default:
      return null
  }
}

function inferPublishedExperiment(
  evaluation: string | undefined,
): Cite['experiment'] | undefined {
  if (!evaluation) return undefined
  if (evaluation === 'Baseline') return 'baseline'
  if (evaluation.startsWith('SE1-')) return 'EXP 1'
  if (evaluation.startsWith('SE2-')) return 'EXP 2'
  if (evaluation.startsWith('SE3-')) return 'EXP 3'
  if (evaluation.startsWith('SE4-Attestation')) return 'EXP 4a'
  if (evaluation.startsWith('SE4-EIP7782')) return 'EXP 4b'
  return undefined
}

function findStudyPaperChartBlock(
  dataKey: string,
): { title: string; cite?: Cite } | null {
  for (const section of ACTIVE_STUDY.sections) {
    const matchingBlock = section.blocks.find(
      (block): block is Extract<Block, { type: 'paperChart' }> =>
        block.type === 'paperChart' && block.dataKey === dataKey,
    )
    if (matchingBlock) {
      return {
        title: matchingBlock.title,
        cite: matchingBlock.cite,
      }
    }
  }
  return null
}

function findStudyResultsTemplate(
  chartKey: string | null,
): StudyDashboardSpec | null {
  if (!chartKey) return null
  const dashboardId = ACTIVE_STUDY.paperCharts[chartKey]?.dashboardId
  if (!dashboardId) return null
  return ACTIVE_STUDY.dashboards.find(dashboard => dashboard.id === dashboardId) ?? null
}

function findStudyQueryView(
  viewId: string | undefined,
): StudyAssistantQueryView | null {
  if (!viewId) return null
  return ACTIVE_STUDY_QUERY_VIEWS.find(view => view.id === viewId) ?? null
}

function resolveQueryViewAllowedDimensions(
  view: StudyAssistantQueryView | null,
): readonly PublishedResultsQueryDimension[] {
  const source = view?.constraints?.dimensions ?? view?.defaultDimensions ?? publishedResultsQueryDimensionValues
  const allowed = source.filter((value): value is PublishedResultsQueryDimension =>
    publishedResultsQueryDimensionValues.includes(value as PublishedResultsQueryDimension),
  )
  return allowed.length > 0 ? allowed : [...publishedResultsQueryDimensionValues]
}

function resolveQueryViewAllowedMetrics(
  view: StudyAssistantQueryView | null,
): readonly PublishedExploreMetricKey[] {
  const source = view?.constraints?.metrics ?? view?.defaultMetrics ?? publishedExploreMetricValues
  const allowed = source.filter((value): value is PublishedExploreMetricKey =>
    publishedExploreMetricValues.includes(value as PublishedExploreMetricKey),
  )
  return allowed.length > 0 ? allowed : [...publishedExploreMetricValues]
}

function resolveQueryViewAllowedOrderBy(
  view: StudyAssistantQueryView | null,
): readonly string[] {
  const source = view?.constraints?.orderBy ?? [
    ...resolveQueryViewAllowedMetrics(view),
    ...resolveQueryViewAllowedDimensions(view),
  ]
  const allowed = source
    .map(value => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
  return allowed.length > 0 ? allowed : ['gini']
}

function resolveQueryViewSupportedSlots(
  view: StudyAssistantQueryView | null,
): readonly ('initial' | 'final')[] {
  const source = view?.constraints?.slots ?? ['final', 'initial']
  const allowed = source.filter((value): value is 'initial' | 'final' =>
    value === 'initial' || value === 'final',
  )
  return allowed.length > 0 ? allowed : ['final', 'initial']
}

function resolveQueryViewFilterOptions(
  view: StudyAssistantQueryView | null,
  key: PublishedResultsQueryFilterKey,
): readonly string[] {
  const source = view?.constraints?.filters?.[key]
  if (!source?.length) return []
  return source
    .map(value => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
}

function normalizeQueryViewParadigmOptions(
  view: StudyAssistantQueryView | null,
): readonly PublishedCatalogParadigm[] {
  return resolveQueryViewFilterOptions(view, 'paradigm')
    .map(value => normalizePublishedCatalogParadigm(value))
    .filter((value): value is PublishedCatalogParadigm => value !== null)
}

function normalizeQueryViewEvaluationOptions(
  view: StudyAssistantQueryView | null,
): readonly string[] {
  return resolveQueryViewFilterOptions(view, 'evaluation')
    .map(value => normalizePublishedEvaluationFilter(value))
    .filter((value): value is string => Boolean(value))
}

function normalizeQueryViewResultOptions(
  view: StudyAssistantQueryView | null,
): readonly string[] {
  return resolveQueryViewFilterOptions(view, 'result')
    .map(value => value.trim())
    .filter(Boolean)
}

function describeStructuredQueryConstraintList(
  values: readonly string[],
): string {
  return values.join(', ')
}

function resolveStructuredResultsQueryPlan(input: {
  readonly queryHint?: string
  readonly viewId?: string
  readonly dimensions?: readonly PublishedResultsQueryDimension[]
  readonly metrics?: readonly PublishedExploreMetricKey[]
  readonly filters?: {
    readonly evaluation?: string
    readonly paradigm?: string
    readonly result?: string
  }
  readonly slot?: 'initial' | 'final'
  readonly orderBy?: string
  readonly order?: 'asc' | 'desc'
  readonly limit?: number
}): StructuredResultsQueryPlan {
  const queryView = findStudyQueryView(input.viewId) ?? resolveStudyQueryView(input.queryHint ?? '')
  const notes: string[] = []

  const allowedDimensions = resolveQueryViewAllowedDimensions(queryView)
  const requestedDimensions = (input.dimensions ?? [])
    .filter((value): value is PublishedResultsQueryDimension =>
      publishedResultsQueryDimensionValues.includes(value as PublishedResultsQueryDimension),
    )
  const filteredDimensions = requestedDimensions.filter(value => allowedDimensions.includes(value))
  const dimensions = filteredDimensions.length > 0
    ? filteredDimensions
    : queryView?.defaultDimensions?.filter((value): value is PublishedResultsQueryDimension =>
        allowedDimensions.includes(value as PublishedResultsQueryDimension),
      ) ?? allowedDimensions.slice(0, 3)
  if (requestedDimensions.length > 0 && filteredDimensions.length !== requestedDimensions.length) {
    const unsupported = requestedDimensions.filter(value => !allowedDimensions.includes(value))
    notes.push(`Dropped unsupported dimensions: ${describeStructuredQueryConstraintList(unsupported)}.`)
  }

  const allowedMetrics = resolveQueryViewAllowedMetrics(queryView)
  const requestedMetrics = (input.metrics ?? [])
    .filter((value): value is PublishedExploreMetricKey =>
      publishedExploreMetricValues.includes(value as PublishedExploreMetricKey),
    )
  const filteredMetrics = requestedMetrics.filter(value => allowedMetrics.includes(value))
  const metrics = filteredMetrics.length > 0
    ? filteredMetrics
    : queryView?.defaultMetrics?.filter((value): value is PublishedExploreMetricKey =>
        allowedMetrics.includes(value as PublishedExploreMetricKey),
      ) ?? allowedMetrics.slice(0, 2)
  if (requestedMetrics.length > 0 && filteredMetrics.length !== requestedMetrics.length) {
    const unsupported = requestedMetrics.filter(value => !allowedMetrics.includes(value))
    notes.push(`Dropped unsupported metrics: ${describeStructuredQueryConstraintList(unsupported)}.`)
  }

  const supportedSlots = resolveQueryViewSupportedSlots(queryView)
  const slot = input.slot && supportedSlots.includes(input.slot)
    ? input.slot
    : supportedSlots[0] ?? 'final'
  if (input.slot && slot !== input.slot) {
    notes.push(`Used the ${slot} snapshot because this study surface does not support ${input.slot}.`)
  }

  const allowedOrderBy = resolveQueryViewAllowedOrderBy(queryView)
  const defaultOrderBy = (() => {
    const candidate = queryView?.defaultOrderBy?.trim()
    return candidate && allowedOrderBy.includes(candidate) ? candidate : allowedOrderBy[0] ?? null
  })()
  const requestedOrderBy = input.orderBy?.trim() || null
  const orderBy = requestedOrderBy && allowedOrderBy.includes(requestedOrderBy)
    ? requestedOrderBy
    : defaultOrderBy
  if (requestedOrderBy && orderBy !== requestedOrderBy) {
    notes.push(`Sorted by ${orderBy ?? 'the default key'} because ${requestedOrderBy} is outside this study surface.`)
  }

  const evaluationOptions = normalizeQueryViewEvaluationOptions(queryView)
  const requestedEvaluation = normalizePublishedEvaluationFilter(input.filters?.evaluation ?? queryView?.filterPreset?.evaluation)
  const evaluation = evaluationOptions.length > 0
    ? requestedEvaluation && evaluationOptions.includes(requestedEvaluation)
      ? requestedEvaluation
      : normalizePublishedEvaluationFilter(queryView?.filterPreset?.evaluation)
        ?? evaluationOptions[0]
    : requestedEvaluation
  if (requestedEvaluation && evaluation !== requestedEvaluation && evaluationOptions.length > 0) {
    notes.push(`Kept the query inside ${queryView?.title ?? 'the matched view'} by using ${evaluation}.`)
  }

  const paradigmOptions = normalizeQueryViewParadigmOptions(queryView)
  const requestedParadigm = normalizePublishedCatalogParadigm(input.filters?.paradigm ?? queryView?.filterPreset?.paradigm)
  const paradigm = paradigmOptions.length > 0
    ? requestedParadigm && paradigmOptions.includes(requestedParadigm)
      ? requestedParadigm
      : normalizePublishedCatalogParadigm(queryView?.filterPreset?.paradigm)
        ?? paradigmOptions[0]
    : requestedParadigm
  if (requestedParadigm && paradigm !== requestedParadigm && paradigmOptions.length > 0) {
    notes.push(`Used ${paradigm} because the matched query view only exposes ${describeStructuredQueryConstraintList(paradigmOptions)}.`)
  }

  const resultOptions = normalizeQueryViewResultOptions(queryView)
  const requestedResult = input.filters?.result?.trim() || queryView?.filterPreset?.result?.trim() || undefined
  const result = resultOptions.length > 0
    ? requestedResult && resultOptions.includes(requestedResult)
      ? requestedResult
      : queryView?.filterPreset?.result?.trim()
        ?? undefined
    : requestedResult
  if (requestedResult && result !== requestedResult && resultOptions.length > 0) {
    notes.push(`Ignored the unsupported result filter "${requestedResult}" for this study surface.`)
  }

  const limit = Math.max(1, Math.min(20, input.limit ?? queryView?.defaultLimit ?? 8))
  const coerced = notes.length > 0

  return {
    view: queryView,
    dimensions: dimensions.length > 0 ? dimensions : allowedDimensions.slice(0, 3),
    metrics: metrics.length > 0 ? metrics : allowedMetrics.slice(0, 1),
    filters: {
      evaluation: evaluation ?? undefined,
      paradigm: paradigm ?? undefined,
      result: result ?? undefined,
    },
    slot,
    orderBy,
    order: (input.order ?? queryView?.defaultOrder) === 'asc' ? 'asc' : 'desc',
    limit,
    notes,
    coerced,
  }
}

function resolveQueryViewChartKeys(
  view: StudyAssistantQueryView | null,
): string[] {
  if (!view?.dashboardIds?.length) return []
  return Object.entries(ACTIVE_STUDY.paperCharts)
    .filter(([, chart]) => chart.dashboardId && view.dashboardIds?.includes(chart.dashboardId))
    .map(([dataKey]) => dataKey)
}

function scoreStudyQueryViewQuery(
  query: string,
  view: StudyAssistantQueryView,
): number {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return 0

  let score = 0
  for (const alias of view.aliases ?? []) {
    const normalizedAlias = alias.trim().toLowerCase()
    if (!normalizedAlias) continue
    if (normalized.includes(normalizedAlias)) {
      score += normalizedAlias.split(/\s+/).length >= 2 ? 2.5 : 1.5
    }
  }
  for (const prompt of view.prompts ?? []) {
    const normalizedPrompt = prompt.trim().toLowerCase()
    if (!normalizedPrompt) continue
    if (normalized.includes(normalizedPrompt)) score += 3
  }
  for (const useCase of view.bestFor ?? []) {
    const normalizedUseCase = useCase.trim().toLowerCase()
    if (!normalizedUseCase) continue
    if (normalized.includes(normalizedUseCase)) score += 1.5
  }
  for (const dashboardId of view.dashboardIds ?? []) {
    const dashboard = ACTIVE_STUDY.dashboards.find(candidate => candidate.id === dashboardId)
    if (!dashboard) continue
    const dashboardNeedles = [
      dashboard.title,
      dashboard.questionAnswered,
      dashboard.summary,
      dashboard.askMetricKey ?? '',
    ]
    for (const needle of dashboardNeedles) {
      const normalizedNeedle = needle.trim().toLowerCase()
      if (!normalizedNeedle) continue
      if (normalized.includes(normalizedNeedle)) score += 1
    }
  }
  for (const dimension of view.defaultDimensions ?? []) {
    if (normalized.includes(dimension.toLowerCase())) score += 0.6
  }
  for (const metric of view.defaultMetrics ?? []) {
    if (normalized.includes(metric.toLowerCase().replace(/_/g, ' ')) || normalized.includes(metric.toLowerCase())) score += 1.1
  }
  return score
}

function resolveStudyQueryView(
  query: string,
): StudyAssistantQueryView | null {
  const scored = ACTIVE_STUDY_QUERY_VIEWS
    .map(view => ({
      view,
      score: scoreStudyQueryViewQuery(query, view),
    }))
    .filter(candidate => candidate.score > 0)
    .toSorted((left, right) => right.score - left.score)

  const top = scored[0]
  return top && top.score >= 1.25 ? top.view : null
}

function resolveStudyResultsTemplates(
  query: string,
  chartKeys: readonly (string | null)[],
): StudyDashboardSpec[] {
  const templates = chartKeys
    .map(findStudyResultsTemplate)
    .filter((template): template is StudyDashboardSpec => template !== null)

  const deduped = templates.filter((template, index, all) =>
    all.findIndex(candidate => candidate.id === template.id) === index,
  )

  if (deduped.length > 0) return deduped

  return resolveExpectedStudyResultsTemplates(query)
}

function resolveStudyResultsTemplatesForResponses(
  query: string,
  responses: readonly PublishedResultsToolResponse[],
): StudyDashboardSpec[] {
  return resolveStudyResultsTemplates(
    query,
    responses.map(response => resolveCanonicalPaperChartKey(response)),
  )
}

function resolveStudyResultsTemplatesForBlocks(
  query: string,
  blocks: readonly Block[],
): StudyDashboardSpec[] {
  const paperChart = blocks.find(
    (block): block is Extract<Block, { type: 'paperChart' }> => block.type === 'paperChart',
  )
  const paperChartKeys = blocks
    .flatMap(block => block.type === 'paperChart' ? [block.dataKey] : [])

  return resolveStudyResultsTemplates(
    query,
    paperChartKeys.length > 0 ? paperChartKeys : [paperChart?.dataKey ?? null],
  )
}

function describeStudyResultsLead(
  template: StudyDashboardSpec,
): string {
  switch (template.pattern) {
    case 'timeseries-panel':
      return 'Lead with the reusable figure replay or chart, then add compact stats.'
    case 'parameter-sweep':
      return 'Lead with the sweep chart, then add the smallest supporting comparison needed.'
    case 'benchmark-matrix':
      return 'Lead with the cross-scenario matrix or chart, then highlight the key comparison.'
    case 'pre-post-comparison':
      return 'Lead with the comparison, then support it with the study-owned replay figure.'
    case 'geography-map':
      return 'Lead with the map surface and keep supporting numbers compact.'
    default:
      return 'Lead with the strongest study-owned Results block before adding interpretation.'
  }
}

function resolveTemplateMetricKey(
  template: StudyDashboardSpec | null,
): PublishedExploreMetricKey | null {
  return normalizePublishedMetricKey(template?.askMetricKey)
}

function resolveTemplateMetricKeys(
  templates: readonly StudyDashboardSpec[],
): PublishedExploreMetricKey | null {
  const keys = templates
    .map(template => resolveTemplateMetricKey(template))
    .filter((key): key is PublishedExploreMetricKey => key !== null)

  const uniqueKeys = [...new Set(keys)]
  return uniqueKeys.length === 1 ? uniqueKeys[0]! : null
}

function resolveExpectedStudyResultsTemplates(
  query: string,
): StudyDashboardSpec[] {
  const queryView = resolveStudyQueryView(query)
  if (queryView) {
    const queryViewTemplates = (queryView.dashboardIds ?? [])
      .map(dashboardId => ACTIVE_STUDY.dashboards.find(dashboard => dashboard.id === dashboardId) ?? null)
      .filter((template): template is StudyDashboardSpec => template !== null)
    if (queryViewTemplates.length > 0) {
      return queryViewTemplates
    }
  }
  const chartKeys = resolvePaperChartKeysFromQuery(query)
  if (chartKeys.length === 0) return []
  return chartKeys
    .map(findStudyResultsTemplate)
    .filter((template): template is StudyDashboardSpec => template !== null)
    .filter((template, index, all) =>
      all.findIndex(candidate => candidate.id === template.id) === index,
    )
}

function buildActiveResultsTemplateContext(
  query: string,
  cachedResults: unknown,
): string {
  const normalizedResponses = normalizePublishedResultsCollection(cachedResults)
  const templates = normalizedResponses.length > 0
    ? resolveStudyResultsTemplatesForResponses(query, normalizedResponses)
    : resolveExpectedStudyResultsTemplates(query)
  if (templates.length === 0) return ''

  if (templates.length === 1) {
    const [template] = templates
    return `\n\n## Active Results Template
- Template: ${template.title}
- Pattern: ${template.pattern}
- Question answered: ${template.questionAnswered}
- Summary: ${template.summary}
- Layout guidance: ${describeStudyResultsLead(template)}`
  }

  return `\n\n## Active Results Templates
This question spans multiple Results families. Start with a cross-family summary before individual figure replays.
${templates.map(template => `- ${template.title} (${template.pattern}): ${template.questionAnswered}`).join('\n')}`
}

function templateLeadPriority(
  template: StudyDashboardSpec,
  type: Block['type'],
): number {
  switch (template.pattern) {
    case 'timeseries-panel':
    case 'parameter-sweep':
    case 'benchmark-matrix':
      if (type === 'paperChart' || type === 'chart' || type === 'timeseries') return 0
      if (type === 'comparison') return 1
      if (type === 'stat') return 2
      if (type === 'table') return 3
      return 10 + stablePriority(type)
    case 'pre-post-comparison':
      if (type === 'comparison') return 0
      if (type === 'paperChart' || type === 'chart' || type === 'timeseries') return 1
      if (type === 'stat') return 2
      if (type === 'table') return 3
      return 10 + stablePriority(type)
    case 'geography-map':
      if (type === 'map') return 0
      if (type === 'comparison' || type === 'table') return 1
      if (type === 'stat') return 2
      return 10 + stablePriority(type)
    default:
      return 10 + stablePriority(type)
  }
}

function orderStudyResultsBlocks(
  query: string,
  blocks: readonly Block[],
  options?: { preserveLeadBlock?: boolean },
): Block[] {
  const ordered = orderBlocksEvidenceFirst(blocks, options)
  const templates = resolveStudyResultsTemplatesForBlocks(query, ordered)
  if (templates.length === 0) return ordered

  if (templates.length > 1) {
    return ordered
      .map((block, index) => ({ block, index }))
      .toSorted((left, right) => {
        const multiTemplatePriority = (type: Block['type']): number => {
          switch (type) {
            case 'chart':
            case 'comparison':
            case 'timeseries':
              return 0
            case 'paperChart':
              return 1
            case 'stat':
              return 2
            case 'table':
            case 'map':
              return 3
            default:
              return 10 + stablePriority(type)
          }
        }

        const priorityGap = multiTemplatePriority(left.block.type) - multiTemplatePriority(right.block.type)
        return priorityGap !== 0 ? priorityGap : left.index - right.index
      })
      .map(entry => entry.block)
  }

  const [template] = templates

  return ordered
    .map((block, index) => ({ block, index }))
    .toSorted((left, right) => {
      const templateGap =
        templateLeadPriority(template, left.block.type) - templateLeadPriority(template, right.block.type)
      return templateGap !== 0 ? templateGap : left.index - right.index
    })
    .map(entry => entry.block)
}

function resolvePublishedCompareEntries(
  response: PublishedResultsToolResponse,
): PublishedExploreComparableEntry[] {
  const combined = [
    ...response.results,
    ...(response.pairedComparison ? [response.pairedComparison] : []),
  ]
  if (combined.length === 0) return []

  for (const entry of combined) {
    const exactPair = combined.find(candidate =>
      candidate.datasetPath !== entry.datasetPath
      && candidate.evaluation === entry.evaluation
      && candidate.result === entry.result
      && candidate.paradigm !== entry.paradigm,
    )
    if (exactPair) {
      return [entry, exactPair].toSorted(
        (left, right) => publishedParadigmSortValue(left.paradigm) - publishedParadigmSortValue(right.paradigm),
      )
    }
  }

  const [first] = combined
  const fallbackPair = combined.find(candidate =>
    candidate.datasetPath !== first.datasetPath
    && candidate.paradigm !== first.paradigm,
  )

  return fallbackPair
    ? [first, fallbackPair].toSorted(
        (left, right) => publishedParadigmSortValue(left.paradigm) - publishedParadigmSortValue(right.paradigm),
      )
    : [first]
}

function resolveCanonicalPaperChartKey(
  response: PublishedResultsToolResponse,
): string | null {
  const selections = new Set(
    [
      ...response.results,
      ...(response.pairedComparison ? [response.pairedComparison] : []),
    ].map(entry => buildPublishedSelectionKey(entry)),
  )
  if (selections.size === 0) return null

  let bestMatch: { key: string; score: number } | null = null

  for (const [dataKey, chart] of Object.entries(ACTIVE_STUDY.paperCharts)) {
    const links = chart.publishedScenarioLinks ?? []
    if (links.length === 0) continue

    const matchedLinks = links.filter(link => selections.has(buildPublishedSelectionKey(link))).length
    if (matchedLinks === 0) continue

    const score = matchedLinks * 12 - Math.max(0, links.length - matchedLinks)
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { key: dataKey, score }
    }
  }

  return bestMatch?.key ?? null
}

function buildPublishedScenarioTitle(entries: readonly PublishedExploreComparableEntry[]): string {
  const evaluation = entries[0]?.evaluation
  if (!evaluation) return 'Published Results'
  const evaluationLabel = formatPublishedEvaluationLabel(evaluation)
  const result = entries[0]?.result
  if (!result || (evaluation === 'Baseline' && result === 'cost_0.002')) {
    return evaluationLabel
  }
  return `${evaluationLabel} (${formatPublishedResultLabel(result)})`
}

function buildPublishedExploreCite(
  entries: readonly PublishedExploreComparableEntry[],
  chartKey: string | null,
): Cite | undefined {
  if (chartKey) {
    const chartBlock = findStudyPaperChartBlock(chartKey)
    if (chartBlock?.cite) return chartBlock.cite
  }

  const experiment = inferPublishedExperiment(entries[0]?.evaluation)
  return experiment ? { experiment } : undefined
}

function buildPublishedMetricStatBlock(
  entry: PublishedExploreComparableEntry,
  counterpart: PublishedExploreComparableEntry | null,
  metricKey: PublishedExploreMetricKey | null,
  cite: Cite | undefined,
): Block | null {
  if (metricKey) {
    const metricValue = entry.finalMetrics[metricKey] ?? null
    if (metricValue != null) {
      const counterpartValue = counterpart?.finalMetrics[metricKey] ?? null
      const semantics = publishedMetricSemantics(metricKey)
      const delta = counterpartValue == null
        ? undefined
        : `vs ${publishedParadigmDisplayLabel(counterpart.paradigm)} ${metricValue >= counterpartValue ? '+' : '−'}${formatPublishedMetricValue(metricKey, Math.abs(metricValue - counterpartValue))}`
      const sentiment =
        counterpartValue == null || semantics == null
          ? undefined
          : (
              (semantics === 'lower-is-better' && metricValue < counterpartValue)
              || (semantics === 'higher-is-better' && metricValue > counterpartValue)
            )
              ? 'positive'
              : metricValue === counterpartValue
                ? 'neutral'
                : 'negative'

      return {
        type: 'stat',
        value: formatPublishedMetricValue(metricKey, metricValue),
        label: `${publishedParadigmDisplayLabel(entry.paradigm)} ${publishedMetricTitle(metricKey)}`,
        sublabel: `${buildPublishedScenarioTitle([entry])} at slot ${formatPublishedTotalSlots(entry.totalSlots)}`,
        delta,
        sentiment,
        cite,
      }
    }
  }

  if (entry.dominantRegion) {
    return {
      type: 'stat',
      value: `${formatMetricNumber(entry.dominantRegion.share, 1)}%`,
      label: `${publishedParadigmDisplayLabel(entry.paradigm)} top-region share`,
      sublabel: `${entry.dominantRegion.city ?? entry.dominantRegion.regionId} at slot ${formatPublishedTotalSlots(entry.totalSlots)}`,
      cite,
    }
  }

  return {
    type: 'stat',
    value: entry.activeRegions.toLocaleString(),
    label: `${publishedParadigmDisplayLabel(entry.paradigm)} active regions`,
    sublabel: `${buildPublishedScenarioTitle([entry])} at slot ${formatPublishedTotalSlots(entry.totalSlots)}`,
    cite,
  }
}

function buildPublishedComparisonBlock(
  left: PublishedExploreComparableEntry,
  right: PublishedExploreComparableEntry,
  metricKey: PublishedExploreMetricKey | null,
  cite: Cite | undefined,
): Block {
  const leftItems: Array<{ key: string; value: string }> = []
  const rightItems: Array<{ key: string; value: string }> = []

  if (metricKey) {
    leftItems.push({
      key: publishedMetricTitle(metricKey),
      value: formatPublishedMetricValue(metricKey, left.finalMetrics[metricKey] ?? null),
    })
    rightItems.push({
      key: publishedMetricTitle(metricKey),
      value: formatPublishedMetricValue(metricKey, right.finalMetrics[metricKey] ?? null),
    })
  }

  leftItems.push(
    { key: 'Active regions', value: left.activeRegions.toLocaleString() },
    {
      key: 'Top region',
      value: left.dominantRegion
        ? `${left.dominantRegion.city ?? left.dominantRegion.regionId} (${formatMetricNumber(left.dominantRegion.share, 1)}%)`
        : 'N/A',
    },
    { key: 'Dataset', value: formatPublishedResultLabel(left.result) },
  )

  rightItems.push(
    { key: 'Active regions', value: right.activeRegions.toLocaleString() },
    {
      key: 'Top region',
      value: right.dominantRegion
        ? `${right.dominantRegion.city ?? right.dominantRegion.regionId} (${formatMetricNumber(right.dominantRegion.share, 1)}%)`
        : 'N/A',
    },
    { key: 'Dataset', value: formatPublishedResultLabel(right.result) },
  )

  const leftMetricValue = metricKey ? left.finalMetrics[metricKey] ?? null : null
  const rightMetricValue = metricKey ? right.finalMetrics[metricKey] ?? null : null
  const semantics = metricKey ? publishedMetricSemantics(metricKey) : null
  const verdict = metricKey && leftMetricValue != null && rightMetricValue != null
    ? (() => {
        if (leftMetricValue === rightMetricValue) {
          return `${publishedParadigmDisplayLabel(left.paradigm)} and ${publishedParadigmDisplayLabel(right.paradigm)} finish even on ${publishedMetricTitle(metricKey).toLowerCase()}.`
        }
        const leftWins =
          semantics == null
            ? leftMetricValue > rightMetricValue
            : semantics === 'lower-is-better'
              ? leftMetricValue < rightMetricValue
              : leftMetricValue > rightMetricValue
        const winningEntry = leftWins ? left : right
        const winningValue = leftWins ? leftMetricValue : rightMetricValue
        const losingValue = leftWins ? rightMetricValue : leftMetricValue
        const comparator = semantics === 'lower-is-better' ? 'lower' : semantics === 'higher-is-better' ? 'higher' : 'different'
        return `${publishedParadigmDisplayLabel(winningEntry.paradigm)} finishes with ${comparator} ${publishedMetricTitle(metricKey).toLowerCase()} (${formatPublishedMetricValue(metricKey, winningValue)} vs ${formatPublishedMetricValue(metricKey, losingValue)}).`
      })()
    : `${publishedParadigmDisplayLabel(left.paradigm)} and ${publishedParadigmDisplayLabel(right.paradigm)} end in the same published scenario family with different geographic footprints.`

  return {
    type: 'comparison',
    title: `${buildPublishedScenarioTitle([left, right])}: ${publishedParadigmDisplayLabel(left.paradigm)} vs ${publishedParadigmDisplayLabel(right.paradigm)}`,
    left: {
      label: publishedParadigmDisplayLabel(left.paradigm),
      items: leftItems,
    },
    right: {
      label: publishedParadigmDisplayLabel(right.paradigm),
      items: rightItems,
    },
    verdict,
    cite,
  }
}

function buildCanonicalExploreBlocks(
  query: string,
  cachedResults: unknown,
): Block[] {
  const normalizedResults = normalizePublishedResultsToolResponse(cachedResults)
  if (!normalizedResults) return []

  const scenarioEntries = collectPublishedScenarioEntries([normalizedResults])
  const hasScenarioSweep = countPublishedScenarioGroups(scenarioEntries) > 1
  const compareEntries = resolvePublishedCompareEntries(normalizedResults)
  if (compareEntries.length === 0) return []

  const chartKey = resolveCanonicalPaperChartKey(normalizedResults)
  const templates = resolveStudyResultsTemplates(query, [chartKey])
  const metricKey = selectPublishedMetricKey(query, templates)
  const cite = buildPublishedExploreCite(compareEntries, chartKey)
  const blocks: Block[] = []

  if (hasScenarioSweep) {
    const sweepChart = buildPublishedScenarioMetricChartBlock(query, scenarioEntries, templates)
    if (sweepChart) {
      blocks.push(sweepChart)
    }
  } else {
    const heroStats = compareEntries
      .slice(0, 2)
      .map((entry, index, all) =>
        buildPublishedMetricStatBlock(entry, all.length > 1 ? all[1 - index] ?? null : null, metricKey, cite),
      )
      .filter((block): block is Block => block !== null)

    blocks.push(...heroStats)

    if (compareEntries.length >= 2) {
      blocks.push(buildPublishedComparisonBlock(compareEntries[0]!, compareEntries[1]!, metricKey, cite))
    }
  }

  if (chartKey) {
    const chartBlock = findStudyPaperChartBlock(chartKey)
    blocks.push({
      type: 'paperChart',
      title: chartBlock?.title ?? `${buildPublishedScenarioTitle(compareEntries)}: published figure`,
      dataKey: chartKey,
      cite: chartBlock?.cite ?? cite,
    })
  }

  return blocks
}

function normalizePublishedResultsCollection(
  cachedResults: unknown,
): PublishedResultsToolResponse[] {
  if (Array.isArray(cachedResults)) {
    return cachedResults
      .map(normalizePublishedResultsToolResponse)
      .filter((response): response is PublishedResultsToolResponse => response !== null)
  }

  const response = normalizePublishedResultsToolResponse(cachedResults)
  return response ? [response] : []
}

function extractArtifactBlocks(
  value: unknown,
): Block[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = value as { blocks?: unknown }
  return parseBlocks(Array.isArray(candidate.blocks) ? candidate.blocks : [])
}

function structuredResultsQueryPlanSignature(
  queryPlan: StructuredResultsQueryPlan,
): string {
  return JSON.stringify({
    viewId: queryPlan.view?.id ?? null,
    dimensions: [...queryPlan.dimensions],
    metrics: [...queryPlan.metrics],
    filters: queryPlan.filters,
    slot: queryPlan.slot,
    orderBy: queryPlan.orderBy,
    order: queryPlan.order,
    limit: queryPlan.limit,
  })
}

function clampPromptSnippet(
  value: string | undefined,
  limit = 320,
): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return ''
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`
}

function buildStructuredResultsPrefetchContext(
  execution: StructuredResultsExecution | null,
): string {
  if (!execution) return ''

  const { queryPlan, result } = execution
  const chartLabels = extractArtifactBlocks(result)
    .flatMap(block =>
      block.type === 'chart' || block.type === 'paperChart' || block.type === 'table'
        ? [block.title?.trim() || block.type]
        : [],
    )
    .slice(0, 3)
  const queryViewLabel = queryPlan.view
    ? `${queryPlan.view.title} (${queryPlan.view.id})`
    : 'direct structured Results view'
  const dimensions = queryPlan.dimensions.join(', ')
  const metrics = queryPlan.metrics.map(metric => publishedMetricTitle(metric)).join(', ')
  const filters = [
    queryPlan.filters.evaluation,
    queryPlan.filters.paradigm,
    queryPlan.filters.result,
  ].filter(Boolean).join(' / ')

  return `\n\n## Prefetched Structured Results\nA typed study query already ran before reasoning began.\n- View: ${queryViewLabel}\n- Dimensions: ${dimensions || 'default'}\n- Metrics: ${metrics || 'default'}\n- Snapshot: ${queryPlan.slot}\n${filters ? `- Filters: ${filters}\n` : ''}- Summary: ${clampPromptSnippet(result.summary, 180)}\n- Detail: ${clampPromptSnippet(result.description, 220)}\n${chartLabels.length > 0 ? `- Streamed scaffold: ${chartLabels.join(' | ')}\n` : ''}Reuse that canonical chart/table scaffold unless you need a materially different supported query.`
}

function selectScenarioComparisonBlocks(
  query: string,
  responses: readonly PublishedResultsToolResponse[],
): Block[] {
  const merged: Block[] = []
  const templates = resolveStudyResultsTemplatesForResponses(query, responses)
  const scenarioChart = buildPublishedScenarioMetricChartBlock(
    query,
    collectPublishedScenarioEntries(responses),
    templates,
  )
  if (scenarioChart) {
    merged.push(scenarioChart)
  }

  for (const response of responses) {
    const blocks = buildCanonicalExploreBlocks(query, response)
    const comparison = blocks.find(block => block.type === 'comparison')
    const paperChart = blocks.find(block => block.type === 'paperChart')
    if (comparison) merged.push(comparison)
    if (paperChart) merged.push(paperChart)
  }

  return merged.filter((block, index, all) =>
    all.findIndex(candidate => blockSignature(candidate) === blockSignature(block)) === index,
  )
}

function scoreStudyResultsTemplateQuery(
  query: string,
  dataKey: string,
  chart: typeof ACTIVE_STUDY.paperCharts[string],
): number {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return 0
  const normalizedQuery = query.toLowerCase()

  const dashboard = chart.dashboardId
    ? ACTIVE_STUDY.dashboards.find(candidate => candidate.id === chart.dashboardId)
    : null
  const aliasMatches = (chart.askAliases ?? [])
    .filter(alias => normalizedQuery.includes(alias.toLowerCase()))
    .length
  const lexicalScore = overlapScore(
    queryTokens,
    tokenize([
      dataKey,
      ...(chart.askAliases ?? []),
      chart.description,
      chart.takeaway,
      ...chart.metadata,
      ...(chart.publishedScenarioLinks ?? []).map(link =>
        `${link.label} ${link.evaluation} ${link.paradigm} ${link.result}`,
      ),
      dashboard?.title ?? '',
      dashboard?.questionAnswered ?? '',
      dashboard?.summary ?? '',
    ].join(' ')),
  )
  return lexicalScore + Math.min(0.75, aliasMatches * 0.45)
}

function resolvePaperChartKeysFromQuery(
  query: string,
  limit = 2,
): string[] {
  const scored = Object.entries(ACTIVE_STUDY.paperCharts)
    .map(([dataKey, chart]) => ({
      key: dataKey,
      score: scoreStudyResultsTemplateQuery(query, dataKey, chart),
    }))
    .filter(candidate => candidate.score > 0)
    .toSorted((left, right) => right.score - left.score)

  const bestScore = scored[0]?.score ?? 0
  if (bestScore <= 0) return []

  const threshold = Math.max(0.12, bestScore * 0.55)
  return scored
    .filter(candidate => candidate.score >= threshold)
    .slice(0, limit)
    .map(candidate => candidate.key)
}

function buildQueryPaperChartFallbackBlocks(
  query: string,
  options?: {
    excludeKeys?: readonly string[]
    limit?: number
  },
): Block[] {
  if (!isPrecomputedResultsExploreQuery(query)) return []
  const excludedKeys = new Set(options?.excludeKeys ?? [])
  const chartKeys = resolvePaperChartKeysFromQuery(query, options?.limit ?? 1)
    .filter(chartKey => !excludedKeys.has(chartKey))
  if (chartKeys.length === 0) return []

  return chartKeys.map(chartKey => {
    const chartBlock = findStudyPaperChartBlock(chartKey)
    return {
      type: 'paperChart',
      title: chartBlock?.title ?? `${formatPublishedEvaluationLabel(chartKey)} results`,
      dataKey: chartKey,
      cite: chartBlock?.cite,
    } satisfies Extract<Block, { type: 'paperChart' }>
  })
}

function buildExploreArtifactScaffold(
  query: string,
  cachedResults: unknown,
): Block[] {
  const normalizedResponses = normalizePublishedResultsCollection(cachedResults)
  if (normalizedResponses.length > 1) {
    const combinedBlocks = selectScenarioComparisonBlocks(query, normalizedResponses)
    if (combinedBlocks.length > 0) {
      return orderStudyResultsBlocks(
        query,
        combinedBlocks.slice(0, Math.max(4, MAX_GENERATED_BLOCKS - 2)),
      )
    }
  }

  const canonicalBlocks = normalizedResponses.length > 0
    ? buildCanonicalExploreBlocks(query, normalizedResponses[normalizedResponses.length - 1]!)
    : buildCanonicalExploreBlocks(query, cachedResults)
  const seededPaperChartKeys = canonicalBlocks
    .flatMap(block => block.type === 'paperChart' ? [block.dataKey] : [])
  const expectedPaperChartBlocks = normalizedResponses.length === 1
    ? buildQueryPaperChartFallbackBlocks(query, {
        excludeKeys: seededPaperChartKeys,
        limit: 2,
      })
    : []
  if (canonicalBlocks.some(block => block.type === 'paperChart')) {
    return orderStudyResultsBlocks(
      query,
      [...canonicalBlocks, ...expectedPaperChartBlocks].filter((block, index, all) =>
        all.findIndex(candidate => blockSignature(candidate) === blockSignature(block)) === index,
      ).slice(0, Math.max(4, MAX_GENERATED_BLOCKS - 1)),
    )
  }

  const fallbackChartBlocks = buildQueryPaperChartFallbackBlocks(query)
  if (fallbackChartBlocks.length === 0) {
    return orderStudyResultsBlocks(query, canonicalBlocks)
  }

  return orderStudyResultsBlocks(query, [...canonicalBlocks, ...fallbackChartBlocks])
}

function resolvePreferredPaperChartBlock(
  query: string,
  canonicalBlocks: readonly Block[] | undefined,
): Extract<Block, { type: 'paperChart' }> | null {
  const canonicalPaperChart = canonicalBlocks?.find(
    (block): block is Extract<Block, { type: 'paperChart' }> => block.type === 'paperChart',
  )
  if (canonicalPaperChart) return canonicalPaperChart

  const [fallbackBlock] = buildQueryPaperChartFallbackBlocks(query)
  return fallbackBlock?.type === 'paperChart' ? fallbackBlock : null
}

function ensurePaperChartBlock(
  blocks: readonly Block[],
  preferredPaperChart: Extract<Block, { type: 'paperChart' }> | null,
): Block[] {
  if (!preferredPaperChart || blocks.some(block => block.type === 'paperChart')) {
    return [...blocks]
  }

  const nextBlocks = [...blocks]
  if (nextBlocks.length >= MAX_GENERATED_BLOCKS) {
    const removableIndex = [...nextBlocks.keys()]
      .reverse()
      .find(index => nextBlocks[index]!.type !== 'source' && nextBlocks[index]!.type !== 'caveat')
    if (removableIndex != null && removableIndex >= 0) {
      nextBlocks.splice(removableIndex, 1)
    } else {
      nextBlocks.pop()
    }
  }

  const insertionIndex = nextBlocks.findIndex(block =>
    block.type === 'insight'
    || block.type === 'caveat'
    || block.type === 'source',
  )

  if (insertionIndex >= 0) {
    nextBlocks.splice(insertionIndex, 0, preferredPaperChart)
  } else {
    nextBlocks.push(preferredPaperChart)
  }

  return nextBlocks
}

function mergeCanonicalExploreBlocks(
  query: string,
  summary: string | undefined,
  canonicalBlocks: readonly Block[],
  modelBlocks: readonly Block[],
): Block[] {
  const canonicalEvidence = orderStudyResultsBlocks(query, canonicalBlocks)
  const merged: Block[] = [...canonicalEvidence]

  const hasCanonicalComparison = canonicalEvidence.some(block => block.type === 'comparison')
  const supportingComparison = !hasCanonicalComparison
    ? modelBlocks.find(block => block.type === 'comparison')
    : null
  const supportingInsight = modelBlocks.find(block => block.type === 'insight')
  const supportingCaveat = modelBlocks.find(block => block.type === 'caveat')
  const supportingSource = modelBlocks.find(block => block.type === 'source')

  if (supportingComparison) {
    merged.push(supportingComparison)
  }

  if (supportingInsight) {
    merged.push(supportingInsight)
  } else {
    const summaryText = limitText(summary, 380)
    if (summaryText) {
      merged.push({
        type: 'insight',
        emphasis: 'normal',
        title: 'Answer',
        text: summaryText,
      })
    }
  }

  if (supportingCaveat) {
    merged.push(supportingCaveat)
  }

  if (supportingSource) {
    merged.push(supportingSource)
  }

  const finalized = ensurePaperChartBlock(
    orderStudyResultsBlocks(query, merged),
    resolvePreferredPaperChartBlock(query, canonicalBlocks),
  )

  if (finalized.length >= MAX_GENERATED_BLOCKS) {
    return finalized.slice(0, MAX_GENERATED_BLOCKS)
  }

  const padded = [...finalized]
  if (!padded.some(block => block.type === 'caveat') && padded.length < MAX_GENERATED_BLOCKS) {
    padded.push(DEFAULT_GENERATED_CAVEAT_BLOCK)
  }
  if (!padded.some(block => block.type === 'source') && padded.length < MAX_GENERATED_BLOCKS) {
    padded.push(DEFAULT_GENERATED_SOURCE_BLOCK)
  }
  return padded.slice(0, MAX_GENERATED_BLOCKS)
}

function normalizePublishedPaperLens(
  value: unknown,
): 'evidence' | 'theory' | 'methods' {
  return value === 'theory' || value === 'methods' ? value : 'evidence'
}

function normalizePublishedAudienceMode(
  value: unknown,
): 'reader' | 'reviewer' | 'researcher' {
  return value === 'reviewer' || value === 'researcher' ? value : 'reader'
}

function toNonNegativeInteger(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null
}

function buildPublishedReplayNoteThreadKey(args: {
  datasetPath: string
  comparePath?: string | null
  slotIndex: number
  comparisonSlotIndex?: number | null
  paperLens: 'evidence' | 'theory' | 'methods'
  audienceMode: 'reader' | 'reviewer' | 'researcher'
}): string {
  return JSON.stringify([
    args.datasetPath,
    args.comparePath ?? '',
    args.slotIndex,
    args.comparisonSlotIndex ?? '',
    args.paperLens,
    args.audienceMode,
  ])
}

async function loadPublishedReplayNotesStore(): Promise<void> {
  try {
    const raw = await fs.readFile(PUBLISHED_REPLAY_NOTES_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, PublishedReplayNote[]>
    if (!parsed || typeof parsed !== 'object') {
      return
    }

    publishedReplayNotesStore.clear()
    for (const [threadKey, notes] of Object.entries(parsed)) {
      if (!Array.isArray(notes)) continue
      publishedReplayNotesStore.set(threadKey, notes)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error('Failed to load published replay notes from disk.', error)
    }
  }
}

function persistPublishedReplayNotesStore(): Promise<void> {
  publishedReplayNotesPersistPromise = publishedReplayNotesPersistPromise
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(PUBLISHED_REPLAY_NOTES_FILE), { recursive: true })
      const serialized = Object.fromEntries(publishedReplayNotesStore.entries())
      await fs.writeFile(PUBLISHED_REPLAY_NOTES_FILE, JSON.stringify(serialized, null, 2), 'utf8')
    })

  return publishedReplayNotesPersistPromise
}

function findPublishedReplayNoteById(
  noteId: string,
): { threadKey: string; notes: PublishedReplayNote[]; note: PublishedReplayNote; index: number } | null {
  for (const [threadKey, notes] of publishedReplayNotesStore.entries()) {
    const index = notes.findIndex(note => note.id === noteId)
    if (index >= 0) {
      return {
        threadKey,
        notes,
        note: notes[index]!,
        index,
      }
    }
  }
  return null
}

async function buildPublishedReplayContext(
  request: PublishedReplayCopilotRequest,
): Promise<{
  readonly datasetPath: string
  readonly comparePath?: string
  readonly focusSnapshot: ReturnType<typeof buildPublishedSlotSummary>
  readonly compareFocusSnapshot?: ReturnType<typeof buildPublishedSlotSummary>
  readonly context: string
}> {
  const datasetPath = normalizePublishedDatasetPath(request.datasetPath)
  if (!datasetPath) {
    throw new Error('The selected published dataset could not be resolved.')
  }

  const payload = await loadPublishedReplayPayload(datasetPath)
  const totalSlots = totalPublishedSlots(payload)
  const focusSlot = clampPublishedSlot(request.focusSlot, payload)
  const finalSlot = Math.max(0, totalSlots - 1)
  const focusSnapshot = buildPublishedSlotSummary(payload, focusSlot)
  const finalSnapshot = buildPublishedSlotSummary(payload, finalSlot)
  const initialSnapshot = buildPublishedSlotSummary(payload, 0)

  const comparePath = normalizePublishedDatasetPath(request.comparePath)
  const comparePayload = comparePath ? await loadPublishedReplayPayload(comparePath) : null
  const compareFocusSnapshot = comparePayload
    ? buildPublishedSlotSummary(comparePayload, clampPublishedSlot(request.focusSlot, comparePayload))
    : null
  const compareFinalSnapshot = comparePayload
    ? buildPublishedSlotSummary(comparePayload, Math.max(0, totalPublishedSlots(comparePayload) - 1))
    : null

  const metricDigestLines = ([
    'gini',
    'hhi',
    'liveness',
    'mev',
    'proposal_times',
    'failed_block_proposals',
    'total_distance',
    'clusters',
    'attestations',
  ] as const)
    .map(key => summarizePublishedSeries(key, payload.metrics?.[key]))
    .filter((line): line is string => Boolean(line))

  const compareMetricLines = comparePayload && compareFinalSnapshot
    ? ([
        'gini',
        'hhi',
        'liveness',
        'mev',
        'proposal_times',
        'failed_block_proposals',
      ] as const)
        .map(key => {
          const primaryValue = finalSnapshot.metrics[key]
          const compareValue = compareFinalSnapshot.metrics[key]
          if (primaryValue == null || compareValue == null) return null
          return `- ${publishedMetricLabel(key)}: active=${formatPublishedMetricValue(key, primaryValue)}, comparison=${formatPublishedMetricValue(key, compareValue)}`
        })
        .filter((line): line is string => Boolean(line))
    : []

  const parts = [
    '## Active Published Replay',
    `- label: ${request.datasetLabel?.trim() || toPublishedResultsRelativePath(datasetPath)}`,
    `- datasetPath: ${toPublishedResultsRelativePath(datasetPath)}`,
    `- sourceRole: ${sourceRoleLabel(request.sourceRole)}`,
    `- audienceMode: ${request.audienceMode ?? 'reader'}`,
    `- paperLens: ${request.paperLens ?? 'evidence'}`,
    `- totalSlots: ${totalSlots}`,
    `- validators: ${payload.v ?? 'N/A'}`,
    `- migrationCost: ${payload.cost ?? 'N/A'}`,
    `- deltaMs: ${payload.delta ?? 'N/A'}`,
    `- cutoffMs: ${payload.cutoff ?? 'N/A'}`,
    `- gamma: ${payload.gamma ?? 'N/A'}`,
    `- description: ${payload.description ?? 'No description supplied.'}`,
  ]

  if (request.currentViewSummary?.trim()) {
    parts.push(`- currentViewSummary: ${request.currentViewSummary.trim()}`)
  }

  if (request.paperSectionContext?.trim()) {
    parts.push(
      '## Canonical Paper Anchor',
      `- sectionId: ${request.paperSectionId?.trim() || 'unspecified'}`,
      `- sectionLabel: ${request.paperSectionLabel?.trim() || request.paperSectionId?.trim() || 'Selected paper section'}`,
      request.paperSectionContext.trim(),
    )
  }

  parts.push(...summarizeViewerSnapshotContext('Live Viewer Snapshot', request.viewerSnapshot))

  const sourceFootprint = summarizePublishedSourceFootprint(payload)
  if (sourceFootprint) {
    parts.push(`- sourceFootprint: ${sourceFootprint}`)
  }

  parts.push(
    ...summarizePublishedSlotSnapshot('Focus Slot Readout', focusSnapshot),
    ...summarizePublishedSlotSnapshot('Initial Slot Readout', initialSnapshot),
    ...summarizePublishedSlotSnapshot('Final Slot Readout', finalSnapshot),
  )

  if (metricDigestLines.length > 0) {
    parts.push('## Replay Metric Digests', ...metricDigestLines)
  }

  if (comparePayload && comparePath) {
    parts.push(
      '## Comparison Replay',
      `- label: ${request.compareLabel?.trim() || toPublishedResultsRelativePath(comparePath)}`,
      `- datasetPath: ${toPublishedResultsRelativePath(comparePath)}`,
      `- sourceRole: ${sourceRoleLabel(request.compareSourceRole)}`,
      `- description: ${comparePayload.description ?? 'No description supplied.'}`,
      ...summarizePublishedSlotSnapshot('Comparison Final Slot', compareFinalSnapshot!),
      ...summarizeViewerSnapshotContext('Live Comparison Viewer Snapshot', request.comparisonViewerSnapshot),
    )

    if (compareMetricLines.length > 0) {
      parts.push('## Final Metric Comparison', ...compareMetricLines)
    }
  }

  return {
    datasetPath,
    comparePath: comparePath ?? undefined,
    focusSnapshot,
    compareFocusSnapshot: compareFocusSnapshot ?? undefined,
    context: parts.join('\n'),
  }
}

function buildPublishedReplayEvidenceBlocks(
  request: PublishedReplayCopilotRequest,
  focusSnapshot: ReturnType<typeof buildPublishedSlotSummary>,
  compareFocusSnapshot?: ReturnType<typeof buildPublishedSlotSummary>,
): Block[] {
  const normalizedDatasetPath = request.datasetPath?.replace(/\\/g, '/')
  const normalizedComparePath = request.comparePath?.replace(/\\/g, '/')
  const dominantRegionLabel = focusSnapshot.dominantRegion
    ? `${focusSnapshot.dominantRegion.city ?? focusSnapshot.dominantRegion.regionId} leads with ${focusSnapshot.dominantRegion.count} of ${focusSnapshot.totalValidators} validators`
    : 'No dominant region is available for the active slot.'
  const blocks: Block[] = [
    {
      type: 'stat',
      value: focusSnapshot.metrics.gini != null ? formatMetricNumber(focusSnapshot.metrics.gini, 3) : 'N/A',
      label: 'Current geographic concentration',
      sublabel: `Gini at slot ${focusSnapshot.slotNumber}/${focusSnapshot.totalSlots}`,
    },
    {
      type: 'stat',
      value: focusSnapshot.dominantRegion ? `${formatMetricNumber(focusSnapshot.dominantRegion.share, 1)}%` : 'N/A',
      label: 'Dominant region share',
      sublabel: dominantRegionLabel,
    },
    {
      type: 'source',
      refs: [
        {
          label: 'Published replay dataset',
          section: request.datasetLabel?.trim() || normalizedDatasetPath || 'active replay',
          url: normalizedDatasetPath
            ? `https://github.com/syang-ng/geographical-decentralization-simulation/blob/main/dashboard/${normalizedDatasetPath}`
            : undefined,
        },
        ...(request.paperSectionLabel
          ? [{
              label: 'Canonical paper section',
              section: request.paperSectionLabel,
              url: 'https://arxiv.org/abs/2509.21475',
            }]
          : []),
        ...(normalizedComparePath
          ? [{
              label: 'Comparison replay dataset',
              section: request.compareLabel?.trim() || normalizedComparePath,
              url: `https://github.com/syang-ng/geographical-decentralization-simulation/blob/main/dashboard/${normalizedComparePath}`,
            }]
          : []),
      ],
    },
  ]

  if (!compareFocusSnapshot) {
    return blocks
  }

  blocks.push({
    type: 'table',
    title: 'Active replay vs comparison at the current slot',
    headers: [
      'Metric',
      request.datasetLabel?.trim() || 'Active replay',
      request.compareLabel?.trim() || 'Comparison replay',
    ],
    rows: [
      ['Active regions', String(focusSnapshot.activeRegions), String(compareFocusSnapshot.activeRegions)],
      [
        'Dominant region share',
        focusSnapshot.dominantRegion ? `${formatMetricNumber(focusSnapshot.dominantRegion.share, 1)}%` : 'N/A',
        compareFocusSnapshot.dominantRegion ? `${formatMetricNumber(compareFocusSnapshot.dominantRegion.share, 1)}%` : 'N/A',
      ],
      [
        'Gini',
        formatPublishedMetricValue('gini', focusSnapshot.metrics.gini),
        formatPublishedMetricValue('gini', compareFocusSnapshot.metrics.gini),
      ],
      [
        'Liveness',
        formatPublishedMetricValue('liveness', focusSnapshot.metrics.liveness),
        formatPublishedMetricValue('liveness', compareFocusSnapshot.metrics.liveness),
      ],
    ],
  })

  return blocks
}

function buildPublishedReplaySummary(
  request: PublishedReplayCopilotRequest,
  focusSnapshot: ReturnType<typeof buildPublishedSlotSummary>,
  compareFocusSnapshot?: ReturnType<typeof buildPublishedSlotSummary>,
): string {
  const dominantRegion = focusSnapshot.dominantRegion?.city ?? focusSnapshot.dominantRegion?.regionId ?? 'the leading region'
  const currentSlotLead = `At slot ${focusSnapshot.slotNumber}, ${request.datasetLabel?.trim() || 'the active replay'} shows ${focusSnapshot.activeRegions} active regions, ${focusSnapshot.dominantRegion ? `${formatMetricNumber(focusSnapshot.dominantRegion.share, 1)}% dominance in ${dominantRegion}` : 'no stable dominant region'}, and Gini ${formatPublishedMetricValue('gini', focusSnapshot.metrics.gini)}.`

  if (!compareFocusSnapshot) {
    return currentSlotLead
  }

  const relation = (() => {
    const activeGini = focusSnapshot.metrics.gini
    const compareGini = compareFocusSnapshot.metrics.gini
    if (activeGini == null || compareGini == null) return 'The comparison replay provides a second posture for reading the same slot.'
    if (activeGini < compareGini) {
      return `${request.compareLabel?.trim() || 'the comparison replay'} is more concentrated at the same slot (Gini ${formatPublishedMetricValue('gini', compareGini)}).`
    }
    if (activeGini > compareGini) {
      return `${request.datasetLabel?.trim() || 'The active replay'} is more concentrated than ${request.compareLabel?.trim() || 'the comparison replay'} at the same slot.`
    }
    return 'Both replays show the same concentration at the current slot.'
  })()

  return `${currentSlotLead} ${relation}`
}

function buildPublishedReplayGuideInsight(
  request: PublishedReplayCopilotRequest,
  focusSnapshot: ReturnType<typeof buildPublishedSlotSummary>,
  compareFocusSnapshot?: ReturnType<typeof buildPublishedSlotSummary>,
): Block {
  const activeLabel = request.datasetLabel?.trim() || 'the active replay'
  if (!compareFocusSnapshot) {
    return {
      type: 'insight',
      emphasis: 'normal',
      title: 'Guide interpretation',
      text: `The safer read is that geographic concentration is underway at this slot, but the current leader should not be mistaken for the final equilibrium. Treat the slot-level Gini, dominant-share, and active-region count as the primary evidence for ${activeLabel}.`,
    }
  }

  const activeGini = focusSnapshot.metrics.gini
  const compareGini = compareFocusSnapshot.metrics.gini
  const compareLabel = request.compareLabel?.trim() || 'the comparison replay'
  const relation = activeGini != null && compareGini != null
    ? activeGini < compareGini
      ? `${activeLabel} is less concentrated than ${compareLabel} at the same slot`
      : activeGini > compareGini
        ? `${activeLabel} is more concentrated than ${compareLabel} at the same slot`
        : `${activeLabel} and ${compareLabel} are equally concentrated at the same slot`
    : `${activeLabel} and ${compareLabel} should be read side by side at the same slot`

  return {
    type: 'insight',
    emphasis: 'normal',
    title: 'Guide interpretation',
    text: `The safer read is that ${relation}. Use the table and current-slot stats as the factual layer, then treat any broader mechanism claim as interpretation rather than a new result.`,
  }
}

function buildPublishedReplayFollowUps(
  focusSnapshot: ReturnType<typeof buildPublishedSlotSummary>,
  compareFocusSnapshot?: ReturnType<typeof buildPublishedSlotSummary>,
): string[] {
  const dominantRegion = focusSnapshot.dominantRegion?.city ?? focusSnapshot.dominantRegion?.regionId ?? 'the leading region'

  if (!compareFocusSnapshot) {
    return [
      `How does this slot ${focusSnapshot.slotNumber} posture compare to the final equilibrium?`,
      `Why is ${dominantRegion} leading at this point in the replay?`,
      'Which metric changes most after this slot: Gini, dominant share, or active regions?',
    ]
  }

  return [
    `How does slot ${focusSnapshot.slotNumber} compare with the final equilibrium in both replays?`,
    `Why is ${dominantRegion} leading here while the comparison replay concentrates differently?`,
    'Which metric separates external and local block building fastest after this slot: Gini, dominant share, or liveness?',
  ]
}

function enrichPublishedReplayBlocks(
  blocks: readonly Block[],
  evidenceBlocks: readonly Block[],
  guideInsight: Block,
): Block[] {
  const withoutFallbackNote = blocks.filter(block =>
    !(block.type === 'insight' && block.title === 'Paper-backed note' && block.text === DEFAULT_GENERATED_FALLBACK_TEXT),
  )
  const supportingBlocks = withoutFallbackNote.filter(block =>
    block.type === 'caveat' || block.type === 'source',
  )
  const merged = [...evidenceBlocks, guideInsight, ...supportingBlocks]

  const deduped = merged.filter((block, index, all) =>
    all.findIndex(candidate => blockSignature(candidate) === blockSignature(block)) === index,
  )

  return orderBlocksEvidenceFirst(deduped).slice(0, MAX_GENERATED_BLOCKS)
}

function metricNumericValue(
  metric: SimulationChartMetricKey,
  manifest: { summary: Record<string, number>; config: SimulationRequest } | null,
  fallbackConfig: SimulationRequest,
): number | null {
  const config = manifest?.config ?? fallbackConfig
  switch (metric) {
    case 'finalAverageMev':
      return manifest ? manifest.summary.finalAverageMev : null
    case 'finalSupermajoritySuccess':
      return manifest ? manifest.summary.finalSupermajoritySuccess : null
    case 'finalFailedBlockProposals':
      return manifest ? manifest.summary.finalFailedBlockProposals : null
    case 'finalUtilityIncrease':
      return manifest ? manifest.summary.finalUtilityIncrease : null
    case 'validators':
      return config.validators
    case 'slots':
      return config.slots
    case 'migrationCost':
      return config.migrationCost
    case 'attestationThreshold':
      return config.attestationThreshold
    case 'slotTime':
      return config.slotTime
    case 'attestationCutoffMs':
      return manifest ? manifest.summary.attestationCutoffMs : attestationCutoffMs(config.slotTime)
    default:
      return null
  }
}

function metricDisplayLabel(metric: SimulationChartMetricKey): string {
  switch (metric) {
    case 'finalAverageMev':
      return 'Final Avg MEV'
    case 'finalSupermajoritySuccess':
      return 'Supermajority Success'
    case 'finalFailedBlockProposals':
      return 'Failed Proposals'
    case 'finalUtilityIncrease':
      return 'Utility Increase'
    case 'validators':
      return 'Validators'
    case 'slots':
      return 'Slots'
    case 'migrationCost':
      return 'Migration Cost'
    case 'attestationThreshold':
      return 'Gamma'
    case 'slotTime':
      return 'Slot Time'
    case 'attestationCutoffMs':
      return 'Cutoff (ms)'
    default:
      return metric
  }
}

async function loadArtifactTexts(
  manifest: {
    outputDir: string
    artifacts: ReadonlyArray<{ name: string; renderable: boolean }>
  },
  names: readonly string[],
): Promise<Partial<Record<string, string>>> {
  const loaded: Partial<Record<string, string>> = {}
  for (const name of names) {
    const artifact = manifest.artifacts.find(candidate => candidate.name === name)
    if (!artifact || !artifact.renderable) continue
    try {
      loaded[name] = await fs.readFile(path.join(manifest.outputDir, name), 'utf8')
    } catch {
      // Ignore unreadable artifacts and let the caller decide how to degrade.
    }
  }
  return loaded
}

function bundleArtifactNames(bundle: SimulationArtifactBundle): readonly string[] {
  switch (bundle) {
    case 'core-outcomes':
      return ['avg_mev.json', 'supermajority_success.json', 'failed_block_proposals.json']
    case 'timing-and-attestation':
      return ['proposal_time_avg.json', 'attestation_sum.json']
    case 'geography-overview':
      return ['top_regions_final.json']
    default:
      return []
  }
}

function metricBlockForSection(
  section: Extract<SimulationViewSection, { kind: 'metric' }>,
  manifest: { summary: Record<string, number>; config: SimulationRequest } | null,
  fallbackConfig: SimulationRequest,
): Block | null {
  const config = manifest?.config ?? fallbackConfig
  let label = section.label
  let value = ''
  let sublabel = section.sublabel

  switch (section.metric) {
    case 'finalAverageMev':
      if (!manifest) return null
      label ??= 'Final Average MEV'
      sublabel ??= 'Exact run summary'
      value = `${formatMetricNumber(manifest.summary.finalAverageMev, 4)} ETH`
      break
    case 'finalSupermajoritySuccess':
      if (!manifest) return null
      label ??= 'Final Supermajority Success'
      sublabel ??= 'Exact run summary'
      value = `${formatMetricNumber(manifest.summary.finalSupermajoritySuccess, 2)}%`
      break
    case 'finalFailedBlockProposals':
      if (!manifest) return null
      label ??= 'Failed Block Proposals'
      sublabel ??= 'Exact run summary'
      value = formatMetricNumber(manifest.summary.finalFailedBlockProposals, 0)
      break
    case 'finalUtilityIncrease':
      if (!manifest) return null
      label ??= 'Final Utility Increase'
      sublabel ??= 'Exact run summary'
      value = `${formatMetricNumber(manifest.summary.finalUtilityIncrease, 6)} ETH`
      break
    case 'slotsRecorded':
      if (!manifest) return null
      label ??= 'Slots Recorded'
      sublabel ??= 'Exact run summary'
      value = formatMetricNumber(manifest.summary.slotsRecorded, 0)
      break
    case 'attestationCutoffMs':
      if (!manifest) return null
      label ??= 'Attestation Cutoff'
      sublabel ??= 'Consensus timing'
      value = `${formatMetricNumber(manifest.summary.attestationCutoffMs, 0)} ms`
      break
    case 'validators':
      label ??= 'Validators'
      sublabel ??= 'Simulation config'
      value = formatMetricNumber(config.validators, 0)
      break
    case 'slots':
      label ??= 'Slots'
      sublabel ??= 'Simulation config'
      value = formatMetricNumber(config.slots, 0)
      break
    case 'migrationCost':
      label ??= 'Migration Cost'
      sublabel ??= 'Simulation config'
      value = `${formatMetricNumber(config.migrationCost, 6)} ETH`
      break
    case 'attestationThreshold':
      label ??= 'Attestation Threshold'
      sublabel ??= 'Simulation config'
      value = formatMetricNumber(config.attestationThreshold, 4)
      break
    case 'slotTime':
      label ??= 'Slot Time'
      sublabel ??= 'Simulation config'
      value = `${formatMetricNumber(config.slotTime, 0)} s`
      break
    case 'seed':
      label ??= 'Seed'
      sublabel ??= 'Simulation config'
      value = formatMetricNumber(config.seed, 0)
      break
    default:
      return null
  }

  return {
    type: 'stat',
    value,
    label,
    sublabel,
    sentiment: section.sentiment,
  }
}

function withArtifactPresentation(
  blocks: readonly Block[],
  title: string | undefined,
  note: string | undefined,
): readonly Block[] {
  const nextBlocks = blocks.map((block, index) => {
    if (index !== 0 || !title) return block
    if ('title' in block && typeof block.title === 'string') {
      return { ...block, title }
    }
    return block
  })

  if (!note) return nextBlocks

  return [
    {
      type: 'insight',
      title: title ? 'Why this view' : undefined,
      text: note,
    },
    ...nextBlocks,
  ]
}

async function summarizeRenderableArtifacts(
  manifest: { outputDir: string; artifacts: ReadonlyArray<{ name: string; renderable: boolean }> },
): Promise<string> {
  const lines: string[] = []

  for (const artifact of manifest.artifacts) {
    if (!artifact.renderable) continue
    const artifactPath = path.join(manifest.outputDir, artifact.name)

    try {
      const rawText = await fs.readFile(artifactPath, 'utf8')

      if (artifact.name === 'top_regions_final.json') {
        const rows = JSON.parse(rawText) as Array<[string, number]>
        const summary = rows.slice(0, 5).map(([region, value]) => `${region}=${value}`).join(', ')
        lines.push(`- ${artifact.name}: top regions ${summary}`)
        continue
      }

      const values = JSON.parse(rawText) as unknown
      if (Array.isArray(values) && values.every(value => typeof value === 'number')) {
        const numeric = values as number[]
        const first = numeric[0] ?? 0
        const last = numeric[numeric.length - 1] ?? 0
        const min = Math.min(...numeric)
        const max = Math.max(...numeric)
        lines.push(
          `- ${artifact.name}: first=${formatMetricNumber(first, 4)}, last=${formatMetricNumber(last, 4)}, min=${formatMetricNumber(min, 4)}, max=${formatMetricNumber(max, 4)}`,
        )
      }
    } catch {
      // Ignore unreadable digests and keep the copilot working with the remaining context.
    }
  }

  return lines.join('\n')
}

async function loadOverviewBundleBlocks(
  manifest: {
    outputDir: string
    overviewBundles?: ReadonlyArray<{
      bundle: SimulationArtifactBundle
      name: string
    }>
  },
  bundle: SimulationArtifactBundle,
): Promise<readonly Block[] | null> {
  const overviewBundle = manifest.overviewBundles?.find(candidate => candidate.bundle === bundle)
  if (!overviewBundle) {
    return null
  }

  try {
    const rawText = await fs.readFile(path.join(manifest.outputDir, overviewBundle.name), 'utf8')
    return parseSimulationBlockBundle(rawText)
  } catch {
    return null
  }
}

async function resolveSimulationViewSpec(
  viewSpec: SimulationViewSpec,
  manifest: {
    outputDir: string
    summary: Record<string, number>
    artifacts: ReadonlyArray<{
      name: string
      label: string
      kind: 'timeseries' | 'map' | 'table' | 'raw'
      renderable: boolean
    }>
    overviewBundles?: ReadonlyArray<{
      bundle: SimulationArtifactBundle
      name: string
    }>
    config: SimulationRequest
  } | null,
  fallbackConfig: SimulationRequest,
): Promise<readonly Block[]> {
  const blocks: Block[] = []
  const artifactTextCache = new Map<string, string>()

  const loadArtifactText = async (artifactName: string): Promise<string | null> => {
    if (!manifest) return null
    if (artifactTextCache.has(artifactName)) {
      return artifactTextCache.get(artifactName) ?? null
    }
    try {
      const rawText = await fs.readFile(path.join(manifest.outputDir, artifactName), 'utf8')
      artifactTextCache.set(artifactName, rawText)
      return rawText
    } catch {
      return null
    }
  }

  for (const section of viewSpec.sections) {
    if (section.kind === 'metric') {
      const block = metricBlockForSection(section, manifest, fallbackConfig)
      if (block) blocks.push(block)
      continue
    }

    if (section.kind === 'summary-chart') {
      const entries = section.metrics
        .map(metric => {
          const value = metricNumericValue(metric, manifest, fallbackConfig)
          return value == null
            ? null
            : {
                metric,
                label: metricDisplayLabel(metric),
                value,
              }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

      if (section.note) {
        blocks.push({
          type: 'insight',
          title: 'Interpretation note',
          text: section.note,
        })
      }

      if (entries.length >= 2) {
        blocks.push(buildSimulationSummaryChart(section.title, entries, section.unit))
      } else {
        blocks.push({
          type: 'caveat',
          text: `${section.title} needs at least two supported numeric metrics to render.`,
        })
      }
      continue
    }

    if (section.kind === 'insight') {
      blocks.push({
        type: 'insight',
        title: section.title,
        text: section.text,
        emphasis: section.emphasis,
      })
      continue
    }

    if (section.kind === 'caveat') {
      blocks.push({
        type: 'caveat',
        text: section.text,
      })
      continue
    }

    if (section.kind === 'source') {
      blocks.push({
        type: 'source',
        refs: section.refs,
      })
      continue
    }

    if (section.kind === 'artifact-bundle') {
      if (!manifest) {
        blocks.push({
          type: 'caveat',
          text: 'This bundle references exact simulation artifacts, but there is no completed run loaded yet.',
        })
        continue
      }

      const prebuiltBundleBlocks = await loadOverviewBundleBlocks(manifest, section.bundle)
      const bundleBlocks = prebuiltBundleBlocks ?? await (async () => {
        const artifactTexts = await loadArtifactTexts(manifest, bundleArtifactNames(section.bundle))
        return buildSimulationArtifactBundle(
          section.bundle,
          artifactTexts as Partial<Record<SimulationRenderableArtifact['name'], string>>,
        )
      })()

      if (section.note) {
        blocks.push({
          type: 'insight',
          title: section.title ? 'Why this bundle' : undefined,
          text: section.note,
        })
      }

      if (bundleBlocks.length > 0) {
        blocks.push(...bundleBlocks)
      } else {
        blocks.push({
          type: 'caveat',
          text: `The ${section.bundle} bundle could not be assembled from the available exact artifacts.`,
        })
      }
      continue
    }

    if (!manifest) {
      blocks.push({
        type: 'caveat',
        text: 'This view references simulation artifacts, but there is no completed exact run loaded yet.',
      })
      continue
    }

    const artifact = manifest.artifacts.find(candidate => candidate.name === section.artifactName)
    if (!artifact || !artifact.renderable) {
      blocks.push({
        type: 'caveat',
        text: `${section.artifactName} is not available as a renderable artifact for this run.`,
      })
      continue
    }

    try {
      const rawText = await loadArtifactText(artifact.name)
      if (!rawText) {
        throw new Error('Artifact missing')
      }
      const artifactBlocks = parseSimulationArtifactToBlocks(
        artifact as SimulationRenderableArtifact,
        rawText,
      )
      blocks.push(...withArtifactPresentation(artifactBlocks, section.title, section.note))
    } catch {
      blocks.push({
        type: 'caveat',
        text: `The exact artifact ${artifact.name} could not be loaded for this response.`,
      })
    }
  }

  if (blocks.length > 0) return orderBlocksEvidenceFirst(blocks)

  return [
    {
      type: 'caveat',
      text: viewSpec.guidance ?? 'Ask about a paper finding, propose a bounded run, or load an exact result first.',
    },
  ]
}

async function buildSimulationCopilotContext(
  currentConfig: SimulationRequest,
  currentJob:
    | {
        status: string
        error: string | null
        manifest?: {
          outputDir: string
          config: SimulationRequest
          summary: Record<string, number>
          artifacts: ReadonlyArray<{
            name: string
            label: string
            kind: 'timeseries' | 'map' | 'table' | 'raw'
            renderable: boolean
          }>
        }
      }
    | null,
): Promise<string> {
  const manifest = currentJob?.manifest
  const parts = [
    '## Current Simulation Config',
    `- paradigm: ${currentConfig.paradigm}`,
    `- validators: ${currentConfig.validators}`,
    `- slots: ${currentConfig.slots}`,
    `- distribution: ${currentConfig.distribution}`,
    `- sourcePlacement: ${currentConfig.sourcePlacement}`,
    `- migrationCost: ${currentConfig.migrationCost}`,
    `- attestationThreshold: ${currentConfig.attestationThreshold}`,
    `- slotTime: ${currentConfig.slotTime}`,
    `- seed: ${currentConfig.seed}`,
  ]

  if (!currentJob) {
    parts.push('## Current Exact Result', 'No simulation job is currently loaded.')
    return parts.join('\n')
  }

  parts.push('## Current Job Status', `- status: ${currentJob.status}`)
  if (currentJob.error) {
    parts.push(`- error: ${currentJob.error}`)
  }

  if (!manifest) {
    parts.push('## Current Exact Result', 'There is no completed exact result available yet.')
    return parts.join('\n')
  }

  parts.push(
    '## Current Exact Result',
    `- finalAverageMev: ${manifest.summary.finalAverageMev}`,
    `- finalSupermajoritySuccess: ${manifest.summary.finalSupermajoritySuccess}`,
    `- finalFailedBlockProposals: ${manifest.summary.finalFailedBlockProposals}`,
    `- finalUtilityIncrease: ${manifest.summary.finalUtilityIncrease}`,
    `- slotsRecorded: ${manifest.summary.slotsRecorded}`,
    `- attestationCutoffMs: ${manifest.summary.attestationCutoffMs}`,
    '## Available Renderable Artifacts',
    ...manifest.artifacts
      .filter(artifact => artifact.renderable)
      .map(artifact => `- ${artifact.name}: ${artifact.label}`),
    '## Reusable Exact Chart Bundles',
    '- core-outcomes: avg_mev + supermajority_success + failed_block_proposals',
    '- timing-and-attestation: proposal_time_avg + attestation_sum',
    '- geography-overview: top_regions_final map + table',
  )

  const digest = await summarizeRenderableArtifacts(manifest)
  if (digest) {
    parts.push('## Artifact Digests', digest)
  }

  return parts.join('\n')
}

// --- Tool executor for multi-turn Claude calls ---

function executeToolCall(
  name: string,
  input: Record<string, unknown>,
): unknown {
  if (name === 'search_topic_cards') {
    const query = typeof input.query === 'string' ? input.query : ''
    const limit = typeof input.limit === 'number' ? input.limit : 5
    return findTopicMatches(query, limit)
  }

  if (name === 'get_topic_card') {
    const id = typeof input.id === 'string' ? input.id : ''
    const card = getTopicCardById(id)
    if (!card) return { error: 'Topic card not found' }
    return {
      id: card.id,
      title: card.title,
      description: card.description,
      prompts: card.prompts,
      blocks: card.blocks,
    }
  }

  if (name === 'search_explorations') {
    const options: ListOptions = {
      search: typeof input.query === 'string' ? input.query : undefined,
      paradigm: input.paradigm as ListOptions['paradigm'],
      experiment: typeof input.experiment === 'string' ? input.experiment : undefined,
      verifiedOnly: typeof input.verified_only === 'boolean' ? input.verified_only : undefined,
      surface: 'reading',
      sort: (input.sort as 'recent' | 'top') ?? 'recent',
      limit: typeof input.limit === 'number' ? input.limit : 10,
    }
    const results = explorationStore.list(options)
    return results.map(e => ({
      id: e.id,
      query: e.query,
      summary: e.summary,
      votes: e.votes,
      verified: e.verified,
      paradigmTags: e.paradigmTags,
      experimentTags: e.experimentTags,
      createdAt: e.createdAt,
    }))
  }

  if (name === 'get_exploration') {
    const id = typeof input.id === 'string' ? input.id : ''
    const exploration = explorationStore.getById(id)
    if (!exploration) return { error: 'Exploration not found' }
    return exploration
  }

  if (name === 'suggest_underexplored_topics') {
    const query = typeof input.query === 'string' ? input.query : undefined
    const limit = typeof input.limit === 'number' ? input.limit : 3
    return suggestUnderexploredTopics(query, limit)
  }

  if (name === 'build_simulation_config') {
    return buildSimulationConfig(input)
  }

  if (name === 'query_cached_results') {
    const paradigm = typeof input.paradigm === 'string' ? input.paradigm as 'SSP' | 'MSP' : undefined
    const distribution = typeof input.distribution === 'string' ? input.distribution : undefined
    const sourcePlacement = typeof input.sourcePlacement === 'string' ? input.sourcePlacement : undefined

    const results = simulationRuntime.listCompletedResults({ paradigm, distribution, sourcePlacement })

    if (results.length === 0) {
      return {
        message: 'No cached simulation results match those filters. The user can run a simulation from the Results tab, or try different filter parameters.',
        availableFilters: { paradigm: ['SSP', 'MSP'], distribution: ['homogeneous', 'homogeneous-gcp', 'heterogeneous', 'random'], sourcePlacement: ['homogeneous', 'latency-aligned', 'latency-misaligned'] },
      }
    }

    return { results }
  }

  if (name === 'verify_exploration') {
    const id = typeof input.id === 'string' ? input.id : ''
    const verified = typeof input.verified === 'boolean' ? input.verified : true
    const updated = explorationStore.verify(id, verified)
    if (!updated) return { error: 'Exploration not found' }
    return { id: updated.id, verified: updated.verified }
  }

  return { error: `Unknown tool: ${name}` }
}

async function executeExploreChatToolCall(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (name === 'query_results_table') {
    return (await executeStructuredResultsQuery({
      queryHint: typeof input.queryHint === 'string' ? input.queryHint : undefined,
      viewId: typeof input.viewId === 'string' ? input.viewId : undefined,
      dimensions: Array.isArray(input.dimensions)
        ? input.dimensions.filter((value): value is PublishedResultsQueryDimension =>
            typeof value === 'string' && publishedResultsQueryDimensionValues.includes(value as PublishedResultsQueryDimension),
          )
        : undefined,
      metrics: Array.isArray(input.metrics)
        ? input.metrics.filter((value): value is PublishedExploreMetricKey =>
            typeof value === 'string' && publishedExploreMetricValues.includes(value as PublishedExploreMetricKey),
          )
        : undefined,
      filters:
        input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters)
          ? {
              evaluation: typeof (input.filters as Record<string, unknown>).evaluation === 'string'
                ? (input.filters as Record<string, unknown>).evaluation as string
                : undefined,
              paradigm: typeof (input.filters as Record<string, unknown>).paradigm === 'string'
                ? (input.filters as Record<string, unknown>).paradigm as string
                : undefined,
              result: typeof (input.filters as Record<string, unknown>).result === 'string'
                ? (input.filters as Record<string, unknown>).result as string
                : undefined,
            }
          : undefined,
      slot: input.slot === 'initial' ? 'initial' : 'final',
      orderBy: typeof input.orderBy === 'string' ? input.orderBy : undefined,
      order: input.order === 'asc' ? 'asc' : 'desc',
      limit: typeof input.limit === 'number' && Number.isFinite(input.limit) ? input.limit : undefined,
      title: typeof input.title === 'string' ? input.title : undefined,
    })).result
  }

  if (name === 'query_cached_results') {
    if (!ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH || !existsSync(ACTIVE_PUBLISHED_RESULTS_CATALOG_PATH)) {
      return executeToolCall(name, input)
    }
    return await loadExplorePublishedResults(sanitizeExploreCachedResultFilters({
      paradigm: typeof input.paradigm === 'string' ? input.paradigm : undefined,
      distribution: typeof input.distribution === 'string' ? input.distribution : undefined,
      sourcePlacement: typeof input.sourcePlacement === 'string' ? input.sourcePlacement : undefined,
      evaluation: typeof input.evaluation === 'string' ? input.evaluation : undefined,
      result: typeof input.result === 'string' ? input.result : undefined,
    }))
  }

  return executeToolCall(name, input)
}

const renderBlocksToolInputSchema = z.object({
  summary: z.string().optional(),
  blocks: z.array(z.unknown()).optional(),
  follow_ups: z.array(z.string()).optional(),
})

function normalizeExploreHistory(
  history: unknown,
): Array<{ query: string; summary: string }> {
  return Array.isArray(history)
    ? history
      .filter((entry): entry is { query: string; summary: string } =>
        Boolean(entry)
        && typeof entry === 'object'
        && typeof (entry as { query?: unknown }).query === 'string'
        && typeof (entry as { summary?: unknown }).summary === 'string',
      )
      .slice(-MAX_SESSION_HISTORY_ENTRIES)
      .map(entry => ({
        query: limitText(entry.query.trim(), MAX_EXPLORE_QUERY_LENGTH),
        summary: limitText(entry.summary.trim(), MAX_SESSION_SUMMARY_LENGTH),
      }))
      .filter(entry => entry.query.length > 0 && entry.summary.length > 0)
    : []
}

function normalizeAskLaunchContext(input: unknown): AskLaunchContext | null {
  const parsed = askLaunchContextSchema.safeParse(input)
  return parsed.success ? (resolveWorkflowLaunchContext(parsed.data) ?? null) : null
}

function extractTextFromUiMessage(message: UIMessage | undefined): string {
  if (!message) return ''

  return message.parts
    .flatMap(part => part.type === 'text' ? [part.text] : [])
    .join(' ')
    .trim()
}

function buildAskStatus(
  phase: AskStatusData['phase'],
  state: AskStatusData['state'],
  label: string,
  detail: string,
): AskStatusData {
  return {
    id: `${phase}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phase,
    state,
    label,
    detail,
    timestamp: Date.now(),
  }
}

function buildAskPlanModules(
  route: AskPlanData['route'],
  options: {
    readonly hasTemplateMatch: boolean
  },
): AskPlanData['modules'] {
  switch (route) {
    case 'orientation':
      return [
        {
          id: 'paper-guide',
          label: 'Paper guide',
          detail: 'Explain the study, its main contrast, and the first caveats before drilling into figures.',
          state: 'selected',
        },
        {
          id: 'results-replay',
          label: 'Results replay',
          detail: 'Available when the question narrows to one metric, scenario, or comparison.',
          state: 'available',
        },
        {
          id: 'structured-query',
          label: 'Structured query',
          detail: 'Available if the user wants a ranked or tabulated view over published Results rows.',
          state: 'available',
        },
      ]
    case 'structured-results':
      return [
        {
          id: 'results-catalog',
          label: 'Published Results catalog',
          detail: 'Query ranked rows from the frozen paper dataset rather than improvising an answer from summaries.',
          state: 'selected',
        },
        {
          id: 'results-surface',
          label: 'Results-style blocks',
          detail: 'Turn the structured query into compact chart, table, and insight blocks underneath the prompt.',
          state: 'selected',
        },
        {
          id: 'paper-anchor',
          label: 'Paper figure anchor',
          detail: 'Attach a canonical study figure when the ranked rows map onto a known Results family.',
          state: options.hasTemplateMatch ? 'selected' : 'available',
        },
      ]
    case 'simulation-config':
      return [
        {
          id: 'experiment-planner',
          label: 'Experiment planner',
          detail: 'Compose a bounded exact-mode run configuration without pretending the simulation already ran.',
          state: 'selected',
        },
        {
          id: 'paper-reference',
          label: 'Paper reference setup',
          detail: 'Anchor the proposed run to paper-style defaults, presets, and scenario labels where possible.',
          state: 'selected',
        },
        {
          id: 'results-replay',
          label: 'Results replay',
          detail: 'Available after the run plan if the user wants to compare it back to the frozen published figures.',
          state: 'available',
        },
      ]
    case 'results':
      return [
        {
          id: 'results-families',
          label: 'Published Results families',
          detail: 'Load the scenario families that answer the metric or comparison directly from the study package.',
          state: 'selected',
        },
        {
          id: 'canonical-figure',
          label: 'Canonical figure scaffold',
          detail: 'Reuse the study-owned chart or replay block when the question maps to a known Results family.',
          state: options.hasTemplateMatch ? 'selected' : 'available',
        },
        {
          id: 'mechanism-synthesis',
          label: 'Mechanism synthesis',
          detail: 'Summarize what the retrieved pattern implies and where the paper draws its caveats.',
          state: 'selected',
        },
      ]
    case 'hybrid':
    default:
      return [
        {
          id: 'reading-surface',
          label: 'Reading surface',
          detail: 'Start with the strongest grounded explanation path for the current question.',
          state: 'selected',
        },
        {
          id: 'results-replay',
          label: 'Results replay',
          detail: 'Pull in a published figure or metric family if the question sharpens into one comparison.',
          state: options.hasTemplateMatch ? 'selected' : 'available',
        },
        {
          id: 'follow-up-guidance',
          label: 'Follow-up guidance',
          detail: 'Offer narrower prompts that test the current capability surface more explicitly.',
          state: 'selected',
        },
      ]
  }
}

function buildAskPlanQueryViewData(
  view: StudyAssistantQueryView | null,
): AskPlanData['queryView'] | undefined {
  if (!view) return undefined
  return {
    id: view.id,
    title: view.title,
    description: view.description,
    surface: view.surface,
    bestFor: view.bestFor ? [...view.bestFor] : undefined,
    allowedDimensions: [...resolveQueryViewAllowedDimensions(view)],
    allowedMetrics: [...resolveQueryViewAllowedMetrics(view)],
    allowedOrderBy: [...resolveQueryViewAllowedOrderBy(view)],
    supportedSlots: [...resolveQueryViewSupportedSlots(view)],
    filters: {
      evaluation: [...normalizeQueryViewEvaluationOptions(view)],
      paradigm: [...normalizeQueryViewParadigmOptions(view)],
      result: [...normalizeQueryViewResultOptions(view)],
    },
    executionHints: view.executionHints?.map(hint => ({
      label: hint.label,
      description: hint.description,
    })),
  }
}

function buildAskPlanQueryRequestData(
  request: StructuredResultsQueryPlan | null,
): AskPlanData['queryRequest'] | undefined {
  if (!request) return undefined
  return {
    viewId: request.view?.id,
    dimensions: [...request.dimensions],
    metrics: [...request.metrics],
    filters: {
      evaluation: request.filters.evaluation,
      paradigm: request.filters.paradigm,
      result: request.filters.result,
    },
    slot: request.slot,
    orderBy: request.orderBy,
    order: request.order,
    limit: request.limit,
    notes: [...request.notes],
    coerced: request.coerced,
  }
}

function buildAskPlanData(
  query: string,
  options?: {
    readonly status?: AskPlanData['status']
    readonly latestCachedResults?: unknown
    readonly latestStructuredQuery?: StructuredResultsQueryPlan | null
    readonly latestArtifactBlocks?: readonly Block[]
    readonly launch?: AskLaunchContext | null
  },
): AskPlanData {
  const status = options?.status ?? 'planned'
  const route: AskPlanData['route'] =
    options?.launch?.routeHint
    ?? (isOrientationExploreQuery(query) ? 'orientation' :
      isSimulationPlanningExploreQuery(query) ? 'simulation-config' :
      isStructuredResultsQuery(query) ? 'structured-results' :
      isPrecomputedResultsExploreQuery(query) ? 'results' :
      'hybrid')
  const queryRequest = route === 'structured-results'
    ? options?.latestStructuredQuery
      ?? resolveStructuredResultsQueryPlan({
        queryHint: query,
        ...(options?.launch?.structuredQuery ?? {}),
      })
    : null
  const queryView = route === 'structured-results'
    ? queryRequest?.view ?? null
    : null
  const workflow = findStudyWorkflow(options?.launch?.workflowId)
  const workflowInputs = buildWorkflowLaunchInputs(workflow, options?.launch)
  const launch = options?.launch
    ? {
      source: options.launch.source ?? 'workflow',
      label:
        options.launch.source === 'workflow'
          ? (workflow?.title ?? options.launch.workflowId ?? 'Workflow launch')
          : (queryView?.title ?? 'Structured query workbench'),
      detail:
        options.launch.source === 'workflow'
          ? (workflow?.description ?? 'Study-owned workflow launch')
          : queryView
            ? `Pinned to the ${queryView.title} study surface before the assistant started reasoning.`
            : 'Pinned to a typed structured query launch before the assistant started reasoning.',
      workflowId: options.launch.workflowId,
      inputs: workflowInputs,
    } satisfies NonNullable<AskPlanData['launch']>
    : undefined

  const expectedTemplates =
    route === 'results' || route === 'structured-results'
      ? resolveExpectedStudyResultsTemplates(query)
      : []
  const loadedResponses = normalizePublishedResultsCollection(options?.latestCachedResults)
  const loadedTemplates = loadedResponses.length > 0
    ? resolveStudyResultsTemplatesForResponses(query, loadedResponses)
    : options?.latestArtifactBlocks?.length
      ? resolveStudyResultsTemplatesForBlocks(query, options.latestArtifactBlocks)
      : []
  const loadedTemplateIds = new Set(loadedTemplates.map(template => template.id))
  const templates = [
    ...expectedTemplates.map(template => ({
      id: template.id,
      title: template.title,
      pattern: template.pattern,
      questionAnswered: template.questionAnswered,
      state: loadedTemplateIds.has(template.id) ? 'loaded' : 'target',
    })),
    ...loadedTemplates
      .filter(template => !expectedTemplates.some(expected => expected.id === template.id))
      .map(template => ({
        id: template.id,
        title: template.title,
        pattern: template.pattern,
        questionAnswered: template.questionAnswered,
        state: 'loaded' as const,
      })),
  ]

  const hasTemplateMatch = templates.length > 0
  const modules = buildAskPlanModules(route, { hasTemplateMatch })

  switch (route) {
    case 'orientation':
      return {
        status,
        title: 'Reading guide route',
        route,
        rationale: 'This looks like an overview or mechanism question, so the assistant should explain the study clearly before narrowing into one figure or metric.',
        launch,
        modules,
        templates,
        nextSteps: [
          'Summarize the paper and its core contrast in plain language.',
          'Anchor the explanation to one claim, caveat, or figure family.',
          'Offer a concrete next question or next surface to open.',
        ],
      }
    case 'structured-results':
      return {
        status,
        title: 'Structured published Results query',
        route,
        rationale: 'This question is asking for a ranking, list, or table over the frozen Results catalog, so the assistant should query rows first and narrate second.',
        launch,
        queryView: buildAskPlanQueryViewData(queryView),
        queryRequest: buildAskPlanQueryRequestData(queryRequest),
        modules,
        templates,
        nextSteps: [
          queryRequest?.coerced
            ? `Keep the query inside ${queryView?.title ?? 'the matched study surface'} and make any narrowing explicit.`
            : '',
          hasTemplateMatch ? `Use the matching Results family${templates.length === 1 ? '' : 'ies'} as an anchor.` : 'Query the published Results catalog for the strongest matching rows.',
          'Lay out a compact chart and table before adding interpretation.',
          'Explain the ranking in plain language and suggest the next comparison.',
        ].filter(Boolean),
      }
    case 'simulation-config':
      return {
        status,
        title: 'Experiment setup route',
        route,
        rationale: 'This question is asking what to run or how to encode a bounded test, so the assistant should propose an exact-mode configuration before making any claims about outcomes.',
        launch,
        modules,
        templates,
        nextSteps: [
          'Propose a bounded exact-mode configuration that matches the question.',
          'Explain which paper preset or scenario label it is closest to.',
          'Clarify what the user would learn by running it next.',
        ],
      }
    case 'results':
      return {
        status,
        title: 'Published Results replay',
        route,
        rationale: 'This question names metrics, scenarios, or comparisons that map onto the study-owned Results families, so the assistant should load those families before drafting.',
        launch,
        modules,
        templates,
        nextSteps: [
          hasTemplateMatch ? `Load ${templates.map(template => template.title).join(', ')}.` : 'Load the strongest matching published Results family.',
          'Use the canonical figure or replay block as the page backbone.',
          'Summarize the retrieved pattern and the paper caveat that matters most.',
        ],
      }
    case 'hybrid':
    default:
      return {
        status,
        title: 'Mixed reading route',
        route,
        rationale: 'This question is best answered with a compact mix of explanation and grounded retrieval, so the assistant will follow the most specific evidence path it can support.',
        launch,
        modules,
        templates,
        nextSteps: [
          'Start with the strongest grounded explanation path.',
          'Pull in a Results family only if the question sharpens into one comparison or metric.',
          'Leave the user with a narrower next question that tests one capability clearly.',
        ],
      }
  }
}

function buildStructuredQueryPreviewResponse(
  execution: StructuredResultsExecution,
): {
  readonly route: 'structured-results'
  readonly description: string
  readonly queryView: ReturnType<typeof buildAskPlanQueryViewData> | undefined
  readonly queryRequest: NonNullable<ReturnType<typeof buildAskPlanQueryRequestData>>
  readonly response: ExploreResponse
} {
  const response: ExploreResponse = {
    summary: execution.result.summary,
    blocks: [...execution.result.blocks],
    followUps: [...execution.result.followUps],
    model: 'study-query-adapter',
    cached: true,
    provenance: {
      source: 'generated',
      label: 'Study query adapter',
      detail: 'Direct read-only execution over the study-owned published Results surface.',
      canonical: true,
    },
  }

  return {
    route: 'structured-results',
    description: execution.result.description,
    queryView: buildAskPlanQueryViewData(execution.queryPlan.view) ?? undefined,
    queryRequest: buildAskPlanQueryRequestData(execution.queryPlan)!,
    response,
  }
}

function buildSimulationConfigPreviewResponse(
  result: unknown,
): {
  readonly route: 'simulation-config'
  readonly description: string
  readonly response: ExploreResponse
} {
  const artifact = buildSimulationConfigArtifact(result) ?? {
    summary: 'Suggested run is outside exact bounds',
    description: 'The requested configuration is outside the exact-mode bounds.',
    blocks: [{
      type: 'caveat' as const,
      text: 'The requested configuration is outside the exact-mode bounds.',
    }],
    followUps: [
      'Ask for a paper-like bounded variant of this run.',
      'Ask which single parameter to change first and why.',
    ],
  }

  return {
    route: 'simulation-config',
    description: artifact.description,
    response: {
      summary: artifact.summary,
      blocks: [...artifact.blocks],
      followUps: [...artifact.followUps],
      model: 'study-experiment-adapter',
      cached: true,
      provenance: {
        source: 'generated',
        label: 'Study experiment adapter',
        detail: 'Direct bounded execution over the study-owned experiment planning surface.',
        canonical: true,
      },
    },
  }
}

async function buildAskLaunchPreviewResponse(
  query: string,
  askLaunch: AskLaunchContext | null,
): Promise<ReturnType<typeof buildStructuredQueryPreviewResponse> | ReturnType<typeof buildSimulationConfigPreviewResponse>> {
  if (askLaunch?.structuredQuery || askLaunch?.routeHint === 'structured-results') {
    const queryPlan = resolveStructuredResultsQueryPlan({
      queryHint: query,
      ...(askLaunch?.structuredQuery ?? {}),
    })
    const execution = await executeStructuredResultsQuery({
      queryHint: query,
      queryPlan,
    })
    return buildStructuredQueryPreviewResponse(execution)
  }

  if (askLaunch?.simulationConfig || askLaunch?.routeHint === 'simulation-config') {
    return buildSimulationConfigPreviewResponse(
      buildSimulationConfig((askLaunch?.simulationConfig ?? {}) as Record<string, unknown>),
    )
  }

  throw new Error('A direct structured-results or simulation-config launch is required for launch previews.')
}

function buildExploreChatTools(
  query: string,
  options?: {
    launch?: AskLaunchContext | null
    initialCachedResults?: unknown
    initialStructuredQuery?: StructuredResultsQueryPlan | null
    initialArtifactBlocks?: readonly Block[]
    initialStructuredExecution?: StructuredResultsExecution | null
    onCachedResults?: (result: unknown) => void
    onStructuredQuery?: (query: StructuredResultsQueryPlan) => void
    onArtifact?: (artifact: AskArtifactData) => void
    onPlan?: (plan: AskPlanData) => void
    onStatus?: (status: AskStatusData) => void
  },
) {
  let latestCachedResults: unknown = options?.initialCachedResults ?? null
  let latestStructuredQuery: StructuredResultsQueryPlan | null = options?.initialStructuredQuery ?? null
  let latestArtifactBlocks: Block[] = options?.initialArtifactBlocks ? [...options.initialArtifactBlocks] : []
  let latestStructuredExecution: StructuredResultsExecution | null = options?.initialStructuredExecution ?? null
  let cachedResultsHistory: PublishedResultsToolResponse[] = []
  const emitPlan = (status: AskPlanData['status']) => {
    options?.onPlan?.(buildAskPlanData(query, {
      status,
      latestCachedResults,
      latestStructuredQuery,
      latestArtifactBlocks,
      launch: options?.launch,
    }))
  }
  const updateArtifactBlocks = (blocks: readonly Block[]) => {
    latestArtifactBlocks = [...blocks]
  }
  const canonicalBlocksForRender = (): Block[] => {
    const scaffoldFromResults = buildExploreArtifactScaffold(query, latestCachedResults)
    return scaffoldFromResults.length > 0 ? scaffoldFromResults : [...latestArtifactBlocks]
  }
  const storeCachedResults = (result: unknown) => {
    const normalizedResult = normalizePublishedResultsToolResponse(result)
    if (normalizedResult) {
      const signature = JSON.stringify(normalizedResult.query) + '::' + normalizedResult.results.map(entry => entry.datasetPath).join('|')
      const nextHistory = cachedResultsHistory.filter(existing =>
        JSON.stringify(existing.query) + '::' + existing.results.map(entry => entry.datasetPath).join('|') !== signature,
      )
      nextHistory.push(normalizedResult)
      cachedResultsHistory = nextHistory.slice(-3)
      latestCachedResults = [...cachedResultsHistory]
    } else {
      latestCachedResults = result
    }
    updateArtifactBlocks(buildExploreArtifactScaffold(query, latestCachedResults))
    options?.onCachedResults?.(latestCachedResults)
  }
  const streamReferencedArtifact = (result: unknown, stage: string) => {
    if (!options?.onArtifact || !result || typeof result !== 'object' || Array.isArray(result)) return
    const candidate = result as {
      summary?: unknown
      description?: unknown
      blocks?: unknown
    }
    const blocks = parseBlocks(Array.isArray(candidate.blocks) ? candidate.blocks : [])
    if (blocks.length === 0) return

    updateArtifactBlocks(blocks)
    options.onArtifact(buildExploreArtifactData(
      'streaming',
      stage,
      {
        summary:
          typeof candidate.summary === 'string' && candidate.summary.trim().length > 0
            ? candidate.summary.trim()
            : typeof candidate.description === 'string' && candidate.description.trim().length > 0
              ? candidate.description.trim()
              : 'Grounded evidence loaded. Organizing the page.',
        blocks,
        followUps: [],
        model: anthropicModel,
        cached: false,
        provenance: {
          source: 'generated',
          label: 'Live artifact',
          detail: 'Streaming a provisional page scaffold from retrieved study evidence.',
          canonical: false,
        },
      },
    ))
  }

  return {
    search_topic_cards: createTool({
      description: 'Search the curated findings library for relevant paper topics.',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().optional(),
      }),
      execute: async (input) => executeToolCall('search_topic_cards', input as Record<string, unknown>),
    }),
    get_topic_card: createTool({
      description: 'Retrieve one curated paper topic card by id.',
      inputSchema: z.object({
        id: z.string(),
      }),
      execute: async (input) => {
        const result = await executeToolCall('get_topic_card', input as Record<string, unknown>)
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'done',
          'Loaded curated paper evidence',
          'A study-backed topic card is now available for the answer scaffold.',
        ))
        streamReferencedArtifact(result, 'Loaded curated paper evidence')
        return result
      },
    }),
    search_explorations: createTool({
      description: 'Search prior study explorations for related questions and summaries.',
      inputSchema: z.object({
        query: z.string().optional(),
        paradigm: z.string().optional(),
        experiment: z.string().optional(),
        verified_only: z.boolean().optional(),
        sort: z.string().optional(),
        limit: z.number().int().optional(),
      }),
      execute: async (input) => executeToolCall('search_explorations', input as Record<string, unknown>),
    }),
    get_exploration: createTool({
      description: 'Retrieve a prior exploration by id.',
      inputSchema: z.object({
        id: z.string(),
      }),
      execute: async (input) => {
        const result = await executeToolCall('get_exploration', input as Record<string, unknown>)
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'done',
          'Loaded prior exploration',
          'A related exploration was pulled in as grounded context for this answer.',
        ))
        streamReferencedArtifact(result, 'Loaded prior exploration context')
        return result
      },
    }),
    suggest_underexplored_topics: createTool({
      description: 'Suggest narrowly related follow-up questions that are still underexplored.',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().optional(),
      }),
      execute: async (input) => executeToolCall('suggest_underexplored_topics', input as Record<string, unknown>),
    }),
    build_simulation_config: createTool({
      description: 'Compose a bounded simulation configuration without running it.',
      inputSchema: z.record(z.string(), z.unknown()),
      execute: async (input) => {
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'active',
          'Planning bounded experiment',
          'Translating the question into an exact-mode configuration that stays inside the study bounds.',
        ))
        const result = executeToolCall('build_simulation_config', input)
        const artifact = buildSimulationConfigArtifact(result)
        if (artifact) {
          streamReferencedArtifact(artifact, 'Experiment setup ready')
        }
        emitPlan('active')
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'done',
          'Experiment setup ready',
          'A bounded exact-mode config is ready to inspect before running anything.',
        ))
        return result
      },
    }),
    query_cached_results: createTool({
      description: 'Query the study-owned published Results datasets and pre-computed simulation metrics that power the Results surface.',
      inputSchema: z.object({
        paradigm: z.string().optional(),
        distribution: z.string().optional(),
        sourcePlacement: z.string().optional(),
        evaluation: z.string().optional(),
        result: z.string().optional(),
      }),
      execute: async (input) => {
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'active',
          'Loading pre-computed results',
          'Retrieving study-owned Results datasets and matching them to the current question.',
        ))
        const result = await executeExploreChatToolCall('query_cached_results', input as Record<string, unknown>)
        storeCachedResults(result)
        const liveArtifact = buildLiveExploreArtifact(
          query,
          buildExploreArtifactScaffold(query, latestCachedResults),
          'Loaded pre-computed results',
        )
        if (liveArtifact) {
          updateArtifactBlocks(liveArtifact.response.blocks)
          options?.onArtifact?.(liveArtifact)
        }
        emitPlan('active')
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'done',
          'Pre-computed results loaded',
          'The page now has a provisional Results scaffold from retrieved study data.',
        ))
        return result
      },
    }),
    query_results_table: createTool({
      description: 'Run a constrained structured query over the study-owned published Results catalog and return compact Results-style blocks.',
      inputSchema: z.object({
        viewId: z.string().optional(),
        dimensions: z.array(z.enum(publishedResultsQueryDimensionValues)).min(1).max(6).optional(),
        metrics: z.array(z.enum(publishedExploreMetricValues)).min(1).max(4).optional(),
        filters: z.object({
          evaluation: z.string().optional(),
          paradigm: z.string().optional(),
          result: z.string().optional(),
        }).optional(),
        slot: z.enum(['initial', 'final']).optional(),
        orderBy: z.string().optional(),
        order: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(20).optional(),
        title: z.string().optional(),
      }),
      execute: async (input) => {
        const launchStructuredQuery = options?.launch?.structuredQuery
        const resolvedQuery = resolveStructuredResultsQueryPlan({
          ...(input as Record<string, unknown>),
          viewId: input.viewId ?? launchStructuredQuery?.viewId,
          dimensions: input.dimensions ?? launchStructuredQuery?.dimensions,
          metrics: input.metrics ?? launchStructuredQuery?.metrics,
          filters: input.filters ?? launchStructuredQuery?.filters,
          slot: input.slot ?? launchStructuredQuery?.slot,
          orderBy: input.orderBy ?? launchStructuredQuery?.orderBy,
          order: input.order ?? launchStructuredQuery?.order,
          limit: input.limit ?? launchStructuredQuery?.limit,
          queryHint: query,
        })
        latestStructuredQuery = resolvedQuery
        options?.onStructuredQuery?.(resolvedQuery)
        emitPlan('active')
        options?.onStatus?.(buildAskStatus(
          'plan',
          'active',
          resolvedQuery.view ? `Matched ${resolvedQuery.view.title}` : 'Preparing structured data query',
          resolvedQuery.view
            ? `Using the ${resolvedQuery.view.title} surface with ${resolvedQuery.metrics.join(', ')} over ${resolvedQuery.dimensions.join(', ')} at the ${resolvedQuery.slot} snapshot.`
            : 'Interpreting the request as a safe structured query over the study-owned published Results catalog.',
        ))
        const cachedExecution = latestStructuredExecution
          && structuredResultsQueryPlanSignature(latestStructuredExecution.queryPlan) === structuredResultsQueryPlanSignature(resolvedQuery)
          ? latestStructuredExecution
          : null
        const execution = cachedExecution ?? await executeStructuredResultsQuery({
          viewId: resolvedQuery.view?.id,
          dimensions: resolvedQuery.dimensions,
          metrics: resolvedQuery.metrics,
          filters: resolvedQuery.filters,
          slot: resolvedQuery.slot,
          orderBy: resolvedQuery.orderBy ?? undefined,
          order: resolvedQuery.order,
          limit: resolvedQuery.limit,
          title: input.title,
          queryHint: query,
          queryPlan: resolvedQuery,
        })
        latestStructuredExecution = execution
        latestStructuredQuery = execution.queryPlan
        updateArtifactBlocks(extractArtifactBlocks(execution.result))
        const result = execution.result
        streamReferencedArtifact(result, 'Structured results query ready')
        emitPlan('active')
        options?.onStatus?.(buildAskStatus(
          'evidence',
          'done',
          'Structured query ready',
          execution.queryPlan.coerced
            ? `A compact chart and table scaffold is ready. The query was narrowed to the ${execution.queryPlan.view?.title ?? 'matched study surface'} to stay inside supported fields.`
            : cachedExecution
              ? 'Reused the prefetched chart and table scaffold from the published Results catalog.'
              : 'A compact chart and table scaffold is now available from the published Results catalog.',
        ))
        return result
      },
    }),
    render_blocks: createTool({
      description: 'Compose the final page artifact using the supported block formats and pre-computed data where relevant.',
      inputSchema: renderBlocksToolInputSchema,
      execute: async (input) => {
        options?.onStatus?.(buildAskStatus(
          'render',
          'active',
          'Building final page',
          'Composing the final block layout from the gathered evidence and study templates.',
        ))
        const response = buildGeneratedExploreResponse(query, {
          summary: input.summary,
          blocks: input.blocks as unknown[] | undefined,
          follow_ups: input.follow_ups,
        }, {
          model: anthropicModel,
          cached: false,
          canonicalBlocks: canonicalBlocksForRender(),
        })
        emitPlan('ready')
        options?.onArtifact?.(buildExploreArtifactData('ready', 'Answer ready', response))
        options?.onStatus?.(buildAskStatus(
          'render',
          'done',
          'Answer ready',
          'The final page artifact has been assembled and is ready to read.',
        ))
        return response
      },
    }),
  }
}

app.post('/api/explore/query-preview', exploreRateLimit, async (req, res) => {
  const { query, launch } = req.body as {
    query?: string
    launch?: AskLaunchContext
  }
  const trimmedQuery = typeof query === 'string' ? query.trim() : ''
  if (trimmedQuery.length > MAX_EXPLORE_QUERY_LENGTH) {
    res.status(400).json({
      error: `Query is too long. Keep it under ${MAX_EXPLORE_QUERY_LENGTH} characters and narrow the ask.`,
    })
    return
  }

  try {
    const askLaunch = normalizeAskLaunchContext(launch)
    if (!askLaunch?.structuredQuery && askLaunch?.routeHint !== 'structured-results') {
      res.status(400).json({
        error: 'A structured-results launch is required for direct study query previews.',
      })
      return
    }

    const preview = await buildAskLaunchPreviewResponse(trimmedQuery, askLaunch)
    if (preview.route !== 'structured-results') {
      res.status(400).json({
        error: 'A structured-results launch is required for direct study query previews.',
      })
      return
    }

    res.json(preview)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message.includes('rate_limit') ? 429 :
      message.includes('authentication') ? 401 :
      500
    res.status(status).json({ error: message })
  }
})

app.post('/api/explore/launch-preview', exploreRateLimit, async (req, res) => {
  const { query, launch } = req.body as {
    query?: string
    launch?: AskLaunchContext
  }
  const trimmedQuery = typeof query === 'string' ? query.trim() : ''
  if (trimmedQuery.length > MAX_EXPLORE_QUERY_LENGTH) {
    res.status(400).json({
      error: `Query is too long. Keep it under ${MAX_EXPLORE_QUERY_LENGTH} characters and narrow the ask.`,
    })
    return
  }

  try {
    const askLaunch = normalizeAskLaunchContext(launch)
    if (!askLaunch?.structuredQuery && !askLaunch?.simulationConfig && !askLaunch?.routeHint) {
      res.status(400).json({
        error: 'A direct structured-results or simulation-config launch is required for launch previews.',
      })
      return
    }

    res.json(await buildAskLaunchPreviewResponse(trimmedQuery, askLaunch))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message.includes('rate_limit') ? 429 :
      message.includes('authentication') ? 401 :
      500
    res.status(status).json({ error: message })
  }
})

app.post('/api/explore/chat', exploreRateLimit, async (req, res) => {
  const { messages, history, launch } = req.body as {
    messages?: AskUIMessage[]
    history?: Array<{ query: string; summary: string }>
    launch?: AskLaunchContext
  }
  const originalMessages = Array.isArray(messages) ? messages : []
  const lastUserMessage = [...originalMessages].reverse().find(message => message?.role === 'user')
  const trimmedQuery = extractTextFromUiMessage(lastUserMessage)

  if (!trimmedQuery) {
    res.status(400).json({ error: 'A user question is required.' })
    return
  }
  if (trimmedQuery.length > MAX_EXPLORE_QUERY_LENGTH) {
    res.status(400).json({
      error: `Query is too long. Keep it under ${MAX_EXPLORE_QUERY_LENGTH} characters and narrow the ask.`,
    })
    return
  }
  if (!aiSdkAnthropicProvider) {
    res.status(503).json({ error: MISSING_ANTHROPIC_CONFIG_MESSAGE })
    return
  }

  try {
    const askLaunch = normalizeAskLaunchContext(launch)
    const sessionHistory = normalizeExploreHistory(history)
    const sessionContext = sessionHistory.length
      ? `\n\n## Session Context\nPrevious queries this session:\n${sessionHistory.map((entry, index) => `${index + 1}. "${entry.query}" -> ${entry.summary}`).join('\n')}\n\nBuild on prior context where relevant.`
      : ''
    const systemPrompt = buildExploreChatSystemPrompt(trimmedQuery, sessionContext, askLaunch)
    let latestCachedResults: unknown = null
    let latestStructuredQuery: StructuredResultsQueryPlan | null =
      askLaunch?.routeHint === 'structured-results' || askLaunch?.structuredQuery
        ? resolveStructuredResultsQueryPlan({
            queryHint: trimmedQuery,
            ...(askLaunch?.structuredQuery ?? {}),
          })
        : null
    const prefetchedStructuredExecution = latestStructuredQuery
      ? await executeStructuredResultsQuery({
          queryHint: trimmedQuery,
          queryPlan: latestStructuredQuery,
        })
      : null
    const prefetchedSimulationArtifact =
      askLaunch?.routeHint === 'simulation-config' || askLaunch?.simulationConfig
        ? buildSimulationConfigArtifact(
            buildSimulationConfig((askLaunch?.simulationConfig ?? {}) as Record<string, unknown>),
          )
        : null
    const prefetchedArtifactBlocks = prefetchedStructuredExecution
      ? extractArtifactBlocks(prefetchedStructuredExecution.result)
      : prefetchedSimulationArtifact
        ? [...prefetchedSimulationArtifact.blocks]
        : []
    const stream = createUIMessageStream<AskUIMessage>({
      originalMessages,
      execute: ({ writer }) => {
        const writeArtifact = (artifact: AskArtifactData) => {
          writer.write({
            type: 'data-artifact',
            id: 'ask-artifact',
            data: artifact,
          })
        }
        const writePlan = (plan: AskPlanData) => {
          writer.write({
            type: 'data-plan',
            id: 'ask-plan',
            data: plan,
          })
        }
        const writeStatus = (status: AskStatusData) => {
          writer.write({
            type: 'data-status',
            id: status.id,
            data: status,
          })
        }

        writePlan(buildAskPlanData(trimmedQuery, {
          status: 'planned',
          latestStructuredQuery,
          latestArtifactBlocks: prefetchedArtifactBlocks,
          launch: askLaunch,
        }))
        writeStatus(buildAskStatus(
          'plan',
          'done',
          'Question received',
          'Using the active study package, current query, and recent session context to plan the answer.',
        ))
        if (prefetchedStructuredExecution && prefetchedArtifactBlocks.length > 0) {
          writeArtifact(buildExploreArtifactData(
            'streaming',
            'Structured query prefetched',
            {
              summary: prefetchedStructuredExecution.result.summary,
              blocks: prefetchedArtifactBlocks,
              followUps: [...prefetchedStructuredExecution.result.followUps],
              model: anthropicModel,
              cached: false,
              provenance: {
                source: 'generated',
                label: 'Prefetched structured query',
                detail: 'A typed structured Results launch was executed before the model began its final synthesis step.',
                canonical: false,
              },
            },
          ))
          writeStatus(buildAskStatus(
            'evidence',
            'done',
            'Structured query prefetched',
            'A compact chart and table scaffold is already loaded from the pinned study surface.',
          ))
        } else if (prefetchedSimulationArtifact && prefetchedArtifactBlocks.length > 0) {
          writeArtifact(buildExploreArtifactData(
            'streaming',
            'Experiment plan prefetched',
            {
              summary: prefetchedSimulationArtifact.summary,
              blocks: prefetchedArtifactBlocks,
              followUps: [...prefetchedSimulationArtifact.followUps],
              model: anthropicModel,
              cached: false,
              provenance: {
                source: 'generated',
                label: 'Prefetched experiment plan',
                detail: 'A typed experiment launch was resolved into a bounded exact-mode configuration before the model began its final synthesis step.',
                canonical: false,
              },
            },
          ))
          writeStatus(buildAskStatus(
            'evidence',
            'done',
            'Experiment plan prefetched',
            'A bounded exact-mode configuration is already loaded from the pinned study surface.',
          ))
        }

        const exploreChatTools = buildExploreChatTools(trimmedQuery, {
          launch: askLaunch,
          initialStructuredQuery: latestStructuredQuery,
          initialArtifactBlocks: prefetchedArtifactBlocks,
          initialStructuredExecution: prefetchedStructuredExecution,
          onCachedResults: (result) => {
            latestCachedResults = result
          },
          onStructuredQuery: (queryPlan) => {
            latestStructuredQuery = queryPlan
          },
          onArtifact: writeArtifact,
          onPlan: writePlan,
          onStatus: writeStatus,
        })

        const result = streamText({
          model: aiSdkAnthropicProvider(anthropicModel),
          system: systemPrompt,
          prompt: trimmedQuery,
          maxOutputTokens: 4096,
          tools: exploreChatTools,
          stopWhen: hasToolCall('render_blocks'),
          prepareStep: ({ steps, stepNumber }) => {
            const allToolCalls = steps.flatMap(step => step.toolCalls)
            const route = askLaunch?.routeHint
              ?? (isSimulationPlanningExploreQuery(trimmedQuery)
                ? 'simulation-config'
                : isStructuredResultsQuery(trimmedQuery)
                  ? 'structured-results'
                  : isPrecomputedResultsExploreQuery(trimmedQuery)
                    ? 'results'
                    : isOrientationExploreQuery(trimmedQuery)
                      ? 'orientation'
                      : 'hybrid')
            const expectedTemplates =
              route === 'results' || route === 'structured-results'
                ? resolveExpectedStudyResultsTemplates(trimmedQuery)
                : []
            if (stepNumber === 0 && route === 'simulation-config') {
              writePlan(buildAskPlanData(trimmedQuery, {
                status: 'active',
                latestCachedResults,
                latestStructuredQuery,
                latestArtifactBlocks: prefetchedArtifactBlocks,
                launch: askLaunch,
              }))
              if (prefetchedSimulationArtifact && prefetchedArtifactBlocks.length > 0) {
                writeStatus(buildAskStatus(
                  'compose',
                  'active',
                  'Using prefetched experiment plan',
                  'The typed launch already resolved to a bounded exact-mode configuration, so the assistant can move straight into composition.',
                ))
                return {
                  activeTools: ['render_blocks'],
                  toolChoice: { type: 'tool', toolName: 'render_blocks' },
                  system: `${systemPrompt}\n\n## Prefetched Experiment Plan\nA typed experiment launch already resolved to a bounded exact-mode configuration before reasoning began.\n- Summary: ${clampPromptSnippet(prefetchedSimulationArtifact.summary, 180)}\n- Detail: ${clampPromptSnippet(prefetchedSimulationArtifact.description, 220)}\n\n## Finalization\nA typed experiment launch already has a canonical config scaffold loaded. Do not call build_simulation_config again unless you need a materially different bounded run. Call render_blocks now and preserve the prefetched config table, setup rationale, and caveats as the backbone of the page.`,
                }
              }
              writeStatus(buildAskStatus(
                'plan',
                'active',
                'Routing to experiment planner',
                'This question is asking what to run next, so the assistant is drafting a bounded exact-mode config before answering.',
              ))
              return {
                activeTools: ['build_simulation_config'],
                toolChoice: { type: 'tool', toolName: 'build_simulation_config' },
                system: `${systemPrompt}\n\n## Experiment Planning\nThis question is asking for a bounded run plan. Start by calling build_simulation_config. Use paper-style defaults or presets unless the user asked to override them. Do not claim simulation outcomes yet. After the config is drafted, call render_blocks to present it clearly.`,
              }
            }
            if (stepNumber === 0 && route === 'structured-results') {
              const resolvedQuery = latestStructuredQuery
                ?? resolveStructuredResultsQueryPlan({
                  queryHint: trimmedQuery,
                  ...(askLaunch?.structuredQuery ?? {}),
                })
              latestStructuredQuery = resolvedQuery
              writePlan(buildAskPlanData(trimmedQuery, {
                status: 'active',
                latestCachedResults,
                latestStructuredQuery: resolvedQuery,
                latestArtifactBlocks: prefetchedArtifactBlocks,
                launch: askLaunch,
              }))
              if (prefetchedStructuredExecution && prefetchedArtifactBlocks.length > 0) {
                writeStatus(buildAskStatus(
                  'compose',
                  'active',
                  'Using prefetched structured scaffold',
                  resolvedQuery.view
                    ? `The ${resolvedQuery.view.title} surface is already loaded, so the assistant can move straight into composition.`
                    : 'The pinned structured Results view is already loaded, so the assistant can move straight into composition.',
                ))
                return {
                  activeTools: ['render_blocks'],
                  toolChoice: { type: 'tool', toolName: 'render_blocks' },
                  system: `${systemPrompt}${buildStructuredResultsPrefetchContext(prefetchedStructuredExecution)}\n\n## Finalization\nA typed structured Results query has already been executed for this question and the canonical chart/table scaffold is already loaded. Do not call query_results_table again unless you need a materially different supported query. Call render_blocks now and preserve the prefetched chart/table evidence as the backbone of the page.`,
                }
              }
              writeStatus(buildAskStatus(
                'plan',
                'active',
                'Routing to structured results query',
                resolvedQuery.view
                  ? `This question maps onto ${resolvedQuery.view.title}, so the assistant is starting with that bounded study surface.`
                  : 'This question wants a ranked or tabulated view over the published Results catalog before synthesis.',
              ))
              return {
                activeTools: ['query_results_table'],
                toolChoice: { type: 'tool', toolName: 'query_results_table' },
                system: `${systemPrompt}\n\n## Structured Results Retrieval\nThis question is asking for a structured view over study-owned Results rows. Start by calling query_results_table. Prefer a compact ranking, chart, or table grounded in the published Results catalog. ${resolvedQuery.view ? `The best matching study query view is "${resolvedQuery.view.title}" (${resolvedQuery.view.id}). Reuse its defaults and stay inside its allowed dimensions, metrics, sort keys, and filters unless the user's wording clearly overrides them with another supported choice.` : 'Choose the closest study query view when one is available.'} Do not search topic cards or prior explorations before the structured query returns.`,
              }
            }
            if (stepNumber === 0 && route === 'results' && expectedTemplates.length > 0) {
              writePlan(buildAskPlanData(trimmedQuery, {
                status: 'active',
                latestCachedResults,
                latestStructuredQuery,
                launch: askLaunch,
              }))
              writeStatus(buildAskStatus(
                'plan',
                'active',
                'Routing to Results families',
                `Matching the question to ${expectedTemplates.length} study-owned Results family${expectedTemplates.length === 1 ? '' : 'ies'} before drafting.`,
              ))
              return {
                activeTools: ['query_cached_results'],
                toolChoice: { type: 'tool', toolName: 'query_cached_results' },
                system: `${systemPrompt}\n\n## Results Retrieval\nThis question maps to the following study-owned Results templates:\n${expectedTemplates.map(template => `- ${template.title} (${template.pattern}): ${template.questionAnswered}`).join('\n')}\n\nStart by calling query_cached_results. Do not search topic cards or prior explorations before loading the relevant pre-computed Results family or families.${buildActiveResultsTemplateContext(trimmedQuery, latestCachedResults)}`,
              }
            }
            if (stepNumber >= 1 && allToolCalls.some(toolCall => toolCall.toolName === 'build_simulation_config')) {
              writePlan(buildAskPlanData(trimmedQuery, {
                status: 'active',
                latestCachedResults,
                latestStructuredQuery,
                launch: askLaunch,
              }))
              writeStatus(buildAskStatus(
                'compose',
                'active',
                'Packaging experiment setup',
                'The bounded config is ready, so the assistant is turning it into a readable run plan.',
              ))
              return {
                activeTools: ['render_blocks'],
                toolChoice: { type: 'tool', toolName: 'render_blocks' },
                system: `${systemPrompt}\n\n## Finalization\nYou already have a bounded exact-mode configuration for this question. Do not search cards or Results families. Call render_blocks now and preserve the config table and setup guidance as the backbone of the page.`,
              }
            }
            if (stepNumber >= 1 && allToolCalls.some(toolCall => toolCall.toolName === 'query_results_table')) {
              writePlan(buildAskPlanData(trimmedQuery, {
                status: 'active',
                latestCachedResults,
                latestStructuredQuery,
                launch: askLaunch,
              }))
              writeStatus(buildAskStatus(
                'compose',
                'active',
                'Finalizing structured query',
                'The structured Results rows are loaded, so the assistant is packaging them into the final page.',
              ))
              return {
                activeTools: ['render_blocks'],
                toolChoice: { type: 'tool', toolName: 'render_blocks' },
                system: `${systemPrompt}\n\n## Finalization\nYou already have a grounded structured query artifact from the published Results catalog. Do not call search tools. Call render_blocks now and preserve the chart/table evidence as the backbone of the page.`,
              }
            }
            const hasPublishedResults = normalizePublishedResultsCollection(latestCachedResults).length > 0
            if (hasPublishedResults && route === 'results' && stepNumber >= 1) {
              writePlan(buildAskPlanData(trimmedQuery, {
                status: 'active',
                latestCachedResults,
                latestStructuredQuery,
                launch: askLaunch,
              }))
              const normalizedResponses = normalizePublishedResultsCollection(latestCachedResults)
              const loadedTemplates = resolveStudyResultsTemplatesForResponses(trimmedQuery, normalizedResponses)
              const missingTemplates = expectedTemplates.filter(template =>
                !loadedTemplates.some(loaded => loaded.id === template.id),
              )
              const cachedQueryAttempts = allToolCalls
                .filter(toolCall => toolCall.toolName === 'query_cached_results')
                .length
              if (missingTemplates.length > 0 && cachedQueryAttempts < expectedTemplates.length + 1) {
                writeStatus(buildAskStatus(
                  'evidence',
                  'active',
                  'Loading another Results family',
                  `The current comparison still needs ${missingTemplates.map(template => template.title).join(', ')}.`,
                ))
                const loadedTemplateList = loadedTemplates.length > 0
                  ? loadedTemplates.map(template => `- ${template.title} (${template.pattern})`).join('\n')
                  : '- None yet'
                const missingTemplateList = missingTemplates
                  .map(template => `- ${template.title} (${template.pattern}): ${template.questionAnswered}`)
                  .join('\n')
                return {
                  activeTools: ['query_cached_results'],
                  toolChoice: { type: 'tool', toolName: 'query_cached_results' },
                  system: `${systemPrompt}\n\n## Results Retrieval\nThis question spans multiple study-owned Results templates. You have loaded:\n${loadedTemplateList}\n\nYou still need:\n${missingTemplateList}\n\nCall query_cached_results again to retrieve the missing Results family before calling render_blocks. Do not search topic cards or prior explorations. Once the missing Results family is loaded, you can call render_blocks.${buildActiveResultsTemplateContext(trimmedQuery, latestCachedResults)}`,
                }
              }
              const templateContext = buildActiveResultsTemplateContext(trimmedQuery, latestCachedResults)
              writeStatus(buildAskStatus(
                'compose',
                'active',
                'Drafting from retrieved evidence',
                'The required Results families are loaded, so the assistant is moving into synthesis and page composition.',
              ))
              return {
                activeTools: ['render_blocks'],
                toolChoice: { type: 'tool', toolName: 'render_blocks' },
                system: `${systemPrompt}\n\n## Finalization\nYou already have exact pre-computed results and a study-owned artifact scaffold for this question. Do not call search cards or prior exploration tools. Call render_blocks now and organize the page from the retrieved Results evidence.${templateContext}`,
              }
            }
            if (!shouldForceExploreRenderStep(stepNumber, allToolCalls)) {
              return undefined
            }

            writePlan(buildAskPlanData(trimmedQuery, {
              status: 'active',
              latestCachedResults,
              latestStructuredQuery,
              launch: askLaunch,
            }))
            writeStatus(buildAskStatus(
              'compose',
              'active',
              'Drafting answer',
              'Enough evidence is in hand to organize the answer into the final reading surface.',
            ))
            return {
              activeTools: ['render_blocks'],
              toolChoice: { type: 'tool', toolName: 'render_blocks' },
              system: `${systemPrompt}\n\n## Finalization\nYou already have enough evidence for this answer. Do not call any more lookup tools. Call render_blocks now and organize the page from the evidence already gathered in this conversation.`,
            }
          },
        })

        writer.merge(result.toUIMessageStream<AskUIMessage>())
      },
    })

    pipeUIMessageStreamToResponse({
      response: res,
      stream,
      headers: undefined,
      status: undefined,
      statusText: undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message.includes('rate_limit') ? 429 :
      message.includes('authentication') ? 401 :
      500

    res.status(status).json({ error: message })
  }
})

app.post('/api/explore', exploreRateLimit, async (req, res) => {
  const { query, history } = req.body as ExploreRequest
  const trimmedQuery = query?.trim()

  if (!trimmedQuery) {
    res.status(400).json({ error: 'Query is required' })
    return
  }
  if (trimmedQuery.length > MAX_EXPLORE_QUERY_LENGTH) {
    res.status(400).json({
      error: `Query is too long. Keep it under ${MAX_EXPLORE_QUERY_LENGTH} characters and narrow the ask.`,
    })
    return
  }

  const sessionHistory = normalizeExploreHistory(history)

  if (!client) {
    const curatedMatch = findCuratedMatch(trimmedQuery)
    if (curatedMatch) {
      res.json(buildCuratedResponse(curatedMatch))
      return
    }

    const historyMatch = explorationStore.findBestMatch(trimmedQuery, 0.82)
    const reusedHistory = buildHistoryResponse(historyMatch)
    if (reusedHistory) {
      res.json(reusedHistory)
      return
    }

    res.status(503).json({ error: MISSING_ANTHROPIC_CONFIG_MESSAGE })
    return
  }

  try {
    const sessionContext = sessionHistory.length
      ? `\n\n## Session Context\nPrevious queries this session:\n${sessionHistory.map((entry, index) => `${index + 1}. "${entry.query}" -> ${entry.summary}`).join('\n')}\n\nBuild on prior context where relevant.`
      : ''
    const queryModeContext = buildExploreQueryModeContext(trimmedQuery)
    const resultsModeContext = buildExploreResultsModeContext(trimmedQuery)
    const structuredResultsModeContext = buildExploreStructuredResultsModeContext(trimmedQuery)
    const simulationPlanningModeContext = buildExploreSimulationPlanningModeContext(trimmedQuery)

    // Multi-turn tool execution loop
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: trimmedQuery },
    ]
    const MAX_TOOL_ROUNDS = 3
    let finalResponse: Anthropic.Messages.Message | null = null
    let latestCachedResults: unknown = null
    let latestArtifactBlocks: Block[] = []
    const cacheCachedResult = (result: unknown) => {
      const normalizedResult = normalizePublishedResultsToolResponse(result)
      if (normalizedResult) {
        const current = normalizePublishedResultsCollection(latestCachedResults)
        const signature = JSON.stringify(normalizedResult.query) + '::' + normalizedResult.results.map(entry => entry.datasetPath).join('|')
        const next = current.filter(existing =>
          JSON.stringify(existing.query) + '::' + existing.results.map(entry => entry.datasetPath).join('|') !== signature,
        )
        next.push(normalizedResult)
        latestCachedResults = next.slice(-3)
      } else {
        latestCachedResults = result
      }
      const scaffoldFromResults = buildExploreArtifactScaffold(trimmedQuery, latestCachedResults)
      latestArtifactBlocks = scaffoldFromResults.length > 0 ? scaffoldFromResults : latestArtifactBlocks
    }

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: anthropicModel,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: STUDY_CONTEXT + sessionContext + queryModeContext + resultsModeContext + structuredResultsModeContext + simulationPlanningModeContext,
            cache_control: sessionHistory.length ? undefined : { type: 'ephemeral' },
          },
        ],
        tools: exploreTools,
        tool_choice: round === MAX_TOOL_ROUNDS
          ? { type: 'tool', name: 'render_blocks' }
          : { type: 'auto' },
        messages,
      })

      // Check if Claude called render_blocks (the terminal tool)
      const renderCall = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === 'tool_use' && block.name === 'render_blocks',
      )

      if (renderCall || response.stop_reason === 'end_turn') {
        finalResponse = response
        break
      }

      // Execute intermediate tool calls and continue the loop
      const toolCalls = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      )

      if (toolCalls.length === 0) {
        finalResponse = response
        break
      }

      // Add assistant message with tool calls
      messages.push({ role: 'assistant', content: response.content })

      // Add tool results
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(toolCalls.map(async call => {
        const result = await executeExploreChatToolCall(call.name, call.input as Record<string, unknown>)
        if (call.name === 'query_cached_results') {
          cacheCachedResult(result)
        } else {
          const blocks = extractArtifactBlocks(result)
          if (blocks.length > 0) {
            latestArtifactBlocks = blocks
          }
        }
        return {
          type: 'tool_result' as const,
          tool_use_id: call.id,
          content: JSON.stringify(result),
        }
      }))
      messages.push({ role: 'user', content: toolResults })
    }

    if (!finalResponse) {
      res.status(500).json({ error: 'Tool execution loop exhausted without a final response' })
      return
    }

    const toolUse = finalResponse.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    )

    if (!toolUse) {
      res.status(500).json({ error: 'No tool_use in response' })
      return
    }

    const input = toolUse.input as {
      summary?: string
      blocks?: unknown[]
      follow_ups?: string[]
    }
    const result = buildGeneratedExploreResponse(trimmedQuery, input, {
      model: finalResponse.model,
      cached: finalResponse.usage?.cache_read_input_tokens
        ? finalResponse.usage.cache_read_input_tokens > 0
        : false,
      canonicalBlocks: (() => {
        const scaffoldFromResults = buildExploreArtifactScaffold(trimmedQuery, latestCachedResults)
        return scaffoldFromResults.length > 0 ? scaffoldFromResults : latestArtifactBlocks
      })(),
    })
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message.includes('rate_limit') ? 429 :
      message.includes('authentication') ? 401 :
      500

    res.status(status).json({ error: message })
  }
})

app.post('/api/published-replay-copilot', publishedReplayCopilotRateLimit, async (req, res) => {
  const request = req.body as PublishedReplayCopilotRequest
  const trimmedQuestion = request.question?.trim()

  if (!trimmedQuestion) {
    res.status(400).json({ error: 'Question is required.' })
    return
  }
  if (trimmedQuestion.length > MAX_SIMULATION_QUESTION_LENGTH) {
    res.status(400).json({
      error: `Question is too long. Keep it under ${MAX_SIMULATION_QUESTION_LENGTH} characters and focus on one replay-backed question at a time.`,
    })
    return
  }

  if (!renderBlocksTool) {
    res.status(500).json({ error: 'The render_blocks tool is unavailable on this server.' })
    return
  }

  if (!client) {
    res.status(503).json({ error: MISSING_ANTHROPIC_CONFIG_MESSAGE })
    return
  }

  try {
    const replayContext = await buildPublishedReplayContext(request)
    const response = await client.messages.create({
      model: anthropicModel,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: `${STUDY_CONTEXT}\n\n${PUBLISHED_REPLAY_COPILOT_CONTEXT}\n\n${replayContext.context}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [renderBlocksTool],
      tool_choice: { type: 'tool', name: 'render_blocks' },
      messages: [
        { role: 'user', content: trimmedQuestion },
      ],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'render_blocks',
    )

    if (!toolUse) {
      res.status(500).json({ error: 'Published replay companion did not return renderable blocks.' })
      return
    }

    const input = toolUse.input as {
      summary?: string
      blocks?: unknown[]
      follow_ups?: string[]
    }

    const normalizedBlocks = normalizeGeneratedBlocks(input.blocks)
    const evidenceBlocks = buildPublishedReplayEvidenceBlocks(
      request,
      replayContext.focusSnapshot,
      replayContext.compareFocusSnapshot,
    )
    const guideInsight = buildPublishedReplayGuideInsight(
      request,
      replayContext.focusSnapshot,
      replayContext.compareFocusSnapshot,
    )
    const publishedBlocks = enrichPublishedReplayBlocks(
      normalizedBlocks,
      evidenceBlocks,
      guideInsight,
    )
    const normalizedSummary = buildPublishedReplaySummary(
      request,
      replayContext.focusSnapshot,
      replayContext.compareFocusSnapshot,
    )
    const normalizedFollowUps = buildPublishedReplayFollowUps(
      replayContext.focusSnapshot,
      replayContext.compareFocusSnapshot,
    )

    const result: PublishedReplayCopilotResponse = {
      summary: normalizedSummary,
      blocks: publishedBlocks,
      followUps: normalizedFollowUps,
      truthBoundary: {
        label: 'Assistant framing over a frozen published replay',
        detail: request.comparePath
          ? 'This answer is grounded in the selected published dataset and the supplied comparison replay. The model organizes the evidence, but it does not create new simulation outputs.'
          : 'This answer is grounded in the selected frozen published dataset. The model organizes the evidence, but it does not create new simulation outputs.',
      },
      model: response.model,
      cached: response.usage?.cache_read_input_tokens
        ? response.usage.cache_read_input_tokens > 0
        : false,
      provenance: {
        source: 'generated',
        label: 'Published replay companion',
        detail: request.comparePath
          ? 'Generated against the active published replay and the selected comparison replay.'
          : 'Generated against the active published replay.',
        canonical: false,
        datasetPath: toPublishedResultsRelativePath(replayContext.datasetPath),
        comparePath: replayContext.comparePath
          ? toPublishedResultsRelativePath(replayContext.comparePath)
          : undefined,
      },
    }

    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message.includes('rate_limit') ? 429 :
      message.includes('authentication') ? 401 :
      message.includes('could not be resolved') ? 400 :
      500

    res.status(status).json({ error: message })
  }
})

app.get('/api/published-replay-notes', (req, res) => {
  const datasetPath = normalizePublishedDatasetPath(typeof req.query.datasetPath === 'string' ? req.query.datasetPath : null)
  const slotIndex = toNonNegativeInteger(req.query.slotIndex)

  if (!datasetPath) {
    res.status(400).json({ error: 'A valid published dataset path is required.' })
    return
  }
  if (slotIndex == null) {
    res.status(400).json({ error: 'A valid slot index is required.' })
    return
  }

  const comparePath = normalizePublishedDatasetPath(typeof req.query.comparePath === 'string' ? req.query.comparePath : null)
  const comparisonSlotIndex = toNonNegativeInteger(req.query.comparisonSlotIndex)
  const paperLens = normalizePublishedPaperLens(req.query.paperLens)
  const audienceMode = normalizePublishedAudienceMode(req.query.audienceMode)
  const threadKey = buildPublishedReplayNoteThreadKey({
    datasetPath,
    comparePath,
    slotIndex,
    comparisonSlotIndex,
    paperLens,
    audienceMode,
  })

  res.json({
    notes: publishedReplayNotesStore.get(threadKey) ?? [],
  })
})

app.post('/api/published-replay-notes', async (req, res) => {
  const request = req.body as CreatePublishedReplayNoteRequest
  const datasetPath = normalizePublishedDatasetPath(request.datasetPath)
  const slotIndex = toNonNegativeInteger(request.slotIndex)
  const slotNumber = toNonNegativeInteger(request.slotNumber)
  const note = request.note?.trim()

  if (!datasetPath) {
    res.status(400).json({ error: 'A valid published dataset path is required.' })
    return
  }
  if (slotIndex == null || slotNumber == null || slotNumber < 1) {
    res.status(400).json({ error: 'A valid replay slot is required before saving a paper note.' })
    return
  }
  if (!note) {
    res.status(400).json({ error: 'Note text is required.' })
    return
  }
  if (note.length > 2000) {
    res.status(400).json({ error: 'Keep paper notes under 2000 characters.' })
    return
  }

  const paperLens = normalizePublishedPaperLens(request.paperLens)
  const audienceMode = normalizePublishedAudienceMode(request.audienceMode)
  const comparePath = normalizePublishedDatasetPath(request.comparePath)
  const comparisonSlotIndex = toNonNegativeInteger(request.comparisonSlotIndex)
  const comparisonSlotNumber = toNonNegativeInteger(request.comparisonSlotNumber)
  const intent = request.intent && PUBLISHED_REPLAY_NOTE_INTENTS.has(request.intent)
    ? request.intent
    : 'observation'
  const contributionType = request.contributionType && PUBLISHED_REPLAY_CONTRIBUTION_TYPES.has(request.contributionType)
    ? request.contributionType
    : defaultPublishedReplayContributionType(intent)
  const status = request.status && PUBLISHED_REPLAY_NOTE_STATUSES.has(request.status)
    ? request.status
    : defaultPublishedReplayNoteStatus(contributionType)
  const communityLane = request.communityLane && PUBLISHED_REPLAY_COMMUNITY_LANES.has(request.communityLane)
    ? request.communityLane
    : defaultPublishedReplayCommunityLane(audienceMode)
  const annotationScope = request.annotationScope && PUBLISHED_REPLAY_ANNOTATION_SCOPES.has(request.annotationScope)
    ? request.annotationScope
    : (request.anchorKind === 'comparison' ? 'comparison_gap' : 'exact_slot')
  const rangeStartSlotIndex = toNonNegativeInteger(request.rangeStartSlotIndex)
  const rangeStartSlotNumber = toNonNegativeInteger(request.rangeStartSlotNumber)
  const rangeEndSlotIndex = toNonNegativeInteger(request.rangeEndSlotIndex)
  const rangeEndSlotNumber = toNonNegativeInteger(request.rangeEndSlotNumber)
  const anchorKind = request.anchorKind && PUBLISHED_REPLAY_NOTE_ANCHOR_KINDS.has(request.anchorKind)
    ? request.anchorKind
    : 'general'
  const threadKey = buildPublishedReplayNoteThreadKey({
    datasetPath,
    comparePath,
    slotIndex,
    comparisonSlotIndex,
    paperLens,
    audienceMode,
  })

  const nextNote: PublishedReplayNote = {
    id: randomUUID(),
    datasetPath: toPublishedResultsRelativePath(datasetPath),
    datasetLabel: request.datasetLabel?.trim() || null,
    comparePath: comparePath ? toPublishedResultsRelativePath(comparePath) : null,
    compareLabel: request.compareLabel?.trim() || null,
    slotIndex,
    slotNumber,
    comparisonSlotIndex,
    comparisonSlotNumber,
    paperLens,
    audienceMode,
    intent,
    status,
    contributionType,
    communityLane,
    annotationScope,
    rangeStartSlotIndex,
    rangeStartSlotNumber,
    rangeEndSlotIndex,
    rangeEndSlotNumber,
    anchorKind,
    anchorKey: request.anchorKey?.trim() || null,
    anchorLabel: request.anchorLabel?.trim() || null,
    note,
    replies: [],
    contextLabel: request.contextLabel?.trim() || null,
    createdAt: new Date().toISOString(),
  }

  const existing = publishedReplayNotesStore.get(threadKey) ?? []
  publishedReplayNotesStore.set(threadKey, [nextNote, ...existing].slice(0, 100))

  try {
    await persistPublishedReplayNotesStore()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist published replay note.', error)
    res.status(500).json({ error: 'Failed to persist the replay note.' })
    return
  }

  res.status(201).json({ note: nextNote })
})

app.post('/api/published-replay-notes/:noteId/replies', async (req, res) => {
  const noteId = typeof req.params.noteId === 'string' ? req.params.noteId : ''
  const request = req.body as AddPublishedReplayNoteReplyRequest
  const reply = request.reply?.trim()

  if (!noteId) {
    res.status(400).json({ error: 'A note id is required.' })
    return
  }
  if (!reply) {
    res.status(400).json({ error: 'Reply text is required.' })
    return
  }
  if (reply.length > 1200) {
    res.status(400).json({ error: 'Keep note replies under 1200 characters.' })
    return
  }

  const located = findPublishedReplayNoteById(noteId)
  if (!located) {
    res.status(404).json({ error: 'Replay note not found.' })
    return
  }

  const updatedNote: PublishedReplayNote = {
    ...located.note,
    replies: [
      ...located.note.replies,
      {
        id: randomUUID(),
        text: reply,
        createdAt: new Date().toISOString(),
      },
    ],
  }

  const nextNotes = [...located.notes]
  nextNotes[located.index] = updatedNote
  publishedReplayNotesStore.set(located.threadKey, nextNotes)

  try {
    await persistPublishedReplayNotesStore()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist published replay note reply.', error)
    res.status(500).json({ error: 'Failed to persist the replay note reply.' })
    return
  }

  res.status(201).json({ note: updatedNote })
})

app.post('/api/published-replay-notes/:noteId/status', async (req, res) => {
  const noteId = typeof req.params.noteId === 'string' ? req.params.noteId : ''
  const request = req.body as UpdatePublishedReplayNoteStatusRequest
  const status = request.status && PUBLISHED_REPLAY_NOTE_STATUSES.has(request.status)
    ? request.status
    : null

  if (!noteId) {
    res.status(400).json({ error: 'A note id is required.' })
    return
  }
  if (!status) {
    res.status(400).json({ error: 'A valid note status is required.' })
    return
  }

  const located = findPublishedReplayNoteById(noteId)
  if (!located) {
    res.status(404).json({ error: 'Replay note not found.' })
    return
  }

  const updatedNote: PublishedReplayNote = {
    ...located.note,
    status,
  }

  const nextNotes = [...located.notes]
  nextNotes[located.index] = updatedNote
  publishedReplayNotesStore.set(located.threadKey, nextNotes)

  try {
    await persistPublishedReplayNotesStore()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist published replay note status.', error)
    res.status(500).json({ error: 'Failed to persist the replay note status.' })
    return
  }

  res.json({ note: updatedNote })
})

app.post('/api/simulation-copilot', simulationCopilotRateLimit, async (req, res) => {
  const { question, currentJobId, currentConfig } = req.body as SimulationCopilotRequest
  const trimmedQuestion = question?.trim()

  if (!trimmedQuestion) {
    res.status(400).json({ error: 'Question is required.' })
    return
  }
  if (trimmedQuestion.length > MAX_SIMULATION_QUESTION_LENGTH) {
    res.status(400).json({
      error: `Question is too long. Keep it under ${MAX_SIMULATION_QUESTION_LENGTH} characters and focus on one comparison or hypothesis at a time.`,
    })
    return
  }

  if (!client) {
    res.status(503).json({ error: MISSING_ANTHROPIC_CONFIG_MESSAGE })
    return
  }

  const currentJob = typeof currentJobId === 'string' && currentJobId
    ? simulationRuntime.getJob(currentJobId)
    : null
  const parsedCurrentConfig = currentConfig ? parseSimulationRequest(currentConfig) : null
  const effectiveConfig = currentJob?.manifest?.config ?? currentJob?.config ?? parsedCurrentConfig ?? DEFAULT_SIMULATION_CONFIG
  const currentContext = await buildSimulationCopilotContext(effectiveConfig, currentJob)

  try {
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: trimmedQuestion },
    ]
    const MAX_TOOL_ROUNDS = 4
    let finalResponse: Anthropic.Messages.Message | null = null

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: anthropicModel,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: `${SIMULATION_COPILOT_CONTEXT}\n\n${currentContext}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: simulationCopilotTools,
        tool_choice: round === MAX_TOOL_ROUNDS
          ? { type: 'tool', name: 'render_simulation_view_spec' }
          : { type: 'auto' },
        messages,
      })

      const finalTool = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === 'tool_use' && block.name === 'render_simulation_view_spec',
      )

      if (finalTool || response.stop_reason === 'end_turn') {
        finalResponse = response
        break
      }

      const toolCalls = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      )

      if (toolCalls.length === 0) {
        finalResponse = response
        break
      }

      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = toolCalls.map(call => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: JSON.stringify(executeToolCall(call.name, call.input as Record<string, unknown>)),
      }))
      messages.push({ role: 'user', content: toolResults })
    }

    if (!finalResponse) {
      res.status(500).json({ error: 'Simulation copilot tool loop exhausted without a final response.' })
      return
    }

    const toolUse = finalResponse.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'render_simulation_view_spec',
    )

    if (!toolUse) {
      res.status(500).json({ error: 'Simulation copilot did not return a view spec.' })
      return
    }

    const parsedViewSpec = simulationViewSpecSchema.safeParse(toolUse.input)
    if (!parsedViewSpec.success) {
      res.status(500).json({ error: 'Simulation copilot returned an invalid view spec.' })
      return
    }

    const proposedConfig = parsedViewSpec.data.proposedConfig
      ? parseSimulationRequest(parsedViewSpec.data.proposedConfig)
      : null
    const sanitizedViewSpec: SimulationViewSpec = proposedConfig
      ? { ...parsedViewSpec.data, proposedConfig }
      : { ...parsedViewSpec.data, proposedConfig: undefined }

    const blocks = await resolveSimulationViewSpec(
      sanitizedViewSpec,
      currentJob?.manifest ?? null,
      effectiveConfig,
    )

    const result: SimulationCopilotResponse = {
      summary: limitText(sanitizedViewSpec.summary, 180) || 'Simulation guidance',
      mode: sanitizedViewSpec.mode,
      guidance: limitText(sanitizedViewSpec.guidance, 240) || undefined,
      truthBoundary: buildTruthBoundary(sanitizedViewSpec.mode, Boolean(currentJob?.manifest)),
      suggestedPrompts: normalizeSimulationPrompts(
        trimmedQuestion,
        sanitizedViewSpec.suggestedPrompts,
        defaultSimulationPrompts(currentJob?.manifest ?? null),
      ),
      proposedConfig: proposedConfig ?? undefined,
      viewSpec: sanitizedViewSpec,
      blocks,
      model: finalResponse.model,
      cached: finalResponse.usage?.cache_read_input_tokens
        ? finalResponse.usage.cache_read_input_tokens > 0
        : false,
    }

    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status =
      message.includes('rate_limit') ? 429 :
      message.includes('authentication') ? 401 :
      500

    res.status(status).json({ error: message })
  }
})

// ── llm.txt — agent-readable site map for AI navigation ──
app.get('/llm.txt', (_req, res) => {
  res.type('text/plain').send(`# Geography Drives Blockchain Centralization
> Interactive research explorer for arXiv:2509.21475
> Yang, Oz, Wu, Zhang (2025)
> Last updated: ${new Date().toISOString().slice(0, 10)}

## Identity
- Type: Research paper explorer with simulation lab
- Domain: Ethereum geographic decentralization
- Paper: arXiv:2509.21475 (peer-reviewed)
- License: Academic research interface — editorial text is LLM-generated

## What this site is
An editorial reading layer and simulation lab built over a peer-reviewed paper
studying how geography shapes validator concentration in Ethereum under two
block-building paradigms: external block building (PBS/ePBS, supplier-based) and local block building (direct signal aggregation).

The site presents the same paper at four fidelity levels:
  Editorial (LLM narrative) → Focus (clean reading) → Argument Map (extracted claims) → Original PDF (source)
Each editorial element carries a provenance tag linking it to the paper source or marking it as interpretation.

## Key findings (5 claims)
1. Both external and local block building centralize validators toward low-latency cloud regions.
2. The attestation threshold (gamma) has OPPOSITE effects: higher gamma
   increases external centralization but can decrease local centralization.
3. Starting validator distribution dominates paradigm choice for first-order outcomes.
4. Shorter slot times (EIP-7782) amplify reward inequality without changing geography.
5. Transient decentralization under joint heterogeneity is fragile, not a mitigation.

## Paper sections (navigable via URL hash)
| Hash                  | Paper ref | Topic                                      |
|-----------------------|-----------|--------------------------------------------|
| #system-model         | §3        | Two-layer geographic game                  |
| #simulation-design    | §5.2      | 40 regions, 1000 validators, 10000 slots   |
| #baseline-results     | §5.3      | Convergence under homogeneous start        |
| #se1-source-placement | §5.4      | Infrastructure alignment effects           |
| #se2-distribution     | §5.5      | Realistic validator distribution           |
| #se3-joint            | §5.6      | Transient decentralization (fragile)       |
| #se4a-attestation     | §5.7.1    | Gamma paradox (signature result)           |
| #se4b-slots           | §5.7.2    | Shorter slot times (EIP-7782)              |
| #discussion           | §6        | Mitigation directions (diagnostic)         |
| #limitations          | §6.3      | Model assumptions and confidence boundary  |

## Reading modes (interpretation spectrum, left to right)
1. Editorial     — LLM-generated narrative with source provenance pills
2. Focus         — Same content, distraction-free centered layout
3. Argument Map  — Expandable structured claims by section
4. Original PDF  — Published arXiv PDF — unmodified source document

## API endpoints (base: /api)
POST /api/explore              — Ask questions, returns structured Block[] visualizations
GET  /api/explorations         — List community explorations (search, sort, filter)
POST /api/simulations          — Run agent-based simulation with custom config
GET  /api/simulations/:id      — Check simulation job status
GET  /api/simulations/:id/manifest — Get simulation output manifest
GET  /api/health               — Server health check

## Simulation parameters
| Parameter            | Type    | Default       | Range/Options                               |
|----------------------|---------|---------------|---------------------------------------------|
| paradigm             | string  | SSP           | SSP (External), MSP (Local)                 |
| validators           | number  | 1000          | 10–10000                                    |
| slots                | number  | 1000          | 100–50000                                   |
| distribution         | string  | homogeneous   | homogeneous, heterogeneous                  |
| sourcePlacement      | string  | homogeneous   | homogeneous, latency-aligned, latency-misaligned |
| migrationCost        | number  | 0.002         | 0–1                                         |
| attestationThreshold | number  | 0.667         | 0.1–1.0                                     |
| slotTime             | number  | 12            | 1–60 (seconds)                              |
| seed                 | number  | random        | any integer                                 |

## Source material
- Paper: https://arxiv.org/abs/2509.21475
- PDF:   https://arxiv.org/pdf/2509.21475
- Code:  https://github.com/syang-ng/geographical-decentralization-simulation
- Data:  GCP inter-region latency measurements (40 regions)

## Content provenance
Editorial narrative text is LLM-generated interpretation of the paper.
Each editorial element is tagged with a source reference:
- [section: §X pN] = paraphrases paper section X, PDF page N
- [figure: Fig. N pN] = interprets a specific figure
- [table: Table N pN] = interprets a specific table
- [editorial] = LLM inference, not a direct paraphrase
The Original PDF mode shows the unmodified published paper.

## Extended content
- /llm-full.txt — Complete section narratives with provenance tags
                   (use this for deep content understanding)
`)
})

// ── llm-full.txt — deep content for agents that want section narratives ──
app.get('/llm-full.txt', async (_req, res) => {
  const paperNarrative = ACTIVE_STUDY.narratives
  const paperSections = ACTIVE_STUDY.sections

  const sections = paperSections.map(section => {
    const narrative = paperNarrative[section.id]
    const refs = narrative?.sourceRefs
    const sourceInfo = (ref: { label: string; kind: string; page?: number } | undefined) =>
      ref ? `[${ref.kind}: ${ref.label}${ref.page ? ` p.${ref.page}` : ''}]` : ''

    return [
      `### ${section.number} ${section.title}`,
      `ID: #${section.id}`,
      `Summary: ${section.description}`,
      '',
      narrative ? [
        `Lede ${sourceInfo(refs?.lede)}:`,
        narrative.lede,
        '',
        ...narrative.paragraphs.flatMap((p, i) => [
          `Paragraph ${i + 1} ${sourceInfo(refs?.paragraphs?.[i])}:`,
          p,
          '',
        ]),
        `Pull quote ${sourceInfo(refs?.pullQuote)}:`,
        `"${narrative.pullQuote}"`,
        '',
        `Evidence blocks: ${section.blocks.map(b => b.type).join(', ')}`,
      ].join('\n') : 'No editorial narrative for this section.',
    ].join('\n')
  }).join('\n\n---\n\n')

  res.type('text/plain').send([
    '# Geography Drives Blockchain Centralization — Full Content',
    `> Generated: ${new Date().toISOString().slice(0, 10)}`,
    '> For the site map and API reference, see /llm.txt',
    '> This file contains the complete editorial narrative for each paper section.',
    '',
    '## Content provenance key',
    'Each element below is tagged with its source:',
    '- [section: §X pN] = paraphrases paper section X, PDF page N',
    '- [figure: Fig. N pN] = interprets figure N from the paper',
    '- [table: Table N pN] = interprets table N from the paper',
    '- [editorial] = LLM-generated interpretation, not a direct paraphrase',
    '',
    `## Section narratives (${paperSections.length} sections)`,
    '',
    sections,
  ].join('\n'))
})

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    tools: exploreTools.length,
    simulationCopilotTools: simulationCopilotTools.length,
    anthropicEnabled: Boolean(client),
    anthropicModel: client ? anthropicModel : null,
    envFileLoaded: existsSync(envFile),
    simulations: simulationRuntime.health(),
  })
})

app.post('/api/simulations', simulationSubmitRateLimit, (req, res) => {
  const config = parseSimulationRequest(req.body)
  if (!config) {
    res.status(400).json({ error: 'Invalid simulation request payload.' })
    return
  }

  const rawClientId = typeof req.body?.clientId === 'string' ? req.body.clientId : null
  const clientId = rawClientId?.trim()
  if (clientId && clientId.length > MAX_CLIENT_ID_LENGTH) {
    res.status(400).json({ error: `clientId is too long. Keep it under ${MAX_CLIENT_ID_LENGTH} characters.` })
    return
  }

  try {
    const job = simulationRuntime.submit(config, { clientId })
    res.status(job.status === 'completed' ? 200 : 202).json(job)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Simulation submission failed.'
    const status = message.includes('queue is full') || message.includes('Too many active simulation jobs')
      ? 429
      : 500
    res.status(status).json({ error: message })
  }
})

app.get('/api/simulations/:jobId', (req, res) => {
  const job = simulationRuntime.getJob(req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Simulation job not found.' })
    return
  }

  res.json(job)
})

app.post('/api/simulations/:jobId/cancel', (req, res) => {
  const job = simulationRuntime.cancel(req.params.jobId)
  if (!job) {
    res.status(404).json({ error: 'Simulation job not found.' })
    return
  }

  res.json(job)
})

app.get('/api/simulations/:jobId/events', (req, res) => {
  const initialSnapshot = simulationRuntime.getJob(req.params.jobId)
  if (!initialSnapshot) {
    res.status(404).json({ error: 'Simulation job not found.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const heartbeat = setInterval(() => {
    res.write(`: keep-alive\n\n`)
  }, 15000)

  res.write(`event: snapshot\n`)
  res.write(`data: ${JSON.stringify(initialSnapshot)}\n\n`)

  if (
    initialSnapshot.status === 'completed'
    || initialSnapshot.status === 'failed'
    || initialSnapshot.status === 'cancelled'
  ) {
    clearInterval(heartbeat)
    res.end()
    return
  }

  const unsubscribe = simulationRuntime.subscribe(req.params.jobId, snapshot => {
    res.write(`event: snapshot\n`)
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`)

    if (
      snapshot.status === 'completed'
      || snapshot.status === 'failed'
      || snapshot.status === 'cancelled'
    ) {
      clearInterval(heartbeat)
      unsubscribe?.()
      res.end()
    }
  })

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

app.get('/api/simulations/cached', async (req, res) => {
  const paradigm = typeof req.query.paradigm === 'string' ? req.query.paradigm as 'SSP' | 'MSP' : undefined
  const distribution = typeof req.query.distribution === 'string' ? req.query.distribution : undefined
  const sourcePlacement = typeof req.query.sourcePlacement === 'string' ? req.query.sourcePlacement : undefined

  const results = await simulationRuntime.listCachedResults({ paradigm, distribution, sourcePlacement })
  res.json({ results })
})

app.get('/api/simulations/:jobId/manifest', (req, res) => {
  const manifest = simulationRuntime.getManifest(req.params.jobId)
  if (!manifest) {
    res.status(409).json({ error: 'Simulation job is not completed yet.' })
    return
  }

  res.json(manifest)
})

function clientAcceptsEncoding(acceptEncoding: string, encoding: 'br' | 'gzip'): boolean {
  const pattern = encoding === 'br' ? /\bbr\b/i : /\bgzip\b/i
  return pattern.test(acceptEncoding)
}

app.get('/api/simulations/:jobId/artifacts/:artifactName', async (req, res) => {
  try {
    const acceptEncoding = req.header('accept-encoding') ?? ''
    const { artifact, body, contentEncoding } = await simulationRuntime.readArtifact(
      req.params.jobId,
      req.params.artifactName,
      {
        preferBrotli: clientAcceptsEncoding(acceptEncoding, 'br'),
        preferGzip: clientAcceptsEncoding(acceptEncoding, 'gzip'),
      },
    )
    res.setHeader('Content-Type', `${artifact.contentType}; charset=utf-8`)
    res.setHeader('ETag', artifact.sha256)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Vary', 'Accept-Encoding')
    if (contentEncoding) {
      res.setHeader('Content-Encoding', contentEncoding)
    }
    res.send(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read artifact.'
    const status = message.includes('not available') ? 409 :
      message.includes('Unknown artifact') ? 404 :
      500
    res.status(status).json({ error: message })
  }
})

app.get('/api/simulations/:jobId/overview-bundles/:bundleName', async (req, res) => {
  try {
    const acceptEncoding = req.header('accept-encoding') ?? ''
    const { overviewBundle, body, contentEncoding } = await simulationRuntime.readOverviewBundle(
      req.params.jobId,
      req.params.bundleName,
      {
        preferBrotli: clientAcceptsEncoding(acceptEncoding, 'br'),
        preferGzip: clientAcceptsEncoding(acceptEncoding, 'gzip'),
      },
    )
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('ETag', overviewBundle.sha256)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Vary', 'Accept-Encoding')
    if (contentEncoding) {
      res.setHeader('Content-Encoding', contentEncoding)
    }
    res.send(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read overview bundle.'
    const status = message.includes('not available') ? 409 :
      message.includes('Unknown overview bundle') ? 404 :
      500
    res.status(status).json({ error: message })
  }
})

app.get('/api/explorations', (req, res) => {
  const sort = (req.query.sort as 'recent' | 'top') ?? 'recent'
  const limit = req.query.limit ? Number(req.query.limit) : undefined
  const search = (req.query.search as string) ?? undefined
  const publishedOnly = parseBooleanQueryValue(req.query.published)
  const featuredOnly = parseBooleanQueryValue(req.query.featured)
  const verifiedOnly = parseBooleanQueryValue(req.query.verified)
  const surface = req.query.surface === 'reading' || req.query.surface === 'simulation'
    ? req.query.surface
    : undefined

  const explorations = explorationStore.list({
    sort,
    limit,
    search,
    publishedOnly,
    featuredOnly,
    verifiedOnly,
    surface,
  })
  res.json(explorations)
})

app.post('/api/explorations', (req, res) => {
  const {
    query,
    summary,
    blocks,
    followUps,
    model,
    cached,
    surface,
    anchor,
  } = req.body as CreateExplorationRequest

  const trimmedQuery = query?.trim()
  const trimmedSummary = summary?.trim()
  if (!trimmedQuery || !trimmedSummary) {
    res.status(400).json({ error: 'query and summary are required' })
    return
  }

  const parsedBlocks = parseBlocks(Array.isArray(blocks) ? blocks : [])
  if (parsedBlocks.length === 0) {
    res.status(400).json({ error: 'At least one supported block is required' })
    return
  }

  const nextSurface = surface === 'simulation' ? 'simulation' : 'reading'
  const nextFollowUps = Array.isArray(followUps)
    ? followUps.filter((value): value is string => typeof value === 'string').slice(0, 4)
    : []

  // Validate anchor if provided
  const validatedAnchor = anchor && typeof anchor.excerpt === 'string' && anchor.excerpt.trim().length > 0
    ? {
        sectionId: typeof anchor.sectionId === 'string' ? anchor.sectionId : undefined,
        blockId: typeof anchor.blockId === 'string' ? anchor.blockId : undefined,
        excerpt: limitText(anchor.excerpt.trim(), 500),
        viewMode: typeof anchor.viewMode === 'string' ? anchor.viewMode : undefined,
      }
    : undefined

  const exploration = explorationStore.create({
    query: limitText(trimmedQuery, MAX_EXPLORE_QUERY_LENGTH),
    summary: limitText(trimmedSummary, 180),
    blocks: parsedBlocks,
    followUps: nextFollowUps,
    model: limitText(model, MAX_EXPLORATION_MODEL_LENGTH),
    cached: Boolean(cached),
    surface: nextSurface,
    anchor: validatedAnchor,
  })

  res.status(201).json(exploration)
})

app.get('/api/explorations/:id', (req, res) => {
  const exploration = explorationStore.getById(req.params.id)
  if (!exploration) {
    res.status(404).json({ error: 'Exploration not found' })
    return
  }
  res.json(exploration)
})

app.post('/api/explorations/:id/vote', (req, res) => {
  const delta = (req.body as { delta?: number }).delta
  if (delta !== 1 && delta !== -1) {
    res.status(400).json({ error: 'delta must be 1 or -1' })
    return
  }

  const updated = explorationStore.vote(req.params.id, delta)
  if (!updated) {
    res.status(404).json({ error: 'Exploration not found' })
    return
  }
  res.json(updated)
})

app.post('/api/explorations/:id/publish', (req, res) => {
  const { title, takeaway, author } = req.body as PublishExplorationRequest
  const trimmedTitle = title?.trim()
  const trimmedTakeaway = takeaway?.trim()
  const trimmedAuthor = author?.trim()

  if (!trimmedTitle || !trimmedTakeaway) {
    res.status(400).json({ error: 'title and takeaway are required' })
    return
  }
  if (trimmedTitle.length > MAX_PUBLISHED_TITLE_LENGTH) {
    res.status(400).json({ error: `title is too long. Keep it under ${MAX_PUBLISHED_TITLE_LENGTH} characters.` })
    return
  }
  if (trimmedTakeaway.length > MAX_PUBLISHED_TAKEAWAY_LENGTH) {
    res.status(400).json({ error: `takeaway is too long. Keep it under ${MAX_PUBLISHED_TAKEAWAY_LENGTH} characters.` })
    return
  }
  if (trimmedAuthor && trimmedAuthor.length > MAX_PUBLISHED_AUTHOR_LENGTH) {
    res.status(400).json({ error: `author is too long. Keep it under ${MAX_PUBLISHED_AUTHOR_LENGTH} characters.` })
    return
  }

  const updated = explorationStore.publish(req.params.id, {
    title: trimmedTitle,
    takeaway: trimmedTakeaway,
    author: trimmedAuthor,
  })
  if (!updated) {
    res.status(404).json({ error: 'Exploration not found' })
    return
  }

  res.json(updated)
})

app.post('/api/explorations/:id/replies', (req, res) => {
  const { author, body } = req.body as CreateExplorationReplyRequest
  const trimmedBody = body?.trim()
  const trimmedAuthor = author?.trim()

  if (!trimmedBody) {
    res.status(400).json({ error: 'Reply text is required.' })
    return
  }
  if (trimmedBody.length > MAX_REPLY_BODY_LENGTH) {
    res.status(400).json({ error: `Keep replies under ${MAX_REPLY_BODY_LENGTH} characters.` })
    return
  }
  if (trimmedAuthor && trimmedAuthor.length > MAX_REPLY_AUTHOR_LENGTH) {
    res.status(400).json({ error: `author is too long. Keep it under ${MAX_REPLY_AUTHOR_LENGTH} characters.` })
    return
  }

  const reply = explorationStore.addReply(req.params.id, {
    author: trimmedAuthor || 'Anonymous',
    body: trimmedBody,
  })
  if (!reply) {
    res.status(404).json({ error: 'Exploration not found' })
    return
  }

  res.status(201).json(reply)
})

app.post('/api/explorations/:id/replies/:replyId/vote', (req, res) => {
  const delta = (req.body as VoteExplorationReplyRequest).delta
  if (delta !== 1 && delta !== -1) {
    res.status(400).json({ error: 'delta must be 1 or -1' })
    return
  }

  const updated = explorationStore.voteReply(req.params.id, req.params.replyId, delta)
  if (!updated) {
    res.status(404).json({ error: 'Reply not found' })
    return
  }

  res.json(updated)
})

app.post('/api/explorations/:id/editorial', (req, res) => {
  const { verified, featured, editorNote } = req.body as EditorialExplorationRequest
  const trimmedEditorNote = editorNote?.trim()

  if (trimmedEditorNote && trimmedEditorNote.length > MAX_EDITOR_NOTE_LENGTH) {
    res.status(400).json({ error: `editorNote is too long. Keep it under ${MAX_EDITOR_NOTE_LENGTH} characters.` })
    return
  }

  const updated = explorationStore.applyEditorial(req.params.id, {
    verified: typeof verified === 'boolean' ? verified : undefined,
    featured: typeof featured === 'boolean' ? featured : undefined,
    editorNote: trimmedEditorNote,
  })
  if (!updated) {
    res.status(404).json({ error: 'Exploration not found' })
    return
  }

  res.json(updated)
})

// --- Agent Loop (Stage 5) routes ---

app.post('/api/agent-loop/sessions', agentLoopRateLimit, async (req, res) => {
  if (!agentLoopOrchestrator) {
    res.status(503).json({ error: 'Agent loop requires an Anthropic API key.' })
    return
  }

  const { question, maxSteps } = req.body as { question?: string; maxSteps?: number }
  const trimmed = question?.trim() ?? ''
  if (trimmed.length < AGENT_LOOP_DEFAULTS.minQuestionLength) {
    res.status(400).json({
      error: `Research question must be at least ${AGENT_LOOP_DEFAULTS.minQuestionLength} characters.`,
    })
    return
  }
  if (trimmed.length > AGENT_LOOP_DEFAULTS.maxQuestionLength) {
    res.status(400).json({
      error: `Research question must be under ${AGENT_LOOP_DEFAULTS.maxQuestionLength} characters.`,
    })
    return
  }

  try {
    agentLoopStore.abandonStale()
    const session = agentLoopStore.createSession(trimmed, maxSteps)
    const updated = agentLoopStore.addStep(session.id, trimmed)
    const firstStep = updated.steps[0]
    if (firstStep) {
      void agentLoopOrchestrator.analyzeAndPropose(
        session.id,
        firstStep.id,
        '',
      )
    }
    res.status(201).json({ session: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create agent session.'
    res.status(429).json({ error: message })
  }
})

app.get('/api/agent-loop/sessions', (_req, res) => {
  res.json({ sessions: agentLoopStore.listSessions() })
})

app.get('/api/agent-loop/sessions/:sessionId', (req, res) => {
  const session = agentLoopStore.getSession(req.params.sessionId)
  if (!session) {
    res.status(404).json({ error: 'Agent session not found.' })
    return
  }
  res.json({ session })
})

app.post('/api/agent-loop/sessions/:sessionId/steps/:stepId/approve', agentLoopRateLimit, (req, res) => {
  if (!agentLoopOrchestrator) {
    res.status(503).json({ error: 'Agent loop requires an Anthropic API key.' })
    return
  }

  const session = agentLoopStore.getSession(req.params.sessionId)
  if (!session) {
    res.status(404).json({ error: 'Agent session not found.' })
    return
  }

  const step = session.steps.find((s) => s.id === req.params.stepId)
  if (!step) {
    res.status(404).json({ error: 'Agent step not found.' })
    return
  }
  if (step.phase !== 'awaiting_approval') {
    res.status(409).json({ error: `Step is in phase "${step.phase}", not awaiting approval.` })
    return
  }

  const { config } = req.body as { config?: Record<string, unknown> }
  const approvedConfig = config
    ? parseSimulationRequest(config)
    : step.proposedConfig

  if (!approvedConfig) {
    res.status(400).json({ error: 'No config available to approve.' })
    return
  }

  try {
    agentLoopOrchestrator.submitSimulation(
      req.params.sessionId,
      req.params.stepId,
      approvedConfig,
    )
    const updated = agentLoopStore.getSession(req.params.sessionId)
    res.json({ session: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulation submission failed.'
    res.status(500).json({ error: message })
  }
})

app.post('/api/agent-loop/sessions/:sessionId/steps/:stepId/reject', agentLoopRateLimit, async (req, res) => {
  if (!agentLoopOrchestrator) {
    res.status(503).json({ error: 'Agent loop requires an Anthropic API key.' })
    return
  }

  const session = agentLoopStore.getSession(req.params.sessionId)
  if (!session) {
    res.status(404).json({ error: 'Agent session not found.' })
    return
  }

  const step = session.steps.find((s) => s.id === req.params.stepId)
  if (!step) {
    res.status(404).json({ error: 'Agent step not found.' })
    return
  }

  const { feedback } = req.body as { feedback?: string }
  const trimmedFeedback = feedback?.trim()?.slice(0, AGENT_LOOP_DEFAULTS.maxFeedbackLength) ?? ''

  try {
    void agentLoopOrchestrator.reanalyzeWithFeedback(
      req.params.sessionId,
      req.params.stepId,
      trimmedFeedback,
    )
    const updated = agentLoopStore.getSession(req.params.sessionId)
    res.json({ session: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Re-analysis failed.'
    res.status(500).json({ error: message })
  }
})

app.post('/api/agent-loop/sessions/:sessionId/complete', (req, res) => {
  try {
    const updated = agentLoopStore.updateStatus(req.params.sessionId, 'completed')
    res.json({ session: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete session.'
    res.status(404).json({ error: message })
  }
})

// Periodic stale session cleanup
setInterval(() => {
  agentLoopStore.abandonStale()
}, 5 * 60 * 1000)

// --- Static file serving for production (Railway serves both API + SPA) ---

// Serve raw research data CSVs for the browser-side DuckDB SQL query interface
const DATA_DIR = path.resolve(REPO_ROOT, 'data')
if (existsSync(DATA_DIR)) {
  app.use('/data', express.static(DATA_DIR, {
    maxAge: '1h',
    immutable: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.csv')) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      }
    },
  }))
}

const DIST_DIR = path.join(__dirname, '..', 'dist')
if (existsSync(DASHBOARD_DIR)) {
  // Guard: detect unresolved Git LFS pointer stubs before express.static serves them.
  // LFS pointers are ~130-byte text files starting with "version https://git-lfs".
  app.use('/research-demo/simulations', async (req, res, next) => {
    if (!req.path.endsWith('.json')) return next()
    const filePath = path.resolve(DASHBOARD_DIR, 'simulations', req.path.replace(/^\//, ''))
    if (!filePath.startsWith(path.resolve(DASHBOARD_DIR))) return next()
    try {
      const handle = await fs.open(filePath, 'r')
      const buf = Buffer.alloc(40)
      await handle.read(buf, 0, 40, 0)
      await handle.close()
      if (buf.toString('utf8').startsWith('version https://git-lfs')) {
        res.status(502).json({
          error: 'Data file is an unresolved Git LFS pointer. Run `git lfs pull` during the Docker build.',
          path: req.path,
        })
        return
      }
    } catch {
      // File doesn't exist or can't be read — let express.static handle the 404
    }
    next()
  })

  app.use('/research-demo', express.static(DASHBOARD_DIR))
  app.get('/research-demo', (_req, res) => {
    res.sendFile(path.join(DASHBOARD_DIR, 'index.html'))
  })
}

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  // SPA fallback: serve index.html for any non-API route
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

const PORT = Number(process.env.PORT ?? 3201)

async function startExplorerApi(): Promise<void> {
  await loadPublishedReplayNotesStore()

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Explorer API listening on http://localhost:${PORT}`)
  })
}

void startExplorerApi().catch(error => {
  // eslint-disable-next-line no-console
  console.error('Failed to start Explorer API.', error)
  process.exit(1)
})
