import JSZip from 'jszip'
import {
  describePaperComparability,
  describeParadigmWithAlias,
  paperScenarioLabels,
} from '../components/simulation/simulation-constants'
import type { SimulationArtifact, SimulationManifest } from './simulation-api'

export interface LoadedSimulationArtifact {
  readonly artifact: SimulationArtifact
  readonly content: string
}

function buildReadme(manifest: SimulationManifest): string {
  const comparability = describePaperComparability(manifest.config)
  return [
    '# Exact Simulation Export',
    '',
    'This archive captures one exact simulation run in a portable, researcher-friendly bundle.',
    '',
    'Contents',
    `- paradigm: ${describeParadigmWithAlias(manifest.config.paradigm)}`,
    `- jobId: ${manifest.jobId}`,
    `- comparability: ${comparability.title}`,
    `- reference tags: ${paperScenarioLabels(manifest.config).join(' | ')}`,
    '',
    'Archive structure',
    '- export-package.json: full machine-readable envelope',
    '- run.json: top-level run identity and runtime metadata',
    '- comparability.json: paper-comparability framing for the run',
    '- config.json: exact run inputs',
    '- summary.json: top-line emitted exact metrics',
    '- manifest.json: full explorer manifest for the run',
    '- artifacts/manifest.json: artifact catalog and file mapping',
    '- artifacts/*: raw artifact payloads preserved as text',
    '',
    'Parsing notes',
    '- JSON artifacts are preserved as raw text so consumers can parse them in their own toolchain.',
    '- CSV artifacts are also preserved as raw text.',
    '- Artifact filenames are sanitized for archive portability; artifacts/manifest.json retains the original names.',
    '- overview bundles are not duplicated here because they are derived presentation layers, not the primary run data.',
  ].join('\n')
}

function sanitizeArchivePathSegment(value: string): string {
  return value
    .split('')
    .map(char => {
      const code = char.charCodeAt(0)
      if (code < 32) {
        return '-'
      }
      return char
    })
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
}

export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function buildSimulationExportPackage(
  manifest: SimulationManifest,
  loadedArtifacts: readonly LoadedSimulationArtifact[],
  exportedAt = new Date().toISOString(),
): Record<string, unknown> {
  const comparability = describePaperComparability(manifest.config)

  return {
    format: 'exact-simulation-export/v1',
    exportedAt,
    readme: buildReadme(manifest),
    run: {
      jobId: manifest.jobId,
      paradigm: describeParadigmWithAlias(manifest.config.paradigm),
      cacheKey: manifest.cacheKey,
      configHash: manifest.configHash,
      cacheHit: manifest.cacheHit,
      runtimeSeconds: manifest.runtimeSeconds,
    },
    comparability,
    referenceTags: paperScenarioLabels(manifest.config),
    config: manifest.config,
    summary: manifest.summary,
    manifest,
    artifacts: loadedArtifacts.map(({ artifact, content }) => ({
      name: artifact.name,
      label: artifact.label,
      kind: artifact.kind,
      description: artifact.description,
      contentType: artifact.contentType,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      lazy: artifact.lazy,
      renderable: artifact.renderable,
      content,
    })),
  }
}

export async function downloadSimulationExportArchive(
  filename: string,
  manifest: SimulationManifest,
  loadedArtifacts: readonly LoadedSimulationArtifact[],
): Promise<void> {
  const exportedAt = new Date().toISOString()
  const exportPackage = buildSimulationExportPackage(manifest, loadedArtifacts, exportedAt)
  const zip = new JSZip()

  zip.file('README.md', buildReadme(manifest))
  zip.file('export-package.json', JSON.stringify(exportPackage, null, 2))
  zip.file('run.json', JSON.stringify(exportPackage.run, null, 2))
  zip.file('comparability.json', JSON.stringify(exportPackage.comparability, null, 2))
  zip.file('reference-tags.json', JSON.stringify(exportPackage.referenceTags, null, 2))
  zip.file('config.json', JSON.stringify(manifest.config, null, 2))
  zip.file('summary.json', JSON.stringify(manifest.summary, null, 2))
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const artifactsFolder = zip.folder('artifacts')
  if (!artifactsFolder) {
    throw new Error('Unable to create artifacts folder for export archive.')
  }

  const artifactManifest = loadedArtifacts.map(({ artifact, content }) => {
    const archiveName = sanitizeArchivePathSegment(artifact.name)
    const archivePath = `artifacts/${archiveName}`
    artifactsFolder.file(archiveName, content)
    return {
      name: artifact.name,
      archivePath,
      label: artifact.label,
      kind: artifact.kind,
      description: artifact.description,
      contentType: artifact.contentType,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      lazy: artifact.lazy,
      renderable: artifact.renderable,
    }
  })

  artifactsFolder.file('manifest.json', JSON.stringify({
    exportedAt,
    count: artifactManifest.length,
    artifacts: artifactManifest,
  }, null, 2))

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  downloadBlobFile(filename, blob)
}
