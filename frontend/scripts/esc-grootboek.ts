#!/usr/bin/env node
/**
 * Cross-fixture escalatie-grootboek.
 *
 * Leest tests/e2e/fixtures/<slug>/snapshot/<slug>.layers.json (geen re-run) en sorteert
 * geïnstrumenteerde ID's in de vier categorieën uit aanpak §4.
 *
 * Usage:
 *   node --experimental-strip-types scripts/esc-grootboek.ts
 *   node --experimental-strip-types scripts/esc-grootboek.ts --write-ledger
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..')
const FIXTURES_ROOT = path.join(FRONTEND_ROOT, 'tests/e2e/fixtures')
const LEDGER_PATH = path.join(REPO_ROOT, '.cursor/docs/escalatie.md')
const COVERAGE_PATH = path.join(REPO_ROOT, '.cursor/docs/archive/escalatie/coverage.md')

const MARKER_START = '<!-- BEGIN GENERATED GROOTBOEK -->'
const MARKER_END = '<!-- END GENERATED GROOTBOEK -->'

type LedgerBlock = {
  escalations: Record<string, number>
  levels: Record<string, number>
  degraded: boolean
}

type FixtureRow = {
  slug: string
  ledger: LedgerBlock
}

/** ID's die via journaal + harnas meetbaar zijn (uit coverage, of fallback-lijst). */
const FALLBACK_HARNESS_IDS = [
  'D-44',
  'D-45',
  'D-46',
  'D-47',
  'D-48',
  'D-49',
  'D-50',
  'D-51',
  'D-52',
  'D-53',
  'R-26',
  'R-27',
  'W-07',
  'W-13',
  'W-14',
  'X-01',
  'X-02',
  'X-22',
  'X-23',
]

type Bucket =
  | 'verwijderen' // 0 tekeningen, wel in bereik
  | 'promoveren' // alle tekeningen; primair/fallback asymmetrie
  | 'afbakenen' // alle tekeningen, beide niveaus
  | 'interview' // 1 van N
  | 'meerdere' // 2..N-1 van N

type IdAgg = {
  id: string
  fixturesFired: string[]
  total: number
  levels: Record<string, number>
  bucket: Bucket
  note: string
}

function listFixtureSlugs(): string[] {
  return fs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'node_modules')
    .map((d) => d.name)
    .filter((slug) => {
      const layers = path.join(FIXTURES_ROOT, slug, 'snapshot', `${slug}.layers.json`)
      return fs.existsSync(layers)
    })
    .sort()
}

/** Vitest/Prettier mag trailing commas in JSON-achtige snapshots laten staan. */
function parseLooseJson(text: string): unknown {
  const cleaned = text.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(cleaned)
}

function loadFixture(slug: string): FixtureRow {
  const layersPath = path.join(FIXTURES_ROOT, slug, 'snapshot', `${slug}.layers.json`)
  const raw = fs.readFileSync(layersPath, 'utf8')
  const parsed = parseLooseJson(raw) as {
    escalations?: {
      escalations?: Record<string, number>
      levels?: Record<string, number>
      degraded?: boolean
    }
  }
  const block = parsed.escalations ?? {}
  return {
    slug,
    ledger: {
      escalations: block.escalations ?? {},
      levels: block.levels ?? {},
      degraded: block.degraded === true,
    },
  }
}

function harnessIdsFromCoverage(): string[] | null {
  if (!fs.existsSync(COVERAGE_PATH)) return null
  const md = fs.readFileSync(COVERAGE_PATH, 'utf8')
  const section = md.split('## Geïnstrumenteerd + in harnas')[1]?.split('## ')[0]
  if (!section) return null
  const ids: string[] = []
  for (const line of section.split(/\r?\n/)) {
    const m = line.match(/^\|\s*((?:W|D|R|REF|O|X)-\d+)\s*\|/)
    if (m) ids.push(m[1]!)
  }
  return ids.length > 0 ? ids : null
}

function classify(agg: {
  fixturesFired: string[]
  fixtureCount: number
  levels: Record<string, number>
}): { bucket: Bucket; note: string } {
  const n = agg.fixturesFired.length
  const N = agg.fixtureCount
  if (n === 0) return { bucket: 'verwijderen', note: '0 tekeningen — kandidaat VERWIJDEREN' }
  if (n === 1) return { bucket: 'interview', note: `1/${N} — interview` }
  if (n < N) return { bucket: 'meerdere', note: `${n}/${N} — gedeeltelijk` }

  const levelKeys = Object.keys(agg.levels)
  const hasSampled = levelKeys.some((k) =>
    /:(sampled|path_a_hit|segment|swing_mask|pair|triple|measured)$/.test(k),
  )
  const hasFallback = levelKeys.some((k) =>
    /:(reference|zero|policyFallback|faceMedian|relaxed|legacy|evidence_missing|bounds)$/.test(k),
  )
  // W-07: alleen sampled → promoveren (fallback dood)
  // W-14: sampled+faceMedian, geen reference → promoveren dode niveaus
  const onlyPrimary =
    levelKeys.length > 0 &&
    levelKeys.every((k) =>
      /:(sampled|path_a_hit|segment|swing_mask|pair|triple|measured|measurement_discarded)$/.test(
        k,
      ),
    )

  if (onlyPrimary && /W-07|W-14|X-22/.test(levelKeys[0] ?? '')) {
    return {
      bucket: 'promoveren',
      note: 'alle fixtures; fallback-niveaus vuren nooit — kandidaat PROMOVEREN',
    }
  }
  if (hasSampled && hasFallback) {
    return { bucket: 'afbakenen', note: 'alle fixtures; meerdere niveaus — AFBAKENEN' }
  }
  return { bucket: 'afbakenen', note: 'alle fixtures — AFBAKENEN / documenteren' }
}

