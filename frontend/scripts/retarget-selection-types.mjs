/**
 * Point PlanCanvasSelectionRefs type-imports at plan-canvas-selection-types.ts.
 * createPlanCanvasSelection stays on plan-canvas-selection.ts.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FROM = "from './plan-canvas-selection'"
const TO = "from './plan-canvas-selection-types'"
const KEEP = "export { createPlanCanvasSelection } from './plan-canvas-selection'"

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

let n = 0
for (const file of walk(join(ROOT, 'src/ui/composables/plan-canvas'))) {
  const before = readFileSync(file, 'utf8')
  if (!before.includes(FROM)) continue
  const after = before
    .split('\n')
    .map((line) => {
      if (line.includes(KEEP)) return line
      if (line.includes("export { createPlanCanvasSelection }")) return line
      if (line.includes("import type { PlanCanvasSelectionRefs }") && line.includes(FROM)) {
        return line.replace(FROM, TO)
      }
      return line
    })
    .join('\n')
  if (after !== before) {
    writeFileSync(file, after)
    n += 1
    console.log(file.slice(ROOT.length + 1))
  }
}
console.log(`updated ${n} files`)
