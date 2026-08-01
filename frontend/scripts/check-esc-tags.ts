#!/usr/bin/env node
/**
 * ESC-tag checker: houdt inventaris-ID's en `// ESC:<ID> (<Cat>)` tags synchroon.
 *
 * Usage:
 *   node --experimental-strip-types scripts/check-esc-tags.ts --check
 *   node --experimental-strip-types scripts/check-esc-tags.ts --report
 *   node --experimental-strip-types scripts/check-esc-tags.ts --coverage
 *   node --experimental-strip-types scripts/check-esc-tags.ts --write-index
 *   node --experimental-strip-types scripts/check-esc-tags.ts --write-ids
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..')
const INVENTORY_PATH = path.join(REPO_ROOT, '.cursor/docs/escalatiepaden-inventaris.md')
const SRC_ROOT = path.join(FRONTEND_ROOT, 'src')
const TAGINDEX_PATH = path.join(REPO_ROOT, '.cursor/docs/archive/escalatie/tagindex.md')
const COVERAGE_PATH = path.join(REPO_ROOT, '.cursor/docs/archive/escalatie/coverage.md')
const IDS_OUT_PATH = path.join(FRONTEND_ROOT, 'src/core/diagnostics/escalation-ids.generated.ts')

const ID_RE = /^(W|D|R|REF|O|X)-\d+$/
const TAG_RE = /\bESC:([A-Z]+-\d+)\s*\(([A-FP])\)/g
const ROW_ID_RE = /^\|\s*((?:W|D|R|REF|O|X)-\d+)\s*\|/
/** Journaal-callsites: eerste arg is ESC-ID-literal. */
const JOURNAL_CALL_RE =
  /\b(?:escalate|tally|noteSwallowedError|noteRollback|noteMissingMeasurement|noteDiscardedMeasurement|noteEvidenceMissing|noteGatesDisabled|noteCascadeLevel)\s*\(\s*['"]((?:W|D|R|REF|O|X)-\d+)['"]/g
/** Path-A cascade: noteCascadeLevel(pathASource, …) dekt D-44/D-46. */
const PATH_A_SOURCE_RE = /noteCascadeLevel\s*\(\s*pathASource\b/

/**
 * Bestanden die `runWalls` + `runOpenings` daadwerkelijk bereiken.
 * Deuren Stage 1/2, ramen Stage 1–4, refs en UI vallen erbuiten (gebakken lijsten).
 */
const HARNESS_REACHABLE: RegExp[] = [
  /^cv\/walls\/rooms\/pipeline-v3\//,
  /^cv\/walls\/rooms\/build-semantic-walls/,
  /^cv\/walls\/rooms\/room-wall-segment-thickness/,
  /^core\/fml\//,
  /^cv\/doors\/door-wall-snap/,
  /^cv\/doors\/door-swing-mask/,
  /^cv\/doors\/door-l12/,
  /^cv\/doors\/door-wall-orient/,
  /^cv\/doors\/door-kept/,
  /^cv\/doors\/door-attach/,
  /^cv\/windows\/window-wall-bind/,
  /^cv\/windows\/window-wall-merge/,
]

/** Inventaris-tabellen zonder Cat-kolom: vaste toewijzing (zie escalatie.md §3). */
const FORCED_CATEGORY: Record<string, string> = {
  'D-01': 'C',
  'D-02': 'C',
  'D-03': 'C',
  'D-04': 'C',
  'D-05': 'C',
  'D-06': 'C',
  'D-07': 'C',
  'D-08': 'C',
  'D-44': 'P',
  'O-01': 'D',
  'O-02': 'D',
  'O-03': 'D',
  'O-04': 'D',
  'O-31': 'D',
  'O-32': 'D',
  'O-33': 'D',
  'O-34': 'D',
  'O-35': 'D',
  'O-36': 'D',
  'O-37': 'D',
  'O-38': 'D',
  'O-39': 'D',
  'O-40': 'D',
  'O-41': 'D',
  'O-42': 'B',
  'O-43': 'B',
  'O-44': 'B',
  'O-45': 'B',
  'O-46': 'B',
}

type InventoryId = { id: string; cat: string; cluster: string }
type TagHit = { id: string; cat: string; file: string; line: number }
type JournalHit = { id: string; file: string; line: number }

function clusterOf(id: string): string {
  if (id.startsWith('W-')) return 'W'
  if (id.startsWith('D-')) return 'D'
  if (id.startsWith('R-')) return 'R'
  if (id.startsWith('REF-')) return 'REF'
  if (id.startsWith('O-')) return 'O'
  if (id.startsWith('X-')) return 'X'
  return '?'
}

function isHarnessReachable(relFile: string): boolean {
  return HARNESS_REACHABLE.some((re) => re.test(relFile))
}

function parseInventory(md: string): Map<string, InventoryId> {
  const out = new Map<string, InventoryId>()
  const lines = md.split(/\r?\n/)
  let catCol = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('|') && /\|.*\bID\b.*\|/i.test(line) && lines[i + 1]?.startsWith('|---')) {
      const headers = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      catCol = headers.findIndex((h) => /^Cat$/i.test(h))
      continue
    }
    if (line.startsWith('|---')) continue

    const m = line.match(ROW_ID_RE)
    if (!m) continue
    const id = m[1]!
    if (!ID_RE.test(id)) continue

    let cat = FORCED_CATEGORY[id]
    if (!cat && catCol >= 0) {
      const cols = line
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      const raw = cols[catCol] ?? ''
      const letter = raw.match(/\b([A-F])\b/)
      if (letter) cat = letter[1]!
      else if (/primair/i.test(raw) || raw === '—' || raw === '-') cat = FORCED_CATEGORY[id] ?? 'P'
    }
    if (!cat) cat = FORCED_CATEGORY[id] ?? '?'

    out.set(id, { id, cat, cluster: clusterOf(id) })
  }
  return out
}

function walkSrc(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'archive' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSrc(full, acc)
    else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) acc.push(full)
  }
  return acc
}

