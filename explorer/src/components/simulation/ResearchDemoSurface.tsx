import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ContributionComposer } from '../community/ContributionComposer'
import { BlockCanvas } from '../explore/BlockCanvas'
import type { TabId } from '../layout/TabNav'
import { PAPER_SECTIONS, type PaperSection } from '../../data/paper-sections'
import { createExploration, publishExploration } from '../../lib/api'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../../lib/theme'
import { listPublishedReplayNotes } from '../../lib/published-replay-notes-api'
import type { PublishedReplayCopilotResponse } from '../../lib/published-replay-api'
import { downloadBlobFile } from '../../lib/simulation-export'
import type { Block, SourceBlock } from '../../types/blocks'
import { formatNumber, paradigmLabel } from './simulation-constants'
import { PublishedReplayCompanionPanel } from './PublishedReplayCompanionPanel'
import {
  PublishedReplayMetricStrip,
  type PublishedReplayMetricStripCard,
} from './PublishedReplayMetricStrip'
import { PublishedReplayNotesPanel } from './PublishedReplayNotesPanel'
import {
  PublishedDatasetViewer,
  dispatchPublishedReplayAnchorSelection,
  type PublishedDatasetDataState,
  type PublishedDatasetPayload,
  type PublishedReplayAnchorSelectionDetail,
  type PublishedViewerFocusArea,
  type PublishedViewerSnapshot,
} from './PublishedDatasetViewer'
import { SimulationAnalyticsDesk } from './SimulationAnalyticsDesk'
import {
  analyticsCompareModeOptions,
  alignSlotByProgress,
  analyticsMetricSeriesForPayload,
  analyticsMetricOptionsForView,
  ANALYTICS_VIEW_OPTIONS,
  LIVENESS_LABEL,
  buildAnalyticsDashboardPresets,
  buildAnalyticsBlocks,
  buildAnalyticsExportBundle,
  buildAnalyticsExportCsv,
  buildAnalyticsMetricCards,
  clampSlotIndex,
  defaultAnalyticsQueryMetricForView,
  parseAnalyticsCompareMode,
  parseAnalyticsDeckView,
  parseAnalyticsQueryMetric,
  formatLivenessCount,
  formatLivenessCountWithUnit,
  type AnalyticsCompareMode,
  type AnalyticsDashboardPreset,
  type AnalyticsDeckView,
  type AnalyticsMetricCard,
  type AnalyticsQueryMetric,
  type PublishedAnalyticsPayload,
  totalSlotsFromPayload,
} from './simulation-analytics'

interface ResearchMetadata {
  readonly v?: number
  readonly cost?: number
  readonly delta?: number
  readonly cutoff?: number
  readonly gamma?: number
  readonly description?: string
}

interface ResearchDatasetEntry {
  readonly evaluation: string
  readonly paradigm: string
  readonly result: string
  readonly path: string
  readonly sourceRole?: string
  readonly metadata?: ResearchMetadata
}

interface ResearchCatalog {
  readonly introBlurb: string
  readonly defaultSelection: {
    readonly evaluation: string
    readonly paradigm: string
    readonly result: string
    readonly path: string
  } | null
  readonly datasets: readonly ResearchDatasetEntry[]
}

declare global {
  interface Window {
    RESEARCH_CATALOG?: ResearchCatalog
  }
}

interface ResearchDemoSurfaceProps {
  readonly catalogScriptUrl: string
  readonly viewerBaseUrl: string
  readonly onOpenCommunityExploration?: (explorationId: string) => void
  readonly onTabChange?: (tab: TabId) => void
}

type WorkspaceTheme = 'auto' | 'light' | 'dark'
type WorkspaceStep = 1 | 10 | 50
type PaperLens = 'evidence' | 'theory' | 'methods'
type AudienceMode = 'reader' | 'reviewer' | 'researcher'

interface ViewerLaunch {
  readonly dataset: ResearchDatasetEntry
  readonly settings: {
    readonly theme: WorkspaceTheme
    readonly step: WorkspaceStep
    readonly autoplay: boolean
  }
}

interface InitialWorkspaceState {
  readonly selectedEvaluation?: string
  readonly selectedParadigm?: string
  readonly selectedResult?: string
  readonly datasetPath?: string
  readonly theme?: WorkspaceTheme
  readonly step?: WorkspaceStep
  readonly autoplay?: boolean
  readonly paperLens?: PaperLens
  readonly comparePath?: string
  readonly audienceMode?: AudienceMode
  readonly replayQuestion?: string
  readonly paperSectionId?: string
  readonly focusSlot?: number
  readonly compareFocusSlot?: number
  readonly analyticsView?: AnalyticsDeckView
  readonly analyticsMetric?: AnalyticsQueryMetric
  readonly analyticsCompareMode?: AnalyticsCompareMode
}

interface ReplaySnapshotMetricCard extends PublishedReplayMetricStripCard {
  readonly focusArea: PublishedViewerFocusArea
  readonly anchor: PublishedReplayAnchorSelectionDetail
  readonly metric: AnalyticsQueryMetric
  readonly analyticsView: AnalyticsDeckView
}

interface PromptLauncher {
  readonly label: string
  readonly prompt: string
}

interface AnalyticsPromptLauncher {
  readonly label: string
  readonly prompt: string
  readonly detail: string
}

function readResearchCatalog(): ResearchCatalog | null {
  return typeof window !== 'undefined' ? window.RESEARCH_CATALOG ?? null : null
}

function uniqueOrdered(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function formatEth(value: number | undefined): string {
  if (typeof value !== 'number') return 'N/A'
  return `${formatNumber(value, 4)} ETH`
}

function formatMilliseconds(value: number | undefined): string {
  if (typeof value !== 'number') return 'N/A'
  return `${formatNumber(value, 0)} ms`
}

function formatPercentValue(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)}%`
}

function formatLivenessValue(value: number | null | undefined): string {
  return formatLivenessCount(value)
}

function formatOptionalMilliseconds(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)} ms`
}

function formatCountValue(value: number): string {
  return Math.round(value).toLocaleString()
}

function formatIndexValue(value: number): string {
  return formatNumber(value, 3)
}

function formatPercentSeriesValue(value: number): string {
  return `${formatNumber(value, 1)}%`
}

function formatLivenessSeriesValue(value: number): string {
  return formatLivenessCount(value)
}

function formatMillisecondsSeriesValue(value: number): string {
  return `${formatNumber(value, 1)} ms`
}

function formatEthSeriesValue(value: number): string {
  return `${formatNumber(value, 4)} ETH`
}

function parseTheme(value: string | null): WorkspaceTheme | undefined {
  return value === 'auto' || value === 'light' || value === 'dark' ? value : undefined
}

function parseStep(value: string | null): WorkspaceStep | undefined {
  return value === '1' ? 1 : value === '10' ? 10 : value === '50' ? 50 : undefined
}

function parsePaperLens(value: string | null): PaperLens | undefined {
  return value === 'evidence' || value === 'theory' || value === 'methods' ? value : undefined
}

function parseAudienceMode(value: string | null): AudienceMode | undefined {
  return value === 'reader' || value === 'reviewer' || value === 'researcher' ? value : undefined
}

