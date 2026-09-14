// Controleert dat elke `t('x.y')` in de bron ook echt in de locale-bestanden staat.
// Een ontbrekende sleutel faalt stil: de UI toont dan het pad. Typecheck en tests
// zien dat niet. Draai dit na elke rename-ronde die i18n raakt.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LOCALES = ['nl', 'en', 'th']

function flatten(obj, prefix = '') {
  const out = new Set()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flatten(value, path)) out.add(nested)
    } else {
      out.add(path)
    }
  }
  return out
}

const locales = new Map(
  LOCALES.map((code) => [
    code,
    flatten(JSON.parse(readFileSync(`src/ui/i18n/locales/${code}.json`, 'utf8'))),
  ]),
)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|vue)$/.test(name) ? [full] : []
  })
}

// `t('a.b')` en `t("a.b")`; dynamische sleutels (template-literals, variabelen)
// kan deze controle niet zien en slaat hij over.
const CALL = /\bt\(\s*(['"])([A-Za-z][\w.]*)\1/g

const used = new Map()
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    for (const match of line.matchAll(CALL)) {
      const key = match[2]
      if (!key.includes('.')) continue
      if (!used.has(key)) used.set(key, [])
      used.get(key).push(`${file}:${i + 1}`)
    }
  })
}

let missing = 0
for (const [key, sites] of [...used].sort()) {
  const absent = LOCALES.filter((code) => !locales.get(code).has(key))
  if (absent.length === 0) continue
  missing++
  console.log(`ONTBREEKT in ${absent.join(', ')}: ${key}\n    ${sites.join('\n    ')}`)
}

console.log(`\nopgevraagde sleutels: ${used.size}, incompleet: ${missing}`)
