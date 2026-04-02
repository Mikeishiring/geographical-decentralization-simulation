import type { UIMessage } from 'ai'
import type { ExploreResponse } from './api'
import type { AskArtifactData, AskDataParts, AskPlanData, AskStatusData } from './ask-artifact'

type GenericAskTool = {
  readonly input: unknown
  readonly output: unknown
}

export type AskToolSet = Record<string, GenericAskTool> & {
  readonly search_topic_cards: {
    readonly input: {
      readonly query?: string
      readonly limit?: number
    }
    readonly output: unknown
  }
  readonly get_topic_card: {
    readonly input: {
      readonly id: string
    }
    readonly output: unknown
  }
  readonly search_explorations: {
    readonly input: {
      readonly query?: string
      readonly paradigm?: string
      readonly experiment?: string
      readonly verified_only?: boolean
      readonly sort?: string
      readonly limit?: number
    }
    readonly output: unknown
  }
  readonly get_exploration: {
    readonly input: {
      readonly id: string
    }
    readonly output: unknown
  }
  readonly suggest_underexplored_topics: {
    readonly input: {
      readonly query?: string
      readonly limit?: number
    }
    readonly output: unknown
  }
  readonly build_simulation_config: {
    readonly input: Record<string, unknown>
    readonly output: unknown
  }
  readonly query_cached_results: {
    readonly input: {
      readonly paradigm?: string
      readonly distribution?: string
      readonly sourcePlacement?: string
      readonly evaluation?: string
      readonly result?: string
    }
    readonly output: unknown
  }
  readonly query_results_table: {
    readonly input: {
      readonly dimensions?: readonly string[]
      readonly metrics?: readonly string[]
      readonly filters?: {
        readonly evaluation?: string
        readonly paradigm?: string
        readonly result?: string
      }
      readonly slot?: 'initial' | 'final'
      readonly orderBy?: string
      readonly order?: 'asc' | 'desc'
      readonly limit?: number
      readonly title?: string
    }
    readonly output: unknown
  }
  readonly render_blocks: {
    readonly input: {
      readonly summary?: string
      readonly blocks?: readonly unknown[]
      readonly follow_ups?: readonly string[]
    }
    readonly output: ExploreResponse
  }
}

export type AskUIMessage = UIMessage<unknown, AskDataParts, AskToolSet>

export interface AskToolActivity {
  readonly id: string
  readonly toolName: string
  readonly label: string
  readonly state: 'running' | 'done' | 'error'
}

export function extractAskStatusHistory(messages: readonly AskUIMessage[]): readonly AskStatusData[] {
  const statuses: AskStatusData[] = []

  for (const message of messages) {
    if (!message || message.role !== 'assistant') continue

    for (const part of message.parts) {
      const statusPart = part as {
        type?: string
        data?: AskStatusData
      } | undefined
      if (!statusPart || statusPart.type !== 'data-status' || !statusPart.data) continue
      statuses.push(statusPart.data)
    }
  }

  if (statuses.length > 0) {
    return statuses
      .slice()
      .sort((left, right) => left.timestamp - right.timestamp)
  }

  const toolActivities = extractLatestToolActivities(messages)
  const assistantText = extractLatestAssistantText(messages)
  const latestArtifact = extractLatestExploreArtifact(messages)
  const derived: AskStatusData[] = [{
    id: 'synthetic-question',
    phase: 'plan',
    state: 'done',
    label: 'Question received',
    detail: 'The assistant has the active study context and is beginning to work.',
    timestamp: 1,
  }]

  if (toolActivities.length > 0) {
    derived.push(...toolActivities.map((activity, index) => ({
      id: `synthetic-tool-${activity.id}`,
      phase: activity.toolName === 'render_blocks' ? 'render' : 'evidence',
      state:
        activity.state === 'error' ? 'error' :
        activity.state === 'done' ? 'done' :
        'active',
      label: activity.label,
      detail:
        activity.toolName === 'render_blocks'
          ? 'Turning the gathered evidence into the final block layout.'
          : 'Pulling grounded evidence into the live answer surface.',
      timestamp: 10 + index,
    } satisfies AskStatusData)))
  }

  if (assistantText.trim().length > 0) {
    derived.push({
      id: 'synthetic-compose',
      phase: 'compose',
      state: latestArtifact?.status === 'ready' ? 'done' : 'active',
      label: 'Drafting answer',
      detail: 'The assistant has started writing directly against the gathered evidence.',
      timestamp: 50,
    })
  }

  if (latestArtifact) {
    derived.push({
      id: 'synthetic-artifact',
      phase: latestArtifact.status === 'ready' ? 'render' : 'compose',
      state: latestArtifact.status === 'ready' ? 'done' : 'active',
      label: latestArtifact.status === 'ready' ? 'Answer ready' : latestArtifact.stage,
      detail: latestArtifact.status === 'ready'
        ? 'The final page artifact is assembled and ready to read.'
        : 'A provisional page artifact is being updated live underneath the prompt.',
      timestamp: 90,
    })
  }

  return derived
}

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  search_topic_cards: 'Checking paper topics',
  get_topic_card: 'Loading paper evidence',
  search_explorations: 'Reviewing prior explorations',
  get_exploration: 'Loading prior exploration',
  suggest_underexplored_topics: 'Drafting follow-up ideas',
  build_simulation_config: 'Assembling simulation config',
  query_cached_results: 'Loading pre-computed results',
  query_results_table: 'Running structured data query',
  render_blocks: 'Organizing the page',
}

export function extractExploreResponseFromMessage(message: AskUIMessage): ExploreResponse | null {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index] as {
      type?: string
      state?: string
      output?: ExploreResponse
    } | undefined
    if (!part || part.type !== 'tool-render_blocks') continue
    if (part.state !== 'output-available') continue
    return part.output ?? null
  }

  return null
}

export function extractLatestExploreResponse(messages: readonly AskUIMessage[]): ExploreResponse | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue
    const response = extractExploreResponseFromMessage(message)
    if (response) return response
  }

  return null
}

export function extractLatestExploreArtifact(messages: readonly AskUIMessage[]): AskArtifactData | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex] as {
        type?: string
        data?: AskArtifactData
      } | undefined
      if (!part || part.type !== 'data-artifact') continue
      return part.data ?? null
    }
  }

  return null
}

export function extractLatestAskPlan(messages: readonly AskUIMessage[]): AskPlanData | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex] as {
        type?: string
        data?: AskPlanData
      } | undefined
      if (!part || part.type !== 'data-plan') continue
      return part.data ?? null
    }
  }

  return null
}

export function extractLatestAssistantText(messages: readonly AskUIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue

    const text = message.parts
      .flatMap(part => part.type === 'text' ? [part.text] : [])
      .join(' ')
      .trim()

    if (text) return text
  }

  return ''
}

export function extractLatestToolActivities(messages: readonly AskUIMessage[]): readonly AskToolActivity[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'assistant') continue

    const activities = message.parts
      .flatMap((part): AskToolActivity[] => {
        const toolPart = part as {
          type?: string
          toolCallId?: string
          state?: string
        }

        if (!toolPart.type?.startsWith('tool-') || !toolPart.toolCallId) return []

        const toolName = toolPart.type.slice('tool-'.length)
        const label = TOOL_ACTIVITY_LABELS[toolName] ?? toolName.replace(/_/g, ' ')
        const state =
          toolPart.state === 'output-error' ? 'error' :
          toolPart.state === 'output-available' ? 'done' :
          'running'

        return [{
          id: toolPart.toolCallId,
          toolName,
          label,
          state,
        }]
      })

    if (activities.length > 0) return activities
  }

  return []
}
