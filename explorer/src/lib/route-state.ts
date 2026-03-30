import type { TabId } from '../components/layout/TabNav'

export interface ExplorerRouteState {
  readonly tab: TabId
  readonly query: string | null
  readonly explorationId: string | null
}

const VALID_TABS: readonly TabId[] = ['explore', 'paper', 'results', 'community', 'agent']
const DEFAULT_TAB: TabId = 'explore'
const RESULTS_TAB: TabId = 'results'

export const RESULTS_ROUTE_PARAM_KEYS = [
  'simulationSurface',
  'simulationJob',
  'exactAnalytics',
  'exactMetric',
  'exactCompareMode',
  'exactSlot',
  'exactCompare',
  'evaluation',
  'paradigm',
  'result',
  'dataset',
  'theme',
  'step',
  'autoplay',
  'lens',
  'compare',
  'audience',
  'replayQuestion',
  'paperSection',
  'slot',
  'compareSlot',
  'analytics',
] as const

export function hasPaperSectionHash(hash: string, paperSectionIds: ReadonlySet<string>): boolean {
  const normalizedHash = hash.replace(/^#/, '')
  return normalizedHash.length > 0 && paperSectionIds.has(normalizedHash)
}

export function hasResultsRouteParams(params: URLSearchParams): boolean {
  return RESULTS_ROUTE_PARAM_KEYS.some(key => params.has(key))
}

export function getInitialTabFromLocation(
  search: string,
  hash: string,
  paperSectionIds: ReadonlySet<string>,
): TabId {
  const params = new URLSearchParams(search)
  const raw = params.get('tab')
  const migrated = raw === 'findings' ? 'explore'
    : raw === 'deep-dive' ? 'paper'
    : raw === 'simulation' ? 'results'
    : raw === 'history' ? 'community'
    : raw
  const tab = migrated as TabId | null
  const hasPaperHash = hasPaperSectionHash(hash, paperSectionIds)
  const hasResultsParams = hasResultsRouteParams(params)

  if (tab && VALID_TABS.includes(tab)) {
    if (tab === 'explore' && hasResultsParams) {
      return 'results'
    }
    if (tab === 'explore' && hasPaperHash && !params.get('q') && !params.get('eid')) {
      return 'paper'
    }
    return tab
  }

  if (hasResultsParams) return 'results'
  if (params.get('q') || params.get('eid') || params.get('topic')) return 'explore'
  if (hasPaperHash) return 'paper'
  return DEFAULT_TAB
}

export function readRouteStateFromLocation(
  search: string,
  hash: string,
  paperSectionIds: ReadonlySet<string>,
): ExplorerRouteState {
  const params = new URLSearchParams(search)
  const tab = getInitialTabFromLocation(search, hash, paperSectionIds)
  const resultsRoute = tab === RESULTS_TAB && hasResultsRouteParams(params)

  return {
    tab,
    query: resultsRoute ? null : params.get('q'),
    explorationId: resultsRoute ? null : params.get('eid'),
  }
}
