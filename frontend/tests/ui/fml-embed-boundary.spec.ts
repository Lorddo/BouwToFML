/**
 * Import-boundary gates:
 * 1) FML embed entries (editor / inspect) must not pull OpenCV (`@/cv`)
 *    or workspace composables.
 * 2) Fase E1: `core/plg/` mag geen `cv/` / `ui/` / `platform/` importeren;
 *    alleen `core/plg/fml-adapter/` mag `core/fml/` aanraken (value-imports).
 *
 * Type-only policy (E1): `import type` van `core/fml/types` (en type-reexports)
 * is toegestaan buiten `fml-adapter/`, omdat het domein ís `FloorPlan`.
 * Runtime/value-imports van FML horen uitsluitend in `fml-adapter/`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'src')

const ENTRIES = ['ui/fml-editor/entry.ts', 'ui/fml-inspect/entry.ts'] as const

const FORBIDDEN = [`${sep}cv${sep}`, `${sep}ui${sep}composables${sep}workspace${sep}`] as const

/** Matches value + type imports / re-exports / dynamic import(). */
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/** Same, but captures whether the statement is type-only (`import type` / `export type`). */
const IMPORT_DETAIL_RE =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@/')) {
    const without = spec.slice(2)
    return tryResolve(join(SRC_ROOT, without))
  }
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return tryResolve(join(dirname(fromFile), spec))
  }
  return null
}

function tryResolve(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.vue`,
    join(base, 'index.ts'),
    join(base, 'index.vue'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return normalize(c)
  }
  return null
}

function collectReachable(entryRel: string): string[] {
  const entry = resolve(SRC_ROOT, entryRel)
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!file.startsWith(SRC_ROOT)) continue
    if (!/\.(ts|vue)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2]
      if (!spec) continue
      const resolved = resolveImport(file, spec)
      if (resolved && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return [...seen]
}

function listTsFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFilesRecursive(full))
    } else if (entry.isFile() && /\.ts$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function toPosixRel(abs: string): string {
  return relative(SRC_ROOT, abs).split(/[/\\]/).join('/')
}

function isUnder(relPosix: string, prefix: string): boolean {
  return relPosix === prefix || relPosix.startsWith(`${prefix}/`)
}

describe('fml embed import boundary', () => {
  for (const entry of ENTRIES) {
    it(`${entry} does not reach cv/ or workspace composables`, () => {
      const files = collectReachable(entry)
      expect(files.length).toBeGreaterThan(1)
      const offenders = files.filter((f) => {
        const rel = relative(SRC_ROOT, f)
        const norm = `${sep}${rel.split(/[/\\]/).join(sep)}${sep}`
        return FORBIDDEN.some((frag) => norm.includes(frag))
      })
      expect(
        offenders.map((f) => relative(SRC_ROOT, f)),
        `Forbidden imports reachable from ${entry}`,
      ).toEqual([])
    })
  }
})

describe('core/plg import boundary (E1)', () => {
  const plgRoot = resolve(SRC_ROOT, 'core/plg')
  const plgFiles = listTsFilesRecursive(plgRoot)

  it('core/plg heeft bronbestanden', () => {
    expect(plgFiles.length).toBeGreaterThan(0)
  })

  it('core/plg importeert geen cv/, ui/ of platform/', () => {
    const forbiddenPrefixes = ['cv/', 'ui/', 'platform/'] as const
    const offenders: string[] = []

    for (const file of plgFiles) {
      const text = readFileSync(file, 'utf8')
      const fromRel = toPosixRel(file)
      for (const match of text.matchAll(IMPORT_RE)) {
        const spec = match[1] ?? match[2]
        if (!spec) continue
        const resolved = resolveImport(file, spec)
        if (!resolved || !resolved.startsWith(SRC_ROOT)) continue
        const targetRel = toPosixRel(resolved)
        if (forbiddenPrefixes.some((p) => isUnder(targetRel, p.replace(/\/$/, '')))) {
          offenders.push(`${fromRel} → ${targetRel} (via ${spec})`)
        }
      }
    }

    expect(offenders, 'core/plg must not import cv/ui/platform').toEqual([])
  })

  it('alleen fml-adapter/ mag runtime/value imports uit core/fml/ doen (type-only elders OK)', () => {
    /**
     * Keuze: type-only imports van `core/fml/types` (domein = FloorPlan) zijn
     * toegestaan buiten `fml-adapter/` (o.a. extension-types.ts, plg-document.ts).
     * Value-/runtime-imports van `core/fml/**` zijn exclusief voor `fml-adapter/`.
     */
    const offenders: string[] = []

    for (const file of plgFiles) {
      const fromRel = toPosixRel(file)
      const inAdapter = isUnder(fromRel, 'core/plg/fml-adapter')
      if (inAdapter) continue

      const text = readFileSync(file, 'utf8')
      // Reset lastIndex for global regex reuse
      IMPORT_DETAIL_RE.lastIndex = 0
      for (const match of text.matchAll(IMPORT_DETAIL_RE)) {
        const isTypeOnly = Boolean(match[2])
        const spec = match[3]
        if (!spec || isTypeOnly) continue
        const resolved = resolveImport(file, spec)
        if (!resolved || !resolved.startsWith(SRC_ROOT)) continue
        const targetRel = toPosixRel(resolved)
        if (isUnder(targetRel, 'core/fml')) {
          offenders.push(`${fromRel} value-imports ${targetRel} (via ${spec})`)
        }
      }
    }

    expect(
      offenders,
      'Only core/plg/fml-adapter/ may value-import core/fml/ (type-only allowed elsewhere)',
    ).toEqual([])
  })
})
