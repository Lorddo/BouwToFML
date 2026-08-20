/**
 * Import-boundary gate for FML embed entries.
 * Editor / inspect must not pull OpenCV (`@/cv`) or workspace composables.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'src')

const ENTRIES = ['ui/fml-editor/entry.ts', 'ui/fml-inspect/entry.ts'] as const

const FORBIDDEN = [`${sep}cv${sep}`, `${sep}ui${sep}composables${sep}workspace${sep}`] as const

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

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
