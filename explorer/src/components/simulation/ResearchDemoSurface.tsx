import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { ContributionComposer } from '../community/ContributionComposer'
import { BlockCanvas } from '../explore/BlockCanvas'
import type { TabId } from '../layout/TabNav'
import { PAPER_SECTIONS, type PaperSection } from '../../data/paper-sections'
import { createExploration, publishExploration } from '../../lib/api'
import { cn } from '../../lib/cn'
import { listPublishedReplayNotes } from '../../lib/published-replay-notes-api'
import type { PublishedReplayCopilotResponse } from '../../lib/published-replay-api'
import type { Block } from '../../types/blocks'
import { formatNumber } from './simulation-constants'
import { PublishedReplayCompanionPanel } from './PublishedReplayCompanionPanel'
import { PublishedReplayNotesPanel } from './PublishedReplayNotesPanel'
import { PublishedDatasetViewer, type PublishedViewerSnapshot } from './PublishedDatasetViewer'

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
  readonly onOpenExactLab?: () => void
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
}

interface CanvasAnnotation {
  readonly title: string
  readonly body: string
}

interface ResultSnapshotCard {
  readonly label: string
  readonly value: string
  readonly detail: string
}

interface PromptLauncher {
  readonly label: string
  readonly prompt: string
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

function formatOptionalMilliseconds(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)} ms`
}

function formatOptionalEth(value: number | null | undefined, digits = 4): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
  return `${formatNumber(value, digits)} ETH`
}

function isCanvasAnnotation(note: CanvasAnnotation | null): note is CanvasAnnotation {
  return note != null
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
  }
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
  const liveness = snapshot.currentLiveness != null ? `${formatNumber(snapshot.currentLiveness, 1)}%` : 'N/A'
  const mev = snapshot.currentMev != null ? `${formatNumber(snapshot.currentMev, 4)} ETH` : 'N/A'
  const proposalTime = snapshot.currentProposalTime != null ? `${formatNumber(snapshot.currentProposalTime, 1)} ms` : 'N/A'

  return `${label} is at slot ${snapshot.slotNumber.toLocaleString()} of ${snapshot.totalSlots.toLocaleString()}, with ${snapshot.activeRegions.toLocaleString()} active regions. Dominant region: ${dominantRegion}. Gini ${gini}, liveness ${liveness}, MEV ${mev}, proposal time ${proposalTime}.`
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
  onOpenExactLab,
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
  const [paperSectionId, setPaperSectionId] = useState(initialWorkspaceState.paperSectionId ?? '')
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const viewerRef = useRef<HTMLElement | null>(null)
  const inquiryRef = useRef<HTMLDivElement | null>(null)
  const sharedReplayQuestionRef = useRef(initialWorkspaceState.replayQuestion?.trim() ?? '')
  const sharedPaperSectionRef = useRef(initialWorkspaceState.paperSectionId ?? '')
  const [pendingAutoReplayQuestion, setPendingAutoReplayQuestion] = useState(initialWorkspaceState.replayQuestion?.trim() ?? '')
  const [viewerSnapshot, setViewerSnapshot] = useState<PublishedViewerSnapshot | null>(null)
  const [comparisonViewerSnapshot, setComparisonViewerSnapshot] = useState<PublishedViewerSnapshot | null>(null)
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

  const introParagraphs = useMemo(
    () => (catalog?.introBlurb ?? '')
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean),
    [catalog],
  )

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
        comparePath: comparePath || null,
        paperSectionId: selectedPaperSection?.id ?? null,
        replayQuestion: assistantDraft || null,
        focusSlot: viewerSnapshot?.slotIndex ?? null,
        compareFocusSlot: comparisonViewerSnapshot?.slotIndex ?? null,
      },
      metadata: selectedDataset.metadata ?? {},
    }, null, 2)
  }, [
    assistantDraft,
    audienceMode,
    autoplay,
    comparePath,
    comparisonViewerSnapshot?.slotIndex,
    paperLens,
    selectedDataset,
    selectedPaperSection?.id,
    step,
    theme,
    viewerSnapshot?.slotIndex,
  ])

  const paperLenses = useMemo(() => ([
    {
      id: 'evidence' as const,
      label: 'Evidence',
      eyebrow: 'What the replay shows',
      title: selectedDataset
        ? `${selectedDataset.evaluation} under ${selectedDataset.paradigm} block building`
        : 'Published replay evidence',
      body: selectedDataset
        ? `This surface treats ${selectedDataset.result} as the authoritative published output and keeps it visible while the reader moves through the paper.`
        : 'Select a dataset to reveal the published evidence layer.',
      points: [
        'Use the replay to inspect concentration, topology, latency, and liveness over slot progression.',
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

  const activePaperLens = paperLenses.find(lens => lens.id === paperLens) ?? paperLenses[0]

  const assistantPrompts = useMemo(() => {
    if (!selectedDataset) return []

    return [
      {
        label: 'Explain the replay',
        prompt: `Summarize what the ${selectedDataset.evaluation} / ${selectedDataset.paradigm} published replay is showing and which charts I should read first.`,
      },
      {
        label: 'Trace slot changes',
        prompt: `Walk me through the major slot-level changes in ${selectedDataset.path}, focusing on decentralization, latency, and liveness.`,
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
        ? `Using ${selectedPaperSection.number} ${selectedPaperSection.title}, what changes materially between the active replay and ${comparisonDataset.paradigm}?`
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
      ? `${comparisonDataset.evaluation} / ${comparisonDataset.paradigm} serves as a foil. ${statements.join(' ')}${replayComparison}`
      : `Compare ${selectedDataset.result} against ${comparisonDataset.result} with the map, timeline, and current paper lens.${replayComparison}`
  }, [comparisonDataset, comparisonViewerSnapshot, selectedDataset, selectedMetadata, viewerSnapshot])

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

  const currentSlotNotesQuery = useQuery({
    enabled: Boolean(selectedDataset && viewerSnapshot),
    queryKey: [
      'published-replay-inline-notes',
      selectedDataset?.path ?? '',
      splitCompareActive ? comparisonDataset?.path ?? '' : '',
      viewerSnapshot?.slotIndex ?? -1,
      splitCompareActive ? comparisonViewerSnapshot?.slotIndex ?? -1 : -1,
      paperLens,
      audienceMode,
    ],
    queryFn: () => listPublishedReplayNotes({
      datasetPath: selectedDataset!.path,
      comparePath: splitCompareActive ? comparisonDataset?.path ?? null : null,
      slotIndex: viewerSnapshot!.slotIndex,
      comparisonSlotIndex: splitCompareActive ? comparisonViewerSnapshot?.slotIndex ?? null : null,
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

  const buildWorkspaceUrl = (overrides?: Partial<{
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
      focusSlot: viewerSnapshot?.slotIndex ?? initialWorkspaceState.focusSlot ?? null,
      compareFocusSlot: splitCompareActive
        ? comparisonViewerSnapshot?.slotIndex ?? initialWorkspaceState.compareFocusSlot ?? null
        : null,
      ...overrides,
    }

    params.set('tab', 'results')
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
  }

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

  const replayPublicationQuery = selectedDataset
    ? lastReplayAnswer?.question.trim()
      || assistantDraft.trim()
      || `What stands out in the ${selectedDataset.paradigm} published replay?`
    : ''
  const replayPublicationSummary = selectedDataset
    ? lastReplayAnswer?.response.summary
      || `${selectedDataset.evaluation} / ${selectedDataset.paradigm} published replay anchored to ${selectedPaperSection?.number ?? 'the selected paper section'} ${selectedPaperSection?.title ?? ''}${viewerSnapshot ? ` at slot ${viewerSnapshot.slotNumber.toLocaleString()}` : ''}.`
    : ''
  const replayContributionBlocks: readonly Block[] = (() => {
    if (!selectedDataset) return []

    const baseBlocks = (lastReplayAnswer?.response.blocks ?? []).slice(0, 3)
    const comparisonLabel = comparisonDataset ? `${comparisonDataset.evaluation} / ${comparisonDataset.paradigm}` : null
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
    ? `${selectedDataset.evaluation} ${selectedDataset.paradigm} replay${viewerSnapshot ? ` slot ${viewerSnapshot.slotNumber.toLocaleString()}` : ''}`
    : 'Published replay note'
  const replayPublishTakeaway = replayPublicationSummary
    ? `${replayPublicationSummary}${lastReplayAnswer ? ` ${lastReplayAnswer.answeredContext}` : ''}`
    : 'Edit this takeaway to reflect what the published replay shows in your own words.'
  const replayPublishContextKey = selectedDataset
    ? [
        'replay',
        selectedDataset.path,
        selectedPaperSection?.id ?? 'none',
        viewerSnapshot?.slotIndex ?? 'all',
        comparisonDataset?.path ?? 'none',
        comparisonViewerSnapshot?.slotIndex ?? 'all',
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
      ? `comparison loaded against ${comparisonDataset.evaluation} / ${comparisonDataset.paradigm}`
      : 'single-scenario focus'

    const chapterLabel = activeChapterRoute ? ` ${activeChapterRoute.label}.` : ''
    const paperAnchorLabel = selectedPaperSection ? ` Paper anchor: ${selectedPaperSection.number} ${selectedPaperSection.title}.` : ''
    const primaryReplaySummary = describeViewerSnapshot(viewerSnapshot, 'Primary replay')
    const compareReplaySummary = splitCompareActive
      ? describeViewerSnapshot(comparisonViewerSnapshot, 'Comparison replay')
      : null

    return [
      `${audienceProfiles.find(profile => profile.id === audienceMode)?.label ?? 'Reader'} mode with ${matchedViewPreset?.label ?? 'Custom'} stack: ${themeLabel(theme)} theme, step ${step}, ${playbackLabel}, ${paperLens} lens, ${compareLabel}.${chapterLabel}${paperAnchorLabel}`,
      primaryReplaySummary,
      compareReplaySummary,
    ].filter(Boolean).join(' ')
  }, [
    activeChapterRoute,
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

  const activeAudienceBrief = useMemo(() => {
    if (audienceMode === 'reviewer') {
      return {
        title: 'Reviewer brief',
        summary: 'Push on comparisons, assumptions, and provenance rather than reading the replay as a standalone narrative.',
        items: [
          'Check whether the foil scenario materially changes the interpretation or only the presentation.',
          'Inspect migration cost, delta, cutoff, and gamma before trusting the visual story.',
          'Use methods and compare postures to verify the paper is not overstating a single replay.',
        ],
      }
    }

    if (audienceMode === 'researcher') {
      return {
        title: 'Researcher brief',
        summary: 'Treat this as an analytical workspace: scrub manually, move across scenarios, and use the companion as a structured notebook.',
        items: [
          'Prefer step 1 or step 10 with autoplay off when tracing delicate slot changes.',
          'Use the paper lenses to move between explanation, evidence, and method discipline.',
          'Keep the published contract visible while deciding whether a deeper live simulation is worth running.',
        ],
      }
    }

    return {
      title: 'Reader brief',
      summary: 'Lead with visual evidence and let the interface carry the paper into a more interactive, accessible form.',
      items: [
        'Start in the published replay instead of a launcher or parameter form.',
        'Use scenario spotlights and saved views as authored entry points into the paper.',
        'Move into theory or comparison only after the core replay story is legible.',
      ],
    }
  }, [audienceMode])

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
            : 'Start with the map and concentration metrics, then trace how latency and liveness respond as slot progression unfolds.',
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
      ?? 'The published workspace opens on the checked-in replay so readers start from evidence instead of a launcher.'
  })()

  const resultSnapshotCards = useMemo<ResultSnapshotCard[]>(() => {
    const dominantRegion = viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId ?? 'Awaiting replay'
    const comparisonDetail = splitCompareActive && comparisonDataset
      ? comparisonViewerSnapshot
        ? `${comparisonDataset.evaluation} · Gini ${comparisonViewerSnapshot.currentGini != null ? formatNumber(comparisonViewerSnapshot.currentGini, 3) : 'N/A'}`
        : `${comparisonDataset.evaluation} is ready as the foil scenario.`
      : viewerSnapshot
        ? `Proposal ${formatOptionalMilliseconds(viewerSnapshot.currentProposalTime)} · MEV ${formatOptionalEth(viewerSnapshot.currentMev)}`
        : 'Liveness, latency, and MEV populate once the replay loads.'

    return [
      {
        label: 'Replay focus',
        value: viewerSnapshot ? `Slot ${viewerSnapshot.slotNumber.toLocaleString()}` : 'Loading',
        detail: viewerSnapshot
          ? `${viewerSnapshot.activeRegions.toLocaleString()} active regions are currently visible.`
          : 'The checked-in dataset is loading into the in-page viewer.',
      },
      {
        label: 'Leading region',
        value: dominantRegion,
        detail: viewerSnapshot?.dominantRegionShare != null
          ? `${formatPercentValue(viewerSnapshot.dominantRegionShare)} share at the current slot.`
          : 'Dominant region share appears once the replay posture is available.',
      },
      {
        label: 'Concentration',
        value: viewerSnapshot?.currentGini != null ? formatNumber(viewerSnapshot.currentGini, 3) : 'N/A',
        detail: viewerSnapshot?.currentHhi != null
          ? `HHI ${formatNumber(viewerSnapshot.currentHhi, 3)}`
          : 'Gini and HHI update as the replay advances.',
      },
      {
        label: splitCompareActive && comparisonDataset ? 'Comparison anchor' : 'Network outcome',
        value: splitCompareActive && comparisonDataset
          ? comparisonViewerSnapshot
            ? `Slot ${comparisonViewerSnapshot.slotNumber.toLocaleString()}`
            : comparisonDataset.paradigm
          : formatPercentValue(viewerSnapshot?.currentLiveness),
        detail: comparisonDetail,
      },
    ]
  }, [comparisonDataset, comparisonViewerSnapshot, splitCompareActive, viewerSnapshot])

  const heroSnapshotCards = useMemo<ResultSnapshotCard[]>(() => {
    const dominantRegion = viewerSnapshot?.dominantRegionCity ?? viewerSnapshot?.dominantRegionId ?? 'Awaiting replay'
    const inquiryDetail = lastReplayAnswer?.answeredContext
      ?? promptLaunchers[0]?.prompt
      ?? activeAudienceBrief.summary

    return [
      {
        label: 'Published contract',
        value: selectedDataset ? `${selectedDataset.evaluation} · ${selectedDataset.paradigm}` : 'Awaiting scenario',
        detail: selectedDataset
          ? `${selectedDataset.result} is loaded as checked-in evidence rather than a fresh run.`
          : 'Choose a frozen published scenario to bring the replay in immediately.',
      },
      {
        label: 'Live posture',
        value: viewerSnapshot ? `Slot ${viewerSnapshot.slotNumber.toLocaleString()}` : 'Replay booting',
        detail: viewerSnapshot
          ? `${viewerSnapshot.activeRegions.toLocaleString()} active regions with ${dominantRegion} currently leading.`
          : 'The viewer binds to the selected published payload as soon as the page opens.',
      },
      {
        label: splitCompareActive && comparisonDataset ? 'Foil scenario' : 'Paper anchor',
        value: splitCompareActive && comparisonDataset
          ? `${comparisonDataset.evaluation} · ${comparisonDataset.paradigm}`
          : selectedPaperSection ? selectedPaperSection.number : 'No section',
        detail: splitCompareActive && comparisonDataset
          ? comparisonViewerSnapshot
            ? `${comparisonDataset.result} currently mirrors slot ${comparisonViewerSnapshot.slotNumber.toLocaleString()} in the comparison canvas.`
            : `${comparisonDataset.result} is ready as the side-by-side foil scenario.`
          : selectedPaperSection
            ? `${selectedPaperSection.title} keeps the replay tied to canonical paper language.`
            : 'Select a paper section to hold the replay and the prose together.',
      },
      {
        label: 'Inquiry state',
        value: lastReplayAnswer ? 'Replay answer ready' : assistantDraft.trim() ? 'Question drafted' : 'Prompt starters loaded',
        detail: inquiryDetail,
      },
    ]
  }, [
    activeAudienceBrief.summary,
    assistantDraft,
    comparisonDataset,
    comparisonViewerSnapshot,
    lastReplayAnswer,
    promptLaunchers,
    selectedDataset,
    selectedPaperSection,
    splitCompareActive,
    viewerSnapshot,
  ])

  const primaryCanvasAnnotations = useMemo<CanvasAnnotation[]>(() => {
    if (!selectedDataset) return []

    const liveSlotNote = viewerSnapshot
      ? {
          title: `Slot ${viewerSnapshot.slotNumber.toLocaleString()} of ${viewerSnapshot.totalSlots.toLocaleString()}`,
          body: `Dominant region ${viewerSnapshot.dominantRegionCity ?? viewerSnapshot.dominantRegionId ?? 'N/A'} with ${viewerSnapshot.dominantRegionShare != null ? `${formatNumber(viewerSnapshot.dominantRegionShare, 1)}%` : 'N/A'} share. Active regions ${viewerSnapshot.activeRegions.toLocaleString()}, gini ${viewerSnapshot.currentGini != null ? formatNumber(viewerSnapshot.currentGini, 3) : 'N/A'}, liveness ${viewerSnapshot.currentLiveness != null ? `${formatNumber(viewerSnapshot.currentLiveness, 1)}%` : 'N/A'}, proposal time ${viewerSnapshot.currentProposalTime != null ? `${formatNumber(viewerSnapshot.currentProposalTime, 1)} ms` : 'N/A'}, MEV ${viewerSnapshot.currentMev != null ? `${formatNumber(viewerSnapshot.currentMev, 4)} ETH` : 'N/A'}.`,
        }
      : {
          title: 'Live replay',
          body: 'Once the replay loads, these overlays will speak to the exact slot on screen instead of staying generic.',
        }

    const compareDeltaNote = splitCompareActive && viewerSnapshot && comparisonViewerSnapshot
      ? {
          title: 'Current divergence',
          body: `At this posture the primary replay shows ${viewerSnapshot.activeRegions.toLocaleString()} active regions versus ${comparisonViewerSnapshot.activeRegions.toLocaleString()} in the comparison replay. Gini ${viewerSnapshot.currentGini != null ? formatNumber(viewerSnapshot.currentGini, 3) : 'N/A'} versus ${comparisonViewerSnapshot.currentGini != null ? formatNumber(comparisonViewerSnapshot.currentGini, 3) : 'N/A'}, liveness ${viewerSnapshot.currentLiveness != null ? `${formatNumber(viewerSnapshot.currentLiveness, 1)}%` : 'N/A'} versus ${comparisonViewerSnapshot.currentLiveness != null ? `${formatNumber(comparisonViewerSnapshot.currentLiveness, 1)}%` : 'N/A'}, proposal time ${viewerSnapshot.currentProposalTime != null ? `${formatNumber(viewerSnapshot.currentProposalTime, 1)} ms` : 'N/A'} versus ${comparisonViewerSnapshot.currentProposalTime != null ? `${formatNumber(comparisonViewerSnapshot.currentProposalTime, 1)} ms` : 'N/A'}.`,
        }
      : null

    return [
      {
        title: paperLens === 'theory' ? 'Theory read' : paperLens === 'methods' ? 'Methods read' : 'Start here',
        body: paperLens === 'theory'
          ? `Use this replay to explain how cost ${formatEth(selectedMetadata?.cost)}, delta ${formatMilliseconds(selectedMetadata?.delta)}, cutoff ${formatMilliseconds(selectedMetadata?.cutoff)}, and gamma ${typeof selectedMetadata?.gamma === 'number' ? formatNumber(selectedMetadata.gamma, 4) : 'N/A'} shape the trajectory.`
          : paperLens === 'methods'
            ? 'Read this as a checked-in published payload. The selector rail changes the evidence contract, not a full-scale rerun.'
            : 'Begin with the geography and concentration plots, then trace latency and liveness as the slot progression advances.',
      },
      liveSlotNote,
      compareDeltaNote,
      {
        title: 'View posture',
        body: currentViewSummary,
      },
      {
        title: activeAudienceBrief.title,
        body: activeAudienceBrief.summary,
      },
    ].filter(isCanvasAnnotation)
  }, [activeAudienceBrief, comparisonViewerSnapshot, currentViewSummary, paperLens, selectedDataset, selectedMetadata, splitCompareActive, viewerSnapshot])

  const comparisonCanvasAnnotations = useMemo<CanvasAnnotation[]>(() => {
    if (!comparisonDataset) return []

    const comparisonReplayNote = comparisonViewerSnapshot
      ? {
          title: `Comparison slot ${comparisonViewerSnapshot.slotNumber.toLocaleString()} of ${comparisonViewerSnapshot.totalSlots.toLocaleString()}`,
          body: `Dominant region ${comparisonViewerSnapshot.dominantRegionCity ?? comparisonViewerSnapshot.dominantRegionId ?? 'N/A'} with ${comparisonViewerSnapshot.dominantRegionShare != null ? `${formatNumber(comparisonViewerSnapshot.dominantRegionShare, 1)}%` : 'N/A'} share. Gini ${comparisonViewerSnapshot.currentGini != null ? formatNumber(comparisonViewerSnapshot.currentGini, 3) : 'N/A'}, liveness ${comparisonViewerSnapshot.currentLiveness != null ? `${formatNumber(comparisonViewerSnapshot.currentLiveness, 1)}%` : 'N/A'}, proposal time ${comparisonViewerSnapshot.currentProposalTime != null ? `${formatNumber(comparisonViewerSnapshot.currentProposalTime, 1)} ms` : 'N/A'}.`,
        }
      : null

    return [
      {
        title: 'Foil scenario',
        body: comparisonViewerSnapshot
          ? `${comparisonDataset.evaluation} / ${comparisonDataset.paradigm} is currently at slot ${comparisonViewerSnapshot.slotNumber.toLocaleString()} of ${comparisonViewerSnapshot.totalSlots.toLocaleString()}, with ${comparisonViewerSnapshot.activeRegions.toLocaleString()} active regions and dominant region ${comparisonViewerSnapshot.dominantRegionCity ?? comparisonViewerSnapshot.dominantRegionId ?? 'N/A'}.`
          : `${comparisonDataset.evaluation} / ${comparisonDataset.paradigm} gives the comparison anchor. Use it to ask what changes materially versus what remains stable.`,
      },
      comparisonReplayNote,
      {
        title: 'Compare prompt',
        body: comparisonNarrative,
      },
    ].filter(isCanvasAnnotation)
  }, [comparisonDataset, comparisonNarrative, comparisonViewerSnapshot])

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
    comparisonViewerSnapshot?.slotIndex,
    resetReplayPublishMutation,
    selectedDataset?.path,
    selectedPaperSection?.id,
    viewerSnapshot?.slotIndex,
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

    params.set('tab', 'results')
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

    if (typeof viewerSnapshot?.slotIndex === 'number' && viewerSnapshot.slotIndex > 0) {
      params.set('slot', String(viewerSnapshot.slotIndex))
    } else {
      params.delete('slot')
    }

    if (splitCompareActive && typeof comparisonViewerSnapshot?.slotIndex === 'number' && comparisonViewerSnapshot.slotIndex > 0) {
      params.set('compareSlot', String(comparisonViewerSnapshot.slotIndex))
    } else {
      params.delete('compareSlot')
    }

    window.history.replaceState({}, '', `${url.pathname}?${params.toString()}${url.hash}`)
  }, [
    assistantDraft,
    audienceMode,
    autoplay,
    comparePath,
    comparisonDataset?.path,
    comparisonViewerSnapshot?.slotIndex,
    paperLens,
    selectedPaperSection?.id,
    selectedDataset?.path,
    selectedEvaluation,
    selectedParadigm,
    selectedResult,
    splitCompareActive,
    step,
    theme,
    viewerSnapshot?.slotIndex,
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
          Loading frozen research launcher…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="lab-stage overflow-hidden p-0">
        <div className="grid xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="p-6 md:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-text-primary">
              Published Research Demo
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-text-primary">
              Interactive paper workspace for geographical decentralization
            </h2>
            <div className="mt-4 max-w-4xl space-y-3 text-sm leading-6 text-muted">
              {introParagraphs.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="lab-chip">Instant preview</span>
              <span className="lab-chip">Configurable simulator depth</span>
              <span className="lab-chip">Theory-ready paper companion</span>
            </div>

            <div className="mt-8">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Use this workspace</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <button
                  onClick={() => {
                    applyAudienceMode('reader')
                    setPaperLens('evidence')
                  }}
                  className="rounded-2xl border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover"
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">1. Read the scenario</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">Set an evidence-first posture</div>
                  <div className="mt-2 text-xs leading-5 text-muted">
                    Keep the published replay on screen and start with geography, concentration, and liveness before asking for interpretation.
                  </div>
                </button>

                <button
                  onClick={() => {
                    applyAudienceMode('reviewer')
                    if (comparisonDataset) {
                      handlePrimeReplayQuestion(
                        viewerSnapshot
                          ? `Compare the active replay at slot ${viewerSnapshot.slotNumber.toLocaleString()} against ${comparisonDataset.paradigm} and tell me what changes materially.`
                          : `What is materially different between the active replay and ${comparisonDataset.paradigm}?`,
                        true,
                      )
                    }
                  }}
                  className="rounded-2xl border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover"
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">2. Test a comparison</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">Open the foil and ask one grounded question</div>
                  <div className="mt-2 text-xs leading-5 text-muted">
                    This turns on the comparison posture and, when a foil is available, immediately asks the replay guide to explain the material delta.
                  </div>
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
                  className="rounded-2xl border border-border-subtle bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-hover"
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">3. Trace the mechanism</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">Bind the replay to the paper framing</div>
                  <div className="mt-2 text-xs leading-5 text-muted">
                    Shift into the theory lens and ask a section-grounded question so the answer stays attached to the canonical argument.
                  </div>
                </button>

                <button
                  onClick={onOpenExactLab}
                  disabled={!onOpenExactLab}
                  className={cn(
                    'rounded-2xl border px-4 py-4 text-left transition-all',
                    onOpenExactLab
                      ? 'border-border-subtle bg-white hover:-translate-y-0.5 hover:border-border-hover'
                      : 'cursor-not-allowed border-border-subtle bg-surface-active text-muted',
                  )}
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">4. Reproduce it exactly</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">Jump to the exact-run lab</div>
                  <div className="mt-2 text-xs leading-5 text-muted">
                    Use the published replay to orient yourself first, then move into the exact engine only when you need a fresh bounded run.
                  </div>
                </button>
              </div>

              <div className="mt-3 text-xs leading-5 text-muted">
                These controls adjust the current workspace. They do not generate a new page or silently rerun the full simulation.
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {heroSnapshotCards.map(card => (
                  <div key={card.label} className="rounded-2xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{card.label}</div>
                    <div className="mt-2 text-sm font-medium text-text-primary">{card.value}</div>
                    <div className="mt-2 text-xs leading-5 text-muted">{card.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeViewer && (
        <section
          ref={viewerRef}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1.04fr)_360px]"
        >
          <div className="space-y-4">
            <div className="lab-stage overflow-hidden p-0">
              <div className="border-b border-border-subtle bg-[#FAFAF8] px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs text-muted mb-1">Live published canvas</div>
                    <div className="text-sm text-text-primary">
                      The precomputed result is rendered immediately. Change the dataset or playback controls and the canvas rebinds without sending the reader back through a launcher flow.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="lab-chip">{activeViewer.dataset.evaluation}</span>
                    <span className="lab-chip">{activeViewer.dataset.paradigm}</span>
                    <span className="lab-chip">{activeViewer.dataset.result}</span>
                    <span className="lab-chip">{audienceProfiles.find(profile => profile.id === audienceMode)?.label ?? 'Reader'} mode</span>
                    {activeChapterRoute ? (
                      <span className="lab-chip">{activeChapterRoute.label}</span>
                    ) : null}
                    <span className="lab-chip">{matchedViewPreset?.label ?? 'Custom'} preset</span>
                    <span className="lab-chip">{themeLabel(theme)} theme</span>
                    <span className="lab-chip">step {step}</span>
                  </div>
                </div>
              </div>

              {splitCompareActive && comparisonDataset ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-accent bg-white px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Primary published replay</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        {activeViewer.dataset.evaluation} · {activeViewer.dataset.paradigm}
                      </div>
                      <div className="mt-1 text-xs text-muted">{activeViewer.dataset.result}</div>
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-col gap-2 2xl:flex-row">
                        {primaryCanvasAnnotations.map(note => (
                          <div key={note.title} className="max-w-md rounded-2xl border border-white/15 bg-[#0F172A]/80 px-4 py-3 text-white shadow-xl backdrop-blur-md">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-300">{note.title}</div>
                            <div className="mt-2 text-xs leading-5 text-white/90">{note.body}</div>
                          </div>
                        ))}
                      </div>
                      <PublishedDatasetViewer
                        key={`primary:${activeViewer.dataset.path}:${theme}:${step}:${autoplay ? 'auto' : 'manual'}:${initialWorkspaceState.focusSlot ?? 0}`}
                        viewerBaseUrl={viewerBaseUrl}
                        dataset={activeViewer.dataset}
                        initialSettings={activeViewer.settings}
                        initialSlotIndex={initialWorkspaceState.focusSlot}
                        onStateChange={setViewerSnapshot}
                        annotationNotes={primarySlotNotes}
                        anchorScope="primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Comparison published replay</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">
                        {comparisonDataset.evaluation} · {comparisonDataset.paradigm}
                      </div>
                      <div className="mt-1 text-xs text-muted">{comparisonDataset.result}</div>
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-col gap-2">
                        {comparisonCanvasAnnotations.map(note => (
                          <div key={note.title} className="max-w-md rounded-2xl border border-white/15 bg-[#0F172A]/78 px-4 py-3 text-white shadow-xl backdrop-blur-md">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-300">{note.title}</div>
                            <div className="mt-2 text-xs leading-5 text-white/90">{note.body}</div>
                          </div>
                        ))}
                      </div>
                  <PublishedDatasetViewer
                    key={`compare:${comparisonDataset.path}:${theme}:${step}:${autoplay ? 'auto' : 'manual'}:${initialWorkspaceState.compareFocusSlot ?? 0}`}
                    viewerBaseUrl={viewerBaseUrl}
                    dataset={comparisonDataset}
                    initialSettings={activeViewer.settings}
                    initialSlotIndex={initialWorkspaceState.compareFocusSlot}
                    onStateChange={setComparisonViewerSnapshot}
                    annotationNotes={comparisonSlotNotes}
                    anchorScope="comparison"
                  />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-col gap-2 2xl:flex-row">
                    {primaryCanvasAnnotations.map(note => (
                      <div key={note.title} className="max-w-md rounded-2xl border border-white/15 bg-[#0F172A]/80 px-4 py-3 text-white shadow-xl backdrop-blur-md">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-300">{note.title}</div>
                        <div className="mt-2 text-xs leading-5 text-white/90">{note.body}</div>
                      </div>
                    ))}
                  </div>
                  <PublishedDatasetViewer
                    key={`${activeViewer.dataset.path}:${theme}:${step}:${autoplay ? 'auto' : 'manual'}:${initialWorkspaceState.focusSlot ?? 0}`}
                    viewerBaseUrl={viewerBaseUrl}
                    dataset={activeViewer.dataset}
                    initialSettings={activeViewer.settings}
                    initialSlotIndex={initialWorkspaceState.focusSlot}
                    onStateChange={setViewerSnapshot}
                    annotationNotes={primarySlotNotes}
                    anchorScope="primary"
                  />
                </div>
              )}
            </div>

            <div className="lab-stage overflow-hidden p-0">
              <div className="grid gap-0 xl:grid-cols-[minmax(0,1.08fr)_360px]">
                <div className="border-b border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.78))] px-5 py-5 xl:border-b-0 xl:border-r">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
                    {lastReplayAnswer ? 'Replay-backed conclusion' : 'Published findings board'}
                  </div>
                  <div className="mt-3 max-w-3xl text-lg font-semibold leading-8 text-text-primary">
                    {immediateResultSummary}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                    {selectedPaperSection ? <span className="lab-chip">{selectedPaperSection.number} {selectedPaperSection.title}</span> : null}
                    {viewerSnapshot ? <span className="lab-chip">slot {viewerSnapshot.slotNumber}</span> : null}
                    {splitCompareActive && comparisonDataset ? <span className="lab-chip">compare {comparisonDataset.paradigm}</span> : null}
                    <span className="lab-chip">{paperLens} lens</span>
                  </div>
                  {promptLaunchers.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {promptLaunchers.slice(0, 3).map(item => (
                        <button
                          key={`findings-${item.label}`}
                          onClick={() => handlePrimeReplayQuestion(item.prompt, true)}
                          className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-all hover:-translate-y-0.5 hover:border-border-hover"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 bg-white px-5 py-5">
                  <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Current posture</div>
                    <div className="mt-2 text-sm leading-6 text-text-primary">{currentViewSummary}</div>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">
                      {splitCompareActive && comparisonDataset ? 'Comparison read' : 'Canonical paper anchor'}
                    </div>
                    <div className="mt-2 text-sm font-medium text-text-primary">
                      {splitCompareActive && comparisonDataset
                        ? `${comparisonDataset.evaluation} · ${comparisonDataset.paradigm}`
                        : selectedPaperSection ? `${selectedPaperSection.number} ${selectedPaperSection.title}` : 'No section selected'}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted">
                      {splitCompareActive && comparisonDataset
                        ? comparisonNarrative
                        : selectedPaperSection?.description ?? 'Select a paper section to keep the replay interpretation tied to the canonical text.'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Why it matters now</div>
                    <div className="mt-2 text-xs leading-5 text-muted">{activeAudienceBrief.summary}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-subtle px-5 py-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {resultSnapshotCards.map((card, index) => (
                    <div
                      key={card.label}
                      className={cn(
                        'rounded-[1.15rem] border px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]',
                        index === 0
                          ? 'border-accent/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.88))]'
                          : 'border-border-subtle bg-white',
                      )}
                    >
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{card.label}</div>
                      <div className="mt-2 text-sm font-medium text-text-primary">{card.value}</div>
                      <div className="mt-2 text-xs leading-5 text-muted">{card.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="lab-stage p-5">
              <div className="text-xs text-muted mb-1">Scenario spotlights</div>
              <div className="text-sm text-text-primary">
                Switch the live canvas from the right rail instead of starting from a launcher.
              </div>
              <div className="mt-4 grid gap-2">
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
                          : 'border-border-subtle bg-[#FAFAF8] hover:border-border-hover hover:bg-white',
                      )}
                    >
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-text-faint">
                        <span>{entry.evaluation}</span>
                        <span>{entry.paradigm}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-text-primary">{entry.result}</div>
                      <div className="mt-2 text-xs leading-5 text-muted">
                        {entry.metadata?.description ?? 'Published scenario ready for replay inside the paper workspace.'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="lab-stage p-5">
              <div className="text-xs text-muted mb-1">Quick posture</div>
              <div className="text-sm text-text-primary">
                Adjust the reading mode while keeping the result on screen.
              </div>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Audience</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  {audienceProfiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => applyAudienceMode(profile.id)}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-left transition-colors',
                        audienceMode === profile.id
                          ? 'border-accent bg-white'
                          : 'border-border-subtle bg-[#FAFAF8] hover:border-border-hover hover:bg-white',
                      )}
                    >
                      <div className="text-xs font-medium text-text-primary">{profile.label}</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted">{profile.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Presets</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {viewPresets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => applyViewPreset(preset.id)}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-left transition-colors',
                        matchedViewPreset?.id === preset.id
                          ? 'border-accent bg-white'
                          : 'border-border-subtle bg-[#FAFAF8] hover:border-border-hover hover:bg-white',
                      )}
                    >
                      <div className="text-xs font-medium text-text-primary">{preset.label}</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Lens</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {paperLenses.map(lens => (
                    <button
                      key={lens.id}
                      onClick={() => setPaperLens(lens.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        paperLens === lens.id
                          ? 'border-accent bg-white text-accent'
                          : 'border-border-subtle bg-white text-text-primary hover:border-border-hover',
                      )}
                    >
                      {lens.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lab-stage p-5">
              <div className="text-xs text-muted mb-1">Selection anchor</div>
              <div className="text-sm text-text-primary">
                {selectedDataset ? `${selectedDataset.evaluation} · ${selectedDataset.paradigm}` : 'Awaiting dataset'}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted">
                {selectedDataset?.metadata?.description ?? 'Choose a published scenario to keep the replay anchored to a checked-in result.'}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                <span className="lab-chip">{themeLabel(theme)} theme</span>
                <span className="lab-chip">step {step}</span>
                <span className="lab-chip">{autoplay ? 'Autoplay on' : 'Manual scrub'}</span>
                {selectedPaperSection ? <span className="lab-chip">{selectedPaperSection.number}</span> : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  onClick={handleFillDemoValues}
                  className="rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                >
                  Load reference view
                </button>
                <button
                  onClick={() => void handleCopyShareUrl()}
                  className="rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                >
                  Copy share link
                </button>
                <button
                  onClick={() => applyViewPreset('compare')}
                  className="rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                >
                  Activate split compare
                </button>
                <a
                  href={paperSectionUrl || undefined}
                  className={cn(
                    'rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-2 text-center text-xs font-medium text-text-primary transition-colors hover:border-border-hover',
                    !paperSectionUrl && 'pointer-events-none opacity-60',
                  )}
                >
                  Open paper section
                </a>
              </div>

              <div className="mt-4 rounded-xl border border-border-subtle bg-white px-4 py-4 text-xs leading-5 text-muted">
                New experiments still live on the exact-run surface. This rail stays tied to the published, precomputed evidence.
              </div>
            </div>
          </aside>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <div className="lab-stage p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-xs text-muted mb-1">Scenario selector</div>
                <div className="text-sm text-text-primary">
                  Switch among frozen published scenarios without leaving the main canvas.
                </div>
              </div>
              <button
                onClick={handleFillDemoValues}
                className="text-xs text-muted transition-colors hover:text-text-primary"
              >
                Load reference view
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">Dataset</label>
                <select
                  value={selectedEvaluation}
                  onChange={event => setSelectedEvaluation(event.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                >
                  {evaluationOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Block building</label>
                <div className="grid grid-cols-2 gap-2">
                  {paradigmOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => setSelectedParadigm(option)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        selectedParadigm === option
                          ? 'border-accent bg-white text-accent'
                          : 'border-border-subtle bg-white text-text-primary hover:border-border-hover',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Result</label>
                <select
                  value={selectedResult}
                  onChange={event => setSelectedResult(event.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                >
                  {resultOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Dataset path</div>
              <div className="mt-2 break-all text-sm font-medium text-text-primary">
                {selectedDataset?.path ?? 'Choose a dataset'}
              </div>
              <div className="mt-2 text-xs text-muted">
                Switching Local versus External changes which published scenario you are reading. It does not change the exact-run engine.
              </div>
            </div>
          </div>

          <div className="lab-stage p-5">
            <div className="text-xs text-muted mb-1">View settings</div>
            <div className="text-sm text-text-primary mb-4">
              These settings keep the replay, reading lens, question drafting, and comparison posture aligned.
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted mb-1.5 block">Audience mode</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {audienceProfiles.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => applyAudienceMode(profile.id)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-left transition-colors',
                      audienceMode === profile.id
                        ? 'border-accent bg-white'
                        : 'border-border-subtle bg-[#FAFAF8] hover:border-border-hover hover:bg-white',
                    )}
                  >
                    <div className="text-xs font-medium text-text-primary">{profile.label}</div>
                    <div className="mt-1 text-[11px] leading-5 text-muted">{profile.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted mb-1.5 block">Presets</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {viewPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyViewPreset(preset.id)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-left transition-colors',
                      matchedViewPreset?.id === preset.id
                        ? 'border-accent bg-white'
                        : 'border-border-subtle bg-[#FAFAF8] hover:border-border-hover hover:bg-white',
                    )}
                  >
                    <div className="text-xs font-medium text-text-primary">{preset.label}</div>
                    <div className="mt-1 text-[11px] leading-5 text-muted">{preset.description}</div>
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
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
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
                  className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
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
                          : 'border-border-subtle bg-white text-text-primary hover:border-border-hover',
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
                          : 'border-border-subtle bg-white text-text-primary hover:border-border-hover',
                      )}
                    >
                      {lens.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border-subtle bg-white px-4 py-3">
              <div className="text-xs text-text-faint">Current view stack</div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {matchedViewPreset?.label ?? 'Custom'} preset
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                <span className="lab-chip">{audienceProfiles.find(profile => profile.id === audienceMode)?.label ?? 'Reader'} mode</span>
                {activeChapterRoute ? (
                  <span className="lab-chip">{activeChapterRoute.label}</span>
                ) : null}
                <span className="lab-chip">{themeLabel(theme)} theme</span>
                <span className="lab-chip">step {step}</span>
                <span className="lab-chip">{autoplay ? 'Autoplay on' : 'Manual scrub'}</span>
                <span className="lab-chip">{paperLens} lens</span>
                {selectedPaperSection ? (
                  <span className="lab-chip">{selectedPaperSection.number}</span>
                ) : null}
                {comparisonDataset ? (
                  <span className="lab-chip">vs {comparisonDataset.evaluation}</span>
                ) : null}
              </div>
              <div className="mt-3 text-xs leading-5 text-muted">
                {currentViewSummary}
              </div>
              <div className="mt-3 break-all text-sm font-medium text-text-primary">
                {selectedDataset?.path ?? 'Choose a dataset'}
              </div>
              <div className="mt-2 text-xs text-muted">
                Primary path: stay in-app. Standalone exists only for parity with the frozen legacy panel set.
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
              <div className="text-xs text-text-faint">Share this reading view</div>
              <div className="mt-2 text-xs leading-5 text-muted">
                The link preserves the scenario, audience mode, reading lens, replay question, paper anchor, and current slot posture.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => void handleCopyShareUrl()}
                  className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                >
                  {assistantDraft.trim() ? 'Copy replay query link' : 'Copy share link'}
                </button>
                <a
                  href={shareUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover',
                    !shareUrl && 'pointer-events-none opacity-60',
                  )}
                >
                  Open linked view
                </a>
              </div>
              <div className="mt-3 break-all text-[11px] leading-5 text-muted">
                {shareUrl || 'Share link will appear once the workspace state is hydrated.'}
              </div>
              {shareStatus !== 'idle' ? (
                <div className="mt-2 text-xs text-text-primary">
                  {shareStatus === 'copied' ? 'Share link copied.' : 'Clipboard copy failed in this environment.'}
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-border-subtle bg-white px-4 py-4">
              <div className="text-xs text-text-faint">Saved views</div>
              <div className="mt-3 grid gap-3">
                {savedWorkspaceViews.map(view => (
                  <div key={view.id} className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-medium text-text-primary">{view.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted">{view.note}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => applyWorkspacePose(view.config)}
                          className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => void handleCopyShareUrl(view.url)}
                          className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                        >
                          Copy URL
                        </button>
                        <a
                          href={view.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-border-subtle pt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Entry point chips</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleCopyShareUrl()}
                    className="rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                  >
                    Export current state
                  </button>
                  {savedWorkspaceViews.map(view => (
                    <a
                      key={`${view.id}-chip`}
                      href={view.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                    >
                      {view.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border-subtle bg-white px-4 py-4">
              <div className="text-xs text-text-faint">Paper chapters</div>
              <div className="mt-2 text-xs leading-5 text-muted">
                These are authored reading routes. They should feel closer to paper sections than to generic dashboard presets.
              </div>
              <div className="mt-3 space-y-3">
                {chapterRoutes.map(chapter => (
                  <div key={chapter.id} className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-medium text-text-primary">{chapter.label}</div>
                        <div className="mt-1 text-xs leading-5 text-muted">{chapter.note}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => applyWorkspacePose(chapter.config)}
                          className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                        >
                          Open chapter
                        </button>
                        <button
                          onClick={() => void handleCopyShareUrl(chapter.url)}
                          className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                        >
                          Copy link
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </aside>

        <div className="space-y-6">
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="lab-stage p-5">
              <div className="text-xs text-muted mb-1">Scenario summary</div>
              <div className="text-sm text-text-primary">
                {selectedDataset?.metadata?.description ?? 'Select a dataset to see the published scenario description.'}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-muted sm:grid-cols-3">
                <div className="rounded-lg border border-border-subtle bg-white px-3 py-3">
                  <div className="text-text-faint">Validators</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {selectedDataset?.metadata?.v?.toLocaleString() ?? 'N/A'}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-white px-3 py-3">
                  <div className="text-text-faint">Migration cost</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {formatEth(selectedMetadata?.cost)}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-white px-3 py-3">
                  <div className="text-text-faint">Delta</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {formatMilliseconds(selectedMetadata?.delta)}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-white px-3 py-3">
                  <div className="text-text-faint">Cutoff</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {formatMilliseconds(selectedMetadata?.cutoff)}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-white px-3 py-3">
                  <div className="text-text-faint">Gamma</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {typeof selectedMetadata?.gamma === 'number'
                      ? formatNumber(selectedMetadata.gamma, 4)
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-white px-3 py-3">
                  <div className="text-text-faint">Source role</div>
                  <div className="mt-1 text-sm font-medium capitalize text-text-primary">
                    {selectedDataset?.sourceRole ?? 'N/A'}
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-border-subtle pt-5">
                <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{activePaperLens?.eyebrow}</div>
                  <div className="mt-2 text-sm font-medium text-text-primary">{activePaperLens?.title}</div>
                  <div className="mt-2 text-sm leading-6 text-text-primary">{activePaperLens?.body}</div>
                  <div className="mt-4 space-y-2">
                    {activePaperLens?.points.map(point => (
                      <div key={point} className="rounded-lg bg-[#FAFAF8] px-3 py-2 text-xs leading-5 text-muted">
                        {point}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div ref={inquiryRef} className="lab-stage overflow-hidden p-0">
                <div className="border-b border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-5 py-5">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Replay inquiry studio</div>
                  <div className="mt-2 text-sm leading-6 text-text-primary">
                    Use the replay already on screen as the source of truth, keep the question anchored to the paper, and ask the companion without dropping back into a separate workflow.
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                    <span className="lab-chip">{selectedDataset?.evaluation ?? 'No scenario'}</span>
                    <span className="lab-chip">{selectedDataset?.paradigm ?? 'No mode'}</span>
                    <span className="lab-chip">{selectedDataset?.result ?? 'No result'}</span>
                    <span className="lab-chip">{matchedViewPreset?.label ?? 'Custom'} preset</span>
                    <span className="lab-chip">{paperLens} lens</span>
                    {selectedPaperSection ? <span className="lab-chip">{selectedPaperSection.number} {selectedPaperSection.title}</span> : null}
                    {viewerSnapshot ? <span className="lab-chip">slot {viewerSnapshot.slotNumber}</span> : null}
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
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5',
                            assistantDraft.trim() === item.prompt.trim()
                              ? 'border-accent bg-white text-accent'
                              : 'border-border-subtle bg-white text-text-primary hover:border-border-hover',
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-[1.25rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.78))] px-4 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Draft question</div>
                          <div className="mt-2 text-sm leading-6 text-text-primary">
                            Write against what the replay is doing right now, then ask for explanation, challenge, or synthesis.
                          </div>
                        </div>
                        <div className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-[11px] font-medium text-text-primary">
                          {assistantDraft.trim() ? 'Draft ready' : 'Pick a prompt starter'}
                        </div>
                      </div>

                      <textarea
                        value={assistantDraft}
                        onChange={event => {
                          setAssistantDraft(event.target.value)
                          setPendingAutoReplayQuestion('')
                        }}
                        className="mt-4 min-h-[168px] w-full resize-none rounded-[1rem] border border-white/60 bg-white/78 px-4 py-4 text-sm leading-6 text-text-primary outline-none transition-colors focus:border-accent/25"
                        placeholder="Ask the paper about this published run..."
                      />

                      <div className="mt-4 flex flex-wrap gap-2">
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
                              ? 'bg-[#0F172A] text-white hover:-translate-y-0.5'
                              : 'cursor-not-allowed border border-border-subtle bg-surface-active text-muted',
                          )}
                        >
                          Ask replay companion
                        </button>
                        <button
                          onClick={handleFocusViewer}
                          className="rounded-full border border-border-subtle bg-white px-4 py-2 text-xs font-medium text-text-primary transition-all hover:-translate-y-0.5 hover:border-border-hover"
                        >
                          Back to live replay
                        </button>
                        <button
                          onClick={() => {
                            setAssistantDraft('')
                            setPendingAutoReplayQuestion('')
                          }}
                          className="rounded-full border border-border-subtle bg-white px-4 py-2 text-xs font-medium text-text-primary transition-all hover:-translate-y-0.5 hover:border-border-hover"
                        >
                          Clear draft
                        </button>
                      </div>
                    </div>

                    {selectedPaperSection ? (
                      <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Section evidence preview</div>
                            <div className="mt-2 text-sm font-medium text-text-primary">
                              {selectedPaperSection.number} {selectedPaperSection.title}
                            </div>
                            <div className="mt-2 text-xs leading-5 text-muted">
                              Keep theory and methods questions grounded in the same canonical paper section the replay companion receives.
                            </div>
                          </div>
                          <div className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-[11px] font-medium text-text-primary">
                            {paperSectionContext ? 'Paper context attached' : 'Paper context unavailable'}
                          </div>
                        </div>

                        {paperSectionPromptStarters.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {paperSectionPromptStarters.map(prompt => (
                              <button
                                key={prompt}
                                onClick={() => handlePrimeReplayQuestion(prompt)}
                                className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4">
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

                  <div className="space-y-4">
                    <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Active context</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                        <span className="lab-chip">{selectedDataset?.evaluation ?? 'No scenario'}</span>
                        <span className="lab-chip">{selectedDataset?.paradigm ?? 'No mode'}</span>
                        <span className="lab-chip">{selectedDataset?.result ?? 'No result'}</span>
                        <span className="lab-chip">{selectedDataset?.sourceRole ?? 'No source role'}</span>
                        {activeChapterRoute ? <span className="lab-chip">{activeChapterRoute.label}</span> : null}
                        <span className="lab-chip">{themeLabel(theme)} theme</span>
                        <span className="lab-chip">step {step}</span>
                        {splitCompareActive && comparisonDataset ? <span className="lab-chip">compare {comparisonDataset.paradigm}</span> : null}
                      </div>
                      <div className="mt-3 text-xs leading-5 text-muted">
                        Use this context to frame a reading, compare scenarios, or publish a public note against the exact replay state you are inspecting.
                      </div>
                    </div>

                    <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{activeAudienceBrief.title}</div>
                      <div className="mt-2 text-sm leading-6 text-text-primary">{activeAudienceBrief.summary}</div>
                      <div className="mt-4 space-y-2">
                        {activeAudienceBrief.items.map(item => (
                          <div key={item} className="rounded-lg border border-border-subtle bg-white px-3 py-3 text-xs leading-5 text-muted">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border-subtle bg-white px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Canonical paper anchor</div>
                          <div className="mt-2 text-sm font-medium text-text-primary">
                            {selectedPaperSection ? `${selectedPaperSection.number} ${selectedPaperSection.title}` : 'No paper section selected'}
                          </div>
                          <div className="mt-2 text-xs leading-5 text-muted">
                            {selectedPaperSection?.description ?? 'Choose a paper section to keep theory and methods questions tied to the canonical paper guide.'}
                          </div>
                        </div>

                        <a
                          href={paperSectionUrl || undefined}
                          className={cn(
                            'rounded-full border border-border-subtle bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover',
                            !paperSectionUrl && 'pointer-events-none opacity-60',
                          )}
                        >
                          Open paper section
                        </a>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {suggestedPaperSections.map(section => (
                          <button
                            key={section.id}
                            onClick={() => setPaperSectionId(section.id)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              selectedPaperSection?.id === section.id
                                ? 'border-accent bg-white text-accent'
                                : 'border-border-subtle bg-[#FAFAF8] text-text-primary hover:border-border-hover',
                            )}
                          >
                            {section.number} {section.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <PublishedReplayNotesPanel
                  dataset={selectedDataset}
                  comparisonDataset={splitCompareActive ? comparisonDataset : null}
                  viewerSnapshot={viewerSnapshot}
                  comparisonViewerSnapshot={splitCompareActive ? comparisonViewerSnapshot : null}
                  paperLens={paperLens}
                  audienceMode={audienceMode}
                />

                {replayPublishContextKey ? (
                  <ContributionComposer
                    key={replayPublishContextKey}
                    sourceLabel="Publish this replay-backed reading to the community surface"
                    defaultTitle={replayPublishTitle}
                    defaultTakeaway={replayPublishTakeaway}
                    helperText="The published note carries the current replay question, the selected paper section, and the active slot posture in its evidence bundle. Edit the title or takeaway so the public note reflects your own reading of the replay."
                    publishLabel="Publish replay note"
                    successLabel="Published replay note"
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
                ) : null}
              </div>

              <div className="lab-stage p-5">
                <div className="text-xs text-muted mb-1">Comparison desk</div>
                <div className="text-sm text-text-primary">
                  Put the active published replay beside another checked-in scenario so the paper can highlight tradeoffs instead of presenting one curve in isolation.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => applyViewPreset('compare')}
                    className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                  >
                    Activate split compare
                  </button>
                  <button
                    onClick={() => applyAudienceMode('reviewer')}
                    className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-hover"
                  >
                    Switch to reviewer mode
                  </button>
                </div>

                <div className="mt-4">
                  <label className="text-xs text-muted mb-1.5 block">Compare against</label>
                  <select
                    value={comparisonDataset?.path ?? ''}
                    onChange={event => setComparePath(event.target.value)}
                    className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                  >
                    {comparisonCandidates.map(entry => (
                      <option key={entry.path} value={entry.path}>
                        {entry.evaluation} · {entry.paradigm} · {entry.result}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-accent bg-white px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Active scenario</div>
                    <div className="mt-2 text-sm font-medium text-text-primary">
                      {selectedDataset ? `${selectedDataset.evaluation} · ${selectedDataset.paradigm}` : 'No scenario'}
                    </div>
                    <div className="mt-1 text-xs text-muted">{selectedDataset?.result ?? 'N/A'}</div>
                    <div className="mt-3 text-xs leading-5 text-muted">
                      {selectedMetadata?.description ?? 'Select a scenario to reveal its published description.'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Comparison scenario</div>
                    <div className="mt-2 text-sm font-medium text-text-primary">
                      {comparisonDataset ? `${comparisonDataset.evaluation} · ${comparisonDataset.paradigm}` : 'No comparison'}
                    </div>
                    <div className="mt-1 text-xs text-muted">{comparisonDataset?.result ?? 'N/A'}</div>
                    <div className="mt-3 text-xs leading-5 text-muted">
                      {comparisonDataset?.metadata?.description ?? 'Choose a second scenario to compare against the active replay.'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {comparisonMetrics.map(metric => {
                    const currentValue = metric.current
                    const compareValue = metric.compare
                    const hasBoth = typeof currentValue === 'number' && typeof compareValue === 'number'
                    const difference = hasBoth ? currentValue - compareValue : null
                    const differenceLabel = difference == null
                      ? 'No delta'
                      : difference > 0
                        ? 'Higher than comparison'
                        : difference < 0
                          ? 'Lower than comparison'
                          : 'Matches comparison'

                    return (
                      <div key={metric.label} className="rounded-xl border border-border-subtle bg-white px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{metric.label}</div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <div className="text-xs text-muted">Active</div>
                            <div className="mt-1 text-sm font-medium text-text-primary">{metric.format(currentValue)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted">Compare</div>
                            <div className="mt-1 text-sm font-medium text-text-primary">{metric.format(compareValue)}</div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-muted">{differenceLabel}</div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">Comparison readout</div>
                  <div className="mt-2 text-sm leading-6 text-text-primary">{comparisonNarrative}</div>
                </div>
              </div>

              <div className="lab-stage p-5">
                <div className="text-xs text-muted mb-1">Actions</div>
                <div className="text-sm text-text-primary">
                  Stay in the embedded preview by default. Drop into standalone or raw artifacts only when the workflow calls for it.
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={handleFocusViewer}
                    disabled={!selectedDataset}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Jump to live preview
                  </button>
                  <button
                    onClick={handleLaunchViewer}
                    disabled={!selectedDataset}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Open standalone viewer
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                  <a
                    href={datasetUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'inline-flex items-center justify-center rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover',
                      !datasetUrl && 'pointer-events-none opacity-60',
                    )}
                  >
                    Download data.json
                  </a>
                  <button
                    onClick={() => setShowConfig(current => !current)}
                    disabled={!selectionConfig}
                    className="inline-flex items-center justify-center rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {showConfig ? 'Hide config' : 'View config'}
                  </button>
                  <a
                    href={sourceUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'inline-flex items-center justify-center rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover',
                      !sourceUrl && 'pointer-events-none opacity-60',
                    )}
                  >
                    View source
                  </a>
                  <a
                    href={`${viewerBaseUrl}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover sm:col-span-2"
                  >
                    Open Original Published Launcher
                  </a>
                </div>

                {showConfig && selectionConfig && (
                  <div className="mt-4 rounded-xl border border-border-subtle bg-[#FAFAF8] p-4">
                    <div className="text-xs text-muted mb-2">Selection config</div>
                    <pre className="overflow-x-auto text-xs text-text-primary">{selectionConfig}</pre>
                  </div>
                )}
              </div>

              <div className="lab-stage p-5">
                <div className="text-xs text-muted mb-1">{activeAudienceBrief.title}</div>
                <div className="text-sm text-text-primary">
                  {activeAudienceBrief.summary}
                </div>
                <div className="mt-4 space-y-3">
                  {activeAudienceBrief.items.map(item => (
                    <div key={item} className="rounded-xl border border-border-subtle bg-white px-4 py-4 text-sm leading-6 text-text-primary">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lab-stage p-5">
                <div className="text-xs text-muted mb-1">Paper note rail</div>
                <div className="text-sm text-text-primary">
                  These notes change with the selected scenario and lens, so the surrounding paper can stay synchronized with the evidence surface.
                </div>
                <div className="mt-4 space-y-3">
                  {paperNotes.map(note => (
                    <div key={note.title} className="rounded-xl border border-border-subtle bg-[#FAFAF8] px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-text-faint">{note.title}</div>
                      <div className="mt-2 text-sm leading-6 text-text-primary">{note.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
