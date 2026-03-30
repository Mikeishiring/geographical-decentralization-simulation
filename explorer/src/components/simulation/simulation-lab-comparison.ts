import {
  clampSlotIndex,
  type AnalyticsCompareMode,
  type AnalyticsDeckView,
  type AnalyticsQueryMetric,
  type PublishedAnalyticsPayload,
} from './simulation-analytics'
import type {
  NumericCatalogOption,
  PublishedDatasetRecommendation,
  ResearchCatalog,
  ResearchDatasetEntry,
  SurfaceMode,
} from './simulation-lab-types'
import type { SimulationConfig } from '../../lib/simulation-api'

export async function fetchResearchCatalog(catalogScriptUrl: string): Promise<ResearchCatalog> {
  const response = await fetch(catalogScriptUrl, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error('Failed to load the published research catalog for exact-run comparison.')
  }

  const scriptText = await response.text()
  if (scriptText.startsWith('version https://git-lfs')) {
    throw new Error(
      'The published research catalog is still a Git LFS pointer. The deployment needs git-lfs installed so the frozen datasets can be loaded for comparison.',
    )
  }

  try {
    const sandbox = {} as { RESEARCH_CATALOG?: ResearchCatalog }
    const catalog = Function('window', `${scriptText}; return window.RESEARCH_CATALOG;`)(sandbox) as ResearchCatalog | undefined
    if (!catalog || !Array.isArray(catalog.datasets)) {
      throw new Error('The published research catalog did not expose a dataset list.')
    }
    return catalog
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Unable to parse the published research catalog for exact-run comparison.',
    )
  }
}

