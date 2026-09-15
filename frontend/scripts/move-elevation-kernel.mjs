/**
 * One-shot: till 7 kernel-bruggen naar canvas-kernel/ en 11 aanzicht-files
 * naar elevation/. Herschrijft import-specifiers in src + tests.
 *
 * Run from repo root: node frontend/scripts/move-elevation-kernel.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolveRepo()
const SRC = join(REPO, 'frontend/src')
const TESTS = join(REPO, 'frontend/tests')
const OLD = join(SRC, 'ui/composables/plan-canvas')
const KERNEL = join(SRC, 'ui/composables/canvas-kernel')
const ELEV = join(SRC, 'ui/composables/elevation')

const KERNEL_FILES = [
  'usePlanCanvasViewport.ts',
  'plan-canvas-measure.ts',
  'plan-canvas-opening-move-measure.ts',
  'plan-canvas-mods.ts',
  'plan-canvas-vertex-hit.ts',
  'plan-canvas-draft-commit.ts',
  'plan-canvas-draw-measure.ts',
]

/** old filename → new filename (same dir: elevation/) */
const ELEVATION_FILES = {
  'elevation-interaction-types.ts': 'elevation-interaction-types.ts',
  'elevation-precise-move.ts': 'elevation-precise-move.ts',
  'elevation-tool.ts': 'elevation-tool.ts',
  'plan-canvas-elevation-opening-measure.ts': 'elevation-opening-measure.ts',
  'plan-canvas-elevation-wall-measure.ts': 'elevation-wall-measure.ts',
  'useElevationDrawTools.ts': 'useElevationDrawTools.ts',
  'useElevationInteraction.ts': 'useElevationInteraction.ts',
  'useElevationPointer.ts': 'useElevationPointer.ts',
  'useElevationPrecise.ts': 'useElevationPrecise.ts',
  'useElevationRenderModel.ts': 'useElevationRenderModel.ts',
  'useElevationSelectEdit.ts': 'useElevationSelectEdit.ts',
}

const KERNEL_BASE = new Set(KERNEL_FILES.map(stripExt))
const ELEV_OLD_BASE = new Set(Object.keys(ELEVATION_FILES).map(stripExt))
const ELEV_RENAME = Object.fromEntries(
  Object.entries(ELEVATION_FILES).map(([oldName, newName]) => [stripExt(oldName), stripExt(newName)]),
)

function resolveRepo() {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '../..')
}

function stripExt(name) {
  return name.replace(/\.ts$/, '')
}

function posix(p) {
  return p.split('\\').join('/')
}

function gitMv(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  execSync(`git mv "${from}" "${to}"`, { cwd: REPO, stdio: 'inherit' })
}

function listFiles(dir, match = /\.(ts|vue)$/) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, match))
    else if (entry.isFile() && match.test(entry.name)) out.push(full)
  }
  return out
}

function destForBase(base) {
  if (KERNEL_BASE.has(base)) {
    return { dir: 'canvas-kernel', base }
  }
  if (ELEV_OLD_BASE.has(base) || Object.values(ELEV_RENAME).includes(base)) {
    const newBase = ELEV_RENAME[base] ?? base
    return { dir: 'elevation', base: newBase }
  }
  return null
}

/** Which composable folder does this file live in after the move? */
function fileBucket(abs) {
  const rel = posix(relative(join(SRC, 'ui/composables'), abs))
  if (rel.startsWith('canvas-kernel/')) return 'canvas-kernel'
  if (rel.startsWith('elevation/')) return 'elevation'
  if (rel.startsWith('plan-canvas/')) return 'plan-canvas'
  return null
}

function rewriteSpecifier(fromAbs, spec) {
  const m = spec.match(/^(.*\/)?([^/]+)$/)
  if (!m) return spec
  const prefix = m[1] ?? ''
  const raw = m[2]
  const base = raw.replace(/\.ts$/, '')
  const dest = destForBase(base)
  if (!dest) return spec

  const fromBucket = fileBucket(fromAbs)
  const sameDir = fromBucket === dest.dir
  if (sameDir && (prefix === './' || prefix === '')) {
    return prefix === '' ? dest.base : `./${dest.base}`
  }

  return `@/ui/composables/${dest.dir}/${dest.base}`
}

function rewriteSource(fromAbs, text) {
  return text.replace(
    /((?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?)['"]([^'"]+)['"]|(import\s*\(\s*)['"]([^'"]+)['"](\s*\))/g,
    (whole, staticPrefix, staticSpec, dynPrefix, dynSpec, dynSuffix) => {
      if (staticSpec != null) {
        const next = rewriteSpecifier(fromAbs, staticSpec)
        if (next === staticSpec) return whole
        return `${staticPrefix}'${next}'`
      }
      const next = rewriteSpecifier(fromAbs, dynSpec)
      if (next === dynSpec) return whole
      return `${dynPrefix}'${next}'${dynSuffix}`
    },
  )
}

function moveFiles() {
  mkdirSync(KERNEL, { recursive: true })
  mkdirSync(ELEV, { recursive: true })
  for (const name of KERNEL_FILES) {
    const from = join(OLD, name)
    const to = join(KERNEL, name)
    if (!existsSync(from)) {
      if (existsSync(to)) continue
      throw new Error(`missing ${from}`)
    }
    gitMv(from, to)
  }
  for (const [oldName, newName] of Object.entries(ELEVATION_FILES)) {
    const from = join(OLD, oldName)
    const to = join(ELEV, newName)
    if (!existsSync(from)) {
      if (existsSync(to)) continue
      throw new Error(`missing ${from}`)
    }
    gitMv(from, to)
  }
}

function rewriteAll() {
  const files = [...listFiles(SRC), ...listFiles(TESTS)]
  let changed = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = rewriteSource(file, before)
    if (after !== before) {
      writeFileSync(file, after)
      changed += 1
    }
  }
  return changed
}

moveFiles()
const n = rewriteAll()
console.log(`rewrote imports in ${n} files`)