function scanTags(files: string[]): TagHit[] {
  const hits: TagHit[] = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    const rel = path.relative(SRC_ROOT, file).replace(/\\/g, '/')
    for (let i = 0; i < lines.length; i++) {
      TAG_RE.lastIndex = 0
      let m: RegExpExecArray | null
      const line = lines[i]!
      while ((m = TAG_RE.exec(line)) !== null) {
        hits.push({ id: m[1]!, cat: m[2]!, file: rel, line: i + 1 })
      }
    }
  }
  return hits
}

/** Open journaal-call zonder ID op dezelfde regel → scan volgende regels. */
const JOURNAL_OPEN_RE =
  /\b(?:escalate|tally|noteSwallowedError|noteRollback|noteMissingMeasurement|noteDiscardedMeasurement|noteEvidenceMissing|noteGatesDisabled|noteCascadeLevel)\s*\(\s*$/
const JOURNAL_ID_LITERAL_RE = /['"]((?:W|D|R|REF|O|X)-\d+)['"]/
const MULTILINE_LOOKAHEAD = 6

function scanJournalCalls(files: string[]): JournalHit[] {
  const hits: JournalHit[] = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    const rel = path.relative(SRC_ROOT, file).replace(/\\/g, '/')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      JOURNAL_CALL_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = JOURNAL_CALL_RE.exec(line)) !== null) {
        hits.push({ id: m[1]!, file: rel, line: i + 1 })
      }
      if (JOURNAL_OPEN_RE.test(line)) {
        for (let j = 1; j <= MULTILINE_LOOKAHEAD && i + j < lines.length; j++) {
          const next = lines[i + j]!
          const idMatch = JOURNAL_ID_LITERAL_RE.exec(next)
          if (idMatch) {
            hits.push({ id: idMatch[1]!, file: rel, line: i + 1 })
            break
          }
          if (next.includes(')')) break
        }
      }
      if (PATH_A_SOURCE_RE.test(line)) {
        for (const id of ['D-44', 'D-46'] as const) {
          hits.push({ id, file: rel, line: i + 1 })
        }
      }
    }
  }
  return hits
}

