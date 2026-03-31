import type { TabId } from '../components/layout/TabNav'

export interface ExplorerRouteState {
  readonly tab: TabId
  readonly query: string | null
  readonly explorationId: string | null
}

const VALID_TABS: readonly TabId[] = ['paper', 'original', 'agent', 'community']
const DEFAULT_TAB: TabId = 'paper'
const AGENT_TAB: TabId = 'agent'

/** Legacy tab IDs → new tab IDs for URL migration */
const TAB_MIGRATION: Record<string, TabId> = {
  explore: 'paper',
  findings: 'paper',
  'deep-dive': 'original',
  paper: 'paper',
  results: 'agent',
  simulation: 'agent',
  history: 'community',
  community: 'community',
  agent: 'agent',
  original: 'original',
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

/** @deprecated Alias for backward compatibility */
export const RESULTS_ROUTE_PARAM_KEYS = AGENT_ROUTE_PARAM_KEYS

export function hasPaperSectionHash(hash: string, paperSectionIds: ReadonlySet<string>): boolean {
  const normalizedHash = hash.replace(/^#/, '')
  return normalizedHash.length > 0 && paperSectionIds.has(normalizedHash)
}

export function hasAgentRouteParams(params: URLSearchParams): boolean {
  return AGENT_ROUTE_PARAM_KEYS.some(key => params.has(key))
}

/** @deprecated Alias for backward compatibility */
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
    // Legacy: ?tab=explore with simulation params → agent
    if (tab === 'paper' && hasAgentParams) {
      return 'agent'
    }
    return tab
  }

  if (hasAgentParams) return 'agent'
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
  const isAgentRoute = tab === AGENT_TAB && hasAgentRouteParams(params)

  return {
    tab,
    query: isAgentRoute ? null : params.get('q'),
    explorationId: isAgentRoute ? null : params.get('eid'),
  }
}
