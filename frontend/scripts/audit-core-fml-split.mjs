// Voorwerk fase 6: welke bestanden in core/fml zitten écht aan het FML-formaat vast?
// Leidt de I/O-kern af uit de import-graaf i.p.v. uit bestandsnamen.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join('src', 'core', 'fml')

// Wat het renameplan als I/O aanwijst; de rest is domein tenzij het hier exclusief onder hangt.
const IO_SEEDS = [
  'importFmlV3',
  'buildFmlV3',
  'downloadFml',
  'fml-export-safe',
  'strip-floorplanner-hostile-settings',
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const files = walk(ROOT)
const idOf = (file) => relative(ROOT, file).replace(/\\/g, '/').replace(/\.ts$/, '')
const ids = new Set(files.map(idOf))

// Import-graaf binnen core/fml + lezers van buiten.
const deps = new Map() // id -> Set<id>  (wat dit bestand importeert)
const internalReaders = new Map() // id -> Set<id>
const outsideReaders = new Map() // id -> Set<pad buiten core/fml>

for (const id of ids) {
  deps.set(id, new Set())
  internalReaders.set(id, new Set())
  outsideReaders.set(id, new Set())
}

function resolveSpec(spec, fromId) {
  if (spec.startsWith('@/core/fml/')) return spec.slice('@/core/fml/'.length)
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : ''
    const joined = join(base, spec).replace(/\\/g, '/')
    return joined.replace(/^\.\//, '')
  }
  return null
}

for (const file of files) {
  const id = idOf(file)
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
    const target = resolveSpec(m[1], id)
    if (target && ids.has(target)) {
      deps.get(id).add(target)
      internalReaders.get(target).add(id)
    }
  }
}

// Lezers buiten core/fml.
function walkAll(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkAll(full, out)
    else if (/\.(ts|vue)$/.test(entry)) out.push(full)
  }
  return out
}

for (const file of ['src', 'tests'].flatMap((r) => walkAll(r))) {
  if (file.replace(/\\/g, '/').includes('src/core/fml/')) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/from\s+'@\/core\/fml\/([^']+)'/g)) {
    if (ids.has(m[1])) outsideReaders.get(m[1]).add(file.replace(/\\/g, '/'))
  }
}

// I/O-kern: de zaden plus alles wat alleen via de zaden bereikbaar is.
const seeds = IO_SEEDS.filter((s) => ids.has(s))
const reachableFromSeeds = new Set()
const stack = [...seeds]
while (stack.length) {
  const id = stack.pop()
  if (reachableFromSeeds.has(id)) continue
  reachableFromSeeds.add(id)
  for (const dep of deps.get(id) ?? []) stack.push(dep)
}

const ioExclusive = []
const shared = []
const domain = []
for (const id of [...ids].sort()) {
  const readers = new Set([...internalReaders.get(id)])
  const outside = outsideReaders.get(id)
  if (seeds.includes(id)) continue
  if (!reachableFromSeeds.has(id)) {
    domain.push(id)
    continue
  }
  // Bereikbaar vanaf I/O. Exclusief als geen enkele lezer buiten de I/O-kern staat.
  const nonIoReaders = [...readers].filter((r) => !reachableFromSeeds.has(r))
  if (nonIoReaders.length === 0 && outside.size === 0) ioExclusive.push(id)
  else shared.push([id, nonIoReaders.length, outside.size])
}

console.log(`core/fml: ${ids.size} bestanden\n`)
console.log(`## I/O-zaden (${seeds.length})`)
for (const s of seeds) console.log(`  ${s}`)

console.log(`\n## Alleen vanaf de I/O-kern bereikbaar -> blijft core/fml (${ioExclusive.length})`)
for (const id of ioExclusive) console.log(`  ${id}`)

console.log(`\n## Bereikbaar vanaf I/O MAAR ook elders gelezen -> naar core/plan (${shared.length})`)
for (const [id, inside, outside] of shared.sort((a, b) => b[1] + b[2] - (a[1] + a[2]))) {
  console.log(`  ${String(inside + outside).padStart(3)} lezers  ${id}`)
}

console.log(`\n## Raakt de I/O niet -> naar core/plan (${domain.length})`)
for (const id of domain) console.log(`  ${id}`)
