import fs from 'fs'
import path from 'path'

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p)
  }
  return out
}

const HASH_TO_KIND = {
  '0434246537840a3326e305dbe7b9c355743e6e93': 'door.single',
  d34e31c31ba6e6bd4e0d67096ec1b31e9035c7d9: 'door.closet',
  '5ae0ee3c682e32c8c7ac15a6136d692df5737b22': 'door.double',
  '9c1479d9dfc482859aea10b9dd67f5e7773fff6d': 'door.double_solid',
  '1cdb4e6092e998630e7881667f2ddedafa3b0eb9': 'door.sliding',
  d2785cc45c9c0ec86644135d22fa9ac9c49bcad6: 'door.sliding_single',
  216: 'door.pocket',
  '37bb0bbe45ba0a5efda34f3f1e0b7ace63084e7f': 'door.garage',
  '9c845cf2ad8de220b65ee4dedeeb28ba4d750e21': 'door.french_balcony',
  '181e49d1e848e8668befb4ee93bb5a2ec86b017c': 'door.passage',
  '047a2a4afa369865012e7925b94c11a817ff0c69': 'door.archway',
  e7ef286f1690491cf28bf8586c2b9624be881dba: 'door.bifold',
  '919e3f1aaa05cd6b38b843f44573261442e38caa': 'door.bifold_double',
  b88cd3f479455fbf57205a91c613c02b7e6dc2df: 'window.single',
  bbf86e131112adca8869e9970229a71d7ff3fc28: 'window.double',
  e3296a727699a3fc70e70dfec4ab715ed368ef63: 'window.triple',
  '6da47b0a60330d19716d716046ec6c72c19d2cdb': 'window.round',
  '65d378c39d0183c82927e4ed7f8be6b224cf1df8': 'window.half_round',
  db1a3a6fceaae4487bda6b761df83ea75d9996c5: 'window.triangle',
  '327e76e3a132e358fef8757471f4989e93323b03': 'window.blind',
}

const files = walk('tests')
let n = 0
for (const file of files) {
  let t = fs.readFileSync(file, 'utf8')
  const before = t

  for (const [hash, kind] of Object.entries(HASH_TO_KIND)) {
    const re = new RegExp(`refid:\\s*'${hash}'`, 'g')
    t = t.replace(re, `kind: '${kind}'`)
    const re2 = new RegExp(`refid:\\s*"${hash}"`, 'g')
    t = t.replace(re2, `kind: '${kind}'`)
  }

  t = t.replace(/\bguid:\s*/g, 'id: ')
  // Do NOT rewrite opening.guid / opening.refid accessors — FML export asserts still use those.
  // Drop removed named exports from types imports
  t = t.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@\/core\/fml\/types'/g,
    (m, inner) => {
      let i = inner
        .replace(/\bCONCEPT_WINDOW_REFID\b,?/g, '')
        .replace(/\bCONCEPT_DOOR_REFID\b,?/g, '')
        .replace(/\bCLOSET_DOOR_REFID\b,?/g, '')
        .replace(/\bDOUBLE_WIDE_DOOR_REFID\b,?/g, '')
        .replace(/\bDOUBLE_SOLID_DOOR_REFID\b,?/g, '')
        .replace(/\bWINDOW_DOUBLE_REFID\b,?/g, '')
        .replace(/\bWINDOW_TRIPLE_REFID\b,?/g, '')
        .replace(/\bWINDOW_ROUND_REFID\b,?/g, '')
        .replace(/\bWINDOW_HALF_ROUND_REFID\b,?/g, '')
        .replace(/\bWINDOW_TRIANGLE_REFID\b,?/g, '')
        .replace(/\bWINDOW_BLIND_REFID\b,?/g, '')
        .replace(/\bPASSAGE_DOOR_REFID\b,?/g, '')
        .replace(/\bARCHWAY_DOOR_REFID\b,?/g, '')
        .replace(/\bGARAGE_DOOR_REFID\b,?/g, '')
        .replace(/\bPOCKET_DOOR_REFID\b,?/g, '')
        .replace(/\bSLIDING_DOUBLE_DOOR_REFID\b,?/g, '')
        .replace(/\bSLIDING_SINGLE_DOOR_REFID\b,?/g, '')
        .replace(/\bFRENCH_BALCONY_DOOR_REFID\b,?/g, '')
        .replace(/\bBIFOLD_DOOR_REFID\b,?/g, '')
        .replace(/\bBIFOLD_DOUBLE_DOOR_REFID\b,?/g, '')
        .replace(/,\s*,/g, ',')
        .replace(/^\s*,/, '')
        .replace(/,\s*$/, '')
        .trim()
      if (!i) return '// types import cleaned'
      return `import { ${i} } from '@/core/fml/types'`
    },
  )

  // Common: Opening literals still missing id — tests that only had refid/guid
  // leave to tsc; many already have id from guid rename.

  if (t !== before) {
    fs.writeFileSync(file, t)
    n += 1
    console.log(file)
  }
}
console.log('patched', n)
