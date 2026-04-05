import path from 'node:path'
import type {
  StudyClaim,
  StudyDashboardMetric,
  StudyDashboardSpec,
  StudyPackageFrame,
  StudySpinupTemplate,
} from '../../packages/study-schema/src/index.ts'
import type { GeneratedTextFile } from './scaffold.ts'
import type { StudyProjectSlotMap } from './project-slots.ts'

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'generated'
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function serializeTypeScriptValue(value: unknown, indent = 0): string {
  const spacing = '  '.repeat(indent)
  const childSpacing = '  '.repeat(indent + 1)

  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return [
      '[',
      ...value.map(item => `${childSpacing}${serializeTypeScriptValue(item, indent + 1)},`),
      `${spacing}]`,
    ].join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    return [
      '{',
      ...entries.map(([key, entryValue]) =>
        `${childSpacing}${JSON.stringify(key)}: ${serializeTypeScriptValue(entryValue, indent + 1)},`,
      ),
      `${spacing}}`,
    ].join('\n')
  }

  return 'undefined'
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`
}

function quoteForPull(value: string): string {
  return truncate(value, 180)
}

function listClaimTexts(claims: readonly StudyClaim[], count: number): readonly string[] {
  return claims.slice(0, count).map(claim => claim.text)
}

function buildIntroBlocks(study: StudyPackageFrame): readonly Record<string, unknown>[] {
  return [
    {
      type: 'stat',
      value: String(study.artifacts.length),
      label: 'Artifacts',
      sublabel: 'Sources attached to the generated study package',
    },
    {
      type: 'stat',
      value: String(study.claims.claims.length),
      label: 'Claims',
      sublabel: 'Grounded claims available to the website',
    },
    {
      type: 'stat',
      value: String(study.dashboards.length),
      label: 'Dashboards',
      sublabel: 'Result views available for adapter scaffolding',
    },
    {
      type: 'insight',
      emphasis: 'key-finding',
      title: 'Generated overview',
      text: study.metadata.abstract || study.metadata.keyClaims[0] || 'Replace this with the strongest paper-backed framing for the study.',
    },
    {
      type: 'source',
      refs: study.metadata.references.slice(0, 4),
    },
  ]
}

function buildSectionClaimSummary(
  study: StudyPackageFrame,
  dashboard: StudyDashboardSpec,
): readonly StudyClaim[] {
  const claimIds = new Set(dashboard.claimIds)
  return study.claims.claims.filter(claim => claimIds.has(claim.id))
}

function buildGeneratedSections(study: StudyPackageFrame): readonly Record<string, unknown>[] {
  const sections: Record<string, unknown>[] = [
    {
      id: 'generated-overview',
      number: '§0',
      title: 'Generated Overview',
      description: 'Auto-generated entry section derived from the study package metadata and top claims.',
      category: 'methodology',
      blocks: buildIntroBlocks(study),
    },
  ]

  if (study.dashboards.length > 0) {
    study.dashboards.forEach((dashboard, index) => {
      const sectionClaims = buildSectionClaimSummary(study, dashboard)
      const leadClaim = sectionClaims[0]?.text ?? dashboard.questionAnswered
      const truthBoundary = sectionClaims.find(claim => claim.truthBoundary)?.truthBoundary

      sections.push({
        id: dashboard.id,
        number: `§R${index + 1}`,
        title: dashboard.title,
        description: dashboard.questionAnswered,
        category: 'finding',
        blocks: [
          {
            type: 'paperChart',
            title: dashboard.title,
            dataKey: dashboard.id,
          },
          {
            type: 'insight',
            emphasis: dashboard.isFigureReplay ? 'key-finding' : 'normal',
            title: 'Why this result matters',
            text: leadClaim,
          },
          {
            type: 'table',
            title: 'Dashboard grounding',
            headers: ['Field', 'Generated value'],
            rows: [
              ['Pattern', dashboard.pattern],
              ['Question', dashboard.questionAnswered],
              ['Source artifacts', dashboard.sourceArtifactIds.join(', ') || 'Replace with source artifacts'],
              ['Claim ids', dashboard.claimIds.join(', ') || 'Replace with linked claims'],
            ],
          },
          ...(truthBoundary
            ? [{
                type: 'caveat',
                text: truthBoundary,
              }]
            : []),
        ],
      })
    })
  } else {
    const fallbackClaims = study.claims.claims.slice(0, 3)
    fallbackClaims.forEach((claim, index) => {
      sections.push({
        id: slugify(claim.id),
        number: `§C${index + 1}`,
        title: `Claim ${index + 1}`,
        description: 'Generated claim section for studies without explicit dashboard specs.',
        category: claim.truthBoundary ? 'caveat' : 'finding',
        blocks: [
          {
            type: 'insight',
            emphasis: claim.truthBoundary ? 'normal' : 'key-finding',
            title: `Claim ${index + 1}`,
            text: claim.text,
          },
          ...(claim.truthBoundary
            ? [{
                type: 'caveat',
                text: claim.truthBoundary,
              }]
            : []),
        ],
      })
    })
  }

  const limitations = study.claims.claims.filter(claim => Boolean(claim.truthBoundary))
  if (limitations.length > 0) {
    sections.push({
      id: 'generated-limitations',
      number: '§L',
      title: 'Generated Limitations',
      description: 'Truth boundaries and limitations pulled from caveat claims in the study package.',
      category: 'caveat',
      blocks: limitations.map(claim => ({
        type: 'caveat',
        text: claim.truthBoundary ?? claim.text,
      })),
    })
  }

  return sections
}

function buildGeneratedNarratives(
  study: StudyPackageFrame,
  sections: readonly Record<string, unknown>[],
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    sections.map(section => {
      const sectionId = String(section.id)
      const matchingDashboard = study.dashboards.find(dashboard => dashboard.id === sectionId)
      const matchingClaims = matchingDashboard
        ? buildSectionClaimSummary(study, matchingDashboard)
        : study.claims.claims.filter(claim => slugify(claim.id) === sectionId)
      const firstClaim = matchingClaims[0]?.text ?? study.metadata.keyClaims[0] ?? study.metadata.abstract
      const sectionDescription = String(section.description ?? '')

      return [sectionId, {
        lede: sectionDescription || firstClaim || `Generated narrative for ${String(section.title)}.`,
        paragraphs: [
          matchingDashboard?.summary
            ?? sectionDescription
            ?? 'Replace this paragraph with the strongest paper-backed explanation for the section.',
          ...listClaimTexts(matchingClaims, 2),
        ].filter(Boolean),
        pullQuote: quoteForPull(firstClaim || `Replace this with the strongest line for ${String(section.title)}.`),
        figureCaption: matchingDashboard?.summary
          ?? `Replace this caption with the clearest figure or evidence description for ${String(section.title)}.`,
        keyClaim: firstClaim ? truncate(firstClaim, 80) : undefined,
      }]
    }),
  )
}

function themeForStudy(study: StudyPackageFrame): string {
  switch (study.classification) {
    case 'simulation':
      return 'methodology'
    case 'theory-mechanism':
      return 'caveat'
    default:
      return 'finding'
  }
}

function buildGeneratedOverviewCard(
  study: StudyPackageFrame,
  sections: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id: 'generated-overview',
    title: `Start with ${study.metadata.title}`,
    description: 'Generated entry card derived from study metadata, claims, and dashboards.',
    theme: themeForStudy(study),
    prompts: study.assistant.suggestedPrompts.length > 0
      ? study.assistant.suggestedPrompts.slice(0, 6).map(prompt => prompt.prompt)
      : study.metadata.keyClaims.slice(0, 6),
    blocks: (sections[0]?.blocks as readonly unknown[] | undefined) ?? buildIntroBlocks(study),
  }
}

function buildGeneratedTopicCards(
  study: StudyPackageFrame,
  sections: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  const detailedSections = sections.slice(1, 5)
  return detailedSections.map((section, index) => ({
    id: String(section.id),
    title: String(section.title),
    description: String(section.description ?? 'Generated topic card.'),
    theme: index === detailedSections.length - 1 && String(section.id).includes('limit')
      ? 'caveat'
      : themeForStudy(study),
    prompts: study.assistant.suggestedPrompts.slice(index, index + 3).map(prompt => prompt.prompt),
    blocks: section.blocks as readonly unknown[] | undefined ?? [],
  }))
}

function buildMetricDataset(metric: StudyDashboardMetric, index: number): Record<string, unknown> {
  const colorPalette = ['#2563EB', '#E76F51', '#0F766E', '#7C3AED']
  return {
    label: metric.label,
    color: colorPalette[index % colorPalette.length],
    dashed: false,
    gini: [],
    hhi: [],
    liveness: [],
    cv: [],
  }
}

function buildGeneratedPaperCharts(study: StudyPackageFrame): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    study.dashboards.map(dashboard => {
      const metrics = study.dashboardMetrics.filter(metric => dashboard.metricIds.includes(metric.id))
      const datasetSummary = dashboard.sourceArtifactIds
        .map(artifactId => study.artifacts.find(artifact => artifact.id === artifactId))
        .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
      const leadClaim = study.claims.claims.find(claim => dashboard.claimIds.includes(claim.id))

      return [dashboard.id, {
        data: {
          id: dashboard.id,
          datasets: metrics.length > 0
            ? metrics.map((metric, index) => buildMetricDataset(metric, index))
            : [{
                label: dashboard.title,
                color: '#2563EB',
                dashed: false,
                gini: [],
                hhi: [],
                liveness: [],
                cv: [],
              }],
        },
        dashboardId: dashboard.id,
        askAliases: [dashboard.title, dashboard.questionAnswered],
        description: dashboard.summary,
        takeaway: leadClaim?.text ?? dashboard.questionAnswered,
        metadata: [
          `Pattern: ${dashboard.pattern}`,
          ...datasetSummary.map(artifact => `Artifact: ${artifact.label}`),
        ],
        figureHref: '#',
        figureLabel: dashboard.title,
        datasetSummary: datasetSummary.map(artifact => artifact.label).join(', ') || 'Replace with dataset summary',
        repoPaths: datasetSummary
          .map(artifact => artifact.path)
          .filter((value): value is string => Boolean(value)),
      }]
    }),
  )
}

function renderExplorerAdapterReadme(input: {
  readonly study: StudyPackageFrame
  readonly template: StudySpinupTemplate
  readonly slotMap: StudyProjectSlotMap
}): string {
  const readySlots = input.slotMap.slots.filter(slot => slot.status === 'ready').length

  return [
    `# Explorer Adapter For ${input.study.metadata.title}`,
    '',
    'This folder is a safe handoff bundle for turning the generated study package into the current explorer study-module shape.',
    '',
    `Template: ${input.template.id}`,
    `Ready slots: ${readySlots}/${input.slotMap.slots.length}`,
    '',
    '## Files',
    '',
    '- `study-package.stub.ts`: starter object that combines the shared frame with generated explorer wrappers',
    '- `sections.stub.ts`: generated paper/deep-dive sections',
    '- `narratives.stub.ts`: generated narrative copy per section',
    '- `topic-cards.stub.ts`: generated overview card and topic cards',
    '- `paper-charts.stub.ts`: generated chart manifest stubs keyed by dashboard id',
    '',
    '## Intended flow',
    '',
    '1. Review the generated sections, narratives, and cards against the paper.',
    '2. Move this folder under `explorer/src/studies/<study-id>/` when you are ready to integrate a new site.',
    '3. Register the resulting study package in `explorer/src/studies/index.ts` and select it with `STUDY_ID` / `VITE_STUDY_ID`.',
    '',
    '## Slot summary',
    '',
    ...input.slotMap.summary.map(line => `- ${line}`),
    '',
  ].join('\n')
}

