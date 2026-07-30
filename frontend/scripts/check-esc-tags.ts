#!/usr/bin/env node
/**
 * ESC-tag checker: houdt inventaris-ID's en `// ESC:<ID> (<Cat>)` tags synchroon.
 *
 * Usage:
 *   node --experimental-strip-types scripts/check-esc-tags.ts --check
 *   node --experimental-strip-types scripts/check-esc-tags.ts --report
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
const TAGINDEX_PATH = path.join(REPO_ROOT, '.cursor/docs/escalatiepaden-tagindex.md')
const IDS_OUT_PATH = path.join(FRONTEND_ROOT, 'src/core/diagnostics/escalation-ids.generated.ts')

const ID_RE = /^(W|D|R|REF|O|X)-\d+$/
const TAG_RE = /\bESC:([A-Z]+-\d+)\s*\(([A-FP])\)/g
const ROW_ID_RE = /^\|\s*((?:W|D|R|REF|O|X)-\d+)\s*\|/

/** Inventaris-tabellen zonder Cat-kolom: vaste toewijzing (zie escalatie-ledger.md). */
const FORCED_CATEGORY: Record<string, string> = {
  // §5.1 DOOR_SPACE_POLICY
  'D-01': 'C',
  'D-02': 'C',
  'D-03': 'C',
  'D-04': 'C',
  'D-05': 'C',
  'D-06': 'C',
  'D-07': 'C',
  'D-08': 'C',
  // D-44 primair (geen escalatie)
  'D-44': 'P',
  // §8.1 sticky-asymmetrie
  'O-01': 'D',
  'O-02': 'D',
  'O-03': 'D',
  'O-04': 'D',
  // §8.4 stille fallbacks
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
  // §8.5 gates
  'O-42': 'B',
  'O-43': 'B',
  'O-44': 'B',
  'O-45': 'B',
  'O-46': 'B',
}

type InventoryId = { id: string; cat: string; cluster: string }

type TagHit = { id: string; cat: string; file: string; line: number }

function clusterOf(id: string): string {
  if (id.startsWith('W-')) return 'W'
  if (id.startsWith('D-')) return 'D'
  if (id.startsWith('R-')) return 'R'
  if (id.startsWith('REF-')) return 'REF'
  if (id.startsWith('O-')) return 'O'
  if (id.startsWith('X-')) return 'X'
  return '?'
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
      // "A · **anker**" / "A — comment" / "— (primair)"
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

  // Tags without category are caught by TAG_RE requiring (Cat); leftover check for bare ESC:ID
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
  if (!['--check', '--report', '--write-index', '--write-ids'].includes(mode)) {
    console.error('Usage: check-esc-tags.ts --check|--report|--write-index|--write-ids')
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

  // --check
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
