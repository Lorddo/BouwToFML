// Herstelt dubbel-gecodeerde UTF-8 (mojibake) uit eerdere PowerShell-schrijfrondes.
// `--fix` past aan; zonder vlag alleen tellen.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXES = [
  ['Ã©', 'é'],
  ['Ã¨', 'è'],
  ['Ã¯', 'ï'],
  ['Ã³', 'ó'],
  ['Ãº', 'ú'],
  ['Ã¡', 'á'],
  ['Ã¶', 'ö'],
  ['Ã«', 'ë'],
  ['Ã‹', 'Ë'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€™', '’'],
  ['â€˜', '‘'],
  ['â€œ', '“'],
  ['â€\u009d', '”'],
  ['âœ“', '✓'],
  ['âœ•', '✕'],
  ['â†’', '→'],
  ['â†\u0090', '←'],
  ['Â°', '°'],
  ['Â½', '½'],
  ['Â·', '·'],
  ['Â«', '«'],
  ['Â»', '»'],
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue|json|md|css)$/.test(entry)) out.push(full)
  }
  return out
}

const apply = process.argv.includes('--fix')
const perFile = []
let total = 0

for (const file of ['src', 'tests'].flatMap((root) => walk(root))) {
  const before = readFileSync(file, 'utf8')
  let after = before
  let hits = 0
  for (const [from, to] of FIXES) {
    const count = after.split(from).length - 1
    if (count > 0) {
      hits += count
      after = after.split(from).join(to)
    }
  }
  if (hits > 0) {
    perFile.push([file, hits])
    total += hits
    if (apply) writeFileSync(file, after, 'utf8')
  }
}

console.log(`${apply ? 'hersteld' : 'gevonden'}: ${total} treffers in ${perFile.length} bestanden`)
for (const [file, hits] of perFile.sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(hits).padStart(3)}  ${file}`)
}
