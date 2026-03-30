/**
 * React Query hooks for the Stage 5 agent loop.
 * Adaptive polling: fast during active phases, stopped during approval gates.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAgentStep,
  completeAgentSession,
  createAgentSession,
  getAgentSession,
  listAgentSessions,
  rejectAgentStep,
  type AgentSession,
  type AgentStepPhase,
} from '../../lib/agent-api'
import type { SimulationConfig } from '../../lib/simulation-api'

const ACTIVE_PHASES: readonly AgentStepPhase[] = [
  'analyzing',
  'simulation_queued',
  'simulation_running',
  'interpreting',
]

function shouldPoll(session: AgentSession | undefined): number | false {
  if (!session) return 2000
  if (session.status !== 'active') return false

  const lastStep = session.steps.at(-1)
  if (!lastStep) return false

  if (ACTIVE_PHASES.includes(lastStep.phase)) return 1500
  if (lastStep.phase === 'awaiting_approval') return false
  if (lastStep.phase === 'interpreted') return 3000

  return 3000
}

export function useAgentSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['agent-session', sessionId],
    queryFn: () => getAgentSession(sessionId!),
    enabled: sessionId !== null,
    refetchInterval: (query) => shouldPoll(query.state.data),
  })
}

export function useAgentSessionList() {
  return useQuery({
    queryKey: ['agent-sessions'],
    queryFn: listAgentSessions,
    staleTime: 10_000,
  })
}

export function useCreateAgentSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      question,
      maxSteps,
    }: {
      question: string
      maxSteps?: number
    }) => createAgentSession(question, maxSteps),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-sessions'] })
    },
  })
}

export function useApproveStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sessionId,
      stepId,
      config,
    }: {
      sessionId: string
      stepId: string
      config?: SimulationConfig
    }) => approveAgentStep(sessionId, stepId, config),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ['agent-session', vars.sessionId],
      })
    },
  })
}

export function useRejectStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sessionId,
      stepId,
      feedback,
    }: {
      sessionId: string
      stepId: string
      feedback?: string
    }) => rejectAgentStep(sessionId, stepId, feedback),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ['agent-session', vars.sessionId],
      })
    },
  })
}

export function useCompleteSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => completeAgentSession(sessionId),
    onSuccess: (_data, sessionId) => {
      void queryClient.invalidateQueries({
        queryKey: ['agent-session', sessionId],
      })
      void queryClient.invalidateQueries({ queryKey: ['agent-sessions'] })
    },
  })
}