function compare(
  inventory: Map<string, InventoryId>,
  hits: TagHit[],
): {
  missing: string[]
  unknown: TagHit[]
  catMismatch: { id: string; expected: string; found: string; file: string; line: number }[]
  noCat: TagHit[]
  byId: Map<string, TagHit[]>
} {
  const byId = new Map<string, TagHit[]>()
  for (const h of hits) {
    const list = byId.get(h.id) ?? []
    list.push(h)
    byId.set(h.id, list)
  }

  const missing: string[] = []
  for (const id of inventory.keys()) {
    if (!byId.has(id)) missing.push(id)
  }
  missing.sort()

  const unknown: TagHit[] = []
  const catMismatch: {
    id: string
    expected: string
    found: string
    file: string
    line: number
  }[] = []
  const noCat: TagHit[] = []

  for (const h of hits) {
    const inv = inventory.get(h.id)
    if (!inv) {
      unknown.push(h)
      continue
    }
    if (h.cat !== inv.cat && inv.cat !== '?') {
      catMismatch.push({
        id: h.id,
        expected: inv.cat,
        found: h.cat,
        file: h.file,
        line: h.line,
      })
    }
  }

  return { missing, unknown, catMismatch, noCat, byId }
}

function report(
  inventory: Map<string, InventoryId>,
  hits: TagHit[],
  result: ReturnType<typeof compare>,
): void {
  const clusters = ['W', 'D', 'R', 'REF', 'O', 'X'] as const
  console.log('ESC-tag rapport\n')
  for (const c of clusters) {
    const ids = [...inventory.values()].filter((x) => x.cluster === c)
    const tagged = ids.filter((x) => result.byId.has(x.id))
    const miss = ids.filter((x) => !result.byId.has(x.id)).map((x) => x.id)
    console.log(
      `  ${c.padEnd(4)} ${tagged.length}/${ids.length} getagd` +
        (miss.length ? `  ontbrekend: ${miss.join(', ')}` : ''),
    )
  }
  console.log(`\nTotaal tags in src: ${hits.length}`)
  console.log(`Unieke ID's getagd: ${result.byId.size}/${inventory.size}`)
  if (result.missing.length)
    console.log(`\nOntbrekend (${result.missing.length}): ${result.missing.join(', ')}`)
  if (result.unknown.length) {
    console.log('\nOnbekende tags:')
    for (const u of result.unknown) console.log(`  ${u.file}:${u.line} ESC:${u.id} (${u.cat})`)
  }
  if (result.catMismatch.length) {
    console.log('\nCategorie-mismatch:')
    for (const m of result.catMismatch) {
      console.log(`  ${m.file}:${m.line} ${m.id}: expected ${m.expected}, found ${m.found}`)
    }
  }
}

type CoverageRow = {
  id: string
  cat: string
  tagged: boolean
  instrumented: boolean
  /** Journal in harnas, of (als stil) tag-locatie in harnas. */
  harnessReachable: boolean
  journalFiles: string[]
  tagFiles: string[]
  /** Cat F: bewust stil — geen luid-doel. */
  skipLoud: boolean
}

/** Golf 1 checklist: L5 cleanup + L6 connector (stil → luid). */
const GOLF1_IDS = new Set(Array.from({ length: 28 }, (_, i) => `W-${16 + i}`))

/** Golf 2: rest stil W-* (niet W-16…43; W-05=F, W-07/14 al luid). */
const GOLF2_IDS = new Set([
  'W-01',
  'W-02',
  'W-03',
  'W-04',
  'W-06',
  'W-08',
  'W-09',
  'W-10',
  'W-11',
  'W-12',
  'W-13',
  'W-15',
  ...Array.from({ length: 10 }, (_, i) => `W-${44 + i}`),
])

/** Golf 3: stil X-* (excl. F X-25; al-luid X-18/22/23). */
const GOLF3_IDS = new Set([
  ...Array.from({ length: 17 }, (_, i) => `X-${1 + i}`),
  'X-19',
  'X-20',
  'X-21',
  'X-24',
  'X-26',
  'X-27',
])

/** Golf 4a: L11 rest. */
const GOLF4A_IDS = new Set(['D-42', 'D-54', 'D-55', 'D-56', 'D-57', 'D-58', 'D-59'])

