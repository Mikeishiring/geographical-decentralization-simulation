import test from 'node:test'
import assert from 'node:assert/strict'
import { getInitialTabFromLocation, readRouteStateFromLocation } from '../src/lib/route-state'

const PAPER_SECTION_IDS = new Set([
  'system-model',
  'baseline-results',
  'discussion',
])

test('replay/results URLs win over stale explore tab and exploration id', () => {
  const search = '?theme=auto&step=1&autoplay=true&lens=evidence&audience=reader&paperSection=baseline-results&compare=simulations%2Ftest%2FSSP%2Fdata%2Fdata.json&evaluation=Baseline&paradigm=Local&result=cost_0.002&dataset=simulations%2Fbaseline%2FMSP%2Fcost_0.002%2Fdata.json&replayQuestion=Summarize+what+the+Baseline+%2F+Local+published+replay+is+showing+and+which+charts+I+should+read+first.&tab=explore&eid=c21a7924-9ddb-4de2-9337-632435e79eea'
  const route = readRouteStateFromLocation(search, '#system-model', PAPER_SECTION_IDS)

  assert.equal(route.tab, 'results')
  assert.equal(route.query, null)
  assert.equal(route.explorationId, null)
})

test('paper hash still opens the paper tab when explore has no reading state', () => {
  const tab = getInitialTabFromLocation('?tab=explore', '#system-model', PAPER_SECTION_IDS)
  assert.equal(tab, 'paper')
})

test('plain explore deep links still open the agent workspace', () => {
  const route = readRouteStateFromLocation('?tab=explore&q=What+does+baseline+show%3F&eid=abc123', '', PAPER_SECTION_IDS)

  assert.equal(route.tab, 'agent')
  assert.equal(route.query, null)
  assert.equal(route.explorationId, null)
})
