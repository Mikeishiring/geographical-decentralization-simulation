/**
 * Agent loop orchestrator — the brain of Stage 5.
 *
 * Calls Claude for question analysis and result interpretation.
 * Coordinates with SimulationRuntime for job submission and monitoring.
 * All state updates go through AgentLoopStore (immutable).
 */

import type Anthropic from '@anthropic-ai/sdk'
import { SIMULATION_COPILOT_CONTEXT } from './study-context.ts'
import type { SimulationRuntime, SimulationRequest } from './simulation-runtime.ts'
import { AgentLoopStore } from './agent-loop-store.ts'
import {
  AGENT_LOOP_DEFAULTS,
  type AgentInterpretation,
  type AgentSession,
} from './agent-loop-types.ts'

// ---------------------------------------------------------------------------
// Agent-specific system prompt extension
// ---------------------------------------------------------------------------

const AGENT_LOOP_SYSTEM_EXTENSION = `

## Agent Loop Mode

You are operating in autonomous agent loop mode. You analyze a research question,
propose a simulation configuration, and after seeing results, interpret them and
suggest the next hypothesis.

### Phase: Analyze & Propose
When asked to analyze a research question:
1. Break down the question into a testable hypothesis
2. Propose a concrete SimulationConfig that would test it
3. Explain your rationale in 2-3 sentences

Return a JSON object with this exact shape:
{
  "rationale": "string explaining why this config tests the hypothesis",
  "proposedConfig": {
    "paradigm": "SSP" or "MSP",
    "validators": 50-1000,
    "slots": 100-10000,
    "distribution": "homogeneous" | "homogeneous-gcp" | "heterogeneous" | "random",
    "sourcePlacement": "homogeneous" | "latency-aligned" | "latency-misaligned",
    "migrationCost": 0.0-0.02,
    "attestationThreshold": 0.01-0.99,
    "slotTime": 6 or 8 or 12,
    "seed": any positive integer
  }
}

Keep configs small for fast iteration: prefer 200 validators and 500 slots for
exploratory steps. Only use large configs (1000 validators, 10000 slots) when
the user explicitly needs paper-comparable precision.

### Phase: Interpret Results
When given simulation results (manifest summary + artifacts):
1. Summarize what the results show
2. State whether the hypothesis was supported, challenged, or inconclusive
3. Propose a follow-up question and config that would deepen understanding
4. Rate your confidence as low/medium/high

Return a JSON object with this exact shape:
{
  "summary": "What the simulation showed",
  "hypothesis": "Based on these results, I hypothesize that...",
  "suggestedNextQuestion": "The next question to test is...",
  "suggestedNextConfig": { ... same shape as proposedConfig, or null },
  "confidence": "low" | "medium" | "high",
  "truthBoundary": {
    "label": "short label",
    "detail": "what this result does and does not prove"
  }
}
`

// ---------------------------------------------------------------------------
// Orchestrator class
// ---------------------------------------------------------------------------

export class AgentLoopOrchestrator {
  constructor(
    private readonly client: Anthropic,
    private readonly store: AgentLoopStore,
    private readonly simulationRuntime: SimulationRuntime,
    private readonly model: string,
  ) {}

  // -------------------------------------------------------------------------
  // Phase 1: Analyze question and propose a config
  // -------------------------------------------------------------------------