function parseBooleanFlag(value: string | null): boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function parseSlotIndex(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function readInitialWorkspaceState(): InitialWorkspaceState {
  if (typeof window === 'undefined') return {}

  const params = new URLSearchParams(window.location.search)
  return {
    selectedEvaluation: params.get('evaluation') ?? undefined,
    selectedParadigm: params.get('paradigm') ?? undefined,
    selectedResult: params.get('result') ?? undefined,
    datasetPath: params.get('dataset') ?? undefined,
    theme: parseTheme(params.get('theme')),
    step: parseStep(params.get('step')),
    autoplay: parseBooleanFlag(params.get('autoplay')),
    paperLens: parsePaperLens(params.get('lens')),
    comparePath: params.get('compare') ?? undefined,
    audienceMode: parseAudienceMode(params.get('audience')),
    replayQuestion: params.get('replayQuestion') ?? undefined,
    paperSectionId: params.get('paperSection') ?? undefined,
    focusSlot: parseSlotIndex(params.get('slot')),
    compareFocusSlot: parseSlotIndex(params.get('compareSlot')),
    analyticsView: parseAnalyticsDeckView(params.get('analytics')),
    analyticsMetric: parseAnalyticsQueryMetric(params.get('analyticsMetric')),
    analyticsCompareMode: parseAnalyticsCompareMode(params.get('analyticsCompareMode')),
  }
}

async function fetchPublishedAnalyticsPayload(
  viewerBaseUrl: string,
  datasetPath: string,
): Promise<PublishedAnalyticsPayload> {
  const normalizedBase = viewerBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${normalizedBase}/${datasetPath}`, { cache: 'default' })
  if (!response.ok) {
    throw new Error(`Failed to load analytics payload for ${datasetPath}`)
  }

  const text = await response.text()
  if (text.startsWith('version https://git-lfs')) {
    throw new Error(
      `${datasetPath} is a Git LFS pointer, not resolved analytics data. The deployment needs git-lfs installed to fetch the actual simulation files.`,
    )
  }

  return JSON.parse(text) as PublishedAnalyticsPayload
}

function themeLabel(theme: WorkspaceTheme): string {
  if (theme === 'auto') return 'Auto'
  if (theme === 'dark') return 'Dark'
  return 'Light'
}

function describeViewerSnapshot(
  snapshot: PublishedViewerSnapshot | null,
  label: string,
): string | null {
  if (!snapshot) return null

  const dominantRegion = snapshot.dominantRegionCity ?? snapshot.dominantRegionId ?? 'no dominant region'
  const gini = snapshot.currentGini != null ? formatNumber(snapshot.currentGini, 3) : 'N/A'
  const liveness = snapshot.currentLiveness != null ? formatLivenessCountWithUnit(snapshot.currentLiveness) : 'N/A'
  const mev = snapshot.currentMev != null ? `${formatNumber(snapshot.currentMev, 4)} ETH` : 'N/A'
  const proposalTime = snapshot.currentProposalTime != null ? `${formatNumber(snapshot.currentProposalTime, 1)} ms` : 'N/A'

  return `${label} is at slot ${snapshot.slotNumber.toLocaleString()} of ${snapshot.totalSlots.toLocaleString()}, with ${snapshot.activeRegions.toLocaleString()} active regions. Dominant region: ${dominantRegion}. Gini ${gini}, ${LIVENESS_LABEL.toLowerCase()} ${liveness}, MEV ${mev}, proposal time ${proposalTime}.`
}

function datasetPaperSectionId(dataset: ResearchDatasetEntry | null): string | null {
  if (!dataset) return null

  const evaluation = dataset.evaluation.toLowerCase()
  const pathLabel = dataset.path.toLowerCase()

  if (evaluation.startsWith('baseline')) return 'baseline-results'
  if (evaluation.includes('source-placement')) return 'se1-source-placement'
  if (evaluation.includes('validator-distribution')) return 'se2-distribution'
  if (evaluation.includes('joint')) return 'se3-joint'
  if (evaluation.includes('attestation') || evaluation.includes('threshold') || pathLabel.includes('gamma')) return 'se4a-attestation'
  if (evaluation.includes('slot') || evaluation.includes('shorter') || pathLabel.includes('slot_time') || pathLabel.includes('slot-time')) return 'se4b-slots'
  return null
}

function inferPaperSectionId(dataset: ResearchDatasetEntry | null, lens: PaperLens): string {
  const datasetSectionId = datasetPaperSectionId(dataset)

  if (lens === 'methods') return 'simulation-design'
  if (lens === 'theory') {
    if (datasetSectionId && datasetSectionId !== 'baseline-results') return datasetSectionId
    return 'system-model'
  }
  return datasetSectionId ?? 'baseline-results'
}

function recommendedPaperSectionIds(
  dataset: ResearchDatasetEntry | null,
  lens: PaperLens,
): string[] {
  const ids = new Set<string>()
  const datasetSectionId = datasetPaperSectionId(dataset)

  ids.add(inferPaperSectionId(dataset, lens))
  if (datasetSectionId) ids.add(datasetSectionId)

  if (lens === 'theory') {
    ids.add('system-model')
    ids.add('discussion')
  } else if (lens === 'methods') {
    ids.add('simulation-design')
    ids.add('limitations')
  } else {
    ids.add('discussion')
    ids.add('limitations')
  }

  return [...ids].filter(id => PAPER_SECTIONS.some(section => section.id === id)).slice(0, 4)
}

function summarizePaperBlock(block: Block): string {
  switch (block.type) {
    case 'insight':
      return `${block.title ? `${block.title}: ` : ''}${block.text}`
    case 'stat':
      return `${block.label}: ${block.value}${block.sublabel ? ` (${block.sublabel})` : ''}`
    case 'comparison':
      return `${block.title}: ${block.verdict ?? 'paired comparison available in the paper.'}`
    case 'table':
      return `${block.title}: ${block.rows.length} structured rows in the canonical section.`
    case 'caveat':
      return `Caveat: ${block.text}`
    case 'source':
      return `Sources: ${block.refs.map(ref => ref.label).join(', ')}`
    case 'chart':
      return `${block.title}: ${block.data.length} plotted points in the paper guide.`
    case 'map':
      return `${block.title}: ${block.regions.length} mapped regions in the paper guide.`
    case 'timeseries':
      return `${block.title}: ${block.series.length} time-series traces in the paper guide.`
    default:
      return 'Canonical paper evidence.'
  }
}

function buildPaperSectionContext(section: PaperSection | null): string {
  if (!section) return ''

  return [
    `- sectionNumber: ${section.number}`,
    `- sectionTitle: ${section.title}`,
    `- sectionDescription: ${section.description}`,
    '- canonicalSectionReadout:',
    ...section.blocks.slice(0, 4).map(block => `  - ${summarizePaperBlock(block)}`),
  ].join('\n')
}

export function ResearchDemoSurface({
  catalogScriptUrl,
  viewerBaseUrl,
  onOpenCommunityExploration,
  onTabChange,
}: ResearchDemoSurfaceProps) {
  const initialWorkspaceState = useMemo(() => readInitialWorkspaceState(), [])
  const queryClient = useQueryClient()
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(() => readResearchCatalog())
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selectedEvaluation, setSelectedEvaluation] = useState(initialWorkspaceState.selectedEvaluation ?? '')
  const [selectedParadigm, setSelectedParadigm] = useState(initialWorkspaceState.selectedParadigm ?? '')
  const [selectedResult, setSelectedResult] = useState(initialWorkspaceState.selectedResult ?? '')
  const [theme, setTheme] = useState<WorkspaceTheme>(initialWorkspaceState.theme ?? 'auto')
  const [step, setStep] = useState<WorkspaceStep>(initialWorkspaceState.step ?? 1)
  const [autoplay, setAutoplay] = useState(initialWorkspaceState.autoplay ?? true)
  const [showConfig, setShowConfig] = useState(false)
  const [paperLens, setPaperLens] = useState<PaperLens>(initialWorkspaceState.paperLens ?? 'evidence')
  const [assistantDraft, setAssistantDraft] = useState('')
  const [comparePath, setComparePath] = useState(initialWorkspaceState.comparePath ?? '')
  const [audienceMode, setAudienceMode] = useState<AudienceMode>(initialWorkspaceState.audienceMode ?? 'reader')
  const [analyticsView, setAnalyticsView] = useState<AnalyticsDeckView>(initialWorkspaceState.analyticsView ?? 'concentration')
  const [analyticsMetric, setAnalyticsMetric] = useState<AnalyticsQueryMetric>(
    initialWorkspaceState.analyticsMetric ?? defaultAnalyticsQueryMetricForView(initialWorkspaceState.analyticsView ?? 'concentration'),
  )
  const [analyticsCompareMode, setAnalyticsCompareMode] = useState<AnalyticsCompareMode>(
    initialWorkspaceState.analyticsCompareMode ?? 'absolute',
  )
  const [paperSectionId, setPaperSectionId] = useState(initialWorkspaceState.paperSectionId ?? '')
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const viewerRef = useRef<HTMLElement | null>(null)
  const inquiryRef = useRef<HTMLDivElement | null>(null)
  const sharedReplayQuestionRef = useRef(initialWorkspaceState.replayQuestion?.trim() ?? '')
  const sharedPaperSectionRef = useRef(initialWorkspaceState.paperSectionId ?? '')
  const [pendingAutoReplayQuestion, setPendingAutoReplayQuestion] = useState(initialWorkspaceState.replayQuestion?.trim() ?? '')
  const [primaryReplaySlotIndex, setPrimaryReplaySlotIndex] = useState(initialWorkspaceState.focusSlot ?? 0)
  const [comparisonReplaySlotIndex, setComparisonReplaySlotIndex] = useState(initialWorkspaceState.compareFocusSlot ?? 0)
  const [viewerSnapshot, setViewerSnapshot] = useState<PublishedViewerSnapshot | null>(null)
  const [comparisonViewerSnapshot, setComparisonViewerSnapshot] = useState<PublishedViewerSnapshot | null>(null)
  const [activeReplayMetricCardId, setActiveReplayMetricCardId] = useState<string | null>(null)
  const [viewerSpotlightArea, setViewerSpotlightArea] = useState<PublishedViewerFocusArea | null>(null)
  const [lastReplayAnswer, setLastReplayAnswer] = useState<{
    question: string
    response: PublishedReplayCopilotResponse
    answeredContext: string
  } | null>(null)
  const [publishedReplayContextKey, setPublishedReplayContextKey] = useState<string | null>(null)
  const [publishedReplayExplorationId, setPublishedReplayExplorationId] = useState<string | null>(null)

  useEffect(() => {
    const existing = readResearchCatalog()
    if (existing) {
      setCatalog(existing)
      setCatalogError(null)
      return
    }

    const scriptId = 'research-demo-catalog-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleLoad = () => {
      const loadedCatalog = readResearchCatalog()
      if (loadedCatalog) {
        setCatalog(loadedCatalog)
        setCatalogError(null)
        return
      }
      setCatalogError('The frozen research catalog loaded, but no datasets were exposed.')
    }

    const handleError = () => {
      setCatalogError('The frozen research catalog could not be loaded.')
    }

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = catalogScriptUrl
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)

    return () => {
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
    }
  }, [catalogScriptUrl])

  useEffect(() => {
    if (!catalog) return

    const fallback = (
      initialWorkspaceState.datasetPath
        ? catalog.datasets.find(entry => entry.path === initialWorkspaceState.datasetPath) ?? null
        : null
    ) ?? catalog.defaultSelection ?? catalog.datasets[0] ?? null
    if (!fallback) return

    setSelectedEvaluation(previous => previous || fallback.evaluation)
    setSelectedParadigm(previous => previous || fallback.paradigm)
    setSelectedResult(previous => previous || fallback.result)
  }, [catalog, initialWorkspaceState])

  const evaluationOptions = useMemo(
    () => uniqueOrdered((catalog?.datasets ?? []).map(entry => entry.evaluation)),
    [catalog],
  )

  const paradigmOptions = useMemo(
    () => uniqueOrdered(
      (catalog?.datasets ?? [])
        .filter(entry => entry.evaluation === selectedEvaluation)
        .map(entry => entry.paradigm),
    ),
    [catalog, selectedEvaluation],
  )

  const resultOptions = useMemo(
    () => uniqueOrdered(
      (catalog?.datasets ?? [])
        .filter(entry => entry.evaluation === selectedEvaluation && entry.paradigm === selectedParadigm)
        .map(entry => entry.result),
    ),
    [catalog, selectedEvaluation, selectedParadigm],
  )

  useEffect(() => {
    if (!catalog || evaluationOptions.length === 0) return

    const defaultSelection = catalog.defaultSelection
    const nextEvaluation = evaluationOptions.includes(selectedEvaluation)
      ? selectedEvaluation
      : defaultSelection?.evaluation && evaluationOptions.includes(defaultSelection.evaluation)
        ? defaultSelection.evaluation
        : evaluationOptions[0]!

    if (nextEvaluation !== selectedEvaluation) {
      setSelectedEvaluation(nextEvaluation)
      return
    }

    const nextParadigmOptions = uniqueOrdered(
      catalog.datasets
        .filter(entry => entry.evaluation === nextEvaluation)
        .map(entry => entry.paradigm),
    )
    if (nextParadigmOptions.length === 0) return

    const nextParadigm = nextParadigmOptions.includes(selectedParadigm)
      ? selectedParadigm
      : defaultSelection?.evaluation === nextEvaluation && defaultSelection.paradigm && nextParadigmOptions.includes(defaultSelection.paradigm)
        ? defaultSelection.paradigm
        : nextParadigmOptions[0]!

    if (nextParadigm !== selectedParadigm) {
      setSelectedParadigm(nextParadigm)
      return
    }

    const nextResultOptions = uniqueOrdered(
      catalog.datasets
        .filter(entry => entry.evaluation === nextEvaluation && entry.paradigm === nextParadigm)
        .map(entry => entry.result),
    )
    if (nextResultOptions.length === 0) return

    const nextResult = nextResultOptions.includes(selectedResult)
      ? selectedResult
      : defaultSelection?.evaluation === nextEvaluation
        && defaultSelection.paradigm === nextParadigm
        && defaultSelection.result
        && nextResultOptions.includes(defaultSelection.result)
          ? defaultSelection.result
          : nextResultOptions[0]!

    if (nextResult !== selectedResult) {
      setSelectedResult(nextResult)
    }
  }, [catalog, evaluationOptions, selectedEvaluation, selectedParadigm, selectedResult])

  const selectedDataset = useMemo(
    () => (catalog?.datasets ?? []).find(entry =>
      entry.evaluation === selectedEvaluation
      && entry.paradigm === selectedParadigm
      && entry.result === selectedResult,
    ) ?? null,
    [catalog, selectedEvaluation, selectedParadigm, selectedResult],
  )
  const suggestedPaperSections = useMemo(
    () => recommendedPaperSectionIds(selectedDataset, paperLens)
      .map(sectionId => PAPER_SECTIONS.find(section => section.id === sectionId) ?? null)
      .filter((section): section is PaperSection => Boolean(section)),
    [paperLens, selectedDataset],
  )
  const selectedPaperSection = useMemo(
    () => PAPER_SECTIONS.find(section => section.id === paperSectionId)
      ?? suggestedPaperSections[0]
      ?? PAPER_SECTIONS[0]
      ?? null,
    [paperSectionId, suggestedPaperSections],
  )
  const paperSectionContext = useMemo(
    () => buildPaperSectionContext(selectedPaperSection),
    [selectedPaperSection],
  )
  const selectedPaperSectionBlocks = useMemo(
    () => selectedPaperSection?.blocks.slice(0, 2) ?? [],
    [selectedPaperSection],
  )
  const paperSectionUrl = useMemo(() => {
    if (typeof window === 'undefined' || !selectedPaperSection) return ''

    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'paper')
    url.searchParams.delete('q')
    url.searchParams.delete('eid')
    url.hash = selectedPaperSection.id
    return url.toString()
  }, [selectedPaperSection])

  const activeViewer = useMemo<ViewerLaunch | null>(() => {
    if (!selectedDataset) return null
    return {
      dataset: selectedDataset,
      settings: {
        theme,
        step,
        autoplay,
      },
    }
  }, [autoplay, selectedDataset, step, theme])

  const viewerUrl = useMemo(() => {
    if (!selectedDataset) return null
    const params = new URLSearchParams({
      dataset: selectedDataset.path,
      theme,
      step: String(step),
      autoplay: String(autoplay),
    })
    return `${viewerBaseUrl}/viewer.html?${params.toString()}`
  }, [autoplay, selectedDataset, step, theme, viewerBaseUrl])

  const datasetUrl = selectedDataset ? `${viewerBaseUrl}/${selectedDataset.path}` : null
  const sourceUrl = selectedDataset
    ? `https://github.com/syang-ng/geographical-decentralization-simulation/blob/main/dashboard/${selectedDataset.path}`
    : null
  const selectedMetadata = selectedDataset?.metadata ?? null
  const selectionConfig = useMemo(() => {
    if (!selectedDataset) return null

    return JSON.stringify({
      evaluation: selectedDataset.evaluation,
      paradigm: selectedDataset.paradigm,
      result: selectedDataset.result,
      dataset: selectedDataset.path,
      viewer: {
        theme,
        step,
        autoplay,
        paperLens,
        audienceMode,
        analyticsView,
        analyticsMetric,
        analyticsCompareMode,
        comparePath: comparePath || null,
        paperSectionId: selectedPaperSection?.id ?? null,
        replayQuestion: assistantDraft || null,
        focusSlot: primaryReplaySlotIndex,
        compareFocusSlot: comparePath ? comparisonReplaySlotIndex : null,
      },
      metadata: selectedDataset.metadata ?? {},
    }, null, 2)
  }, [
    analyticsCompareMode,
    analyticsMetric,
    analyticsView,
    assistantDraft,
    audienceMode,
    autoplay,
    comparePath,
    comparisonReplaySlotIndex,
    paperLens,
    primaryReplaySlotIndex,
    selectedDataset,
    selectedPaperSection?.id,
    step,
    theme,
    comparePath,
  ])

  const paperLenses = useMemo(() => ([
    {
      id: 'evidence' as const,
      label: 'Evidence',
      eyebrow: 'What the replay shows',
      title: selectedDataset
        ? `${selectedDataset.evaluation} under ${paradigmLabel(selectedDataset.paradigm)} block building`
        : 'Published replay evidence',
      body: selectedDataset
        ? `This surface treats ${selectedDataset.result} as the authoritative published output and keeps it visible while the reader moves through the paper.`
        : 'Select a dataset to reveal the published evidence layer.',
      points: [
        `Use the replay to inspect concentration, topology, latency, and ${LIVENESS_LABEL.toLowerCase()} over slot progression.`,
        'Keep the evidence in view while switching scenario, mode, and playback posture.',
        'The page prioritizes interpretation before configuration.',
      ],
    },
    {
      id: 'theory' as const,
      label: 'Theory',
      eyebrow: 'Why the mechanism should move this way',
      title: 'Attach formal intuition to the same scenario',
      body: `The next theory section can bind directly to this scenario: v=${selectedMetadata?.v?.toLocaleString() ?? 'N/A'}, cost=${formatEth(selectedMetadata?.cost)}, delta=${formatMilliseconds(selectedMetadata?.delta)}, cutoff=${formatMilliseconds(selectedMetadata?.cutoff)}, gamma=${typeof selectedMetadata?.gamma === 'number' ? formatNumber(selectedMetadata.gamma, 4) : 'N/A'}.`,
      points: [
        'Explain which frictions or incentives produce the observed slot trajectory.',
        'Translate paper notation into operational intuition against the live replay.',
        'Tie assumptions to the metrics the reader is already watching.',
      ],
    },
    {
      id: 'methods' as const,
      label: 'Methods',
      eyebrow: 'How to read this carefully',
      title: 'Published replay, not full recomputation',
      body: selectedDataset
        ? `${selectedDataset.path} is a checked-in published payload. The large simulation engine remains separate because full-scale runs can be materially slower.`
        : 'This page operates on checked-in published results rather than recomputing the full experiment.',
      points: [
        'Switching selectors changes the frozen dataset path, not the full simulation state space.',
        'Standalone view, source links, and config export stay aligned to the same published contract.',
        'This split keeps the paper accessible while preserving a path toward deeper simulation controls.',
      ],
    },
  ]), [selectedDataset, selectedMetadata])

  const assistantPrompts = useMemo(() => {
    if (!selectedDataset) return []

    return [
      {
        label: 'Explain the replay',
        prompt: `Summarize what the ${selectedDataset.evaluation} / ${paradigmLabel(selectedDataset.paradigm)} published replay is showing and which charts I should read first.`,
      },
      {
        label: 'Trace slot changes',
        prompt: `Walk me through the major slot-level changes in ${selectedDataset.path}, focusing on decentralization, latency, and ${LIVENESS_LABEL.toLowerCase()}.`,
      },
      {
        label: 'Interpret tradeoffs',
        prompt: `Interpret the tradeoffs in this result using v=${selectedMetadata?.v?.toLocaleString() ?? 'N/A'}, cost=${formatEth(selectedMetadata?.cost)}, delta=${formatMilliseconds(selectedMetadata?.delta)}, cutoff=${formatMilliseconds(selectedMetadata?.cutoff)}, and gamma=${typeof selectedMetadata?.gamma === 'number' ? formatNumber(selectedMetadata.gamma, 4) : 'N/A'}.`,
      },
      {
        label: selectedPaperSection ? `Probe ${selectedPaperSection.number}` : 'Draft theory notes',
        prompt: selectedPaperSection
          ? `Use ${selectedPaperSection.number} ${selectedPaperSection.title} to explain the current replay posture, including what the replay supports, where it complicates the paper framing, and which assumptions matter most.`
          : `If the paper adds a new theory section for ${selectedDataset.result}, which mechanisms and assumptions should it use to explain the trajectory in this replay?`,
      },
    ]
  }, [selectedDataset, selectedMetadata, selectedPaperSection])

  const spotlightDatasets = useMemo(() => {
    const ordered = selectedDataset
      ? [selectedDataset, ...(catalog?.datasets ?? [])]
      : [...(catalog?.datasets ?? [])]
    const seen = new Set<string>()
    const highlights: ResearchDatasetEntry[] = []

    for (const entry of ordered) {
      const key = `${entry.evaluation}|${entry.paradigm}|${entry.result}`
      if (seen.has(key)) continue
      seen.add(key)
      highlights.push(entry)
      if (highlights.length >= 4) break
    }

    return highlights
  }, [catalog, selectedDataset])

  const comparisonCandidates = useMemo(
    () => (catalog?.datasets ?? []).filter(entry => entry.path !== selectedDataset?.path),
    [catalog, selectedDataset?.path],
  )

  const comparisonDataset = useMemo(
    () => comparisonCandidates.find(entry => entry.path === comparePath) ?? comparisonCandidates[0] ?? null,
    [comparePath, comparisonCandidates],
  )
  const comparisonDatasetUrl = comparisonDataset ? `${viewerBaseUrl}/${comparisonDataset.path}` : null
  const comparisonSourceUrl = comparisonDataset
    ? `https://github.com/syang-ng/geographical-decentralization-simulation/blob/main/dashboard/${comparisonDataset.path}`
    : null

  const paperSectionPromptStarters = useMemo(() => {
    if (!selectedDataset || !selectedPaperSection) return []

    const prompts = [
      `What in the active replay most directly supports or challenges ${selectedPaperSection.number} ${selectedPaperSection.title}?`,
      viewerSnapshot
        ? `Use slot ${viewerSnapshot.slotNumber.toLocaleString()} to explain how ${selectedPaperSection.number} ${selectedPaperSection.title} should be read.`
        : `Turn ${selectedPaperSection.number} ${selectedPaperSection.title} into concrete expectations for this published replay.`,
      comparisonDataset
        ? `Using ${selectedPaperSection.number} ${selectedPaperSection.title}, what changes materially between the active replay and ${paradigmLabel(comparisonDataset.paradigm)}?`
        : null,
      paperLens === 'methods'
        ? `Which assumptions in ${selectedPaperSection.number} ${selectedPaperSection.title} matter most for interpreting this published replay?`
        : null,
    ].filter((value): value is string => Boolean(value))

    return Array.from(new Set(prompts)).slice(0, 4)
  }, [comparisonDataset, paperLens, selectedDataset, selectedPaperSection, viewerSnapshot])

  const promptLaunchers = useMemo<PromptLauncher[]>(() => {
    const nextLaunchers: PromptLauncher[] = assistantPrompts.map(prompt => ({
      label: prompt.label,
      prompt: prompt.prompt,
    }))

    if (selectedPaperSection && paperSectionPromptStarters[0]) {
      nextLaunchers.unshift({
        label: `Probe ${selectedPaperSection.number}`,
        prompt: paperSectionPromptStarters[0],
      })
    }

    const seen = new Set<string>()
    return nextLaunchers.filter(entry => {
      const normalizedPrompt = entry.prompt.trim()
      if (!normalizedPrompt || seen.has(normalizedPrompt)) {
        return false
      }
      seen.add(normalizedPrompt)
      return true
    }).slice(0, 4)
  }, [assistantPrompts, paperSectionPromptStarters, selectedPaperSection])

  const comparisonMetrics = useMemo(() => ([
    {
      label: 'Validators',
      current: selectedMetadata?.v,
      compare: comparisonDataset?.metadata?.v,
      format: (value?: number) => (typeof value === 'number' ? value.toLocaleString() : 'N/A'),
    },
    {
      label: 'Migration cost',
      current: selectedMetadata?.cost,
      compare: comparisonDataset?.metadata?.cost,
      format: (value?: number) => formatEth(value),
    },
    {
      label: 'Delta',
      current: selectedMetadata?.delta,
      compare: comparisonDataset?.metadata?.delta,
      format: (value?: number) => formatMilliseconds(value),
    },
    {
      label: 'Gamma',
      current: selectedMetadata?.gamma,
      compare: comparisonDataset?.metadata?.gamma,
      format: (value?: number) => (typeof value === 'number' ? formatNumber(value, 4) : 'N/A'),
    },
  ]), [comparisonDataset, selectedMetadata])

  const comparisonNarrative = useMemo(() => {
    if (!selectedDataset || !comparisonDataset) {
      return 'Choose a second published scenario to position the active replay against another result contract.'
    }

    const statements: string[] = []

    if (typeof selectedMetadata?.cost === 'number' && typeof comparisonDataset.metadata?.cost === 'number') {
      statements.push(
        selectedMetadata.cost > comparisonDataset.metadata.cost
          ? 'This scenario carries a higher migration cost.'
          : selectedMetadata.cost < comparisonDataset.metadata.cost
            ? 'This scenario carries a lower migration cost.'
            : 'Both scenarios carry the same migration cost.',
      )
    }

    if (typeof selectedMetadata?.delta === 'number' && typeof comparisonDataset.metadata?.delta === 'number') {
      statements.push(
        selectedMetadata.delta > comparisonDataset.metadata.delta
          ? 'It also works against a slower delta assumption.'
          : selectedMetadata.delta < comparisonDataset.metadata.delta
            ? 'It operates with a tighter delta assumption.'
            : 'Their delta assumptions match.',
      )
    }

    if (typeof selectedMetadata?.gamma === 'number' && typeof comparisonDataset.metadata?.gamma === 'number') {
      statements.push(
        selectedMetadata.gamma > comparisonDataset.metadata.gamma
          ? 'Gamma is higher here, which may help explain the replay shape.'
          : selectedMetadata.gamma < comparisonDataset.metadata.gamma
            ? 'Gamma is lower here, giving the comparison a different theoretical posture.'
            : 'Gamma is held constant across the comparison.',
      )
    }

    const replayComparison = viewerSnapshot && comparisonViewerSnapshot
      ? ` The active replay is currently at slot ${viewerSnapshot.slotNumber.toLocaleString()} with ${viewerSnapshot.activeRegions.toLocaleString()} active regions, while the comparison replay is at slot ${comparisonViewerSnapshot.slotNumber.toLocaleString()} with ${comparisonViewerSnapshot.activeRegions.toLocaleString()} active regions.`
      : ''

    return statements.length > 0
      ? `${comparisonDataset.evaluation} / ${paradigmLabel(comparisonDataset.paradigm)} serves as a foil. ${statements.join(' ')}${replayComparison}`
      : `Compare ${selectedDataset.result} against ${comparisonDataset.result} with the map, timeline, and current paper lens.${replayComparison}`
  }, [comparisonDataset, comparisonViewerSnapshot, selectedDataset, selectedMetadata, viewerSnapshot])
  const comparisonHighlightCards = useMemo(() => {
    if (!comparisonDataset) return []

    if (viewerSnapshot && comparisonViewerSnapshot) {
      return [
        {
          label: 'Active regions',
          current: viewerSnapshot.activeRegions.toLocaleString(),
          compare: comparisonViewerSnapshot.activeRegions.toLocaleString(),
          tone: viewerSnapshot.activeRegions > comparisonViewerSnapshot.activeRegions ? 'Higher spread' : viewerSnapshot.activeRegions < comparisonViewerSnapshot.activeRegions ? 'Tighter spread' : 'Matched spread',
        },
        {
          label: 'Gini',
          current: viewerSnapshot.currentGini != null ? formatIndexValue(viewerSnapshot.currentGini) : 'N/A',
          compare: comparisonViewerSnapshot.currentGini != null ? formatIndexValue(comparisonViewerSnapshot.currentGini) : 'N/A',
          tone: viewerSnapshot.currentGini != null && comparisonViewerSnapshot.currentGini != null
            ? viewerSnapshot.currentGini > comparisonViewerSnapshot.currentGini
              ? 'More concentrated'
              : viewerSnapshot.currentGini < comparisonViewerSnapshot.currentGini
                ? 'Less concentrated'
                : 'Same concentration'
            : 'Awaiting exact readout',
        },
        {
          label: 'Proposal time',
          current: viewerSnapshot.currentProposalTime != null ? formatMillisecondsSeriesValue(viewerSnapshot.currentProposalTime) : 'N/A',
          compare: comparisonViewerSnapshot.currentProposalTime != null ? formatMillisecondsSeriesValue(comparisonViewerSnapshot.currentProposalTime) : 'N/A',
          tone: viewerSnapshot.currentProposalTime != null && comparisonViewerSnapshot.currentProposalTime != null
            ? viewerSnapshot.currentProposalTime > comparisonViewerSnapshot.currentProposalTime
              ? 'Slower timing'
              : viewerSnapshot.currentProposalTime < comparisonViewerSnapshot.currentProposalTime
                ? 'Faster timing'
                : 'Timing aligned'
            : 'Awaiting timing readout',
        },
      ]
    }

    return comparisonMetrics.slice(0, 3).map(metric => ({
      label: metric.label,
      current: metric.format(metric.current),
      compare: metric.format(metric.compare),
      tone: 'Scenario posture',
    }))
  }, [comparisonDataset, comparisonMetrics, comparisonViewerSnapshot, viewerSnapshot])

  const viewPresets = useMemo(() => ([
    {
      id: 'presentation' as const,
      label: 'Presentation',
      description: 'Animated paper walkthrough.',
      theme: 'dark' as const,
      step: 10 as const,
      autoplay: true,
      lens: 'evidence' as const,
    },
    {
      id: 'analysis' as const,
      label: 'Analysis',
      description: 'Manual inspection with dense reads.',
      theme: 'light' as const,
      step: 1 as const,
      autoplay: false,
      lens: 'methods' as const,
    },
    {
      id: 'theory' as const,
      label: 'Theory',
      description: 'Assumption-first reading mode.',
      theme: 'auto' as const,
      step: 10 as const,
      autoplay: false,
      lens: 'theory' as const,
    },
    {
      id: 'compare' as const,
      label: 'Compare',
      description: 'Position one replay against another.',
      theme: 'light' as const,
      step: 10 as const,
      autoplay: false,
      lens: 'evidence' as const,
    },
  ] as const), [])

  const matchedViewPreset = useMemo(
    () => viewPresets.find(preset =>
      preset.theme === theme
      && preset.step === step
      && preset.autoplay === autoplay
      && preset.lens === paperLens,
    ) ?? null,
    [autoplay, paperLens, step, theme, viewPresets],
  )

  const audienceProfiles = useMemo(() => ([
    {
      id: 'reader' as const,
      label: 'Reader',
      description: 'Paper-first walkthrough.',
      preset: 'presentation' as const,
    },
    {
      id: 'reviewer' as const,
      label: 'Reviewer',
      description: 'Comparison and methods posture.',
      preset: 'compare' as const,
    },
    {
      id: 'researcher' as const,
      label: 'Researcher',
      description: 'Manual analytical inspection.',
      preset: 'analysis' as const,
    },
  ] as const), [])

  const applyViewPreset = (presetId: (typeof viewPresets)[number]['id']) => {
    const preset = viewPresets.find(entry => entry.id === presetId)
    if (!preset) return

    setTheme(preset.theme)
    setStep(preset.step)
    setAutoplay(preset.autoplay)
    setPaperLens(preset.lens)

    if (preset.id === 'compare' && comparisonCandidates[0]) {
      setComparePath(current => current || comparisonCandidates[0]!.path)
    }
  }

  const applyAudienceMode = (mode: (typeof audienceProfiles)[number]['id']) => {
    setAudienceMode(mode)
    const profile = audienceProfiles.find(entry => entry.id === mode)
    if (!profile) return
    applyViewPreset(profile.preset)
  }

  const splitCompareActive = matchedViewPreset?.id === 'compare' && !!comparisonDataset
  const companionAutoRunQuestion = pendingAutoReplayQuestion
    && pendingAutoReplayQuestion === assistantDraft.trim()
    && viewerSnapshot
    && (!splitCompareActive || !comparisonDataset || comparisonViewerSnapshot)
      ? pendingAutoReplayQuestion
      : null

  useEffect(() => {
    if (!splitCompareActive || !comparisonDataset) {
      setComparisonViewerSnapshot(null)
    }
  }, [comparisonDataset, splitCompareActive])

  useEffect(() => {
    setPrimaryReplaySlotIndex(initialWorkspaceState.focusSlot ?? 0)
  }, [initialWorkspaceState.focusSlot, selectedDataset?.path])

  useEffect(() => {
    setComparisonReplaySlotIndex(initialWorkspaceState.compareFocusSlot ?? 0)
  }, [comparisonDataset?.path, initialWorkspaceState.compareFocusSlot])

  const currentSlotNotesQuery = useQuery({
    enabled: Boolean(selectedDataset),
    queryKey: [
      'published-replay-inline-notes',
      selectedDataset?.path ?? '',
      splitCompareActive ? comparisonDataset?.path ?? '' : '',
      primaryReplaySlotIndex,
      splitCompareActive ? comparisonReplaySlotIndex : -1,
      paperLens,
      audienceMode,
    ],
    queryFn: () => listPublishedReplayNotes({
      datasetPath: selectedDataset!.path,
      comparePath: splitCompareActive ? comparisonDataset?.path ?? null : null,
      slotIndex: primaryReplaySlotIndex,
      comparisonSlotIndex: splitCompareActive ? comparisonReplaySlotIndex : null,
      paperLens,
      audienceMode,
    }),
  })
  const currentSlotNotes = useMemo(
    () => currentSlotNotesQuery.data ?? [],
    [currentSlotNotesQuery.data],
  )
  const primarySlotNotes = useMemo(
    () => currentSlotNotes.filter(note => note.anchorKind !== 'comparison'),
    [currentSlotNotes],
  )
  const comparisonSlotNotes = useMemo(
    () => currentSlotNotes.filter(note => note.anchorKind === 'comparison'),
    [currentSlotNotes],
  )
  const primaryAnalyticsQuery = useQuery({
    enabled: Boolean(selectedDataset?.path),
    queryKey: ['published-analytics-payload', selectedDataset?.path ?? ''],
    queryFn: () => fetchPublishedAnalyticsPayload(viewerBaseUrl, selectedDataset!.path),
    staleTime: Infinity,
  })
  const comparisonAnalyticsQuery = useQuery({
    enabled: Boolean(comparisonDataset?.path),
    queryKey: ['published-analytics-payload', comparisonDataset?.path ?? ''],
    queryFn: () => fetchPublishedAnalyticsPayload(viewerBaseUrl, comparisonDataset!.path),
    staleTime: Infinity,
  })
  const primaryAnalyticsPayload = primaryAnalyticsQuery.data ?? null
  const comparisonAnalyticsPayload = comparisonAnalyticsQuery.data ?? null
  const primaryViewerDataState = useMemo<PublishedDatasetDataState>(() => {
    if (primaryAnalyticsQuery.isError) {
      return {
        status: 'error',
        data: null,
        error: (primaryAnalyticsQuery.error as Error).message,
      }
    }
    if (primaryAnalyticsPayload) {
      return {
        status: 'ready',
        data: primaryAnalyticsPayload as PublishedDatasetPayload,
        error: null,
      }
    }
    return {
      status: 'loading',
      data: null,
      error: null,
    }
  }, [primaryAnalyticsPayload, primaryAnalyticsQuery.error, primaryAnalyticsQuery.isError])
  const comparisonViewerDataState = useMemo<PublishedDatasetDataState>(() => {
    if (comparisonAnalyticsQuery.isError) {
      return {
        status: 'error',
        data: null,
        error: (comparisonAnalyticsQuery.error as Error).message,
      }
    }
    if (comparisonAnalyticsPayload) {
      return {
        status: 'ready',
        data: comparisonAnalyticsPayload as PublishedDatasetPayload,
        error: null,
      }
    }
    return {
      status: 'loading',
      data: null,
      error: null,
    }
  }, [comparisonAnalyticsPayload, comparisonAnalyticsQuery.error, comparisonAnalyticsQuery.isError])

  const buildWorkspaceUrl = useCallback((overrides?: Partial<{
    selectedEvaluation: string
    selectedParadigm: string
    selectedResult: string
    datasetPath: string
    theme: WorkspaceTheme
    step: WorkspaceStep
    autoplay: boolean
    paperLens: PaperLens
    comparePath: string
    audienceMode: AudienceMode
    replayQuestion: string
    paperSectionId: string
    focusSlot: number | null
    compareFocusSlot: number | null
    analyticsView: AnalyticsDeckView
    analyticsMetric: AnalyticsQueryMetric
    analyticsCompareMode: AnalyticsCompareMode
  }>) => {
    if (typeof window === 'undefined') return ''

    const url = new URL(window.location.href)
    const params = url.searchParams

    const nextState = {
      selectedEvaluation,
      selectedParadigm,
      selectedResult,
      datasetPath: selectedDataset?.path ?? '',
      theme,
      step,
      autoplay,
      paperLens,
      comparePath: comparisonDataset?.path ?? comparePath,
      audienceMode,
      replayQuestion: assistantDraft.trim(),
      paperSectionId: selectedPaperSection?.id ?? paperSectionId,
      focusSlot: primaryReplaySlotIndex,
      compareFocusSlot: splitCompareActive
        ? comparisonReplaySlotIndex
        : null,
      analyticsView,
      analyticsMetric,
      analyticsCompareMode,
      ...overrides,
    }

    // Don't override 'tab' — App.tsx owns top-level tab routing
    params.delete('q')
    params.delete('eid')
    if (nextState.selectedEvaluation) params.set('evaluation', nextState.selectedEvaluation)
    if (nextState.selectedParadigm) params.set('paradigm', nextState.selectedParadigm)
    if (nextState.selectedResult) params.set('result', nextState.selectedResult)
    if (nextState.datasetPath) params.set('dataset', nextState.datasetPath)
    params.set('theme', nextState.theme)
    params.set('step', String(nextState.step))
    params.set('autoplay', String(nextState.autoplay))
    params.set('lens', nextState.paperLens)
    params.set('audience', nextState.audienceMode)

    if (nextState.comparePath) {
      params.set('compare', nextState.comparePath)
    } else {
      params.delete('compare')
    }

    if (nextState.replayQuestion) {
      params.set('replayQuestion', nextState.replayQuestion)
    } else {
      params.delete('replayQuestion')
    }

    if (nextState.paperSectionId) {
      params.set('paperSection', nextState.paperSectionId)
    } else {
      params.delete('paperSection')
    }

    params.set('analytics', nextState.analyticsView)
    params.set('analyticsMetric', nextState.analyticsMetric)
    params.set('analyticsCompareMode', nextState.analyticsCompareMode)

    if (typeof nextState.focusSlot === 'number' && nextState.focusSlot > 0) {
      params.set('slot', String(nextState.focusSlot))
    } else {
      params.delete('slot')
    }

    if (typeof nextState.compareFocusSlot === 'number' && nextState.compareFocusSlot > 0) {
      params.set('compareSlot', String(nextState.compareFocusSlot))
    } else {
      params.delete('compareSlot')
    }

    url.hash = ''
    return url.toString()
  }, [
    analyticsCompareMode,
    analyticsMetric,
    analyticsView,
    assistantDraft,
    audienceMode,
    autoplay,
    comparePath,
    comparisonDataset?.path,
    comparisonReplaySlotIndex,
    paperLens,
    paperSectionId,
    primaryReplaySlotIndex,
    selectedDataset?.path,
    selectedEvaluation,
    selectedPaperSection?.id,
    selectedParadigm,
    selectedResult,
    splitCompareActive,
    step,
    theme,
  ])

  const applyWorkspacePose = (config: {
    theme: WorkspaceTheme
    step: WorkspaceStep
    autoplay: boolean
    paperLens: PaperLens
    audienceMode: AudienceMode
    comparePath?: string
  }) => {
    setAudienceMode(config.audienceMode)
    setTheme(config.theme)
    setStep(config.step)
    setAutoplay(config.autoplay)
    setPaperLens(config.paperLens)
    setComparePath(config.comparePath ?? '')
  }

  const shareUrl = buildWorkspaceUrl()
  const primaryAnalyticsTotalSlots = totalSlotsFromPayload(primaryAnalyticsPayload)
  const comparisonAnalyticsTotalSlots = totalSlotsFromPayload(comparisonAnalyticsPayload)
  const primaryAnalyticsSlot = clampSlotIndex(
    primaryReplaySlotIndex,
    primaryAnalyticsTotalSlots,
  )
  const comparisonAnalyticsSlot = clampSlotIndex(
    comparisonReplaySlotIndex,
    comparisonAnalyticsTotalSlots,
  )
  useEffect(() => {
    if (primaryReplaySlotIndex === primaryAnalyticsSlot) return
    setPrimaryReplaySlotIndex(primaryAnalyticsSlot)
  }, [primaryAnalyticsSlot, primaryReplaySlotIndex])
  useEffect(() => {
    if (!splitCompareActive) return
    const alignedComparisonSlot = alignSlotByProgress(
      primaryAnalyticsSlot,
      primaryAnalyticsTotalSlots,
      comparisonAnalyticsTotalSlots,
    )
    if (comparisonReplaySlotIndex === alignedComparisonSlot) return
    setComparisonReplaySlotIndex(alignedComparisonSlot)
  }, [
    comparisonAnalyticsTotalSlots,
    comparisonReplaySlotIndex,
    primaryAnalyticsSlot,
    primaryAnalyticsTotalSlots,
    splitCompareActive,
  ])
  const analyticsViewOptions = ANALYTICS_VIEW_OPTIONS
  const analyticsMetricOptions = useMemo(
    () => analyticsMetricOptionsForView(analyticsView),
    [analyticsView],
  )
  const availableAnalyticsCompareModeOptions = useMemo(
    () => analyticsCompareModeOptions(Boolean(comparisonDataset)),
    [comparisonDataset],
  )
  useEffect(() => {
    if (analyticsMetricOptions.some(option => option.id === analyticsMetric)) return
    setAnalyticsMetric(defaultAnalyticsQueryMetricForView(analyticsView))
  }, [analyticsMetric, analyticsMetricOptions, analyticsView])
  useEffect(() => {
    if (availableAnalyticsCompareModeOptions.some(option => option.id === analyticsCompareMode)) return
    setAnalyticsCompareMode(availableAnalyticsCompareModeOptions[0]?.id ?? 'absolute')
  }, [analyticsCompareMode, availableAnalyticsCompareModeOptions])
  const activeAnalyticsMetric = analyticsMetricOptions.find(option => option.id === analyticsMetric) ?? analyticsMetricOptions[0] ?? null
  const activeCompareMode = availableAnalyticsCompareModeOptions.find(option => option.id === analyticsCompareMode)
    ?? availableAnalyticsCompareModeOptions[0]
    ?? null
  const analyticsDashboardPresets = useMemo(
    () => buildAnalyticsDashboardPresets(Boolean(comparisonDataset)),
    [comparisonDataset],
  )
  const analyticsDashboardPresetCards = useMemo<Array<AnalyticsDashboardPreset & { url: string; active: boolean }>>(
    () => analyticsDashboardPresets.map(preset => ({
      ...preset,
      url: buildWorkspaceUrl({
        analyticsView: preset.analyticsView,
        analyticsMetric: preset.analyticsMetric,
        analyticsCompareMode: preset.analyticsCompareMode,
      }),
      active: analyticsView === preset.analyticsView
        && analyticsMetric === preset.analyticsMetric
        && analyticsCompareMode === preset.analyticsCompareMode,
    })),
    [
      analyticsCompareMode,
      analyticsDashboardPresets,
      analyticsMetric,
      analyticsView,
      buildWorkspaceUrl,
    ],
  )
  const analyticsMetricCards = useMemo<AnalyticsMetricCard[]>(
    () => buildAnalyticsMetricCards({
      analyticsView,
      queryMetric: activeAnalyticsMetric?.id ?? defaultAnalyticsQueryMetricForView(analyticsView),
      compareMode: activeCompareMode?.id ?? 'absolute',
      payload: primaryAnalyticsPayload,
      slot: primaryAnalyticsSlot,
      comparisonPayload: comparisonDataset ? comparisonAnalyticsPayload : null,
      comparisonSlot: comparisonAnalyticsSlot,
      comparisonLabel: 'Comparison replay',
    }),
    [
      activeAnalyticsMetric,
      activeCompareMode,
      analyticsView,
      comparisonAnalyticsPayload,
      comparisonAnalyticsSlot,
      comparisonDataset,
      primaryAnalyticsPayload,
      primaryAnalyticsSlot,
    ],
  )
  const analyticsSourceRefs = useMemo<readonly SourceBlock['refs'][number][]>(() => {
    if (!selectedDataset) return []

    return [
      {
        label: 'Analytics view',
        section: activeAnalyticsMetric?.label ?? analyticsViewOptions.find(view => view.id === analyticsView)?.label ?? 'Analytics desk',
        url: shareUrl || undefined,
      },
      {
        label: 'Published dataset JSON',
        section: selectedDataset.path,
        url: datasetUrl || undefined,
      },
      ...(sourceUrl ? [{
        label: 'Dataset source file',
        section: selectedDataset.path,
        url: sourceUrl,
      }] : []),
      ...(selectedPaperSection ? [{
        label: 'Canonical paper section',
        section: `${selectedPaperSection.number} ${selectedPaperSection.title}`,
        url: paperSectionUrl || undefined,
      }] : []),
      ...(comparisonDataset && comparisonDatasetUrl ? [{
        label: 'Comparison dataset JSON',
        section: comparisonDataset.path,
        url: comparisonDatasetUrl,
      }] : []),
    ]
  }, [
    activeAnalyticsMetric,
    analyticsView,
    analyticsViewOptions,
    comparisonDataset,
    comparisonDatasetUrl,
    datasetUrl,
    paperSectionUrl,
    selectedDataset,
    selectedPaperSection,
    shareUrl,
    sourceUrl,
  ])
  const analyticsBlocks = useMemo<readonly Block[]>(() => {
    if (!primaryAnalyticsPayload || !selectedDataset) return []

    return buildAnalyticsBlocks({
      analyticsView,
      queryMetric: activeAnalyticsMetric?.id ?? defaultAnalyticsQueryMetricForView(analyticsView),
      compareMode: activeCompareMode?.id ?? 'absolute',
      primaryPayload: primaryAnalyticsPayload,
      primarySlot: primaryAnalyticsSlot,
      sourceRefs: analyticsSourceRefs,
      primaryLabel: 'Active replay',
      comparisonPayload: comparisonDataset ? comparisonAnalyticsPayload : null,
      comparisonSlot: comparisonAnalyticsSlot,
      comparisonLabel: 'Comparison replay',
    })
  }, [
    activeAnalyticsMetric,
    activeCompareMode,
    analyticsSourceRefs,
    analyticsView,
    comparisonAnalyticsPayload,
    comparisonAnalyticsSlot,
    comparisonDataset,
    primaryAnalyticsPayload,
    primaryAnalyticsSlot,
    selectedDataset,
  ])
  const analyticsExportBundle = useMemo(
    () => primaryAnalyticsPayload && selectedDataset
      ? buildAnalyticsExportBundle({
          analyticsView,
          queryMetric: activeAnalyticsMetric?.id ?? defaultAnalyticsQueryMetricForView(analyticsView),
          compareMode: activeCompareMode?.id ?? 'absolute',
          primaryPayload: primaryAnalyticsPayload,
          primarySlot: primaryAnalyticsSlot,
          sourceRefs: analyticsSourceRefs,
          primaryLabel: 'Active replay',
          comparisonPayload: comparisonDataset ? comparisonAnalyticsPayload : null,
          comparisonSlot: comparisonAnalyticsSlot,
          comparisonLabel: 'Comparison replay',
          shareUrl,
        })
      : null,
    [
      activeAnalyticsMetric,
      activeCompareMode,
      analyticsSourceRefs,
      analyticsView,
      comparisonAnalyticsPayload,
      comparisonAnalyticsSlot,
      comparisonDataset,
      primaryAnalyticsPayload,
      primaryAnalyticsSlot,
      selectedDataset,
      shareUrl,
    ],
  )
  const analyticsExportJson = useMemo(
    () => analyticsExportBundle ? JSON.stringify(analyticsExportBundle, null, 2) : null,
    [analyticsExportBundle],
  )
  const analyticsExportCsv = useMemo(
    () => analyticsExportBundle ? buildAnalyticsExportCsv(analyticsExportBundle) : null,
    [analyticsExportBundle],
  )
  const analyticsStatusMessage = primaryAnalyticsQuery.isLoading
    ? 'Loading exact analytics queries from the published dataset...'
    : primaryAnalyticsQuery.isError
      ? (primaryAnalyticsQuery.error as Error).message
      : null
  const analyticsPromptLaunchers = useMemo<readonly AnalyticsPromptLauncher[]>(() => {
    if (!selectedDataset) return []

    const viewLabel = analyticsViewOptions.find(view => view.id === analyticsView)?.label ?? 'Analytics'
    const metricLabel = activeAnalyticsMetric?.label ?? viewLabel
    const compareModeLabel = activeCompareMode?.label?.toLowerCase() ?? 'absolute'
    const currentSlotLabel = `slot ${primaryAnalyticsSlot + 1}`
    const prompts = [
      {
        label: 'Read this query',
        prompt: `Using the ${metricLabel.toLowerCase()} query in the ${viewLabel.toLowerCase()} desk for ${selectedDataset.evaluation} / ${paradigmLabel(selectedDataset.paradigm)}, explain what the evidence shows at ${currentSlotLabel} and at the final slot. Start with exact metrics before interpretation.`,
        detail: 'Replay evidence first',
      },
      comparisonDataset
        ? {
            label: 'Compare this query',
            prompt: `Using the ${metricLabel.toLowerCase()} query in ${compareModeLabel} mode, compare ${selectedDataset.evaluation} / ${paradigmLabel(selectedDataset.paradigm)} against ${comparisonDataset.evaluation} / ${paradigmLabel(comparisonDataset.paradigm)}. Start with the exact metric differences, then explain what changes materially.`,
            detail: `${activeCompareMode?.label ?? 'Compare'} read`,
          }
        : null,
      selectedPaperSection
        ? {
            label: `Bind ${selectedPaperSection.number}`,
            prompt: `Use ${selectedPaperSection.number} ${selectedPaperSection.title} to interpret this ${metricLabel.toLowerCase()} analytics query. Start with the observed metrics, then explain what they mean for the paper's claim.`,
            detail: 'Canonical paper anchor',
          }
        : null,
      {
        label: 'Surface implication',
        prompt: `From this ${metricLabel.toLowerCase()} query, what is the strongest protocol or infrastructure implication? Start with the observed metrics first, then give your interpretation and say what remains uncertain.`,
        detail: 'Interpretive, not factual',
      },
    ].filter((entry): entry is AnalyticsPromptLauncher => Boolean(entry))

    return prompts
  }, [
    activeAnalyticsMetric,
    activeCompareMode,
    analyticsView,
    analyticsViewOptions,
    comparisonDataset,
    primaryAnalyticsSlot,
    selectedDataset,
    selectedPaperSection,
  ])
  const applyAnalyticsDashboardPreset = (preset: AnalyticsDashboardPreset) => {
    setAnalyticsView(preset.analyticsView)
    setAnalyticsMetric(preset.analyticsMetric)
    setAnalyticsCompareMode(preset.analyticsCompareMode)
  }

  const handleCopyShareUrl = async (targetUrl = shareUrl) => {
    if (!targetUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setShareStatus('failed')
      return
    }

    try {
      await navigator.clipboard.writeText(targetUrl)
      setShareStatus('copied')
    } catch {
      setShareStatus('failed')
    }
  }

  const handleCopyAnalyticsJson = async () => {
    if (!analyticsExportJson || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setShareStatus('failed')
      return
    }

    try {
      await navigator.clipboard.writeText(analyticsExportJson)
      setShareStatus('copied')
    } catch {
      setShareStatus('failed')
    }
  }

  const handleDownloadAnalyticsExport = (format: 'json' | 'csv') => {
    const content = format === 'json' ? analyticsExportJson : analyticsExportCsv
    if (!content) return

    const filename = `published-analytics-${analyticsView}-${activeAnalyticsMetric?.id ?? defaultAnalyticsQueryMetricForView(analyticsView)}-${activeCompareMode?.id ?? 'absolute'}.${format}`
    downloadBlobFile(
      filename,
      new Blob([content], {
        type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
      }),
    )
  }

  const replayPublicationQuery = selectedDataset
    ? lastReplayAnswer?.question.trim()
      || assistantDraft.trim()
      || `What stands out in the ${paradigmLabel(selectedDataset.paradigm)} published replay?`
    : ''
  const replayPublicationSummary = selectedDataset
    ? lastReplayAnswer?.response.summary
      || `${selectedDataset.evaluation} / ${paradigmLabel(selectedDataset.paradigm)} published replay anchored to ${selectedPaperSection?.number ?? 'the selected paper section'} ${selectedPaperSection?.title ?? ''}${viewerSnapshot ? ` at slot ${viewerSnapshot.slotNumber.toLocaleString()}` : ''}.`
    : ''
  const replayContributionBlocks: readonly Block[] = (() => {
    if (!selectedDataset) return []

    const baseBlocks = (lastReplayAnswer?.response.blocks ?? []).slice(0, 3)
    const comparisonLabel = comparisonDataset ? `${comparisonDataset.evaluation} / ${paradigmLabel(comparisonDataset.paradigm)}` : null
    const replayAnchorBlock: Block = {
      type: 'stat',
      value: viewerSnapshot ? `Slot ${viewerSnapshot.slotNumber.toLocaleString()}` : 'Replay-wide',
      label: 'Replay anchor',
      sublabel: comparisonLabel
        ? `Compared with ${comparisonLabel}${comparisonViewerSnapshot ? ` at slot ${comparisonViewerSnapshot.slotNumber.toLocaleString()}` : ''}`
        : `${paperLens} lens · ${audienceMode} mode`,
    }
    const paperAnchorBlock: Block | null = selectedPaperSection
      ? {
          type: 'stat',
          value: selectedPaperSection.number,
          label: 'Canonical paper section',
          sublabel: selectedPaperSection.title,
        }
      : null
    const sourceBlock: Block = {
      type: 'source',
      refs: [
        {
          label: 'Published replay view',
          section: viewerSnapshot ? `slot ${viewerSnapshot.slotNumber.toLocaleString()}` : 'active replay posture',
          url: shareUrl || undefined,
        },
        ...(selectedPaperSection
          ? [{
              label: 'Canonical paper section',
              section: `${selectedPaperSection.number} ${selectedPaperSection.title}`,
              url: paperSectionUrl || undefined,
            }]
          : []),
      ],
    }

    if (baseBlocks.length > 0) {
      return [
        ...baseBlocks,
        replayAnchorBlock,
        ...(paperAnchorBlock ? [paperAnchorBlock] : []),
        sourceBlock,
      ].slice(0, 6)
    }

    return [
      {
        type: 'insight',
        title: 'Published replay reading',
        text: replayPublicationSummary || 'Published replay reading anchored to the active evidence surface.',
      },
      replayAnchorBlock,
      ...(paperAnchorBlock ? [paperAnchorBlock] : []),
      sourceBlock,
    ]
  })()
  const replayPublishTitle = selectedDataset
    ? `${selectedDataset.evaluation} ${paradigmLabel(selectedDataset.paradigm)} replay${viewerSnapshot ? ` slot ${viewerSnapshot.slotNumber.toLocaleString()}` : ''}`
    : 'Published replay note'
  const replayPublishTakeaway = replayPublicationSummary
    ? `${replayPublicationSummary}${lastReplayAnswer ? ` ${lastReplayAnswer.answeredContext}` : ''}`
    : 'Edit this takeaway to reflect what the published replay shows in your own words.'
  const replayPublishContextKey = selectedDataset
    ? [
        'replay',
        selectedDataset.path,
        selectedPaperSection?.id ?? 'none',
        primaryReplaySlotIndex,
        comparisonDataset?.path ?? 'none',
        splitCompareActive ? comparisonReplaySlotIndex : 'all',
      ].join(':')
    : null

  const publishReplayMutation = useMutation({
    mutationFn: async (input: {
      contextKey: string
      title: string
      takeaway: string
      author: string
    }) => {
      if (!selectedDataset) {
        throw new Error('Select a published replay before publishing a community note.')
      }

      const created = await createExploration({
        query: replayPublicationQuery,
        summary: replayPublicationSummary,
        blocks: replayContributionBlocks,
        followUps: lastReplayAnswer?.response.followUps ?? [],
        model: lastReplayAnswer?.response.model ?? 'published-replay',
        cached: lastReplayAnswer?.response.cached ?? false,
        surface: 'reading',
      })

      return await publishExploration(created.id, {
        title: input.title,
        takeaway: input.takeaway,
        author: input.author || undefined,
      })
    },
    onSuccess: (published, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
      setPublishedReplayContextKey(variables.contextKey)
      setPublishedReplayExplorationId(published.id)
    },
  })
  const resetReplayPublishMutation = publishReplayMutation.reset

  const savedWorkspaceViews = [
    {
      id: 'paper-overview',
      label: 'Paper overview',
      note: 'Reader-first opening state.',
      config: {
        audienceMode: 'reader' as const,
        theme: 'dark' as const,
        step: 10 as const,
        autoplay: true,
        paperLens: 'evidence' as const,
        comparePath: '',
      },
    },
    {
      id: 'theory-section',
      label: 'Theory section',
      note: 'Assumptions and mechanism view.',
      config: {
        audienceMode: 'reader' as const,
        theme: 'auto' as const,
        step: 10 as const,
        autoplay: false,
        paperLens: 'theory' as const,
        comparePath: '',
      },
    },
    {
      id: 'methods-appendix',
      label: 'Methods appendix',
      note: 'Manual inspection and provenance.',
      config: {
        audienceMode: 'researcher' as const,
        theme: 'light' as const,
        step: 1 as const,
        autoplay: false,
        paperLens: 'methods' as const,
        comparePath: '',
      },
    },
    {
      id: 'reviewer-link',
      label: 'Reviewer compare',
      note: 'Split-view comparison posture.',
      config: {
        audienceMode: 'reviewer' as const,
        theme: 'light' as const,
        step: 10 as const,
        autoplay: false,
        paperLens: 'evidence' as const,
        comparePath: comparisonDataset?.path ?? comparisonCandidates[0]?.path ?? '',
      },
    },
  ].map(view => ({
    ...view,
    url: buildWorkspaceUrl({
      theme: view.config.theme,
      step: view.config.step,
      autoplay: view.config.autoplay,
      paperLens: view.config.paperLens,
      audienceMode: view.config.audienceMode,
      comparePath: view.config.comparePath,
    }),
  }))

  const chapterRoutes = [
    {
      id: 'chapter-overview',
      label: '1. Published overview',
      note: 'Open on animated evidence with the replay already moving.',
      config: {
        audienceMode: 'reader' as const,
        theme: 'dark' as const,
        step: 10 as const,
        autoplay: true,
        paperLens: 'evidence' as const,
        comparePath: '',
      },
    },
    {
      id: 'chapter-theory',
      label: '2. Mechanism and assumptions',
      note: 'Shift into theory mode and tie the replay to the new formal section.',
      config: {
        audienceMode: 'reader' as const,
        theme: 'auto' as const,
        step: 10 as const,
        autoplay: false,
        paperLens: 'theory' as const,
        comparePath: '',
      },
    },
    {
      id: 'chapter-compare',
      label: '3. Comparative read',
      note: 'Open the foil scenario in split compare for reviewer-style reading.',
      config: {
        audienceMode: 'reviewer' as const,
        theme: 'light' as const,
        step: 10 as const,
        autoplay: false,
        paperLens: 'evidence' as const,
        comparePath: comparisonDataset?.path ?? comparisonCandidates[0]?.path ?? '',
      },
    },
    {
      id: 'chapter-appendix',
      label: '4. Methods appendix',
      note: 'Switch to manual scrubbing and provenance-oriented reading.',
      config: {
        audienceMode: 'researcher' as const,
        theme: 'light' as const,
        step: 1 as const,
        autoplay: false,
        paperLens: 'methods' as const,
        comparePath: '',
      },
    },
  ].map(chapter => ({
    ...chapter,
    url: buildWorkspaceUrl({
      theme: chapter.config.theme,
      step: chapter.config.step,
      autoplay: chapter.config.autoplay,
      paperLens: chapter.config.paperLens,
      audienceMode: chapter.config.audienceMode,
      comparePath: chapter.config.comparePath,
    }),
  }))

  const activeChapterRoute = chapterRoutes.find(chapter =>
    chapter.config.audienceMode === audienceMode
    && chapter.config.theme === theme
    && chapter.config.step === step
    && chapter.config.autoplay === autoplay
    && chapter.config.paperLens === paperLens
    && (chapter.config.comparePath || '') === (comparisonDataset?.path ?? comparePath ?? ''),
  ) ?? null

  const currentViewSummary = useMemo(() => {
    const playbackLabel = autoplay ? 'autoplay on' : 'manual scrub'
    const compareLabel = comparisonDataset
      ? `comparison loaded against ${comparisonDataset.evaluation} / ${paradigmLabel(comparisonDataset.paradigm)}`
      : 'single-scenario focus'

    const chapterLabel = activeChapterRoute ? ` ${activeChapterRoute.label}.` : ''
    const paperAnchorLabel = selectedPaperSection ? ` Paper anchor: ${selectedPaperSection.number} ${selectedPaperSection.title}.` : ''
    const analyticsLabel = ` Analytics desk: ${analyticsView}.`
    const primaryReplaySummary = describeViewerSnapshot(viewerSnapshot, 'Primary replay')
    const compareReplaySummary = splitCompareActive
      ? describeViewerSnapshot(comparisonViewerSnapshot, 'Comparison replay')
      : null

    return [
      `${audienceProfiles.find(profile => profile.id === audienceMode)?.label ?? 'Reader'} mode with ${matchedViewPreset?.label ?? 'Custom'} stack: ${themeLabel(theme)} theme, step ${step}, ${playbackLabel}, ${paperLens} lens, ${compareLabel}.${chapterLabel}${paperAnchorLabel}${analyticsLabel}`,
      primaryReplaySummary,
      compareReplaySummary,
    ].filter(Boolean).join(' ')
  }, [
    activeChapterRoute,
    analyticsView,
    audienceMode,
    audienceProfiles,
    autoplay,
    comparisonDataset,
    comparisonViewerSnapshot,
    matchedViewPreset,
    paperLens,
    selectedPaperSection,
    splitCompareActive,
    step,
    theme,
    viewerSnapshot,
  ])

  const paperNotes = useMemo(() => {
    const notes = [
      {
        title: 'Published source',
        body: selectedDataset
          ? `${selectedDataset.path} is the published source for this scenario. Readers are interacting with checked-in evidence, not waiting on a fresh full-scale run.`
          : 'Select a scenario to reveal the published source for this replay.',
      },
      {
        title: paperLens === 'theory' ? 'Theory hook' : paperLens === 'methods' ? 'Method reading' : 'Evidence reading',
        body: paperLens === 'theory'
          ? `Use the replay to explain how migration cost ${formatEth(selectedMetadata?.cost)}, delta ${formatMilliseconds(selectedMetadata?.delta)}, cutoff ${formatMilliseconds(selectedMetadata?.cutoff)}, and gamma ${typeof selectedMetadata?.gamma === 'number' ? formatNumber(selectedMetadata.gamma, 4) : 'N/A'} shape the observed trajectory.`
          : paperLens === 'methods'
            ? 'Treat selector changes as movement across published scenarios. This page is intentionally separated from the heavier exact-simulation path.'
            : `Start with the map and concentration metrics, then trace how latency and ${LIVENESS_LABEL.toLowerCase()} respond as slot progression unfolds.`,
      },
      {
        title: 'Canonical paper anchor',
        body: selectedPaperSection
          ? `${selectedPaperSection.number} ${selectedPaperSection.title}: ${selectedPaperSection.description}`
          : 'Select a canonical paper section to tie theory and note-taking back to the paper.',
      },
      {
        title: 'Question draft',
        body: assistantDraft
          ? `Current draft: ${assistantDraft}`
          : 'Draft a question tied to this selected replay so you can carry it into the reading guide or a community note.',
      },
    ]

    return notes
  }, [assistantDraft, paperLens, selectedDataset, selectedMetadata, selectedPaperSection])

  const immediateResultSummary = (() => {
    if (lastReplayAnswer?.response.summary.trim()) {
      return lastReplayAnswer.response.summary
    }

    if (splitCompareActive && viewerSnapshot && comparisonViewerSnapshot) {
      return `At this posture the primary replay shows ${viewerSnapshot.activeRegions.toLocaleString()} active regions versus ${comparisonViewerSnapshot.activeRegions.toLocaleString()} in the comparison replay, with Gini ${viewerSnapshot.currentGini != null ? formatNumber(viewerSnapshot.currentGini, 3) : 'N/A'} versus ${comparisonViewerSnapshot.currentGini != null ? formatNumber(comparisonViewerSnapshot.currentGini, 3) : 'N/A'}.`
    }

    if (viewerSnapshot) {
      const dominantRegion = viewerSnapshot.dominantRegionCity ?? viewerSnapshot.dominantRegionId ?? 'N/A'
      return `The published replay is already live in-page. At slot ${viewerSnapshot.slotNumber.toLocaleString()}, ${dominantRegion} is currently leading with ${formatPercentValue(viewerSnapshot.dominantRegionShare)} share.`
    }

    return selectedMetadata?.description
      ?? 'The published workspace opens on the checked-in replay so readers start from evidence instead of a setup screen.'
  })()

  const buildReplayMetricCard = useCallback((input: {
    readonly id: string
    readonly label: string
    readonly detail: string
    readonly focusArea: PublishedViewerFocusArea
    readonly anchor: PublishedReplayAnchorSelectionDetail
    readonly metric: AnalyticsQueryMetric
    readonly analyticsView: AnalyticsDeckView
    readonly currentValue: number | null | undefined
    readonly color: string
    readonly formatSeriesValue: (value: number) => string
  }): ReplaySnapshotMetricCard => ({
    id: input.id,
    label: input.label,
    value: input.currentValue == null ? '--' : input.formatSeriesValue(input.currentValue),
    detail: input.detail,
    color: input.color,
    series: analyticsMetricSeriesForPayload(primaryAnalyticsPayload, input.metric) ?? [],
    currentSlotIndex: primaryAnalyticsSlot,
    totalSlotsLabel: `${primaryAnalyticsTotalSlots.toLocaleString()} slots tracked`,
    formatSeriesValue: input.formatSeriesValue,
    comparisonSeries: splitCompareActive
      ? analyticsMetricSeriesForPayload(comparisonAnalyticsPayload, input.metric) ?? []
      : undefined,
    comparisonSlotIndex: splitCompareActive
      ? comparisonAnalyticsSlot
      : undefined,
    comparisonLabel: splitCompareActive && comparisonDataset ? paradigmLabel(comparisonDataset.paradigm) : undefined,
    focusArea: input.focusArea,
    anchor: input.anchor,
    metric: input.metric,
    analyticsView: input.analyticsView,
  }), [
    comparisonAnalyticsPayload,
    comparisonAnalyticsSlot,
    comparisonDataset,
    primaryAnalyticsPayload,
    primaryAnalyticsSlot,
    primaryAnalyticsTotalSlots,
    splitCompareActive,
  ])

  const heroSnapshotCards = useMemo<ReplaySnapshotMetricCard[]>(() => {
    const dominantRegion = viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId ?? 'No active region'

    return [
      buildReplayMetricCard({
        id: 'active-regions',
        label: 'Active regions',
        detail: `${dominantRegion} currently leads the map.`,
        focusArea: 'geography',
        anchor: { kind: 'metric', key: 'active_regions', label: 'Metric · Active regions' },
        metric: 'active_regions',
        analyticsView: 'geography',
        currentValue: viewerSnapshot?.activeRegions,
        color: '#7C3AED',
        formatSeriesValue: formatCountValue,
      }),
      buildReplayMetricCard({
        id: 'leader-share',
        label: 'Leader share',
        detail: `${dominantRegion} holds the current top share.`,
        focusArea: 'geography',
        anchor: { kind: 'metric', key: 'leader_share', label: 'Metric · Leader share' },
        metric: 'leader_share',
        analyticsView: 'geography',
        currentValue: viewerSnapshot?.dominantRegionShare,
        color: '#C2553A',
        formatSeriesValue: formatPercentSeriesValue,
      }),
      buildReplayMetricCard({
        id: 'gini',
        label: 'Gini',
        detail: viewerSnapshot?.currentHhi != null ? `HHI ${formatIndexValue(viewerSnapshot.currentHhi)}` : 'Geographic inequality signal.',
        focusArea: 'concentration',
        anchor: { kind: 'metric', key: 'gini', label: 'Metric · Gini' },
        metric: 'gini',
        analyticsView: 'concentration',
        currentValue: viewerSnapshot?.currentGini,
        color: '#C2553A',
        formatSeriesValue: formatIndexValue,
      }),
      buildReplayMetricCard({
        id: 'proposal-time',
        label: 'Proposal time',
        detail: viewerSnapshot?.currentLiveness != null
          ? `${LIVENESS_LABEL} ${formatLivenessValue(viewerSnapshot.currentLiveness)}`
          : 'Consensus timing posture.',
        focusArea: 'performance',
        anchor: { kind: 'metric', key: 'proposal_time', label: 'Metric · Proposal time' },
        metric: 'proposal_times',
        analyticsView: 'latency',
        currentValue: viewerSnapshot?.currentProposalTime,
        color: '#D97706',
        formatSeriesValue: formatMillisecondsSeriesValue,
      }),
    ]
  }, [buildReplayMetricCard, viewerSnapshot])

  const resultSnapshotCards = useMemo<ReplaySnapshotMetricCard[]>(() => [
    buildReplayMetricCard({
      id: 'liveness',
      label: LIVENESS_LABEL,
      detail: viewerSnapshot?.currentProposalTime != null
        ? `Proposal ${formatOptionalMilliseconds(viewerSnapshot.currentProposalTime)}`
        : 'Regional outage threshold over slot progression.',
      focusArea: 'performance',
      anchor: { kind: 'metric', key: 'liveness', label: `Metric · ${LIVENESS_LABEL}` },
      metric: 'liveness',
      analyticsView: 'latency',
      currentValue: viewerSnapshot?.currentLiveness,
      color: '#16A34A',
      formatSeriesValue: formatLivenessSeriesValue,
    }),
    buildReplayMetricCard({
      id: 'hhi',
      label: 'HHI',
      detail: viewerSnapshot?.currentGini != null ? `Gini ${formatIndexValue(viewerSnapshot.currentGini)}` : 'Regional dominance concentration.',
      focusArea: 'concentration',
      anchor: { kind: 'metric', key: 'hhi', label: 'Metric · HHI' },
      metric: 'hhi',
      analyticsView: 'concentration',
      currentValue: viewerSnapshot?.currentHhi,
      color: '#2563EB',
      formatSeriesValue: formatIndexValue,
    }),
    buildReplayMetricCard({
      id: 'mev',
      label: 'Average MEV',
      detail: selectedDataset ? `${selectedDataset.evaluation} under ${paradigmLabel(selectedDataset.paradigm)}.` : 'Reward surface over time.',
      focusArea: 'performance',
      anchor: { kind: 'metric', key: 'mev', label: 'Metric · MEV' },
      metric: 'mev',
      analyticsView: 'economics',
      currentValue: viewerSnapshot?.currentMev,
      color: '#2563EB',
      formatSeriesValue: formatEthSeriesValue,
    }),
    buildReplayMetricCard({
      id: 'failed-proposals',
      label: 'Failed proposals',
      detail: splitCompareActive && comparisonDataset
        ? `Overlaying ${paradigmLabel(comparisonDataset.paradigm)} for posture comparison.`
        : 'Accumulated timing failures across the replay.',
      focusArea: 'performance',
      anchor: { kind: 'metric', key: 'failed_block_proposals', label: 'Metric · Failed proposals' },
      metric: 'failed_block_proposals',
      analyticsView: 'latency',
      currentValue: viewerSnapshot?.currentFailedBlockProposals,
      color: '#BE123C',
      formatSeriesValue: formatCountValue,
    }),
  ], [buildReplayMetricCard, comparisonDataset, selectedDataset, splitCompareActive, viewerSnapshot])

  useEffect(() => {
    setActiveReplayMetricCardId(null)
    setViewerSpotlightArea(null)
  }, [comparisonDataset?.path, selectedDataset?.path])

  useEffect(() => {
    const sharedQuestion = sharedReplayQuestionRef.current
    if (sharedQuestion) {
      setAssistantDraft(sharedQuestion)
      sharedReplayQuestionRef.current = ''
      return
    }

    setAssistantDraft(assistantPrompts[0]?.prompt ?? '')
  }, [assistantPrompts, selectedDataset?.path])

  useEffect(() => {
    const sharedSectionId = sharedPaperSectionRef.current
    if (sharedSectionId && PAPER_SECTIONS.some(section => section.id === sharedSectionId)) {
      setPaperSectionId(sharedSectionId)
      sharedPaperSectionRef.current = ''
      return
    }

    setPaperSectionId(inferPaperSectionId(selectedDataset, paperLens))
  }, [paperLens, selectedDataset])

  useEffect(() => {
    if (!comparisonCandidates.length) {
      setComparePath('')
      return
    }

    if (!comparePath || !comparisonCandidates.some(entry => entry.path === comparePath)) {
      setComparePath(comparisonCandidates[0]!.path)
    }
  }, [comparePath, comparisonCandidates])

  useEffect(() => {
    resetReplayPublishMutation()
  }, [
    comparisonDataset?.path,
    comparisonReplaySlotIndex,
    primaryReplaySlotIndex,
    resetReplayPublishMutation,
    selectedDataset?.path,
    selectedPaperSection?.id,
  ])

  useEffect(() => {
    if (!shareStatus || shareStatus === 'idle' || typeof window === 'undefined') return

    const timeout = window.setTimeout(() => setShareStatus('idle'), 1800)
    return () => window.clearTimeout(timeout)
  }, [shareStatus])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const params = url.searchParams

    // Don't override 'tab' — App.tsx owns top-level tab routing
    params.delete('q')
    params.delete('eid')
    if (selectedEvaluation) params.set('evaluation', selectedEvaluation)
    if (selectedParadigm) params.set('paradigm', selectedParadigm)
    if (selectedResult) params.set('result', selectedResult)
    if (selectedDataset?.path) params.set('dataset', selectedDataset.path)
    params.set('theme', theme)
    params.set('step', String(step))
    params.set('autoplay', String(autoplay))
    params.set('lens', paperLens)
    params.set('audience', audienceMode)
    params.set('analytics', analyticsView)
    params.set('analyticsMetric', analyticsMetric)
    params.set('analyticsCompareMode', analyticsCompareMode)

    if (comparisonDataset?.path) {
      params.set('compare', comparisonDataset.path)
    } else if (comparePath) {
      params.set('compare', comparePath)
    } else {
      params.delete('compare')
    }

    if (assistantDraft.trim()) {
      params.set('replayQuestion', assistantDraft.trim())
    } else {
      params.delete('replayQuestion')
    }

    if (selectedPaperSection?.id) {
      params.set('paperSection', selectedPaperSection.id)
    } else {
      params.delete('paperSection')
    }

    if (primaryReplaySlotIndex > 0) {
      params.set('slot', String(primaryReplaySlotIndex))
    } else {
      params.delete('slot')
    }

    if (splitCompareActive && comparisonReplaySlotIndex > 0) {
      params.set('compareSlot', String(comparisonReplaySlotIndex))
    } else {
      params.delete('compareSlot')
    }

    window.history.replaceState({}, '', `${url.pathname}?${params.toString()}${url.hash}`)
  }, [
    analyticsCompareMode,
    analyticsMetric,
    analyticsView,
    assistantDraft,
    audienceMode,
    autoplay,
    comparePath,
    comparisonDataset?.path,
    comparisonReplaySlotIndex,
    paperLens,
    primaryReplaySlotIndex,
    selectedPaperSection?.id,
    selectedDataset?.path,
    selectedEvaluation,
    selectedParadigm,
    selectedResult,
    splitCompareActive,
    step,
    theme,
  ])

  const persistViewerSettings = () => {
    if (!selectedDataset) return

    try {
      window.localStorage.setItem('app_settings', JSON.stringify({
        dataset: selectedDataset.path,
        theme,
        step,
        autoplay,
      }))
    } catch {
      // Ignore storage failures and rely on query params.
    }
  }

  const handleLaunchViewer = () => {
    if (!selectedDataset || !viewerUrl) return

    persistViewerSettings()

    const popup = window.open(viewerUrl, '_blank', 'noopener,noreferrer')
    if (!popup) {
      window.location.assign(viewerUrl)
    }
  }

  const handleFocusViewer = () => {
    if (!activeViewer) return
    persistViewerSettings()
    viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handlePrimaryReplaySlotChange = useCallback((nextSlotIndex: number) => {
    setPrimaryReplaySlotIndex(nextSlotIndex)
    if (!splitCompareActive) return
    setComparisonReplaySlotIndex(alignSlotByProgress(
      nextSlotIndex,
      primaryAnalyticsTotalSlots,
      comparisonAnalyticsTotalSlots,
    ))
  }, [comparisonAnalyticsTotalSlots, primaryAnalyticsTotalSlots, splitCompareActive])

  const handleComparisonReplaySlotChange = useCallback((nextSlotIndex: number) => {
    setComparisonReplaySlotIndex(nextSlotIndex)
  }, [])

  const handleReplayMetricCardActivate = useCallback((card: ReplaySnapshotMetricCard) => {
    setActiveReplayMetricCardId(card.id)
    setViewerSpotlightArea(card.focusArea)
    setAnalyticsView(card.analyticsView)
    setAnalyticsMetric(card.metric)
    handleFocusViewer()
    dispatchPublishedReplayAnchorSelection(card.anchor)
  }, [handleFocusViewer])

  const handleFocusInquiry = () => {
    inquiryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handlePrimeReplayQuestion = (nextQuestion: string, autoRun = false) => {
    const normalizedQuestion = nextQuestion.trim()
    setAssistantDraft(nextQuestion)
    setPendingAutoReplayQuestion(autoRun && normalizedQuestion ? normalizedQuestion : '')
    handleFocusInquiry()
  }

  const handleFillDemoValues = () => {
    const demoEntry = (catalog?.datasets ?? []).find(entry =>
      entry.evaluation === 'Test' && entry.paradigm === 'External' && entry.result === 'data',
    )

    if (demoEntry) {
      setSelectedEvaluation(demoEntry.evaluation)
      setSelectedParadigm(demoEntry.paradigm)
      setSelectedResult(demoEntry.result)
    } else {
      // Fall back to first available dataset if exact demo match not found
      const fallback = (catalog?.datasets ?? [])[0]
      if (fallback) {
        setSelectedEvaluation(fallback.evaluation)
        setSelectedParadigm(fallback.paradigm)
        setSelectedResult(fallback.result)
      }
    }

    setTheme('dark')
    setStep(10)
    setAutoplay(true)
  }

  if (catalogError) {
    return (
      <div className="lab-stage p-5">
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {catalogError}
        </div>
      </div>
    )
  }

  if (!catalog) {
    return (
      <div className="lab-stage p-5">
        <div className="py-12 text-sm text-muted text-center">
          Loading published paper replay…
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="stripe-top-accent lab-stage overflow-hidden p-0">
        <motion.div
          className="border-b border-rule bg-white/96 px-5 py-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...SPRING_CRISP, delay: 0.04 }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-text-primary">
                {selectedDataset ? `${selectedDataset.evaluation} · ${paradigmLabel(selectedDataset.paradigm)}` : 'Published scenarios'}
              </h2>
              {selectedDataset && (
                <div className="mt-1 text-sm text-muted">{selectedDataset.result}</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  applyAudienceMode('reader')
                  setPaperLens('evidence')
                }}
                className="follow-up-chip"
                title="Paper-first walkthrough with animated evidence"
              >
                Evidence
              </button>
              <button
                onClick={() => {
                  applyViewPreset('compare')
                  if (comparisonDataset) {
                    handlePrimeReplayQuestion(
                      viewerSnapshot
                        ? `Compare the active replay at slot ${viewerSnapshot.slotNumber.toLocaleString()} against ${paradigmLabel(comparisonDataset.paradigm)} and tell me what changes materially.`
                        : `What is materially different between the active replay and ${paradigmLabel(comparisonDataset.paradigm)}?`,
                      true,
                    )
                  }
                }}
                className="follow-up-chip"
                title="Position one replay against another"
              >
                Compare
              </button>
              <button
                onClick={() => {
                  applyViewPreset('analysis')
                  setPaperLens('theory')
                  handlePrimeReplayQuestion(
                    selectedPaperSection
                      ? `Use ${selectedPaperSection.number} ${selectedPaperSection.title} to explain the main mechanism visible in this replay.`
                      : 'What mechanism seems to drive the concentration pattern in this replay?',
                    true,
                  )
                }}
                className="follow-up-chip"
                title="Assumption-first reading mode"
              >
                Mechanism
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={STAGGER_ITEM} className="md:col-span-2 xl:col-span-4">
            <PublishedReplayMetricStrip
              cards={heroSnapshotCards}
              activeCardId={activeReplayMetricCardId}
              onCardActivate={card => handleReplayMetricCardActivate(card as ReplaySnapshotMetricCard)}
              onCardScrub={(_card, slotIndex) => handlePrimaryReplaySlotChange(slotIndex)}
            />
          </motion.div>
        </motion.div>
      </div>

      {activeViewer && (
        <motion.section
          ref={viewerRef}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1.04fr)_360px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.08 }}
        >
          <div className="space-y-4">
            <div className="lab-stage overflow-hidden p-0">
              <div className="border-b border-rule bg-surface-active/60 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="lab-chip">{activeViewer.dataset.evaluation}</span>
                  <span className="lab-chip">{paradigmLabel(activeViewer.dataset.paradigm)}</span>
                  <span className="lab-chip">{activeViewer.dataset.result}</span>
                </div>
              </div>

              {comparisonDataset ? (
                <div className="border-b border-rule bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Comparison posture</div>
                      <div className="mt-1 text-sm font-medium text-text-primary">
                        {splitCompareActive ? 'Split compare is live in the main reading flow.' : 'Comparison is staged and ready to activate.'}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-text-primary">{comparisonNarrative}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => applyViewPreset('compare')} className="follow-up-chip">
                        {splitCompareActive ? 'Compare active' : 'Activate split compare'}
                      </button>
                      <button onClick={() => handlePrimeReplayQuestion(`Compare ${activeViewer.dataset.result} against ${comparisonDataset.result} and tell me what changes materially.`, true)} className="follow-up-chip">
                        Ask compare question
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-accent bg-white px-4 py-4">
                        <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Primary scenario</div>
                        <div className="mt-2 text-sm font-medium text-text-primary">
                          {activeViewer.dataset.evaluation} · {paradigmLabel(activeViewer.dataset.paradigm)}
                        </div>
                        <div className="mt-1 text-xs text-muted">{activeViewer.dataset.result}</div>
                      </div>

                      <div className="rounded-xl border border-rule bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Comparison scenario</div>
                            <div className="mt-2 text-sm font-medium text-text-primary">
                              {comparisonDataset.evaluation} · {paradigmLabel(comparisonDataset.paradigm)}
                            </div>
                            <div className="mt-1 text-xs text-muted">{comparisonDataset.result}</div>
                          </div>
                          {splitCompareActive ? (
                            <span className="rounded-full bg-accent px-2 py-1 text-2xs font-medium uppercase tracking-[0.1em] text-white">
                              Live
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs text-muted">Compare against</label>
                          <select
                            value={comparisonDataset.path}
                            onChange={event => setComparePath(event.target.value)}
                            className="w-full rounded-lg border border-rule bg-surface-active px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                          >
                            {comparisonCandidates.map(entry => (
                              <option key={entry.path} value={entry.path}>
                                {entry.evaluation} · {paradigmLabel(entry.paradigm)} · {entry.result}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {comparisonHighlightCards.map(card => (
                        <div key={card.label} className="rounded-xl border border-rule bg-white px-4 py-4">
                          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{card.label}</div>
                          <div className="mt-3 flex items-end justify-between gap-3">
                            <div>
                              <div className="text-xs text-muted">Primary</div>
                              <div className="mt-1 text-sm font-medium text-text-primary">{card.current}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted">Compare</div>
                              <div className="mt-1 text-sm font-medium text-text-primary">{card.compare}</div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-muted">{card.tone}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {splitCompareActive && comparisonDataset ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-accent bg-white px-4 py-4">
                      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Primary published replay</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        {activeViewer.dataset.evaluation} · {paradigmLabel(activeViewer.dataset.paradigm)}
                      </div>
                      <div className="mt-1 text-xs text-muted">{activeViewer.dataset.result}</div>
                    </div>
                    <PublishedDatasetViewer
                      key={`primary:${activeViewer.dataset.path}:${theme}:${step}:${autoplay ? 'auto' : 'manual'}:${initialWorkspaceState.focusSlot ?? 0}`}
                      viewerBaseUrl={viewerBaseUrl}
                      dataset={activeViewer.dataset}
                      dataState={primaryViewerDataState}
                      initialSettings={activeViewer.settings}
                      initialSlotIndex={initialWorkspaceState.focusSlot}
                      slotIndex={primaryReplaySlotIndex}
                      onSlotIndexChange={handlePrimaryReplaySlotChange}
                      onStateChange={setViewerSnapshot}
                      annotationNotes={primarySlotNotes}
                      anchorScope="primary"
                      spotlightArea={viewerSpotlightArea}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-rule bg-surface-active px-4 py-4">
                      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Comparison published replay</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        {comparisonDataset.evaluation} · {paradigmLabel(comparisonDataset.paradigm)}
                      </div>
                      <div className="mt-1 text-xs text-muted">{comparisonDataset.result}</div>
                    </div>
                    <PublishedDatasetViewer
                      key={`compare:${comparisonDataset.path}:${theme}:${step}:${autoplay ? 'auto' : 'manual'}:${initialWorkspaceState.compareFocusSlot ?? 0}`}
                      viewerBaseUrl={viewerBaseUrl}
                      dataset={comparisonDataset}
                      dataState={comparisonViewerDataState}
                      initialSettings={activeViewer.settings}
                      initialSlotIndex={initialWorkspaceState.compareFocusSlot}
                      slotIndex={comparisonReplaySlotIndex}
                      onSlotIndexChange={handleComparisonReplaySlotChange}
                      onStateChange={setComparisonViewerSnapshot}
                      annotationNotes={comparisonSlotNotes}
                      anchorScope="comparison"
                      spotlightArea={viewerSpotlightArea}
                    />
                  </div>
                </div>
              ) : (
                <PublishedDatasetViewer
                  key={`${activeViewer.dataset.path}:${theme}:${step}:${autoplay ? 'auto' : 'manual'}:${initialWorkspaceState.focusSlot ?? 0}`}
                  viewerBaseUrl={viewerBaseUrl}
                  dataset={activeViewer.dataset}
                  dataState={primaryViewerDataState}
                  initialSettings={activeViewer.settings}
                  initialSlotIndex={initialWorkspaceState.focusSlot}
                  slotIndex={primaryReplaySlotIndex}
                  onSlotIndexChange={handlePrimaryReplaySlotChange}
                  onStateChange={setViewerSnapshot}
                  annotationNotes={primarySlotNotes}
                  anchorScope="primary"
                  spotlightArea={viewerSpotlightArea}
                />
              )}
            </div>

            <div className="geo-accent-bar lab-stage overflow-hidden p-0">
              <div className="border-b border-rule bg-white/96 px-5 py-4">
                <div className="text-sm leading-6 text-text-primary">
                  {immediateResultSummary}
                </div>
                {promptLaunchers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {promptLaunchers.slice(0, 3).map(item => (
                      <button
                        key={`findings-${item.label}`}
                        onClick={() => handlePrimeReplayQuestion(item.prompt, true)}
                        className="follow-up-chip"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="md:col-span-2 xl:col-span-4">
                  <PublishedReplayMetricStrip
                    cards={resultSnapshotCards}
                    activeCardId={activeReplayMetricCardId}
                    onCardActivate={card => handleReplayMetricCardActivate(card as ReplaySnapshotMetricCard)}
                    onCardScrub={(_card, slotIndex) => handlePrimaryReplaySlotChange(slotIndex)}
                  />
                </div>
              </div>
            </div>
          </div>

          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="stripe-top-accent lab-stage overflow-hidden p-0">
              <div className="border-b border-rule bg-white/96 px-5 py-3">
                <div className="text-sm font-medium text-text-primary">Controls</div>
              </div>

              <div className="space-y-4 px-5 py-4">

                <div className="grid gap-2">
                  {spotlightDatasets.map(entry => {
                    const isActive = selectedDataset?.path === entry.path
                    return (
                      <button
                        key={`${entry.evaluation}-${entry.paradigm}-${entry.result}`}
                        onClick={() => {
                          setSelectedEvaluation(entry.evaluation)
                          setSelectedParadigm(entry.paradigm)
                          setSelectedResult(entry.result)
                        }}
                        className={cn(
                          'rounded-xl border px-4 py-3 text-left transition-colors',
                          isActive
                            ? 'border-accent bg-white'
                            : 'border-rule bg-surface-active hover:border-border-hover hover:bg-white',
                        )}
                      >
                        <div className="text-xs font-medium text-text-primary">{entry.evaluation} · {paradigmLabel(entry.paradigm)}</div>
                        <div className="mt-0.5 text-11 text-muted">{entry.result}</div>
                      </button>
                    )
                  })}
                </div>

                <div className="grid gap-3 rounded-xl border border-rule bg-surface-active px-4 py-4">
                  <div>
                    <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Audience</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                      {audienceProfiles.map(profile => (
                        <button
                          key={profile.id}
                          onClick={() => applyAudienceMode(profile.id)}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-left transition-colors',
                            audienceMode === profile.id
                              ? 'border-accent bg-white'
                              : 'border-rule bg-white text-text-primary hover:border-border-hover',
                          )}
                        >
                          <div className="text-xs font-medium text-text-primary">{profile.label}</div>
                          <div className="mt-1 text-[0.6875rem] leading-5 text-muted">{profile.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">View</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      {viewPresets.map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => applyViewPreset(preset.id)}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-left transition-colors',
                            matchedViewPreset?.id === preset.id
                              ? 'border-accent bg-white'
                              : 'border-rule bg-white text-text-primary hover:border-border-hover',
                          )}
                        >
                          <div className="text-xs font-medium text-text-primary">{preset.label}</div>
                          <div className="mt-1 text-[0.6875rem] leading-5 text-muted">{preset.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">Lens</div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {paperLenses.map(lens => (
                        <button
                          key={lens.id}
                          onClick={() => setPaperLens(lens.id)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                            paperLens === lens.id
                              ? 'border-accent bg-white text-accent'
                              : 'border-rule bg-white text-text-primary hover:border-border-hover',
                          )}
                        >
                          {lens.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={handleFillDemoValues} className="follow-up-chip">Reset</button>
                  <button onClick={() => void handleCopyShareUrl()} className="follow-up-chip">
                    {shareStatus === 'copied' ? 'Copied' : 'Share'}
                  </button>
                  <button onClick={() => applyViewPreset('compare')} className="follow-up-chip">Compare</button>
                </div>
              </div>
            </div>
          </aside>
        </motion.section>
      )}

      <motion.div
        className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.12 }}
      >
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <details className="lab-stage overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium text-text-primary">Advanced controls</span>
              <span className="text-xs text-muted">Scenario, presets, share</span>
            </summary>

            <div className="space-y-6 border-t border-rule bg-gradient-to-b from-stone-50/94 to-white/98 p-5">
          <div className="lab-stage p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="text-sm font-medium text-text-primary">Scenario</span>
              <button
                onClick={handleFillDemoValues}
                className="text-xs text-muted transition-colors hover:text-text-primary"
              >
                Reset
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">Published dataset</label>
                <select
                  value={selectedEvaluation}
                  onChange={event => setSelectedEvaluation(event.target.value)}
                  className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                >
                  {evaluationOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Paradigm</label>
                <div className="grid grid-cols-2 gap-2">
                  {paradigmOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => setSelectedParadigm(option)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        selectedParadigm === option
                          ? 'border-accent bg-white text-accent'
                          : 'border-rule bg-white text-text-primary hover:border-border-hover',
                      )}
                    >
                      {paradigmLabel(option)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Scenario variant</label>
                <select
                  value={selectedResult}
                  onChange={event => setSelectedResult(event.target.value)}
                  className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                >
                  {resultOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-rule bg-surface-active px-3 py-2">
              <div className="mono-xs break-all">{selectedDataset?.path ?? 'No dataset selected'}</div>
            </div>
          </div>

          <div className="lab-stage p-5">
            <div className="text-sm font-medium text-text-primary mb-4">Reading controls</div>

            <div className="mb-4">
              <label className="text-xs text-muted mb-1.5 block">Reading mode</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {audienceProfiles.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => applyAudienceMode(profile.id)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-left transition-colors',
                      audienceMode === profile.id
                        ? 'border-accent bg-white'
                        : 'border-rule bg-surface-active hover:border-border-hover hover:bg-white',
                    )}
                  >
                    <div className="text-xs font-medium text-text-primary">{profile.label}</div>
                    <div className="mt-1 text-11 leading-5 text-muted">{profile.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted mb-1.5 block">Reading presets</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {viewPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyViewPreset(preset.id)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-left transition-colors',
                      matchedViewPreset?.id === preset.id
                        ? 'border-accent bg-white'
                        : 'border-rule bg-surface-active hover:border-border-hover hover:bg-white',
                    )}
                  >
                    <div className="text-xs font-medium text-text-primary">{preset.label}</div>
                    <div className="mt-1 text-11 leading-5 text-muted">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">Theme</label>
                <select
                  value={theme}
                  onChange={event => setTheme(event.target.value as 'auto' | 'light' | 'dark')}
                  className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Step size</label>
                <select
                  value={step}
                  onChange={event => setStep(Number(event.target.value) as 1 | 10 | 50)}
                  className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value={1}>1</option>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Autoplay</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'On', value: true },
                    { label: 'Off', value: false },
                  ].map(option => (
                    <button
                      key={option.label}
                      onClick={() => setAutoplay(option.value)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        autoplay === option.value
                          ? 'border-accent bg-white text-accent'
                          : 'border-rule bg-white text-text-primary hover:border-border-hover',
                      )}
                    >
                      {option.label}
                  </button>
                ))}
              </div>
            </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Reading lens</label>
                <div className="grid grid-cols-3 gap-2">
                  {paperLenses.map(lens => (
                    <button
                      key={lens.id}
                      onClick={() => setPaperLens(lens.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        paperLens === lens.id
                          ? 'border-accent bg-white text-accent'
                          : 'border-rule bg-white text-text-primary hover:border-border-hover',
                      )}
                    >
                      {lens.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              <span className="lab-chip">{matchedViewPreset?.label ?? 'Custom'}</span>
              <span className="lab-chip">{audienceProfiles.find(profile => profile.id === audienceMode)?.label ?? 'Reader'}</span>
              <span className="lab-chip">{themeLabel(theme)}</span>
              <span className="lab-chip">step {step}</span>
              <span className="lab-chip">{paperLens}</span>
              {comparisonDataset && <span className="lab-chip">vs {paradigmLabel(comparisonDataset.paradigm)}</span>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void handleCopyShareUrl()}
                className="follow-up-chip"
                title="Copy link preserving scenario, lens, and slot posture"
              >
                {shareStatus === 'copied' ? 'Copied' : 'Copy share link'}
              </button>
            </div>

            <div className="mt-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-2">Reading routes</div>
              <div className="flex flex-wrap gap-2">
                {savedWorkspaceViews.map(view => (
                  <button
                    key={view.id}
                    onClick={() => applyWorkspacePose(view.config)}
                    className="follow-up-chip"
                    title={view.note}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint mb-2">Chapter routes</div>
              <div className="flex flex-wrap gap-2">
                {chapterRoutes.map(chapter => (
                  <button
                    key={chapter.id}
                    onClick={() => applyWorkspacePose(chapter.config)}
                    className={cn('follow-up-chip', activeChapterRoute?.id === chapter.id && 'border-accent text-accent')}
                    title={chapter.note}
                  >
                    {chapter.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
            </div>
          </details>

        </aside>

          <div className="space-y-7">
          <details className="lab-stage overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium text-text-primary">Companion & paper tools</span>
              <span className="text-xs text-muted">Questions, notes, publishing</span>
            </summary>

            <div className="space-y-7 border-t border-rule bg-gradient-to-b from-stone-50/94 to-white/98 p-5">
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="lab-stage p-5">
              <div className="text-sm font-medium text-text-primary mb-3">Scenario parameters</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { label: 'v', value: selectedMetadata?.v?.toLocaleString() ?? '--' },
                  { label: 'cost', value: formatEth(selectedMetadata?.cost) },
                  { label: '\u03b4', value: formatMilliseconds(selectedMetadata?.delta) },
                  { label: 'cutoff', value: formatMilliseconds(selectedMetadata?.cutoff) },
                  { label: '\u03b3', value: typeof selectedMetadata?.gamma === 'number' ? formatNumber(selectedMetadata.gamma, 4) : '--' },
                  { label: 'source', value: selectedDataset?.sourceRole ?? '--' },
                ].map(param => (
                  <div key={param.label} className="lab-metric-card">
                    <div className="text-2xs text-text-faint">{param.label}</div>
                    <div className="mt-0.5 mono-sm">{param.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div ref={inquiryRef} className="lab-stage overflow-hidden p-0">
                <div className="border-b border-rule bg-white/96 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-text-primary">Replay inquiry</span>
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                      {viewerSnapshot && <span className="lab-chip">slot {viewerSnapshot.slotNumber}</span>}
                      <span className="lab-chip">{paperLens}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 p-5 2xl:grid-cols-[minmax(0,1.05fr)_320px]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {promptLaunchers.map(item => (
                        <button
                          key={`${item.label}:${item.prompt}`}
                          onClick={() => handlePrimeReplayQuestion(item.prompt)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                            assistantDraft.trim() === item.prompt.trim()
                              ? 'border-accent bg-white text-accent'
                              : 'border-rule bg-white text-text-primary hover:border-border-hover',
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-xl border border-rule bg-white px-4 py-4">
                      <textarea
                        value={assistantDraft}
                        onChange={event => {
                          setAssistantDraft(event.target.value)
                          setPendingAutoReplayQuestion('')
                        }}
                        className="min-h-[120px] w-full resize-none rounded-lg border border-rule bg-surface-active/50 px-3 py-3 text-sm leading-6 text-text-primary outline-none transition-colors focus:border-accent/30"
                        placeholder="Ask the paper about this published run..."
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const nextQuestion = assistantDraft.trim()
                            if (!nextQuestion) return
                            setPendingAutoReplayQuestion(nextQuestion)
                          }}
                          disabled={!assistantDraft.trim()}
                          className={cn(
                            'rounded-full px-4 py-2 text-xs font-medium transition-all',
                            assistantDraft.trim()
                              ? 'bg-accent text-white'
                              : 'cursor-not-allowed border border-rule bg-surface-active text-muted',
                          )}
                        >
                          Ask companion
                        </button>
                        <button
                          onClick={() => { setAssistantDraft(''); setPendingAutoReplayQuestion('') }}
                          className="follow-up-chip"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {selectedPaperSection ? (
                      <div className="rounded-xl border border-rule bg-surface-active/60 px-4 py-4">
                        <div className="text-xs font-medium text-text-primary">
                          {selectedPaperSection.number} {selectedPaperSection.title}
                        </div>
                        {paperSectionPromptStarters.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {paperSectionPromptStarters.slice(0, 2).map(prompt => (
                              <button
                                key={prompt}
                                onClick={() => handlePrimeReplayQuestion(prompt)}
                                className="follow-up-chip text-left"
                                title={prompt}
                              >
                                {prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-3">
                          <BlockCanvas blocks={selectedPaperSectionBlocks} showExport={false} />
                        </div>
                      </div>
                    ) : null}

                    <PublishedReplayCompanionPanel
                      question={assistantDraft}
                      onQuestionChange={setAssistantDraft}
                      dataset={selectedDataset}
                      comparisonDataset={comparisonDataset}
                      paperSection={selectedPaperSection
                        ? {
                            id: selectedPaperSection.id,
                            number: selectedPaperSection.number,
                            title: selectedPaperSection.title,
                            description: selectedPaperSection.description,
                            context: paperSectionContext,
                          }
                        : null}
                      paperLens={paperLens}
                      audienceMode={audienceMode}
                      currentViewSummary={currentViewSummary}
                      viewerSnapshot={viewerSnapshot}
                      comparisonViewerSnapshot={comparisonViewerSnapshot}
                      replayQueryUrl={shareUrl}
                      datasetArtifactUrl={datasetUrl}
                      datasetSourceUrl={sourceUrl}
                      comparisonArtifactUrl={comparisonDatasetUrl}
                      comparisonSourceUrl={comparisonSourceUrl}
                      paperSectionUrl={paperSectionUrl}
                      autoRunQuestion={companionAutoRunQuestion}
                      onAutoRunHandled={() => setPendingAutoReplayQuestion('')}
                      onResponseChange={setLastReplayAnswer}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {suggestedPaperSections.map(section => (
                        <button
                          key={section.id}
                          onClick={() => setPaperSectionId(section.id)}
                          className={cn(
                            'follow-up-chip',
                            selectedPaperSection?.id === section.id && 'border-accent text-accent',
                          )}
                        >
                          {section.number}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-rule px-5 py-4">
                  <details className="overflow-hidden rounded-xl border border-rule bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="text-sm font-medium text-text-primary">Notes & publishing</span>
                      <span className="text-xs text-muted">Community notes</span>
                    </summary>

                    <div className="border-t border-rule px-4 py-4">
                      <PublishedReplayNotesPanel
                        dataset={selectedDataset}
                        comparisonDataset={splitCompareActive ? comparisonDataset : null}
                        viewerSnapshot={viewerSnapshot}
                        comparisonViewerSnapshot={splitCompareActive ? comparisonViewerSnapshot : null}
                        paperLens={paperLens}
                        audienceMode={audienceMode}
                      />

                      {replayPublishContextKey ? (
                        <div className="mt-4">
                          <ContributionComposer
                            key={replayPublishContextKey}
                            sourceLabel="Add a community note"
                            defaultTitle={replayPublishTitle}
                            defaultTakeaway={replayPublishTakeaway}
                            helperText="Edit the title and takeaway to reflect your read of this replay."
                            publishLabel="Publish note"
                            successLabel="Published"
                            viewPublishedLabel="Open Community"
                            published={publishedReplayContextKey === replayPublishContextKey}
                            isPublishing={publishReplayMutation.isPending}
                            error={(publishReplayMutation.error as Error | null)?.message ?? null}
                            onViewPublished={publishedReplayExplorationId && onOpenCommunityExploration
                              ? () => onOpenCommunityExploration(publishedReplayExplorationId)
                              : onTabChange
                                ? () => onTabChange('community')
                                : undefined}
                            onPublish={payload => publishReplayMutation.mutate({
                              contextKey: replayPublishContextKey,
                              ...payload,
                            })}
                          />
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>
              </div>
            </div>
            </div>
            </div>
          </details>

              <SimulationAnalyticsDesk
                description="Analytics over published replay metrics."
                copyLabel="Copy analytics view"
                onCopyShareUrl={() => void handleCopyShareUrl()}
                onCopyQueryJson={() => void handleCopyAnalyticsJson()}
                onDownloadQueryJson={() => handleDownloadAnalyticsExport('json')}
                onDownloadQueryCsv={() => handleDownloadAnalyticsExport('csv')}
                analyticsView={analyticsView}
                onAnalyticsViewChange={setAnalyticsView}
                analyticsViewOptions={analyticsViewOptions}
                analyticsMetric={activeAnalyticsMetric?.id ?? defaultAnalyticsQueryMetricForView(analyticsView)}
                onAnalyticsMetricChange={setAnalyticsMetric}
                analyticsMetricOptions={analyticsMetricOptions}
                compareMode={activeCompareMode?.id ?? 'absolute'}
                onCompareModeChange={setAnalyticsCompareMode}
                compareModeOptions={availableAnalyticsCompareModeOptions}
                statusMessage={analyticsStatusMessage}
                metricCards={analyticsMetricCards}
                blocks={analyticsBlocks}
              >
                <details className="mt-4 overflow-hidden rounded-xl border border-rule bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm font-medium text-text-primary">Dashboards & prompts</span>
                    <span className="text-xs text-muted">{analyticsDashboardPresetCards.length} saved</span>
                  </summary>

                  <div className="grid gap-4 border-t border-rule px-4 py-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div>
                      <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Dashboards</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {analyticsDashboardPresetCards.map(preset => (
                          <div
                            key={preset.id}
                            className={cn(
                              'rounded-xl border px-4 py-4 transition-colors',
                              preset.active
                                ? 'border-accent bg-surface-active'
                                : 'border-rule bg-surface-active',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-text-primary">{preset.label}</div>
                                <div className="mt-1 text-xs leading-5 text-muted">{preset.note}</div>
                              </div>
                              {preset.active ? (
                                <span className="rounded-full bg-accent px-2 py-1 text-2xs font-medium uppercase tracking-[0.1em] text-white">
                                  Live
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => applyAnalyticsDashboardPreset(preset)}
                                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                              >
                                Open dashboard
                              </button>
                              <button
                                onClick={() => void handleCopyShareUrl(preset.url)}
                                className="rounded-full border border-rule bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                              >
                                Copy link
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-2xs uppercase tracking-[0.1em] text-text-faint">Ask from this query</div>
                      {analyticsPromptLaunchers.length > 0 ? (
                        <div className="mt-4 grid gap-3">
                          {analyticsPromptLaunchers.map(item => (
                            <button
                              key={item.label}
                              onClick={() => handlePrimeReplayQuestion(item.prompt, true)}
                              className="rounded-xl border border-rule bg-surface-active px-4 py-4 text-left transition-colors hover:border-border-hover"
                            >
                              <div className="text-sm font-medium text-text-primary">{item.label}</div>
                              <div className="mt-1 text-11 uppercase tracking-[0.1em] text-text-faint">{item.detail}</div>
                              <div className="mt-3 text-xs leading-5 text-muted">{item.prompt}</div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-rule bg-surface-active px-4 py-4 text-sm leading-6 text-text-primary">
                          Pick a dashboard posture first, then launch a replay question from that frozen query state.
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </SimulationAnalyticsDesk>

              <details className="lab-stage overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                  <span className="text-sm font-medium text-text-primary">Utilities</span>
                  <span className="text-xs text-muted">Viewer actions</span>
                </summary>

                <div className="border-t border-rule px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleFocusViewer}
                      disabled={!selectedDataset}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Return to replay
                    </button>
                    <button
                      onClick={handleLaunchViewer}
                      disabled={!selectedDataset}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Open standalone viewer →
                    </button>
                    <button
                      onClick={() => applyAudienceMode('reviewer')}
                      className="rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
                    >
                      Reviewer mode
                    </button>
                    <button
                      onClick={() => setShowConfig(current => !current)}
                      disabled={!selectionConfig}
                      className="rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {showConfig ? 'Hide config' : 'Inspect config'}
                    </button>
                    <a
                      href={datasetUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover',
                        !datasetUrl && 'pointer-events-none opacity-60',
                      )}
                    >
                      Download data.json
                    </a>
                    <a
                      href={sourceUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover',
                        !sourceUrl && 'pointer-events-none opacity-60',
                      )}
                    >
                      View source
                    </a>
                  </div>

                  {showConfig && selectionConfig ? (
                    <div className="mt-4 rounded-xl border border-rule bg-surface-active p-4">
                      <div className="mb-2 text-xs text-muted">Selection config</div>
                      <pre className="overflow-x-auto text-xs text-text-primary">{selectionConfig}</pre>
                    </div>
                  ) : null}
                </div>
              </details>

              <details className="lab-stage overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                  <span className="text-sm font-medium text-text-primary">Paper context</span>
                  <span className="text-xs text-muted">{paperNotes.length} notes</span>
                </summary>

                <div className="grid gap-4 border-t border-rule px-5 py-4 sm:grid-cols-2">
                  {paperNotes.map(note => (
                    <div key={note.title} className="lab-metric-card">
                      <div className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{note.title}</div>
                      <div className="mt-1.5 text-xs leading-5 text-muted">{note.body}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </motion.div>

    </motion.div>
  )
}