export async function fetchPublishedAnalyticsPayload(
  viewerBaseUrl: string,
  datasetPath: string,
): Promise<PublishedAnalyticsPayload> {
  const normalizedBase = viewerBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${normalizedBase}/${datasetPath}`, { cache: 'force-cache' })
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

function approximatelyEqual(left: number, right: number, epsilon = 0.0002): boolean {
  return Math.abs(left - right) <= epsilon
}

function selectNearestCatalogOption(
  value: number,
  options: readonly NumericCatalogOption[],
): NumericCatalogOption {
  return options.reduce((best, option) => (
    Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best
  ))
}

function resolvePublishedParadigm(paradigm: SimulationConfig['paradigm']): ResearchDatasetEntry['paradigm'] {
  return paradigm === 'SSP' ? 'External' : 'Local'
}

export function formatPublishedDatasetLabel(dataset: ResearchDatasetEntry): string {
  return `${dataset.evaluation} · ${dataset.paradigm} · ${dataset.result}`
}

export function recommendPublishedComparisonDataset(
  config: SimulationConfig,
  datasets: readonly ResearchDatasetEntry[],
): PublishedDatasetRecommendation | null {
  if (datasets.length === 0) return null

  const baselineCostOptions: readonly NumericCatalogOption[] = [
    { value: 0, label: 'cost_0.0' },
    { value: 0.001, label: 'cost_0.001' },
    { value: 0.002, label: 'cost_0.002' },
    { value: 0.003, label: 'cost_0.003' },
  ]
  const se2CostOptions: readonly NumericCatalogOption[] = [
    { value: 0, label: 'cost_0.0' },
    { value: 0.002, label: 'cost_0.002' },
  ]
  const gammaOptions: readonly NumericCatalogOption[] = [
    { value: 0.3333, label: 'gamma_0.3333' },
    { value: 0.5, label: 'gamma_0.5' },
    { value: 0.6667, label: 'gamma_0.6667' },
    { value: 0.8, label: 'gamma_0.8' },
  ]

  const targetParadigm = resolvePublishedParadigm(config.paradigm)
  const matchingParadigmDatasets = datasets.filter(dataset => dataset.paradigm === targetParadigm)
  const searchSpace = matchingParadigmDatasets.length > 0 ? matchingParadigmDatasets : datasets

  let targetEvaluation = 'Baseline'
  let targetResult = selectNearestCatalogOption(config.migrationCost, baselineCostOptions).label
  let reason = config.validators === 1000 && config.slots === 10000
    ? 'This exact run matches a checked-in paper scenario family.'
    : 'This is the nearest frozen paper scenario for the family your exact run is exploring.'

  if (approximatelyEqual(config.slotTime, 6)) {
    targetEvaluation = 'SE4-EIP7782'
    targetResult = 'delta_6000_cutoff_3000'
    reason = 'This is the frozen shorter-slot paper scenario, so the comparison stays tied to the EIP-7782 experiment.'
  } else if (!approximatelyEqual(config.attestationThreshold, 2 / 3)) {
    targetEvaluation = 'SE4-Attestation-Threshold'
    targetResult = selectNearestCatalogOption(config.attestationThreshold, gammaOptions).label
    reason = 'This is the nearest frozen attestation-threshold paper scenario for the exact run you just produced.'
  } else if (config.distribution === 'heterogeneous' && config.sourcePlacement !== 'homogeneous') {
    targetEvaluation = 'SE3-Joint-Heterogeneity'
    targetResult = config.sourcePlacement
    reason = 'This is the frozen joint-heterogeneity paper scenario, so the comparison stays within the same experimental family.'
  } else if (config.distribution === 'heterogeneous') {
    targetEvaluation = 'SE2-Validator-Distribution-Effect'
    targetResult = selectNearestCatalogOption(config.migrationCost, se2CostOptions).label
    reason = 'This is the frozen heterogeneous-validator paper scenario closest to the current exact configuration.'
  } else if (config.sourcePlacement === 'latency-aligned' || config.sourcePlacement === 'latency-misaligned') {
    targetEvaluation = 'SE1-Information-Source-Placement-Effect'
    targetResult = config.sourcePlacement
    reason = 'This is the frozen source-placement paper scenario that matches the current exact setup.'
  }

  const exactMatch = searchSpace.find(dataset => (
    dataset.evaluation === targetEvaluation
    && dataset.result === targetResult
  ))
  if (exactMatch) return { dataset: exactMatch, reason }

  const familyMatch = searchSpace.find(dataset => dataset.evaluation === targetEvaluation)
  if (familyMatch) {
    return {
      dataset: familyMatch,
      reason: `No exact frozen result label matched, so this falls back to the nearest ${familyMatch.evaluation} paper scenario in the same paradigm.`,
    }
  }

  const paradigmMatch = searchSpace[0] ?? datasets[0] ?? null
  return paradigmMatch
    ? {
        dataset: paradigmMatch,
        reason: 'No direct paper-family match was available, so this falls back to the nearest frozen scenario in the same paradigm.',
      }
    : null
}

export function sortComparisonCandidates(
  datasets: readonly ResearchDatasetEntry[],
  recommendedDataset: ResearchDatasetEntry | null,
  paradigm: SimulationConfig['paradigm'],
): ResearchDatasetEntry[] {
  const preferredParadigm = resolvePublishedParadigm(paradigm)

  return [...datasets]
    .map((dataset, index) => ({
      dataset,
      index,
      score: [
        dataset.path === recommendedDataset?.path ? 0 : 1,
        dataset.paradigm === preferredParadigm ? 0 : 1,
        dataset.evaluation === recommendedDataset?.evaluation ? 0 : 1,
      ],
    }))
    .sort((left, right) => {
      for (let index = 0; index < left.score.length; index += 1) {
        if (left.score[index] !== right.score[index]) {
          return left.score[index]! - right.score[index]!
        }
      }
      return left.index - right.index
    })
    .map(entry => entry.dataset)
}

export function alignComparisonSlot(
  primarySlot: number,
  primaryTotalSlots: number,
  comparisonTotalSlots: number,
): number {
  if (comparisonTotalSlots <= 1) return 0
  if (primaryTotalSlots <= 1) return Math.max(0, comparisonTotalSlots - 1)
  const progress = primarySlot / Math.max(1, primaryTotalSlots - 1)
  return clampSlotIndex(Math.round(progress * Math.max(0, comparisonTotalSlots - 1)), comparisonTotalSlots)
}

export function buildSimulationLabUrl(options: {
  readonly surfaceMode: SurfaceMode
  readonly currentJobId: string | null
  readonly analyticsView: AnalyticsDeckView
  readonly analyticsMetric: AnalyticsQueryMetric
  readonly analyticsCompareMode: AnalyticsCompareMode
  readonly analyticsSlot: number | null
  readonly comparisonPath: string | null
}): string | null {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  url.searchParams.set('tab', 'results')
  if (!options.currentJobId) {
    url.searchParams.delete('simulationSurface')
  } else {
    url.searchParams.set('simulationSurface', options.surfaceMode)
  }

  if (options.currentJobId) {
    url.searchParams.set('simulationJob', options.currentJobId)
    url.searchParams.set('exactAnalytics', options.analyticsView)
    url.searchParams.set('exactMetric', options.analyticsMetric)
    url.searchParams.set('exactCompareMode', options.analyticsCompareMode)
    if (typeof options.analyticsSlot === 'number' && options.analyticsSlot > 0) {
      url.searchParams.set('exactSlot', String(options.analyticsSlot))
    } else {
      url.searchParams.delete('exactSlot')
    }
    if (options.comparisonPath) {
      url.searchParams.set('exactCompare', options.comparisonPath)
    } else {
      url.searchParams.delete('exactCompare')
    }
  } else {
    url.searchParams.delete('simulationJob')
    url.searchParams.delete('exactAnalytics')
    url.searchParams.delete('exactMetric')
    url.searchParams.delete('exactCompareMode')
    url.searchParams.delete('exactSlot')
    url.searchParams.delete('exactCompare')
  }

  return url.toString()
}