/** Golf 4b: Stage 1/2 (excl. D-13/61 luid; D-45/49–53 weg). */
const GOLF4B_IDS = new Set([
  ...Array.from({ length: 12 }, (_, i) => `D-${1 + i}`),
  ...Array.from({ length: 28 }, (_, i) => `D-${14 + i}`),
  'D-43',
  'D-60',
])

/** Golf 5: Ramen (excl. R-16/27 luid; R-26 weg). */
const GOLF5_IDS = new Set([
  ...Array.from({ length: 15 }, (_, i) => `R-${1 + i}`),
  ...Array.from({ length: 9 }, (_, i) => `R-${17 + i}`),
])

/** Golf 6: REF (excl. REF-01/02). */
const GOLF6_IDS = new Set(Array.from({ length: 12 }, (_, i) => `REF-${3 + i}`))

/** Golf 7: O-* (excl. O-31…39; O-40 skip-loud). */
const GOLF7_IDS = new Set([
  ...Array.from({ length: 30 }, (_, i) => `O-${1 + i}`),
  ...Array.from({ length: 6 }, (_, i) => `O-${41 + i}`),
])

/** Bewust geen journaal (naast Cat F). */
const SKIP_LOUD_EXTRA = new Set(['O-40', 'X-21'])

/** VERWIJDEREN-weg — tags mogen blijven, geen luid-doel. */
const REMOVED_IDS = new Set(['D-45', 'D-49', 'D-50', 'D-51', 'D-52', 'D-53', 'R-26'])

function isSkipLoud(row: Pick<CoverageRow, 'id' | 'cat' | 'skipLoud'>): boolean {
  return row.skipLoud || SKIP_LOUD_EXTRA.has(row.id) || REMOVED_IDS.has(row.id)
}

function golfStill(needLoud: CoverageRow[], set: Set<string>): CoverageRow[] {
  return needLoud.filter((r) => set.has(r.id))
}

function appendGolfChecklist(
  lines: string[],
  title: string,
  blurb: string,
  set: Set<string>,
  still: CoverageRow[],
): void {
  lines.push('', `## ${title}`, '')
  lines.push(
    blurb,
    '',
    `| Status | Aantal |`,
    `|---|---|`,
    `| Set | ${set.size} |`,
    `| Nog stil | ${still.length} |`,
    `| Al luid | ${set.size - still.length} |`,
    '',
  )
  if (still.length) {
    lines.push('| ID | Cat | Tag |')
    lines.push('|---|---|---|')
    for (const r of still.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      lines.push(`| ${r.id} | ${r.cat} | ${r.tagFiles.join(', ') || '—'} |`)
    }
  } else {
    lines.push(`_Alle ID’s in deze set hebben een journaal-telsite._`)
  }
}

