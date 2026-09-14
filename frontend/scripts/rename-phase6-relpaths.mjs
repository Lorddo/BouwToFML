// Nabrander op rename-phase6-names.mjs: de tien hernoemde modules worden binnen
// core/plan ook relatief geïmporteerd (`./fml-wall-geom`, `../fml-wall-geom` uit
// fixture-symbols/). De alias-regel `@/core/plan/x` raakte die niet.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILES = {
  'apply-fml-thickness-pick': 'apply-thickness-pick',
  'fml-dimension-settings': 'plan-dimension-settings',
  'fml-dimension-vis': 'plan-dimension-vis',
  'fml-wall-geom': 'plan-wall-geom',
  'fml-wall-thickness-catalog': 'wall-thickness-catalog',
  'fml-wall-thickness-limits': 'wall-thickness-limits',
  'fml-wall-thickness-tiers': 'wall-thickness-tiers',
  'harmonize-fml-wall-thickness': 'harmonize-wall-thickness',
  'layer-openings-to-fml': 'layer-openings-to-plan',
  'sanitize-fml-walls': 'sanitize-plan-walls',
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = ['src', 'tests']
  .filter((r) => existsSync(r))
  .flatMap((r) => walk(r))
  .filter((f) => /\.(ts|vue|mts)$/.test(f))

let total = 0
let touched = 0
const perRule = new Map()

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let next = original
  for (const [from, to] of Object.entries(FILES)) {
    // Alleen binnen een quote, ná ./ of ../ — dus een importspecifier, geen losse tekst.
    const re = new RegExp(`(?<=['"\`](?:\\./|(?:\\.\\./)+))${from}\\b`, 'g')
    next = next.replace(re, () => {
      total += 1
      perRule.set(from, (perRule.get(from) ?? 0) + 1)
      return to
    })
  }
  if (next !== original) {
    touched += 1
    writeFileSync(file, next)
  }
}

console.log(`relatieve imports herschreven: ${total} in ${touched} bestanden`)
for (const [from, count] of [...perRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(3)}  ${from}`)
}
