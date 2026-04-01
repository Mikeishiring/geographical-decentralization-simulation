export interface PublishedEvidenceSelection {
  readonly evaluation: string
  readonly paradigm: 'External' | 'Local'
  readonly result: string
}

const RESULTS_CONTEXT_KEYS = [
  'simulationJob',
  'exactAnalytics',
  'exactMetric',
  'exactCompareMode',
  'exactSlot',
  'exactCompare',
] as const

function applySelection(url: URL, selection: PublishedEvidenceSelection | null) {
  if (selection) {
    url.searchParams.set('evaluation', selection.evaluation)
    url.searchParams.set('paradigm', selection.paradigm)
    url.searchParams.set('result', selection.result)
    url.searchParams.set('simulationSurface', 'research')
  } else {
    url.searchParams.delete('evaluation')
    url.searchParams.delete('paradigm')
    url.searchParams.delete('result')
    url.searchParams.delete('simulationSurface')
  }

  for (const key of RESULTS_CONTEXT_KEYS) {
    url.searchParams.delete(key)
  }
}

export function readPublishedEvidenceSelectionFromSearch(search: string): PublishedEvidenceSelection | null {
  const params = new URLSearchParams(search)
  const evaluation = params.get('evaluation')
  const paradigm = params.get('paradigm')
  const result = params.get('result')

  if (!evaluation || !result || (paradigm !== 'External' && paradigm !== 'Local')) {
    return null
  }

  return { evaluation, paradigm, result }
}

export function buildPublishedEvidenceUrl(
  selection: PublishedEvidenceSelection,
  currentHref = typeof window !== 'undefined' ? window.location.href : 'http://localhost/',
): string {
  const url = new URL(currentHref)
  url.searchParams.delete('preview')
  url.searchParams.set('tab', 'results')
  applySelection(url, selection)
  return url.toString()
}

export function writePublishedEvidenceSelectionToHistory(selection: PublishedEvidenceSelection | null): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  applySelection(url, selection)
  window.history.replaceState({}, '', url.toString())
}
