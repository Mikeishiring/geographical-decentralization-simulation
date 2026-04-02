import type { StudyPackage, StudySimulationConfig } from '../src/studies/types.ts'

function formatInlineList(values: readonly string[]): string {
  return values.filter(Boolean).join(', ')
}

function formatStudyConfig(config: Partial<StudySimulationConfig>): string[] {
  const rows: string[] = []

  if (config.paradigm) rows.push(`- Paradigm: ${config.paradigm}`)
  if (typeof config.validators === 'number') rows.push(`- Validators: ${config.validators}`)
  if (typeof config.slots === 'number') rows.push(`- Slots: ${config.slots}`)
  if (config.distribution) rows.push(`- Distribution: ${config.distribution}`)
  if (config.sourcePlacement) rows.push(`- Source placement: ${config.sourcePlacement}`)
  if (typeof config.migrationCost === 'number') rows.push(`- Migration cost: ${config.migrationCost}`)
  if (typeof config.attestationThreshold === 'number') rows.push(`- Attestation threshold: ${config.attestationThreshold}`)
  if (typeof config.slotTime === 'number') rows.push(`- Slot time: ${config.slotTime}s`)
  if (typeof config.seed === 'number') rows.push(`- Seed: ${config.seed}`)

  return rows
}

function formatResultsTemplates(study: StudyPackage): string[] {
  return Object.entries(study.paperCharts)
    .slice(0, 8)
    .map(([dataKey, chart]) => {
      const dashboard = chart.dashboardId
        ? study.dashboards.find(candidate => candidate.id === chart.dashboardId)
        : null

      if (!dashboard) {
        return `- ${dataKey}: ${chart.takeaway}${chart.askAliases?.length ? ` Aliases: ${formatInlineList(chart.askAliases)}.` : ''}`
      }

      return `- ${dashboard.title} (${dashboard.pattern}) -> ${dataKey}: ${dashboard.questionAnswered} ${dashboard.summary}${dashboard.askMetricKey ? ` Lead metric: ${dashboard.askMetricKey}.` : ''}${chart.askAliases?.length ? ` Aliases: ${formatInlineList(chart.askAliases)}.` : ''}`
    })
}

function formatAssistantCapabilities(study: StudyPackage): string[] {
  return (study.assistant.capabilities ?? []).map(capability =>
    `- ${capability.title}${capability.state ? ` [${capability.state}]` : ''}: ${capability.description}${capability.prompts?.length ? ` Example prompts: ${formatInlineList(capability.prompts)}.` : ''}`,
  )
}

function formatAssistantPromptTips(study: StudyPackage): string[] {
  return (study.assistant.promptTips ?? []).map(tip =>
    `- ${tip.label}: ${tip.description}${tip.example ? ` Example: ${tip.example}` : ''}`,
  )
}

