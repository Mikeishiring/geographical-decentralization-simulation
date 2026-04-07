/**
 * Shared types for the Stage 5 autonomous agent loop.
 *
 * The agent loop orchestrates: question analysis -> config proposal ->
 * human approval -> simulation execution -> result interpretation -> next hypothesis.
 * All types are immutable (readonly) and the store produces new objects via spread.
 */

import type { SimulationRequest, SimulationManifest } from './simulation-runtime.ts'
import type { Block } from '../src/types/blocks.ts'

// ---------------------------------------------------------------------------
// Step phase state machine
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

// ---------------------------------------------------------------------------
// Interpretation produced after a simulation completes
// ---------------------------------------------------------------------------

export interface AgentInterpretation {
  readonly summary: string
  readonly blocks: readonly Block[]
  readonly hypothesis: string
  readonly suggestedNextQuestion: string
  readonly suggestedNextConfig: SimulationRequest | null
  readonly confidence: 'low' | 'medium' | 'high'
  readonly truthBoundary: {
    readonly label: string
    readonly detail: string
  }
}

// ---------------------------------------------------------------------------
// A single step in the agent loop
// ---------------------------------------------------------------------------

export interface AgentStep {
  readonly id: string
  readonly index: number
  readonly phase: AgentStepPhase
  readonly question: string
  readonly rationale: string | null
  readonly proposedConfig: SimulationRequest | null
  readonly approvedConfig: SimulationRequest | null
  readonly jobId: string | null
  readonly manifest: SimulationManifest | null
  readonly interpretation: AgentInterpretation | null
  readonly error: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

export type AgentSessionStatus = 'active' | 'paused' | 'completed' | 'abandoned'

// ---------------------------------------------------------------------------
// Top-level session
// ---------------------------------------------------------------------------

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
// Cost limits (immutable defaults)
// ---------------------------------------------------------------------------

export const AGENT_LOOP_DEFAULTS = {
  maxSteps: 3,
  maxClaudeCalls: 8,
  maxSimulations: 3,
  maxConcurrentSessions: 3,
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  minQuestionLength: 10,
  maxQuestionLength: 500,
  maxFeedbackLength: 300,
} as const