function aggregate(fixtures: FixtureRow[], harnessIds: string[]): IdAgg[] {
  const out: IdAgg[] = []
  for (const id of harnessIds) {
    const fixturesFired: string[] = []
    let total = 0
    const levels: Record<string, number> = {}
    for (const f of fixtures) {
      const count = f.ledger.escalations[id] ?? 0
      if (count > 0) {
        fixturesFired.push(f.slug)
        total += count
      }
      for (const [key, n] of Object.entries(f.ledger.levels)) {
        if (key.startsWith(`${id}:`)) {
          levels[key] = (levels[key] ?? 0) + n
        }
      }
    }
    const { bucket, note } = classify({
      fixturesFired,
      fixtureCount: fixtures.length,
      levels,
    })
    out.push({ id, fixturesFired, total, levels, bucket, note })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

function formatLevels(levels: Record<string, number>): string {
  const entries = Object.entries(levels).sort((a, b) => a[0].localeCompare(b[0]))
  if (entries.length === 0) return '—'
  return entries.map(([k, n]) => `${k.split(':').slice(1).join(':')}=${n}`).join(', ')
}

function renderMarkdown(fixtures: FixtureRow[], aggs: IdAgg[]): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = [
    `### Cross-fixture grootboek (${date})`,
    '',
    `Fixtures: ${fixtures.map((f) => f.slug).join(', ')} (${fixtures.length}).`,
    'Bron: `<slug>.layers.json` escalations — geen re-run.',
    '',
    '| Bucket | Betekenis |',
    '|---|---|',
    '| VERWIJDEREN | 0 tekeningen, wel in harnas |',
    '| PROMOVEREN | alle tekeningen; fallback-niveau vuurt nooit |',
    '| AFBAKENEN | alle tekeningen; pad blijft |',
    '| interview | precies 1 tekening |',
    '| meerdere | 2 .. N−1 tekeningen |',
    '',
  ]

  const order: Bucket[] = ['verwijderen', 'promoveren', 'interview', 'meerdere', 'afbakenen']
  const titles: Record<Bucket, string> = {
    verwijderen: 'Kandidaat VERWIJDEREN (0/N)',
    promoveren: 'Kandidaat PROMOVEREN',
    interview: 'Interview (1/N)',
    meerdere: 'Gedeeltelijk (k/N)',
    afbakenen: 'AFBAKENEN / overal',
  }

  for (const bucket of order) {
    const rows = aggs.filter((a) => a.bucket === bucket)
    lines.push(`#### ${titles[bucket]} (${rows.length})`, '')
    if (rows.length === 0) {
      lines.push('_geen_', '')
      continue
    }
    lines.push('| ID | Tekeningen | Totaal | Niveaus | Notitie |')
    lines.push('|---|---|---|---|---|')
    for (const a of rows) {
      const drawings =
        a.fixturesFired.length === 0
          ? '—'
          : a.fixturesFired.length === fixtures.length
            ? 'alle'
            : a.fixturesFired.join(', ')
      lines.push(`| ${a.id} | ${drawings} | ${a.total} | ${formatLevels(a.levels)} | ${a.note} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function writeLedgerSection(body: string): void {
  let ledger = fs.existsSync(LEDGER_PATH) ? fs.readFileSync(LEDGER_PATH, 'utf8') : ''
  const block = `${MARKER_START}\n\n${body}\n${MARKER_END}`
  if (ledger.includes(MARKER_START) && ledger.includes(MARKER_END)) {
    ledger = ledger.replace(new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`), block)
  } else {
    ledger = ledger.trimEnd() + '\n\n## Gegenereerd grootboek\n\n' + block + '\n'
  }
  fs.writeFileSync(LEDGER_PATH, ledger, 'utf8')
  console.log(`Ledger bijgewerkt: ${LEDGER_PATH}`)
}

function main(): void {
  const writeLedger = process.argv.includes('--write-ledger')
  const slugs = listFixtureSlugs()
  if (slugs.length === 0) {
    console.error('Geen fixtures met layers.json gevonden')
    process.exit(1)
  }
  const fixtures = slugs.map(loadFixture)
  const harnessIds = harnessIdsFromCoverage() ?? FALLBACK_HARNESS_IDS
  // Unie: coverage-lijst + alles wat in snapshots voorkomt (zodat D-45 e.d. meegenomen worden).
  const seenInSnapshots = new Set<string>()
  for (const f of fixtures) {
    for (const id of Object.keys(f.ledger.escalations)) seenInSnapshots.add(id)
    for (const key of Object.keys(f.ledger.levels)) {
      const id = key.split(':')[0]
      if (id) seenInSnapshots.add(id)
    }
  }
  const idSet = new Set([...harnessIds, ...FALLBACK_HARNESS_IDS, ...seenInSnapshots])
  const aggs = aggregate(
    fixtures,
    [...idSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  )
  const md = renderMarkdown(fixtures, aggs)
  console.log(md)
  if (writeLedger) writeLedgerSection(md)
}

main()
