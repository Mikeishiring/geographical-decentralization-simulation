import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPLORER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(EXPLORER_ROOT, '..')
const DATA_DIR = path.join(EXPLORER_ROOT, 'server', 'data')
const DATA_FILE = path.join(DATA_DIR, 'explorations.json')
const PORT = 3219
const BASE_URL = `http://127.0.0.1:${PORT}`

function resolveTsxCli(): string {
  const localTsx = path.join(EXPLORER_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (existsSync(localTsx)) return localTsx

  const hoistedTsx = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (existsSync(hoistedTsx)) return hoistedTsx

  throw new Error('Unable to locate tsx CLI in explorer/node_modules or repo-root node_modules.')
}

const TSX_CLI = resolveTsxCli()

interface ExplorationSeed {
  readonly id: string
  readonly query: string
  readonly normalizedQuery: string
  readonly summary: string
  readonly blocks: unknown[]
  readonly followUps: string[]
  readonly model: string
  readonly cached: boolean
  readonly source: 'generated'
  readonly votes: number
  readonly createdAt: string
  readonly paradigmTags: string[]
  readonly experimentTags: string[]
  readonly verified: boolean
  readonly surface: 'reading' | 'simulation'
  readonly publication: {
    readonly published: boolean
    readonly title: string
    readonly takeaway: string
    readonly author: string
    readonly publishedAt: string | null
    readonly featured: boolean
    readonly editorNote: string
  }
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function assertOk(response: Response, message: string): Promise<void> {
  if (response.ok) return

  const body = await response.text().catch(() => '')
  throw new Error(
    body
      ? `${message} (${response.status} ${response.statusText}): ${body}`
      : `${message} (${response.status} ${response.statusText})`,
  )
}

async function waitForSimulation(
  jobId: string,
  attempts = 480,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/simulations/${jobId}`)
    assert(response.ok, `Expected simulation job ${jobId} lookup to succeed`)
    const payload = await response.json() as Record<string, unknown>
    const status = payload.status

    if (
      status === 'completed'
      || status === 'failed'
      || status === 'cancelled'
    ) {
      return payload
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for simulation job ${jobId}`)
}

async function waitForServer(url: string, attempts = 40): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server not ready yet.
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function withSeededHistory(seed: ExplorationSeed, run: () => Promise<void>) {
  await mkdir(DATA_DIR, { recursive: true })
  const hadOriginal = existsSync(DATA_FILE)
  const original = hadOriginal ? await readFile(DATA_FILE, 'utf8') : null

  try {
    await writeFile(DATA_FILE, JSON.stringify([seed], null, 2), 'utf8')
    await run()
  } finally {
    if (original !== null) {
      await writeFile(DATA_FILE, original, 'utf8')
    } else {
      await rm(DATA_FILE, { force: true })
    }
  }
}

function startServer(): ChildProcessWithoutNullStreams {
  const child = spawn(
    process.execPath,
    [TSX_CLI, 'server/index.ts'],
    {
      cwd: EXPLORER_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
      },
      stdio: 'pipe',
    },
  )

  child.stdout.on('data', chunk => {
    process.stdout.write(`[explorer] ${chunk}`)
  })
  child.stderr.on('data', chunk => {
    process.stderr.write(`[explorer:err] ${chunk}`)
  })

  return child
}

async function stopServer(child: ChildProcessWithoutNullStreams) {
  if (child.killed || child.exitCode !== null) return

  const exited = new Promise<void>(resolve => {
    child.once('exit', () => resolve())
  })

  child.kill()
  const timeout = new Promise<void>(resolve => {
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
      }
      resolve()
    }, 1500)
  })

  await Promise.race([exited, timeout])
}

