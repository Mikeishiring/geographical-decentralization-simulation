/**
 * Client API for the Stage 5 autonomous agent loop.
 * Thin fetch wrappers matching the pattern in simulation-api.ts.
 */

import type { SimulationConfig } from './simulation-api'

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'

// ---------------------------------------------------------------------------
// Types (mirroring server-side agent-loop-types.ts)
// ---------------------------------------------------------------------------

export type AgentStepPhase =
  | 'analyzing'
  | 'config_proposed'
  | 'awaiting_approval'
  | 'simulation_queued'
  | 'simulation_running'
  | 'simulation_completed'
  | 'interpreting'
  | 'interpreted'
  | 'failed'

export interface AgentInterpretation {
  readonly summary: string
  readonly hypothesis: string
  readonly suggestedNextQuestion: string
  readonly suggestedNextConfig: SimulationConfig | null
  readonly confidence: 'low' | 'medium' | 'high'
  readonly truthBoundary: {
    readonly label: string
    readonly detail: string
  }
}

export interface AgentStep {
  readonly id: string
  readonly index: number
  readonly phase: AgentStepPhase
  readonly question: string
  readonly rationale: string | null
  readonly proposedConfig: SimulationConfig | null
  readonly approvedConfig: SimulationConfig | null
  readonly jobId: string | null
  readonly interpretation: AgentInterpretation | null
  readonly error: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export type AgentSessionStatus = 'active' | 'paused' | 'completed' | 'abandoned'

export interface AgentSession {
  readonly id: string
  readonly researchQuestion: string
  readonly steps: readonly AgentStep[]
  readonly status: AgentSessionStatus
  readonly maxSteps: number
  readonly totalClaudeCalls: number
  readonly totalSimulations: number
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({ error: res.statusText }))) as Record<string, unknown>
  return new Error(typeof body.error === 'string' ? body.error : fallback)
}

function parseSession(raw: unknown): AgentSession {
  const data = raw as { session: AgentSession }
  if (!data?.session?.id) {
    throw new Error('Invalid agent session response.')
  }
  return data.session
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function createAgentSession(
  question: string,
  maxSteps?: number,
): Promise<AgentSession> {
  const res = await fetch(`${API_BASE}/agent-loop/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, maxSteps }),
  })
  if (!res.ok) throw await parseApiError(res, 'Failed to create agent session.')
  return parseSession(await res.json())
}

export async function getAgentSession(
  sessionId: string,
): Promise<AgentSession> {
  const res = await fetch(`${API_BASE}/agent-loop/sessions/${sessionId}`)
  if (!res.ok) throw await parseApiError(res, 'Failed to fetch agent session.')
  return parseSession(await res.json())
}

export async function listAgentSessions(): Promise<readonly AgentSession[]> {
  const res = await fetch(`${API_BASE}/agent-loop/sessions`)
  if (!res.ok) throw await parseApiError(res, 'Failed to list agent sessions.')
  const data = (await res.json()) as { sessions: AgentSession[] }
  return data.sessions ?? []
}

export async function approveAgentStep(
  sessionId: string,
  stepId: string,
  config?: SimulationConfig,
): Promise<AgentSession> {
  const res = await fetch(
    `${API_BASE}/agent-loop/sessions/${sessionId}/steps/${stepId}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    },
  )
  if (!res.ok) throw await parseApiError(res, 'Failed to approve agent step.')
  return parseSession(await res.json())
}

export async function rejectAgentStep(
  sessionId: string,
  stepId: string,
  feedback?: string,
): Promise<AgentSession> {
  const res = await fetch(
    `${API_BASE}/agent-loop/sessions/${sessionId}/steps/${stepId}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    },
  )
  if (!res.ok) throw await parseApiError(res, 'Failed to reject agent step.')
  return parseSession(await res.json())
}

export async function completeAgentSession(
  sessionId: string,
): Promise<AgentSession> {
  const res = await fetch(
    `${API_BASE}/agent-loop/sessions/${sessionId}/complete`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  )
  if (!res.ok) throw await parseApiError(res, 'Failed to complete agent session.')
  return parseSession(await res.json())
}
