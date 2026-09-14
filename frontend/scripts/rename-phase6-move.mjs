// Fase 6: core/fml -> core/plan. De drie echte FML-I/O-bestanden blijven achter.
//
// Aanpak: per bestand `git mv`. Een rename van de héle map is korter, maar Windows
// weigert die zolang een watcher of tsserver een handle in de boom heeft
// ("Permission denied"); losse bestanden gaan wel.
//
// Drie soorten verwijzingen moeten mee, niet één:
//   1. `@/core/fml/X`          -> `@/core/plan/X`     (903 sites, 58 blijven)
//   2. `../fml/X` (core/plg)   -> `../plan/X`         (relatief, mist de @-sweep)
//   3. `./X` in de blijvers    -> `@/core/plan/X`     (siblings zijn verhuisd)
//
// Draai met --dry voor alleen tellen.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY = process.argv.includes('--dry')

/** Blijven in core/fml: dit is de FML-adapter zelf. */
const STAYS = ['importFmlV3', 'buildFmlV3', 'downloadFml']

const SRC_DIR = 'src/core/fml'
const DEST_DIR = 'src/core/plan'
const EXTENSIONS = ['.ts', '.vue', '.mts', '.js', '.mjs']

function git(...args) {
  if (DRY) return ''
  return execFileSync('git', args, { encoding: 'utf8' })
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** Blijft dit modulepad in core/fml? `pad` is alles ná `core/fml/`. */
function isStayer(path) {
  const name = path.replace(/\.(ts|vue)$/, '')
  return STAYS.includes(name)
}

// ---------------------------------------------------------------- 1. verplaatsen

const before = walk(SRC_DIR).map((f) => relative(SRC_DIR, f).replace(/\\/g, '/'))
const moving = before.filter((f) => !isStayer(f))
const staying = before.filter((f) => isStayer(f))

console.log(`core/fml: ${before.length} bestanden — ${moving.length} verhuizen, ${staying.length} blijven`)
if (staying.length !== STAYS.length) {
  console.error(`FOUT: verwachtte ${STAYS.length} blijvers, vond ${staying.length}: ${staying.join(', ')}`)
  process.exit(1)
}

if (!DRY) {
  if (existsSync(DEST_DIR)) {
    console.error(`FOUT: ${DEST_DIR} bestaat al`)
    process.exit(1)
  }
  for (const file of moving) {
    const target = `${DEST_DIR}/${file}`
    mkdirSync(join(DEST_DIR, file, '..'), { recursive: true })
    git('mv', `${SRC_DIR}/${file}`, target)
  }
  console.log(`verplaatst: ${moving.length}`)
}

// ------------------------------------------------------------------- 2. sweepen

const roots = ['src', 'tests']
const files = roots
  .filter((r) => existsSync(r))
  .flatMap((r) => walk(r))
  .filter((f) => EXTENSIONS.some((ext) => f.endsWith(ext)))

const stayerAlternation = STAYS.join('|')

/** `@/core/fml/X` -> `@/core/plan/X`, behalve de drie blijvers. */
const aliasRe = new RegExp(`@/core/fml/(?!(?:${stayerAlternation})['"\`])`, 'g')
/** `../fml/X` / `../../fml/X` (core/plg), behalve de drie blijvers. */
const relativeRe = new RegExp(`((?:\\.\\./)+)fml/(?!(?:${stayerAlternation})['"\`])`, 'g')

let aliasCount = 0
let relativeCount = 0
let touched = 0

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let next = original.replace(aliasRe, () => {
    aliasCount += 1
    return '@/core/plan/'
  })
  // Alleen binnen core/plg: elders betekent `../fml/` niets.
  if (file.replace(/\\/g, '/').includes('src/core/plg/')) {
    next = next.replace(relativeRe, (_m, dots) => {
      relativeCount += 1
      return `${dots}plan/`
    })
  }
  if (next !== original) {
    touched += 1
    if (!DRY) writeFileSync(file, next)
  }
}

console.log(`@/core/fml -> @/core/plan: ${aliasCount}`)
console.log(`../fml -> ../plan (core/plg): ${relativeCount}`)

// --------------------------------------- 3. relatieve imports in de drie blijvers

let stayerFixed = 0
for (const file of staying) {
  const path = `${SRC_DIR}/${file}`
  if (!existsSync(path)) continue
  const original = readFileSync(path, 'utf8')
  // `from './x'` -> `from '@/core/plan/x'`, tenzij het een van de blijvers zelf is.
  const next = original.replace(
    new RegExp(`(['"\`])\\./(?!(?:${stayerAlternation})['"\`])([^'"\`]+)\\1`, 'g'),
    (_m, quote, rest) => {
      stayerFixed += 1
      return `${quote}@/core/plan/${rest}${quote}`
    },
  )
  if (next !== original) {
    if (!DRY) writeFileSync(path, next)
  }
}
console.log(`relatieve imports in de blijvers omgezet: ${stayerFixed}`)
console.log(`bestanden aangeraakt: ${touched}${DRY ? ' (dry run — niets geschreven)' : ''}`)
