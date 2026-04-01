declare const process: {
  readonly argv: readonly string[]
  readonly stdout: { write(message: string): void }
  readonly stderr: { write(message: string): void }
  exit(code?: number): never
}

const command = process.argv[2] ?? 'help'

const messages: Record<string, string> = {
  classify: 'Study generator classify pipeline is scaffolded but not implemented yet.',
  generate: 'Study generator generate pipeline is scaffolded but not implemented yet.',
  validate: 'Study generator validate pipeline is scaffolded but not implemented yet.',
  help: [
    'Usage: tsx src/cli.ts <command>',
    '',
    'Commands:',
    '  classify   Classify a paper and recommend a site shape',
    '  generate   Produce study-package, validation-report, and editorial-scorecard',
    '  validate   Validate an existing study package',
  ].join('\n'),
}

if (command in messages) {
  process.stdout.write(`${messages[command]}\n`)
  process.exit(0)
}

process.stderr.write(`Unknown command: ${command}\n`)
process.exit(1)
