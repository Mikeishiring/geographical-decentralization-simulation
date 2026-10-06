import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { buildPublishedResultsWarehouseIndex, type PublishedDatasetDescriptor } from '../src/lib/results-warehouse.ts'

const explorer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(explorer, '..')
const out = path.join(explorer, 'dist')
const context = { window: {} as { RESEARCH_CATALOG?: { datasets: PublishedDatasetDescriptor[]; defaultSelection: { path: string } } } }
runInNewContext(await readFile(path.join(repo, 'dashboard/assets/research-catalog.js'), 'utf8'), context)
const catalog = context.window.RESEARCH_CATALOG!
const datasets = []
for (const descriptor of catalog.datasets) {
  const source = path.resolve(repo, 'dashboard', descriptor.path)
  if (!source.startsWith(path.resolve(repo, 'dashboard/simulations') + path.sep)) throw new Error('Unexpected dataset path')
  if ((await stat(source)).size >= 25 * 1024 * 1024) throw new Error(`Asset exceeds Cloudflare limit: ${descriptor.path}`)
  const payload = JSON.parse(await readFile(source, 'utf8'))
  datasets.push({ descriptor, payload })
  const destination = path.join(out, 'research-demo', descriptor.path)
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination)
}
await cp(path.join(repo, 'dashboard/assets'), path.join(out, 'research-demo/assets'), { recursive: true })
await mkdir(path.join(out, 'research-demo/data'), { recursive: true })
for (const name of ['gcp_regions.csv', 'world_countries.geo.json']) await cp(path.join(repo, 'data', name), path.join(out, 'research-demo/data', name))
for (const name of ['viewer.html', 'index.html']) await cp(path.join(repo, 'dashboard', name), path.join(out, 'research-demo', name))
await mkdir(path.join(out, 'data'), { recursive: true })
for (const name of ['validators.csv', 'gcp_regions.csv', 'gcp_latency.csv', 'world_countries.geo.json']) await cp(path.join(repo, 'data', name), path.join(out, 'data', name))
await writeFile(path.join(out, 'data/results-warehouse-index.json'), JSON.stringify(buildPublishedResultsWarehouseIndex(datasets, catalog.defaultSelection.path)))
await writeFile(path.join(out, '_headers'), '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/research-demo/*\n  Cache-Control: public, max-age=3600\n/data/*\n  Cache-Control: public, max-age=3600\n')
process.stdout.write(`Prepared ${datasets.length} recorded simulations for the Cloudflare demo.\n`)