function renderStudyPackageStub(
  study: StudyPackageFrame,
): string {
  const constName = `${toPascalCase(study.id)}GeneratedStudyFrame`
  const literal = serializeTypeScriptValue(study)

  return [
    "import { GENERATED_SECTIONS } from './sections.stub'",
    "import { GENERATED_NARRATIVES } from './narratives.stub'",
    "import { GENERATED_OVERVIEW_CARD, GENERATED_TOPIC_CARDS } from './topic-cards.stub'",
    "import { GENERATED_PAPER_CHARTS } from './paper-charts.stub'",
    '',
    `export const ${constName} = ${literal}`,
    '',
    'export const GENERATED_STUDY_PACKAGE = {',
    `  ...${constName},`,
    '  sections: GENERATED_SECTIONS,',
    '  narratives: GENERATED_NARRATIVES,',
    '  overviewCard: GENERATED_OVERVIEW_CARD,',
    '  topicCards: GENERATED_TOPIC_CARDS,',
    '  paperCharts: GENERATED_PAPER_CHARTS,',
    '}',
    '',
  ].join('\n')
}

function renderConstFile(name: string, value: unknown): string {
  return [
    `export const ${name} = ${serializeTypeScriptValue(value)}`,
    '',
  ].join('\n')
}

export function buildExplorerAdapterFiles(input: {
  readonly study: StudyPackageFrame
  readonly template: StudySpinupTemplate
  readonly outDir: string
  readonly slotMap: StudyProjectSlotMap
}): readonly GeneratedTextFile[] {
  const adapterDir = path.join(input.outDir, 'explorer-adapter')
  const sections = buildGeneratedSections(input.study)
  const narratives = buildGeneratedNarratives(input.study, sections)
  const overviewCard = buildGeneratedOverviewCard(input.study, sections)
  const topicCards = buildGeneratedTopicCards(input.study, sections)
  const paperCharts = buildGeneratedPaperCharts(input.study)

  return [
    {
      path: path.join(adapterDir, 'README.md'),
      content: renderExplorerAdapterReadme(input),
    },
    {
      path: path.join(adapterDir, 'sections.stub.ts'),
      content: renderConstFile('GENERATED_SECTIONS', sections),
    },
    {
      path: path.join(adapterDir, 'narratives.stub.ts'),
      content: renderConstFile('GENERATED_NARRATIVES', narratives),
    },
    {
      path: path.join(adapterDir, 'topic-cards.stub.ts'),
      content: [
        renderConstFile('GENERATED_OVERVIEW_CARD', overviewCard).trimEnd(),
        '',
        renderConstFile('GENERATED_TOPIC_CARDS', topicCards),
      ].join('\n'),
    },
    {
      path: path.join(adapterDir, 'paper-charts.stub.ts'),
      content: renderConstFile('GENERATED_PAPER_CHARTS', paperCharts),
    },
    {
      path: path.join(adapterDir, 'study-package.stub.ts'),
      content: renderStudyPackageStub(input.study),
    },
  ]
}
