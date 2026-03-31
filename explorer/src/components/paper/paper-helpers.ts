import type { PaperSection } from '../../data/paper-sections'

export function summarizeSection(section: PaperSection): string[] {
  const tags: string[] = []
  if (section.id === 'se4a-attestation') tags.push('best paradox')
  if (section.id === 'se2-distribution') tags.push('starting-state effect')
  if (section.id === 'limitations') tags.push('confidence boundary')
  if (section.id === 'discussion') tags.push('design implications')
  const blockTypes = new Set(section.blocks.map(block => block.type))
  if (blockTypes.has('chart') || blockTypes.has('timeseries')) tags.push('charts')
  if (blockTypes.has('table')) tags.push('tables')
  if (blockTypes.has('comparison')) tags.push('comparisons')
  if (section.blocks.some(block => block.type === 'insight' && block.emphasis === 'surprising')) {
    tags.push('surprising result')
  }
  if (section.blocks.some(block => block.type === 'caveat')) tags.push('caveat')
  return tags.slice(0, 3)
}

export function sectionEntryLine(section: PaperSection): string {
  const lines: Record<string, string> = {
    'system-model': 'Start here for the core mechanism: how latency turns geography into payoff.',
    'simulation-design': 'Start here for the model boundary: what is simplified, fixed, and directly measured.',
    'baseline-results': 'Start here for the baseline claim that both paradigms centralize without exotic assumptions.',
    'se1-source-placement': 'Start here for the infrastructure-placement flip that helps one paradigm while hurting the other.',
    'se2-distribution': 'Start here if you want to ask whether starting geography matters more than paradigm choice.',
    'se3-joint': 'Start here for the transient dip and the warning against overreading it as mitigation.',
    'se4a-attestation': 'Start here for the paper\'s sharpest paradox: the same gamma change pushes SSP and MSP in opposite directions.',
    'se4b-slots': 'Start here for the fairness-versus-geography distinction under shorter slots.',
    discussion: 'Start here for design implications without overstating what the model has solved.',
    limitations: 'Start here for the confidence boundary of the model.',
  }
  return lines[section.id] ?? section.description
}

export const BEST_FIRST_STOP_IDS = ['se4a-attestation', 'se2-distribution', 'discussion', 'limitations'] as const

export const ARXIV_PDF_URL = 'https://arxiv.org/pdf/2509.21475'
