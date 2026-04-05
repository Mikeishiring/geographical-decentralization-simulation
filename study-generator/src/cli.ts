import {
  buildStudyAssemblyPlan,
  getDashboardPatternDescriptor,
  getSurfaceDescriptor,
} from '../../packages/study-schema/src/index.ts'
import { GOLDEN_FIXTURES } from './golden-fixtures.ts'
import { buildStudyProjectSlotMap } from './project-slots.ts'
import {
  draftStudyFromIntake,
  parseDraftOptions,
} from './draft.ts'
import {
  listScaffoldTemplates,
  parseScaffoldOptions,
  scaffoldStudy,
} from './scaffold.ts'
import { buildEditorialScorecard } from './scorecard.ts'
import { validateStudyPackage } from './validators/index.ts'

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function runClassify(): void {
  const output = GOLDEN_FIXTURES.map(fixture => ({
    id: fixture.id,
    name: fixture.name,
    classification: fixture.study.classification,
    runtimeAdapter: fixture.expectation.runtimeAdapter,
    includedSurfaces: fixture.expectation.includedSurfaces.map(surfaceId => ({
      id: surfaceId,
      title: getSurfaceDescriptor(surfaceId).title,
    })),
    dashboardPatterns: fixture.expectation.dashboardPatterns.map(pattern => ({
      pattern,
      title: getDashboardPatternDescriptor(pattern).title,
    })),
  }))

  process.stdout.write(formatJson(output))
}

function runGenerate(): void {
  const output = GOLDEN_FIXTURES.map(fixture => {
    const report = validateStudyPackage(fixture.study)
    const scorecard = buildEditorialScorecard(fixture.study, report)
    const assemblyPlan = buildStudyAssemblyPlan(fixture.study)
    return {
      id: fixture.id,
      studyPackage: fixture.study,
      validationReport: report,
      editorialScorecard: scorecard,
      assemblyPlan,
    }
  })

  process.stdout.write(formatJson(output))
}

function runExplain(): void {
  const output = GOLDEN_FIXTURES.map(fixture => ({
    id: fixture.id,
    name: fixture.name,
    assemblyPlan: buildStudyAssemblyPlan(fixture.study),
  }))

  process.stdout.write(formatJson(output))
}

function runSlots(): void {
  const output = GOLDEN_FIXTURES.map(fixture => ({
    id: fixture.id,
    name: fixture.name,
    projectSlotMap: buildStudyProjectSlotMap(fixture.study, {
      bundleOutDir: `study-generator/fixtures/${fixture.id}`,
    }),
  }))

  process.stdout.write(formatJson(output))
}

function runValidate(): void {
  const output = GOLDEN_FIXTURES.map(fixture => {
    const report = validateStudyPackage(fixture.study)
    const scorecard = buildEditorialScorecard(fixture.study, report)
    return {
      id: fixture.id,
      passed: report.gates.every(gate => gate.passed),
      gateSummary: report.gates.map(gate => ({
        id: gate.id,
        passed: gate.passed,
        findingCount: gate.findings.length,
      })),
      overallScore: scorecard.overallScore,
    }
  })

  process.stdout.write(formatJson(output))
}

function runTemplates(): void {
  const output = listScaffoldTemplates().map(template => ({
    id: template.id,
    classification: template.classification,
    title: template.title,
    description: template.description,
    runtimeAdapter: template.runtimeAdapter,
    includedSurfaces: template.includedSurfaces,
    dashboardPatterns: template.dashboardPatterns,
    requiredArtifactKinds: template.requiredArtifactKinds,
  }))

  process.stdout.write(formatJson(output))
}

async function runScaffold(): Promise<void> {
  const options = parseScaffoldOptions(process.argv.slice(3), process.cwd())
  const result = await scaffoldStudy(options)
  process.stdout.write(formatJson(result))
}

async function runDraft(): Promise<void> {
  const options = parseDraftOptions(process.argv.slice(3), process.cwd())
  const result = await draftStudyFromIntake(options)
  process.stdout.write(formatJson(result))
}

function printHelp(): void {
  process.stdout.write([
    'Usage: tsx src/cli.ts <command>',
    '',
    'Commands:',
    '  classify   Show golden archetypes and their expected site shapes',
    '  generate   Emit fixture study-package, validation-report, editorial-scorecard, and assembly-plan bundles',
    '  explain    Emit the layered assembly plan used to understand how a study becomes a website',
    '  slots      Emit the project slot map showing where generated pieces land in this repo',
    '  templates  List reusable spin-up templates by study class',
    '  scaffold   Write a starter study package/module layout to disk',
    '  draft      Read a study intake JSON file and emit a first-pass study package bundle',
    '  validate   Run validation gates across the golden fixture studies',
    '',
    'Scaffold options:',
    '  --classification=<study-class>',
    '  --title=<reader-facing title>',
    '  --id=<study-id>',
    '  --outDir=<output directory>',
    '',
    'Draft options:',
    '  --intake=<path to intake json>',
    '  --classification=<study-class override>',
    '  --outDir=<output directory>',
  ].join('\n'))
  process.stdout.write('\n')
}

const command = process.argv[2] ?? 'help'

try {
  switch (command) {
    case 'classify':
      runClassify()
      break
    case 'generate':
      runGenerate()
      break
    case 'explain':
      runExplain()
      break
    case 'slots':
      runSlots()
      break
    case 'templates':
      runTemplates()
      break
    case 'scaffold':
      await runScaffold()
      break
    case 'draft':
      await runDraft()
      break
    case 'validate':
      runValidate()
      break
    case 'help':
      printHelp()
      break
    default:
      process.stderr.write(`Unknown command: ${command}\n`)
      process.exit(1)
  }

  process.exit(0)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