function buildCoverage(
  inventory: Map<string, InventoryId>,
  byId: Map<string, TagHit[]>,
  journalHits: JournalHit[],
): CoverageRow[] {
  const journalById = new Map<string, JournalHit[]>()
  for (const h of journalHits) {
    const list = journalById.get(h.id) ?? []
    list.push(h)
    journalById.set(h.id, list)
  }

  const rows: CoverageRow[] = []
  const ids = [...inventory.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  for (const id of ids) {
    const inv = inventory.get(id)!
    const journals = journalById.get(id) ?? []
    const tags = byId.get(id) ?? []
    const instrumented = journals.length > 0
    const harnessReachable = instrumented
      ? journals.some((h) => isHarnessReachable(h.file))
      : tags.some((h) => isHarnessReachable(h.file))
    rows.push({
      id,
      cat: inv.cat,
      tagged: tags.length > 0,
      instrumented,
      harnessReachable,
      journalFiles: [...new Set(journals.map((h) => `${h.file}:${h.line}`))],
      tagFiles: [...new Set(tags.map((h) => `${h.file}:${h.line}`))],
      skipLoud: inv.cat === 'F' || SKIP_LOUD_EXTRA.has(id) || REMOVED_IDS.has(id),
    })
  }
  return rows
}

function printMissing(rows: CoverageRow[]): void {
  const taggedOnly = rows.filter((r) => r.tagged && !r.instrumented)
  const needLoud = taggedOnly.filter((r) => !isSkipLoud(r))
  const skipExtra = taggedOnly.filter((r) => isSkipLoud(r))
  const inHarness = needLoud.filter((r) => r.harnessReachable)
  const outHarness = needLoud.filter((r) => !r.harnessReachable)

  console.log(`Getagd zonder journaal: ${taggedOnly.length}`)
  console.log(`  A–E (luid-doel): ${needLoud.length} · skip-loud (F/O-40/weg): ${skipExtra.length}`)
  console.log(`  harnas: ${inHarness.length} · buiten: ${outHarness.length}`)
  for (const [label, set] of [
    ['Golf 1 (W-16…W-43)', GOLF1_IDS],
    ['Golf 2 (W rest)', GOLF2_IDS],
    ['Golf 3 (X)', GOLF3_IDS],
    ['Golf 4a (L11 D)', GOLF4A_IDS],
    ['Golf 4b (Stage D)', GOLF4B_IDS],
    ['Golf 5 (R)', GOLF5_IDS],
    ['Golf 6 (REF)', GOLF6_IDS],
    ['Golf 7 (O)', GOLF7_IDS],
  ] as const) {
    const stil = golfStill(needLoud, set)
    console.log(`  ${label} stil: ${stil.length}/${set.size}`)
  }
}

function writeCoverage(rows: CoverageRow[]): void {
  const instrumented = rows.filter((r) => r.instrumented)
  const inHarness = instrumented.filter((r) => r.harnessReachable)
  const outHarness = instrumented.filter((r) => !r.harnessReachable)
  const taggedOnly = rows.filter((r) => r.tagged && !r.instrumented)
  const needLoud = taggedOnly.filter((r) => !isSkipLoud(r))
  const skipLoudRows = taggedOnly.filter((r) => isSkipLoud(r))
  const missingInHarness = needLoud.filter((r) => r.harnessReachable)
  const missingOutHarness = needLoud.filter((r) => !r.harnessReachable)

  const lines: string[] = [
    '# Escalatie — dekkingsregister',
    '',
    `Gegenereerd: ${new Date().toISOString().slice(0, 10)} · Bron: \`npm run esc:coverage\``,
    '',
    'Per inventaris-ID: getagd (`// ESC:`), geïnstrumenteerd (journaal-call), binnen E2E-harnas-bereik.',
    'Zonder dit is "nul keer gevuurd" niet te onderscheiden van "niet gemeten".',
    '',
    `| Status | Aantal |`,
    `|---|---|`,
    `| Getagd | ${rows.filter((r) => r.tagged).length}/${rows.length} |`,
    `| Geïnstrumenteerd | ${instrumented.length} |`,
    `| Daarvan in harnas | ${inHarness.length} |`,
    `| Geïnstrumenteerd buiten harnas | ${outHarness.length} |`,
    `| Getagd zonder journaal | ${taggedOnly.length} |`,
    `| … waarvan A–E (luid-doel) | ${needLoud.length} |`,
    `| … skip-loud (F / O-40 / X-21-alias / VERWIJDEREN-weg) | ${skipLoudRows.length} |`,
    `| … stil in harnas | ${missingInHarness.length} |`,
    `| … stil buiten harnas | ${missingOutHarness.length} |`,
    '',
    '## Geïnstrumenteerd + in harnas',
    '',
    '| ID | Cat | Journaal |',
    '|---|---|---|',
  ]
  for (const r of inHarness) {
    lines.push(`| ${r.id} | ${r.cat} | ${r.journalFiles.join(', ') || '—'} |`)
  }
  lines.push('', '## Geïnstrumenteerd buiten harnas', '')
  lines.push('| ID | Cat | Journaal |')
  lines.push('|---|---|---|')
  for (const r of outHarness) {
    lines.push(`| ${r.id} | ${r.cat} | ${r.journalFiles.join(', ') || '—'} |`)
  }

  lines.push('', '## Getagd zonder journaal', '')
  lines.push(
    'ID’s met `// ESC:`-tag maar zonder journaal-call. Skip-loud = Cat **F**, **O-40**, **X-21** (alias W-53), of VERWIJDEREN-weg.',
    'Harnas = tag-bestand matcht `HARNESS_REACHABLE` (nog niet geïnstrumenteerd → potentiële meetbaarheid).',
    '',
  )
  lines.push(`### Stil in harnas (${missingInHarness.length})`, '')
  lines.push('| ID | Cat | Tag |')
  lines.push('|---|---|---|')
  for (const r of missingInHarness) {
    lines.push(`| ${r.id} | ${r.cat} | ${r.tagFiles.join(', ') || '—'} |`)
  }
  lines.push('', `### Stil buiten harnas (${missingOutHarness.length})`, '')
  lines.push('| ID | Cat | Tag |')
  lines.push('|---|---|---|')
  for (const r of missingOutHarness) {
    lines.push(`| ${r.id} | ${r.cat} | ${r.tagFiles.join(', ') || '—'} |`)
  }
  if (skipLoudRows.length) {
    lines.push('', `### Skip-loud (${skipLoudRows.length})`, '')
    lines.push('| ID | Cat | Tag |')
    lines.push('|---|---|---|')
    for (const r of skipLoudRows) {
      lines.push(`| ${r.id} | ${r.cat} | ${r.tagFiles.join(', ') || '—'} |`)
    }
  }

  appendGolfChecklist(
    lines,
    'Golf 1 checklist (W-16…W-43)',
    'L5 cleanup + L6 connector. Doel: 0 stil A–E in deze set.',
    GOLF1_IDS,
    golfStill(needLoud, GOLF1_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 2 checklist (W rest)',
    'L0 + L2–L4 + L7–L10 + W-53. W-13 telt mee als set-lid (vaak al luid).',
    GOLF2_IDS,
    golfStill(needLoud, GOLF2_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 3 checklist (X)',
    'core/fml + X-21/26/27. Gedrag X-11/13–17 laten; wel journaal OK.',
    GOLF3_IDS,
    golfStill(needLoud, GOLF3_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 4a checklist (L11 D)',
    'D-42 + D-54…D-59.',
    GOLF4A_IDS,
    golfStill(needLoud, GOLF4A_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 4b checklist (Stage D)',
    'D-01…12, D-14…41, D-43, D-60.',
    GOLF4B_IDS,
    golfStill(needLoud, GOLF4B_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 5 checklist (R)',
    'R-01…15, R-17…25.',
    GOLF5_IDS,
    golfStill(needLoud, GOLF5_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 6 checklist (REF)',
    'REF-03…14.',
    GOLF6_IDS,
    golfStill(needLoud, GOLF6_IDS),
  )
  appendGolfChecklist(
    lines,
    'Golf 7 checklist (O)',
    'O-01…30, O-41…46 (O-40 skip-loud).',
    GOLF7_IDS,
    golfStill(needLoud, GOLF7_IDS),
  )
  lines.push('')

  fs.writeFileSync(COVERAGE_PATH, lines.join('\n') + '\n', 'utf8')
  console.log(`Coverage geschreven: ${COVERAGE_PATH}`)
  console.log(
    `  geïnstrumenteerd ${instrumented.length} · in harnas ${inHarness.length} · buiten ${outHarness.length}`,
  )
  printMissing(rows)
}

function writeIndex(inventory: Map<string, InventoryId>, byId: Map<string, TagHit[]>): void {
  const lines: string[] = [
    '# Escalatiepaden — tagindex',
    '',
    `Gegenereerd: ${new Date().toISOString().slice(0, 10)} · Bron: \`npm run esc:index\``,
    '',
    'Actuele vindplaats van elke ESC-ID in de code. De regelnummers in',
    '`escalatiepaden-inventaris.md` zijn historisch; dit bestand is het anker.',
    '',
  ]

  const clusters = [
    ['W', 'Muren'],
    ['D', 'Deuren'],
    ['R', 'Ramen'],
    ['REF', 'Referentie'],
    ['O', 'Orkestratie'],
    ['X', 'Conversie/export'],
  ] as const

  for (const [c, label] of clusters) {
    const ids = [...inventory.values()]
      .filter((x) => x.cluster === c)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    const tagged = ids.filter((x) => byId.has(x.id)).length
    lines.push(`## ${label} (${c}) — ${tagged}/${ids.length}`)
    lines.push('')
    lines.push('| ID | Cat | Locaties |')
    lines.push('|---|---|---|')
    for (const inv of ids) {
      const hits = byId.get(inv.id) ?? []
      const locs =
        hits.length === 0 ? '_niet getagd_' : hits.map((h) => `\`${h.file}:${h.line}\``).join(', ')
      lines.push(`| ${inv.id} | ${inv.cat} | ${locs} |`)
    }
    lines.push('')
  }

  fs.writeFileSync(TAGINDEX_PATH, lines.join('\n') + '\n', 'utf8')
  console.log(`Tagindex geschreven: ${TAGINDEX_PATH}`)
}

function writeIds(inventory: Map<string, InventoryId>): void {
  const ids = [...inventory.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const catEntries = ids
    .map((id) => {
      const cat = inventory.get(id)!.cat
      return `  '${id}': '${cat}',`
    })
    .join('\n')

  const body = `/**
 * GENERATED by \`npm run esc:index\` / check-esc-tags.ts --write-ids.
 * Do not edit by hand.
 */
export const ESCALATION_IDS = [
${ids.map((id) => `  '${id}',`).join('\n')}
] as const

export type EscalationId = (typeof ESCALATION_IDS)[number]

export type EscalationCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'P'

export const ESCALATION_CATEGORY: Record<EscalationId, EscalationCategory> = {
${catEntries}
}
`

  fs.mkdirSync(path.dirname(IDS_OUT_PATH), { recursive: true })
  fs.writeFileSync(IDS_OUT_PATH, body, 'utf8')
  console.log(`IDs geschreven: ${IDS_OUT_PATH}`)
}

function main(): void {
  const mode = process.argv[2] ?? '--check'
  if (
    !['--check', '--report', '--coverage', '--missing', '--write-index', '--write-ids'].includes(
      mode,
    )
  ) {
    console.error(
      'Usage: check-esc-tags.ts --check|--report|--coverage|--missing|--write-index|--write-ids',
    )
    process.exit(2)
  }

  const md = fs.readFileSync(INVENTORY_PATH, 'utf8')
  const inventory = parseInventory(md)
  if (inventory.size < 200) {
    console.error(`Inventaris-parser vond slechts ${inventory.size} ID's (verwacht ~228)`)
    process.exit(1)
  }

  const files = walkSrc(SRC_ROOT)
  const hits = scanTags(files)
  const result = compare(inventory, hits)

  if (mode === '--coverage' || mode === '--missing') {
    const journalHits = scanJournalCalls(files)
    const rows = buildCoverage(inventory, result.byId, journalHits)
    if (mode === '--coverage') writeCoverage(rows)
    else printMissing(rows)
    process.exit(0)
  }

  if (mode === '--report') {
    report(inventory, hits, result)
    process.exit(
      result.missing.length || result.unknown.length || result.catMismatch.length ? 1 : 0,
    )
  }

  if (mode === '--write-index') {
    writeIndex(inventory, result.byId)
    writeIds(inventory)
    report(inventory, hits, result)
    process.exit(
      result.missing.length || result.unknown.length || result.catMismatch.length ? 1 : 0,
    )
  }

  if (mode === '--write-ids') {
    writeIds(inventory)
    process.exit(0)
  }

  let failed = false
  if (result.missing.length) {
    console.error(`FAIL: ${result.missing.length} inventaris-ID's zonder tag:`)
    for (const id of result.missing) console.error(`  ${id}`)
    failed = true
  }
  if (result.unknown.length) {
    console.error(`FAIL: ${result.unknown.length} tags met onbekend ID:`)
    for (const u of result.unknown) console.error(`  ${u.file}:${u.line} ESC:${u.id}`)
    failed = true
  }
  if (result.catMismatch.length) {
    console.error(`FAIL: ${result.catMismatch.length} categorie-mismatches:`)
    for (const m of result.catMismatch) {
      console.error(`  ${m.file}:${m.line} ${m.id}: expected ${m.expected}, found ${m.found}`)
    }
    failed = true
  }
  if (failed) process.exit(1)
  console.log(`OK: ${result.byId.size}/${inventory.size} ID's getagd (${hits.length} tags)`)
}

main()
