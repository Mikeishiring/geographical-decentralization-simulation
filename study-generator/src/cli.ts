import {
  getDashboardPatternDescriptor,
  getSurfaceDescriptor,
} from '../../packages/study-schema/src/index.ts'
import { GOLDEN_FIXTURES } from './golden-fixtures.ts'
import { buildEditorialScorecard } from './scorecard.ts'
import { validateStudyPackage } from './validators/index.ts'

declare const process: {
  readonly argv: readonly string[]
  readonly stdout: { write(message: string): void }
  readonly stderr: { write(message: string): void }
  exit(code?: number): never
}

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
    return {
      id: fixture.id,
      studyPackage: fixture.study,
      validationReport: report,
      editorialScorecard: scorecard,
    }
  })

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

function printHelp(): void {
  process.stdout.write([
    'Usage: tsx src/cli.ts <command>',
    '',
    'Commands:',
    '  classify   Show golden archetypes and their expected site shapes',
    '  generate   Emit fixture study-package, validation-report, and editorial-scorecard bundles',
    '  validate   Run validation gates across the golden fixture studies',
  ].join('\n'))
  process.stdout.write('\n')
}

const command = process.argv[2] ?? 'help'

switch (command) {
  case 'classify':
    runClassify()
    process.exit(0)
  case 'generate':
    runGenerate()
    process.exit(0)
  case 'validate':
    runValidate()
    process.exit(0)
  case 'help':
    printHelp()
    process.exit(0)
  default:
    process.stderr.write(`Unknown command: ${command}\n`)
    process.exit(1)
}
