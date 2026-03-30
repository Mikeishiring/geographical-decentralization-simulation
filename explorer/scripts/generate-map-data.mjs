/**
 * Pre-compute map data from real project sources:
 * 1. Convert world_countries.geo.json → simplified SVG path data
 * 2. Aggregate validators.csv → validator counts per GCP region
 *
 * Usage: node explorer/scripts/generate-map-data.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', '..', 'data')

// Same Mercator projection as MapBlock.tsx
const SVG_W = 800
const SVG_H = 420

function latLonToMercator(lat, lon) {
  const x = ((lon + 180) / 360) * SVG_W
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = SVG_H / 2 - (mercN / Math.PI) * (SVG_H / 2)
  return { x, y }
}

// ── 1. Convert GeoJSON to SVG paths ──

console.log('Reading world_countries.geo.json...')
const geoRaw = readFileSync(join(DATA_DIR, 'world_countries.geo.json'), 'utf-8')
const geo = JSON.parse(geoRaw)

function coordsToPath(ring) {
  // Simplify: skip points that are too close in SVG space
  const points = ring.map(([lon, lat]) => latLonToMercator(lat, lon))
  if (points.length < 3) return ''

  const simplified = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = simplified[simplified.length - 1]
    const cur = points[i]
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    if (dx * dx + dy * dy > 4) { // min 2px distance
      simplified.push(cur)
    }
  }
  if (simplified.length < 3) return ''

  return simplified
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join('') + 'Z'
}

function geometryToPaths(geometry) {
  const paths = []
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      const d = coordsToPath(ring)
      if (d) paths.push(d)
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        const d = coordsToPath(ring)
        if (d) paths.push(d)
      }
    }
  }
  return paths
}

const allPaths = []
for (const feature of geo.features) {
  const paths = geometryToPaths(feature.geometry)
  allPaths.push(...paths)
}

console.log(`Generated ${allPaths.length} SVG paths from ${geo.features.length} countries`)

// Write as TypeScript module
const pathsTs = `/**
 * Auto-generated from data/world_countries.geo.json
 * Run: node explorer/scripts/generate-map-data.mjs
 *
 * SVG paths pre-computed for viewBox 0 0 ${SVG_W} ${SVG_H} (Mercator projection).
 * Each string is a complete <path d="..."> value.
 */
export const WORLD_PATHS: readonly string[] = ${JSON.stringify(allPaths)}
`

writeFileSync(
  join(__dirname, '..', 'src', 'data', 'world-paths.ts'),
  pathsTs,
  'utf-8',
)
console.log('Wrote explorer/src/data/world-paths.ts')

// ── 2. Aggregate validators by nearest GCP region ──

// Simple CSV parser that handles quoted fields
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return result
}

console.log('Reading gcp_regions.csv...')
const gcpRaw = readFileSync(join(DATA_DIR, 'gcp_regions.csv'), 'utf-8')
const gcpLines = gcpRaw.trim().split('\n').slice(1)
const gcpRegions = gcpLines.map(line => {
  const parts = parseCSVLine(line)
  // CSV: Region(0), Region Name(1), location(2), lat(3), lon(4), x(5), y(6), z(7)
  return {
    id: parts[0],
    lat: parseFloat(parts[3]),
    lon: parseFloat(parts[4]),
  }
})

console.log('Reading validators.csv...')
const valRaw = readFileSync(join(DATA_DIR, 'validators.csv'), 'utf-8')
const valLines = valRaw.trim().split('\n').slice(1)

// Aggregate validators by nearest GCP region
const regionCounts = new Map()
for (const region of gcpRegions) {
  regionCounts.set(region.id, 0)
}

let totalValidators = 0
let matched = 0

for (const line of valLines) {
  const parts = line.split(',')
  // CSV columns (0-indexed): peer_id(0),port(1),last_seen(2),last_seen_date(3),
  //   last_epoch(4),client_version(5),validator_count(6),validator_count_accuracy(7),
  //   total_observations(8),city(9),region(10),country(11),latitude(12),longitude(13)
  const valCount = parseInt(parts[6], 10)
  const lat = parseFloat(parts[12])
  const lon = parseFloat(parts[13])

  if (isNaN(valCount) || isNaN(lat) || isNaN(lon)) continue

  totalValidators += valCount

  // Find nearest GCP region
  let minDist = Infinity
  let nearest = gcpRegions[0].id
  for (const region of gcpRegions) {
    const dlat = lat - region.lat
    const dlon = lon - region.lon
    const dist = dlat * dlat + dlon * dlon
    if (dist < minDist) {
      minDist = dist
      nearest = region.id
    }
  }

  regionCounts.set(nearest, (regionCounts.get(nearest) ?? 0) + valCount)
  matched++
}

console.log(`Processed ${matched} validator nodes, ${totalValidators} total validators`)

// Sort by count descending
const sorted = [...regionCounts.entries()].sort((a, b) => b[1] - a[1])
console.log('Top 10 regions:')
for (const [id, count] of sorted.slice(0, 10)) {
  console.log(`  ${id}: ${count} validators`)
}

// Write as TypeScript map
const countsTs = `/**
 * Auto-generated from data/validators.csv — real Ethereum validator counts
 * aggregated by nearest GCP region.
 *
 * Run: node explorer/scripts/generate-map-data.mjs
 */
export const VALIDATOR_COUNTS: Readonly<Record<string, number>> = ${JSON.stringify(Object.fromEntries(sorted), null, 2)}
`

writeFileSync(
  join(__dirname, '..', 'src', 'data', 'validator-counts.ts'),
  countsTs,
  'utf-8',
)
console.log('Wrote explorer/src/data/validator-counts.ts')