async function main() {
  const seededExploration: ExplorationSeed = {
    id: randomUUID(),
    query: 'How do asymmetric relay latencies change proposer migration after convergence?',
    normalizedQuery: normalizeQuery('How do asymmetric relay latencies change proposer migration after convergence?'),
    summary: 'Asymmetric relay paths bias late-stage proposer moves toward the lowest-latency relay corridor.',
    blocks: [
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'Opposite gamma sensitivity',
        text: 'Once most validators have converged, asymmetric relay paths still pull proposers toward the lowest-latency relay corridor.',
      },
    ],
    followUps: ['Does this change the final concentration ranking?'],
    model: 'smoke-seed',
    cached: true,
    source: 'generated',
    votes: 3,
    createdAt: new Date().toISOString(),
    paradigmTags: ['SSP', 'MSP'],
    experimentTags: ['SE4'],
    verified: true,
    surface: 'reading',
    publication: {
      published: false,
      title: '',
      takeaway: '',
      author: '',
      publishedAt: null,
      featured: false,
      editorNote: '',
    },
  }

  await withSeededHistory(seededExploration, async () => {
    const server = startServer()

    try {
      await waitForServer(`${BASE_URL}/api/health`)

      const healthResponse = await fetch(`${BASE_URL}/api/health`)
      assert(healthResponse.ok, 'Expected /api/health to succeed')
      const health = await healthResponse.json() as Record<string, unknown>
      assert(typeof health.tools === 'number' && health.tools >= 7, 'Expected expanded tool catalog in /api/health')
      assert(
        health.anthropicModel === null || typeof health.anthropicModel === 'string',
        'Expected /api/health to expose the configured Anthropic model or null',
      )
      assert(typeof health.envFileLoaded === 'boolean', 'Expected /api/health to expose env file load status')
      const simulations = health.simulations as Record<string, unknown> | undefined
      assert(typeof simulations?.readyWorkers === 'number' && simulations.readyWorkers >= 1, 'Expected at least one ready simulation worker')

      const readingResponse = await fetch(`${BASE_URL}/api/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'How does SSP compare to MSP?' }),
      })
      assert(readingResponse.ok, 'Expected /api/explore request to succeed for a canonical compare question')
      const readingPayload = await readingResponse.json() as Record<string, unknown>
      const readingProvenance = readingPayload.provenance as Record<string, unknown> | undefined
      assert(typeof readingProvenance?.source === 'string', 'Expected /api/explore to return provenance metadata')
      assert(Array.isArray(readingPayload.blocks) && readingPayload.blocks.length > 0, 'Expected /api/explore to return blocks')

      const historyResponse = await fetch(`${BASE_URL}/api/explore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seededExploration.query }),
      })
      assert(historyResponse.ok, 'Expected seeded-history /api/explore request to succeed')
      const historyPayload = await historyResponse.json() as Record<string, unknown>
      const historyProvenance = historyPayload.provenance as Record<string, unknown> | undefined
      assert(typeof historyProvenance?.source === 'string', 'Expected seeded-history /api/explore to return provenance metadata')
      assert(Array.isArray(historyPayload.blocks) && historyPayload.blocks.length > 0, 'Expected seeded-history /api/explore to return blocks')
      const persistedExplorationId = seededExploration.id

      const listResponse = await fetch(`${BASE_URL}/api/explorations?search=relay latencies`)
      assert(listResponse.ok, 'Expected /api/explorations search to succeed')
      const listPayload = await listResponse.json() as Array<Record<string, unknown>>
      const matchingExploration = listPayload.find(entry =>
        entry.id === persistedExplorationId
        || entry.query === seededExploration.query,
      )
      assert(matchingExploration, 'Expected a matching saved exploration to appear in search results')

      const getExplorationResponse = await fetch(`${BASE_URL}/api/explorations/${persistedExplorationId}`)
      await assertOk(getExplorationResponse, 'Expected /api/explorations/:id to succeed for the persisted history match')

      const replyResponse = await fetch(`${BASE_URL}/api/explorations/${persistedExplorationId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: 'smoke-reply',
          body: 'Reply smoke test',
        }),
      })
      await assertOk(replyResponse, 'Expected /api/explorations/:id/replies to succeed')
      const replyPayload = await replyResponse.json() as Record<string, unknown>
      assert(replyPayload.author === 'smoke-reply', 'Expected reply creation to preserve the author')
      assert(replyPayload.body === 'Reply smoke test', 'Expected reply creation to preserve the body')
      assert(typeof replyPayload.id === 'string' && replyPayload.id.length > 0, 'Expected reply creation to return a reply ID')
      const replyId = replyPayload.id as string

      const voteReplyResponse = await fetch(`${BASE_URL}/api/explorations/${persistedExplorationId}/replies/${replyId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: 1 }),
      })
      await assertOk(voteReplyResponse, 'Expected /api/explorations/:id/replies/:replyId/vote to succeed')
      const votedReplyPayload = await voteReplyResponse.json() as Record<string, unknown>
      assert(votedReplyPayload.votes === 1, 'Expected reply vote endpoint to increment the vote count')

      const explorationWithRepliesResponse = await fetch(`${BASE_URL}/api/explorations/${persistedExplorationId}`)
      await assertOk(explorationWithRepliesResponse, 'Expected /api/explorations/:id to include replies after creation')
      const explorationWithReplies = await explorationWithRepliesResponse.json() as Record<string, unknown>
      const replies = explorationWithReplies.replies as Array<Record<string, unknown>> | undefined
      const persistedReply = replies?.find(reply => reply.id === replyId)
      assert(persistedReply?.author === 'smoke-reply', 'Expected reply author to persist on the exploration record')
      assert(persistedReply?.votes === 1, 'Expected reply votes to persist on the exploration record')

      const publishResponse = await fetch(`${BASE_URL}/api/explorations/${persistedExplorationId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Relay corridor note',
          takeaway: 'Human-framed note about asymmetric relay paths after convergence.',
          author: 'smoke',
        }),
      })
      await assertOk(publishResponse, 'Expected /api/explorations/:id/publish to succeed')
      const publishedPayload = await publishResponse.json() as Record<string, unknown>
      const publication = publishedPayload.publication as Record<string, unknown> | undefined
      assert(publication?.published === true, 'Expected publish endpoint to mark the exploration as published')
      assert(publication?.title === 'Relay corridor note', 'Expected publish endpoint to persist the human-authored title')

      const communityListResponse = await fetch(`${BASE_URL}/api/explorations?published=true`)
      assert(communityListResponse.ok, 'Expected published-only /api/explorations query to succeed')
      const communityList = await communityListResponse.json() as Array<Record<string, unknown>>
      assert(communityList.some(entry => entry.id === persistedExplorationId), 'Expected published exploration to appear in community results')

      const archiveListResponse = await fetch(`${BASE_URL}/api/explorations?published=false`)
      assert(archiveListResponse.ok, 'Expected archive-only /api/explorations query to succeed')
      const archiveList = await archiveListResponse.json() as Array<Record<string, unknown>>
      assert(!archiveList.some(entry => entry.id === persistedExplorationId), 'Expected published exploration to be excluded from archive results')

      const createSimulationNoteResponse = await fetch(`${BASE_URL}/api/explorations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'What stands out in this exact MSP run?',
          summary: 'Exact MSP run note for the smoke suite.',
          blocks: [
            {
              type: 'caveat',
              text: 'Smoke-created exact-run note.',
            },
          ],
          followUps: ['How does this compare to SSP under the same setup?'],
          model: 'exact-simulation',
          cached: false,
          surface: 'simulation',
        }),
      })
      assert(createSimulationNoteResponse.ok, 'Expected /api/explorations creation endpoint to succeed')
      const createdSimulationNote = await createSimulationNoteResponse.json() as Record<string, unknown>
      assert(createdSimulationNote.surface === 'simulation', 'Expected created exploration to preserve the simulation surface')

      const simulationResponse = await fetch(`${BASE_URL}/api/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paradigm: 'SSP',
          validators: 48,
          slots: 4,
          distribution: 'homogeneous',
          sourcePlacement: 'homogeneous',
          migrationCost: 0.0001,
          attestationThreshold: 2 / 3,
          slotTime: 12,
          seed: 123,
        }),
      })
      assert(simulationResponse.ok, 'Expected /api/simulations submission to succeed')
      const simulationJob = await simulationResponse.json() as Record<string, unknown>
      assert(typeof simulationJob.id === 'string', 'Expected simulation job to include an ID')
      const simulationJobId = simulationJob.id

      const finalJob = await waitForSimulation(simulationJobId)
      assert(finalJob.status === 'completed', 'Expected smoke simulation to complete')

      const manifestResponse = await fetch(`${BASE_URL}/api/simulations/${simulationJobId}/manifest`)
      assert(manifestResponse.ok, 'Expected completed simulation manifest to be available')
      const manifest = await manifestResponse.json() as Record<string, unknown>
      const summary = manifest.summary as Record<string, unknown> | undefined
      assert(summary?.finalAverageMev === 0.555879, 'Expected canonical SSP smoke avg MEV to match the saved benchmark')
      assert(summary?.finalSupermajoritySuccess === 100, 'Expected canonical SSP smoke supermajority success to match the saved benchmark')
      assert(summary?.finalFailedBlockProposals === 0, 'Expected canonical SSP smoke failed block proposals to match the saved benchmark')
      assert(typeof summary?.finalUtilityIncrease === 'number', 'Expected canonical SSP smoke manifest to expose finalUtilityIncrease')
      assert(typeof summary?.finalGeographicGini === 'number', 'Expected canonical SSP smoke manifest to expose finalGeographicGini')
      assert(typeof summary?.finalGeographicHhi === 'number', 'Expected canonical SSP smoke manifest to expose finalGeographicHhi')
      assert(typeof summary?.finalGeographicLiveness === 'number', 'Expected canonical SSP smoke manifest to expose finalGeographicLiveness')
      assert(typeof summary?.finalGeographicProfitVarianceCv === 'number', 'Expected canonical SSP smoke manifest to expose finalGeographicProfitVarianceCv')
      const topRegions = summary?.topRegions as Array<Record<string, unknown>> | undefined
      assert(Array.isArray(topRegions) && topRegions.length > 0, 'Expected canonical SSP smoke manifest to expose topRegions')
      assert(typeof topRegions?.[0]?.name === 'string', 'Expected canonical SSP smoke manifest topRegions to include names')
      assert(typeof topRegions?.[0]?.count === 'number', 'Expected canonical SSP smoke manifest topRegions to include counts')
      const artifacts = manifest.artifacts as Array<Record<string, unknown>> | undefined
      assert(artifacts?.some(artifact => artifact.name === 'top_regions_final.json'), 'Expected canonical SSP smoke manifest to expose top_regions_final.json')
      assert(artifacts?.some(artifact => artifact.name === 'paper_geography_metrics.json'), 'Expected canonical SSP smoke manifest to expose paper_geography_metrics.json')
      const overviewBundles = manifest.overviewBundles as Array<Record<string, unknown>> | undefined
      assert(overviewBundles?.some(bundle => bundle.bundle === 'geography-overview'), 'Expected canonical SSP smoke manifest to expose the geography-overview bundle')
      assert(overviewBundles?.some(bundle => bundle.bundle === 'paper-metrics'), 'Expected canonical SSP smoke manifest to expose the paper-metrics bundle')

      if (health.anthropicEnabled === false) {
        const copilotResponse = await fetch(`${BASE_URL}/api/simulation-copilot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'What should I look at first in this run?',
            currentJobId: simulationJobId,
          }),
        })
        assert(copilotResponse.status === 503, 'Expected simulation copilot to return 503 when Anthropic is not configured')
      } else {
        const generatedExploreResponse = await fetch(`${BASE_URL}/api/explore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'Explain the latency-critical-path difference between SSP and MSP and why it changes geographic concentration pressure.',
          }),
        })
        assert(generatedExploreResponse.ok, 'Expected live /api/explore request to succeed')
        const generatedExplorePayload = await generatedExploreResponse.json() as Record<string, unknown>
        const generatedProvenance = generatedExplorePayload.provenance as Record<string, unknown> | undefined
        assert(generatedProvenance?.source === 'generated', 'Expected live /api/explore request to hit the model path')
        assert(Array.isArray(generatedExplorePayload.blocks) && generatedExplorePayload.blocks.length > 0, 'Expected live /api/explore request to return blocks')
        assert(
          typeof generatedExplorePayload.model === 'string' && generatedExplorePayload.model.includes('sonnet'),
          'Expected live /api/explore request to report a Sonnet model',
        )

        const liveCopilotResponse = await fetch(`${BASE_URL}/api/simulation-copilot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: 'Propose an exact SSP vs MSP comparison under shorter slots that stays within supported bounds.',
            currentConfig: {
              paradigm: 'SSP',
              validators: 1000,
              slots: 1000,
              distribution: 'homogeneous',
              sourcePlacement: 'homogeneous',
              migrationCost: 0.0001,
              attestationThreshold: 2 / 3,
              slotTime: 12,
              seed: 25873,
            },
          }),
        })
        assert(liveCopilotResponse.ok, 'Expected live /api/simulation-copilot request to succeed')
        const liveCopilotPayload = await liveCopilotResponse.json() as Record<string, unknown>
        assert(typeof liveCopilotPayload.summary === 'string' && liveCopilotPayload.summary.length > 0, 'Expected live copilot to return a summary')
        assert(Array.isArray(liveCopilotPayload.blocks) && liveCopilotPayload.blocks.length > 0, 'Expected live copilot to return blocks')
        assert(
          typeof liveCopilotPayload.model === 'string' && liveCopilotPayload.model.includes('sonnet'),
          'Expected live copilot to report a Sonnet model',
        )
      }

      process.stdout.write('Explorer smoke checks passed.\n')
    } finally {
      await stopServer(server)
    }
  })
}

main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