export function buildStudyContext(study: StudyPackage): string {
  const authors = study.metadata.authors.map(author => author.name).filter(Boolean)
  const featuredClaims = study.claims.featuredClaimIds
    .map(id => study.claims.claims.find(claim => claim.id === id))
    .filter((claim): claim is NonNullable<typeof claim> => claim !== undefined)
  const enabledSurfaces = study.surfaces.filter(surface => surface.enabled)
  const assistantPrompts = study.assistant.suggestedPrompts
    .slice(0, 6)
    .map(prompt => `- ${prompt.prompt}`)
  const referenceSetup = formatStudyConfig({
    ...study.runtime.defaultSimulationConfig,
    ...study.runtime.paperReferenceOverrides,
  })
  const interactiveDefaults = formatStudyConfig(study.runtime.defaultSimulationConfig)

  return `You are the research explorer for "${study.metadata.title}".

You help readers understand the active study package by composing visual blocks, reusing pre-computed Results surfaces when available, and keeping the answer grounded in the paper's actual claims, artifacts, and datasets.

## Study Snapshot
- Title: ${study.metadata.title}
- Subtitle: ${study.metadata.subtitle}
- Citation: ${study.metadata.citation}
- Authors: ${formatInlineList(authors)}
- Classification: ${study.classification}
- Abstract: ${study.metadata.abstract}

## Core Claims
${study.metadata.keyClaims.map(claim => `- ${claim}`).join('\n')}

## Featured Claims
${featuredClaims.map(claim => `- ${claim.text}`).join('\n')}

## Available Surfaces
${enabledSurfaces.map(surface => `- ${surface.title}: ${surface.purpose}`).join('\n')}

## Available Artifacts
${study.artifacts
    .slice(0, 12)
    .map(artifact => `- ${artifact.label} (${artifact.kind})${artifact.summary ? `: ${artifact.summary}` : ''}`)
    .join('\n')}

## Dashboard Metrics
${study.dashboardMetrics
    .map(metric => `- ${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`)
    .join('\n')}

## Results Templates
${formatResultsTemplates(study).join('\n')}

${study.assistant.capabilities?.length ? `\n## Assistant Capabilities\n${formatAssistantCapabilities(study).join('\n')}` : ''}

${study.assistant.promptTips?.length ? `\n## Prompt Guidance\n${formatAssistantPromptTips(study).join('\n')}` : ''}

## Response Guidelines
- The summary must directly answer the user's actual question in plain language.
- Treat curated topic cards, prior explorations, and exact outputs as evidence or scaffolding, not as the final user-visible answer by themselves.
- For quantitative questions, prefer pre-computed results and lead with 1-2 evidence blocks.
- When retrieved results span multiple scenarios or parameter settings, summarize the cross-scenario pattern with a chart or table before zooming into any single figure.
- For conceptual or orientation questions, lead with an insight or comparison block and use stats only when they materially sharpen the explanation.
- Put evidence blocks before interpretation whenever evidence exists.
- Use the supported renderer vocabulary: stat, insight, chart, comparison, table, map, timeseries, scatter, histogram, heatmap, stacked_bar, equation, paperChart, caveat, and source.
- Keep insight text concise and clearly labeled as interpretation or framing.
- Use at most 6 blocks and prefer 3-5 high-signal blocks.
- Add a cite object to every evidence block when the data traces to a specific paper section, figure, or table.
- Prefer exact labels, field names, and dataset wording from supplied artifacts or metadata over paraphrased summaries.
- If exact numbers are not directly supported in the current context, use directional language instead of invented precision.

## Prompt Coaching
- If the question is vague, reinterpret it into the most answerable bounded version and make that framing explicit.
- If the user asks about the project or explorer, answer at the product level too: what the study is about, what the main contrast or mechanism is, why it matters, and which surface to use next.
- Reward prompts that name a metric, claim, scenario, experiment, artifact, or comparison.
- Keep follow-up prompts concrete and reusable by a reader.

## Tool Workflow
- Search curated topic cards first when the question looks like a known paper finding, experiment, or metric explanation.
- Search prior explorations before generating a fresh answer if the question may already have been covered.
- Retrieve full topic cards or explorations before reusing them so you can inspect the actual blocks.
- Use query_cached_results when pre-computed results can answer the question without running a new simulation.
- If the user explicitly names more than one Results family or alias, retrieve each matching family before calling render_blocks.
- Use build_simulation_config when the user asks what to run, how to encode a scenario, or wants a paper-style preset.
- Use suggest_underexplored_topics only for idea generation or follow-up exploration prompts.
- Use render_blocks as the final step after gathering evidence.

## Results Surface Guidance
${study.assistant.resultsStyleGuidance?.trim() || 'When pre-computed results are available, prefer compact evidence-first layouts that feel like the study’s Results surface instead of a generic chatbot transcript.'}

## Reference Setup
${referenceSetup.join('\n')}

## Interactive Default
${interactiveDefaults.join('\n')}

## Starter Questions
${assistantPrompts.join('\n')}
${study.assistant.systemPromptSupplement?.trim() ? `\n\n${study.assistant.systemPromptSupplement.trim()}` : ''}`
}
