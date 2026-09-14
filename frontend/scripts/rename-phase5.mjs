// Rename fase 5 — persist-namen. Zie .cursor/plans/fml_naar_plan_rename_5075de5d.plan.md
// De twee project-store-bestanden staan buiten het script: daar leven de bewuste
// @deprecated lees-aliassen die dit script juist zou wegpoetsen.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const ROOTS = ['src', 'tests']
const EXTS = ['.ts', '.vue', '.json']
const SKIP_FILES = [
  join('src', 'platform', 'project-store', 'types.ts'),
  join('src', 'platform', 'project-store', 'serialize.ts'),
]

// Volgorde telt: langste eerst, zodat setFmlX niet half door fmlX wordt geraakt.
const RULES = [
  ['setFmlNulpuntImageCm', 'setPlanNulpuntImageCm'],
  ['fmlNulpuntImageCm', 'planNulpuntImageCm'],
  ['setFmlOrient', 'setPlanOrient'],
  ['fmlOrient', 'planOrient'], // \b houdt fmlOrientFlipX buiten (wacht op besluit)
  ['fmlViewer', 'planDisplay'],
  ['fmlOpacityPct', 'contentOpacityPct'],
  ['DEFAULT_FML_CONTENT_OPACITY_PCT', 'DEFAULT_CONTENT_OPACITY_PCT'],
  ['DEFAULT_FML_UNDERLAY_OPACITY_PCT', 'DEFAULT_UNDERLAY_OPACITY_PCT'],
  ['createFactoryEditorSettings', 'createFactoryPlanDisplaySettings'],
  ['normalizeEditor', 'normalizePlanDisplay'],
  ['EditorSettings', 'PlanDisplaySettings'],
]

// Kebab-varianten van Vue-props: die raakt een \b-regex op de camelCase-naam niet.
const KEBAB = [['set-fml-nulpunt-image-cm', 'set-plan-nulpunt-image-cm']]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTS.some((ext) => entry.endsWith(ext))) out.push(full)
  }
  return out
}

const tally = new Map()
let touched = 0

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (SKIP_FILES.some((skip) => file === skip || file.endsWith(sep + skip))) continue
    const before = readFileSync(file, 'utf8')
    let after = before
    for (const [from, to] of RULES) {
      after = after.replace(new RegExp(`\\b${from}\\b`, 'g'), (m) => {
        tally.set(from, (tally.get(from) ?? 0) + 1)
        return to
      })
    }
    for (const [from, to] of KEBAB) {
      after = after.split(from).join(to)
      if (before.includes(from)) tally.set(from, (tally.get(from) ?? 0) + 1)
    }
    if (after !== before) {
      writeFileSync(file, after, 'utf8')
      touched++
    }
  }
}

console.log(`bestanden aangepast: ${touched}`)
for (const [from, count] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${from}`)
}
