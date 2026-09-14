// Bepaalt per `fml-…`-token wát het is, zodat de CSS-batch niet op naam gokt.
// Categorieën: CSS-klasse (class-attribuut of style-selector), importpad,
// kebab-prop/-event, of overig (sleutels, foutteksten, commentaar).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|css|ts)$/.test(entry)) out.push(full)
  }
  return out
}

const kinds = new Map() // token -> Map<kind, count>
function note(token, kind) {
  if (!kinds.has(token)) kinds.set(token, new Map())
  const m = kinds.get(token)
  m.set(kind, (m.get(kind) ?? 0) + 1)
}

const TOKEN = /fml-[a-z0-9_-]+/g

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const styleRanges = []
  if (file.endsWith('.css')) styleRanges.push([0, text.length])
  else
    for (const m of text.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g))
      styleRanges.push([m.index, m.index + m[0].length])
  const inStyle = (i) => styleRanges.some(([a, b]) => i >= a && i < b)

  for (const m of text.matchAll(TOKEN)) {
    const i = m.index
    const token = m[0]
    const before = text.slice(Math.max(0, i - 90), i)
    const isSelector = text[i - 1] === '.' && inStyle(i)
    // Laatste class-attribuut vóór deze positie, en of het nog open staat.
    const classAttr = /:?class="[^"]*$/.test(before) || /'[^']*$/.test(before) === false && false

    if (isSelector) note(token, 'style-selector')
    else if (classAttr) note(token, 'class-attribuut')
    else if (/(from|import)\s*\(?\s*['"][^'"]*$/.test(before)) note(token, 'importpad')
    else if (/[:@][\w-]*$|["'@:]$/.test(before) && /^[a-z-]+$/.test(token) && /(?:^|\s)[:@]|update[-:]/.test(before))
      note(token, 'kebab-prop-of-event')
    else note(token, 'overig')
  }
}

const rows = [...kinds].sort()
for (const [token, m] of rows) {
  const parts = [...m].map(([k, c]) => `${k}:${c}`).join('  ')
  console.log(`${token.padEnd(34)} ${parts}`)
}
console.log(`\ntokens: ${rows.length}`)
