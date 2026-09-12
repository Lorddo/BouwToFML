import fs from 'fs'
import path from 'path'

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.ts$/.test(e.name)) out.push(p)
  }
  return out
}

const CONST_TO_KIND = {
  CONCEPT_WINDOW_REFID: 'window.single',
  CONCEPT_DOOR_REFID: 'door.single',
  CLOSET_DOOR_REFID: 'door.closet',
  DOUBLE_WIDE_DOOR_REFID: 'door.double',
  DOUBLE_SOLID_DOOR_REFID: 'door.double_solid',
  SLIDING_DOUBLE_DOOR_REFID: 'door.sliding',
  SLIDING_SINGLE_DOOR_REFID: 'door.sliding_single',
  POCKET_DOOR_REFID: 'door.pocket',
  GARAGE_DOOR_REFID: 'door.garage',
  FRENCH_BALCONY_DOOR_REFID: 'door.french_balcony',
  PASSAGE_DOOR_REFID: 'door.passage',
  ARCHWAY_DOOR_REFID: 'door.archway',
  BIFOLD_DOOR_REFID: 'door.bifold',
  BIFOLD_DOUBLE_DOOR_REFID: 'door.bifold_double',
  WINDOW_DOUBLE_REFID: 'window.double',
  WINDOW_TRIPLE_REFID: 'window.triple',
  WINDOW_ROUND_REFID: 'window.round',
  WINDOW_HALF_ROUND_REFID: 'window.half_round',
  WINDOW_TRIANGLE_REFID: 'window.triangle',
  WINDOW_BLIND_REFID: 'window.blind',
}

let n = 0
for (const file of walk('tests')) {
  let t = fs.readFileSync(file, 'utf8')
  const before = t
  for (const [name, kind] of Object.entries(CONST_TO_KIND)) {
    t = t.replace(new RegExp(`refid:\\s*${name}`, 'g'), `kind: '${kind}'`)
    t = t.replace(new RegExp(`\\b${name}\\b`, 'g'), `'${kind}'`)
  }
  // Broken import { 'door.single' } leftovers
  t = t.replace(/import\s*\{\s*'[^']+'(?:\s*,\s*'[^']+')*\s*\}\s*from\s*'@\/core\/fml\/types'\s*;?/g, '')
  t = t.replace(/\/\/ types import cleaned\n?/g, '')
  if (t !== before) {
    fs.writeFileSync(file, t)
    n += 1
    console.log(file)
  }
}
console.log('patched', n)
