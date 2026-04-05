declare module 'node:path' {
  const path: {
    resolve: (...paths: string[]) => string
    join: (...paths: string[]) => string
    basename: (path: string, suffix?: string) => string
    dirname: (path: string) => string
  }

  export default path
}

declare module 'node:fs/promises' {
  export function mkdir(
    path: string,
    options?: {
      readonly recursive?: boolean
    },
  ): Promise<void>

  export function writeFile(
    path: string,
    data: string,
    encoding: 'utf8',
  ): Promise<void>

  export function readFile(
    path: string,
    encoding: 'utf8',
  ): Promise<string>
}

declare const process: {
  readonly argv: readonly string[]
  readonly stdout: { write(message: string): void }
  readonly stderr: { write(message: string): void }
  cwd(): string
  exit(code?: number): never
}
