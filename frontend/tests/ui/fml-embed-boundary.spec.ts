/**
 * Import-boundary gates:
 * 1) FML embed entries (editor / inspect) must not pull OpenCV (`@/cv`)
 *    or workspace composables.
 * 2) Fase E1: `core/plg/` mag geen `cv/` / `ui/` / `platform/` importeren;
 *    alleen `core/plg/fml-adapter/` mag `core/fml/` aanraken (value-imports).
 * 3) Kernel-campagne: niets in `plan-canvas/` mag omhoog reiken naar de lijm
 *    of naar een view.
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

const ENTRIES = ['ui/editor/entry.ts', 'ui/inspect/entry.ts'] as const

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

function listTsFilesRecursive(dir: string, match = /\.ts$/): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFilesRecursive(full, match))
    } else if (entry.isFile() && match.test(entry.name)) {
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

/**
 * Gate stap 1 van de kernel-campagne: de lijm is de top van de boom. Kernel- en
 * plugin-modules onder `plan-canvas/` mogen er niet naar terug importeren, en al
 * helemaal niet naar een view.
 *
 * Waarom een allowlist en geen bestandenlijst van "plugins": de kaart
 * (`.cursor/docs/refactor/lean/editor-kernel.md` §1) verdeelt 91 bestanden in
 * kernel/plugin/view/lijm, en die verdeling in een test kopiëren betekent twee
 * lijsten die uiteenlopen. De regel hieronder is sterker én onderhoudsvrij:
 * niemand mag omhoog, met precies drie benoemde uitzonderingen.
 *
 * Niet in deze gate: imports uit `ui/components/plan-canvas-*.ts`. Dat zijn
 * pure geometrie-helpers die alleen verkeerd staan (geen componenten); ze
 * verhuizen bij de aanzicht-batch, niet hier.
 */
describe('plan-canvas kernel boundary (gate stap 1)', () => {
  const PLAN_CANVAS = 'ui/composables/plan-canvas'

  /**
   * Eén keer inlezen en oplossen. Per test opnieuw over heel `src/ui` regexen
   * kostte ~3 s per test en tikte onder volle suite-last de 5 s-testlimiet aan —
   * dat gaf een rode gate die alleen bij een gerichte run groen was.
   */
  const importEdges: ReadonlyArray<{ from: string; to: string }> = (() => {
    const edges: { from: string; to: string }[] = []
    for (const file of listTsFilesRecursive(resolve(SRC_ROOT, 'ui'), /\.(ts|vue)$/)) {
      const from = toPosixRel(file)
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(IMPORT_RE)) {
        const spec = match[1] ?? match[2]
        if (!spec) continue
        const resolved = resolveImport(file, spec)
        if (!resolved || !resolved.startsWith(SRC_ROOT)) continue
        edges.push({ from, to: toPosixRel(resolved) })
      }
    }
    return edges
  })()

  const planCanvasEdges = importEdges.filter((edge) => isUnder(edge.from, PLAN_CANVAS))

  /** De lijm: coördinatoren die kinderen samenbinden. */
  const GLUE = [
    `${PLAN_CANVAS}/usePlanCanvasInteraction.ts`,
    `${PLAN_CANVAS}/usePlanCanvasSelectionCoordinator.ts`,
    `${PLAN_CANVAS}/usePlanCanvasToolCoordinator.ts`,
  ] as const

  /** Wie de lijm wél mag aanroepen: de compositie-root, en Interaction zijn kinderen. */
  const GLUE_IMPORT_ALLOWLIST: ReadonlyArray<{ from: string; to: string }> = [
    { from: 'ui/components/PlanCanvas.vue', to: `${PLAN_CANVAS}/usePlanCanvasInteraction.ts` },
    {
      from: `${PLAN_CANVAS}/usePlanCanvasInteraction.ts`,
      to: `${PLAN_CANVAS}/usePlanCanvasSelectionCoordinator.ts`,
    },
    {
      from: `${PLAN_CANVAS}/usePlanCanvasInteraction.ts`,
      to: `${PLAN_CANVAS}/usePlanCanvasToolCoordinator.ts`,
    },
  ]

  it('de import-graaf van ui/ is ingelezen', () => {
    expect(importEdges.length).toBeGreaterThan(500)
    expect(planCanvasEdges.length).toBeGreaterThan(100)
  })

  it('niets in plan-canvas/ importeert een view of een .vue-component', () => {
    const offenders = planCanvasEdges
      .filter((edge) => isUnder(edge.to, 'ui/views') || edge.to.endsWith('.vue'))
      .map((edge) => `${edge.from} → ${edge.to}`)

    expect(offenders, 'plan-canvas/ mag niet omhoog naar een view of component').toEqual([])
  })

  it('alleen de compositie-root en Interaction importeren de coördinatoren', () => {
    const allowed = new Set(GLUE_IMPORT_ALLOWLIST.map((pair) => `${pair.from} → ${pair.to}`))
    const glue = new Set<string>(GLUE)

    const offenders = importEdges
      .filter((edge) => glue.has(edge.to))
      .map((edge) => `${edge.from} → ${edge.to}`)
      .filter((edge) => !allowed.has(edge))

    expect(offenders, 'Alleen PlanCanvas.vue en Interaction mogen de lijm aanroepen').toEqual([])
  })
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
