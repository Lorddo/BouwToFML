// Meet of elke gebruikte klasse ook ergens gedefinieerd is en omgekeerd, voor de
// `fml-`/`plan-`-familie. Een rename die Ã©Ã©n kant vergeet faalt stil (styling weg,
// geen error). Draai dit vÃ³Ã³r Ã©n nÃ¡ de rename: de aantallen moeten gelijk blijven.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FAMILY = /^(fml|plan)-/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|css)$/.test(entry)) out.push(full)
  }
  return out
}

const used = new Map() // klasse -> bestanden
const defined = new Map()

function add(map, key, file) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(file)
}

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')

  // Gebruik: statische class-attributen en de string-delen van :class / v-bind:class.
  for (const match of text.matchAll(/(?:^|\s):?class="([^"]*)"/g)) {
    for (const token of match[1].split(/[\s'"`{}:,?]+/)) {
      if (FAMILY.test(token)) add(used, token, file)
    }
  }
  // Vue-arrays/objecten met klassen als sleutel: 'fml-x': cond
  for (const match of text.matchAll(/['"]((?:fml|plan)-[a-z0-9_-]+)['"]/g)) {
    add(used, match[1], file)
  }

  // Definitie: selectors in <style>-blokken en losse .css-bestanden.
  const styles = file.endsWith('.css')
    ? [text]
    : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
  for (const block of styles) {
    for (const match of block.matchAll(/\.((?:fml|plan)-[a-z0-9_-]+)/g)) {
      add(defined, match[1], file)
    }
  }
}

const usedOnly = [...used.keys()].filter((c) => !defined.has(c)).sort()
const definedOnly = [...defined.keys()].filter((c) => !used.has(c)).sort()

console.log(`gebruikt: ${used.size}, gedefinieerd: ${defined.size}`)
console.log(`\nGEBRUIKT MAAR NERGENS GEDEFINIEERD (${usedOnly.length}):`)
for (const c of usedOnly) console.log(`  ${c}   <- ${[...used.get(c)].join(', ')}`)
console.log(`\nGEDEFINIEERD MAAR NERGENS GEBRUIKT (${definedOnly.length}):`)
for (const c of definedOnly) console.log(`  ${c}   <- ${[...defined.get(c)].join(', ')}`)
