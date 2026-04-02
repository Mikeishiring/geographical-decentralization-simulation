import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPLORER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(EXPLORER_ROOT, '..')
const PORT = 3220
const BASE_URL = `http://127.0.0.1:${PORT}`

function resolveTsxCli(): string {
  const localTsx = path.join(EXPLORER_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (existsSync(localTsx)) return localTsx

  const hoistedTsx = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (existsSync(hoistedTsx)) return hoistedTsx

  throw new Error('Unable to locate tsx CLI in explorer/node_modules or repo-root node_modules.')
}

const TSX_CLI = resolveTsxCli()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
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

function extractStages(streamBody: string): string[] {
  return [...streamBody.matchAll(/"stage":"([^"]+)"/g)].map(match => match[1] ?? '')
}

function countOccurrences(text: string, needle: string): number {
  return [...text.matchAll(new RegExp(needle, 'g'))].length
}

async function captureAskStream(query: string): Promise<{
  readonly body: string
  readonly stages: readonly string[]
}> {
  const response = await fetch(`${BASE_URL}/api/explore/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: query }],
        },
      ],
      history: [],
    }),
  })

  assert(response.ok, `Expected /api/explore/chat to succeed for "${query}" (${response.status} ${response.statusText})`)
  const body = await response.text()

  return {
    body,
    stages: extractStages(body),
  }
}

async function main() {
  const server = startServer()

  try {
    await waitForServer(`${BASE_URL}/api/health`)

    const healthResponse = await fetch(`${BASE_URL}/api/health`)
    assert(healthResponse.ok, 'Expected /api/health to succeed')
    const health = await healthResponse.json() as {
      anthropicEnabled?: boolean
    }
    assert(health.anthropicEnabled === true, 'Expected Anthropic to be enabled for streamed Ask smoke test')

    const giniStream = await captureAskStream('How do external and local block building compare on Gini?')
    const giniArtifactIndex = giniStream.body.indexOf('data-artifact')
    const giniRenderIndex = giniStream.body.indexOf('render_blocks')
    assert(giniArtifactIndex >= 0, 'Expected the quantitative Ask stream to emit a data-artifact part')
    assert(giniRenderIndex >= 0, 'Expected the quantitative Ask stream to emit render_blocks output')
    assert(giniArtifactIndex < giniRenderIndex, 'Expected the quantitative Ask stream to emit data-artifact before render_blocks')
    assert(countOccurrences(giniStream.body, 'data-artifact') >= 2, 'Expected the quantitative Ask stream to emit provisional and final artifacts')
    assert(
      giniStream.body.includes('0.2534') && giniStream.body.includes('0.6954'),
      'Expected the quantitative Ask stream to include exact published baseline Gini values',
    )
    assert(
      giniStream.stages.includes('Loaded pre-computed results'),
      'Expected the quantitative Ask stream to surface the pre-computed results stage',
    )

    const overviewStream = await captureAskStream('Can you explain the project and its main mechanism?')
    const overviewArtifactIndex = overviewStream.body.indexOf('data-artifact')
    const overviewRenderIndex = overviewStream.body.indexOf('render_blocks')
    assert(overviewArtifactIndex >= 0, 'Expected the overview Ask stream to emit a data-artifact part')
    assert(overviewRenderIndex >= 0, 'Expected the overview Ask stream to emit render_blocks output')
    assert(countOccurrences(overviewStream.body, 'data-artifact') >= 1, 'Expected the overview Ask stream to emit a renderable page artifact')

    const templateStream = await captureAskStream('What changes under shorter slots: geographic concentration or fairness pressure?')
    assert(
      !templateStream.body.includes('No published Results datasets match those filters.'),
      'Expected template-driven slot-time Ask queries to resolve onto published results instead of dead filters',
    )
    assert(
      templateStream.body.includes('Slot Time Comparison'),
      'Expected template-driven slot-time Ask queries to surface the linked study template',
    )

    const crossFamilyStream = await captureAskStream('Compare the baseline result with the higher gamma result and explain what changes.')
    assert(
      countOccurrences(crossFamilyStream.body, 'toolName":"query_cached_results') >= 2,
      'Expected cross-family Ask queries to retrieve more than one pre-computed Results family before rendering',
    )
    assert(
      crossFamilyStream.body.includes('baseline-results') && crossFamilyStream.body.includes('se4a-attestation'),
      'Expected cross-family Ask queries to surface both the baseline and higher-gamma study templates',
    )

    console.log('Streamed Ask smoke test passed.')
  } finally {
    await stopServer(server)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
