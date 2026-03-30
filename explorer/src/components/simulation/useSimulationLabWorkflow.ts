import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createExploration, getApiHealth, publishExploration } from '../../lib/api'
import {
  cancelSimulationJob,
  submitSimulationCopilot,
  submitSimulationForClient,
  type SimulationConfig,
  type SimulationCopilotResponse,
  type SimulationJob,
  type SimulationManifest,
} from '../../lib/simulation-api'
import type { Block } from '../../types/blocks'
import type { RunnerStatus } from './simulation-lab-types'
import { defaultSimulationContributionBlocks, defaultSimulationSummary } from './pending-run-helpers'
import { paperScenarioLabels } from './simulation-constants'

interface UseSimulationLabWorkflowOptions {
  readonly clientId: string
  readonly currentJobId: string | null
  readonly config: SimulationConfig
  readonly manifest: SimulationManifest | null
  readonly jobStatus: SimulationJob['status'] | undefined
  readonly overviewBlocks: readonly Block[]
  readonly parsedBlocks: readonly Block[]
  readonly onSubmitSuccess: (job: SimulationJob) => void
}

export function useSimulationLabWorkflow({
  clientId,
  currentJobId,
  config,
  manifest,
  jobStatus,
  overviewBlocks,
  parsedBlocks,
  onSubmitSuccess,
}: UseSimulationLabWorkflowOptions) {
  const queryClient = useQueryClient()
  const [copilotQuestion, setCopilotQuestion] = useState('')
  const [copilotResponse, setCopilotResponse] = useState<SimulationCopilotResponse | null>(null)
  const [publishedSimulationKey, setPublishedSimulationKey] = useState<string | null>(null)
  const [publishedSimulationExplorationId, setPublishedSimulationExplorationId] = useState<string | null>(null)

  useEffect(() => {
    setCopilotResponse(null)
  }, [currentJobId])

  const submitMutation = useMutation({
    mutationFn: (nextConfig: SimulationConfig) => submitSimulationForClient(nextConfig, clientId),
    onSuccess: job => {
      queryClient.setQueryData(['simulation-job', job.id], job)
      if (job.manifest) {
        queryClient.setQueryData(['simulation-manifest', job.id], job.manifest)
      }
      onSubmitSuccess(job)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: cancelSimulationJob,
    onSuccess: job => {
      queryClient.setQueryData(['simulation-job', job.id], job)
    },
  })

  const copilotMutation = useMutation({
    mutationFn: (question: string) => submitSimulationCopilot({
      question,
      currentJobId,
      currentConfig: manifest?.config ?? config,
    }),
    onSuccess: response => {
      setCopilotResponse(response)
    },
  })

  const publishMutation = useMutation({
    mutationFn: async (input: {
      contextKey: string
      title: string
      takeaway: string
      author: string
    }) => {
      if (!manifest) {
        throw new Error('Run an exact simulation before publishing a community note.')
      }

      const created = await createExploration({
        query: copilotQuestion.trim() || `What stands out in this exact ${manifest.config.paradigm} run?`,
        summary: copilotResponse?.summary ?? defaultSimulationSummary(manifest),
        blocks: defaultSimulationContributionBlocks(
          manifest,
          copilotResponse?.blocks?.length
            ? copilotResponse.blocks
            : overviewBlocks.length > 0
              ? overviewBlocks
              : parsedBlocks,
        ),
        followUps: copilotResponse?.suggestedPrompts ?? [],
        model: copilotResponse?.model ?? 'exact-simulation',
        cached: copilotResponse?.cached ?? manifest.cacheHit,
        surface: 'simulation',
      })

      return await publishExploration(created.id, {
        title: input.title,
        takeaway: input.takeaway,
        author: input.author || undefined,
      })
    },
    onSuccess: (published, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
      setPublishedSimulationKey(variables.contextKey)
      setPublishedSimulationExplorationId(published.id)
    },
  })

  const apiHealthQuery = useQuery({
    queryKey: ['api-health'],
    queryFn: getApiHealth,
    staleTime: 30_000,
  })

  const status: RunnerStatus = submitMutation.isPending
    ? 'submitting'
    : jobStatus ?? 'idle'

  const onSubmit = () => {
    publishMutation.reset()
    setPublishedSimulationKey(null)
    setPublishedSimulationExplorationId(null)
    submitMutation.mutate(config)
  }

  const onCancel = () => {
    if (!currentJobId) return
    cancelMutation.mutate(currentJobId)
  }

  const copilotPromptSuggestions = useMemo(
    () => copilotResponse?.suggestedPrompts?.length
      ? copilotResponse.suggestedPrompts
      : manifest
        ? [
            'Show the core outcomes bundle from this exact run.',
            'Explain why these regions dominate in this exact result.',
            'What is the nearest paper-backed follow-up to run next?',
          ]
        : [
            'Set up the paper baseline SSP run (10,000 slots, 0.002 ETH).',
            'Mirror that paper baseline for MSP so I can compare the paradigms.',
            'Hold the paradigm fixed and switch from latency-aligned to latency-misaligned sources.',
            'Load the real Ethereum validator start and explain what should change.',
          ],
    [copilotResponse, manifest],
  )

  const simulationPublishContextKey = manifest ? `simulation:${currentJobId ?? manifest.jobId}` : null
  const simulationPublishTitle = manifest
    ? `${manifest.config.paradigm} exact run: ${paperScenarioLabels(manifest.config)[0] ?? 'custom scenario'}`
    : ''
  const simulationPublishTakeaway = manifest
    ? copilotResponse?.summary ?? defaultSimulationSummary(manifest)
    : ''

  return {
    apiHealthQuery,
    cancelMutation,
    canCancel: jobStatus === 'queued' || jobStatus === 'running',
    copilotAvailable: apiHealthQuery.data?.anthropicEnabled ?? false,
    copilotMutation,
    copilotPromptSuggestions,
    copilotQuestion,
    copilotResponse,
    onCancel,
    onSubmit,
    publishMutation,
    publishedSimulationExplorationId,
    publishedSimulationKey,
    setCopilotQuestion,
    simulationPublishContextKey,
    simulationPublishTakeaway,
    simulationPublishTitle,
    status,
    submitMutation,
  }
}