  async analyzeAndPropose(
    sessionId: string,
    stepId: string,
    priorContext: string,
  ): Promise<void> {
    const session = this.store.getSession(sessionId)
    if (!session) return

    const step = session.steps.find((s) => s.id === stepId)
    if (!step || step.phase !== 'analyzing') return

    this.guardCostLimits(session)
    this.store.incrementClaudeCalls(sessionId)

    try {
      const userMessage = this.buildAnalysisPrompt(step.question, priorContext)

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: `${SIMULATION_COPILOT_CONTEXT}\n${AGENT_LOOP_SYSTEM_EXTENSION}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      })

      const textContent = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      if (!textContent) {
        this.store.updateStep(sessionId, stepId, {
          phase: 'failed',
          error: 'Claude returned no text content during analysis.',
        })
        return
      }

      const parsed = this.extractJson<{
        rationale: string
        proposedConfig: SimulationRequest
      }>(textContent.text)

      if (!parsed?.proposedConfig) {
        this.store.updateStep(sessionId, stepId, {
          phase: 'failed',
          error: 'Claude did not return a valid proposed config.',
        })
        return
      }

      this.store.updateStep(sessionId, stepId, {
        phase: 'awaiting_approval',
        rationale: parsed.rationale ?? null,
        proposedConfig: this.clampConfig(parsed.proposedConfig),
      })
    } catch (err) {
      this.store.updateStep(sessionId, stepId, {
        phase: 'failed',
        error: err instanceof Error ? err.message : 'Analysis failed.',
      })
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: Submit approved config to simulation runtime
  // -------------------------------------------------------------------------

  submitSimulation(
    sessionId: string,
    stepId: string,
    config: SimulationRequest,
  ): void {
    const session = this.store.getSession(sessionId)
    if (!session) return

    this.store.incrementSimulations(sessionId)

    try {
      const snapshot = this.simulationRuntime.submit(config, {
        clientId: `agent-${sessionId}`,
      })

      this.store.updateStep(sessionId, stepId, {
        approvedConfig: config,
        jobId: snapshot.id,
        phase: snapshot.status === 'completed'
          ? 'simulation_completed'
          : 'simulation_queued',
        manifest: snapshot.manifest ?? null,
      })

      // If cache hit, jump straight to interpretation
      if (snapshot.status === 'completed') {
        void this.interpretResults(sessionId, stepId)
        return
      }

      // Subscribe for completion
      const unsubscribe = this.simulationRuntime.subscribe(
        snapshot.id,
        (jobSnapshot) => {
          if (jobSnapshot.status === 'completed') {
            unsubscribe?.()
            this.store.updateStep(sessionId, stepId, {
              phase: 'simulation_completed',
              manifest: jobSnapshot.manifest ?? null,
            })
            void this.interpretResults(sessionId, stepId)
          } else if (jobSnapshot.status === 'failed') {
            unsubscribe?.()
            this.store.updateStep(sessionId, stepId, {
              phase: 'failed',
              error: jobSnapshot.error ?? 'Simulation failed.',
            })
          } else if (jobSnapshot.status === 'running') {
            this.store.updateStep(sessionId, stepId, {
              phase: 'simulation_running',
            })
          }
        },
      )
    } catch (err) {
      this.store.updateStep(sessionId, stepId, {
        phase: 'failed',
        error: err instanceof Error ? err.message : 'Simulation submission failed.',
      })
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Interpret simulation results
  // -------------------------------------------------------------------------

  async interpretResults(
    sessionId: string,
    stepId: string,
  ): Promise<void> {
    const session = this.store.getSession(sessionId)
    if (!session) return

    const step = session.steps.find((s) => s.id === stepId)
    if (!step?.manifest) return

    this.store.updateStep(sessionId, stepId, { phase: 'interpreting' })
    this.guardCostLimits(session)
    this.store.incrementClaudeCalls(sessionId)

    try {
      const userMessage = this.buildInterpretationPrompt(session, step)

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: `${SIMULATION_COPILOT_CONTEXT}\n${AGENT_LOOP_SYSTEM_EXTENSION}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      })

      const textContent = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      if (!textContent) {
        this.store.updateStep(sessionId, stepId, {
          phase: 'failed',
          error: 'Claude returned no text during interpretation.',
        })
        return
      }

      const parsed = this.extractJson<Omit<AgentInterpretation, 'blocks'>>(textContent.text)
      if (!parsed?.summary) {
        this.store.updateStep(sessionId, stepId, {
          phase: 'failed',
          error: 'Claude did not return a valid interpretation.',
        })
        return
      }

