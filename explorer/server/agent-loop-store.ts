/**
 * In-memory store for agent loop sessions.
 *
 * Follows the same immutable-update pattern as ExplorationStore:
 * every mutation creates a new session/step object via spread.
 * No object is ever mutated in place.
 */

import {
  AGENT_LOOP_DEFAULTS,
  type AgentSession,
  type AgentSessionStatus,
  type AgentStep,
  type AgentStepPhase,
} from './agent-loop-types.ts'

function nowIso(): string {
  return new Date().toISOString()
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class AgentLoopStore {
  private readonly sessions = new Map<string, AgentSession>()

  // -------------------------------------------------------------------------
  // Session CRUD
  // -------------------------------------------------------------------------

  createSession(researchQuestion: string, maxSteps?: number): AgentSession {
    const activeCount = [...this.sessions.values()].filter(
      (session) => session.status === 'active',
    ).length
    if (activeCount >= AGENT_LOOP_DEFAULTS.maxConcurrentSessions) {
      throw new Error(
        `Too many active agent sessions (${activeCount}). Complete or abandon an existing session first.`,
      )
    }

    const now = nowIso()
    const session: AgentSession = {
      id: generateId('agent'),
      researchQuestion,
      steps: [],
      status: 'active',
      maxSteps: Math.min(
        Math.max(1, maxSteps ?? AGENT_LOOP_DEFAULTS.maxSteps),
        10,
      ),
      totalClaudeCalls: 0,
      totalSimulations: 0,
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(session.id, session)
    return session
  }

  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  listSessions(): readonly AgentSession[] {
    return [...this.sessions.values()].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
  }

  // -------------------------------------------------------------------------
  // Step management (immutable)
  // -------------------------------------------------------------------------

  addStep(sessionId: string, question: string): AgentSession {
    const session = this.requireSession(sessionId)
    if (session.steps.length >= session.maxSteps) {
      throw new Error(
        `Session has reached its step limit (${session.maxSteps}). Complete or extend the session.`,
      )
    }

    const now = nowIso()
    const step: AgentStep = {
      id: generateId('step'),
      index: session.steps.length,
      phase: 'analyzing',
      question,
      rationale: null,
      proposedConfig: null,
      approvedConfig: null,
      jobId: null,
      manifest: null,
      interpretation: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }

    const updated: AgentSession = {
      ...session,
      steps: [...session.steps, step],
      updatedAt: now,
    }
    this.sessions.set(sessionId, updated)
    return updated
  }

  updateStep(
    sessionId: string,
    stepId: string,
    patch: Partial<Pick<AgentStep, 'phase' | 'rationale' | 'proposedConfig' | 'approvedConfig' | 'jobId' | 'manifest' | 'interpretation' | 'error'>>,
  ): AgentSession {
    const session = this.requireSession(sessionId)
    const now = nowIso()
    const steps = session.steps.map((step) =>
      step.id === stepId ? { ...step, ...patch, updatedAt: now } : step,
    )
    const updated: AgentSession = { ...session, steps, updatedAt: now }
    this.sessions.set(sessionId, updated)
    return updated
  }

  // -------------------------------------------------------------------------
  // Session status transitions
  // -------------------------------------------------------------------------

  updateStatus(sessionId: string, status: AgentSessionStatus): AgentSession {
    const session = this.requireSession(sessionId)
    const updated: AgentSession = {
      ...session,
      status,
      updatedAt: nowIso(),
    }
    this.sessions.set(sessionId, updated)
    return updated
  }

  incrementClaudeCalls(sessionId: string): AgentSession {
    const session = this.requireSession(sessionId)
    const updated: AgentSession = {
      ...session,
      totalClaudeCalls: session.totalClaudeCalls + 1,
      updatedAt: nowIso(),
    }
    this.sessions.set(sessionId, updated)
    return updated
  }

  incrementSimulations(sessionId: string): AgentSession {
    const session = this.requireSession(sessionId)
    const updated: AgentSession = {
      ...session,
      totalSimulations: session.totalSimulations + 1,
      updatedAt: nowIso(),
    }
    this.sessions.set(sessionId, updated)
    return updated
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  abandonStale(): number {
    const cutoff = Date.now() - AGENT_LOOP_DEFAULTS.sessionTimeoutMs
    let count = 0
    for (const session of this.sessions.values()) {
      if (
        session.status === 'active' &&
        new Date(session.updatedAt).getTime() < cutoff
      ) {
        this.sessions.set(session.id, {
          ...session,
          status: 'abandoned',
          updatedAt: nowIso(),
        })
        count += 1
      }
    }
    return count
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireSession(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Agent session ${sessionId} not found.`)
    }
    return session
  }
}
