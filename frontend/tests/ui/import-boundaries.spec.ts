/**
 * Import-grenzen:
 * 1) Embed-entries (editor / inspect) trekken geen OpenCV (`@/cv`) of
 *    workspace-composables binnen.
 * 2) E1: `core/plg/` importeert geen `cv/` / `ui/` / `platform/`, en niets uit
 *    `core/fml/`.
 * 3) Kernel-campagne: niets in `plan-canvas/` reikt omhoog naar de lijm of een view.
 * 4) Fase 6: het domein (`core/plan/`) leunt niet op zijn adapter (`core/fml/`) en
 *    niet op de UI.
 *
 * De type-only-uitzondering uit de oude E1-gate is vervallen. Die bestond omdat het
 * domein in `core/fml/types` woonde; sinds fase 6 staat het in `core/plan/types` en
 * bevat `core/fml/` alleen nog `importFmlV3` / `buildFmlV3` / `downloadFml`. Daarmee
 * is de regel niet «value-imports alleen in fml-adapter» maar het sterkere «core/plg
 * raakt de adapter helemaal niet aan» — en dat is vandaag al waar.
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

/** Alle import-randen uit een set bestanden, als src-relatieve posix-paden. */
function importsFrom(files: readonly string[]): ReadonlyArray<{ from: string; to: string }> {
  const edges: { from: string; to: string }[] = []
  for (const file of files) {
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

/**
 * Gate stap 2: de selectie-factory is kernel-eigendom. Plugins krijgen de refs
 * geïnjecteerd en typeren ze via `plan-canvas-selection-types.ts`.
 */
describe('plan-canvas selection factory (gate stap 2)', () => {
  const FACTORY = 'ui/composables/plan-canvas/plan-canvas-selection.ts'
  const ALLOW = new Set([
    'ui/composables/plan-canvas/usePlanCanvasInteraction.ts',
  ])

  it('alleen Interaction importeert de selectie-factory', () => {
    const uiFiles = listTsFilesRecursive(resolve(SRC_ROOT, 'ui'), /\.(ts|vue)$/)
    const offenders = importsFrom(uiFiles)
      .filter((edge) => edge.to === FACTORY && edge.from !== FACTORY && !ALLOW.has(edge.from))
      .map((edge) => `${edge.from} → ${edge.to}`)

    expect(offenders, 'plugins typeren via plan-canvas-selection-types, niet de factory').toEqual([])
  })
})

/**
 * Aanzicht woont in `elevation/`, gedeelde bruggen in `canvas-kernel/`.
 * De mappen importeren elkaar niet; beide mogen de kernel-bruggen lezen.
 */
describe('elevation / plan-canvas map-gate', () => {
  const PLAN = 'ui/composables/plan-canvas'
  const ELEV = 'ui/composables/elevation'
  const KERNEL = 'ui/composables/canvas-kernel'

  const planFiles = listTsFilesRecursive(resolve(SRC_ROOT, PLAN))
  const elevFiles = listTsFilesRecursive(resolve(SRC_ROOT, ELEV))
  const kernelFiles = listTsFilesRecursive(resolve(SRC_ROOT, KERNEL))

  it('de drie mappen hebben bronbestanden', () => {
    expect(planFiles.length).toBeGreaterThan(20)
    expect(elevFiles.length).toBeGreaterThan(5)
    expect(kernelFiles.length).toBeGreaterThan(5)
  })

  it('elevation/ importeert plan-canvas/ niet', () => {
    const offenders = importsFrom(elevFiles)
      .filter((edge) => isUnder(edge.to, PLAN))
      .map((edge) => `${edge.from} → ${edge.to}`)
    expect(offenders).toEqual([])
  })

  it('plan-canvas/ importeert elevation/ niet', () => {
    const offenders = importsFrom(planFiles)
      .filter((edge) => isUnder(edge.to, ELEV))
      .map((edge) => `${edge.from} → ${edge.to}`)
    expect(offenders).toEqual([])
  })

  it('canvas-kernel/ importeert plan-canvas/ noch elevation/', () => {
    const offenders = importsFrom(kernelFiles)
      .filter((edge) => isUnder(edge.to, PLAN) || isUnder(edge.to, ELEV))
      .map((edge) => `${edge.from} → ${edge.to}`)
    expect(offenders).toEqual([])
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

  it('core/plg importeert niets uit core/fml, ook niet type-only', () => {
    const offenders = importsFrom(plgFiles).filter((edge) => isUnder(edge.to, 'core/fml'))

    expect(
      offenders.map((edge) => `${edge.from} → ${edge.to}`),
      'core/plg mag de FML-adapter niet aanroepen; de afhankelijkheid loopt de andere kant op',
    ).toEqual([])
  })
})

/**
 * Fase 6: `core/plan/` is het domein, `core/fml/` is één van zijn adapters. Een domein
 * dat zijn adapter importeert maakt de splitsing ongedaan.
 *
 * Geometrie-helpers (`opening-plan-ops`, `wall-render-geometry`) wonen in `core/plan/`.
 * Het domein reikt niet naar `ui/`.
 *
 * De CV-randen staan er bewust apart in: `extractionToPlan` en `layer-openings-to-plan`
 * *zijn* de brug van detectie naar plattegrond, dus die kennen `cv/`-types per definitie.
 */
describe('core/plan import boundary (fase 6)', () => {
  const planFiles = listTsFilesRecursive(resolve(SRC_ROOT, 'core/plan'))

  /** De detectie-brug: deze drie mogen `cv/` kennen, de rest van het domein niet. */
  const CV_BRIDGE = [
    'core/plan/extractionToPlan.ts',
    'core/plan/extraction-to-plan-walls.ts',
    'core/plan/layer-openings-to-plan.ts',
  ] as const

  it('core/plan heeft bronbestanden', () => {
    expect(planFiles.length).toBeGreaterThan(50)
  })

  it('het domein importeert zijn eigen FML-adapter niet', () => {
    const offenders = importsFrom(planFiles)
      .filter((edge) => isUnder(edge.to, 'core/fml'))
      .map((edge) => `${edge.from} → ${edge.to}`)

    expect(offenders, 'core/plan mag core/fml niet importeren').toEqual([])
  })

  it('core/plan reikt niet naar ui/', () => {
    const offenders = importsFrom(planFiles)
      .filter((edge) => isUnder(edge.to, 'ui'))
      .map((edge) => `${edge.from} → ${edge.to}`)

    expect(offenders, 'core/plan mag ui/ niet importeren').toEqual([])
  })

  it('alleen de detectie-brug kent cv/', () => {
    const bridge = new Set<string>(CV_BRIDGE)
    const offenders = importsFrom(planFiles)
      .filter((edge) => isUnder(edge.to, 'cv') && !bridge.has(edge.from))
      .map((edge) => `${edge.from} → ${edge.to}`)

    expect(offenders, 'alleen extractionToPlan / -walls / layer-openings-to-plan mogen cv/ kennen').toEqual([])
  })
})