      const interpretation: AgentInterpretation = {
        summary: parsed.summary,
        blocks: [], // Blocks would require tool_use rendering — kept empty for now
        hypothesis: parsed.hypothesis ?? '',
        suggestedNextQuestion: parsed.suggestedNextQuestion ?? '',
        suggestedNextConfig: parsed.suggestedNextConfig
          ? this.clampConfig(parsed.suggestedNextConfig)
          : null,
        confidence: parsed.confidence ?? 'medium',
        truthBoundary: parsed.truthBoundary ?? {
          label: 'Simulation evidence',
          detail: 'This result is from one simulation run and may not generalize.',
        },
      }

      this.store.updateStep(sessionId, stepId, {
        phase: 'interpreted',
        interpretation,
      })

      // Auto-advance: create next step if room remains and agent suggests one
      const updatedSession = this.store.getSession(sessionId)
      if (
        updatedSession &&
        updatedSession.status === 'active' &&
        updatedSession.steps.length < updatedSession.maxSteps &&
        interpretation.suggestedNextQuestion
      ) {
        const next = this.store.addStep(sessionId, interpretation.suggestedNextQuestion)
        const nextStep = next.steps.at(-1)
        if (nextStep) {
          const priorContext = this.buildPriorStepsContext(next)
          void this.analyzeAndPropose(sessionId, nextStep.id, priorContext)
        }
      }
    } catch (err) {
      this.store.updateStep(sessionId, stepId, {
        phase: 'failed',
        error: err instanceof Error ? err.message : 'Interpretation failed.',
      })
    }
  }

  // -------------------------------------------------------------------------
  // Re-analyze with user feedback (after rejection)
  // -------------------------------------------------------------------------

  async reanalyzeWithFeedback(
    sessionId: string,
    stepId: string,
    feedback: string,
  ): Promise<void> {
    this.store.updateStep(sessionId, stepId, {
      phase: 'analyzing',
      proposedConfig: null,
      rationale: null,
      error: null,
    })

    const session = this.store.getSession(sessionId)
    if (!session) return

    const step = session.steps.find((s) => s.id === stepId)
    if (!step) return

    const priorContext = this.buildPriorStepsContext(session)
    const feedbackContext = feedback
      ? `\n\nUser rejected the previous config with this feedback: "${feedback}"\nPlease propose a different configuration.`
      : ''

    await this.analyzeAndPropose(sessionId, stepId, priorContext + feedbackContext)
  }

  // -------------------------------------------------------------------------
  // Prompt builders
  // -------------------------------------------------------------------------

  private buildAnalysisPrompt(question: string, priorContext: string): string {
    const parts = [
      '## Agent Loop — Analyze & Propose Phase',
      '',
      `Research question: "${question}"`,
      '',
      'Based on this question, propose a simulation configuration that would test it.',
      'Return a JSON object with "rationale" and "proposedConfig" fields.',
      'Keep the config small for fast iteration (200 validators, 500 slots) unless precision is needed.',
    ]

    if (priorContext) {
      parts.push('', '## Prior Steps Context', priorContext)
    }

    return parts.join('\n')
  }

  private buildInterpretationPrompt(
    session: AgentSession,
    step: typeof session.steps[number],
  ): string {
    const manifest = step.manifest
    if (!manifest) return 'No manifest available.'

    const summary = manifest.summary
    const parts = [
      '## Agent Loop — Interpret Results Phase',
      '',
      `Original research question: "${session.researchQuestion}"`,
      `This step's question: "${step.question}"`,
      '',
      '## Simulation Results',
      `- Paradigm: ${manifest.config.paradigm}`,
      `- Validators: ${manifest.config.validators}`,
      `- Slots recorded: ${summary.slotsRecorded}`,
      `- Runtime: ${manifest.runtimeSeconds.toFixed(1)}s`,
      `- Cache hit: ${manifest.cacheHit ? 'yes' : 'no'}`,
      '',
      '## Key Metrics',
      `- Final average MEV: ${summary.finalAverageMev}`,
      `- Supermajority success: ${summary.finalSupermajoritySuccess}`,
      `- Failed block proposals: ${summary.finalFailedBlockProposals}`,
      `- Utility increase: ${summary.finalUtilityIncrease}`,
      `- Top regions: ${summary.topRegions.map((r) => `${r.name} (${r.count})`).join(', ')}`,
      '',
      '## Available Artifacts',
      ...manifest.artifacts.map((a) => `- ${a.name}: ${a.label} (${a.kind})`),
      '',
      'Interpret these results. Return a JSON object with "summary", "hypothesis",',
      '"suggestedNextQuestion", "suggestedNextConfig", "confidence", and "truthBoundary" fields.',
    ]

    const priorContext = this.buildPriorStepsContext(session, step.id)
    if (priorContext) {
      parts.push('', '## Prior Steps', priorContext)
    }

    return parts.join('\n')
  }

  buildPriorStepsContext(
    session: AgentSession,
    excludeStepId?: string,
  ): string {
    const completedSteps = session.steps.filter(
      (s) => s.phase === 'interpreted' && s.id !== excludeStepId,
    )
    if (completedSteps.length === 0) return ''

    return completedSteps
      .map((s) => {
        const interp = s.interpretation
        return [
          `Step ${s.index + 1}: "${s.question}"`,
          `  Config: ${s.approvedConfig?.paradigm ?? '?'} / ${s.approvedConfig?.validators ?? '?'} validators / ${s.approvedConfig?.slots ?? '?'} slots`,
          interp ? `  Result: ${interp.summary}` : '  Result: pending',
          interp ? `  Confidence: ${interp.confidence}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      })
      .join('\n\n')
  }

  // -------------------------------------------------------------------------
  // Safety helpers
  // -------------------------------------------------------------------------

  private guardCostLimits(session: AgentSession): void {
    if (session.totalClaudeCalls >= AGENT_LOOP_DEFAULTS.maxClaudeCalls) {
      throw new Error(
        `Session has reached its Claude call limit (${AGENT_LOOP_DEFAULTS.maxClaudeCalls}). Complete the session.`,
      )
    }
    if (session.totalSimulations >= AGENT_LOOP_DEFAULTS.maxSimulations) {
      throw new Error(
        `Session has reached its simulation limit (${AGENT_LOOP_DEFAULTS.maxSimulations}). Complete the session.`,
      )
    }
  }

  private clampConfig(config: Partial<SimulationRequest>): SimulationRequest {
    return {
      paradigm: config.paradigm === 'MSP' ? 'MSP' : 'SSP',
      validators: Math.max(1, Math.min(1000, Number(config.validators) || 200)),
      slots: Math.max(1, Math.min(10000, Number(config.slots) || 500)),
      distribution: (['homogeneous', 'homogeneous-gcp', 'heterogeneous', 'random'] as const)
        .includes(config.distribution as 'homogeneous')
        ? (config.distribution as 'homogeneous')
        : 'homogeneous',
      sourcePlacement: (['homogeneous', 'latency-aligned', 'latency-misaligned'] as const)
        .includes(config.sourcePlacement as 'homogeneous')
        ? (config.sourcePlacement as 'homogeneous')
        : 'homogeneous',
      migrationCost: Math.max(0, Math.min(0.02, Number(config.migrationCost) || 0.002)),
      attestationThreshold: Math.max(0.01, Math.min(0.99, Number(config.attestationThreshold) || 0.667)),
      slotTime: [6, 8, 12].includes(Number(config.slotTime)) ? (Number(config.slotTime) as 6 | 8 | 12) : 12,
      seed: Math.max(1, Math.floor(Number(config.seed) || 42)),
    }
  }

  private extractJson<T>(text: string): T | null {
    // Try to find JSON in code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1]) as T
      } catch {
        // Fall through to raw parse
      }
    }

    // Try to find raw JSON object
    const braceMatch = text.match(/\{[\s\S]*\}/)
    if (braceMatch?.[0]) {
      try {
        return JSON.parse(braceMatch[0]) as T
      } catch {
        return null
      }
    }

    return null
  }
}
