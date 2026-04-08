import type { TabId } from '../components/layout/TabNav'

export interface ExplorerRouteState {
  readonly tab: TabId
  readonly query: string | null
  readonly explorationId: string | null
}

const VALID_TABS: readonly TabId[] = ['paper', 'results', 'agent', 'community']
const DEFAULT_TAB: TabId = 'paper'
const AGENT_TAB: TabId = 'agent'
const RESULTS_TAB: TabId = 'results'

/** Legacy tab IDs → new tab IDs for URL migration */
const TAB_MIGRATION: Record<string, TabId> = {
  explore: 'paper',
  findings: 'paper',
  'deep-dive': 'paper',
  paper: 'paper',
  results: 'results',
  simulation: 'results',
  history: 'community',
  community: 'community',
  agent: 'agent',
  original: 'paper',
  data: 'results',
}

export const AGENT_ROUTE_PARAM_KEYS = [
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

/** Simulation-specific route params that belong on the Results tab */
export const RESULTS_ROUTE_PARAM_KEYS = AGENT_ROUTE_PARAM_KEYS

export function hasPaperSectionHash(hash: string, paperSectionIds: ReadonlySet<string>): boolean {
  const normalizedHash = hash.replace(/^#/, '')
  return normalizedHash.length > 0 && paperSectionIds.has(normalizedHash)
}

export function hasAgentRouteParams(params: URLSearchParams): boolean {
  return AGENT_ROUTE_PARAM_KEYS.some(key => params.has(key))
}

export const hasResultsRouteParams = hasAgentRouteParams

export function getInitialTabFromLocation(
  search: string,
  hash: string,
  paperSectionIds: ReadonlySet<string>,
): TabId {
  const params = new URLSearchParams(search)
  const raw = params.get('tab')
  const migrated = raw ? (TAB_MIGRATION[raw] ?? null) : null
  const tab = migrated as TabId | null
  const hasPaperHash = hasPaperSectionHash(hash, paperSectionIds)
  const hasAgentParams = hasAgentRouteParams(params)

  if (tab && VALID_TABS.includes(tab)) {
    // Legacy: ?tab=explore with simulation params → results
    if (tab === 'paper' && hasAgentParams) {
      return 'results'
    }
    return tab
  }

  if (hasAgentParams) return 'results'
  if (params.get('q')) return 'agent'
  if (params.get('eid')) return 'community'
  if (params.get('topic')) return 'paper'
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
  const isResultsRoute = tab === RESULTS_TAB && hasResultsRouteParams(params)
  const isAgentRoute = tab === AGENT_TAB || isResultsRoute

  return {
    tab,
    query: isAgentRoute ? null : params.get('q'),
    explorationId: isAgentRoute ? null : params.get('eid'),
  }
}
