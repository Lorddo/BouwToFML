// CSS-klassen `fml-*` -> `plan-*`. Alleen namen die volgens
// `classify-fml-tokens.mjs` echt een klasse (of keyframes-naam) zijn.
//
// Bewust NIET in deze lijst:
//   fml-ref-id / fml-text            kebab-props van de echte FML-adapter (groep A)
//   fml-band-*-boundary-cm, -dirty   kebab-props van het C1-cluster (wacht op fase 6)
//   fml-wall-*, fml-adapter, ...     modulenamen (verhuizen in fase 6)
//   fml-export                       terugvalnaam van een echt .fml-downloadbestand
//   fml-preview                      Vue `:key`, geen klasse
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Basisnamen; modifiers (`--h`, `--v`, `--preview`) volgen automatisch omdat `-`
// geen woordteken is en de woordgrens dus achter de basisnaam valt.
const CLASSES = [
  'actions',
  'band-hint',
  'band-ratio',
  'bovenlicht',
  'dev-panel',
  'dirty-hint',
  'floor-name',
  'fold',
  'height-limits',
  'hint',
  'limit-field',
  'limit-input-row',
  'limit-spacer',
  'load-card',
  'load-file',
  'load-hint',
  'load-overlay',
  'load-spinner',
  'load-title',
  'load-spin', // @keyframes
  'measure-hover',
  'measure-line',
  'measure-overlay',
  'overflow-hint',
  'panel', // dekt ook het importpad `./fml-panel-fields.css` (bestand gaat mee)
  'pick-hint',
  'rescale-cross',
  'rescale-handle',
  'rescale-label',
  'rescale-leg',
  'rescale-overlay',
  'rescale-panel',
  'stats',
  'thickness-limits',
]

// Langste eerst, zodat `load-spinner` niet door `load-spin` half geraakt wordt.
const RULES = [...CLASSES]
  .sort((a, b) => b.length - a.length)
  .map((name) => [new RegExp(`\\bfml-${name}\\b`, 'g'), `plan-${name}`])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|css|ts)$/.test(entry)) out.push(full)
  }
  return out
}

let files = 0
let total = 0
for (const file of walk('src')) {
  const before = readFileSync(file, 'utf8')
  let after = before
  for (const [pattern, replacement] of RULES) after = after.replace(pattern, replacement)
  if (after === before) continue
  const count = [...before.matchAll(/\bfml-[a-z0-9_-]+/g)].length - [...after.matchAll(/\bfml-[a-z0-9_-]+/g)].length
  writeFileSync(file, after, 'utf8')
  files++
  total += count
  console.log(`${file}  (${count})`)
}
console.log(`\n${total} vervangingen in ${files} bestanden`)
